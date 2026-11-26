---
title: "Data beats base: calibrated sub-100 ms classifiers on a 6 GB laptop"
short: "Data beats base"
description: "How I set up the data, training, calibration and abstain gate for fast typed decision models on a laptop GPU, and what I measured."
date: "2026-09-19"
areas: [training, decision]
tags: ["LoRA", "QLoRA", "Qwen3.5", "Soft labels", "Calibration", "vLLM"]
experiment: false
---

A lot of LLM calls in agent code are really multiple-choice questions. Is this request in scope? Which tool should handle it? The usual way is to ask a big model, parse a word out of its reply and retry when that fails.

I wanted a small model that takes the state and returns a typed answer with a probability attached. I called it System One and built it on Qwen3.5-0.8B.

## How it works

The trick is to skip text generation. Build the prompt as `state + schema + "Answer:"`, run one forward pass, and read the model's scores (logits) for the option tokens only. A softmax over those gives a probability for each option.

```python
@torch.no_grad()
def score(model, tok, prompt, options, T=1.0):
    # each option starts with a distinct token
    ids = [tok.encode(" " + o, add_special_tokens=False)[0] for o in options]
    enc = tok(prompt, return_tensors="pt").to(model.device)
    last = model(**enc).logits[0, -1]       # one pass, last position
    probs = torch.softmax(last[ids] / T, dim=-1)
    return dict(zip(options, probs.tolist()))
```

That's a classifier with no new parameters, and it can't answer outside the schema. It's fast because it reads the prompt once and emits one token, where a generated answer might need two hundred.

On a 6 GB laptop GPU the stock 0.8B model took about 30 ms per decision. 30 ms on a laptop! The plan's latency budget was under 100 ms, so that used less than a third of it.

Zero-shot it got 73% on my first eval, against a target of over 60%, and 85% with two examples in the prompt.

The probabilities weren't trustworthy yet, though. Everything after this point is about fixing that.

## The schema and training data

First I froze the schema and the prompt format, because every training row depends on them. There are three answer types: `Choice` (up to 64 options), `Score` (an integer range, one option per value) and `Bool`.

Options are named so each starts with a different token, since the scorer only reads the first one. And it's one question per forward pass, because packing several questions into one prompt lets earlier answers leak into later ones.

Then the data. The plan was 5 to 10 narrow tasks I actually wanted to ship, with 2,000 to 5,000 rows each. Inputs come from real logs where possible, and a frontier model writes varied examples where not.

The labels are soft labels. The plan was to ask a bigger teacher model each question five times at a sampling temperature of about 0.8, and use the vote split as the target. Four votes for A and one for B becomes `[0.8, 0.2]`. At the top end of the plan, 10 tasks × 5,000 rows × 5 samples comes to 250,000 teacher calls, so it pays to price that first.

Soft labels are how the model learns calibrated probabilities. A model can only learn how often it should be right if the labels show it. When I trained on hard one-hot labels, I got 54% accuracy at 97% average confidence. Confidently wrong, the worst possible result for a gate!

The soft labels only help if they actually vary. Five identical votes on every row is just a hard label in disguise. The plan also held out 1,000 rows per task, never trained on, for calibration and the final numbers.

## Training

For training, the head stays the model's own output layer, masked to the option tokens, so the option words keep their pretrained meaning. I used LoRA with rank 16 on the attention and MLP layers. LoRA trains small extra matrices next to frozen weights, so every task gets its own swappable adapter on one shared base.

The loss is cross-entropy against the soft label $y$, over the model's option probabilities $p$:

$$\mathcal{L} = -\sum_{i} y_i \log p_i$$

It's lowest when the model says exactly 0.8 and 0.2 for a `[0.8, 0.2]` row. A hard label would push it to 1.0 every time.

## Results

Here's what I trained and measured on the laptop.

