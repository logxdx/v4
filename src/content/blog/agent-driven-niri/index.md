---
title: "Making niri agent-drivable on a 6 GB laptop GPU"
description: "Probing a scrolling Wayland compositor for agent control: machine, semantic and pixel channels, a VRAM budget, and the one shim cua is missing."
date: "2026-11-15"
draft: true
areas: [agents]
tags: ["niri", "Wayland", "AT-SPI", "cua", "llama.cpp", "Computer use"]
experiment: true
---

I wanted an agent that can drive my actual desktop: niri, a scrolling Wayland compositor, on a laptop with a 6 GB GPU and 15 GiB of RAM. Not a cloud VM, not a sandbox. The machine I work on.

The obvious assumption is that VRAM is the hard part. It isn't. The hard part is that niri sits outside what most computer-use projects support, and that a lot of my apps have no accessibility tree. The models turned out to be the easier decision. This post is the probe, the architecture I landed on, and the plan. It's an experiment in progress, not a finished system.

## Probe first, then design

Before choosing anything I checked what the live session actually exposes: the Wayland globals in the niri binary, the AT-SPI bus, and `niri msg --json`. Documentation for this stuff is often wrong, and in one case below it was.

| Capability | Status | What it means |
|---|---|---|
| Screen capture | works | `zwlr_screencopy_manager_v1` is there. `grim` works. |
| Mouse injection | works | `zwlr_virtual_pointer_manager_v1`. No root, no uinput, no `ydotoold`. |
| Key injection | works | `zwp_virtual_keyboard_manager_v1`. |
| Unicode text entry | works | `zwp_input_method_manager_v2` with `commit_string`. Layout-independent, better than typing scancodes. |
| Window list + geometry | works | `niri msg --json windows`: id, title, app_id, pid, workspace, focus, tile size. |
| Window activation | works | `niri msg action focus-window --id N`. |
| AT-SPI, GTK4 app | works | Native GTK/Qt apps are fully introspectable. |
| AT-SPI, Chromium browser | absent | Only exposed with `--force-renderer-accessibility`. Fixable with a flag. |
| AT-SPI, kitty | absent | GPU-rendered terminal, no a11y at all. |
| Portal screenshot | dead end | No installed portal backs niri. |
| libei / EIS | unsupported | niri has no `ei_*` symbols. |
| `ext-image-copy-capture` | absent | Not in the binary, despite at least one project's docs saying otherwise. |

So the actuation primitives are all there. Capture, pointer, keyboard, text, window list. What's patchy is *meaning*: the a11y tree covers native toolkit apps and nothing else unless I intervene.

## Pixels are the last resort, not the default

The default mental model for a computer-use agent is screenshot → VLM → click coordinates. On a 6 GB laptop that's the most expensive way to answer most questions, and it has the worst failure mode. A wrong coordinate is a silent misclick. Nothing raises an exception; the agent just clicks the wrong thing and carries on.

There are three channels, and I want them tried in this order:

1. **Machine.** Shell, D-Bus, systemd, the filesystem, an app's own CLI or API. Renaming files, launching apps, toggling settings, reading state. None of this should touch a pixel. If a daemon already exposes a D-Bus interface, the agent calls that instead of clicking through its settings window.
2. **Semantic.** AT-SPI gives role, name and bounds for native toolkit widgets. When an element is in the tree you get an exact rectangle, and you can often fire its action directly with `perform_action` instead of synthesising a click. That's deterministic, and it's roughly 200 tokens of text against roughly 2,600 vision tokens for a full 1080p screenshot.
3. **Pixel.** Only when the first two come up empty: canvas apps, games, Electron with a11y off, image content.

The point of the ordering is what it does to the model problem. In channels 1 and 2 the model is doing text reasoning over structured state, which a small text model handles fine. You only pay for a VLM on the steps that actually need eyes.

Two cheap fixes fall out of this. Start the browser with `--force-renderer-accessibility=complete` and a large chunk of my day moves from channel 3 to channel 2. And don't drive the terminal through pixels at all. OCR on a terminal is slow and lossy; give the agent a real PTY tool.

## Three tiers

