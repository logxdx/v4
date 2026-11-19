---
title: "Data beats base: calibrated sub-100 ms classifiers on a 6 GB laptop"
short: "Data beats base"
description: "How I set up the data, training, calibration, abstain gate and serving for fast typed decision models on a laptop GPU, and what I measured."
date: "2026-09-19"
areas: [training, decision]
tags: ["LoRA", "QLoRA", "Qwen3.5", "Temperature scaling", "Soft labels", "vLLM", "Calibration"]
experiment: false
---

A lot of the LLM calls in agent code are really multiple-choice questions, like whether a request is in scope or which tool should handle it. The usual approach is to ask a big model, pull a word out of its reply, retry when that fails, and branch on a string with no idea how sure the model was.

I wanted a small model that takes messy state in and gives back a typed answer with a probability I can branch on. I call this kind of model System One. The plan was to build it on Qwen3.5-0.8B, with no text generation, no chain-of-thought and no retry loops.

It has three output types. `Choice` picks one item from a list, `Score` picks a whole number in a range, and `Bool` is yes or no. Every answer comes back with a probability attached.

The mechanics are simple. You build the prompt as `state + schema + "Answer:"` and run a single forward pass, which is one trip of the input through the network. At the end, the model gives a raw score called a logit for every token in its vocabulary.

You read the logits at the last position, keep only the tokens for the allowed options, and apply a softmax over those. A softmax turns raw scores into probabilities that add up to one. That's a classifier with zero new parameters, and the model can't answer outside the schema because it never gets the chance.

Here's the scoring function.

```python
@torch.no_grad()
def score(model, tok, prompt, options, T=1.0):
    # Options chosen so each starts with a distinct token.
    ids = [tok.encode(" " + o, add_special_tokens=False)[0] for o in options]
    enc = tok(prompt, return_tensors="pt").to(model.device)
    last = model(**enc).logits[0, -1]          # one pass, last position only
    probs = torch.softmax(last[ids] / T, dim=-1)
    return dict(zip(options, probs.tolist()))
```

The research I started from credited the speed to "parallel sampling" and changes to the architecture. My plan took a simpler view: Qwen being autoregressive doesn't matter, because nothing forces me to run the decode loop.

The speedup comes from two plain things. The model emits one token where a generated answer might need two hundred, and the model is 0.8B.

Generating text also costs more than it first looks. Every generated token attends over the whole prefix, so decoding $T$ tokens after an $N$-token prompt grows as $O(T \cdot N)$. A System One call is just the prefill, the one pass that reads the prompt, with no decode tail after it.

Type safety has a limit I want to be upfront about. A typed answer is always well-formed, but a confidently wrong label is still wrong, so the types do nothing to stop hallucination. That's why the probability and the gate later in this post matter so much.

Before training anything, I measured latency. Training doesn't change what a forward pass costs, so if the stock model couldn't hit the time budget, no fine-tune would rescue it. The plan treated this as a gate for the whole project.

The plan checked three things on the stock model, using 50 hand-labelled examples.

| Check on the stock model | Target in the plan | If it fails |
| --- | --- | --- |
| p50 latency, batch 1, warm GPU | under 100 ms | Shorten the input, or use a smaller base |
| Throughput, batch 32 | over 300 queries/sec | Check for re-tokenizing on every call |
| Raw zero-shot accuracy | over 60% | Fine, training fixes this |

On a laptop GPU with 6 GB of memory, the stock Qwen3.5-0.8B came out at about 30 ms per decision. 30 ms on a laptop! Zero-shot it got 73% on my first eval, and 85% with two examples in the prompt.

That's a usable prototype for a new decision before any labels exist. The raw probabilities weren't good enough to build a gate on, though, so the rest of the pipeline is about fixing that.

Next I froze the schema and the prompt format, before any data existed. Every training row is tied to the template, so changing it later means regenerating the whole corpus.

`Choice` is capped at 64 options. A large softmax is cheap, but long option lists eat prefill budget, and prefill is the part that costs money here.

`Score` is treated as ordinal classification over its integer range. Each value in the range is an option, so a 1 to 5 score comes back as a probability for each of the five values. `Bool` is a two-option `Choice`, kept as its own type so the API reads clearly.

The option words are picked so each one starts with a distinct token. The scorer only reads the first token of each option, so two options that start with the same token would get the same score.

I also kept it to one question per forward pass. Packing several questions into one prompt is tempting, but a causal mask lets each token see everything before it, so question 3's answer leaks into question 4. Fixing that needs a custom attention mask, and it wasn't worth it until the single-question path worked end to end.

