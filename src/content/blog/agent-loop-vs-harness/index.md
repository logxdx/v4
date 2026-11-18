---
title: "The loop is seven lines; the harness is everything else"
description: "What an agent harness adds around the simple agent loop, and which failure each piece prevents."
date: "2026-09-28"
draft: true
areas: [agents]
tags: ["Agent harness", "Tool calling", "Checkpointing", "Prompt caching", "Sandboxing"]
experiment: false
---

![The Agent Loop, hand-drawn: while True: response = await llm.invoke(messages, tools); if not response.tool_calls: break; for tool_call in response.tool_calls: result = await execute(tool_call); messages.append(result). Caption: That's the entire agent framework.](./agent-loop.png)

There's a slide going around with seven lines of code and the claim that this is the entire agent framework. And it's right! The loop calls the model, runs the tools it asked for, adds the results, and repeats until the model stops asking. The model makes the plan by picking tools. Your code just keeps the loop going.

Here's the slide as a loop you can run against the OpenAI Responses API, with one toy tool.

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

It already fixes four bugs in the slide. It sends back the model's own tool-call items and hidden reasoning along with the results, it turns tool errors into data the model can read, and it has a turn limit instead of `while True`. That's enough to run an agent, but I wouldn't leave it alone overnight.

So the engineering lives in the code around the loop. I call that the harness. An agent is a model plus a harness, and anything that isn't the model is harness. These are the pieces I think matter most.

| Harness piece | What goes wrong without it |
|---|---|
| Tool errors returned as results | One bad argument crashes the whole run |
| Output limit that keeps head and tail | The traceback at the end of the output gets cut off |
| Separate stop statuses | Hitting the turn cap gets counted as a success |
| Token and dollar budgets | Cost grows with the square of the number of turns |
| One retry layer | Retries multiply and never show up in your trace |
| Stable start of the prompt | You lose the prompt cache discount |
| Sandbox first, approvals second | People approve prompts without reading them |
| Checkpoint after every tool result | A side effect runs twice after a crash |

Tool design matters a lot, because tools are the model's only way to touch anything. In the SWE-agent ablations on SWE-bench Lite with GPT-4 Turbo, the full interface solved 18.0% of issues. Removing the edit tool dropped that to 10.3%. An iterative search tool scored 12.0%, which is WORSE than the 15.7% with no search tool at all!

The cost point surprised me the most. Every turn resends the whole transcript, so with 8,000 fixed tokens, 3,000 more per turn and 30 turns, the final transcript is 95,000 tokens but the run sends about 1.5 million. A turn cap alone doesn't control that.

Retries can stack up without you noticing. The vendor SDK retries by default, an agent SDK might retry, and so does your harness. I set the vendor clients to `max_retries=0` and keep all retries in one module. Retry rate limits and server errors with backoff, and never retry quota or auth errors.

The context layer can move scores a lot. Providers cache by prefix, so changing anything early in the request, like a timestamp, means you lose the cache discount for everything after it. Compacting rewrites the prefix too, so do it rarely. On ARC-AGI-3, OpenAI reported the same model scoring 13.3% with the official harness and 38.3% with its own, which kept the model's reasoning and compacted history instead of dropping it.

For safety, a rule in the prompt is only a suggestion. A sandbox limits what a command can touch, and an approval policy decides what needs a human yes. Anthropic's data has people approving 93 to 97% of permission prompts, so let the sandbox make most actions safe and keep approvals for the few that can't be undone.

For crashes, saving only between turns means a resumed model asks for the same tools again and a side effect runs twice. Save after every tool result, and give side-effecting tools idempotency keys to cover the call that was running when the process died.

None of this makes the harness more important than the model. The Terminal-Bench 2.0 authors wrote that "model selection is usually more important than agent scaffold". But on that same benchmark, GPT-5 ranged from 33.9% to 49.6% depending on the harness. The way I see it, the model sets the ceiling and the harness decides how close you get. The harness also decides whether you can ship, because no benchmark checks whether your agent leaked a secret or lost an hour of work to a deploy.

If I started again, I'd begin with a tiny loop plus traces, and add one piece each time I saw a real failure.
