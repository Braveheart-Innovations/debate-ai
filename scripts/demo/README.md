# Demo Recorder & Packer

This folder contains a simple pipeline to turn recorded sessions into the `demo-pack.v1.json` used by the app.

## Workflow
1) Record sessions in development (see `src/services/demo/Recorder.ts`).
2) Export each session to `scripts/demo/recordings/*.json`.
3) Run the packer to merge recordings and update `src/assets/demo/demo-pack.v1.json`.

## Commands
Node 18+ required.

```
node scripts/demo/packer.mjs
```

## Inputs
- `scripts/demo/recordings/*.json` where each file contains a minimal shape:
```
{
  "type": "chat",
  "id": "chat_custom_id",
  "title": "Human-readable title",
  "comboKey": "claude+openai", // for chat/compare; for debate, use "claude+openai:George"
  "events": [ /* DemoMessageEvent[] */ ]
}
```

## Outputs
- Updates `src/assets/demo/demo-pack.v1.json` by appending chats/compares/debates and routing entries.

