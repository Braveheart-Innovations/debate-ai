# v3 — One Symposium: Analyze on Mobile, Optional Account Keys

Status: **Plan v1** (2026-10-18). Step 0 shipped in web 2.9.7 (Watches, 2026-10-23, web #289). Decision owner:
Michael. Mobile 2.4.1 is in store review. v3 is "the
unified release that brings Analyze to mobile" (web `docs/analyze-beyond-reports-plan.md`, header).
Related (web repo): `docs/analyze-server-loop-plan.md` (the server loop; "Mobile can't run Analyze" was one of
its reasons), `docs/analyze-agents-architecture-plan.md` Part E (Phase 4: Mobile + Watches),
`docs/architecture-security-spec.md` §5 and §13 (key custody and its known limits).

**How this plan works: it's iterative.** Each step ships on its own, is useful on its own, and is live-tested
before the next step is designed in detail. Steps 0–2 are written to build. Steps 3–7 are outlines: when one
comes up, re-measure it against all three codebases first (a "Going in" section, as the web plans do), then
bring Michael its design. What a step teaches can reorder or reshape the steps after it.

## The answer

1. **Analyze can come to mobile, because the server already runs it.** The loop, tools, sandbox, uploads,
   review and teams run in Functions (`functions/src/analyze/engine/`). A client starts turns with callables
   and reads results from Firestore. Nothing checks the platform. Premium bought in the app passes the server's
   gate (`usageTracking.ts:536-543` accepts `isPremium`, which `validatePurchase.ts` and the store
   notification handlers write). The web already counts mobile premium (web `BillingContext.tsx:329-334`).
2. **Analyze needs keys on the server.** A run chains 20-minute steps, waits on plan approvals, and Watches run
   on a schedule with no client present. The server reads keys only from `users/{uid}/apiKeys`
   (`getDecryptedApiKey`, `apiKeys.ts:174`), and no request carries one. Mobile keeps every key in one
   SecureStore item and has never called `saveApiKey` (`src/services/apiKeys/apiKeyStorageCore.ts`).
3. **Account keys are optional on mobile** (Decision 1). Each provider has its own "Add to my account". Chat,
   Compare, Debate and Create keep calling providers from the phone with the phone's key. Analyze uses the
   account copy. A key the user never adds stays on the phone, and the copy says exactly that.
4. **Most of the work is the mobile UI.** The web Analyze client is about 60k LOC. The part that starts and
   follows runs is about 1.5k LOC of plain TypeScript and ports (web `services/analyze/server/`,
   `context/analyze/useAnalyzeRunSubscription.ts`, `serverRunState.ts`, the reducer). The output views are
   the bulk: native for text, tables and status; a WebView for charts, maps and interactive HTML.

## Where things stand (measured 2026-10-18)

| Area | Today | For v3 |
|---|---|---|
| Analyze loop | Server: Cloud Tasks `analyzeRunStep`, 30-minute deadline, rounds chained in 20-minute steps (`analyze/engine/step.ts:46-51`) | Ready |
| Starting a turn | `analyzeStartTurn` takes the system prompts and the tool list from the client (`analyze/engine/callables.ts:132-194`). The web builds them (web `services/analyze/prompt/buildAnalyzeSystemPrompt.ts`, 340 LOC, plus `ToolRegistry`) | The server builds them (Step 3) |
| Following a run | Firestore listeners on `analyzeRuns`, `runEvents` (~250 ms batches, 24 h TTL), `messages`, `artifacts`, `reviewItems`; owner reads, nobody writes (`firestore.rules`, `analyzeRuns`) | Mobile already has `@react-native-firebase/firestore` |
| Session doc and title | Written by the web client: the session doc (History's count, time, preview) and the title (web `services/history/SessionTitleService.ts`, a model call from the browser). The engine never writes `users/{uid}/conversations/{sessionId}` itself; the server-loop plan lists this as a follow-up ("Session summary") | The server writes them (Step 3) |
| Notifications | `users/{uid}/notifications/{id}`, four kinds (`analyze/engine/notifications.ts:22`), read by the web bell; the file's header already says "Phase 4 mobile push will" | Mobile push (Step 4). Mobile has no push library today |
| Uploads | `analyzeUploads`: 4 MB base64 chunks with a sha256; 100 MB per file, 500 MB total, checked on the web client (web `PromptBar.tsx:59`) | `expo-document-picker` + `expo-crypto` (Step 5) |
| Exports | PDF/PPTX/DOCX built in the browser (~9k LOC; won't port). The server pipeline (`createExportJob` → `runExportJob`) exists; no UI calls it | Mobile uses the server pipeline (Step 6) |
| Keys | Mobile: SecureStore, direct to providers. Web: AES-256-GCM in Firestore, server-proxied | Optional account keys (Steps 1–2) |
| Who can use Analyze | Server: 5 free Analyze sessions, lifetime; premium and trial uncapped. Mobile: non-premium users are in demo mode and can't enter keys (`APIConfigScreen.tsx:189-200`) | Premium and trial only on mobile (question 6) |
| App Check | Mobile initializes it (`src/services/firebase/appCheck.ts`); nothing enforces it | Enforce before v3 (Step 7) |
| Sandbox limits | 3 awake sandboxes per user, and the daily ceiling decided in the server-loop plan (Decisions, item 5): 12 sandbox-hours per user per UTC day (`DAILY_SANDBOX_CEILING_MS`, `sandbox/callables.ts:41`) | Shipped with Watches (Step 0, 2.9.7) |

## Decisions

1. **(Michael, 2026-10-18) Account keys are optional on mobile.** One choice per provider. The phone keeps
   calling providers directly for Chat, Compare, Debate and Create, and nothing about those modes changes. A
   key goes to the server only when the user adds it.
2. **(Michael, 2026-10-18) v3 is reached in steps,** each shipped and live-tested before the next is designed in
   detail.

## The steps

| Step | Ships as | What | Useful on its own because |
|---|---|---|---|
| 0 | web 2.9.7, with Watches | Groundwork: mobile-ready notifications, the sandbox ceiling, the server-written session summary, watch writes behind callables, the stale privacy line | Watches needs most of it anyway |
| 1 | Functions PRs | Key custody hardened before more keys arrive; a key fingerprint | Every stored key is safer, web included |
| 2 | mobile 2.6.0 | Optional account keys | A key entered on the phone works on symposiumai.app |
| 3 | Functions PRs + web 2.9.10 | The server builds prompts, tool lists, the session doc and the title | One copy of the prompt; server-started turns (Run again, review hand-off, watches) use current prompts |
| 4 | mobile 2.7.0 (native) | Analyze companion: sessions, results, approvals, push | Follow and approve a web run from the phone |
| 5 | mobile 2.8.0 | Start Analyze on the phone | The whole loop from the phone |
| 6 | mobile 2.9.0 + Functions | Depth: models, review, exports, watches, diagrams | The phone does what a phone does well |
| 7 | 3.0.0, both apps | The unified release | Start on the phone, finish on the laptop |

Version numbers are proposals (question 1). Steps 1 and 3 have no app release of their own; they deploy when
their PRs merge. Renumbered 2026-10-23 (Michael): mobile 2.5.0 became the Expo patch set, Kimi K3.1 Pro and
dependency release, and web 2.9.8 the Kimi K3.1 Pro and Mermaid 12 release, so every step below moved up one.
Renumbered again 2026-10-24 (Michael): web 2.9.9 is the Salesforce `access` operation (web
`docs/salesforce-audit-operations-plan.md`, D8), so Step 3 is web 2.9.10.

### Step 0: groundwork in web 2.9.7

Written into the 2.9.7 plan: web `docs/analyze-beyond-reports-plan.md`, "Also for 2.9.7: groundwork for v3".
In short:
- A watch's notification carries a server-written title and body plus what a phone needs to open it.
- The daily sandbox ceiling lands with Watches, because scheduled runs spend sandbox time with nobody watching.
- The server writes the session summary, so a watch run (or any run that ends with no tab open) shows in History.
- Watches are turned on, changed and paused through callables, so the phone needs no copy of the validation.
- The privacy page's mobile line about "cloud sync", a setting mobile doesn't have, is fixed.
- If the automatic Update report is chosen: it reuses the prompt the web last sent, until Step 3.

### Step 1: key custody before more keys (Functions)

Why: mobile users will add keys the server holds. Fix the custody weak spots while few keys are stored
(security spec §13).

1. **A version on every key record.** Today one `ENCRYPTION_KEY` derives the data key through `scrypt` with the
   static salt `'symposium-salt'` (`apiKeys.ts:13`), and records have no version, so rotating the secret means
   a re-encryption migration. Add `keyVersion`. New and re-saved records use the new scheme; old ones still
   decrypt. The same secret encrypts data-service keys (`dataConnectorCrypto.ts`), which get the same
   treatment. Per-record salt on the current secret, or envelope encryption with Cloud KMS: question 2.
2. **A fingerprint, so the phone can tell whether the account copy is its key.** Store the first 12 hex
   characters of the key's SHA-256 with the record, and return it from `getConfiguredProviders`
   (`apiKeys.ts:147`; today it returns only `{providerId, updatedAt}`). The phone hashes its own key and
   compares them. Provider keys are long random strings, so a short hash can't be reversed or guessed.
   Records saved before the change have no fingerprint until they're saved again: show "added on the web".
3. **Clean-up:** `index.ts:95` says the Analyze callables are "allowlisted until the v2.6 cutover". No
   allowlist exists.

Check: functions tests; a key saved before the change still decrypts; a web Chat still works after a key is
re-saved.

### Step 2: mobile 2.6.0, optional account keys

Goal: for each provider, the user can add the phone's key to their account, see whether the account has a key
and whether it's the phone's, update it and remove it. Nothing else changes.

**First job: bring Michael the account row's design (its states and copy) before writing code.**

The account row, on each provider card (`src/components/organisms/api-config/ProviderCard.tsx`):

| State | Action |
|---|---|
| Not in your account | Add to my account |
| In your account, same as this phone | Remove from account |
| In your account, a different key | Update account copy, Remove from account |
| In your account, added on the web (no key on this phone, or no fingerprint yet) | Remove from account |

- **Each provider has its own button**, never "add all" ([[global-actions-need-explicit-opt-in]]).
- **The first Add explains, once,** what it does: the key is encrypted on our servers and used for work that runs
  there (Analyze, and symposiumai.app). It also says what doesn't change (Chat and the other modes still go
  straight from the phone) and how to remove it.
- **Test, then save.** The phone tests the key with the provider (`src/services/ConnectionTestService.ts`), then
  calls `saveApiKey`. The phone's own save today happens before its test (`src/hooks/useAPIConfigHandlers.ts:52-57`);
  the account copy must not.
- **Keep the copies in step:**
  - Deleting the key on the phone asks whether to remove the account copy too.
  - Changing the phone's key, when the account copy was the old one, offers "Update account copy".
- **Status** comes from `getConfiguredProviders` plus the fingerprint (Step 1), refreshed when the screen opens.
- **Provider IDs already match:** the ten AI providers, ElevenLabs and Runway (`apiKeys.ts:49-56`,
  `src/config/aiProviders.ts`). Brave (for Analyze's web search, `web_search.ts:90`) waits for Step 5.

**Copy changes in the same release.** The new wording: "Your keys stay on this phone unless you add them to your
account."
- `APISecurityNote.tsx:18-19` ("We never send keys to our servers")
- `src/config/help/faq.ts:60`
- `src/config/help/topics.ts:190` and `topics.ts:229-232`
- Web: the privacy page's mobile section (`privacy/page.tsx:63`) and the FAQ (`faq/page.tsx`, "Where are my keys
  stored?"). **The web deploys before the mobile release.**
- App Review notes: v2.3 and v2.4 say the keys are stored only on the device. New notes for 2.5.
- App Store privacy labels and Play Data safety: an account key is data that leaves the device, linked to the
  user, for app functionality. Check the exact category in App Store Connect and Play Console.
- **Already wrong, whatever else changes:**
  - `WelcomeScreen.tsx:351` says "No sign-up required", and `faq.ts:25` says "No account is required".
  - Entering keys needs a trial (`APIConfigScreen.tsx:189-200`), and a trial needs sign-in
    (`UpgradeScreen.tsx:106`).

**Release:** a store release, not an OTA, because the data practice changes (question 3). Marketing version
and `runtimeVersion` 2.6.0, through `npm run release:build`.

Check (live, on a device):
- Add a key on the phone. Web Settings shows the provider as configured, and a web Chat with it works.
- Change the phone's key: the row says "a different key". Update: it says "same as this phone".
- Remove it from the account: web Settings shows it as not configured.
- Phone Chat works throughout.

### Step 3: the server builds what a second client would copy (Functions + web 2.9.10)

Why: today the web builds the Analyze system prompts, the tool list, the session doc and the title. A phone
would need copies, and copies drift. Server-started turns (Run again, review hand-off) reuse the
`followUpSystemPrompt` the client last sent (`analyze/engine/runStore.ts:95`).

1. **`analyzeStartTurn` takes the inputs, not the prompt text.** The inputs: the output selection, the
   deliverable, connectors, Team mode, the Salesforce workspace flag and the roster. The server builds the
   operator, follow-up and subagent prompts and the tool list. `buildAnalyzeSystemPrompt.ts` and
   `baseSystemPrompt.ts` move into `functions/src/analyze/`. Some of what they import already reaches Functions
   through `npm run analyze:contract` (`data-connectors`). Going in, list the rest (`FileMetadata` for Salesforce
   detection, `describeMember`, `renderOutputSelectionInstructions`).
2. **Cutover.** The callable accepts both forms. The web switches in 2.9.10. Then the text fields leave the
   callable and the builder leaves the web: removed, not kept as a fallback.
3. **The server writes the session doc** on the first turn and its summary when a run ends. **It titles the
   session** after the first turn. Check `firestore.rules`' field allowlists on `conversations/{id}`, so client
   and server writes don't collide.
4. **Parity first:** before the web copy is deleted, a test pins the server-built prompts to what the web builds
   for the same inputs.

Check: the golden prompts (charts, Excel export, map, model, Salesforce audit, team plan) on the dev server
against production, with prompts built on the server.

### Step 4: mobile 2.7.0, the Analyze companion (outline)

Goal: everything a phone needs to follow Analyze work started on the web. It's the web plan's Phase 4 "Mobile
v1" without starting runs.
- **Where Analyze lives.** Mobile has five tabs: Home, Debate, Compare, Create and History
  (`src/navigation/AppNavigator.tsx`). A sixth is a lot for a phone (question 4). Tablets have the sidebar
  (`TabletSidebar.tsx`).
- **History** lists Analyze sessions from Firestore. Mobile History is local today (`src/services/chat/StorageService.ts`).
- **A session** shows:
  - the transcript, as native markdown;
  - run and lane status from `runEvents`;
  - the team plan card (approve, decline, work solo through `analyzeRunControl`);
  - Stop.
  Approving uses the account keys the web user already saved.
- **Outputs** are listed like the web's output cards. Reports, models and diagrams open read-only.
  - Charts and maps go in a WebView, with vega, vega-lite and vega-embed bundled in the app rather than taken
    from a CDN.
  - Interactive HTML goes in a WebView that keeps the web's isolation (security spec §7): no bridge to the app,
    no app storage, navigation only.
  - Decide each output type in this step's design. Some may be better as server-rendered pictures
    (`exports/vegaRenderer.ts` exists).
- **Push:**
  - The client: `@react-native-firebase/messaging`, which fits the existing Firebase stack, added through a
    config plugin ([[native-customizations-need-config-plugins]]).
  - Device tokens are stored at `users/{uid}/devices/{id}`.
  - A Functions trigger on a new `users/{uid}/notifications/{id}` sends the push. Tapping it opens the session.
  - Ask for notification permission the first time the user follows a run, not at launch.
- **Release:** native, so a store release with `runtimeVersion` 2.7.0.

Check: start a team run on the web and lock the phone. "Plan needs approval" arrives; approve it on the phone,
watch the lanes finish, and open the report.

### Step 5: mobile 2.8.0, start Analyze on the phone (outline)

- **The composer:**
  - the question;
  - an operator from the providers with an account key, plus teammates and a reviewer;
  - Auto, Report or Model;
  - Team mode.
  Needs Step 3.
- **A provider with no account key** offers Step 2's "Add to my account" in place. Perplexity can't run Analyze
  (`providers/registry.ts:31-42`).
- **Brave** joins as an account-only key, for web search.
- **Uploads:**
  - `expo-document-picker` → `analyzeUploads`, with the sha256 from `expo-crypto`.
  - The same types and limits as the web.
  - An upload finishes only while the app is open: say so.
- **Limits:** the server's free-tier refusal (`resource-exhausted`, `analyze-free-limit`) opens the mobile
  upgrade screen, not Stripe.
- **Answering a question the AI asked** (`ask_user`) is a new turn, so it comes here, not in Step 4.

Check: the golden prompts started on the phone, then the same session continued on the web.

### Step 6: mobile 2.9.0, depth (outline)

- **Models:** the parameter form and scenarios (`analyzeRunRecipe`), native.
- **Review queue:** verify, dismiss, send to operator (`analyzeReviewControl`).
- **Exports:** PDF through the server pipeline, then the share sheet. First close the PDF renderer's `file:`
  scheme (`exports/browserService.ts:125,155` still allows it; security spec §13).
- **Watches** (from web 2.9.7): see a watch's runs and notices, pause and resume, and turn one on if Step 0 put
  watch writes behind callables.
- **Diagrams:** read-only SVG (web `diagramSvg.ts`) through `react-native-svg`. Editing stays on the web.
- **Data-service keys** (`saveDataServiceKey`), account-only.

### Step 7: 3.0.0, the unified release (outline)

- **Both apps 3.0.0,** with one set of release notes and store copy.
- **App Check enforced** on Functions and Firestore, once the console shows healthy verified traffic from the
  mobile versions in the field and from the web (`docs/APP_CHECK.md`).
- **What each platform does,** in Help: the Salesforce workspace and diagram and report editing are web-only,
  because they need folders on disk, a CLI or a big screen. The phone opens their outputs.
- **Revisit Decision 1** with what Steps 2–6 showed: how many mobile users added account keys, and whether a phone
  with no key of its own should be able to chat through an account key. Today a key added on the web can't
  reach mobile Chat, because the server never returns keys; that would need a server-proxied path on mobile.

### Stays on the web

- The Salesforce workspace: the folder picker (`showDirectoryPicker`, Chromium only), remembered folders,
  folder polling, the CLI kit and the Claude Code/Codex handoff.
- Diagram editing (the inspectors), report editing (the spec editor with undo), the multi-pane layout.
- Building PDF/PPTX/DOCX on the client.

## Ask Michael (before the step that needs it)

1. **Version numbers:** mobile 2.6 → 2.9 and web 2.9.10, then 3.0.0 on both. Or fewer mobile store releases,
   since each is a review cycle. Other mobile work can ride in any of these releases.
2. **Step 1:** a per-record salt and key version on the current secret, or envelope encryption with Cloud KMS.
3. **Step 2:** a store release, not an OTA (recommended: the data practice changes).
4. **Step 4:** where Analyze lives on the phone: a sixth tab, inside Home, or in place of another tab.
5. **Step 4:** tablets: the phone layout in the sidebar, or a wider layout of their own.
6. **Step 5:** Analyze for demo users: none (recommended; they have no keys), or a recorded session like the
   other modes' demos.
7. **Step 7:** whether account keys become the default for new mobile users.

## Working rules

- **Functions:** small PRs to `master`; each merge deploys and needs Michael's approval. Rules and indexes deploy
  by hand. Deploy Functions before the client that needs the change.
- **Mobile:**
  - `npm run check:app` before every commit.
  - Releases only through `npm run release:build` and `npm run release:submit`, with the marketing version and
    `runtimeVersion` bumped on every store release.
  - Native changes only through config plugins.
- **Web:** one branch per release, merged to `main` with release notes and a version bump. Never run
  `next build` in Michael's checkout.
- **No arbitrary caps** on sizes, counts or rounds.
- **Live tests** on a device or emulator against production, signed in as Michael.
- **Shared Analyze code** reaches Functions through `npm run analyze:contract`. If mobile needs any of it (it's
  pure TypeScript), decide in Step 4 how mobile takes it.

## Start here (fresh session)

- **Step 0** rides with web 2.9.7; its items are in that plan.
- **Step 1** can start now in Functions; nothing depends on it except Step 2.
- **Step 2** starts with the account row's design for Michael (see Step 2), then the code.
