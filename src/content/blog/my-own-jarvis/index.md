---
title: "Making my own Jarvis"
short: "My own Jarvis"
description: "How my pi agent grew from driving my niri desktop into a voice assistant that uses the computer, researches the web and asks a bigger model for help."
date: "2026-11-19"
areas: [agents]
tags: ["Jarvis", "pi", "Computer use", "Voice", "Subagents", "Advisor"]
experiment: true
---

In my [last post](/blog/agent-driven-niri) I got an agent to drive my niri desktop with three small local models. That agent is pi-operator, a package of extensions for [pi](https://pi.dev). I kept adding to it, and now it works as my own Jarvis.

It still drives the desktop. It also works in my everyday browser, searches the web, hands research to a helper agent, talks by voice, and asks a bigger model for help when it gets stuck.

Every request, typed or spoken, goes through the same steps.

```text
request (typed or spoken)
  -> d1 picks a tool group: browser / desktop / screen / none
  -> that group's tools turn on, its skill goes into the prompt
  -> planner loop, 40 steps at most
       every action  -> gate: allow / ask me / block
       every result  -> OBSERVED line, untrusted text fenced
       looks stuck   -> advisor
  -> answer (spoken when voice is on)
```

d1, the small decision model from the last post, picks the tool group first. My own browser tabs need a probability of at least 0.6, because in the hard evals d1 once read "Log in to some site" as my own browser at 0.47. There are no keyword rules, and routing can be switched off.

The package ships with LFM3-1.7B as a local planner. My config uses a cloud model instead, `deepseek/deepseek-v4.1-flash-1017` through OpenRouter. The eyes and d1 still run locally on llama.cpp.

The loop has 40 steps. When they run out, the tools are taken away and the planner answers from what it found. After every action it gets an `OBSERVED:` line saying which page or window it ended up on, so it knows whether the action worked.

| Group | What it drives | How |
|---|---|---|
| browser | web pages, my logged-in sites, my open tabs | Helium through an MV3 extension, or headless Chrome |
| desktop | native apps and the niri layout | the accessibility tree through agent-desktop, and `niri msg` |
| screen | terminals, canvases, games | screenshots, the LFM3-VL eyes, the calibrated pointer |
| shell | everyday commands | pi's own `bash`, checked against a risk list |
| web | looking things up | `web_search` and `web_fetch` |

For apps, the desktop tools act through the accessibility tree, so a click or a text change happens without moving the mouse. A `desktop_niri` tool handles workspaces, monitors, window sizes and launching programs. Windows the agent opens go to a workspace called `operator`, and focus goes back to whatever I was using.

Apps with no accessibility tree, like terminals, go through the screen tools. The eyes find the target in a screenshot, zooming in for small text, and the click goes through the calibration from the last post.

The browser tools run in Helium, the browser I actually use, with all my logins! They work through an MV3 extension and a small local bridge with no remote debugging, so sites see a normal browser.

The agent opens its own tabs in a background window. It only touches my tabs when the task is about them, and it closes only what it opened.

For simple lookups it doesn't open a browser at all. It searches with `web_search`, reads the best result with `web_fetch`, and uses the browser only for logged-in or script-heavy pages. Search falls back through TinyFish, LangSearch, Exa and ddgs, in that order.

Bigger questions go to a researcher subagent from my [pi-config](https://github.com/logxdx/pi-config). It splits the question into 2 to 4 angles, searches each, and reads the 2 or 3 best sources in full. It has the browser too, behind the same gate and stop as the main agent, and it never posts, buys or signs up for anything.

Subagents run in tmux panes next to pi. The call returns straight away, and when the researcher is done, its summary with sources comes back into the main chat as a new turn.

The advisor is a bigger model the planner can ask for help. The planner can call `ask_advisor` itself. The operator also calls it when the planner looks stuck: 3 failed tool calls in a row, the same call 3 times in a row, or half the step budget used.

The advisor sees up to 40,000 characters of the current task and the reason it was asked. It has no tools, so any advice still goes through the planner and the gate. It replies in under 200 words with what's wrong and the next steps, or says plainly that the task can't be done.

| Setting | Default | Mine |
|---|---|---|
| Advisor | off | on |
| Model | none picked | `openrouter/deepseek/deepseek-v4.1-flash-1017` |
| Thinking | medium | medium |
| When | planner asks + when stuck | planner asks + when stuck |
| Calls per task | 3 | 10 |

It was built for the small local planner. With my current config the planner and the advisor are the same cloud model, so the advisor is a second pass with the whole task in view.

For voice, I say "hey jarvis" or press a spare key on my keyboard, and it listens. It answers out loud, and I can talk over it! All the speech models run on the CPU so the GPU stays free for the local ones, and echo cancellation stops it hearing itself.

The mic is ALWAYS on, so I can add something mid-task or say "stop". Approvals are spoken too: it asks "Should I? Say yes or no", and silence counts as a no. Pause stops everything at once, and Shift+Pause resumes.

The gate from the last post still checks every action, and it now covers `bash` too. Everyday commands run. Deleting, sudo, installs, killing processes and git pushes ask me first. Typing into password, OTP and card fields is blocked, and so is reading private keys or browser cookies.

After one "no", the task stops and tells me what's left, instead of asking about the next risky step. Everything read from pages, the screen and the web is wrapped in `<untrusted>` tags, and the model is told to treat it as data.

Some parts are still rough. The advisor has no eval numbers yet. My end-to-end results, 23/23 and 47/51, were all with the local planner, and I haven't re-run them with the cloud one. Real clicks into other apps haven't been tested, and the router still sends some tasks, like "Draft an email", to the wrong group.
