---
title: "pi agent setup"
short: "pi agent setup"
description: "My setup for the pi terminal coding agent, with extensions for real-browser control, safety checks, checkpoints and web search."
date: "November 2026"
repoURL: "https://github.com/logxdx/pi-config"
category: "Agents · Tooling"
areas: [agents, tools]
tags: ["TypeScript", "Chrome MV3 extension", "LLM agents", "llama.cpp", "tmux"]
stats:
  - value: "4 of 4"
    label: "Small 28 px targets hit by the pointing tool on a 1920x1080 page"
  - value: "10"
    label: "pi sessions sharing the browser at once"
  - value: "5%"
    label: "Of the model's context window, the output guard's budget"
featured: false
---

This repo holds my full setup for pi, a terminal coding agent. It has the settings, overrides for local llama.cpp models, a system prompt, four subagents (coder, researcher, scout and worker), thirteen extensions and seven skills.

## Browser control

The biggest piece is browser-tabs. It gives the agent eight tools that work in my real browser through a small Manifest V3 extension. It doesn't use the DevTools protocol, so pages see a normal profile with its cookies and no automation banner.

The agent can list tabs and read them as text, with references on links, buttons and fields. It can click, type, select, upload files up to 5 MB, take annotated screenshots and read console errors. It also reads cross-origin iframes and closed shadow roots.

Each pi session takes its own port from a range of 10, so up to 10 sessions can use the browser at once. Two optional tools send a screenshot to a local vision model, to describe the page or to find and click things that have no reference, such as icons. In a test the pointing tool hit 4 of 4 small 28 px targets on a 1920x1080 page, at 2.2 to 3.1 s per call.

## Safety checks

Every browser action goes through a safety check first. Typing into password, one-time-code and card fields is blocked. Buying, sending, deleting, submitting and uploads ask me before they run.

The bash guard does the same for shell commands. In my main session it asks before risky commands such as `rm`, `sudo`, `dd` or any `git` command, and remembers an aborted command for 60 s so the agent doesn't retry it. Subagents have no screen to ask on, so 21 dangerous command patterns are blocked outright.

## Other extensions and skills

The other extensions cover background bash, rewind checkpoints, session naming, tracing, web fetch and web search.
The output guard keeps huge tool results out of the context. Its budget is about 5% of the model's context window, between 1.5k and 6k tokens, and anything larger goes to a file the agent can read in parts.

Web search tries 4 providers in order and falls back on any error or empty result. Exa, the only paid one at \$4 per 1,000 searches, comes after the two free providers.

The pdf-reader skill wraps liteparse with an OCR engine built in, whose models are about 70 MB.

## Setup runbook

The README is written as a runbook that an AI agent can follow to set everything up on a new machine. It has 9 steps for Linux or macOS, of which steps 5 to 9 are optional, with a check at the end of each step.

## Credits

Two packages in the repo are other people's work, kept with their MIT licenses: pi-interactive-subagents by HazAT and pi-observational-memory by Amos Blomqvist. The extensions under `agent/extensions` are mine.