I'd build this strictly bottom-up. Each tier is useful without the ones above it.

```text
tier 2  planner      text in, one tool call out      CPU or cloud
tier 1  grounder     "where is X in this image?"     GPU, ~3 GiB
tier 0  actuation    one Wayland connection, MCP     no model, 0 MiB
```

**Tier 0: the actuation daemon.** A long-lived process holding one Wayland connection and exposing a local MCP surface: `windows()`, `focus(id)`, `screenshot(output|window)`, `a11y_tree(pid)`, `click`, `move`, `scroll`, `key`, `text`, `action(element, verb)`. It's the only thing that touches the compositor and it has no model in it. Fully deterministic. One detail matters more than it looks: keep the virtual pointer and keyboard objects open across calls. Creating a new virtual pointer per click is slow and racy.

**Tier 1: grounding.** A small VLM that answers exactly one question: where is X in this image. No planning, no multi-turn, no tools. Stateless, called like a function. This is the one model that really wants the GPU. Vision encoders are compute-bound, so a CPU fallback hurts.

**Tier 2: planning.** Text in, text out, over the a11y tree, window list, task history and tool results. Emits one tool call at a time. This is where a sparse MoE earns its place. Ling 3.0 Tiny is 7.9B total with 1.3B active parameters. Decode is memory-bandwidth-bound on active weights, so at Q4 you read roughly 0.7 GB per token instead of 4.4 GB. That's the rare model that runs respectably on a laptop CPU, and it's the whole reason the split works. It also has no vision encoder, so it couldn't do tier 1 anyway.

## The VRAM budget

The card has 6,141 MiB. The compositor and a browser take some of that, so I budget about 5.4 GiB as usable. Three configurations, with weights from published GGUF sizes and KV/vision estimates assuming a 1280×720 screenshot and an 8K text window:

| Component (MiB) | A: grounder GPU, planner CPU | B: grounder GPU, planner cloud | C: both on GPU |
|---|---|---|---|
| VLM weights (Q4_K_M) | Qwen3-VL-4B: 2,516 | Holo1.5-3B: ~2,000 | Qwen3-VL-4B: 2,516 |
| Vision projector (Q8) | 454 | ~450 | 454 |
| KV + vision tokens | ~900 | ~850 | — |
| Planner weights | in system RAM | remote | Ling 3.0 Tiny: ~4,400 |
| **Total** | **≈ 3,870** | **≈ 3,300** | **≈ 7,370** |
| Fits? | yes, ~2 GiB headroom | yes | no, over by ~1.2 GiB |

C is the configuration everyone reaches for first, and the usual workaround is swapping models with something like llama-swap. That adds 2–5 seconds of load time to every switch between "look" and "think", which is every agent step. A exists to avoid exactly that: both models stay resident, no cold starts.

The hidden cost is vision tokens, not weights. A full 1920×1080 screenshot is about 2,600 vision tokens in a Qwen-family VLM, and it dominates both KV and latency. It gets worse on a 1440p external. Downscale to around 1280×720, or better, crop to the target window using geometry niri already gave you. Cropping is free accuracy: fewer distractors and more effective resolution where it matters.

## The model shortlist

| Model | Size @ Q4 | Role | Verdict |
|---|---|---|---|
| Qwen3-VL-4B | 2.5 GB + 0.45 | Grounder | Start here. Official GGUF and mmproj, works in `llama-server` today, Apache 2.0, and it can also read documents on screen. |
| Holo1.5-3B | ~2.0 GB | Grounder | Best grounding per GB: ScreenSpot-Pro 51.5, above OmniParser v2 (39.6) and UI-TARS-72B (38.1). No official GGUF, and it's under a research license. |
| OpenCUA-7B | ~4.5 GB | Grounder + planner | MIT, so the licensing escape hatch. But it grounds *and* plans, which collapses tiers 1 and 2 and kills the CPU/GPU split. |
| Ling 3.0 Tiny | ~4.4 GB | Planner | 1.3B active, runs in llama.cpp. On CPU. Its agentic benchmark score is low, so fine for single-step tool selection, weak on long chains. |
| Qwen3-VL-8B | ~5.0 GB + 0.45 | Grounder | Too tight. Under 700 MiB left for everything else; one more browser tab and it OOMs. |
| OmniParser v2 | ~1.5 GB | Screen parser | Not a VLM: an icon detector plus captioner that emits an element list. Useful as a fallback element source where AT-SPI is blind. Second runtime (Torch). |
| UI-TARS-7B | ~4.5 GB | End-to-end agent | Elegant, but no split possible and nothing else fits beside it. Grounding below Holo1.5-3B at twice the size. |
| Moondream 3.1 | — | Grounder | Architecturally ideal (MoE with native point/detect), but no llama.cpp support and Torch inference was measured around 19 GB. Not yet. |

