---
title: "Lion"
short: "Inference engines"
description: "From-scratch CUDA inference engines for small models, behind one OpenAI-compatible API and web UI, on a 6 GB laptop GPU."
date: "2026-11-25"
repoURL: "https://github.com/logxdx/lion"
category: "LLM Inference · CUDA"
areas: []
tags: ["CUDA", "C++", "LLM inference", "Tensor cores", "OpenAI API", "Python"]
featured: false
---

Lion is a set of CUDA inference engines I wrote from scratch for small open models, tuned for a 6 GB laptop GPU. A small gateway puts them all behind one OpenAI-compatible API and one chat web UI.

There are two engines. liquid-engine runs Liquid AI's LFM3-1.7B for text, LFM3-VL-2B for images and video, and d1-2B for yes/no, multiple-choice and score questions. raon-engine runs KRAFTON's Raon-1 nano. Neither uses ggml, llama.cpp or cuBLAS at runtime. The GGUF loader, tokenizer, kernels, sampler and server are my own code, and the only dependency is the CUDA runtime.

The gateway, hop, is a Python server. It starts the engine that a request's model needs, waits for its health check, streams the reply through, and stops the engine after 10 minutes idle. Only one engine holds the GPU at a time, so a swap waits for the request in flight to finish.

Decode is limited by memory bandwidth. The weights stay in their Q8_0 or Q6_K form, repacked for fused GEMV kernels that reach about 96% of DRAM bandwidth, and each decode step replays a CUDA graph. Several conversations decode together and read the weights once per step. Prefill GEMMs run on int8 tensor cores, and in raon-engine the attention's P·V product runs on FP8 tensor cores, measured at 97.6 TFLOPS against 48.8 for f16 on this GPU.

Raon-1 nano is the harder model. It mixes absorbed multi-head latent attention, a recurrent delta-rule layer, a 4-stream residual mix (mHC) and per-layer embeddings. I keep the latent KV cache in int8 with one scale per row, 584 bytes per token, and the 1.3 to 1.7 GB per-layer embedding table stays in pinned host memory, read one row per token. With both, 6 conversations at 150k tokens each fit on the card.

Decode at 150k tokens of context, Q8_0, tokens per second per stream:

| Streams | Lion | llama.cpp |
|---|---|---|
| 2 | 70.0 | 24.6 |
| 3 | 58.7 | 15.4 |
| 4 | 50.7 | 12.0 |
| 6 | 38.0 | does not fit |

A 150k-token prompt prefills in 56.9 s (2,697 tok/s). llama.cpp takes about 235 s for the same prompt, so that is more than FOUR times faster!

On liquid-engine, LFM3-1.7B decodes at 120.8 tok/s with Q8_0 weights, against llama.cpp's 110.6. With four streams at 100k context each it produces 196.1 tok/s in total, 37% more than llama.cpp's 142.8. Its own vision encoder handles a 640x480 photo in about 20 ms, and the text and vision models swap in about 0.4 s.

The servers support streaming, tool calls, reasoning, prompt reuse across turns, and a prompt cache in RAM and on disk. In raon-server the next turn of a 9.8k-token conversation reused 9,898 of 9,915 prompt tokens and prefilled in 31 ms. The web UI is llama.cpp's chat UI, rebranded, with web search, web fetch and PDF reading as server tools.

I checked each layer against llama.cpp. The tokenizer matches on 337 of 337 cases, the chat template is byte-identical on 16 of 16, and the sampler picks the same token on 289 of 289. In greedy decoding the Q6_K model matches 181 of 181 tokens.
