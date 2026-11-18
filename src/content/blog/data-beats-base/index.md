---
title: "Data beats base: calibrated sub-100 ms classifiers on a 6 GB laptop"
description: "One forward pass, option-token logits, soft labels and a temperature: fast decision models where training data mattered far more than the base."
date: "2026-11-18"
draft: true
areas: [fine-tuning, decision]
tags: ["LoRA", "QLoRA", "Qwen3.5", "Temperature scaling", "Soft labels", "vLLM"]
experiment: false
---

A lot of the LLM calls in agent code aren't really asking for text. They're asking a question with a fixed set of answers: is this request in scope, which tool should handle it, has the agent finished, should this get escalated. We ask a model that writes essays to answer it, parse a word out of the reply, retry when the parse fails, and then branch on a string with no idea how sure the model was.

I wanted the opposite: unstructured state in, a typed answer out, with a probability I can actually branch on. I call it a "System One" model, after the fast, intuitive half of the dual-process picture. No chain of thought, no retry loop, no generation. The short version of what I found is the title. Once you train on the shape of the decision, the choice of base model barely matters.

## One forward pass is the whole trick

The research write-up I started from treated this as an architecture problem: "parallel sampling", custom heads, kernel work for the hybrid attention layers. Most of that is a detour. Qwen being autoregressive doesn't matter, because nothing forces you to run the decode loop. You build the prompt as `state + schema + "Answer:"`, do one forward pass, read the logits at the last position, keep only the token ids of the allowed options, and softmax over those.

That's a type-safe classifier with zero new parameters. The model can't answer outside the schema because you never give it the chance. The speedup comes from emitting one token instead of a couple of hundred, and from the model being 0.8B instead of frontier-sized. No surgery involved.

```python
import torch

@torch.no_grad()
def score(model, tok, prompt, options, T=1.0):
    # Options chosen so each starts with a distinct token.
    ids = [tok.encode(" " + o, add_special_tokens=False)[0] for o in options]
    enc = tok(prompt, return_tensors="pt").to(model.device)
    last = model(**enc).logits[0, -1]          # one pass, last position only
    probs = torch.softmax(last[ids] / T, dim=-1)
    return dict(zip(options, probs.tolist()))
```

If your options aren't single-token or share a first token, teacher-force each full option and sum its token log-probs instead. It's slower, but the idea is the same: score the options, don't generate.

I kept the API surface to three primitives:

| Primitive | What it is | Note |
| --- | --- | --- |
| `Choice(options)` | Categorical | I capped it at 64 options. A big softmax is cheap; long option lists eat prefill, which is the actual cost. |
| `Score(low, high)` | Ordinal over an integer range | Treated as classification, not regression, so you get a distribution instead of a point. |
| `Bool` | Two-option `Choice` | Kept separate only because the typed API reads better. |

One question per forward pass. Packing several into one prompt looks free until you remember the causal mask lets question 4 see question 3's answer.

## Prove latency first, because training can't fix it

The first thing I did, before any training, was load the stock model and measure. Latency is a gate, not a warm-up. Fine-tuning changes the weights, not the cost of the forward pass, so if the stock model can't answer inside 100 ms, no amount of training will save it. Accuracy failing at this stage is expected and fine.

It passed easily. On an RTX 4050 laptop GPU with 6 GB of memory, the stock Qwen3.5-0.8B scored options in about 30 ms. Zero-shot it got 73% on my first eval, and 85% with two examples in the prompt. That's a usable prototype before you have a single label. It's not something to ship: the probabilities are raw, and you can't trust a gate built on them.

## Data beats base

Here's the finding that ended up governing every other decision. Across every general or zero-shot model I tried, accuracy on a given task shape sat somewhere between 46% and 74%. A task-specific fine-tune landed at roughly 88–94%. And that held across four quite different bases: a 0.8B decoder, two 2B decoders from different families, and an encoder.

| Base | Mixed set, zero-shot → tuned | Game-control set (tuned) | Latency | Recipe |
| --- | --- | --- | --- | --- |
| Qwen3.5-0.8B | 66 → 91 | 92 | ~35 ms | LoRA |
| Qwen3.5-2B | 72 → 94 | 92 | slower | QLoRA, 4-bit |
| MiniCPM5-2B | 63 → 89 | 77 | ~50 ms | QLoRA, 4-bit |
| laya (ModernBERT-large encoder) | 68 → 88 | 92 | ~19 ms | its own proper-scoring loss |

Look at the spread. Before training, the bases are 9 points apart. After training they're 6 points apart, and every one of them gained 20 to 26 points. Going from 0.8B to 2B bought me about three points on the mixed set. Training on the decision's own shape bought twenty-five.

