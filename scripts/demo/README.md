# Demo Recorder & Packer

This folder contains a simple pipeline to turn recorded sessions into the `demo-pack.v1.json` used by the app.

## Workflow
1. Enable **Record Mode** in Settings inside the app.
2. Start the demo packer bridge in another terminal so recordings are persisted and the pack is rebuilt automatically:
   ```bash
   npm run demo:packer
   ```
3. Record sessions in development (see `src/services/demo/Recorder.ts`).
4. From the in-app prompt, choose **Append to Pack (dev)** after stopping a recording. The bridge writes to `scripts/demo/recordings/*.json`, reruns the packer, and the UI refreshes immediately.
5. Validate the library before committing changes:
   ```bash
   npm run demo:validate
   ```

> Drafts: recordings whose IDs include `_rec_` are treated as work-in-progress. They remain in `scripts/demo/recordings/` for review but are omitted from Demo mode routing until you rename them to a canonical ID and rerun the packer.

## Commands
Node 18+ required.

```
# Rebuild demo-pack.v1.json from the checked-in recordings
npm run demo:pack

# Start the auto-append bridge (used by Record Mode)
npm run demo:packer

# Export the current pack into individual recordings (useful for reviews)
npm run demo:unpack

# Sanity-check counts/topic formatting
npm run demo:validate
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