The plan called the data phase the place where the project is won or lost, and gave it three to five days. The idea was to pick five to ten concrete tasks I actually intend to ship. A 0.8B model gets its accuracy from narrowness, so each task is a specific decision with a fixed option set.

The plan budgeted 2,000 to 5,000 rows per task. Inputs come from real logs where they exist. Where they don't, a frontier model generates varied states that then get labelled.

The labels are soft labels. A hard label says "the answer is A" with full certainty. A soft label is a spread of probability over the options.

The plan's recipe samples a teacher model, called the oracle, five times per row at a sampling temperature of around 0.8, which lets its answers vary a little from run to run. The vote split becomes the target, so four votes for A and one for B becomes `[0.8, 0.2]`.

This is the whole calibration story. A model is calibrated when its 80% answers are right about 80% of the time, and a student model can only learn frequencies if you show it frequencies.

Hard labels teach the model to be certain about everything, and my measurements showed it. When I trained on one-hot hard labels, I got 54% accuracy at 97% average confidence. That's a model that's confidently wrong, which makes the gate useless and is the worst outcome for this kind of thing!

Good soft-label data needs variance. If the oracle gives five identical votes on every row, the soft labels are hard labels in disguise. The plan's gate for the data phase was that the soft labels show real variance.

The oracle cost adds up fast. Five samples, ten tasks and 5,000 rows comes to 250,000 frontier calls at the top of the plan's range, and the plan said to price that before starting.

The plan holds out 1,000 rows and never trains on them. They do two jobs: fitting the temperature later, and serving as the final benchmark.

The plan also ruled out the usual LLM benchmarks. MMLU, GSM8K and HumanEval reward chain-of-thought, which this model deliberately doesn't have, so its scores there would look terrible and mean nothing.

The held-out sets I report on are a mixed set across decision types, a game-control set, a browser set and a non-browser challenge set. In the game-control set the model picks an action from a JSON description of the objects in the game. In the browser set it picks an operation like Click, Type or Done plus a target element from a live element table.

The generalist adapter covers 15 task shapes. The decisions it suits include fraud, sentiment, routing, PII detection, log errors, toxicity, content moderation, code-review severity and trading buy/sell/hold. It also covers agent guardrails, such as stuck/done/off-track for an agent loop and allow/block for a tool call.

Training got two days in the plan. The head stays the model's own output layer, `lm_head`, masked to the option tokens. That keeps the pretrained meaning of the option words and adds zero parameters.

The fallback was a single linear layer from the 1024-wide final hidden state to the options. It's meant for option names that are arbitrary codes with no meaning. The fine-tunes I measured all use the first route, teacher-forced option scoring, where the full prompt goes in and the loss is computed on the option logits at the answer position.

For tuning I used LoRA. LoRA freezes the base weights and trains small extra matrices next to them, so one base model can carry a swappable adapter per task. The plan set rank 16 on the attention and MLP projections, where the rank is the size of those extra matrices.

A full fine-tune of a 0.8B model is affordable. Adapters matter a lot at serving time, though, since every task can share one copy of the base weights.

The loss is cross-entropy against the soft label. With soft target $y$ and the model's option probabilities $p$ over $K$ options:

$$\mathcal{L} = -\sum_{i=1}^{K} y_i \log p_i$$

For the `[0.8, 0.2]` row, this loss is lowest when the model says 0.8 and 0.2. A one-hot label would push the model toward 1.0 on A every time, and a distributional loss like this one is what restores calibration.

The plan kept one fallback. If calibration came out ugly, add $0.3 \times$ a Brier term, which is the squared error between the probabilities and the label. Soft labels usually make it unnecessary, and the pipeline has no PPO, no reward model and no contrastive negatives.

Here's what I trained and what each version measured on the 6 GB laptop.

| Variant | What was trained | Measured |
| --- | --- | --- |
| Stock 0.8B | No adapter, scoring only | 73% zero-shot, 85% with two examples, ~30 ms |
| Agentic 0.8B generalist | One LoRA adapter on Qwen3.5-0.8B, 15 task shapes, bf16 | ~91% held-out, ~35 ms |
| Agentic 0.8B browser | Same base, retrained with real DOM observations | 97% browser set, ~35 ms |
| Agentic 2B | QLoRA on Qwen3.5-2B, 4-bit | 100% browser set, 93.8% mixed set, ~4 GB, slower |

