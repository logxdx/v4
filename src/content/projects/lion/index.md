---
title: "Lion"
short: "Inference engines"
description: "From-scratch CUDA inference engines for small models, behind one OpenAI-compatible API and web UI, on a 6 GB laptop GPU."
date: "2026-11-25"
repoURL: "https://github.com/logxdx/lion"
category: "LLM Inference · CUDA"
areas: [systems]
tags: ["CUDA", "C++", "LLM inference", "Tensor cores", "OpenAI API", "Python"]
featured: false
---

Lion is a set of CUDA inference engines I wrote from scratch for small open models, tuned for a 6 GB laptop GPU. A small gateway puts them all behind one OpenAI-compatible API and one chat web UI.

## Engines and gateway

There are two engines. liquid-engine runs Liquid AI's LFM3-1.7B for text, LFM3-VL-2B for images and video, and d1-2B for yes/no, multiple-choice and score questions. raon-engine runs KRAFTON's Raon-1 nano.

Neither uses ggml, llama.cpp or cuBLAS at runtime. The GGUF loader, tokenizer, kernels, sampler and server are my own code, and the only dependency is the CUDA runtime.

The gateway, hop, is a Python server. It starts the engine that a request's model needs, waits for its health check, streams the reply through, and stops the engine after 10 minutes idle. Only one engine holds the GPU at a time, so a swap waits for the request in flight to finish.

## Kernels

Decode is limited by memory bandwidth. The weights stay in their Q8_0 or Q6_K form, repacked for fused GEMV kernels that reach about 96% of DRAM bandwidth, and each decode step replays a CUDA graph. Several conversations decode together and read the weights once per step.

Prefill GEMMs run on int8 tensor cores. In raon-engine the attention's P·V product runs on FP8 tensor cores, measured at 97.6 TFLOPS against 48.8 for f16 on this GPU, twice the rate. With FP8 P·V and an int8 expansion of the latent keys, a 150k-token Q8_0 prefill went from 67.8 s to 56.9 s.

## Raon-1 nano

Raon-1 nano is the harder model. It mixes absorbed multi-head latent attention, a recurrent delta-rule layer, a 4-stream residual mix (mHC) and per-layer embeddings.

I keep the latent KV cache in int8 with one scale per row, 584 bytes per token against 612 in llama.cpp's q8_0 layout. The 1.3 to 1.7 GB per-layer embedding table stays in pinned host memory, read one row per token. With both, 6 conversations at 150k tokens each fit on the card.

Decode at 150k tokens of context, Q8_0, tokens per second per stream:

| Streams | Lion | llama.cpp | Speedup |
|---|---|---|---|
| 2 | 70.0 | 24.6 | 2.8x |
| 3 | 58.7 | 15.4 | 3.8x |
| 4 | 50.7 | 12.0 | 4.2x |
| 6 | 38.0 | does not fit | |

A 150k-token prompt prefills in 56.9 s (2,697 tok/s). llama.cpp takes about 235 s (about 640 tok/s) for the same prompt, so that is more than FOUR times faster!

## LFM3 on liquid-engine

LFM3-1.7B against llama.cpp on the same GPU and GGUF files:

| Test | Lion | llama.cpp | Speedup |
|---|---|---|---|
| Decode, 1 stream, Q8_0 | 120.8 tok/s | 110.6 tok/s | 1.09x |
| Decode, 1 stream, Q6_K | 153.9 tok/s | 138.0 tok/s | 1.12x |
| Prefill, 512 tokens, Q8_0 | 11,068 tok/s | 8,809 tok/s | 1.26x |
| Decode, 4 streams at 100k each, total | 196.1 tok/s | 142.8 tok/s | 1.37x |
| Encode a 640x480 photo | 23 ms | 95 ms | 4.1x |

The vision encoder is my own CUDA code. The text and vision models swap in a median 383 ms to the text model and 425 ms to the vision model, and a second question about the same image answers in 0.27 s instead of 1.71 s.

## Servers and web UI

The servers support streaming, tool calls, reasoning, prompt reuse across turns, and a prompt cache in RAM and on disk. In raon-server the next turn of a 9.8k-token conversation reused 9,898 of 9,915 prompt tokens and prefilled in 31 ms.

In liquid-engine a 48k-token conversation takes 6,382 ms to prefill cold, 26 ms to restore from RAM, and 82 ms to restore from disk after a restart.

The web UI is llama.cpp's chat UI, rebranded, with web search, web fetch and PDF reading as server tools.

## Checks against llama.cpp

I checked each layer against llama.cpp. The tokenizer matches on 337 of 337 cases and tokenizes a 137k-token prompt in 68 ms. The chat template is byte-identical on 16 of 16, and the sampler picks the same token on 289 of 289.

In greedy decoding the Q6_K model matches 181 of 181 tokens.
