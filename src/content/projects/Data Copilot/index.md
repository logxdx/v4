---
title: "Data Copilot"
description: "The Terminal-First Data Science Copilot"
date: "October 2025"
repoURL: "https://github.com/logxdx/Data-Pilot"
# demoURL: ""
---

**Turn your command line into an intelligent data analysis studio.**

Data-Pilot is an interactive, agentic workflow engine that brings the power of LLMs directly to your local datasets.

Powered by the `openai-agents` runtime and wrapped in a stunning terminal interface, Data-Pilot bridges the gap between conversational AI and rigorous code execution.

Meet **Vanessa**, your dedicated AI analyst. She doesn't just chat - **_she plans, executes Python code, builds models, and delivers reproducible insights_**, all while **keeping your data secure within a local sandbox**.

---

## Why Data-Pilot?

Stop copying code snippets from a browser. Data-Pilot provides an integrated environment where reasoning and execution happen side-by-side.

### Beautiful Terminal UX

Experience a modern command-line interface powered by **Rich**. Watch the agent's reasoning stream in real-time, view color-coded tool outputs, and manage your session with intuitive slash commands.

### Enterprise-Grade Guardrails

Security by design. The agent operates exclusively within a `./root` sandbox, ensuring that your system files remain untouched. Every action—from file reads to code execution—is strictly scoped to the project environment.

### Batteries-Included Toolbelt

Data-Pilot comes pre-loaded with a robust suite of analytical tools:

- **Automated EDA:** Generate quality reports, correlation matrices, and schema overviews instantly.
- **Modeling Pipelines:** Run end-to-end baseline training (Random Forest, Logistic Regression) with a single prompt.
- **Python Execution:** The agent writes and runs arbitrary Python to solve complex logic problems on the fly.

### Extensible Architecture

Built on a modular stack, Data-Pilot allows you to plug in new tools or "handoff" agents with just a few lines of configuration. Whether you are using Cerebras or OpenAI, the system adapts to your infrastructure.

---

## The Workflow

1.  **Ingest:** Drop your CSV, JSON, or Parquet files into the sandbox.
2.  **Prompt:** Launch `main.py` and state your business objective.
3.  **Plan:** Watch as the agent drafts a multi-step analysis roadmap.
4.  **Execute:** The agent writes code, runs it, and interprets the stderr/stdout logs automatically.
5.  **Deliver:** Receive a summarized report with artifacts, metrics, and charts saved to your output directory.
