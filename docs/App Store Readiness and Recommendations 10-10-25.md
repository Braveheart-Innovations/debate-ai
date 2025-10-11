# App Store Readiness and Recommendations — 10-10-25

## Summary
- **Current launch readiness:** ~30 % chance of approval if submitted today.
- **Release posture:** Feature set and infrastructure are close, but several App Store compliance blockers remain.
- **Key next actions:** Address privacy permission gaps, add in-app account deletion, provision production purchase validation secrets, and run a production build validation pass.

## App Snapshot
- **Product name:** Symposium AI (`app.json`)
- **Bundle identifier:** `com.braveheartinnovations.debateai`
- **Revenue model:** Subscription via `react-native-iap` with Firebase receipt validation (`src/services/iap/PurchaseService.ts`, `functions/src/validatePurchase.ts`)
- **Current modes:** Demo-first experience with optional BYOK (bring-your-own-key) unlock flow (`src/components/organisms/demo/DemoExplainerSheet.tsx`)

## Blocking Issues (Must Resolve Before Submission)
1. **Missing camera usage disclosure**  
   - Camera is used for image attachments (`src/components/organisms/chat/ImageUploadModal.tsx:22`) but `NSCameraUsageDescription` is absent from `ios/SymposiumAI/Info.plist`.
   - **Action:** Add human-readable purpose string in `app.json > expo.ios.infoPlist` and regenerate iOS assets.

2. **Missing photo library usage disclosures**  
   - Photo picker and save flows rely on the media library (`ImageUploadModal`, `src/services/media/MediaSaveService.ts:21`) yet `NSPhotoLibraryUsageDescription` and `NSPhotoLibraryAddUsageDescription` are not defined in `ios/SymposiumAI/Info.plist`.
   - **Action:** Add both plist keys with reviewer-friendly copy.

3. **Absent account deletion flow**  
   - App Store guideline 5.1.1(v) requires in-app account deletion. Current profile sheet (`src/components/organisms/profile/ProfileContent.tsx:525`) supports sign-in/out only.
   - **Action:** Ship a deletion UI that removes the Firebase Auth user, clears Firestore profile data, wipes local caches, and surfaces confirmation messaging.

4. **Unprovisioned purchase validation credentials**  
   - The callable `validatePurchase` function (`functions/src/validatePurchase.ts:41`) requires:  
     a. Apple shared secret (`functions.config().apple.shared_secret`).  
     b. Google Play service account JSON with Android Publisher scope.  
   - **Action:** Securely configure secrets, redeploy Firebase Functions, and dry-run sandbox purchases.

## High-Priority Recommendations
- **Revisit biometric usage declaration**  
  - `NSFaceIDUsageDescription` exists (`ios/SymposiumAI/Info.plist:61`) but no biometric gate is implemented. Remove the entitlement or finalize Face ID flows to avoid reviewer questions.

- **Document demo vs. live expectations**  
  - Provide TestFlight/App Store Review notes describing demo mode, steps to access premium flows, and any required sandbox credentials/API keys. Clarify that reviewers can evaluate without external keys.

- **Review Firebase security posture**  
  - Ensure Firestore rules protect subscription documents accessed in `SubscriptionManager` (`src/services/subscription/SubscriptionManager.ts:25`) and that backend functions are deployed in the production project.

- **Strengthen failure handling for IAP restore**  
  - `PurchaseService.restorePurchases()` currently surfaces a generic warning. Consider explicit messaging for “no purchases found” vs. validation failures to reduce review friction.

## Medium-Priority Recommendations
- **Audit analytics & tracking**  
  - Current build omits third-party analytics, which aligns with ATT compliance, but confirm no hidden identifiers exist in future dependencies.

- **QA across device classes**  
  - Tablet support is enabled (`app.json > ios.supportsTablet`). Run exploratory tests on iPad to validate layout and permission prompts.

- **User messaging refresh**  
  - Update demo mode copy and support sheet (“Start your 7-day trial”) to highlight subscription terms and cancellation instructions, easing review questions.

- **In-app support verification**  
  - Test `mailto:` handler in Support Sheet (`src/components/organisms/support/SupportSheet.tsx:73`) on iOS 17 devices; provide alternative fallback instructions if the mail client is unavailable.

## Compliance Checklist
| Area | Status | Notes |
| --- | --- | --- |
| Privacy permissions | ❌ | Add camera/photo plist entries; revalidate `NSFaceIDUsageDescription`. |
| Account deletion | ❌ | Implement delete account UI + backend cleanup. |
| In-app purchases | ⚠️ | Client flow present; backend secrets and sandbox testing pending. |
| Demo content disclosure | ⚠️ | Ensure release notes/TestFlight instructions clarify BYOK requirement. |
| Support + legal | ✅ | Terms & Privacy accessible in-app (`SupportSheet`). |
| App Store metadata | ⚠️ | EAS submit profile configured; review marketing copy/screenshots once blockers cleared. |

## Required Secrets and Config
- `functions.config().apple.shared_secret` — App Store shared secret for receipt validation.
- `functions.config().google.service_account` (or equivalent) — Service account JSON for Google Play Developer API.
- `EXPO_PUBLIC_*` environment variables — Validate production values for Google Sign-In IDs (`src/services/firebase/auth.ts:233`).
- Update `.env` / secure storage instructions to ensure reviewers can reach premium surfaces without real keys.

## Testing & Release Validation
- Run `npm run check` and ensure lint/tests pass without relying on dev-only flags.
- Produce an EAS production build (`eas build --platform ios --profile production`) and exercise: onboarding, permissions, subscription purchase/restore (sandbox), account deletion, and demo mode.
- Capture screenshots/video for App Store metadata after UI polish and permission prompts are finalized.

## Next Steps
1. Patch Info.plist privacy strings and re-run `expo prebuild --platform ios` if necessary.
2. Deliver account deletion feature (UI, Firebase function or callable, local data purge).
3. Configure and deploy purchase validation secrets; verify sandbox subscriptions end-to-end.
4. Perform regression QA on a production build (iPhone + iPad) and resolve any runtime warnings.
5. Assemble App Store submission package: updated metadata, screenshots, compliance notes, and reviewer instructions.