bf16 is a 16-bit number format for the weights. QLoRA is LoRA trained on top of a base model squeezed to 4-bit weights, which is how a 2B model trains on a 6 GB card.

The browser version shows how much the data matters. Retraining on real DOM observations took the browser set to 97%, and confidence there went from 0.66 to 0.81, so in the live loop it acts unattended. It gave up a little elsewhere, landing around 87% on the non-browser challenge set.

The 2B gains over the 0.8B were marginal, and the same pattern showed up when I ported the training to other bases.

Across every general or zero-shot model I tried, accuracy on a given task shape sat between 46% and 74%. A task-specific fine-tune landed at roughly 88 to 94%, and that held across four quite different bases.

| Base | Mixed set, zero-shot → tuned | Game-control set (tuned) | Latency | Recipe |
| --- | --- | --- | --- | --- |
| Qwen3.5-0.8B | 66 → 91 | 92 | ~35 ms | LoRA |
| Qwen3.5-2B | 72 → 94 | 92 | slower | QLoRA, 4-bit |
| MiniCPM5-2B | 63 → 89 | 77 | ~50 ms | QLoRA, 4-bit |
| laya (ModernBERT-large encoder) | 68 → 88 | 92 | ~19 ms | its own proper-scoring loss |

Every base gained between 20 and 26 points from training, while going from 0.8B to 2B added only about three. The base model barely mattered once I trained on the task. I was SO surprised by that.

laya is a 421M-parameter encoder, ModernBERT-large with a decision head, under Apache-2.0. Untuned, it sat at 58 to 68% on general decisions. It has no public training API, so I fine-tuned it through its own proper-scoring loss, a mix of log, spherical and ranked-probability scores.

A proper scoring rule is a loss that is lowest when the model reports its true probabilities. That's the same property the soft-label cross-entropy relies on.

The encoder was the fastest of the four, and on the game-control set it went from 46% to 92%. If I need the fastest self-hosted scorer and I have labels, that's my default now.

Soft labels get the probabilities close, and temperature scaling tidies up the rest. After training, the plan fits one number $T$ per task on the 1,000 held-out rows and divides the logits $z$ by it before the softmax:

$$p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

A $T$ above 1 softens the probabilities and a $T$ below 1 sharpens them. Dividing by $T$ never changes which logit is largest, so accuracy stays the same and only the sharpness moves. $T$ is chosen to minimise negative log-likelihood, meaning it makes the true held-out answers as probable as possible.

The plan fits $T$ separately for each task. Different schemas have different built-in ambiguity, and one shared temperature would split the difference badly.

Calibration is measured with Expected Calibration Error, or ECE. You sort predictions into 15 equal-width confidence bins, compare average confidence with accuracy in each bin, and take the weighted average gap:

$$\text{ECE} = \sum_{b=1}^{15} \frac{n_b}{N} \, \lvert \text{acc}_b - \text{conf}_b \rvert$$

Here $n_b$ is the number of predictions in bin $b$ and $N$ is the total. The target in the plan was ECE under 3%, checked per task. My notes don't record a final ECE for the trained adapters, so I'll only claim the target here.

If ECE is still poor after scaling, the plan says the problem is upstream in the data. The first thing to check is whether the oracle sampling produced varied distributions or five identical votes every time.

Temperature scaling has a hard limit. It only helps on inputs that look like the training data. Miscalibration on unfamiliar inputs is a data problem, and one scalar can't fix it.

That limit is why there's a gate. Every decision gets a chance-normalised confidence. With top probability $p$ over $K$ options:

$$c = \frac{p - 1/K}{1 - 1/K}$$

Random guessing gives $1/K$, so $c$ is 0 at chance and 1 at full certainty. A top probability of 0.6 gives $c = 0.2$ on a yes/no question and about $0.58$ on a 20-way choice. This puts a yes/no question and a 20-way choice on the same scale.

Above a threshold, the code acts on the answer. Below it, the input goes to a slower model or a person.

On a realistic traffic mix, the 0.8B model decided about 92% of inputs by itself, at roughly 100% accuracy on the ones it kept. The small model's job is to be right when it's confident and to know when it isn't.

I also add a `None` option. Constrained scoring always picks an offered option, so if the true answer isn't on the list, the model is forced to be wrong. With `None` it can decline.

`None` and the gate do different jobs. `None` is a first-class choice the model can pick, and the gate is a confidence threshold on everything else.

The plan has a third layer for unfamiliar inputs, built on Mahalanobis distance. That's the distance from the centre of the training data, measured in units of how spread out the data is in each direction.

