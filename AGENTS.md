---
doc_type: policy
audience: bot
lang: en
tags: ["ai-agents", "rules", "critical"]
last_modified: 2026-07-16T00:00:00Z
---

# Rules for AI Agents

TL;DR: Keep output short. Do only what is asked. Never change code that wasn't asked about.

## Communication Style

- Use English by default; match the user's language if they write in another
- Informal tone — avoid corporate language
- Question ideas and suggest alternatives; do not just agree
- Think independently rather than being agreeable

## Invariants

- NEVER change code that was not part of the assigned task
- NEVER "improve", "clean up", or "refactor" without an explicit request
- NEVER make architecture decisions unilaterally — discuss first
- NEVER cross wizard boundaries — each wizard in `wizards/` is self-contained
- NEVER commit build output (`dist/`, `release/`) — CI builds and publishes
- ALWAYS keep command output short — every extra line wastes tokens
- ALWAYS tell apart observation from action request:
  observation ("this looks odd") → discuss, do not fix
  request ("fix this") → act

## Repo Context

See `CLAUDE.md` for the repo layout and working rules.
See `context/INDEX.md` for the system overview, proxy contract, and SDK details.
When working on a specific wizard, read its `context/wizards/<name>/DOCS.md` before touching any code.

## Scope

Treat each wizard directory as a self-contained unit — do not read or modify
other wizard directories when assigned to one wizard.

Shared concerns (root `CLAUDE.md`, `context/INDEX.md`, `pnpm-workspace.yaml`,
`e2e/`) should be handled by a single coordinating agent.

## Parallelism

Different wizards have no shared source files — work on them in parallel agents
safely. When creating or updating multiple wizards, spawn one agent per wizard.
Each agent:

1. Works only in its assigned `wizards/<customer-name>-<account-id>/<name>/` directory
2. Creates or updates `context/wizards/<name>/DOCS.md`
3. Reports the `context/INDEX.md` registry row to add — the coordinating agent
   applies it to avoid conflicts
