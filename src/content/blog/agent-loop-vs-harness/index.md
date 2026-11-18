---
title: "The loop is seven lines; the harness is everything else"
description: "Why the agent loop is trivial, and what a harness has to add around it, with the failure each piece prevents."
date: "2026-11-18"
draft: true
areas: [agents]
tags: ["Agent harness", "Tool calling", "Checkpointing", "Prompt caching", "Sandboxing"]
experiment: false
---

![The Agent Loop, hand-drawn: while True: response = await llm.invoke(messages, tools); if not response.tool_calls: break; for tool_call in response.tool_calls: result = await execute(tool_call); messages.append(result). Caption: That's the entire agent framework.](./agent-loop.png)

This slide does the rounds: seven lines of pseudo-code and the claim that it's the entire agent framework. The annoying part is that it's right. The less obvious part is that it doesn't matter.

That really is all the control flow an agent has. Nothing in it says "read the failing test, then open the module, then patch it, then rerun". The model supplies the plan by choosing tool calls; your code supplies the loop. That's why no framework can add much to the control flow, and why the interesting engineering is somewhere else.

It's in the code around the loop. That code is the **harness**, and the working definition I use is blunt: *agent = model + harness*, and anything that isn't the model is harness. This post is about what goes in it, and what goes wrong when you leave it out.

I'll use one running example: a coding agent asked to fix a failing test. It has `read_file`, `grep`, `apply_patch` and `run_tests`, and a repository checkout to work in.

## First, make the seven lines real

Here is the slide as a loop you can actually run against the OpenAI Responses API, with one toy tool. It's short, but it already fixes four bugs in the slide.

```python
import json, os
from openai import OpenAI

TOOLS = [{
    "type": "function", "name": "multiply",
    "description": "Multiply two integers exactly. Use this instead of doing arithmetic yourself.",
    "parameters": {"type": "object",
                   "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
                   "required": ["a", "b"], "additionalProperties": False},
    "strict": True,
}]
REGISTRY = {"multiply": lambda a, b: {"product": a * b}}

def execute(name: str, arguments: str) -> str:
    try:
        return json.dumps(REGISTRY[name](**json.loads(arguments)))
    except Exception as exc:  # errors are data: the model reads them and can retry
        return json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"})

def run(task: str, client: OpenAI, max_turns: int = 10) -> str:
    items = [{"role": "user", "content": task}]
    for _ in range(max_turns):                       # a brake instead of `while True`
        response = client.responses.create(
            model=os.environ["MODEL"], input=items, tools=TOOLS,
            instructions="You are a careful assistant. Use tools for arithmetic.",
            store=False, include=["reasoning.encrypted_content"],
        )
        if response.status == "incomplete":
            raise RuntimeError(f"incomplete: {response.incomplete_details}")
        # The model's own items first: reasoning, function calls, messages.
        items += [i.model_dump(by_alias=True, exclude_unset=True) for i in response.output]
        calls = [i for i in response.output if i.type == "function_call"]
        if not calls:
            return response.output_text
        for call in calls:                           # one result per call, paired by id
            items.append({"type": "function_call_output", "call_id": call.call_id,
                          "output": execute(call.name, call.arguments)})
    raise RuntimeError(f"no final answer after {max_turns} turns")
```

The four fixes:

- **The slide only appends the result, not the model's own tool-call item.** The next request then contains an answer to a question the transcript no longer asks. OpenAI's own migration guide lists this among the common errors.
- **Hidden reasoning has to go back verbatim.** Drop it and a reasoning model loses its train of thought between turns, or the API rejects the request outright.
- **`execute()` can raise.** In the slide, one bad argument kills the run. Here it becomes a JSON error the model can read and fix.
- **`while True` has no brake.** A confused model will happily loop until someone reads the invoice.

It runs an agent. It does not run one you can leave alone overnight.

## What a turn looks like once there's a harness

Here's what happens between two model calls in a serious harness. The model's part is one line.

```text
assemble context   instructions + tool definitions + transcript, stable order; compact if too big
call the model     with a timeout; back off on 429 / 5xx / network errors; never retry quota errors
parse              text, reasoning, tool calls; read the stop reason (done? truncated? refused?)
record             trace the request and response; checkpoint the transcript
for each call:
  policy           allow / ask a human / deny  (a denial goes back as a result, not an exception)
  execute          in a sandbox, with a timeout and resource limits
  truncate         head + tail of long output; full copy on disk, path in the result
  append           result tagged with its call id; checkpoint again
check budgets      turns, tokens, dollars, wall-clock; then stop or go round again
```

Every line in that block exists because something broke without it.

## Tools are the interface, so design them like one

The model never touches anything. Every read and write goes through a tool you chose to offer and chose to execute, and the tool definitions are sent on every request, so they are effectively part of the prompt.

The best evidence for how much this matters is old but has held up: the SWE-agent ablations on SWE-bench Lite with GPT-4 Turbo. The full interface resolved 18.0% of issues. Removing the edit tool dropped it to 10.3%. Showing the whole file instead of a bounded viewer dropped it to 12.7%. And an iterative search tool (12.0%) did worse than having no search tool at all (15.7%). A badly designed tool is worse than no tool.

What I now consider the minimum for a tool layer:

- **Validate before you run.** Check the tool exists, the JSON parses and the arguments match the schema, in that order, and turn every failure into a result: `"invalid arguments: 'mode' must be one of ['unit', 'integration'], got 'all'"`. The model fixes that on the next turn. A stack trace in your terminal helps nobody.
- **Separate "your fault" from "my fault".** A missing file is something the model can act on, so say what to do next. Any other exception is a bug in the tool: log it with the traceback, but still return it as data labelled as an internal error, so one broken tool doesn't end a long run.
- **Bound every output, and keep the tail.** When the agent runs the test suite and gets 3,000 lines back, the naive fix is to cut the end off. That's exactly wrong, because tracebacks and summaries live at the end. Keep the head and the tail, save the full text to a file, and put the path in the result so the model can page through it if it needs to:

```python
def truncate_text(text: str, max_chars: int, full_output_path: str | None = None) -> str:
    """Keep the first 3/4 and the last 1/4 of max_chars, with a note in between."""
    if len(text) <= max_chars:
        return text
    head = max_chars * 3 // 4
    tail = max_chars - head
    where = f" Full output: {full_output_path}" if full_output_path else ""
    note = f"\n\n[... {len(text) - head - tail:,} of {len(text):,} characters omitted.{where} ...]\n\n"
    return text[:head] + note + text[len(text) - tail:]
```

- **Parallelise only what is read-only.** Models often ask for several tools in one turn. Three `grep`s can run at once; two `apply_patch` calls to the same file cannot. Mark tools as read-only explicitly and run everything else one at a time, in order.

## Stopping is a feature, not an afterthought

The slide has one stop condition: the model stops asking for tools. A harness needs several, because the model may never stop, may stop for the wrong reason, or may be stopped by you. I record each as a distinct run status: `completed`, `max_turns`, `budget_exceeded`, `failed`, `interrupted`.

The distinction matters more than it looks. `max_turns` and `completed` both end the loop, but only one means the test is fixed. If your eval or your downstream code can't tell them apart, you will eventually ship a turn cap as a success.

Three rules I'd hold firm on:

- **Truncation is failure.** A response that hit the output-token limit may carry a half-written tool call. Running a half-written `apply_patch` is worse than stopping.
- **Check budgets before each model call, not after.** An alert after the money is spent is a report, not a budget.
- **A turn cap doesn't bound cost.** The model is stateless, so every turn resends the whole transcript. If the fixed part (instructions, tools, task) is $p$ tokens and each turn adds $a$ (a call plus its result), then over $N$ turns you send

$$
N p + a \frac{N(N-1)}{2}
$$

input tokens. The second term is quadratic. With $p = 8{,}000$, $a = 3{,}000$ and 30 turns, the final transcript is 95,000 tokens but the run sends about 1.5 million, roughly 16 times as much. So cap tokens, dollars and wall-clock time too, not just turns. Server-side conversation state doesn't save you here; it saves bandwidth, not tokens.

## Retries: one layer, and only for things waiting can fix

Model calls fail: rate limits, overloaded servers, dropped connections. Some of those clear if you wait. Some never will. The harness has to know which is which.

Retry 408, 409, 429, 5xx, timeouts and connection errors, with capped exponential backoff and full jitter (sleep a random time between zero and the cap, so a fleet of clients doesn't retry in lockstep). Honour `retry-after` when the server sends it. Don't retry 400s, auth errors, or anything that means "you are out of quota" or "you hit a spend cap": waiting won't add credit, and OpenAI counts failed requests toward rate limits, so blind retries make 429s worse.

The less obvious rule is **one retry layer**. The vendor SDK client retries by default. An agent SDK runner might retry. Your harness retries. Stack all three and the attempts multiply, each one can wait out the full request timeout, and none of the inner ones show up in your trace. I set the vendor clients to `max_retries=0` and make one module the only place that retries, so every attempt is visible and counted.

Tool calls are never retried by the harness. A tool failure goes back to the model as data, and the model decides what to do.

## Context: protect the prefix, compact rarely

Both major providers cache by prefix: tokens at the start of a request that match a recent request byte for byte are billed at a steep discount, and the first changed byte ends the match. That turns context layout into a caching problem:

- Tool definitions and system instructions come first and never change during a run. No timestamps, no "today is...", no reordering tools.
- The transcript is append-only. If the sandbox mode or working directory changes, append a message saying so; don't edit the first one.

Eventually you have to compact anyway: summarise the run into a handoff note and restart from it, or replace old, large tool results with a one-line stub that says how to get the content back ("run it again if needed"). Both rewrite the prefix, which means the next turn pays to cache it all again. A harness that compacts often can cost more than one that never caches at all. So compact in one step, at a high threshold, and reach for the cheaper levers first: bounded tool output, paging in `read_file`, and subagents that return a short answer instead of their whole working context.

The best public example of the context layer mattering: OpenAI reported that on ARC-AGI-3, the same model scored 13.3% with the benchmark's official harness and 38.3% with OpenAI's own. The official harness discarded the model's reasoning items after every action and truncated history; OpenAI's kept the reasoning and compacted instead.

## Permissions and the sandbox are two different controls

A prompt rule is not enforcement. "Don't push to main" in the system instructions is a suggestion the model will usually follow. Safety needs two separate mechanisms:

| Control | Question it answers | Coding-agent example |
|---|---|---|
| Sandbox | What can a command touch, whatever it tries? | Writes limited to the checkout, no network, no secrets in the environment |
| Approval policy | When must someone say yes first? | Ask before `git push` or anything that leaves the sandbox |

The order matters: **sandbox first, approvals second.** Human approval wears out with use; Anthropic's data has people approving 93 to 97% of permission prompts. If everything asks, people stop reading. Let the sandbox make most actions safe to run unasked, and keep approvals for the few that are irreversible or reach outside it.

Two properties I'd treat as non-negotiable in the policy layer:

- **Fail closed.** A tool that needs approval, with no approver configured, is denied. A tool nobody listed is denied.
- **A denial is data.** The model gets `not executed: <reason>` as a tool result and can try another way. It doesn't crash the run.

And one about the workspace: resolve paths first, then check them. Checking the string `"/workspace/../etc/passwd"` before following `..` and symlinks is how path-traversal bugs happen. Keep the harness's own logs and checkpoints out of the model's reach, too. An agent that can rewrite its checkpoint can plant a transcript that a resume will trust.

## State: what survives a crash

An agent that runs for an hour will meet a closed laptop lid, a deploy, an OOM kill or a Ctrl-C. Where you checkpoint decides what that costs.

Saving at turn boundaries sounds reasonable and is subtly wrong. If the process dies halfway through a batch of tool calls, the checkpoint holds nothing of that turn. On resume the model is asked again, it asks for the same tools (as it usually will), and a side effect that already happened runs twice. I reproduced exactly this in an offline test against an agent SDK that only checkpointed between turns.

The fix is to save after the model's reply *and* after every single tool result, atomically (write a temp file, fsync, rename), and on resume run only the calls that have no result yet. That's one small function:

```python
def pending_tool_calls(transcript: list[Item]) -> list[ToolCall]:
    """Tool calls in the LAST assistant message that have no result yet."""
    for index in range(len(transcript) - 1, -1, -1):
        item = transcript[index]
        if isinstance(item, AssistantMessage):
            answered = {r.call_id for r in transcript[index + 1:] if isinstance(r, ToolResult)}
            return [call for call in item.tool_calls if call.id not in answered]
    return []
```

That narrows the window to the one call that was running when the process died. For reads, re-running it is harmless. For anything with a side effect (sending a message, charging a card, appending to a file) it's a duplicate. So side-effecting tools need idempotency keys: derive a key from what the call means, record completed keys somewhere durable, and pass the key on to external services that accept one. Checkpoints narrow the window; idempotency closes it.

## Observability and tests: the boring half that pays

When a run goes wrong you want to know what the model saw on turn 23, what it returned, what the tool did and what it cost. Only the harness sees every call, so only the harness can record it. An append-only JSONL event log, flushed per line, is enough to start: a crash loses at most one line, `jq` works on it, and nothing is rewritten, so it doubles as an audit trail. Remember that traces contain prompts and tool outputs, so decide what you log on purpose.

Testing follows from one observation: the harness is ordinary code, and the model is the only part that's slow, non-deterministic and costs money. So test everything *except* the model offline. A scripted fake model that returns fixed turns (and can raise on cue) lets you test round trips, stop conditions, compaction, approvals and crash-resume for free. Test the wire format separately by running the real SDK against a mock HTTP transport and asserting that provider items are replayed byte-for-byte. Leave the model itself to evals with repeated trials.

## The counterpoint I keep coming back to

None of this means the harness matters more than the model. The Terminal-Bench 2.0 authors looked at their own results and wrote that "model selection is usually more important than agent scaffold". mini-swe-agent, about 100 lines with bash as its only tool, reports more than 74% on SWE-bench Verified (self-reported). A tiny harness is enough for a strong model.

But the same benchmark shows the harness moving a single model's score by up to about 17 points: GPT-5 ranged from 33.9% to 49.6% depending on the harness. LangChain reports taking its CLI agent from 52.8% to 66.5% on that benchmark with the model held fixed, partly by forcing a verification pass before the agent was allowed to finish.

My summary: the model sets the ceiling, the harness decides how close you get, and the harness alone decides whether you can ship. No benchmark measures whether your agent leaked a secret, double-charged a customer or lost an hour of work to a deploy.

## What I'd do differently

- **Start minimal and add a component per observed failure.** A harness designed up front encodes guesses about what the model can't do, and those guesses go stale with every model release. A bash-only loop plus traces, then one piece at a time.
- **Build to delete.** Some components exist to cover for a specific model's weaknesses. They should be easy to rip out when the next model doesn't need them.
- **Write the stop statuses and the checkpoint before the clever bits.** Context tricks are fun; crash-safety is what lets you run anything long enough to find out whether the tricks work.
- **Pick limits deliberately.** Library defaults are tuned for chat (one popular agent SDK stops at 10 turns). Long tasks routinely need several times that, and a cap you didn't choose is a bug you haven't found yet.

The seven lines are the easy part. Everything else is the job.
