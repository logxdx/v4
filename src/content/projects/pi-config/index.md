---
title: "pi agent setup"
description: "My setup for the pi terminal coding agent, with extensions for real-browser control, safety checks, checkpoints and web search."
date: "November 2026"
repoURL: "https://github.com/logxdx/pi-config"
category: "Agents · Tooling"
areas: [agents]
tags: ["TypeScript", "Chrome MV3 extension", "LLM agents", "llama.cpp", "tmux"]
featured: false
---

This repo holds my full setup for pi, a terminal coding agent. It has the settings, overrides for local llama.cpp models, a system prompt, four subagents (coder, researcher, scout and worker), thirteen extensions and six skills.

The biggest piece is browser-tabs. It lets the agent work in my real browser through a small Manifest V3 extension. It doesn't use the DevTools protocol, so pages see a normal profile with its cookies and no automation banner.

The agent can list tabs and read them as text, with references on links, buttons and fields. It can click, type, select, upload files, take annotated screenshots and read console errors. It also reads cross-origin iframes and closed shadow roots.

Every action goes through a safety check first. Typing into password, one-time-code and card fields is blocked. Buying, sending, deleting, submitting and uploads ask me before they run.

The other extensions cover background bash, a bash guard, an output guard for huge tool results, rewind checkpoints, session naming, tracing, web fetch and web search. The pdf-reader skill wraps liteparse with an OCR engine built in.

The README is written as a runbook that an AI agent can follow to set everything up on a new machine, with a check at the end of each step.

Two packages in the repo are other people's work, kept with their MIT licenses: pi-interactive-subagents by HazAT and pi-observational-memory by Amos Blomqvist. The extensions under `agent/extensions` are mine.
