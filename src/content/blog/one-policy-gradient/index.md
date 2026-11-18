---
title: "Every RL method for LLMs is the same policy gradient"
description: "REINFORCE, PPO, GRPO, DAPO, GSPO and CISPO as one estimator with a different weight, ratio or clip, and the failure each change fixes."
date: "2026-10-21"
draft: true
areas: [rl]
tags: ["REINFORCE", "PPO", "GRPO", "DAPO", "GSPO", "CISPO"]
experiment: false
---

The first time I tried to keep up with RL for language models, it looked like a zoo. PPO, GRPO, Dr. GRPO, DAPO, GSPO, CISPO, RLOO, REINFORCE++, each with its own paper, its own acronym and its own claim to be more stable than the last one.

It got much easier once I stopped reading them as separate algorithms. They are all the same policy-gradient estimator from 1992, with one term changed: what multiplies the log-probability, whether there is an importance ratio, at what level that ratio lives, and how it gets clipped. If you can write down REINFORCE, you can read every one of these papers as a diff. This post is that diff.

## The one expression

Set up generation as RL. The state is the prompt plus the tokens generated so far. The action is the next token. The policy $\pi_\theta$ is the model's softmax over the vocabulary. Transitions are deterministic: append the token. The reward usually arrives once, at the end: a unit test passes, the answer matches, a reward model gives a score.

We want to maximise expected reward:

$$
J(\theta) = \mathbb{E}_{x \sim \mathcal{D},\; y \sim \pi_\theta(\cdot|x)}\big[ R(x,y) \big]
$$

The problem is that $\theta$ changes which responses get sampled, and you can't differentiate through sampling. The log-derivative trick, $\nabla P = P \, \nabla \log P$, gets around it. Write the probability of a trajectory as a product of environment terms and policy terms, take the log, and the environment terms have no $\theta$ in them, so their gradient is zero. You never need a model of the environment. What's left is:

$$
\nabla_\theta J(\theta) = \mathbb{E}_{x,\, y \sim \pi_\theta}\Big[ \sum_{t=1}^{|y|} \nabla_\theta \log \pi_\theta(y_t \mid x, y_{<t}) \; R(x,y) \Big]
$$

That is REINFORCE. Push up the log-probability of every token in a response, in proportion to how good the whole response was. In code, you minimise a surrogate whose gradient is this estimator, with the reward treated as a constant:

$$
\mathcal{L}(\theta) = -\frac{1}{|\mathcal{D}|}\sum_{y}\sum_{t} \log \pi_\theta(y_t \mid x, y_{<t})\; R(x,y)
$$

Two warnings that I had to learn the slow way. This "loss" is not a performance measure; it can go down while reward gets worse, so plot reward, entropy and length instead. And it is only correct for samples from the current policy. Take a second gradient step on the same batch and you are off-policy.

Every method below keeps this shape. I'll write it once in its general form and then just change the pieces:

$$
\nabla_\theta J = \mathbb{E}\Big[\sum_{t} \underbrace{w_t}_{\text{ratio}} \cdot \nabla_\theta \log \pi_\theta(y_t \mid s_t) \cdot \underbrace{\hat A_t}_{\text{weight}}\Big]
$$

plus a clip, a normaliser, and maybe a KL term.

## Change 1: subtract a baseline

REINFORCE is unbiased but very noisy. One scalar multiplies thousands of token gradients. Worse, if every reward is positive, every sampled token gets pushed up, and learning relies on the good ones being pushed up slightly harder.

The fix rests on a small lemma: for any distribution, the expected gradient of its log-probability is zero.

$$
\mathbb{E}_{y \sim \pi_\theta}\big[\nabla_\theta \log \pi_\theta(y)\big] = \nabla_\theta \sum_y \pi_\theta(y) = \nabla_\theta 1 = 0
$$

