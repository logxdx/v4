---
title: "Data beats base: calibrated sub-100 ms classifiers on a 6 GB laptop"
description: "How I built fast, calibrated decision models on a laptop GPU, and found that training on the task mattered much more than the base model."
date: "2026-09-19"
draft: true
areas: [fine-tuning, decision]
tags: ["LoRA", "QLoRA", "Qwen3.5", "Temperature scaling", "Soft labels", "vLLM"]
experiment: false
---

A lot of the LLM calls in agent code are really multiple-choice questions, like whether a request is in scope or which tool should handle it. The usual approach is to ask a big model, pull a word out of its reply, retry when that fails, and branch on a string with no idea how sure the model was. I wanted a small model that takes messy state in and gives back a typed answer with a probability I can use.

You build the prompt as `state + schema + "Answer:"` and run a single forward pass. Then you read the logits at the last position, keep only the tokens for the allowed options, and softmax over those. That's a classifier with zero new parameters, and the model can't answer outside the schema because it never gets the chance. It only emits one token, so it's fast.

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

I measured latency before training anything, because fine-tuning doesn't make the forward pass any cheaper. On a laptop RTX 4050 with 6 GB of memory, the stock Qwen3.5-0.8B scored options in about 30 ms. 30 ms on a laptop! Zero-shot it got 73% on my first eval, and 85% with two examples in the prompt. That's a usable prototype, but the raw probabilities aren't good enough to build a gate on.

Across every general or zero-shot model I tried, accuracy on a given task shape sat between 46% and 74%. A task-specific fine-tune landed at roughly 88 to 94%, and that held across four quite different bases.

| Base | Mixed set, zero-shot → tuned | Game-control set (tuned) | Latency | Recipe |
| --- | --- | --- | --- | --- |
| Qwen3.5-0.8B | 66 → 91 | 92 | ~35 ms | LoRA |
| Qwen3.5-2B | 72 → 94 | 92 | slower | QLoRA, 4-bit |
| MiniCPM5-2B | 63 → 89 | 77 | ~50 ms | QLoRA, 4-bit |
| laya (ModernBERT-large encoder) | 68 → 88 | 92 | ~19 ms | its own proper-scoring loss |

Every base gained between 20 and 26 points from training, while going from 0.8B to 2B added only about three. The base model barely mattered once I trained on the task. I was SO surprised by that. The eval sets are small, so treat these numbers as directional.

The encoder was the fastest of the four, and on the game-control set it went from 46% to 92%. If I need the fastest self-hosted scorer and I have labels, that's my default now.

The labels matter a lot. I sample a frontier model five times per row at a temperature of around 0.8 and keep the vote split as the target, so four votes for A and one for B becomes `[0.8, 0.2]`. When I trained on hard one-hot labels instead, I got 54% accuracy at 97% average confidence. That's a model that's confidently wrong, which is the worst outcome for this kind of thing!

After training, I fit one temperature per task on held-out data and divide the logits by it. That fixes how sharp the probabilities are without changing which option wins, so accuracy stays the same. It only helps on inputs that look like the training data, though.

Every answer then gets a confidence score adjusted for the number of options, so a yes/no question and a 20-way choice sit on the same scale. Above a threshold the code acts on the answer, and below it the input goes to a slower model or a person. On a realistic traffic mix, the 0.8B model decided about 92% of inputs by itself, at roughly 100% accuracy on the ones it kept. I also add a `None` option so the model can decline when the right answer isn't on the list.

I'd use this for high-volume narrow decisions where you own the labels, like routing, moderation, PII detection, triage and agent guardrails. It also worked in browser loops, where a version retrained on real DOM observations picked the right operation and target element 97% of the time on my browser set. It's weak at fine-grained scoring, with priority on a 1 to 5 scale sitting around 60 to 67%, and it's the wrong tool for anything that needs multi-step reasoning. If the small model lands more than about ten points behind a frontier model with reasoning on your task, use the bigger model for that task.