ScreenSpot-Pro is the benchmark I care about here: high-resolution professional software, which is closer to real desktop use than web screenshots. All benchmark numbers are as published by the model authors and the leaderboard; I haven't reproduced them.

## Don't write the driver: fork cua

I looked at the computer-use projects I'd bookmarked. One is macOS-only and never actually clicks; it animates a cursor to *point*. One is an agent host with no native computer control. And cua has an open issue saying niri capture works but every input action is refused.

That issue made cua look like a non-starter. Reading the driver source instead of the issue tracker changed my mind. Its Linux driver is a self-contained Rust crate, and the Wayland layer is generic wlroots code, not per-compositor code: a persistent `ZwlrVirtualPointerV1` for input, wlr-screencopy for capture, a full AT-SPI integration. Every protocol it uses is in niri's registry. The actuation layer needs no new code.

What fails is one function. When cua wants to act on a window, it asks for compositor-attested geometry. It tries Sway's IPC, then a GNOME helper, and if neither answers it returns `surface_identity_unproven`. That refusal is deliberate. An off-workspace XWayland window keeps its X11 geometry and AT-SPI bounds while the screen actually shows another app's pixels, so cua would rather refuse than click blind. I agree with that design. On niri both sources return nothing, so per-window capture comes back 0×0, the element tree collapses to one node, and input is refused. That's the whole bug.

The Sway shim is small: it shells out to the compositor's IPC and returns `{id, pid, title, app_id, x, y, width, height, visible, focused}`. `niri msg --json windows` has nearly all of that. The plan is a sibling niri module:

- **Use the `niri-ipc` crate, not a subprocess.** niri publishes a typed Rust crate speaking its socket protocol, with an event stream (`WindowsChanged`, `WorkspacesChanged`). Hold a live cache instead of re-polling on every tool call.
- **Visibility proof: `active_window_id`, not tile position.** My first idea was to treat a non-null `tile_pos_in_workspace_view` as "visible". I probed it and it's `null` even for the focused window, and the crate docs say it may change. Don't build on it. The reliable check is in the workspace reply.
- **Let the compositor do window capture.** `niri msg action screenshot-window --id <ID>` decides which pixels belong to the window. That's a stronger attestation than any rectangle I could compute, and it's exactly what `surface_identity_unproven` is asking for.
- **Put sway and niri behind one façade.** The Sway IPC module is referenced from about 20 call sites. A small "try sway, then niri" layer is less churn and more likely to be mergeable than editing every arm.
- **Fix the docs.** A couple of comments claim niri supports `ext-image-copy-capture`. It doesn't. The wlr-screencopy fallback is the real path.

The visibility check, in the shape I'd write it:

```python
def is_visible(window_id: int, workspaces: list[dict]) -> bool:
    # niri: a window is on screen if it's the active window
    # of a workspace that is currently active on some output
    return any(
        ws["is_active"] and ws["active_window_id"] == window_id
        for ws in workspaces
    )
```

There's one real gap. niri's IPC gives window size, workspace, and each output's logical origin and scale, but not a window's global position, because the scrolling layout's view offset isn't exposed. So I can't map "pixel 400,300 inside this window" to a global click. The workaround needs no upstream change: ground clicks on a full-output screenshot, where coordinates are in output space, and use per-window screenshots only for reading. A small niri PR exposing window position would be the proper fix.

