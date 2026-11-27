---
title: "Every RL method for LLMs is the same policy gradient"
short: "One policy gradient"
description: "How REINFORCE, PPO, GRPO, DAPO, GSPO and CISPO all come from one policy-gradient formula, with each method changing one small piece of it."
date: "2026-10-21"
areas: [training]
tags: ["REINFORCE", "PPO", "GRPO", "DAPO", "GSPO", "CISPO"]
stats:
  - value: "30 → 50"
    label: "AIME 2024 with DAPO's fixes, about 1.7x, as reported"
  - value: "46%"
    label: "Less GPU memory with ReMax than PPO, as reported"
  - value: "77.9%"
    label: "R1-Zero pass@1 on AIME 2024, as reported"
experiment: false
---

When I first tried to keep up with RL for language models, I felt completely lost. PPO, GRPO, Dr. GRPO, DAPO, GSPO, CISPO, RLOO, REINFORCE++. Each one came with its own paper, its own acronym and its own claim to be more stable than the last.

It got much easier once I saw that they all share one policy-gradient estimator from 1992, called REINFORCE. Each method changes one piece of it.

It might change what multiplies the log-probability. It might add an importance ratio, move that ratio to a different level, or clip it in a different way.

So in this post I start from REINFORCE and walk through each method as a small edit to it. It's a long one, because I want to show the maths and the code. I'll keep each step small.

## Text generation as RL

First, the setup. We treat text generation as an RL problem. The state is the prompt plus the tokens written so far, and the action is the next token.

The policy $\pi_\theta$ is the model's softmax over the vocabulary, and $\theta$ is the model's weights. Moving from one state to the next is simple: you append the token.

The reward usually arrives once, at the very end. A unit test passes, or the answer matches, or a reward model gives a score.

We want to make the expected reward as high as possible:

$$
J(\theta) = \mathbb{E}_{x \sim \mathcal{D},\; y \sim \pi_\theta(\cdot|x)}\big[ R(x,y) \big]
$$

This says: pick a prompt $x$ from the dataset, let the model write a response $y$, and score it with $R$. $J$ is the average score over many tries.

## The REINFORCE estimator

The problem is that $\theta$ changes which responses get sampled. You can't take a gradient through the act of sampling.

The log-derivative trick gets around this. It uses the identity $\nabla P = P \, \nabla \log P$.

Write the probability of a whole response as a product of environment terms and policy terms. Take the log, and the product turns into a sum. The environment terms have no $\theta$ in them, so their gradient is zero.

That means you never need a model of the environment. What's left is this:

$$
\nabla_\theta J = \mathbb{E}\Big[ \sum_{t} \nabla_\theta \log \pi_\theta(y_t \mid s_t)\; R(x,y) \Big]
$$

Here $y_t$ is the token at position $t$, and $s_t$ is the prompt plus the tokens before it. The sum runs over every token in the response.

In plain words: for every token in a response, push up its log-probability, and push harder the better the whole response scored. That's REINFORCE, and that's all it is!

In code, you minimise a stand-in loss whose gradient is exactly this. It's called a surrogate. You treat the reward as a constant:

$$
\mathcal{L}(\theta) = -\frac{1}{|\mathcal{D}|}\sum_{y}\sum_{t} \log \pi_\theta(y_t \mid s_t)\; R(x,y)
$$

This is the sum of token log-probabilities, each times its response's reward, averaged over the batch. The minus sign is there so that minimising it pushes good responses up.

I learned two warnings about this the slow way. The first is that this "loss" doesn't tell you how well the model is doing. It can go down while reward gets worse, so plot reward, entropy and length instead.

The second is that it's only correct for samples from the current policy. If you take a second gradient step on the same batch, you are off-policy. That means the samples came from a slightly older model than the one you're updating.

Every method below keeps this same shape. Here it is in a general form:

$$
\nabla_\theta J = \mathbb{E}\Big[\sum_{t} w_t \, \hat A_t \, \nabla_\theta \log \pi_\theta(y_t \mid s_t)\Big]
$$

$w_t$ is a ratio, and $\hat A_t$ is the weight on each token. In plain REINFORCE, $w_t = 1$ and $\hat A_t = R$.

