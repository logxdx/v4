---
title: "Every RL method for LLMs is the same policy gradient"
description: "How REINFORCE, PPO, GRPO, DAPO, GSPO and CISPO all come from one policy-gradient formula, with each method changing one small piece of it."
date: "2026-10-21"
draft: true
areas: [rl]
tags: ["REINFORCE", "PPO", "GRPO", "DAPO", "GSPO", "CISPO"]
experiment: false
---

When I first tried to keep up with RL for language models, I felt completely lost. PPO, GRPO, DAPO, GSPO, CISPO, and every one came with its own paper. It got much easier once I saw that they all use the same policy-gradient estimator from 1992, called REINFORCE, and each method changes one small piece of it.

The model reads a prompt and writes a response one token at a time, and at the end something scores it, like a unit test or an answer check. REINFORCE says to follow this gradient:

$$
\nabla_\theta J = \mathbb{E}\Big[ \sum_{t} \nabla_\theta \log \pi_\theta(y_t \mid s_t)\, R(x,y) \Big]
$$

In plain words, for every token in a response, push up its log-probability, and push harder the better the whole response scored. Here $s_t$ is the prompt plus the tokens before position $t$. You never need a model of the environment, because the environment terms have no $\theta$ in them and drop out of the gradient. That's REINFORCE, and that's all it is!

The first fix is a baseline. REINFORCE is very noisy, since one number multiplies thousands of token gradients, and if every reward is positive then every token gets pushed up. The expected gradient of a log-probability is zero, so you can subtract any baseline $b(x)$ that doesn't depend on the sampled response, and the gradient stays unbiased while the variance drops. What's left, $A = R - b$, is called the advantage. Positive means do more of that, negative means do less. PPO learns its baseline with a value network, which for an LLM is another model roughly the size of the policy.

The next fix lets you reuse a batch. Sampling is the slow part, so you want several gradient steps per batch, but after the first step the samples come from an older policy. PPO corrects for this with a ratio $\rho_t$, which is the token's probability now divided by its probability when it was sampled, and then clips it:

$$
L = \mathbb{E}_t\big[\min(\rho_t A_t,\, \mathrm{clip}(\rho_t, 1\pm\epsilon) A_t)\big]
$$

With $\epsilon = 0.2$, once a token's probability has moved 20% in the direction its advantage wants, it gets no more gradient from that batch. Most of the 2025 papers are arguments about this one equation.

GRPO, from the DeepSeekMath paper, keeps that clip and drops the value network. For each prompt it samples a group of $G$ responses and scores each one against its siblings:

$$
\hat{A}_{i} = \frac{r_i - \mathrm{mean}(r)}{\mathrm{std}(r)}
$$

So a response's advantage is how far its reward sits above or below the group average, in standard deviations, and every token in that response shares it. Pair this with a programmatic checker and you have what DeepSeek-R1 scaled up. One sharp edge is that if every sample in a group is right, or every one is wrong, all the advantages are zero and that prompt teaches nothing.

Here's the loss, trimmed down from my notes. The `mode` switch shows how few lines separate the methods.

```python
import torch

def group_advantages(rewards, G, scale_std=True, eps=1e-6):
    r = rewards.view(-1, G)                  # each prompt's G samples are contiguous
    adv = r - r.mean(dim=1, keepdim=True)
    if scale_std:                            # GRPO; Dr. GRPO drops this
        adv = adv / (r.std(dim=1, keepdim=True) + eps)
    return adv.view(-1)                      # one scalar per sequence

def policy_loss(logp, old_logp, adv, mask, mode="grpo", lo=0.2, hi=0.28):
    a = adv.unsqueeze(1)
    ratio = ((logp - old_logp) * mask).exp()
    if mode == "cispo":                      # clipped weight, every token keeps a gradient
        per_tok = ratio.clamp(1 - lo, 1 + hi).detach() * a * logp
    else:                                    # grpo / dapo: PPO-style clipped surrogate
        per_tok = torch.minimum(ratio * a, ratio.clamp(1 - lo, 1 + hi) * a)
    return -(per_tok * mask).sum() / mask.sum().clamp(min=1)   # token-level mean (DAPO)
```

The advantages and old log-probs have to be constants, so compute them under `torch.no_grad()` or you'll be differentiating through your reward.

DAPO, from ByteDance Seed, raises the upper clip bound to 0.28 while keeping the lower one at 0.2, so rare tokens can grow faster, and it drops the all-right and all-wrong groups and keeps sampling until the batch is full of useful ones. In their ablation on Qwen2.5-32B base, AIME 2024 goes from 30 with naive GRPO to 50 with full DAPO, which is a HUGE jump.

GSPO, from the Qwen team, argues that per-token ratios mostly add noise, so it uses one ratio per response, $s_i = (\pi_\theta(y_i|x)/\pi_{\theta_{\mathrm{old}}}(y_i|x))^{1/|y_i|}$, which is the geometric mean of the token ratios. It helps most on mixture-of-experts models, where token ratios jump around after each update.

CISPO, from MiniMax, notices that the PPO clip throws away the gradient of rare "forking" tokens like "Wait" or "However", which are the ones that drive long reasoning. It clips the importance weight and treats it as a constant, so every token keeps its gradient, and that turns it back into REINFORCE with a capped weight. We went all the way round!

Here's the whole lineage in one place.

| Method | What it changes | Problem it fixes |
| --- | --- | --- |
| REINFORCE | Weight is the raw return $R$ | Can't differentiate through sampling |
| Baseline / RLOO / ReMax | Weight is $R - b(x)$ | Variance; all-positive rewards push everything up |
| PPO | Ratio $\rho_t$ clipped to $1 \pm \epsilon$, plus a learned critic | Reusing one batch for several steps without blowing up |
| GRPO | Baseline is the average reward of a group of answers to the same prompt; no critic | The critic is a second model as big as the policy |
| DAPO | Asymmetric clip; drops groups where every answer is right or every answer is wrong | Entropy collapse, groups that give zero gradient |
| GSPO | Ratio and clip at sequence level | Noisy token ratios, MoE routing churn |
| CISPO | Clips the weight with a stop-gradient, so every token keeps its gradient | Clipping kills the gradient of rare forking tokens |

So when a new paper comes out, I now check its baseline, whether it has a ratio, whether that ratio is per token or per response, and how it gets clipped. Most of the time that covers everything the paper changed.
