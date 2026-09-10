---
name: wizard-intake
description: Gather FastEdge template params from the Gcore API and write wizards/<customer-name>-<account-id>/<name>/TARGET.md + mock-ready fixture templates. Args: [wizard-name] [template-id-or-name ...]
---

Kick off wizard development by understanding the target template(s) before writing any code.

Use the `fastedge-assistant` MCP tool (`gcore_api`) to fetch template details from the Gcore API. Then follow the full step-by-step instructions in `.claude/agents/wizard-intake.md`.

**Args** (optional — confirm interactively if not supplied):
- First arg: wizard name (kebab-case directory under
  `wizards/<customer-name>-<account-id>/`, or `wizards/gcore/` for a
  G-Core-owned wizard)
- Remaining args: template IDs or names. **List the primary/launch template first**, companions after. For edge-totp that's the CDN filter first, the app second.