Every other method picks these two differently. Then it adds a clip, a normaliser, and maybe a KL term. I'll explain each of those as they come up.

## Baselines and advantages

The first edit is a baseline. REINFORCE is unbiased, which means that on average it points the right way. But it's very noisy, because one number multiplies thousands of token gradients.

It gets worse if every reward is positive. Then every sampled token gets pushed up, and learning depends on the good ones being pushed up a bit harder than the bad ones.

The fix rests on a small fact. For any probability distribution, the expected gradient of its log-probability is zero:

$$
\begin{aligned}
\mathbb{E}_{y \sim \pi_\theta}\big[\nabla_\theta \log \pi_\theta(y)\big]
&= \nabla_\theta \textstyle\sum_y \pi_\theta(y) \\
&= \nabla_\theta 1 = 0
\end{aligned}
$$

The probabilities always add up to 1, and 1 doesn't change when $\theta$ changes. So the gradient is zero.

This means you can subtract any baseline $b(x)$ from the reward, as long as $b$ doesn't depend on the sampled response. The gradient stays unbiased, and its variance drops.

What's left, $A = R - b$, is called the advantage. It says how much better this response did than you expected. Positive means do more of that. Negative means do less.

The choice of baseline is the most useful way I know to sort these methods into families:

| Baseline $b(x)$ | Method |
| --- | --- |
| None | Vanilla REINFORCE |
| A learned value network $V_\phi$, combined via GAE | PPO |
| Mean reward of the other $G-1$ samples for the same prompt | RLOO |
| Reward of the greedy decode | ReMax |
| Group mean, then divide by group std | GRPO |
| Mean over the whole global batch | REINFORCE++ |

$G$ is the number of responses you sample for each prompt. RLOO stands for REINFORCE leave-one-out. ReMax uses the score of the model's greedy answer, the one where it always picks the most likely token, as the bar to beat. With no value model to hold, the ReMax paper reports about 46% less GPU memory than PPO for a 7B model.

The classic choice is a learned critic. A critic, also called a value network $V_\phi$, is a second model trained to predict how much reward to expect from a given state.

PPO combines the critic's guesses using generalised advantage estimation, or GAE. GAE mixes one-step errors $\delta_t = r_t + \gamma V_\phi(s_{t+1}) - V_\phi(s_t)$ with a decay $\lambda$.

Each $\delta_t$ is how much better the next step turned out than the critic predicted, and $\gamma$ is a discount. With $\lambda = 0$ you trust the critic completely. With $\lambda = 1$ you use the full Monte Carlo return minus the critic.

For an LLM, that critic is another network roughly the size of the policy. Keep that cost in mind, because it comes back with GRPO.

One trick from classic RL does nothing here, and that's reward-to-go. It gives each token credit only for rewards that come after it.

With a single reward at the end of the response, every token's reward-to-go is the final reward. It only starts to matter in multi-turn agent settings with rewards along the way.

## Reusing a batch with PPO

The next edit lets you reuse a batch. Sampling is expensive, and for LLMs it takes most of the wall-clock time. So you want several gradient steps per batch of rollouts.

After the first step, though, the samples come from the old policy. You correct for that with an importance ratio:

$$
\rho_t(\theta) = \frac{\pi_\theta(y_t \mid s_t)}{\pi_{\theta_{\mathrm{old}}}(y_t \mid s_t)}
$$

The ratio is the token's probability now, divided by its probability when it was sampled. It tells you how much the model has changed its mind about that token since then.

At $\theta = \theta_{\text{old}}$ the ratio is 1, and you get the plain policy gradient back. As the model moves away, ratios can get large, and a handful of tokens end up dominating the update.

PPO's answer is to clip. First, the clipped ratio is just $\rho_t$ forced to stay between $1-\epsilon$ and $1+\epsilon$:

$$
\bar\rho_t = \mathrm{clip}(\rho_t,\, 1-\epsilon,\, 1+\epsilon)
$$

Then PPO's objective takes the smaller of the clipped and unclipped terms:

$$
L^{\mathrm{CLIP}}(\theta) = \mathbb{E}_t\big[\min(\rho_t\hat A_t,\; \bar\rho_t\,\hat A_t)\big]
$$

