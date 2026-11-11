# config-builder-example

Edge request router: a wizard that builds a tree of routing conditions and actions and saves it as one
JSON value (`ROUTER_CONFIG`) on one FastEdge app. It reopens on the deployed app to edit the tree (Re-entry).

It's the G-Core reference for wizards that build one complex config. **Start with `src/deployment.js`**: it shows how the
form binds to the app (`ROUTER_CONFIG` on Ref `main`) in both modes. See
[`context/wizards/config-builder-example/DOCS.md`](../../../context/wizards/config-builder-example/DOCS.md)
for the config format, field map, size limits and build notes.

```bash
pnpm install && pnpm test
pnpm run dev      # mock host on http://localhost:9999 — add ?mode=reentry to edit the fixture deployment
```
