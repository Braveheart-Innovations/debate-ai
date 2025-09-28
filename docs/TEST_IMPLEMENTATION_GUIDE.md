# Test Implementation Guide for Symposium AI

## Overview
- Symposium AI currently ships without automated tests while coordinating AI providers, Firebase, secure storage, and in-app purchases.
- This guide defines the tooling, priorities, and phased rollout required to introduce reliable automated tests without slowing feature development.
- Core objectives: de-risk security-sensitive flows (API key storage, subscription purchases), codify debate orchestration behaviour, and provide guardrails for the hook-driven UI.

## Current Snapshot

### Observations
| Risk Area | Evidence | Impact |
| --- | --- | --- |
| API key lifecycle | `src/services/APIKeyService.ts`, `src/services/secureStorage.ts` | Missing tests around SecureStore persistence and validation could leak secrets or regress storage handling. |
| Purchase validation | `src/services/iap/PurchaseService.ts`, `functions/src/validatePurchase.ts` | No automated checks around Firebase triggers or IAP receipts; payment regressions would only surface in production. |
| Debate orchestration | `src/services/debate/*.ts`, `src/hooks/debate/*` | Complex state machine (rounds, voting, streaming) currently unguarded; regressions are hard to diagnose. |
| Streaming + AI adapters | `src/services/streaming/StreamingService.ts`, `src/services/ai/factory/AdapterFactory.ts` | SSE buffering and provider routing rely on subtle logic that lacks deterministic coverage. |
| Redux slices & selectors | `src/store/*.ts` | Business rules (session lifecycle, stats, navigation state) lack tests, increasing risk of silent breakages. |
| UI/UX regressions | `src/screens/*`, `src/components/organisms/*` | Hook-heavy screens rely on many services; there are no smoke/component tests. |

### Existing Tooling
- `npm run check` currently runs TypeScript + ESLint only; there is no `npm test` script.
- No Jest config or setup files exist; Babel (`babel.config.js`) is Expo-default and Metro config only patches module resolution.
- Path alias `@/*` is configured in `tsconfig.json` and must be mirrored by the test runner.

## Recommended Testing Stack

### Dependencies
Install Expo-compatible versions (Expo SDK 53 / React Native 0.79):

```bash
npx expo install --dev jest-expo@~53.0.2 @testing-library/react-native@^13.5.0 @testing-library/jest-native@^5.4.3
npm install --save-dev @types/jest whatwg-fetch msw
```

Optional utilities:
- Prefer `renderHook` from `@testing-library/react-native` instead of the deprecated `@testing-library/react-hooks`.
- Use `@reduxjs/toolkit` helpers already bundled with the app for store tests (no extra dependency needed).

