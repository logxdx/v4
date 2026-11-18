---
title: "Sandboxing coding agents on my own machine"
short: "Sandboxing agents"
description: "How I'd keep a coding agent away from my secrets on macOS and Linux, from Seatbelt and bubblewrap up to gVisor."
date: "2026-09-29"
areas: [agents]
tags: ["Seatbelt", "bubblewrap", "Landlock", "seccomp", "gVisor", "Prompt injection"]
experiment: true
---

When you give a model a shell or a `run_python` tool, whatever it writes runs on your machine, as you. Your SSH keys, cloud credentials and `.env` files are one `cat` away, and nothing in the tool-calling protocol limits what `pytest` or `pip install` can do. Any limit has to come from your harness.

The risk I worry about most is Simon Willison's lethal trifecta. If an agent can see private data, reads untrusted content like a GitHub issue or a web page, and has some way to send data out, it can be talked into leaking that data. Prompt injection is still unsolved at the model layer, so the job of a sandbox is to take away one of those three. Filesystem isolation and a clean environment take away the private data, and blocking the network takes away the way out. Leaking doesn't need a raw socket either. A DNS lookup for `SECRET.attacker.example` is enough, and CVE-2025-55284 was exactly that, with Claude Code before v1.0.4 auto-approving `ping`, `nslookup` and `dig`.

Approval prompts and Python-level guards don't hold up well on their own. Anthropic reports users approving 93% of Claude Code permission prompts, and in a study of 1,053 testers people caught a planted dangerous command only 13.6% of the time. 13.6%! In-process guards like audit hooks are easy to get around too. CPython's own docs say `sys.addaudithook` is "not suitable for implementing a 'sandbox'", and native code or a plain `os.stat` slips past it. With a careful subprocess runner and no OS wrapper, the probe read a planted secret with NO trouble at all, then wrote outside the workspace, opened a TCP connection and resolved DNS.

So the boundary has to come from the OS. On macOS that's Seatbelt, run through `sandbox-exec`. It has been marked deprecated since roughly 2017, yet Codex, Claude Code and Chrome all rely on it. Here is the profile and how to run it.

```scheme
;; agent.sb (macOS 26.5.2, Apple silicon)
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow file-read*)                        ; simple but broad: ~/.ssh stays readable
(deny file-read* (subpath (param "SECRETS")))
(allow file-write*
  (subpath (param "WORKSPACE"))
  (literal "/dev/null"))
;; no (allow network*) rule, so all network access is denied, DNS included.
;; no (allow mach-lookup): a broad mach-lookup lets code ask launchd to start
;; processes outside the sandbox (for example via `open`).
```

```bash
WS=$(cd workspace && pwd -P)      # resolved real paths only
SECRETS=$(cd ~/.ssh && pwd -P)    # a directory to hide; add one deny rule per location
cd "$WS" && sandbox-exec -f ../agent.sb -D WORKSPACE="$WS" -D SECRETS="$SECRETS" python3 main.py
```

Seatbelt matches resolved paths, which is why those `pwd -P` calls matter. A workspace passed as `/tmp/...` silently fails its own write rule, because the kernel sees `/private/tmp/...`. For proper read isolation, list the readable paths instead of denying a few.

On Linux the main tool is bubblewrap, which builds a fresh namespace view without root. This recipe works unchanged on Debian 12 and Ubuntu 26.04.

```bash
WS="$(realpath ./workspace)"
bwrap \
  --ro-bind / / \
  --tmpfs "$HOME" \
  --bind "$WS" "$WS" \
  --tmpfs /tmp \
  --dev /dev \
  --proc /proc \
  --unshare-all \
  --die-with-parent \
  --new-session \
  --cap-drop ALL \
  --clearenv \
  --setenv PATH /usr/local/bin:/usr/bin:/bin \
  --setenv HOME "$WS" \
  --chdir "$WS" \
  -- python3 main.py
```

The empty tmpfs over `$HOME` hides `~/.ssh` and `~/.aws`, and `--unshare-all` leaves only loopback. On Ubuntu 24.04 it fails with `bwrap: setting up uid map: Permission denied`, because of an AppArmor restriction. Fix A below is the one to use.

```bash
# Fix A (preferred, scoped to /usr/bin/bwrap)
sudo apt install apparmor-profiles
sudo install -m 0644 /usr/share/apparmor/extra-profiles/bwrap-userns-restrict /etc/apparmor.d/
sudo apparmor_parser -r /etc/apparmor.d/bwrap-userns-restrict
# Fix B (host-wide; weakens every process)
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

Landlock is an extra Linux layer that lets a process restrict itself without root, though UDP rules only arrived in kernel 7.2, so on most kernels DNS still gets through. For stronger isolation there's a hardened Docker container, which shares the host kernel.

```bash
docker run --rm -i \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --mount type=bind,src="$PWD/workspace",dst=/workspace \
  -w /workspace \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 128 \
  --memory 512m --memory-swap 512m \
  --cpus 1 \
  --ulimit nofile=256:256 \
  --init \
  python:3.13-slim \
  timeout 60 python /workspace/main.py
```

Adding `--runtime=runsc` puts gVisor, a user-space kernel, in between. The same flags work, though in one test its 512 MB memory limit killed the WHOLE sandbox instead of returning an error. Never mount `docker.sock` and never pass your API keys in with `-e`.

Here is how the options compare.

| Option | Isolation strength | Setup cost | What breaks |
|---|---|---|---|
| Approval rules | None (advisory) | Low | Prompt fatigue; forbid-lists are easy to sidestep |
| In-process Python guards | Very weak | Low | `stat`, native code, introspection |
| Subprocess hygiene | Resources only | Low | `setsid` escapes `killpg`; absolute `RLIMIT_AS` on macOS |
| Seatbelt | Strong for mistakes and injection | Medium | Unresolved paths silently miss; reads open by default |
| bubblewrap + seccomp | Strong for mistakes and injection | Medium | Ubuntu 24.04 AppArmor; fails inside default Docker |
| Landlock | Filesystem plus TCP | Medium | UDP/DNS open below kernel 7.2; pre-existing threads before ABI 8 |
| Hardened Docker (runc) | Similar to an OS sandbox; shared kernel | Medium | `noexec` `/tmp` breaks some pip builds |
| gVisor | Stronger: separate syscall surface | Medium | Memory budget; different errno values |
| microVM (Firecracker, Kata) | Strongest | High, or buy it | Not tested locally |

For the network, the sandbox gets none of its own and can only talk to a proxy on the host that enforces a domain allowlist. Secrets never go inside the sandbox, and the proxy attaches the real token on the way out, only for allowed hosts.

On my own laptop I'd use Seatbelt with an explicit list of readable paths on macOS, or the bwrap recipe plus a seccomp filter on Linux, with the network going through a host proxy in both cases. For code I don't trust at all, I'd use gVisor, a microVM or a hosted sandbox. Whatever you pick, run a small probe script inside it that tries to read a fake secret, write outside the workspace and reach the network, and make the harness refuse to run if the sandbox binary is missing. Every option here had at least one surprise on some platform, so it's worth checking on your own setup.
