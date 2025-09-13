# Demo Content Authoring Guide

This guide shows how to create the content used by Demo Mode.

## What you create
- A single JSON pack at `src/assets/demo/demo-pack.v1.json` with:
  - `chats`: pre-recorded chat sessions
  - `debates`: pre-recorded debates
  - `compares`: pre-recorded compare runs
  - `assets`: optional map of logical names → asset paths
- Optional media under `src/assets/demo/media/` (WebP preferred)

## Quick start (manual authoring)
1) Duplicate the sample chat in `demo-pack.v1.json` and change:
- `id`, `title`
- `events`: build a sequence of `message` (full bubbles) and `stream` (chunked text) events.

Example chat events:
```
{
  "id": "chat_sql_cte",
  "title": "Explain SQL CTE with example",
  "events": [
    { "type": "message", "role": "user", "content": "Explain CTEs with a simple example." },
    { "type": "stream", "role": "assistant", "content": "CTEs are named subqueries that…" },
    { "type": "stream", "role": "assistant", "content": "\n\nHere’s a quick example:" },
    { "type": "stream", "role": "assistant", "content": "\n```sql\nWITH totals AS (SELECT …)\nSELECT … FROM totals;\n```" }
  ],
  "tags": ["sql", "sample"]
}
```

2) For images, add WebP files to `src/assets/demo/media/` and wire them:
- Add a key → require mapping in `src/services/demo/demoAssets.ts`:
```
export const demoAssets = {
  kyoto_map: require('@/assets/demo/media/kyoto-map.webp'),
};
```
- Reference it from an event using `asset:` prefix:
```
{ "type": "image-grid", "attachments": [ { "type": "image", "uri": "asset:kyoto_map", "alt": "Kyoto map" } ] }
```

3) Tools/citations: use `tool-start`/`tool-end` with lightweight arguments/results; add ‘Simulated’ in copy.

4) Debates/compares: author similar `events` arrays with alternating roles (assistant/user) or left/right columns.

## Recommended workflow (semi-automated)
- Use a dev-only recorder to capture real sessions (stream chunks, image/tool events, and delays), then curate and paste into the pack.
- We can add this recorder for you in `scripts/demo/` if desired.

## Authoring tips
- Keep sessions concise and believable; aim for 5–12 assistant chunks per answer.
- Prefer WebP images ≤ 200–300 KB each; keep total bundle ≤ 8 MB.
- Label simulated content truthfully in prose (e.g., “Simulated search”).
- Avoid real PII or claims; you can neutralize provider/model names if needed.

## Validation
- Static typecheck ensures JSON structure is correct (tsconfig resolves JSON modules).
- Playback adapters use the events as-is to render streaming and attachments.

## Where it’s used
- `DemoContentService.getPack()` returns the pack; playback adapters will read `chats`, `debates`, `compares` to drive UI.

## Next steps (we can build for you)
- Add a dev recorder and packer script (capture → curate → emit pack JSON + asset map).
- Add a “Demo Samples” list on Chat/Compare screens to pick and replay samples.

