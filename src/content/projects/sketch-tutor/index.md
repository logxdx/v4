---
title: "Sketch"
short: "Sketch"
description: "An agentic AI tutor that teaches any subject on a live whiteboard, with lessons read aloud and on-device voice in and out."
date: "2026-11-19"
repoURL: "https://github.com/logxdx/sketch-tutor"
category: "AI Agents · Education"
areas: [agents]
tags: ["Next.js", "Vercel AI SDK", "Excalidraw", "three.js", "WebAssembly", "TypeScript"]
featured: false
---

Sketch is an AI tutor that teaches on a shared whiteboard. Ask it about maths, science, history, code or a language, and it explains on an Excalidraw board, drawing stroke by stroke with its own cursor while a voice reads each step. The student draws on the same board, and can select something to ask about it or have their work marked.

The server is a Next.js route with two stages. First a vision model reads a snapshot of the board and any images the student sent. Then an agent built on the Vercel AI SDK's ToolLoopAgent works through the request with tools.

Server tools run inside the loop: web search, page fetching, a research sub-agent with numbered citations, Wikimedia images, a math.js calculator, 3D scenes in three.js, and charts. Board tools have no server-side execute function. When the agent calls one, the loop pauses, the browser animates the drawing and reports back, and the loop carries on.

For layout the agent fills board components with content: steps, flowcharts, timelines, tables, worked equations, number lines. The board places them itself and measures the text, so wrapped labels never overlap.

Students can attach homework photos, PDFs, notes, code or a whole course folder. Documents are chunked into a BM25 index per library. PDFs go through LiteParse, which rebuilds Markdown from the page layout and runs Tesseract OCR locally on scanned pages.

The agent works that library with its own tools. It searches it, reads the outline of a long PDF, reads exact text, and can screenshot a page to look at a figure or a table. Answers cite the file and page they came from.

In Learn mode you name a goal, and Sketch first asks 2 to 4 probe questions to find where your understanding ends. It then draws a route on the board, a dependency map from what you know to the goal, and teaches it one step at a time, lighting up each node as you go. A confident but wrong answer is treated as a misconception and repaired before moving on, and the route is redrawn when your answers surprise it.

Question cards ask how sure you are and have a box to think out loud, so the tutor sees the reasoning behind an answer.

Every reply plays as a lesson. Each step is a short narration and the drawing it describes, revealed while the sentence is read and highlighted. The agent keeps writing ahead while you are on a step, and its drawings wait, invisible, until their step comes up.

Voice runs on the student's own device. Reading aloud uses Gradium's Phonon 31m compiled to WebAssembly, on one CPU thread in a Web Worker, with a model of about 65 MB. The microphone uses Parakeet Redux, a 1.58-bit Parakeet v3, with a model of about 199 MB. Text appears as you speak.

| Part | Default |
|---|---|
| Tutor | gpt-oss-120b on Groq |
| Vision | Llama 4 Scout 17B on Groq |
| Research sub-agent | gpt-oss-20b on Groq |
| Voice out | Phonon 31m in the browser |
| Voice in | Parakeet Redux in the browser |

Any provider with a key on the server can be picked in the settings, including models from the OpenRouter catalog.
