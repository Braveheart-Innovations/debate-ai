# Store copy — v2.4.1 (Android only)

Google Play "What's new" for the **v2.4.1** submission (Android versionCode 48, marketing and runtime version 2.4.1).
Sent for review 2026-10-16, folded into the same review as the Sign in details update.

| File | Where it goes | Limit | Count |
|------|---------------|-------|-------|
| `android-whats-new.txt` | Google Play **What's new** (release notes) | 500 | 481 |

iOS is not part of this release: iOS 2.4.0 (build 35) was approved and is live, so iOS 2.4.1 (build 36) was built but
not submitted. Description, short description, subtitle, and promotional text are unchanged from v2.0 (`docs/store/v2.0/`).

## Sources / accuracy decisions

- **Android carries the 2.4.0 notes**: Play blocked review of Android 2.4.0 (versionCode 47) under the photo and video
  permissions policy, so Play users go straight from 2.3.0 to 2.4.1. The copy is `docs/store/v2.4/android-whats-new.txt`
  plus the 2.4.1 fix.
- **Order**: new models first, then the debate features, then fixes under a "Fixes:" heading. "No dead ends:" was
  dropped from the Send/Start line to make room for the heading.
- **Save to Photos works again** (this PR): since the SDK 57 upgrade the package-root `expo-media-library` functions were
  stubs that threw, so Save in Create failed on both platforms. Now imported from `expo-media-library/legacy`.
- Not mentioned (no user-visible effect): READ_MEDIA_* removal. The photo picker was already the system picker.