So you can subtract any baseline $b(x)$ that doesn't depend on the sampled response, and the gradient stays unbiased while its variance drops. The centred signal is the advantage, $A = R - b$. Positive: do it more. Negative: do it less.

This is where the families split, and it is the single most useful way to organise the zoo:

| Baseline $b(x)$ | Method |
| --- | --- |
| None | Vanilla REINFORCE |
| A learned value network $V_\phi$, combined via GAE | PPO |
| Mean reward of the other $G-1$ samples for the same prompt | RLOO |
| Reward of the greedy decode | ReMax |
| Group mean, then divide by group std | GRPO |
| Mean over the whole global batch | REINFORCE++ |

The classic choice is a learned critic. Generalised advantage estimation mixes temporal-difference residuals $\delta_t = r_t + \gamma V_\phi(s_{t+1}) - V_\phi(s_t)$ with a decay $\lambda$: $\lambda = 0$ trusts the critic completely, $\lambda = 1$ is Monte Carlo return minus the critic. For an LLM, that critic is another network roughly the size of the policy. Hold that thought.

One trick from the classic RL toolbox that does nothing here: reward-to-go. With a single reward at the end of the response, every token's reward-to-go is the final reward. It only starts to matter in multi-turn agent settings with intermediate rewards.

## Change 2: reuse the batch, then clip (PPO)

Sampling is expensive; for LLMs it dominates wall-clock time. You want several gradient steps per batch of rollouts. After the first step, though, the samples come from the old policy, so you correct with an importance ratio:

$$
\rho_t(\theta) = \frac{\pi_\theta(y_t \mid s_t)}{\pi_{\theta_{\mathrm{old}}}(y_t \mid s_t)}
$$

At $\theta = \theta_{\text{old}}$ the ratio is 1 and the gradient is the plain policy gradient. Further away, ratios get large and a handful of tokens dominate the update. PPO's answer is to clip:

$$
L^{\mathrm{CLIP}}(\theta) = \mathbb{E}_t\Big[\min\big(\rho_t\hat A_t,\; \mathrm{clip}(\rho_t, 1-\epsilon, 1+\epsilon)\,\hat A_t\big)\Big]
$$

With $\epsilon = 0.2$: once a token's probability has risen 20% above the old policy (positive advantage) or fallen 20% below it (negative advantage), it gets no more gradient from this batch. The `min` makes it a pessimistic bound. This one equation, applied per token, is the core of everything that follows. Most of the 2025 papers are arguments about it.

RLHF adds one more term: a KL penalty to a frozen reference model, so the policy doesn't wander off into text that exploits the reward model.

$$
\max_{\pi_\theta}\; \mathbb{E}\big[ r(x,y) \big] - \beta\, \mathbb{D}_{KL}\big[ \pi_\theta \,\|\, \pi_{\mathrm{ref}} \big]
$$

In InstructGPT-style PPO that KL is folded into the per-token reward. The bill: four large models in memory (actor, reference, reward model, critic), with optimiser state for two of them. That bill is the whole reason for the next change.

## Change 3: drop the critic (GRPO)

GRPO, from the DeepSeekMath paper, keeps PPO's clipped ratio and throws away the critic. For each prompt, sample a group of $G$ responses and use the group's own statistics as the baseline:

$$
\hat{A}_{i} = \frac{r_i - \mathrm{mean}(r_1,\dots,r_G)}{\mathrm{std}(r_1,\dots,r_G)}
$$

Every token in response $i$ shares that one advantage. The objective is PPO's, averaged per sequence and then over the group, with the KL moved out of the reward and into the loss:

$$
\mathcal{J}_{\mathrm{GRPO}} = \mathbb{E}\Big[ \frac{1}{G}\sum_{i=1}^{G} \frac{1}{|o_i|} \sum_{t=1}^{|o_i|} \Big\{ \min\big( \rho_{i,t}\hat{A}_{i},\; \mathrm{clip}(\rho_{i,t}, 1\pm\varepsilon)\hat{A}_{i} \big) - \beta\, \mathbb{D}_{KL}\big[\pi_\theta \| \pi_{\mathrm{ref}}\big] \Big\} \Big]
$$