Say $\epsilon = 0.2$ and the advantage is positive. Once a token's probability has risen 20% above the old policy, it gets no more gradient from this batch. With a negative advantage, the same happens once it has fallen 20% below.

The `min` makes this a pessimistic bound. The model gets no extra credit for moving a token too far in one batch.

This one equation, applied per token, is the core of everything that follows. Most of the 2025 papers are arguments about it.

RLHF adds one more term. It's a KL penalty to a frozen reference model:

$$
\max_{\pi_\theta}\; \mathbb{E}\big[ r(x,y) \big] - \beta\, \mathbb{D}_{KL}\big[ \pi_\theta \,\|\, \pi_{\mathrm{ref}} \big]
$$

KL divergence measures how far apart two distributions are. Here it measures how far the policy has drifted from the reference, which is usually the model you started from.

$\beta$ sets how tight that leash is. It stops the policy from wandering off into strange text that exploits the reward model.

In InstructGPT-style PPO, that KL is folded into the per-token reward.

Now add up the bill. You hold four large models in memory: the actor (the policy you're training), the reference, the reward model and the critic. Two of them also carry optimiser state. GRPO was built to cut this bill.

## GRPO and group baselines

GRPO, from the DeepSeekMath paper, keeps PPO's clipped ratio and throws away the critic. For each prompt it samples a group of $G$ responses and uses the group's own statistics as the baseline:

$$
\hat{A}_{i} = \frac{r_i - \mathrm{mean}(r)}{\mathrm{std}(r)}
$$

Here $r$ means all $G$ rewards in the group. So response $i$'s advantage is how far its reward sits above or below the group average, measured in standard deviations.

Every token in response $i$ shares that one advantage. The objective is PPO's, averaged per response and then over the group. The KL moves out of the reward and into the loss.

Papers write the prompt as $q$ and the $i$-th response as $o_i$, so I'll switch to that here. First, the term for token $t$ of response $i$:

$$
\ell_{i,t} = \min\big(\rho_{i,t}\hat{A}_{i},\; \bar\rho_{i,t}\hat{A}_{i}\big) - \beta\, \mathbb{D}_{KL}
$$

That's PPO's clipped term with the KL penalty subtracted. Then GRPO averages it:

$$
\mathcal{J}_{\mathrm{GRPO}} = \mathbb{E}\Big[ \frac{1}{G}\sum_{i=1}^{G} \frac{1}{|o_i|} \sum_{t=1}^{|o_i|} \ell_{i,t} \Big]
$$

$|o_i|$ is the length of response $i$ in tokens. So GRPO averages over the tokens inside each response first, then over the $G$ responses. Remember that $1/|o_i|$, because it causes trouble later.

The KL uses Schulman's "k3" estimator on the sampled token. With $d = \log \pi_{\mathrm{ref}} - \log \pi_\theta$, it is:

$$
\mathbb{D}_{KL} \approx e^{d} - d - 1
$$

It only needs the log-probability of the sampled token under both models. It's never negative, and it's unbiased, so on average it gives the right KL.

DeepSeekMath sampled 64 responses per question with a KL coefficient $\beta = 0.04$. R1-Zero later used $G = 16$ and $\beta = 0.001$.

The intuition is pleasant. Within a group, a response better than its siblings goes up, and a worse one goes down. There's no value network to train and no value-model bias.

Pair it with a programmatic checker, like an answer match or passing tests, and you have RLVR, which is RL with verifiable rewards. That's what DeepSeek-R1 scaled up. R1-Zero, trained this way straight from the base model, reached 77.9% pass@1 on AIME 2024, as reported in the paper.

GRPO is also the most connected paper in my reading notes. Ten later papers build on it or adopt it.

It also has a sharp edge: if every sample in a group is right, or every one is wrong, every advantage is zero and that prompt teaches nothing. Remember that one too.

### The loss in code

Here's the loss, adapted from my notes. The `mode` switch shows how few lines separate the methods.

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

The token tensors have shape (N, T), where N is the number of responses and T is the longest length. `mask` is 1 on real response tokens and 0 on padding. I'll come back to the `gspo` and `cispo` branches further down.

Two notes. Original GRPO normalises per sequence first (`per_tok.sum(1) / mask.sum(1)`, then the mean). The token-level mean on the last line is DAPO's change, which I'll get to.

Also, the advantages and old log-probs must be constants. Compute them under `torch.no_grad()` or detach them, or you'll be differentiating through your reward.

## Fixing GRPO

### Four failure modes

Run GRPO long enough on long outputs and four failure modes show up. Nearly every later method targets one of them.

The first is normalisation bias. The $1/|o_i|$ and the division by std skew the weights across lengths and difficulties.

The second is entropy collapse. Entropy measures how spread out the model's choices are. When it collapses, the policy turns deterministic early and stops exploring.

The third is token-level ratio noise. Per-token ratios are high variance. It gets worse with long sequences and with mixture-of-experts (MoE) routing, where each token is sent to a few of many expert sub-networks.

The fourth is train-inference mismatch. The sampler (vLLM, SGLang) and the trainer (FSDP, Megatron) compute slightly different probabilities for the same weights. So samples you think are on-policy are a little off-policy. MiniMax-M1 reports that computing the output head in FP32 raised the correlation between the two stacks' token probabilities from about 0.9 to 0.99.

### Dr. GRPO and the normalisers

The Dr. GRPO paper points out two biases hiding in the normalisers.

Dividing by $|o_i|$ means each token of a long wrong answer is penalised less than each token of a short one. That inflates the length of wrong answers.

Dividing by the std up-weights prompts with low reward variance. Those are the very easy prompts and the very hard ones.

Their fix is to delete both and divide by a constant, such as the max length. That recovers an unbiased policy gradient. Their minimal recipe on Qwen2.5-Math-7B, with 8 samples per prompt, reaches 43.3% on AIME 2024, as reported in the paper.

It also comes with a warning I now repeat to anyone who shows me a rising length curve. Length growth can come from the normaliser alone, with no extra reasoning behind it. Check accuracy inside length buckets before celebrating.

### The DAPO ablation

DAPO, from ByteDance Seed, is the most practical list of fixes I know, because it comes with an ablation. An ablation adds one piece at a time so you can see what each piece is worth.

Here it is on Qwen2.5-32B base, scored on AIME 2024, as reported in the paper:

| Configuration | AIME 2024 |
| --- | --- |
| Naive GRPO | 30 |
| + Overlong filtering | 36 |
| + Clip-Higher | 38 |
| + Soft overlong punishment | 41 |
| + Token-level loss | 42 |
| + Dynamic sampling (full DAPO) | 50 |

That's 30 to 50, a 20-point gain, or about 1.7x the naive score. Dynamic sampling alone adds 8 of those points. Each technique maps onto a term in the general form from earlier.

Clip-Higher changes the clip. It splits the bounds into $\varepsilon_{\text{low}} = 0.2$ and $\varepsilon_{\text{high}} = 0.28$.

With a symmetric 0.2, a rare token can only grow by a factor of 1.2 per batch, against 1.28 with Clip-Higher. The symmetric bound caps exploration of exactly the tokens you'd want to explore, and it speeds up entropy collapse.

Dynamic sampling fixes the zero-advantage groups from earlier. Drop prompts whose group accuracy is 0 or 1, and keep sampling until the batch is full of useful ones. DAPO fills each step with 512 prompts and 16 responses per prompt.

Token-level loss changes the normaliser to $1/\sum_i |o_i|$, one over the total number of tokens in the group. Long samples now carry weight in proportion to their length, and repetition in long outputs is penalised per token.

Overlong shaping fixes the reward. A response that hits the length cap gets cut off, so its reward is noisy. DAPO masks those truncated responses, then adds a soft length penalty in a 4,096-token buffer zone just before the hard cap.

DAPO also drops the KL term entirely. That's a big change from RLHF, where the KL term is what keeps the model close to the reference.

The reason is that a verifier is much harder to hack than a learned reward model. With a verifier, the leash matters less.

### Sequence ratios in GSPO

GSPO, from the Qwen team, goes after the ratio itself. They argue that GRPO's per-token ratios are an invalid use of importance sampling.

One sampled token can't correct a shift in a whole distribution. So the weights mostly add noise, and the noise piles up with length.

GSPO uses one ratio per response instead. It's the length-normalised sequence likelihood ratio:

$$
s_i(\theta) = \Big( \frac{\pi_\theta(y_i|x)}{\pi_{\theta_{\mathrm{old}}}(y_i|x)} \Big)^{1/|y_i|}
$$

That's the whole response's probability now over its old probability, raised to the power one over its length. Written with the token ratios from before, it's the same as:

$$
s_i(\theta) = \exp\Big( \frac{1}{|y_i|} \sum_{t} \log \rho_{i,t} \Big)
$$

So $s_i$ is the geometric mean of the token ratios. GSPO clips $s_i$ the same way PPO clips $\rho_t$.

Because it's a geometric mean, it barely moves. So the clip range is about two orders of magnitude narrower. The paper uses 3e-4 and 4e-4, against 0.2 and 0.27 for their GRPO baseline.

GSPO ends up clipping far more tokens than GRPO, with a clipped fraction about two orders of magnitude higher in the paper, and still trains more efficiently. That says something unflattering about how noisy GRPO's token-level gradients are.

The case is strongest for MoE models. After an RL update, roughly 10% of the experts activated for the same input change, which makes token ratios jump around.

People had been pinning expert choices to make up for this, a trick called "routing replay". The sequence likelihood is stable enough that GSPO can drop that workaround.

### Clipped weights in CISPO

MiniMax's CISPO spots a different problem with the PPO clip. When a token's ratio leaves the trust region, the `min` zeroes its gradient. The trust region is the band $1 \pm \epsilon$ where the update is allowed to act.

The tokens most likely to leave it are rare "forking" tokens like "However", "Wait" or "Recheck". They start with low probability, so they see large ratios.

Those are the tokens that make long reasoning happen. PPO-style clipping throws their gradient away.

CISPO keeps the gradient for every token. It clips the importance weight instead and wraps it in a stop-gradient, written $\mathrm{sg}$.

A stop-gradient means "use this value, and treat it as a constant when taking gradients". In the code above, that's the `.detach()`.

Let $N = \sum_i |o_i|$ be the total number of tokens in the group. Then:

$$
\mathcal{J}_{\mathrm{CISPO}} = \mathbb{E}\Big[ \frac{1}{N} \sum_{i,t} \mathrm{sg}\big(\mathrm{clip}(\rho_{i,t})\big)\, \hat{A}_{i,t}\, \log \pi_\theta(o_{i,t}) \Big]
$$

I left out the conditioning on $q$ and $o_{i,<t}$ to keep it short. Each token's log-probability is multiplied by its advantage and by a capped, frozen weight.

Now put that next to the REINFORCE surrogate near the top. It's REINFORCE with a truncated importance weight, the same family as IMPALA's V-trace. We went all the way round!

MiniMax reports roughly a 2x speedup over DAPO on Qwen2.5-32B. It matches DAPO's AIME 2024 score in about half the steps.

GSPO and CISPO are competing answers to the same problem, which is unstable token ratios, especially in MoE. GSPO moves the ratio to the sequence. CISPO stops letting the ratio decide whether a token gets a gradient.

### Entropy collapse

Entropy deserves its own post, but here's the short version. One analysis of RL for reasoning models finds that the change in entropy per step is driven by the covariance between a token's log-probability and its advantage.

In plain words, confident tokens with high advantage make the policy sharper. Rare tokens with high advantage make it wider.

Their empirical fit is $R = -a\,e^{\mathcal{H}} + b$, where $\mathcal{H}$ is entropy and $a$ and $b$ are fitted constants. Performance is bought with entropy, and you hit a ceiling when entropy runs out.

Their fixes, Clip-Cov and KL-Cov, act on the few tokens with outlier covariance. The top 0.02% of tokens have a covariance around 5.65, against a mean near 0.003.

On Qwen2.5-7B they report an average of 38.6 for GRPO, 40.4 for Clip-Cov and 40.6 for KL-Cov. Clip-Higher and CISPO are entropy fixes too, among other things. Both stop the clip from silencing rare tokens.

## The whole lineage

Here's the whole lineage in one table.

| Method | What it changes | Problem it fixes |
| --- | --- | --- |
| REINFORCE | Weight = raw return $R$ | Can't differentiate through sampling |
| Baseline / RLOO / ReMax | Weight = $R - b(x)$ | Variance; all-positive rewards push everything up |
| PPO | Adds ratio $\rho_t$, clip at $1 \pm \epsilon$, critic + GAE, KL to reference | Reusing a batch for several steps without blowing up |
| GRPO | Baseline = group mean / std; k3 KL in the loss | Critic costs a second policy-sized model |
| Dr. GRPO | Drops $1/\lvert o_i \rvert$ and std; constant normaliser | Length bias toward long wrong answers; difficulty bias |
| DAPO | Asymmetric clip, token-level normaliser, drop 0/1-accuracy groups, overlong shaping, no KL | Entropy collapse, zero-gradient groups, length weighting, truncation noise |
| GSPO | Ratio and clip at sequence level | Noisy token ratios, MoE routing churn |
| CISPO | Clips the weight with a stop-gradient, so every token keeps its gradient | Clipping kills gradients of rare forking tokens |

When a new paper comes out, I now read it as an edit to this one formula. I check four things: what the baseline is, whether there's a ratio, at what level it lives, and what happens when it gets clipped. That's usually the whole contribution.

One 2026 paper, GPPO, already frames DAPO and others as special cases of a divergence-based trust region. Its best variant is reported at up to 50% over GRPO on math. So the field has noticed the same thing.

## My default recipe

My default starting point is assembled from the recipes. No single paper uses exactly this:

- A group baseline with $G$ between 8 and 16. Dr. GRPO used 8, and DAPO and R1-Zero used 16.
- No std scaling, or at least question it.
- Token-level or constant normalisation.
- $\varepsilon_{\text{low}} = 0.2$ and $\varepsilon_{\text{high}} = 0.28$.
- No KL, or a tiny one, like R1-Zero's 0.001.
- Drop zero-variance groups, and mask truncated samples.
- Some fix for train-inference mismatch.
- For MoE, sequence-level ratios.

Recent TRL versions expose most of this as `loss_type` options (`dapo`, `dr_grpo`, `cispo`, `sapo`). That's a decent signal of which variants are considered mainstream.

For reference, here are the clip bounds the papers report:

| Method | $\varepsilon_{\text{low}}$ | $\varepsilon_{\text{high}}$ |
| --- | --- | --- |
| PPO, original GRPO | 0.2 | 0.2 |
| DAPO | 0.2 | 0.28 |
| Magistral | 0.2 | 0.26 to 0.28 |
| ProRL | 0.2 | 0.4 |
| GSPO (sequence ratio) | 3e-4 | 4e-4 |

### What to log and check

Log more than reward. Track entropy, length and clip fraction too. Clip fraction is the share of tokens that hit the clip in a step.

Entropy dropping sharply early is the first sign of trouble. Rising length doesn't prove anything on its own.

Run a random-reward control. The Spurious Rewards paper got Qwen2.5-Math-7B up 21.4 points on MATH-500 with random rewards, against 29.1 with real ones.

They traced it to a clipping bias in GRPO that amplifies behaviour the model already had. One such behaviour, writing Python-style reasoning without running it, rose from 65% to over 90% of responses. The effect didn't transfer to Llama or OLMo. If your gain survives a random-reward run and a non-Qwen base model, I'll believe it.

## The open question

There's one open question I keep coming back to. I want to know whether any of this teaches the model something new, or whether it only sharpens what the base model could already do at large $k$.

Here pass@k means the model gets $k$ tries and counts as right if any one of them is right. The pass@k evidence leans towards sharpening. RL models win at $k = 1$, but base models match or beat them at large $k$.

Prolonged-RL work argues otherwise. ProRL trained a 1.5B model for over 2,000 steps, about 16k GPU hours, and reports pass@k gains on tasks where the base model scores zero.

All of these methods share one estimator. So I think the answer is more likely to come from the data and the environments than from yet another change to the clip.