### Scripts
Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest --watch=false",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "check": "npm run typecheck && npm run lint && npm test"
  }
}
```

### Jest Configuration
Create `jest.config.js`:

```javascript
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(jpg|jpeg|png|gif|mp4|mp3|svg)$': '<rootDir>/__mocks__/fileMock.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|@unimodules|react-native-gesture-handler|react-native-reanimated|@react-native-firebase|react-native-svg|react-native-sse)/)'
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/types/**'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65,
      lines: 70,
      statements: 70
    }
  }
};
```

Create `jest.setup.ts`:

```typescript
import 'whatwg-fetch';
import '@testing-library/jest-native/extend-expect';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-gesture-handler', () => require('react-native-gesture-handler/jestSetup'));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(), getStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  documentDirectory: '/tmp'
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@react-native-firebase/auth', () => () => ({
  currentUser: null,
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn()
}));
jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn()
}));
jest.mock('@react-native-firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn().mockReturnValue(jest.fn())
}));

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(),
  endConnection: jest.fn(),
  purchaseUpdatedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  purchaseErrorListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  getSubscriptions: jest.fn(),
  requestSubscription: jest.fn(),
  getAvailablePurchases: jest.fn(),
  finishTransaction: jest.fn()
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('hash')
}));

// Global shims expected by reanimated
(globalThis as unknown as { __reanimatedWorkletInit: () => void }).__reanimatedWorkletInit = () => {};
```

Create `__mocks__/fileMock.js`:

```javascript
module.exports = 'test-file-stub';
```

Add additional mocks (`svgMock.js`, adapter stubs) as features require.

### Test Utilities
- Extract `rootReducer` (or a `createAppStore` factory) from `src/store/index.ts` so tests can build isolated stores without mutating the singleton.

Create `test-utils/renderWithProviders.tsx`:

```typescript
import React from 'react';
import { Provider } from 'react-redux';
import { render, RenderOptions } from '@testing-library/react-native';
import type { RootState } from '@/store';
import { createAppStore } from '@/store';
import { ThemeProvider } from '@/theme';

interface RenderWithProvidersOptions extends RenderOptions {
  preloadedState?: Partial<RootState>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  { preloadedState, ...options }: RenderWithProvidersOptions = {}
) {
  const store = createAppStore(preloadedState);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <ThemeProvider>{children}</ThemeProvider>
      </Provider>
    );
  }

  return {
    store,
    ...render(ui, { wrapper: Wrapper, ...options })
  };
}
```

Create `test-utils/renderHookWithProviders.ts` that reuses the same wrapper for hook tests.

## Implementation Roadmap

### Stage 0 – Foundations (1 sprint)
- Install dependencies, add Jest config, mocks, and provider helpers.
- Extract `createAppStore(preloadedState?)` from `src/store/index.ts` for test isolation.
- Introduce `npm run test` and update CI to call it.
- Add first unit tests for `src/utils/expertMode.ts`, `src/utils/*`, `src/services/secureStorage.ts`, and `src/services/APIKeyService.ts` (verifying SecureStore behaviour).

### Stage 1 - Security-Critical Coverage *(Completed - February 2025)*
- ✅ Baseline implemented: unit tests now cover `APIKeyService`, `secureStorage`, hooks (`useAPIKeys`, `useProviderVerification`), and `PurchaseService` purchase/restore paths.
- ✅ Entitlement coverage expanded: tests now exercise `SubscriptionManager`, `useFeatureAccess`, `useSubscriptionStatus`, and the `validatePurchase` callable end-to-end with mocked Firebase/Google surfaces.
- Cover credential and entitlement flows:
  - `src/services/APIKeyService.ts`, `src/services/secureStorage.ts` – key lifecycle, error handling, empty keys.
  - `src/hooks/useAPIKeys.ts`, `src/hooks/useProviderVerification.ts` – ensure state derived from storage stays consistent.
  - `src/services/iap/PurchaseService.ts` – success, cancellation, validation failure paths (mock Firebase/IAP calls).
  - `src/services/subscription/*`, `src/hooks/useSubscriptionStatus.ts`, `useFeatureAccess.ts` – entitlement gating.
  - `functions/src/validatePurchase.ts` – Firebase callable contract tests using `firebase-functions-test`.

### Stage 2 – Core Logic & State *(In progress – March 2025)*
- ✅ Covered supporting services and slices:
  - `VotingService.ts`, `DebateRulesEngine.ts`, `DebatePromptBuilder.ts`, `DebateSetupService.ts`, `TopicService.ts`, `PersonalityService.ts` via unit tests.
  - Redux slices (`authSlice`, `compareSlice`, `debateStatsSlice`, `navigationSlice`, `streamingSlice`) and `createAppStore` factory.
  - Streaming/router utilities: `StreamingService.ts`, `AdapterFactory.ts`.
  - Chat persistence utilities: `StorageService.ts`, `MessageService.ts`.
  - Hooks: `useDebateSession`, `useDebateFlow`, `useDebateVoting`, `useDebateMessages`, `useChatMessages`.
- Next focus areas to complete Stage 2:
  - Debate orchestration core: add deterministic suites for `DebateOrchestrator.ts` and `DebaterSelectionService.ts` (turn scheduling, streaming fallback, participant validation).
  - Chat pipeline orchestration: cover `ChatOrchestrator.ts` (round-robin flow, streaming preference handling) and remaining chat hooks (`useAIResponses`, `useAIResponsesWithStreaming`, `useChatInput`, `useMentions`, `useQuickStart`).
  - Streaming base adapter: test `BaseAdapter.formatHistory` debate-mode remapping and resumption behaviour.
  - Optional: extend adapter/service tests with targeted fixtures for provider-specific behaviour once orchestrator coverage lands.

### Stage 3 – UI & Integration
- Component tests for high-value surfaces:
  - `src/screens/DebateScreen.tsx`, `HomeScreen.tsx`, `CompareScreen.tsx` (mock hooks/services to isolate UI states).
  - `src/components/organisms/debate/*`, `src/components/organisms/subscription/*`, `src/components/organisms/demo/*` to protect critical interactions (voting modal, trial gates, demo playback).
  - Validate navigation events via `src/navigation/*` by mocking React Navigation.
- Smoke tests for contexts and providers: `src/providers/AIServiceProvider.tsx`, `src/contexts/SheetContext.tsx`.

### Stage 4 – End-to-End & Device Checks
- Evaluate Maestro or Detox for critical happy paths:
  1. Authentication + API key entry.
  2. Start a debate, observe round progression.
  3. Initiate subscription flow (sandbox account) and validate paywall unlock.
- For real-time voice (`src/services/voice/*`), add integration tests using mocked WebRTC transport; rely on manual checklists if automation is too costly initially.

## Domain Coverage Checklists

### Security & Credentials
- `src/services/APIKeyService.ts`
- `src/services/secureStorage.ts`
- `src/services/VerificationService.ts`, `VerificationPersistenceService.ts`
- `src/hooks/useAPIKeys.ts`, `useProviderVerification.ts`

### Monetisation & Access
- `src/services/iap/PurchaseService.ts`, `src/services/PremiumService.ts`
- `src/services/subscription/*`, `src/hooks/useSubscriptionStatus.ts`, `useFeatureAccess.ts`
- `functions/src/validatePurchase.ts`

### Debate & Chat Pipeline
- `src/services/debate/*`
- `src/services/chat/*`
- `src/services/history/*`, `src/services/demo/DemoContentService.ts`, `DemoPlaybackRouter.ts`
- `src/hooks/debate/*`, `src/hooks/chat/*`

### Streaming & Voice
- `src/services/streaming/StreamingService.ts`
- `src/services/voice/*`
- `src/services/media/*`, `src/services/videos/*` (recordings & assets)

### Redux & Persistence
- `src/store/*.ts`
- `src/contexts/SheetContext.tsx`
- `src/utils` modules that transform persisted state.

### UI / Navigation
- `src/navigation/*`
- `src/screens/*`
- `src/components/organisms/*`, especially debate, subscription, demo, and streaming overlays.

## Testing Utilities & Fixtures
- Create fixture builders in `__tests__/fixtures/` for `AI`, `Message`, `DebateSession`, `Purchase` objects.
- Maintain helpers in `__tests__/helpers/` (`renderWithProviders`, `renderHookWithProviders`, `mockAdapters`, `mockStreamingEvents`).
- Use MSW (`msw/native`) for API mocking:
  - Define handlers for AI streaming endpoints, Firebase callable responses, and debate history APIs.
  - Start/stop the server inside `jest.setup.ts` for integration tests.

## Continuous Integration
- Update CI job order:
  1. `npm ci`
  2. `npm run typecheck`
  3. `npm run lint`
  4. `npm run test -- --runInBand`
- Publish coverage artifacts (`coverage/lcov-report`) and fail on thresholds.
- Consider Husky pre-push hook: `npm run test -- --bail --findRelatedTests`.

## Maintenance Practices
- Require PRs to list tests added/updated and manual verification steps.
- Tag platform-specific tests (`describe.skipIf(Platform.OS !== 'ios', ...)`) to keep suites deterministic.
- Review Jest mocks quarterly to ensure they mirror production modules (Firebase, IAP, streaming connectors).
- Keep `docs/` updated when significant flows (debate orchestration, purchases, streaming) change.

## Suggested Directory Layout
```
__tests__/
  fixtures/
    ai.ts
    debate.ts
  helpers/
    renderWithProviders.tsx
    mockAdapters.ts
  services/
    debate/
    streaming/
  hooks/
  screens/
__mocks__/
  fileMock.js
  svgMock.js
  expo-secure-store.ts
```
- Co-locate quick unit tests next to utilities (e.g., `src/utils/expertMode.test.ts`).
- Use domain folders under `__tests__` for services/hooks to keep fixtures reusable.

## Resources
- Expo + Jest setup: https://docs.expo.dev/develop/unit-testing/
- React Native Testing Library: https://callstack.github.io/react-native-testing-library/
- MSW for React Native: https://mswjs.io/docs/integrations/react-native
- Detox (alternative E2E): https://wix.github.io/Detox/docs/introduction/getting-started/

---

*Document Version: 2.0*
*Last Updated: 2025-09-27*
*Maintained by: Development Team*