The KL uses Schulman's "k3" estimator on the sampled token, which is non-negative and unbiased: with $d = \log \pi_{\mathrm{ref}} - \log \pi_\theta$, it's $e^{d} - d - 1$.

The intuition is pleasant. Within a group, a response better than its siblings goes up, a worse one goes down. No value network to train, no value-model bias. Pair it with a programmatic checker, the answer matches, the tests pass, and you have RLVR, which is what DeepSeek-R1 scaled up.

It also has a sharp edge you should notice immediately: if every sample in a group is right, or every one is wrong, every advantage is zero and that prompt contributes nothing. Remember that one too.

Here is the loss, adapted from my notes. The `mode` switch is the point of this post: the three methods differ in a few lines.

```python
import torch

def group_advantages(rewards, G, scale_std=True, eps=1e-6):
    r = rewards.view(-1, G)                      # each prompt's G samples are contiguous
    adv = r - r.mean(dim=1, keepdim=True)
    if scale_std:                                # GRPO; Dr. GRPO drops this
        adv = adv / (r.std(dim=1, keepdim=True) + eps)
    return adv.view(-1)                          # one scalar per sequence

def policy_loss(logp, old_logp, adv, mask, mode="grpo", eps_low=0.2, eps_high=0.28):
    """logp, old_logp, mask: (N, T) on response tokens; adv: (N,)."""
    a = adv.unsqueeze(1)
    log_ratio = (logp - old_logp) * mask
    if mode == "gspo":                           # one ratio per sequence; pass eps ~3e-4 / 4e-4
        s = (log_ratio.sum(1) / mask.sum(1).clamp(min=1)).exp()
        obj = torch.minimum(s * adv, s.clamp(1 - eps_low, 1 + eps_high) * adv)
        return -obj.mean()
    ratio = log_ratio.exp()
    if mode == "cispo":                          # clip the weight, keep every token's gradient
        w = ratio.clamp(1 - eps_low, 1 + eps_high).detach()
        per_tok = w * a * logp
    else:                                        # grpo / dapo: PPO-style clipped surrogate
        per_tok = torch.minimum(ratio * a, ratio.clamp(1 - eps_low, 1 + eps_high) * a)
    return -(per_tok * mask).sum() / mask.sum().clamp(min=1)    # token-level mean (DAPO)
```

Two notes. Original GRPO normalises per sequence first (`per_tok.sum(1) / mask.sum(1)`, then mean); the token-level mean above is DAPO's change, which I'll get to. And the advantages and old log-probs must be constants. Compute them under `torch.no_grad()` or detach them, or you'll be differentiating through your reward.

## Where vanilla GRPO breaks

Run GRPO long enough on long outputs and four failure modes show up. Nearly every successor targets one of them:

1. **Normalisation bias.** The $1/|o_i|$ and the std division skew weights across lengths and difficulties.
2. **Entropy collapse.** The policy turns deterministic early and stops exploring.
3. **Token-level ratio noise.** Per-token ratios are high variance, worse with long sequences and mixture-of-experts routing.
4. **Train-inference mismatch.** The sampler (vLLM, SGLang) and the trainer (FSDP, Megatron) compute slightly different probabilities for the same weights, so "on-policy" quietly isn't.

## Dr. GRPO and DAPO: fix the normaliser and the clip

The Dr. GRPO paper points out two biases hiding in the normalisers. Dividing by $|o_i|$ means each token of a long wrong answer is penalised less than each token of a short one, which inflates the length of wrong answers. Dividing by the std up-weights prompts with low reward variance, the very easy and the very hard ones. Their fix is to delete both and divide by a constant such as the max length. That recovers an unbiased policy gradient. It also comes with a warning I now repeat to anyone who shows me a rising length curve: length growth can be a normalisation artefact, not reasoning. Check accuracy inside length buckets before celebrating.

