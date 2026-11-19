---
title: "Making my own Jarvis"
short: "My own Jarvis"
description: "How my pi agent grew from driving my niri desktop into a voice assistant that uses the computer, researches the web and asks a bigger model for help."
date: "2026-11-19"
areas: [agents]
tags: ["Jarvis", "pi", "Computer use", "Voice", "Subagents", "Advisor"]
experiment: true
---

In my [last post](/blog/agent-driven-niri) I got an agent to drive my niri desktop with three small local models. That agent is pi-operator, a package of extensions for [pi](https://pi.dev). I kept building on it, and it has turned into my own Jarvis.

It still drives the desktop. Now it also works in my everyday browser, searches and reads the web, hands research to a helper agent, listens and talks back, and asks a bigger model for help when it gets stuck. The first line of its system prompt is "You are Jarvis."

This isn't my first try at an assistant like this. In September and October I tried an on-screen pointing buddy built on a small vision model, and my own stripped-down agent harness.

Small models kept fighting structured tool calls back then. pi-operator is the one that stayed.

Every request, typed or spoken, now takes the same path.

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

Before the planner sees anything, d1 picks the tool group. It chooses one of five answers: my own browser, a fresh browser, a desktop app, the screen, or none. On Nov 13 I removed my keyword rules completely, so routing is now d1 or off.

d1 has to be fairly sure before a task gets my own browser tabs. The cutoff is a probability of 0.6, because in the hard evals it read "Log in to some site" as my own browser at 0.47. With routing off, nothing loads up front and the planner loads a group itself with a tool called `operator_tools`.

The chosen group's tools switch on, and its skill text goes straight into the system prompt. So the planner never has to search for tools or read a skill file first. That search step is what failed in October, when I tried hiding tools behind `tool_search` and reverted it.

The planner is where my setup has moved the most. The package is built around LFM3-1.7B running locally, and that's still the model it ships with.

My own config now points the planner at a cloud model, `deepseek/deepseek-v4.1-flash-1017` through OpenRouter. The eyes and d1 still run locally on llama.cpp.

The loop has a budget of 40 steps. When it runs out, the tools are taken away and the planner gets one last turn to answer from what it found. If it stops on a computer task without calling any tool, it gets one nudge.

After every action the result gets an `OBSERVED:` line. It names the page or window the action ended on, plus d1's guess at the screen state when a screenshot looks unusual. Each action is also marked verified, unverified, unknown or not delivered, so the planner knows when to read again before repeating.

A d1 check on the final answer can send unfinished work back up to twice. It's on by default, but I have it turned off.

Each part of the computer has its own tools. The router picks between the first three. The shell and web tools are always there.

| Part | What it drives | How |
|---|---|---|
| browser | web pages, my logged-in sites, my open tabs | Helium through an MV3 extension, or headless Chrome through agent-browser |
| desktop | native apps and the niri layout | the accessibility tree through agent-desktop, and `niri msg` |
| screen | anything without a ref: terminals, canvases, games | screenshots, the LFM3-VL eyes, the calibrated pointer |
| shell | everyday commands | pi's own `bash`, checked against a risk list |
| web | looking things up | `web_search` and `web_fetch` |

For apps, the desktop tools read the accessibility tree and act on refs like `d4`. A click or a text change happens inside the app without moving the mouse. Chromium and Electron apps get accessibility switched on when the agent launches them.

niri got its own tool, `desktop_niri`. It handles workspaces, monitors, moving and resizing windows, the keyboard layout, spawning programs and any other `niri msg action`. Quitting niri and turning monitors off ask me first.

Windows the agent opens for itself go to a named workspace called `operator`. They open unfocused and focus goes back to the window I was in.

Some apps aren't on the accessibility bus at all, like terminals and my browser, so for those it uses the screen tools. The eyes read a screenshot, zoom in for small text and point at one named thing, and clicks go through the calibration from the last post. Real mouse and keyboard input used to be opt-in, and now it's on by default.

The browser changed the most. On Nov 5 alone the real-browser backend went from Firefox to a separate Chrome for Testing. On Nov 12 it moved into Helium, the browser I actually use, with all my logins!

It talks to Helium through an MV3 extension and a small local bridge, with no remote debugging flags, so sites see an ordinary browser. The agent opens its tabs in its own background window on the `operator` workspace. It reads or acts on my own tabs only when the task is about them, and when pi exits it closes only the tabs it opened.

On Nov 15 `browser_read` got a `find` option. It takes a regex and returns only the matching lines with their refs, from up to 500k characters of a page.

For plain lookups, driving a browser is slow. So the operator loads my `web_search` and `web_fetch` tools from my [pi-config](https://github.com/logxdx/pi-config), and its skill says to search first, fetch the best result, and open the browser only to act on a site or read a page behind a login. Search falls back through TinyFish, LangSearch, Exa and a keyless ddgs, in that order.

Bigger questions go to a subagent. My pi-config has four of them: coder, researcher, scout and worker. For the operator I gave the researcher the browser tools on top of `web_search` and `web_fetch`.

The researcher splits a question into 2 to 4 angles, searches each one, then fetches the 2 or 3 best sources in full. It opens the browser only for pages `web_fetch` can't read, like logged-in pages or pages built by scripts. It never posts, sends, buys or signs up for anything.

A subagent that lists browser tools gets the same gate, the same untrusted fences, the same step budget and the same global stop as the main session. Its browser group is loaded from the start, and its tabs are its own.

Subagents run in tmux. Inside tmux they open as panes next to pi, and outside it they get their own tmux session in a separate terminal window.

The call returns right away. When the researcher finishes, its brief (a summary, findings with sources, and gaps) is steered back into the main session as a new turn.

The advisor is the newest piece, from Nov 19. A small planner gets stuck sometimes, so I gave it a bigger model to ask for help.

It gets called in two ways. The planner can call an `ask_advisor` tool and say what it tried and where it's stuck. And the operator watches for a planner that's going nowhere and asks for it.

"Stuck" has a fixed meaning: 3 failed tool calls in a row, the same call 3 times in a row, or half the step budget used. With a budget of 40, the halfway check fires once, at step 20. The advice goes into the conversation before the planner's next step, with a line telling it to follow the advice if it fits what it sees now.

The advisor sees the current task's conversation, up to 40,000 characters of it (the start and the end of a longer one). It also gets the last 4,000 characters of the session before it, the planner's current tools, and why it was asked. The advisor gets no tools itself, so the planner acts on the advice through the same gate.

Its prompt asks for under 200 words: what's going wrong, numbered next steps with tool names where it can, or a plain "this can't be done" and what to tell me. It's told that text in untrusted tags is only data, and to never suggest a way around my approvals or a blocked step.

Each answer gets 180 seconds. If the advisor is off, out of calls or fails, the planner is told to carry on by itself or tell me what's blocking it.

Settings live on an `/advisor` page. The model can be anything pi has a key for, picked from a list you filter by typing. This is what mine is set to:

| Setting | Default | Mine |
|---|---|---|
| Advisor | off | on |
| Model | none picked | `openrouter/deepseek/deepseek-v4.1-flash-1017` |
| Thinking | medium | medium |
| When | planner asks + when stuck | planner asks + when stuck |
| Calls per task | 3 | 10 |

So right now my planner and my advisor are the same cloud model. The advisor was designed for the local LFM3-1.7B planner. In my current setup it's that same model taking a second pass with its own prompt, the whole task in view, and medium thinking.

Voice is the part that made it feel like Jarvis. When I say "hey jarvis" or press a spare launch key on my keyboard, it plays a blip and listens. It answers out loud, and I can talk over it!

All the speech models run on the CPU, so the GPU stays free for the local models. The wake word is openWakeWord's "hey jarvis" model, with Silero VAD to find speech. Echo cancellation uses WebRTC's AEC3 against whatever the speakers play, so it doesn't hear its own voice.

A small speech-to-text model turns what I say into text, and a 31M-parameter text-to-speech model talks back in a cloned voice. I have it set to 1.2x speed. A request ends after 900 ms of silence, but if I say "uhm" and pause, a filler check keeps my turn open.

The mic is ALWAYS on, so the wake word works mid-task.

Saying it while Jarvis is talking stops the speech and lets me add something while the work goes on. "Stop" or "cancel" stops the work, and it asks what's next. Saying its name with a new request drops the old task and runs the new one.

| Key | What it does |
|---|---|
| the launch key | start listening; press again to stop |
| Shift + launch key | pause speech mid-word; press again to resume from the same spot |
| Pause | stop everything (work, speech, listening, input) and say "Stopped." |
| Shift + Pause | resume and say "Resumed." |

Approvals are spoken too. It asks something like "I need your okay to run pkill ... Should I? Say yes or no."

I can say yes, no, or "no, do X instead". If it hears nothing it asks once more, then takes that as a no.

When voice is on, the model is told to keep answers as short as possible, since they get read aloud. After an answer it listens once more for a follow-up, and "thanks" or "that's all" ends the conversation.

The gate from the last post still sits in front of every acting tool call, and it now covers pi's own `bash` too.

Everyday commands run. Deleting, sudo, installs, killing processes, git pushes and sending data to a server ask first. Reading private keys or browser cookies is blocked.

Typing into password, OTP and card fields is blocked. The one exception is a secret I wrote in the task myself, which can go into a secret field after an ask and gets redacted from the run logs. If the gate can't check a target within 8 seconds, it treats it as one that needs me.

When it asks, I can allow once, allow that target for the session, or deny.

After one "no", the task stops asking. It can't retry the same step another way or ask about the next risky step, so it answers with what it did and what's left for me. By voice, that saves me from one question after another.

Everything it reads from pages, the screen and the web is wrapped in `<untrusted>` tags with a random id. The model is told to treat what's inside as data and to ignore any requests written there.

There's also a global stop. The Pause key, bound in niri, pauses every running operator session at once. It aborts the turn, blocks the tools and kills any mouse or keyboard input in progress, until Shift+Pause resumes.

Some of it is still rough. The advisor has no eval numbers yet. My end-to-end results are still the 23/23 and 47/51 from Nov 5, all with the local planner, and I haven't re-run them with the cloud planner.

Real clicks into other apps haven't been tested yet, and screen capture outside niri is written but untested. The router's remaining mistakes are tasks like "Draft an email" that get sent to the desktop group.
