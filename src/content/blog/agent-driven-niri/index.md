---
title: "Making niri agent-drivable on a 6 GB laptop GPU"
short: "Agent-driven niri"
description: "How I built pi-operator, which lets an agent drive my niri desktop with three small local models on a 6 GB laptop GPU."
date: "2026-09-14"
updated: "2026-11-15"
draft: true
areas: [agents]
tags: ["niri", "Wayland", "AT-SPI", "LFM3", "llama.cpp", "Computer use"]
experiment: true
---

I wanted an agent that could drive my real desktop, on the machine I actually work on. That's niri, a scrolling Wayland compositor, on a laptop with a 6 GB GPU. I wrote a plan in September and built it in November as pi-operator, a package of extensions for the [pi](https://pi.dev) agent harness.

My plan had the planner on the CPU and a vision model on the GPU, because I didn't think both would fit in 6 GB. Then Liquid released the LFM3 family at the end of October, and I could fit three small models on the GPU at once. The planner is LFM3-1.7B, the eyes are LFM3-VL-2B, and the third is d1-2B, a small decision model. With all three loaded the GPU uses 5,341 of 6,141 MiB, and I was really happy to see that number!

| Role | Model | Quant | Context | Measured |
|---|---|---|---|---|
| Planner | LFM3-1.7B | Q6_K | 64K | first tool call in 1.24 s |
| Eyes | LFM3-VL-2B | Q4_K_M + Q8_0 projector | 4K | 29/29 targets, 1 px median error, ~0.46 s |
| Judge | d1-2B | Q4_K_M + Q8_0 projector | 4K | 28 ms per routing decision |

I hadn't planned for d1 at all. You give it a question with a few options and it picks one in a single pass. Before the planner starts, it picks which group of tools the task needs, and on 38 held-out tasks it got 31 right in 28 ms, while my old keyword rules got 21.

| Router | Exact | Missing group | Latency |
|---|---|---|---|
| d1, top-1 choice | 31/38 | 4 | 28 ms |
| my keyword rules | 21/38 | 15 | ~0 |

For the desktop itself I didn't fork anything. agent-desktop reads apps through the accessibility tree, and niri msg handles windows, workspaces and focus. grim takes screenshots, ydotool moves the mouse and wtype types.

The part I remember most is the coordinate bug. I was sure my first bug would be fractional scaling, with every click about 20% off, so I wrote the scaling code up front. The bug I actually hit was ALSO almost exactly 20%, and I was SURE it was the scaling! It was ydotool. Its absolute mouse move really moves relative to the corner of the screen, so pointer acceleration applies. My niri config had a flat acceleration profile at speed 0.2, which multiplied every move by 1.2.

So I wrote a calibration script. It opens a fullscreen window, moves the pointer to a grid of points and records where each one lands. Then it fits a scale and offset per axis and keeps the fit only if held-out points get better. Before calibration the worst miss was 312 px. After, on 6 held-out points, it was 0 px. The fitted scale came out at 1.2003 on x and 1.1998 on y.

| | Points | Max error | Median error |
|---|---|---|---|
| Before calibration | 15 | 312 px | 193 px |
| After, held-out | 6 | 0 px | 0 px |

For safety, every action goes through a gate that blocks typing into password and card fields and asks me before anything like buying, deleting, sending or a risky shell command. If I say no once, the agent stops and tells me what's left for me to do.

With the local 1.7B planner, it passed 23 of 23 end-to-end runs, and 47 of 51 on a harder set of tasks after some fixes.

A few things are still open. Fractional scaling and real clicks into other apps haven't been tested on this machine. I use a cloud planner day to day now, but I haven't re-run the evals with it yet. And it would help if niri exposed window positions over IPC, because right now the code has to estimate where a window sits before clicking inside it.