| Variant | What was trained | Measured |
| --- | --- | --- |
| Stock 0.8B | nothing, scoring only | 73% zero-shot, 85% with two examples, ~30 ms |
| 0.8B generalist | one LoRA adapter, 15 task shapes, bf16 | ~91% held-out, ~35 ms |
| 0.8B browser | same base, retrained on real DOM observations | 97% on the browser set, ~35 ms |
| 2B | QLoRA on Qwen3.5-2B, 4-bit | 100% browser set, 93.8% mixed set, ~4 GB |

The browser version shows how much the data matters. Retraining on real page observations took it to 97%, with confidence rising from 0.66 to 0.81, so it can act without me watching. The cost is a small drop on other tasks, to about 87% on one non-browser set.

Then I ported the same training to other bases.

| Base | Mixed set, zero-shot → tuned | Gain | Game-control set | Latency |
| --- | --- | --- | --- | --- |
| Qwen3.5-0.8B | 66 → 91 | +25 | 92 | ~35 ms |
| Qwen3.5-2B | 72 → 94 | +22 | 92 | slower |
| MiniCPM5-2B | 63 → 89 | +26 | 77 | ~50 ms |
| laya (ModernBERT encoder) | 68 → 88 | +20 | 92 | ~19 ms |

Every base gained 20 to 26 points from training on the task. Going from 0.8B to 2B added about three (91 to 94). I was SO surprised by that. Across task shapes, untrained models landed at 46 to 74%, and tuned ones at 88 to 94%. The base barely mattered once the data was right, which is where the title comes from.

The encoder, laya, was the fastest at about 19 ms and went from 46% to 92% on the game-control set. That's about 1.8x faster than the 0.8B at ~35 ms and about 2.6x faster than MiniCPM5-2B at ~50 ms. If I have labels and need the fastest scorer, that's now my default.

## Calibration and the abstain gate

Soft labels get the probabilities close, and temperature scaling fixes the rest. The plan fits one number $T$ per task on the 1,000 held-out rows and divides the logits by it:

$$p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

$T$ above 1 softens the probabilities and below 1 sharpens them. The top answer never changes, only how sure the model sounds. The target was a calibration error (ECE) under 3% per task, over 15 bins. My notes don't record the final number, so that's only the target.

Temperature scaling can't help on inputs unlike the training data, so there's also a gate. Each answer gets a confidence that's 0 at chance and 1 at certainty, so a yes/no question and a 20-way choice share one scale:

$$c = \frac{p - 1/K}{1 - 1/K}$$

Here $p$ is the top probability and $K$ the number of options. Above a threshold the code acts. Below it, the input goes to a bigger model or a person.

On a realistic mix of inputs, the 0.8B decided about 92% by itself, at roughly 100% accuracy on those. The other 8% went up the chain.

There are two more safety pieces. Every schema gets a `None` option, so the model can decline when the right answer isn't listed. And the plan adds a distance check on the hidden state at about layer 12, abstaining when an input sits past the 95th percentile of training-data distances. The target there is catching over 80% of injected unfamiliar inputs.

## Serving

Serving is vLLM with `max_tokens=1`. Each task's LoRA adapter loads on the same base weights, so one copy of the model serves every task. The plan's throughput target is over 500 queries a second at batch 64.

I skipped a few things the research I started from suggested. A reward model with PPO would break the clean probabilities the soft-label loss gives. Conformal prediction's guarantee fails on exactly the unfamiliar inputs it's meant to catch. And a special head for many classes isn't needed at 64 options.

## Where it fits

I'd use this for high-volume narrow decisions where I own the labels: routing, moderation, PII detection, triage, agent guardrails, tool-call checks and browser loops.

It's weak at fine-grained scores, with priority on a 1 to 5 scale around 60 to 67%, so those get gated. It's the wrong tool for anything that needs multi-step reasoning. If it's more than about ten points behind a frontier model with reasoning on a task, I use the bigger model there.

And I wouldn't ship any base zero-shot. The confidence isn't worth much until the model has been trained on the task.

The eval sets behind these numbers are small, so treat the results as directional.
