---
title: "Making niri agent-drivable on a 6 GB laptop GPU"
description: "I planned a cua fork and a CPU/GPU model split. What I built: three small Liquid models on one GPU, AT-SPI, niri IPC, and an input calibration."
date: "2026-09-14"
updated: "2026-11-15"
draft: true
areas: [agents]
tags: ["niri", "Wayland", "AT-SPI", "LFM3", "llama.cpp", "Computer use"]
experiment: true
---

I wanted an agent that can drive my actual desktop: niri, a scrolling Wayland compositor, on a laptop with a 6 GB GPU. Not a cloud VM, not a sandbox. The machine I work on.

In September I probed the session and wrote a plan: three tiers, a grounding VLM on the GPU, a sparse-MoE planner on the CPU, and a fork of cua with a small niri shim. In November I built it, as **pi-operator**, a package of extensions for the [pi](https://pi.dev) agent harness. The ideas mostly survived. The specifics mostly didn't. This post is what actually runs, and where the plan was wrong.

## The probe still holds

Before choosing anything I checked what the live session exposes: the Wayland globals in the niri binary, the AT-SPI bus, and `niri msg --json`.

| Capability | Status |
|---|---|
| Screen capture | `grim` over wlr-screencopy works. |
| Pointer and keyboard injection | Virtual pointer and virtual keyboard protocols are there. |
| Window list, focus, per-window screenshot | `niri msg --json windows`, `focus-window`, `screenshot-window`. |
| AT-SPI on native GTK/Qt apps | Fully introspectable. |
| AT-SPI on Chromium / Electron | Only with `--force-renderer-accessibility`. |
| AT-SPI on kitty | None. GPU-rendered terminal. |
| Portals, libei, `ext-image-copy-capture` | Dead ends on niri. |

The conclusion was right: every actuation primitive exists, and what's patchy is *meaning*. The accessibility tree covers native toolkit apps and little else unless you intervene.

## Pixels are the last resort

The default computer-use loop is screenshot → VLM → click coordinates. On a 6 GB laptop that's the most expensive way to answer most questions, with the worst failure mode: a wrong coordinate is a silent misclick.

So the agent tries three channels in order: **machine** (shell, app CLIs), **semantic** (AT-SPI roles, names and actions), **pixel** (only when the first two come up empty). In the build this became four tool groups the planner can be given:

| Group | What it drives | How |
|---|---|---|
| shell | files, processes, settings | pi's own `bash`, behind a risk check |
| desktop | native apps and windows | [agent-desktop](https://www.npmjs.com/package/agent-desktop) over AT-SPI, plus a `desktop_niri` tool for workspaces, focus, layout |
| browser | web pages | a browser extension in my real browser, or a headless Chrome |
| screen | anything else | screenshot → vision model → calibrated pointer |

A semantic action through AT-SPI takes 25–70 ms and a snapshot of a window is about 130 tokens of text. A `screen_point` (capture, locate, zoom, locate again) takes about a second. That gap is the whole argument for the ordering.

Two cheap fixes from the plan are now automatic. `desktop_launch` starts Chromium and Electron apps with the accessibility flags set, which moves a lot of work from the pixel channel to the semantic one. And the terminal is never driven through pixels; the agent gets a shell.

## Three small models, all on the GPU

The plan was Qwen3-VL-4B grounding on the GPU and Ling 3.0 Tiny (7.9B total, 1.3B active) planning on the CPU, because the two together didn't fit in 6 GB. That plan didn't survive contact with the Liquid LFM3 family, which landed at the end of October. Three models from it fit on the GPU at once, so the CPU/GPU split stopped being necessary.

They sit behind one `llama-server` in router mode, so there is one process, one port, and no model swapping between "look" and "think":

| Role | Model | Quant | Context | Measured |
|---|---|---|---|---|
| Planner | LFM3-1.7B | Q6_K | 64K | first tool call in 1.24 s |
| Eyes | LFM3-VL-2B | Q4_K_M + Q8_0 projector | 4K | 29/29 targets, 1 px median error, ~0.46 s |
| Judge / router | d1-2B decision model | Q4_K_M + Q8_0 projector | 4K | 28 ms per routing decision |

```text
llama-server --models-preset presets.ini --models-max 3
  [op-planner]  LFM3-1.7B    pi's chat model; text in, one tool call out
  [op-eyes]     LFM3-VL-2B   "where is X?" -> box in 0-1000 space
  [op-judge]    d1-2B        one-forward-pass choices: route, check, verify
```

All three loaded: **5,341 of 6,141 MiB**. The planner is Q6_K rather than Q8_0 for a specific reason. With a 64K Q8_0 planner, the judge's vision encoder fell off the GPU onto the CPU and every check took about 1.1 s. Q6_K buys back enough room that both encoders stay on the GPU.

The VRAM rule from the plan still holds: vision tokens cost more than weights. The eyes never see more than 1,024 px on the long side, and the judge looks at 640 px. When the capture is much larger than 1,024 px, a second pass crops around the first hit at native resolution and locates again. On real 1080p screens that took locate from 1/5 targets (72 px median error) to 4/5 (29 px), for about twice the latency.

Day to day I've since moved the planner to a fast cloud model, with the eyes and the judge still local. Everything measured below was run with the local 1.7B planner.

## The model I didn't plan for

The plan had a planner and a grounder. The build needed a third model, and it's the one I'd keep if I could only keep one: a small decision model that answers a multiple-choice question in a single forward pass.

It does two jobs.

**Routing.** Before the planner's first request, d1 picks which tool group the task needs: real browser, headless browser, desktop, screen, or none. Only that group's tools and its skill notes go into the prompt. On 38 held-out tasks:

| Router | Exact | Missing group | Latency |
|---|---|---|---|
| d1, top-1 choice | 31/38 | 4 | 28 ms |
| my keyword rules | 21/38 | 15 | ~0 |

My keyword rules were written while looking at the dev set and were visibly overfit (57/65 on the dev set). They're gone now. Using the 1.7B planner as a classifier through its log-probabilities failed outright. One threshold mattered. Touching my own browser needs a confidence of at least 0.6, because d1 read "Log in to <site>" as "use the user's browser" at 0.47.

**Checking.** After an action, d1 looks at a small screenshot and says what state the screen is in (16/16 fixtures, 21/21 real shots, 69 ms median). An optional finish gate asks it whether the task is complete and whether the claimed answer is supported by what was last read. That second question exists because an earlier gate only checked completeness, and the planner happily completed tasks with wrong answers.

## Driving niri without forking cua

The plan's centrepiece was a fork of cua: its Linux driver already speaks every protocol niri has, and it fails on niri only because it can't get compositor-attested window geometry. I'd write the niri equivalent of its Sway shim and upstream it.

I didn't fork anything. The build is TypeScript inside pi, and every desktop action is a one-shot subprocess:

- **Semantic channel:** agent-desktop, a CLI over AT-SPI. It does snapshots, finds and actions, but on Wayland it can't focus, close or screenshot a window.
- **Windows:** `niri msg -j` for windows, workspaces, outputs and actions. That fills exactly agent-desktop's gaps.
- **Pixels:** `grim` on the focused output; `niri msg action screenshot-window` for one window.
- **Input:** `ydotool` for the mouse and `wtype` for keys and text.

The glue was full of small surprises:

- **Matching windows by title, not pid.** XWayland apps report the pid of the XWayland bridge, so agent-desktop's pid and niri's pid don't agree.
- **`screenshot-window` also copies to the clipboard.** The tool saves and restores the clipboard around every window screenshot.
- **Windows with no accessibility tree** are listed as such, with a hint to use the screen tools, so the planner doesn't keep asking for a tree that will never come.
- **Focus stealing**, which I predicted, is handled by parking the agent's own windows on a niri workspace named `operator` and handing focus back to whatever I was using.

The one gap from the plan is still open: niri doesn't expose a window's global position in its scrolling layout. Where a click must land inside a specific window, the code estimates the point from the tile position and output origin, then checks it with the eyes before trusting it.

## The coordinate bug I predicted, and the one I got

I was sure the first bug would be fractional scaling: a 1.25-scale panel, physical-pixel screenshots, logical-coordinate pointer, and every click about 20% off. I wrote the transform up front and it's in the code: divide by the capture-to-logical ratio, add the output's logical origin.

It hasn't been tested at a fractional scale. The display that the screen tools run on is now at scale 1.

The bug I actually hit was also almost exactly 20%. `ydotool mousemove --absolute` doesn't really move absolutely. It moves relatively from the corner, so pointer acceleration applies. My niri input config had a flat acceleration profile at speed 0.2, which multiplied every move by 1.2.

The fix is a calibration script. It opens a fullscreen window and moves to a grid of points. It then fits `landed = scale × requested + offset` per axis and saves the fit only if held-out points improve:

| | Points | Max error | Median error |
|---|---|---|---|
| Before calibration | 15 | 312 px | 193 px |
| After, held-out | 6 | 0 px | 0 px |

The fitted scale came out at 1.2003 on x and 1.1998 on y. The first attempt fitted badly (112 px) and looked like non-linearity. It wasn't. The grid points at 90% of the screen had been clamped at the screen edge. Dropping clamped samples and refining in a second pass fixed it. The calibration I run ends with a click test on three buttons, so a bad fit fails loudly instead of misclicking later.

## Safety is a tripwire, not a sandbox

Any Wayland client can already record the screen and inject input, so the agent adds no new attack surface against the compositor. What it adds is consequences: "the model said so" becomes real keystrokes. So every acting tool goes through a gate:

- Each action is assessed from facts: the field type, label, form method, app, shell command. The verdict is allow, ask or block. Typing into password, OTP and card fields is blocked. Buy, send, delete, submit, closing windows and risky shell commands (`sudo`, `rm`, installs, `git push`) ask first.
- One "no" per task. After I decline a risky step, the agent can't rephrase it or ask about the next one; it stops and reports what's left for me to do.
- Page and screen text reaches the planner fenced as untrusted. In the hard evals a planted prompt injection was ignored 3/3, and the gate stopped "Delete account" 3/3.
- A global stop (a key bound in niri) aborts the turn and kills in-flight input in about 7 ms.
- The "point, don't click" mode I wanted in the plan exists. An overlay ring shows where the agent would act. With real input off, it only points.

## The browser is my browser

The plan treated the browser as one more AT-SPI app. In practice web work goes through a browser extension in my real browser, with no remote-debugging port and no `chrome.debugger`. The page sees `navigator.webdriver === false` and no automation banner. The extension handles frames, closed shadow roots, ARIA widgets, uploads, and "trusted" real-mouse clicks for pages that ignore synthetic events.

The agent's tabs open in their own unfocused window on the `operator` workspace. It touches my own tabs only when the task is about them, and on exit it closes only what it opened. For URL tasks and evals there is also a headless Chrome backend.

There's a voice front end too: wake word, push-to-talk on a spare key, spoken approvals, CPU-only speech models. It deserves its own post.

## How well it works

All of these used the local LFM3-1.7B planner:

| Eval | Result |
|---|---|
| End-to-end tasks (login, cart, settings, contact, modal, canvas, desktop, guard, screen read) | 23/23 runs, 1–10 tool calls, 3–38 s each |
| Hard evals: 17 tasks × 3 runs (a local test site, mixed browser + desktop, the gate, Wikipedia, GitHub, Hacker News) | 45/51 at first, 47/51 after fixes |
| Real browser: "find the cheapest USB-C cable" | correct in 5 tool calls (21 before a fix) |

The failures were mundane: a wizard `<select>` that silently didn't change, async dropdowns, stale element references, and the finish gate that checked completeness instead of truth. All four are fixed.

## What the plan got wrong

- **The model split.** I designed around the assumption that a planner and a grounder couldn't share 6 GB. A month later, one family shipped three models that do. Design around roles, not models; the models change faster than the architecture.
- **The missing role.** I planned "think" and "look" and forgot "decide". A 28 ms judge that routes, checks and verifies did more for reliability than any upgrade to the planner would have.
- **The driver.** Forking cua was the elegant answer. Gluing agent-desktop, `niri msg`, `grim`, `ydotool` and `wtype` was the working answer, in days, and none of it needs a Rust fork I'd have to carry.
- **The bug I'd bet on.** I'd have lost the bet. Write the scaling transform anyway, but calibrate the input path before trusting any coordinate. Measure where clicks land instead of computing where they should.

Open questions:

- Fractional scaling and real clicks into other apps are still unverified on this machine.
- How far does a 1.7B planner go? Far enough for 47/51 on my hard set, and it needed code fixes for wizards and async widgets. I haven't re-run the evals with the cloud planner I now use day to day, so I can't say yet what it buys.
- Should niri expose window positions over IPC? It would remove the last estimate in the click path.