DAPO, from ByteDance Seed, is the most practical list of fixes I know, because it comes with an ablation. On Qwen2.5-32B base, AIME 2024:

| Configuration | AIME 2024 |
| --- | --- |
| Naive GRPO | 30 |
| + Overlong filtering | 36 |
| + Clip-Higher | 38 |
| + Soft overlong punishment | 41 |
| + Token-level loss | 42 |
| + Dynamic sampling (full DAPO) | 50 |

Each technique maps onto a term in our expression:

- **Clip-Higher** changes the clip. Decouple the bounds: $\varepsilon_{\text{low}} = 0.2$, $\varepsilon_{\text{high}} = 0.28$. With a symmetric 0.2, a rare token can only grow by a factor of 1.2 per batch, which caps exploration of exactly the tokens you'd want to explore and speeds up entropy collapse.
- **Dynamic sampling** fixes the zero-advantage groups from earlier. Drop prompts whose group accuracy is 0 or 1, and keep sampling until the batch is full of informative ones.
- **Token-level loss** changes the normaliser to $1/\sum_i |o_i|$, so long samples carry weight in proportion to their length and repetition in long outputs is penalised per token.
- **Overlong shaping** fixes the reward. Truncated responses get a noisy reward, so mask them, then add a soft length penalty in a buffer zone before the hard cap.

DAPO also drops the KL term entirely. That looks like heresy coming from RLHF, but it's a regime change rather than a contradiction: a verifier is much harder to hack than a learned reward model, so the leash matters less.

## GSPO: move the ratio to the sequence

GSPO, from the Qwen team, attacks the ratio itself. Their argument is that GRPO's per-token ratios are an invalid use of importance sampling: one sampled token can't correct a distribution shift, so the weights mostly add noise, and the noise accumulates with length. GSPO uses one ratio per response, the length-normalised sequence likelihood ratio:

$$
s_i(\theta) = \Big( \frac{\pi_\theta(y_i|x)}{\pi_{\theta_{\mathrm{old}}}(y_i|x)} \Big)^{1/|y_i|} = \exp\Big( \frac{1}{|y_i|} \sum_{t} \log \frac{\pi_\theta(y_{i,t}|x,y_{i,<t})}{\pi_{\theta_{\mathrm{old}}}(y_{i,t}|x,y_{i,<t})} \Big)
$$

and clips that. Because it's a geometric mean, it barely moves, so the clip range is about two orders of magnitude narrower: the paper uses 3e-4 and 4e-4, against 0.2 and 0.27 for their GRPO baseline. GSPO ends up clipping far more tokens than GRPO and still trains more efficiently, which says something unflattering about how noisy GRPO's token-level gradients are.

The case is strongest for mixture-of-experts models. After an RL update, roughly 10% of the experts activated for the same input change, which makes token ratios jump around. People had been pinning expert choices ("routing replay") to compensate. The sequence likelihood is stable enough that GSPO can drop the workaround.

## CISPO: clip the weight, not the update

MiniMax's CISPO notices a different problem with the PPO clip. When a token's ratio leaves the trust region, the `min` zeroes its gradient. The tokens most likely to get there are rare "forking" tokens like "However", "Wait" or "Recheck", which start with low probability and so see large ratios. Those are the tokens that make long reasoning happen, and PPO-style clipping throws their gradient away.

CISPO keeps the gradient for every token and clips the importance weight instead, with a stop-gradient:

$$
\mathcal{J}_{\mathrm{CISPO}} = \mathbb{E}\Big[ \frac{1}{\sum_i |o_i|} \sum_{i,t} \mathrm{sg}\big(\mathrm{clip}(\rho_{i,t})\big)\, \hat{A}_{i,t}\, \log \pi_\theta(o_{i,t}|q,o_{i,<t}) \Big]
$$

