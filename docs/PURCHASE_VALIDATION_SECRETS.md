# Purchase Validation Secrets & Sandbox Checklist

This guide documents the credentials Symposium AI needs to validate App Store and Play Store subscriptions in production, plus the commands to provision them in Firebase Functions and verify end-to-end sandbox purchases.

## Required Credentials

| Platform | Purpose | Source | Storage |
| --- | --- | --- | --- |
| Apple | Shared secret for `verifyReceipt` requests | App Store Connect → Subscriptions → Shared Secret | `functions.config().apple.shared_secret` (or `APPLE_SHARED_SECRET` for local emulation) |
| Google Play | Service account JSON with `androidpublisher` scope | Google Cloud Console → IAM → Service Accounts | `functions.config().google.service_account` (base64-encoded JSON) or `GOOGLE_SERVICE_ACCOUNT` |

Both secrets are required before deploying `validatePurchase`. Without them the callable throws `failed-precondition`.

## Provisioning Commands

### 1. Apple Shared Secret
```bash
# Set secret in Firebase Functions config (prod project)
firebase functions:config:set apple.shared_secret="YOUR_APP_STORE_SHARED_SECRET" --project symposium-ai-prod

# Optional: set for dev/sandbox project
firebase functions:config:set apple.shared_secret="YOUR_SANDBOX_SECRET" --project symposium-ai-dev
```

### 2. Google Play Service Account

1. Create a Google Cloud service account with the **Google Play Android Developer API** role.
2. Download the JSON key and store it securely.
3. Base64 encode the JSON so it can be stored without newline issues:
   ```bash
   base64 -w0 play-service-account.json > play-service-account.base64
   ```
4. Set the config value in Firebase:
   ```bash
   firebase functions:config:set google.service_account="$(cat play-service-account.base64)" --project symposium-ai-prod
   ```

Repeat for the dev project if you need sandbox validation there.

### 3. Deploy Updated Functions
```bash
# Build TypeScript then deploy callable functions
npm --prefix functions run build
firebase deploy --only functions:validatePurchase --project symposium-ai-prod
```

## Local Emulator / CI Usage

For local testing or CI that uses the Firebase emulator, you can set environment variables instead of config:

```bash
export APPLE_SHARED_SECRET="sandbox-shared-secret"
export GOOGLE_SERVICE_ACCOUNT="$(cat play-service-account.json)"
npm --prefix functions run build
firebase emulators:start --only functions
```

If you use base64 encoding locally, decode first: `export GOOGLE_SERVICE_ACCOUNT="$(base64 -d play-service-account.base64)"`.

## Sandbox Validation Checklist

1. **Redeploy functions** after updating config: `firebase deploy --only functions:validatePurchase`.
2. **iOS Sandbox**
   - Install the dev build (or TestFlight) on a device signed out of the App Store.
   - Trigger a purchase with a Sandbox Apple ID.
   - Confirm `validatePurchase` returns 200 and Firestore `users/{uid}` updates `membershipStatus`, `subscriptionExpiryDate`, and `lastValidated`.
3. **Android Sandbox**
   - Upload the same build to the Play Console internal testing track.
   - Purchase with a license tester account.
   - Confirm the callable succeeds and Firestore user doc updates.
4. Run `firebase functions:log --only validatePurchase` to verify there are no `failed-precondition` errors.

## Troubleshooting

- `failed-precondition: Apple shared secret not configured` → Set the secret via `functions:config:set` or `APPLE_SHARED_SECRET`.
- `failed-precondition: Google Play service account not configured` → Confirm `google.service_account` exists and contains valid JSON (not just the key ID).
- `Google Play service account misconfigured` → Ensure the stored JSON includes `client_email` and `private_key` and that the private key retains newline characters (base64 encoding recommended).
- `not-found: No matching subscription found in receipt` → The purchase has not propagated yet; retry after a few seconds or confirm the product ID.