The encoder is the interesting outlier. laya is an open, Apache-licensed ModernBERT-large with a decision head. It has no public training API, so I fine-tuned it through its own proper-scoring objective (a mix of log, spherical and ranked-probability scores). It matched the decoders on accuracy at about half the latency, and on the game-control set it went from 46% to 92%. If I need the fastest self-hosted scorer and I have labels, that's now the default.

A caveat I'll say once and mean throughout: these eval sets are small. Treat the numbers as directional. The pattern, every base collapsing into the same band, is the part I believe. The third digit, not so much.

So the useful question isn't "which base model?". It's "can I train on this task or not?" If yes, pick the base on shape: the encoder for raw latency, the 0.8B decoder for the widest mix of tasks under one adapter, the 2B when you want a little headroom and can spare the milliseconds. The 2B with 4-bit QLoRA hit 93.8% on the mixed set and still trained on the 6 GB card, but the gain over the 0.8B was marginal. Diminishing returns are the same finding again: capacity isn't the bottleneck, data is.

## Soft labels are the calibration story

The data phase is where the project gets won or lost, and the important part isn't the volume. It's the shape of the labels.

The recipe: pick a handful of concrete tasks you actually intend to ship, not a general-purpose classifier, because a 0.8B model gets its accuracy from narrowness. Get a few thousand rows per task, real inputs if you have logs, otherwise have a frontier model generate varied states. Then label each row by sampling the oracle five times at temperature around 0.8, and keep the distribution as the target. Four votes for A and one for B gives a label of `[0.8, 0.2]`, not `[1, 0]`.

Calibration means the model's probabilities match how often it's right. A distilled student can only learn frequencies if you show it frequencies. When I trained on hard one-hot labels instead, I got **54% accuracy at 97% average confidence**. That's the worst possible outcome for this kind of model: confidently wrong, with a confidence gate that's now useless.

The loss is just cross-entropy against the soft target, over the option logits only:

```python
import torch.nn.functional as F

def soft_ce(option_logits, soft_targets):
    # option_logits: [batch, K], soft_targets: [batch, K], rows sum to 1
    return -(soft_targets * F.log_softmax(option_logits, dim=-1)).sum(-1).mean()
```

The training setup is deliberately boring. Keep the existing `lm_head` and mask it to the option tokens, which keeps the pretrained meaning of the option words and adds zero parameters. LoRA at rank 16 on the attention and MLP projections. A full fine-tune of 0.8B is affordable, but LoRA lets you serve one set of base weights with a swappable adapter per task, and that matters more at serving time than a point of accuracy. If your option labels are arbitrary codes with no meaning, fall back to a single linear layer on the pooled final hidden state.

The research I started from used a reinforcement-learning pipeline with a contrastive reward model to get calibration. That's the expensive route to the same place, and a worse one: adding a reward term to a proper scoring rule throws away the properness that made the scoring rule worth using. Soft labels are cheaper and they don't fight themselves.

## Temperature scaling, and where it stops working

After training, fit one scalar $T$ on held-out data by minimising negative log-likelihood, then divide the logits by it before the softmax:

$$
p_i = \frac{\exp(z_i / T)}{\sum_{j=1}^{K} \exp(z_j / T)}
$$

Dividing by a positive constant doesn't change which option is biggest, so accuracy doesn't move. Only the sharpness does.

```python
T = torch.ones(1, requires_grad=True)
opt = torch.optim.LBFGS([T], lr=0.01, max_iter=100)

def closure():
    opt.zero_grad()
    loss = F.cross_entropy(val_logits / T, val_targets)  # soft targets work too
    loss.backward()
    return loss

opt.step(closure)
```

Two rules I'd hold to. Fit $T$ per task, because different schemas have different built-in ambiguity and one global temperature splits the difference badly. And report expected calibration error with fixed bins (I used 15, with a target under 3%) per task, not pooled.

The limit is worth stating plainly: temperature scaling only fixes in-distribution miscalibration. Out-of-distribution miscalibration is a data problem, and one scalar won't fix it. If ECE is still bad after scaling, go back and check whether your oracle samples actually disagreed with each other, or whether you paid for five identical votes per row.

## Gate, abstain, and give it an exit

A small model's job isn't to be right about everything. It's to be right when it's confident and to know when it isn't. So every decision carries a chance-normalised confidence:

$$
c = \frac{p - 1/K}{1 - 1/K}
$$

where $p$ is the top option's probability and $K$ is the number of options. That puts a two-way `Bool` and a 20-way `Choice` on the same scale. Above a threshold, act. Below it, route the tail to a slower model or a person. On a realistic traffic mix, the 0.8B generalist auto-decided about 92% of inputs at roughly 100% accuracy on the ones it kept.

Two more guards cover the cases the confidence gate can't.

**A `None` option.** Constrained scoring always picks one of the offered options. If the true answer isn't on the list, the model is forced to be wrong. Adding an explicit `None` label lets it decline rather than guess. That's different from the gate: `None` is a real answer the model learns, and the gate is a threshold on everything else.