Look at that next to the REINFORCE surrogate at the top of this post. It is REINFORCE with a truncated importance weight, the same family as IMPALA's V-trace. We went all the way round. MiniMax reports roughly a 2x speedup over DAPO on Qwen2.5-32B, matching DAPO's AIME 2024 score in about half the steps.

GSPO and CISPO are competing answers to the same problem, unstable token ratios, especially in MoE. One moves the ratio to the sequence; the other stops letting the ratio decide whether a token gets a gradient.

## Entropy collapse, briefly

Entropy deserves its own post, but the short version fits here. One analysis of RL for reasoning models finds that the change in entropy per step is driven by the covariance between a token's log-probability and its advantage. Confident tokens with high advantage sharpen the policy; rare tokens with high advantage widen it. Their empirical fit is $R = -a\,e^{\mathcal{H}} + b$: performance is bought with entropy, and you hit a ceiling when entropy runs out. Their fixes, Clip-Cov and KL-Cov, act on the tiny fraction of tokens with outlier covariance. Clip-Higher and CISPO are, among other things, entropy interventions too: both stop the clip from silencing rare tokens.

## The whole lineage in one table

| Method | What it changes | Problem it fixes |
| --- | --- | --- |
| REINFORCE | Weight = raw return $R$ | Can't differentiate through sampling |
| Baseline / RLOO / ReMax | Weight = $R - b(x)$ | Variance; all-positive rewards push everything up |
| PPO | Adds ratio $\rho_t$, clip at $1 \pm \epsilon$, critic + GAE, KL to reference | Reusing a batch for several steps without blowing up |
| GRPO | Baseline = group mean / std; k3 KL in the loss | Critic costs a second policy-sized model |
| Dr. GRPO | Drops $1/\lvert o_i \rvert$ and std; constant normaliser | Length bias toward long wrong answers; difficulty bias |
| DAPO | Asymmetric clip, token-level normaliser, drop 0/1-accuracy groups, overlong shaping, no KL | Entropy collapse, zero-gradient groups, length weighting, truncation noise |
| GSPO | Ratio and clip at sequence level | Noisy token ratios, MoE routing churn |
| CISPO | Clip and stop-gradient the weight, not the objective | Clipping kills gradients of rare forking tokens |

## Takeaways

**Read new papers as diffs.** When the next one arrives, ask four questions: what is the baseline, is there a ratio, at what level, and what happens when it's clipped. That's usually the whole contribution. One 2026 paper, GPPO, already frames DAPO and others as special cases of a divergence-based trust region, which tells me the field has noticed the same thing.

**My default starting point**, assembled from the recipes rather than taken from any single paper: group baseline with $G$ between 8 and 16, no std scaling (or at least question it), token-level or constant normalisation, $\varepsilon_{\text{low}} = 0.2$ and $\varepsilon_{\text{high}} = 0.28$, no KL or a tiny one, drop zero-variance groups, mask truncated samples, and some fix for train-inference mismatch. For MoE, reach for sequence-level ratios. Recent TRL versions expose most of this as `loss_type` options (`dapo`, `dr_grpo`, `cispo`, `sapo`), which is a decent signal of which variants are considered mainstream.

**Log entropy, length and clip fraction, not just reward.** Entropy dropping sharply early is the first sign of trouble. Rising length is not evidence of anything on its own.

**Run a random-reward control.** The Spurious Rewards paper got Qwen2.5-Math-7B up 21.4 points on MATH-500 with random rewards, against 29.1 with real ones, and traced it to a clipping bias in GRPO that amplifies behaviour the model already had. The effect didn't transfer to Llama or OLMo. If your gain survives a random-reward run and a non-Qwen base model, I'll believe it.

**Open question I keep coming back to:** whether any of this teaches the model something new, or just sharpens what the base model could already do at large $k$. The pass@k evidence leans towards sharpening; prolonged-RL work argues otherwise. All of these methods are the same estimator, so the answer is more likely to come from the data and the environments than from yet another clip.
