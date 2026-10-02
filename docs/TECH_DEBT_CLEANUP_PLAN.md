# Technical Debt Cleanup Plan

**Goal:** every debt counter in the mobile repo reaches **zero** and is then enforced as a hard lint/type error, so no budget scripts are needed and nothing can regress.

**Baseline:** 2026-10-01, after PR #189 (voice dictation + quality gates).

## Ground rules (apply to every PR in this plan)

1. **No new debt, ever.** No new `any`, `as any`, `as unknown as`, `eslint-disable`, `@ts-expect-error`, or skipped test, in any file, including test stubs that copy a neighbor's pattern. Copying a neighbor's `any` is still adding one.
2. **Every PR lowers a ceiling.** Budgets are strict ratchets: the check fails if the count rises *or* falls below the ceiling. Lower `DEFAULT_*` to the printed count in the same commit.
3. **Touch a file, clean the file.** When a PR edits a file for any reason, it fixes that file's remaining debt too.
4. **One directory or topic per PR**, so reviews stay small. `npm run check:app` (and `check:functions` when relevant) must be green before push.
5. **Parallel sessions:** two PRs that both lower a ceiling will conflict on the number. Rebase and set the ceiling to the actual count. Never raise it to resolve a conflict.
6. **Never "pre-existing".** Anything found while working goes into this plan or gets fixed. It is never waved past.

## Inventory

