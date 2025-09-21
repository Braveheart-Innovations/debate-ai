# Beta Testing Distribution Guide for Symposium AI

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [TestFlight Setup (iOS)](#testflight-setup-ios)
- [Google Play Beta Setup (Android)](#google-play-beta-setup-android)
- [GitHub Environment Integration](#github-environment-integration)
- [Automated Workflows](#automated-workflows)
- [Managing Beta Testers](#managing-beta-testers)
- [Troubleshooting](#troubleshooting)

## Overview

This guide covers setting up beta testing distribution for Symposium AI using:
- **iOS**: TestFlight for external beta testing
- **Android**: Google Play Internal/Beta tracks
- **Automation**: GitHub Actions + EAS Submit
- **Environments**: Integration with GitHub deployment environments

### Distribution Strategy

```
GitHub Environments → EAS Build → Store Beta Programs
├── development → Internal Testing (ad-hoc/internal track)
├── staging → Beta Testing (TestFlight/closed beta)
└── production → Production Release (App Store/Play Store)
```

## Architecture

### Environment Mapping

| GitHub Environment | iOS Distribution | Android Distribution | Audience |
|-------------------|------------------|---------------------|----------|
| development | Ad Hoc (Internal) | Internal Testing | Dev team only |
| staging | TestFlight | Closed Beta | Beta testers |
| production | App Store | Production | Public |

### Build Profiles

```json
{
  "beta": {
    "distribution": "store",  // For TestFlight
    "developmentClient": false,
    "env": {
      "EXPO_PUBLIC_RELEASE_CHANNEL": "beta",
      "EXPO_PUBLIC_ENVIRONMENT": "staging"
    }
  },
  "internal-testing": {
    "distribution": "internal",  // For Google Play Internal
    "developmentClient": false,
    "env": {
      "EXPO_PUBLIC_RELEASE_CHANNEL": "internal",
      "EXPO_PUBLIC_ENVIRONMENT": "development"
    }
  }
}
```

## Prerequisites

### Required Accounts
- [x] Apple Developer Account ($99/year)
- [x] Google Play Console Account ($25 one-time)
- [x] Expo account with EAS configured
- [x] GitHub repository with environments configured

### Required API Keys

#### Apple (TestFlight)
1. **App Store Connect API Key**
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Navigate to Users and Access → Keys
   - Create a new API Key with "App Manager" role
   - Download the `.p8` file (save it securely!)
   - Note the Key ID and Issuer ID

#### Google Play
1. **Service Account JSON**
   - Already configured in Google Cloud Console
   - Ensure it has permissions for Play Console API
   - Grant "Release Manager" role in Play Console

## TestFlight Setup (iOS)

### Step 1: Configure App in App Store Connect

1. **Navigate to your app**
   ```
   App Store Connect → Apps → Symposium AI
   ```

2. **Enable TestFlight**
   - Click on TestFlight tab
   - Complete Test Information:
     - Beta App Description
     - Feedback Email
     - Marketing URL (optional)

3. **Create Beta Groups**
   ```
   TestFlight → Groups → + (Add Group)

   Recommended Groups:
   - Internal Team (automatic approval)
   - Alpha Testers (friends & family)
   - Beta Testers (public beta)
   ```

### Step 2: Configure Build Settings

1. **Export Compliance**
   ```
   TestFlight → Build → Manage Compliance
   - Uses Encryption: No (unless you add it)
   - Exempt: Yes (HTTPS is exempt)
   ```

2. **Beta App Review** (for external testers)
   - Contact Information
   - Beta App Description
   - Demo Account (if needed)
   - Notes for Review

### Step 3: Add GitHub Secrets

```bash
# In GitHub repository settings → Secrets → Actions

# Apple API Key (base64 encoded .p8 file)
APPSTORE_API_KEY_BASE64=$(base64 -i AuthKey_XXXXXX.p8)

# Apple API Key ID
APPSTORE_API_KEY_ID=XXXXXXXXXX

# Apple Issuer ID
APPSTORE_ISSUER_ID=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

# App Store Connect App ID (already set)
ASC_APP_ID=6751146458
```

## Google Play Beta Setup (Android)

### Step 1: Configure Testing Tracks

1. **Navigate to Play Console**
   ```
   Play Console → Symposium AI → Testing
   ```

2. **Set Up Internal Testing**
   ```
   Testing → Internal testing → Create new release
   - Upload AAB file (from EAS Build)
   - Add release notes
   - Save → Review → Start rollout
   ```

3. **Set Up Closed Testing (Beta)**
   ```
   Testing → Closed testing → Create track

   Track name: Beta
   Manage testers:
   - Create email lists
   - Or use Google Groups
   - Generate opt-in link
   ```

### Step 2: Configure Release Settings

1. **App Content**
   ```
   Policy → App content
   - Complete all required sections
   - Privacy policy URL
   - Target audience
   - Content rating
   ```

2. **Testing Feedback**
   ```
   Testing → Settings
   - Feedback email/URL
   - Tester instructions
   ```

### Step 3: Service Account Permissions

```bash
# In Play Console
Settings → API access → Service accounts
→ Find your service account
→ Grant permissions:
  ✓ View app information
  ✓ Manage production releases
  ✓ Manage testing track releases
```

## GitHub Environment Integration

### Configure Environment-Specific Secrets

#### Staging Environment (Beta)
```yaml
# GitHub → Settings → Environments → staging → Secrets

EXPO_TOKEN: (your-expo-token)
APPSTORE_API_KEY_BASE64: (base64-encoded-p8-file)
APPSTORE_API_KEY_ID: (key-id)
APPSTORE_ISSUER_ID: (issuer-id)
GOOGLE_SERVICE_ACCOUNT_JSON: (service-account-json)
```

#### Production Environment
```yaml
# Same secrets but with production credentials
# May use different API keys with more restricted permissions
```

### Branch Protection Rules

```yaml
staging branch:
  - Require PR reviews before merging
  - Require status checks (CI)
  - Restrict who can push
  - No force pushes

master/main branch:
  - Require PR from staging
  - Require approval from environment
  - All staging rules + manual approval
```

## Automated Workflows

### Beta Release Workflow

The automated workflow triggers on:
- Push to `staging` branch
- Manual workflow dispatch
- Scheduled releases (optional)

```yaml
# .github/workflows/beta-release.yml
name: Beta Release

on:
  push:
    branches: [staging]
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform to release'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - ios
          - android

jobs:
  beta-ios:
    if: github.event.inputs.platform == 'all' || github.event.inputs.platform == 'ios'
    # Builds and submits to TestFlight

  beta-android:
    if: github.event.inputs.platform == 'all' || github.event.inputs.platform == 'android'
    # Builds and submits to Play Console Beta
```

### Version Management

Beta versions use semantic versioning with build numbers:
```
1.0.0 (100) → Production
1.0.1-beta.1 (101) → Beta
1.0.1-beta.2 (102) → Beta
1.0.1 (103) → Production
```

## Managing Beta Testers

### iOS (TestFlight)

#### Adding Testers
1. **Internal Testers** (up to 100)
   ```
   App Store Connect → Users and Access
   → Add user with "Developer" or "Marketing" role
   → They automatically get TestFlight access
   ```

2. **External Testers** (up to 10,000)
   ```
   TestFlight → External Groups → [Group Name]
   → Add Testers (email or public link)
   ```

#### Public TestFlight Link
```
TestFlight → External Groups → [Group Name]
→ Enable Public Link
→ Share: https://testflight.apple.com/join/XXXXXXXX
```

### Android (Google Play)

#### Managing Tester Lists
1. **Email Lists**
   ```
   Testing → [Track] → Testers → Manage
   → Add email addresses (comma-separated)
   → Save
   ```

2. **Google Groups**
   ```
   Create Google Group: beta-testers@yourdomain.com
   Add to Play Console: Testing → [Track] → Add Google Group
   ```

#### Opt-in Links
```
Internal: https://play.google.com/apps/internaltest/XXXXXXXXXX
Beta: https://play.google.com/apps/testing/com.braveheartinnovations.debateai
```

## Testing Workflow

### For Developers

1. **Create feature branch**
   ```bash
   git checkout -b feature/new-feature
   git push origin feature/new-feature
   ```

2. **Create PR to staging**
   ```bash
   # After PR approval and merge
   # Automatic beta build triggered
   ```

3. **Monitor deployment**
   ```
   GitHub Actions → Beta Release → View logs
   ```

### For Beta Testers

#### iOS TestFlight
1. Install TestFlight app from App Store
2. Open invitation email/link
3. Tap "View in TestFlight"
4. Install beta version
5. Provide feedback via TestFlight

#### Android Beta
1. Join beta program via opt-in link
2. Wait for approval (instant for open beta)
3. Update app from Play Store (shows "Beta" badge)
4. Provide feedback via Play Store or in-app

## Build Commands

### Manual Beta Builds

```bash
# iOS TestFlight Build
eas build --platform ios --profile beta
eas submit --platform ios --profile beta

# Android Beta Build
eas build --platform android --profile internal-testing
eas submit --platform android --profile internal-testing

# Both Platforms
eas build --platform all --profile beta
eas submit --platform all --profile beta
```

### Automated via GitHub

```bash
# Trigger beta release
git push origin staging

# Or manually trigger
# GitHub → Actions → Beta Release → Run workflow
```

## Monitoring & Analytics

### TestFlight Analytics
- Crash reports
- Session counts
- Tester engagement
- Feedback summary

Access: App Store Connect → TestFlight → [Build] → Test Details

### Google Play Console
- Pre-launch reports
- Crash analytics
- User feedback
- Vitals dashboard

Access: Play Console → Testing → [Track] → View details

## Troubleshooting

### Common Issues

#### TestFlight Build Not Appearing
- Wait 10-30 minutes for processing
- Check export compliance is set
- Verify build was uploaded to correct app
- Check for App Store Connect emails about issues

#### Google Play Beta Not Available
- Ensure tester is in approved list
- Clear Play Store cache
- Check country availability
- Wait for propagation (up to 2 hours)

#### Build Failures
```bash
# Check EAS build logs
eas build:list --platform ios --limit 5
eas build:view [build-id]

# Verify credentials
eas credentials
```

#### Version Conflicts
- iOS: Build number must increment
- Android: Version code must increment
- Use automated version bumping in workflows

### Debug Commands

```bash
# Check current EAS configuration
eas build:configure

# Validate eas.json
eas build:inspect --platform all --profile beta

# Test submission locally
eas submit --platform ios --profile beta --non-interactive=false

# View submission status
eas submit:list --platform all
```

## Best Practices

### Release Cadence
- **Internal**: Daily/on-demand
- **Beta**: Weekly or bi-weekly
- **Production**: Monthly or feature-complete

### Communication
1. **Release Notes**
   - What's new
   - Known issues
   - Feedback requests

2. **Tester Engagement**
   - Regular updates
   - Respond to feedback
   - Thank contributors

### Quality Gates
- ✅ All CI checks pass
- ✅ No critical crashes in last beta
- ✅ Core features tested
- ✅ Performance benchmarks met

## Next Steps

1. **Complete API key setup** in GitHub Secrets
2. **Configure beta groups** in TestFlight/Play Console
3. **Run first beta deployment** via workflow
4. **Invite initial testers** (start small)
5. **Establish feedback process**

## Resources

- [TestFlight Documentation](https://developer.apple.com/testflight/)
- [Google Play Testing Guide](https://support.google.com/googleplay/android-developer/answer/9845334)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments)

---

For questions or issues, contact the development team or check the [GitHub Issues](https://github.com/yourusername/symposium-ai/issues).