The design takes the hidden state at roughly layer 12, in the middle of the network. Final-layer states are pulled toward the output classes and carry less information about whether an input is unfamiliar.

Fit a mean $\mu$ and covariance $\Sigma$ over the training set's layer-12 states $h$. At inference, compute:

$$d(h) = \sqrt{(h - \mu)^\top \Sigma^{-1} (h - \mu)}$$

The model abstains when $d$ is above the 95th percentile of distances on the training set. The plan's target was to catch over 80% of injected out-of-distribution inputs, made by feeding it schemas from unrelated tasks.

I flagged two things about this in the plan. The layer counts for Qwen3.5-0.8B needed checking against the model's config before committing to layer 12. And the check should be called a heuristic in the docs and the API.

The research I started from offered conformal prediction as a guarantee against unfamiliar inputs. Conformal coverage assumes the test data comes from the same distribution as the calibration data, and an out-of-distribution input breaks that by definition. The guarantee disappears in exactly the case it's meant for.

Serving uses vLLM with `max_tokens=1`. Each request is a single prefill with no decode tail, so throughput is almost entirely a batching question.

Prefix caching helps when the same large state gets asked several questions with different schemas. Qwen3.5 mixes full-attention layers with Gated DeltaNet linear-attention layers. A linear-attention layer keeps a fixed-size state whatever the input length, which makes it the cheapest thing in the model to cache, so the plan caches both kinds.

LoRA adapters load per task through vLLM's multi-adapter support, so all tasks share one set of base weights in GPU memory. On top sits a typed API, so downstream code never sees a logit. The response shape looks like this.

```python
class Decision(BaseModel):
    confidence: float
    abstained: bool
```

Here's how the plan's benchmark targets line up with what I measured.

| Metric | Target in the plan | Measured |
| --- | --- | --- |
| p50 latency, batch 1 | under 100 ms | ~30 ms stock, ~35 ms with the 0.8B adapter |
| Throughput, batch 64 | over 500 queries/sec | no figure in my notes |
| Held-out accuracy | within 10 points of a frontier model with reasoning | ~91% for the 0.8B generalist |
| ECE, 15 bins, after scaling | under 3%, per task | no figure in my notes |
| Schema conformance | 100% | holds by construction |
| Out-of-distribution abstain | over 80% caught | no figure in my notes |

The research I started from described a much bigger pipeline. My plan estimated about two weeks of solo work against two to three months for that version. These are the parts I deliberately left out.

| Dropped | Why |
| --- | --- |
| RLCD, PPO and a contrastive reward model | Adding a reward term to a proper scoring rule destroys the property that made the rule worth using. Soft labels get the same calibration for a fraction of the work. |
| Negative-prompted "flawed" oracle outputs | They teach the model what a badly prompted oracle does, which says nothing about where real ambiguity lives. |
| Two-stage cosine-similarity head for many classes | It solves a problem that doesn't exist at 64 options. A 255-way softmax is routine, and ImageNet models do 1,000. |
| Conformal p-values with coverage guarantees | The guarantee fails on exactly the unfamiliar inputs it's meant to catch. I used the Mahalanobis heuristic. |
| Removing `lm_head` | It throws away the pretrained meaning of the option words for no gain. |
| Custom hybrid-attention kernels | vLLM already handles it, and it isn't the bottleneck at 0.8B. |

I'd use this for high-volume narrow decisions where you own the labels, like routing, moderation, PII detection, triage, agent guardrails and tool-call firewalls. It also fits browser loops, where the retrained version picked the right operation and target element 97% of the time on my browser set.

For the widest task mix I use the 0.8B, and the 2B when a few extra milliseconds per call are fine.

It's weak at fine-grained scoring, with priority on a 1 to 5 scale sitting around 60 to 67%. I gate those and send the low-confidence ones to a bigger model.

It's the wrong tool for anything that needs multi-step reasoning. If the small model lands more than about ten points behind a frontier model with reasoning on your task, use the bigger model for that task. The plan expected routing and PII detection to be close and anything with multi-step inference to be far off.

It also shouldn't cross into other kinds of job. GLiNER 2.5 is excellent at extraction and scored 100% on sentiment, but it got 23% on the game-control set, close to chance on decisions that need reasoning over state.

And I wouldn't ship any base zero-shot. The confidence isn't trustworthy until the model is trained on the task.

The eval sets behind all of these numbers are small, so treat the results as directional.