The bonus is portability. cua defines one typed tool contract with sibling macOS, Windows and Linux crates, plus a per-platform support ledger built from CI evidence, where "unsupported" is a typed refusal rather than a silent no-op. Write niri support once and the other platforms are already someone else's job. The cost is honest too: it's a large polyglot monorepo, the published binaries have features gated off so I'd build from source, and the niri issue has had no maintainer reply. A fork is useful on day one regardless.

## The fractional-scaling trap

This is the bug I'd bet on hitting first. My laptop panel is 1920×1080 at scale 1.25, which is 1536×864 logical. The external is 2560×1440 at scale 1.0. A screenshot gives physical pixels. `zwlr_virtual_pointer` wants logical coordinates in one global space that spans both outputs.

So every coordinate the VLM produces has to be divided by *that output's* scale and offset by *that output's* logical origin, and the divisor differs per monitor. Get it wrong and every click on the laptop panel lands about 20% off while the external works perfectly. It's the same bug that was filed against cua for niri. Write the transform once, test it on both monitors, never inline it:

```python
def to_global(px: float, py: float, output: dict,
              shot_w: int, phys_w: int) -> tuple[float, float]:
    """Screenshot pixel -> global logical coordinate for the virtual pointer.

    output: one entry from `niri msg --json outputs`
    shot_w / phys_w: undo any downscaling done before inference
    """
    k = phys_w / shot_w                 # back to physical pixels
    lg = output["logical"]
    return (lg["x"] + px * k / lg["scale"],
            lg["y"] + py * k / lg["scale"])
```

## Other traps

- **niri scrolls.** Windows live on an infinite horizontal strip, so a window in the list is often off screen, and focusing it scrolls the viewport and moves every other window. Focus first, re-read state, never cache a position across an action.
- **Focus stealing.** Activating a window to click it yanks focus from whatever I was doing. Record the previously focused id and restore it.
- **Stale screenshots.** Capture, ground and act must be one tight transaction, re-captured if more than a moment passes. This is where destructive misclicks come from.
- **RAM is the quiet ceiling.** About 4.9 GiB is in use at idle, the planner takes 4.4 GiB resident, and a browser takes 3–4 more. Touching swap mid-inference feels like a hang.
- **Security doesn't change, consequences do.** Any unsandboxed Wayland client can already record the screen and inject input. The daemon adds no new attack surface against niri; it does turn "the model said so" into real keystrokes. `wp_security_context_manager_v1` is there if I want to sandbox the daemon later.

## Build order

1. **Prove actuation with no models.** Click a known button from a shell script with `grim` and `wlrctl`. Write and test the transform. If this doesn't work reliably, no model will save it.
2. **Fork cua and write the niri shim.** The red test is easy: full screenshots work, per-window capture fails with `surface_identity_unproven`. When it passes, capture, the element tree and input should come back together.
3. **Close the loop with a cloud model.** If the loop fails with a strong model, the daemon is wrong. If it works, later failures belong to the local model. Debugging both at once is how these projects stall.
4. **Swap in local models.** Qwen3-VL-4B on the GPU, Ling 3.0 Tiny on the CPU, routed per step. Track the fraction of steps that hit the VLM; above about 30% means the semantic channel isn't pulling its weight, which is cheaper to fix than any model.
5. **Specialise if needed.** Holo1.5-3B if grounding is the limiter, OmniParser for a11y-blind apps, and if planning is the limiter, keep the planner in the cloud.

## What I'd do differently

Build a "point, don't click" mode before anything that acts. One of the projects I looked at only ever points: it moves an overlay to where it would act and waits. That's a free supervision mode. Every coordinate-transform bug shows up as a highlight in the wrong place instead of a click in the wrong place, and it's useful on its own.

Open questions I don't have answers to yet:

- Does Holo1.5-3B's benchmark lead survive on my own screens against Qwen3-VL-4B and OpenCUA-7B? Published grounding numbers are not my desktop.
- Is a 1.3B-active planner good enough for anything past single-step tool selection, or does planning just belong in the cloud?
- Will upstream take the niri module, or is this a fork I carry? The Hyprland work coming in from outside contributors suggests community PRs do land.