| # | Item | Count | Where | Enforced today |
|---|---|---|---|---|
| A | Test `no-explicit-any` | ✅ **0** | — | Hard lint error (budget script deleted) |
| B | Test type errors | ✅ **0** | — | Hard: `typecheck` runs `tsc -p tsconfig.tests.json` (budget script deleted) |
| C1 | `as any` / `no-explicit-any` disables in `src/` | ✅ **0** (Phase 0) | — | `no-explicit-any` error + `lint:escape-hatches` |
| C2 | `as unknown as` in `src/` | **62** | concentrated in `services/ai` adapters; rest scattered (the earlier 97 also counted text inside demo-recording JSON) | Ratchet (`lint:escape-hatches`) |
| C3 | Other `eslint-disable` in `src/` | ✅ **3**, each with a `-- reason` (Phase 0) | `nativeModule.ts` lazy IAP require, `PromptDebugLogger` verbatim dump, `citationUtils` NUL-delimiter regex | Ratchet + `require-description` |
| D1 | `as unknown as` in tests | **118** | `__tests__/`, `src/**/__tests__` | Ratchet (`lint:escape-hatches`) |
| D2 | `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck` | ✅ **0** | — | Hard lint error (`ban-ts-comment`) |
| D3 | Skipped tests | ✅ **0**: `validatePurchase` harness ported to Functions v2 and un-skipped | — | Ratchet at 0 (`lint:escape-hatches`) |
| D4 | Untyped `require()` of app modules in tests | ✅ **0** (typed-requires batch) | — | Ratchet at 0 (`lint:escape-hatches`) |
| D6 | Untyped `require()` of packages in tests | **324** | mostly `require('react')` / `require('react-native')` inside `jest.mock` factories, which leaves every stub built in the factory untyped. Fix: `require('react') as typeof import('react')` (no behavior change), then fix what surfaces | Ratchet (`lint:escape-hatches`) |
| D5 | `malformed()` inputs | 7 | the sanctioned, counted way to feed type-forbidden values to runtime guards (`@test-utils/queries`); not a 0 target — each must have a reason, and an unreachable guard should be deleted with its test | Ratchet (`lint:escape-hatches`) |
| E | `functions/` has no ESLint | 61 explicit `any`, 3 disables | `functions/src` | Only `tsc` (strict) + tests |
| F | Dead code / stale TODOs | 2 orphaned components, 4 TODOs | `ImageGenerationModal`, `SubscriptionSheet`; `SubscriptionService` (3 "implement purchase logic" TODOs while `PurchaseService` is the real path), `analytics/index.ts:90` (ChatScreen's dead TODOs and commented-out video handler removed in Phase 0) | ❌ none |
| G1 | Dependabot backlog | 10 open PRs | oldest #99 (Jun 1), #144 (Aug 1), #174; 7 opened 2026-10-01 incl. majors (`@babel/core` 8, `firebase-admin` 14, RN group) | ❌ none |
| G2 | Audit allowlist | 4 advisories | `image-size` ×2 (metro), `decode-uri-component` (react-navigation), `node-forge` (Expo CLI, unpatched) | Documented with removal triggers |
| G3 | Redundant direct pin | 1 | root `package.json` `"node-forge": "^1.3.3"` (forced a transitive version in 2025; nothing imports it) | ❌ none |
| H | Convention drift | 5 test files under `src/` | `src/hooks/__tests__`, `src/errors/__tests__`, `src/services/errors/__tests__` | ❌ none |

## Phases

### Phase 0: Foundations ✅ done
Shipped: `@test-utils/*` alias; `stubComponent` / `capturePropsOf` (`test-utils/mockComponents.tsx`); typed `createMock*` builders (`test-utils/fixtures.ts`); `renderWithProviders`/`renderHookWithProviders` `preloadedState` now per-slice partial **merged** into the real initial state (previously it replaced whole slices, so tests passing `{ auth: { isPremium: true } }` ran with every other auth field undefined); `test-utils/` itself type-clean (removed dead `debateFixtures`, rebuilt `historyFixtures` on the shared builders); `lint:escape-hatches` ratchet; eslint-comments `require-description` / `no-unlimited-disable` / `no-unused-disable`. Along the way C1 and C3 were cleared and ChatScreen's dead code removed. Conventions are in CLAUDE.md → Testing Conventions.

Original scope:
Most debt in A and B comes from the same few patterns. Build the typed tools once, then the burn-down is mechanical.

- **Typed mock-component helper** in `test-utils/`. 229 of the 495 test `any`s are `(props: any) =>` stubs inside `jest.mock` factories. Provide `mockComponent<P>(testID, render?)` typed from the real component's props (`React.ComponentProps<typeof Real>`), usable inside factories through `jest.requireActual`.
- **Typed fixture builders**: `makeMessage`, `makeChatSession`, `makeDebateState`, `makeAIConfig`, `makeRootState(overrides)` typed against the real types. Most of B (TS2322/2339/2741/2353/2739/2740, about 200 errors) is fixtures that drifted from the types they stand in for.
- **Mocked-function convention**: use `jest.mocked(fn)` instead of `fn as unknown as jest.Mock`. Covers D1 and the TS2344/TS2352 errors (about 60).
- Add these ratchets so C2, D1, D2, C3 stop growing immediately. One new script, `scripts/quality/check-escape-hatch-budget.mjs`, counts:
  - `as unknown as` in `src/` (97) and in tests (165)
  - `eslint-disable` comments in `src/` (14)
  - `@ts-expect-error` in tests (5)
  - skipped tests (1)
- Turn on `@eslint-community/eslint-plugin-eslint-comments` with `require-description` (every disable must say why) and `no-unlimited-disable`.

**Exit:** helpers merged with their own tests, all new budgets wired into `check:app` + pre-commit.

### Phase 1: Test type errors, B → 0 ✅ done (#192, batch 2)
Fix in order of value. Errors that reveal a test exercising code that no longer exists come first.

1. **TS2554 wrong argument count (23)** and **TS2339 missing property (53)**: most likely tests calling outdated APIs. Each is either a stale test to update or a real gap in coverage.
2. Hotspot files: `DebateOrchestrator.test.ts` (37), `DebateMessageList.test.tsx` (24), `attachmentUtils.test.ts` (18), `ChatMessageList.test.tsx` (18), `useSessionStats` (14), `useMessageBubbleAnimation` (13), `VotingInterface` (12).
3. `__tests__/functions/*` (24): these test `functions/` code from root Jest. Type them against `functions/` types or move them into `functions/test`.
4. The rest, by directory: `components/organisms` (118), `services/debate` (48), then leaves.

**Exit:** budget 0 → delete `check-test-typecheck-budget.mjs`, make `typecheck` run `tsc -p tsconfig.json && tsc -p tsconfig.tests.json` as a hard gate.

### Phase 2: Test `any`, A → 0 ✅ done (#192, batch 2)
With Phase 0 helpers, most of this is replacing stubs.

- By directory: `components/organisms` (166), `components/molecules` (66), screens (`DebateSetupScreen` 35, `DebateScreen` 23, `ChatScreen` 21, `HistoryScreen` 20, `CompareScreen` 19, `CompareSetupScreen` 18, `HomeScreen` 16), `services/debug` (22: `NetworkInterceptor` 18), `services/aiAdapter` (14), then the long tail.
- Do screen tests and their type errors (Phase 1) in the same PR when they overlap.

**Exit:** budget 0 → delete `check-no-explicit-any-budget.mjs`, remove the `no-explicit-any: 'warn'` test override (it becomes an error like everywhere else), drop the `--rule` flag from `lint:tests`.

### Phase 3: `src/` escape hatches, C2 → 0
C1 and C3 were cleared in Phase 0: the `as any`s were unnecessary (`'ping'` was already a typed SSE event; `__DEV__` is declared by RN; `RenderRules`/`Theme` existed), the four `exhaustive-deps` disables became stable shared-value deps, image `require()`s became `import`s, and the one commented-out `as any` was dead code. The 3 remaining disables are justified and described.
- **C2 (63)**:
  - `services/ai` adapters: replace casts on provider responses with response types + type guards at the adapter boundary. This is where unvalidated API shapes hide.
  - Rest case by case. A cast that is genuinely a boundary assertion stays only as a documented `assertX()` helper, never inline.

**Exit:** `src/` budgets 0; inline `as unknown as` banned in `src/` via `no-restricted-syntax`.

### Phase 4: Test hygiene, D1–D3, H → 0
- D1: finish converting casts to `jest.mocked` / typed builders. Ban `as unknown as` in tests via lint once at 0.
- D2: replace each `@ts-expect-error` with a typed alternative (e.g. `jest.replaceProperty`, typed `globalThis` overrides).
- D3: implement Functions v2 callable mocking for `validatePurchase` or move that coverage into `functions/test`. No `describe.skip` left. The live-model suites (`liveModelRouting`, `liveGroupChat`) are intentionally gated on API keys. Keep them, but give them a named `describe.live` helper so they aren't counted as skips.
- H: move the 5 `src/**/__tests__` files into `__tests__/` and add a lint rule rejecting test files under `src/`.

### Phase 5: `functions/` lint, E → 0
`functions/` is shared with web-repo work, so coordinate before starting.
- Add an ESLint flat config to `functions/` (same base rules, Node globals) and a `lint` script inside `check:functions`, `--max-warnings 0`.
- Burn down 61 `any`s with the same strict-ratchet budget, then make it a hard error.
- Resolve the 3 disables (`no-require-imports` ×2 for lazy Puppeteer/browser loads: keep with a description; `no-unused-vars` ×1: fix).
- Note: merging `functions/**` to master auto-deploys Cloud Functions. Batch these PRs and watch the deploy. A CI "Deadline Exceeded" on deploy can be a CLI polling timeout even when the functions deployed, so verify revisions with `gcloud` before re-running.

### Phase 6: Dead code and TODOs, F → 0
- Verify and delete `SubscriptionService` + `useSubscriptionSettings` if `PurchaseService` fully replaced them (the TODOs say the purchase logic was never implemented there).
- Delete or wire up `ImageGenerationModal` and `SubscriptionSheet` (orphan scan).
- Resolve the `ChatScreen` continuation TODOs (implement or remove the dead params) and the analytics TODO (backend decision or delete).
- Add `node scripts/find-orphaned-components.js` to CI as a failing check once orphans are 0, and ban bare `TODO`/`FIXME` without an issue reference.

### Phase 7: Dependencies and advisories, G → 0
- Work the Dependabot backlog oldest-first. Minors and patches merge after CI. Majors (`@babel/core` 8, `jest` 30, RNTL 14, `firebase-admin` 14, RN group) each get their own PR with a device smoke test. Close any PR that's superseded.
- Remove allowlist entries as their triggers fire:
  - `node-forge` when > 1.4.0 ships
  - `decode-uri-component` when react-navigation bumps `query-string` (check whether #174 does this)
  - `image-size` when metro moves to 2.x
- Remove the redundant direct `node-forge` pin (G3).
- Set a standing rule: no Dependabot PR older than 2 weeks.

## End state
- **All budget scripts deleted.** Every counter is a hard lint/type error with no override.
- `check:app` = `typecheck` (app + tests) + `lint` (all scopes, zero warnings) + Jest + orphan scan.
- `check:functions` = build + lint + tests.
- Audit allowlist contains only advisories with no upstream fix, each with a dated removal trigger.

## Sequencing and size

| Phase | Depends on | Rough size |
|---|---|---|
| 0 Foundations | n/a | 1 PR |
| 1 Test types | 0 | 6–8 PRs |
| 2 Test `any` | 0 (pairs well with 1) | 6–8 PRs |
| 3 `src/` escapes | 0 | 3–4 PRs |
| 4 Test hygiene | 1, 2 | 2 PRs |
| 5 `functions/` lint | coordination with web | 2–3 PRs |
| 6 Dead code | n/a, any time | 1–2 PRs |
| 7 Dependencies | n/a, ongoing | continuous |

Phases 1 and 2 touch the same files. Do them together, file by file, so each test file is opened once.

## Follow-ups found during the burn-down
Test-quality issues surfaced while typing tests. Fix when touching the file (rule 3) or in Phase 4.
- `HistoryScreen.test` "shows demo indicators" sets `featureAccess.isDemo`, which `HistoryScreen` never reads, so the test passes regardless.
- `ChatMessageList.test` "configures FlatList with proper virtualization settings" only asserts the tree rendered.
- `UseSessionStatsReturn` (`src/types/history.ts`) marks `formattedStats` / `activityInsights` / `usagePatterns` optional though the hook always returns them; make them required.
- **Possible production bug — investigate first:** `BaseAdapter.getSystemPrompt`'s `debateProfile`/`tone` branch is unreachable through typed APIs: `AIAdapterConfig.personality` is `PersonalityConfig`, and `setTemporaryPersonality` drops `debateProfile` when converting a `PersonalityOption`. Debate-profile guidance may never reach providers.
- `ImageBubble`'s `!uris` guard is unreachable from typed callers (both pass arrays); either make `uris` optional or delete the guard and its `malformed()` test.
- `src/services/demo/RecordController.ts`: `as unknown as` in `startDebate`/`startCompare`/`stop()`, and `stop()` returns `session: unknown` (counted in C2).
- Untyped `jest.fn()` (`jest.Mock<any, any>`) is a hidden `any` the counters don't see (e.g. HomeScreen's `mockUseFeatureAccess` returns partial objects). Type mocks with `jest.fn<Return, Args>()` or `jest.mocked`; consider a counter.
- `imageProcessing.test.ts` reads mocked modules via `jest.requireMock(...) as { …: jest.Mock }`; move to `jest.mocked` on real imports.
- Tests that can pass without asserting (found in batch 2): TranscriptModal ×3 and ImageBubble "calls onRefine" wrap assertions in `if (…)`; ShareModal "onRequestClose" (if/else) and "native share" (no share assertion); DebateMessageBubble "does not re-render" (no assertion); PresetTopicsModal/FormatModal "highlights …" only check existence; ImageMessageRow "filters non-image attachments" doesn't check `uris`; useFeatureAccess "maps free/canceled/past_due" only covers `canceled`; AIServiceProvider "initializes with API keys" checks no-arg construction; CompareMessageBubble "accepts onOpenLightbox" only checks sanitize. Many chart/stats/molecule tests only assert the tree rendered.
- Dead mocks: several tests mock `@/components/molecules` while the component imports `../common/Typography` directly (AIProviderTile, DebateTopicCard, DebateTypingIndicator, DebateMessageBubble).
- ScoreDisplay light-theme test isn't discriminating (light is the default theme); "handles nomi provider" refers to a removed provider.
- Promoted in batch 2: `createMockWindowSize`, `createMockFeatureAccess` (fixtures), `requireDefined`/`collectTestIds`/`malformed` (queries), Functions v2 harness (`functionsHarness`), RNTL matcher types (`test-utils/types`). Still duplicated, promote next: Firebase `User` builders (auth.test, SocialAuthProviders), `HttpsCallable` stubs (auth, accountDeletion, debateAudioCompileService), `DebateSession`/real-orchestrator wrapper (useDebateFlow, useDebateVoting), `BrandColor` fixture (TopicBadge, DebateHistoryItem), shared `@/components/molecules` stub set, theme-mode helper (ScoreDisplay), `AIService` fake, chat/history hook-mock builders.

## Tracking
After each PR, update the counts in the Inventory table and note the PR number:

| Date | PR | A any | B type errs | C2 src casts | D1 test casts | Notes |
|---|---|---|---|---|---|---|
| 2026-10-01 | #189 | 495 | 393 | 97 | 165 | baseline; gates added |
| 2026-10-02 | #191 Phase 0 | 495 | 388 | 63 | 203 | helpers + escape-hatch ratchet; C1/C3 cleared; C2/D1 recounted (code files only) |
| 2026-10-02 | Hotspots 1 | 267 | 198 | 62 | 164 | 20 hottest test files to zero (Phase 1+2); validatePurchase un-skipped; `test-utils/queries` |
| 2026-10-02 | Batch 2 | 0 | 0 | 62 | 120 | all remaining test files; A/B/D2 now hard rules; D4 untyped requires (93) + D5 malformed() (7) tracked |
| 2026-10-02 | Typed requires | 0 | 0 | 62 | 118 | D4 93 → 0 (~85 type errors the bare requires had hidden, now fixed); D6 package requires (324) now tracked |