**A distance check on the hidden state.** For inputs that don't look like anything in training, the design pulls the hidden state from a middle layer (around layer 12, not the last one, whose representations have collapsed toward the output classes), fits a mean and covariance over the training set, and abstains when the Mahalanobis distance passes the 95th percentile of the training distances.

```python
import numpy as np

mu = H_train.mean(0)
prec = np.linalg.inv(np.cov(H_train, rowvar=False) + 1e-3 * np.eye(H_train.shape[1]))

def maha(h):
    d = h - mu
    return float(d @ prec @ d)

threshold = np.percentile([maha(h) for h in H_train], 95)
```

I call this a heuristic, in the docs and in the API. The research I started from sold conformal prediction as a guarantee against out-of-distribution inputs. It isn't one. Conformal coverage assumes calibration and test data are exchangeable, and an OOD input breaks exchangeability by definition. The guarantee disappears in exactly the case you wanted it for. The distance check is still worth having. It just isn't a proof.

## Serving

Serving is mostly a batching problem. vLLM with `max_tokens=1`: each request is a single prefill with no decode tail, so throughput comes down to how hard you batch. LoRA adapters load per task through vLLM's multi-adapter support, so every task shares one copy of the base weights in GPU memory. If you re-query the same large state with different schemas, turn on prefix caching.

The wrapper is a typed API: a Pydantic model in, a Pydantic model out, with `confidence: float` and `abstained: bool` on every response. Downstream code should never see a logit.

## When to use this, and when not

This isn't a replacement for an LLM call. It's a replacement for the LLM calls that were classifiers all along.

Good fits, from what I've run:

- High-volume narrow decisions you own the labels for: routing, moderation, PII detection, triage, log-error classification.
- Agent guardrails: stuck, done, or off-track, and allow or block on a tool call.
- Browser and computer-use loops. A variant of the 0.8B retrained on real DOM observations picked the operation and target element correctly 97% of the time on my browser set, and its mean confidence rose from 0.66 to 0.81, high enough to act unattended behind the gate. It gave up a few points on non-browser tasks to get there.

Bad fits:

- Fine-grained ordinal scoring. Priority on a 1–5 scale sat around 60–67%. Gate it and escalate.
- Anything that needs multi-step inference. If the small model lands more than about ten points behind a frontier model with reasoning on your task, it's the wrong tool for that task. Keep the fast path for the tasks where the gap is small.
- Judging it on MMLU or GSM8K. Those reward chain-of-thought, which this model deliberately doesn't have. The scores will look awful and mean nothing.

And don't cross paradigms. A label-matching encoder like GLiNER 2.5 is excellent at entities and topic classification (100% on my sentiment set) and near useless when the decision needs reasoning over state (23% on the game-control set). A tiny on-device tool-calling model is good at picking a function and filling its arguments, and fell apart on inferred routing (2 out of 10). Decision scorers for judgments, extractors for extraction.

## What I deliberately didn't build

The research I started from had a lot more machinery. None of it made the cut.

| Dropped | Why |
| --- | --- |
| RL with a contrastive reward model | A reward term on top of a proper scoring rule breaks its properness. Soft labels get calibration for a fraction of the work. |
| Deliberately badly-prompted "flawed" oracle outputs as negatives | Teaches the model what a bad prompt does, not where real ambiguity lives. |
| A two-stage similarity head for high-cardinality outputs | Solves a problem that doesn't exist at 64 options. |
| Conformal p-values sold as guarantees | Exchangeability fails on the very inputs they're meant to catch. |
| Removing `lm_head` | Throws away the pretrained meaning of the option words for nothing. |
| Custom kernels for the hybrid attention | vLLM already handles it, and it isn't the bottleneck at 0.8B. |

Two claims from that research I'd also stop repeating. Type safety doesn't prevent hallucination: a confidently wrong label is still wrong, it's just well-formed. And autoregressive decoding isn't $O(N) + O(T)$; it's $O(T \cdot N)$, because every generated token attends over the whole prefix.

The plan I wrote came to about two weeks of solo work. The original pipeline was a two-to-three-month project for the same endpoint.

## Takeaways

- **Ask whether you can train before asking which model.** Zero-shot sat at 46–74%; task-specific fine-tunes landed at 88–94% whatever the base.
- **Soft labels, not one-hot.** Hard labels gave me a model that was confidently wrong. The distribution is the calibration.
- **Measure latency before training.** Training doesn't make the forward pass cheaper.
- **Gate everything, and give the model an exit.** A small model earns its place by knowing which 8% to hand off.

Open questions I still have: whether the distance gate catches enough real out-of-distribution traffic to justify its complexity, and what oracle sampling really costs. Five samples per row across ten tasks and five thousand rows is 250,000 frontier calls. Price that before you start, not after.
