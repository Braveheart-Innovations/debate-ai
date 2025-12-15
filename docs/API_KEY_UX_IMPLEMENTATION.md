# API Key Acquisition UX Overhaul

## Summary
Replace the current "open external browser" flow with an in-app WebView that keeps users in context, plus smart clipboard detection and guided walkthroughs.

## Key Finding
OAuth is NOT available for API key generation from any major AI provider. All 9 providers require manual key creation through their developer portals.

---

## Implementation Plan

### Phase 1: Foundation Services (Day 1)

#### 1.1 Create Clipboard Detection Service
**New file:** `src/services/apiKeyAcquisition/ClipboardDetectionService.ts`

```typescript
// API key pattern matchers for each provider
const API_KEY_PATTERNS = {
  openai: /^sk-[a-zA-Z0-9]{20,}$/,
  claude: /^sk-ant-[a-zA-Z0-9-_]{40,}$/,
  google: /^AIza[a-zA-Z0-9_-]{35}$/,
  perplexity: /^pplx-[a-zA-Z0-9]{40,}$/,
  mistral: /^[a-zA-Z0-9]{32}$/,
  grok: /^xai-[a-zA-Z0-9]{40,}$/,
  cohere: /^[a-zA-Z0-9]{40}$/,
  together: /^[a-zA-Z0-9]{64}$/,
  deepseek: /^sk-[a-zA-Z0-9]{48}$/,
};

// Methods: checkClipboard(), validateAsApiKey(), detectProvider()
```

#### 1.2 Create Flow State Service
**New file:** `src/services/apiKeyAcquisition/FlowStateService.ts`
- Persist pending flow state (which provider, when started)
- Resume detection on app foreground
- No notifications, just state persistence

#### 1.3 Create Hook for Clipboard Detection
**New file:** `src/hooks/apiKeyAcquisition/useAPIKeyClipboardDetection.ts`
- Listen for AppState changes
- Check clipboard when app returns to foreground
- Return detected key and confidence level

---

### Phase 2: In-App WebView Modal (Days 2-3)

#### 2.1 Install WebView Dependency
```bash
npx expo install react-native-webview
```

#### 2.2 Create WebView Modal Component
**New file:** `src/components/organisms/api-config/APIKeyWebViewModal.tsx`

Features:
- Full-screen modal with embedded WebView
- Floating guidance card at top showing current step
- "I've copied my key" button at bottom
- Progress indicator for page loads
- Close button with confirmation if flow incomplete

```typescript
interface Props {
  visible: boolean;
  provider: AIProvider;
  onKeyObtained: (key: string) => void;
  onClose: () => void;
}
```

#### 2.3 Create Floating Guidance Card
**New file:** `src/components/molecules/api-config/FloatingGuidanceCard.tsx`
- Shows step-by-step instructions
- Updates based on current URL
- Dismissible but can be restored

---

### Phase 3: Provider Guidance System (Day 3)

#### 3.1 Add Guidance Config to Provider Data
**Modify:** `src/config/aiProviders.ts`

Add to `AIProvider` interface:
```typescript
guidance?: {
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  steps: Array<{
    urlPattern: string;
    title: string;
    instruction: string;
  }>;
  tips: string[];
};
```

#### 3.2 Create Pre-Flight Guidance Modal
**New file:** `src/components/organisms/api-config/APIKeyGuidanceModal.tsx`
- Shows before opening WebView
- Displays: estimated time, difficulty, what to expect
- "Got it, let's go" button opens WebView
- "I already have a key" skips to paste

---

### Phase 4: Integration (Day 4)

#### 4.1 Modify ProviderCard
**Modify:** `src/components/organisms/api-config/ProviderCard.tsx`

Changes:
- Replace `Linking.openURL()` with guidance modal trigger
- Add "I have a key" shortcut button
- Integrate clipboard detection on focus
- Show "Key detected!" prompt when clipboard matches

#### 4.2 Modify APIConfigScreen
**Modify:** `src/screens/APIConfigScreen.tsx`

Changes:
- Add WebView modal state management
- Add guidance modal state management
- Handle flow state persistence/resume
- Add "Welcome back" prompt for interrupted flows

#### 4.3 Update Index Exports
**Modify:** `src/components/organisms/api-config/index.ts`
**Modify:** `src/components/molecules/api-config/index.ts`

---

### Phase 5: Polish & Testing (Day 5)

#### 5.1 Test Each Provider
- Verify WebView works with all 9 providers
- Document any providers that block WebView (fallback to browser)
- Test clipboard detection patterns

#### 5.2 Handle Edge Cases
- WebView login flow issues
- Providers that require 2FA
- Network errors during key page load
- iOS clipboard permission banner handling

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/services/apiKeyAcquisition/ClipboardDetectionService.ts` | Pattern matching, clipboard access |
| `src/services/apiKeyAcquisition/FlowStateService.ts` | Persist/resume pending flows |
| `src/services/apiKeyAcquisition/index.ts` | Barrel export |
| `src/hooks/apiKeyAcquisition/useAPIKeyClipboardDetection.ts` | Clipboard hook |
| `src/hooks/apiKeyAcquisition/useAPIKeyFlowState.ts` | Flow state hook |
| `src/hooks/apiKeyAcquisition/index.ts` | Barrel export |
| `src/components/organisms/api-config/APIKeyWebViewModal.tsx` | In-app browser modal |
| `src/components/organisms/api-config/APIKeyGuidanceModal.tsx` | Pre-flight instructions |
| `src/components/molecules/api-config/FloatingGuidanceCard.tsx` | WebView overlay guidance |

## Files to Modify

| File | Changes |
|------|---------|
| `src/config/aiProviders.ts` | Add `guidance` field to provider config |
| `src/components/organisms/api-config/ProviderCard.tsx` | Integrate new flow, clipboard detection |
| `src/screens/APIConfigScreen.tsx` | Add modal state, flow resume logic |
| `src/components/organisms/api-config/index.ts` | Export new components |
| `src/components/molecules/api-config/index.ts` | Export FloatingGuidanceCard |
| `package.json` | Add react-native-webview |

---

## User Flow After Implementation

1. User taps provider card → Card expands
2. User taps "Get API Key" → **Guidance modal** appears
3. Guidance modal shows: "~2 min • 4 steps • What to expect"
4. User taps "Let's go" → **WebView modal** opens to provider's key page
5. Floating guidance card shows: "Step 1: Log in to your account"
6. User navigates provider site within WebView
7. Guidance updates based on URL: "Step 2: Click 'Create Key'"
8. User copies key → Taps "I've copied my key"
9. Modal closes → **Clipboard auto-detected** → Key populated
10. User taps "Test Connection" → Success!

## Fallback Behavior
If WebView doesn't work for a provider (blocking, auth issues):
- Detect failure and offer "Open in Browser" fallback
- Use existing `Linking.openURL()` flow
- Still benefit from clipboard detection on return

---

## Provider Difficulty Ratings (for guidance)

| Provider | Difficulty | Est. Time | Notes |
|----------|------------|-----------|-------|
| Google (Gemini) | Easy | ~1 min | One-click in AI Studio |
| Cohere | Easy | ~1 min | Simple dashboard |
| Together AI | Easy | ~2 min | Straightforward |
| DeepSeek | Easy | ~2 min | Clean interface |
| OpenAI | Medium | ~3 min | May need org setup |
| Anthropic | Medium | ~3 min | Requires billing |
| Mistral | Medium | ~3 min | EU verification |
| Perplexity | Medium | ~2 min | May need subscription |
| Grok | Hard | ~5 min | X account required |
