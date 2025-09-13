## Demo Mode Content Pack — How-To

This guide explains how to author, record, and package Demo content.

### Where files live
- Pack JSON: `src/assets/demo/demo-pack.v1.json`
- Media: `src/assets/demo/media/` (WebP preferred)
- Asset map: `src/services/demo/demoAssets.ts` (`asset:key` → require mapping)
- Loader: `src/services/demo/DemoContentService.ts`
- Router: `src/services/demo/DemoPlaybackRouter.ts`
- Dev recorder: `src/services/demo/Recorder.ts`
- Packer script: `scripts/demo/packer.mjs`

### Authoring manually
1) Add Chat samples
- For each provider combo (e.g., `claude+openai`), add IDs in `routing.chat` and objects in `chats[]`.
- Use `speakerProvider` on assistant events: `claude` | `openai` | `google`.
- Use a first `message` event with `role: 'user'` as the prompt.
- Split assistant content into multiple `stream` events for typing feel.

2) Add Debate samples
- For each pair and persona (`default`, `George`, `Prof. Sage`), add IDs in `routing.debate` and `debates[]`.
- Alternate assistant messages; include `speakerProvider` and optional `speakerPersona`.

3) Add Compare samples
- For each pair, add IDs in `routing.compare` and `compares[]`.
- Populate `runs[0].columns[]` with `name` = provider label and assistant events.

4) Images and tools
- Images: add WebP to `src/assets/demo/media/`, map a key in `demoAssets.ts`, reference with `uri: "asset:key"` in an `image-grid` event.
- Tools: use `tool-start` and `tool-end` with `tool: { name, arguments, result }`.

### Recording and packing (semi-automated)
1) Capture in dev
- Call `startRecording({ type, id, title, comboKey })` at the start of a session.
- Record each chunk/event with `recordEvent({ type, role, content, speakerProvider, ... })`.
- On finish, call `stopRecording()` and save the JSON to `scripts/demo/recordings/<name>.json`.

2) Pack
- Run `node scripts/demo/packer.mjs` to append recordings into the pack and update routing.

### Naming conventions
- IDs: `chat_c_sql_v1`, `debate_co_george_1`, `compare_og_itinerary_v1`
- Combos: `c=claude`, `o=openai`, `g=google`; routing keys use full provider ids (e.g., `claude+openai`).

### Tips
- Keep samples concise and varied (5–12 assistant chunks).
- Mark simulated behavior in copy (e.g., “Simulated search”).
- Ensure neutral, brand-safe content.
- Target total demo bundle ≤ 8 MB compressed.

