# GitHub CI/CD Setup Guide for Symposium AI

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Architecture](#architecture)
- [Phase 1: Foundation Setup](#phase-1-foundation-setup)
- [Phase 2: CI/CD Workflows](#phase-2-cicd-workflows)
- [Phase 3: Repository Configuration](#phase-3-repository-configuration)
- [Phase 4: Store Automation](#phase-4-store-automation)
- [Security Configuration](#security-configuration)
- [Testing & Validation](#testing--validation)
- [Troubleshooting](#troubleshooting)
- [Maintenance](#maintenance)

## Overview

This guide provides comprehensive instructions for setting up GitHub CI/CD pipelines for the Symposium AI React Native application. The setup includes automated builds, testing, security scanning, and store deployments.

### Goals
- ✅ Automated quality checks on every commit
- ✅ Automated builds for iOS and Android
- ✅ Automated store submissions
- ✅ Security scanning and vulnerability detection
- ✅ Environment-based deployments
- ✅ Release automation

## Prerequisites

### Required Accounts & Access
1. **GitHub Repository Access**
   - Admin access to `mspnc1/symposium-ai` repository
   - GitHub Actions enabled

2. **Expo/EAS Account**
   - Expo account with EAS Build access
   - Project slug: `debateai`
   - Owner: `braveheartinnovations`

3. **Apple Developer Account**
   - App Store Connect access
   - App ID: `6751146458`
   - Bundle ID: `com.braveheartinnovations.debateai`

4. **Google Play Console**
   - Developer account access
   - Package name: `com.braveheartinnovations.debateai`

5. **Firebase Project**
   - Project access for authentication
   - Service account key for deployments

### Local Requirements
```bash
# Ensure you have these installed locally
npm --version  # 8.0.0 or higher
expo --version  # Latest version
eas --version   # Latest version
gh --version    # GitHub CLI
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         GitHub                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Triggers   │───▶│   Workflows  │───▶│   Actions    │ │
│  │              │    │              │    │              │ │
│  │ - Push       │    │ - CI         │    │ - Build      │ │
│  │ - PR         │    │ - Build      │    │ - Test       │ │
│  │ - Release    │    │ - Deploy     │    │ - Deploy     │ │
│  │ - Schedule   │    │ - Security   │    │ - Scan       │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                        Secrets                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ EXPO_TOKEN, APPLE_ID, GOOGLE_SERVICE_ACCOUNT, etc.     ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌──────────────────────────────────────────┐
        │              External Services            │
        ├────────────────┬─────────────┬───────────┤
        │   EAS Build    │  App Store  │  Play     │
        │                │   Connect    │  Console  │
        └────────────────┴─────────────┴───────────┘
```

## Phase 1: Foundation Setup

### Step 1.1: Create GitHub Actions Directory Structure

```bash
# Create the necessary directories
mkdir -p .github/workflows
mkdir -p .github/ISSUE_TEMPLATE
```

### Step 1.2: Create Basic CI Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: Continuous Integration

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

jobs:
  quality-check:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: TypeScript compilation
        run: npx tsc --noEmit

      - name: ESLint check
        run: npm run lint

      - name: Run tests (if available)
        run: npm test -- --passWithNoTests
        continue-on-error: true

      - name: Check bundle size
        run: |
          npm run build:analyze || true
        continue-on-error: true
```

### Step 1.3: Create Pull Request Template

Create `.github/pull_request_template.md`:

```markdown
## Description
Brief description of the changes in this PR.

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement

## Testing
- [ ] TypeScript compilation passes (`npx tsc --noEmit`)
- [ ] ESLint passes (`npm run lint`)
- [ ] Tested on iOS simulator
- [ ] Tested on Android emulator
- [ ] All existing tests pass

## Screenshots (if applicable)
Add screenshots here if UI changes are involved.

## Checklist
- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] Any dependent changes have been merged

## Related Issues
Closes #(issue number)
```

### Step 1.4: Create Issue Templates

Create `.github/ISSUE_TEMPLATE/bug_report.md`:

```markdown
---
name: Bug report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Device Information:**
 - Device: [e.g. iPhone 14]
 - OS: [e.g. iOS 17.0]
 - App Version: [e.g. 1.0.0]

**Additional context**
Add any other context about the problem here.
```

Create `.github/ISSUE_TEMPLATE/feature_request.md`:

```markdown
---
name: Feature request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

**Is your feature request related to a problem?**
A clear description of what the problem is.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots about the feature request here.
```

## Phase 2: CI/CD Workflows

### Step 2.1: EAS Build Workflow

Create `.github/workflows/build.yml`:

```yaml
name: EAS Build

on:
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform to build for'
        required: true
        default: 'all'
        type: choice
        options:
          - ios
          - android
          - all
      profile:
        description: 'Build profile'
        required: true
        default: 'preview'
        type: choice
        options:
          - development
          - preview
          - production
      submit:
        description: 'Submit to store after build'
        required: false
        default: false
        type: boolean

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Build for iOS
        if: ${{ github.event.inputs.platform == 'ios' || github.event.inputs.platform == 'all' }}
        run: |
          eas build --platform ios --profile ${{ github.event.inputs.profile }} --non-interactive

      - name: Build for Android
        if: ${{ github.event.inputs.platform == 'android' || github.event.inputs.platform == 'all' }}
        run: |
          eas build --platform android --profile ${{ github.event.inputs.profile }} --non-interactive

      - name: Submit to stores
        if: ${{ github.event.inputs.submit == 'true' && github.event.inputs.profile == 'production' }}
        run: |
          if [[ "${{ github.event.inputs.platform }}" == "ios" || "${{ github.event.inputs.platform }}" == "all" ]]; then
            eas submit --platform ios --latest --non-interactive
          fi
          if [[ "${{ github.event.inputs.platform }}" == "android" || "${{ github.event.inputs.platform }}" == "all" ]]; then
            eas submit --platform android --latest --non-interactive
          fi
```

### Step 2.2: Automated Release Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      upload_url: ${{ steps.create_release.outputs.upload_url }}
      version: ${{ steps.version.outputs.version }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Get version
        id: version
        run: echo "version=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Generate changelog
        id: changelog
        run: |
          git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --pretty=format:"- %s" > CHANGELOG.txt
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          cat CHANGELOG.txt >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Create Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ steps.version.outputs.version }}
          body: |
            ## What's Changed
            ${{ steps.changelog.outputs.changelog }}

            ## Full Changelog
            https://github.com/${{ github.repository }}/compare/$(git describe --tags --abbrev=0 HEAD^)...${{ github.ref_name }}
          draft: false
          prerelease: false

  build-and-deploy:
    needs: create-release
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Install dependencies
        run: npm ci

      - name: Update app version
        run: |
          npm version ${{ needs.create-release.outputs.version }} --no-git-tag-version
          npx expo install --fix

      - name: Build for production
        run: |
          eas build --platform all --profile production --non-interactive

      - name: Submit to App Store
        run: |
          eas submit --platform ios --latest --non-interactive

      - name: Submit to Play Store
        run: |
          eas submit --platform android --latest --non-interactive
```

### Step 2.3: Security Scanning Workflow

Create `.github/workflows/security.yml`:

```yaml
name: Security Scan

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  dependency-scan:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run npm audit
        run: |
          npm audit --audit-level=moderate
        continue-on-error: true

      - name: Run Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=medium
        continue-on-error: true

  secret-scan:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: TruffleHog OSS
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD

  codeql-analysis:
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v2
        with:
          languages: javascript, typescript

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v2
```

## Phase 3: Repository Configuration

### Step 3.1: GitHub Secrets Configuration

Navigate to your repository Settings → Secrets and variables → Actions, and add:

#### Required Secrets

**Android Keystore**: Most Expo apps use EAS-managed keystores (check with `eas credentials`). If EAS manages your keystore, SKIP all the ANDROID_KEYSTORE_* secrets below.

**Note on Service Accounts**: You already mentioned having these:
- **EAS Build Service Account JSON**: This is your `GOOGLE_SERVICE_ACCOUNT_JSON` - just copy/paste the entire JSON file content
- **Firebase Admin SDK Service Account JSON**: This is your `FIREBASE_SERVICE_ACCOUNT` - just copy/paste the entire JSON file content

| Secret Name | Description | How to Obtain |
|------------|-------------|---------------|
| `EXPO_TOKEN` | Expo authentication token | Run `node scripts/get-expo-token.js` after `npx expo login` |
| `APPLE_ID` | Apple Developer account email | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for Apple ID | Generate at appleid.apple.com |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Play service account for store submissions | Use your existing EAS Build service account JSON file |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK service account | Firebase Console → Project Settings → Service Accounts → Generate New Private Key |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoded keystore | **SKIP IF USING EAS-MANAGED KEYSTORE** - Only needed for custom keystore: `base64 < your-keystore.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password | **SKIP IF USING EAS-MANAGED KEYSTORE** - Only needed for custom keystore |
| `ANDROID_KEY_ALIAS` | Key alias | **SKIP IF USING EAS-MANAGED KEYSTORE** - Only needed for custom keystore |
| `ANDROID_KEY_PASSWORD` | Key password | **SKIP IF USING EAS-MANAGED KEYSTORE** - Only needed for custom keystore |
| `SNYK_TOKEN` | Snyk security scanning | Sign up at snyk.io |

#### Optional Secrets

| Secret Name | Description | Purpose |
|------------|-------------|---------|
| `SLACK_WEBHOOK` | Slack notifications | Build notifications |
| `SENTRY_AUTH_TOKEN` | Sentry error tracking | Deploy source maps |
| `CODECOV_TOKEN` | Code coverage | Coverage reports |

### Step 3.2: Branch Protection Rules

1. Go to Settings → Branches
2. Add rule for `master` branch:
   - ✅ Require a pull request before merging
   - ✅ Require approvals: 1
   - ✅ Dismiss stale pull request approvals
   - ✅ Require status checks to pass:
     - `quality-check`
     - `dependency-scan`
   - ✅ Require branches to be up to date
   - ✅ Require conversation resolution
   - ✅ Include administrators

### Step 3.3: GitHub Environments Configuration - Detailed Setup

#### Prerequisites for Environments
- **Public repos**: Environments work on any GitHub plan
- **Private repos**: Requires GitHub Pro, Team, or Enterprise

#### Navigation to Environments

1. **Go to your repository** on GitHub.com
2. **Click the "Settings" tab** (far right in the tab bar)
3. **In the left sidebar**, scroll down to "Code and automation" section
4. **Click "Environments"**
5. You'll see either existing environments or "There are no environments for this repository"

#### Creating the Development Environment

1. **Click the green "New environment" button**
2. **Environment name**: Type `development` (exactly as shown)
3. **Click "Configure environment"**

4. **Configure Development Settings**:

   **Protection Rules**:
   - [ ] Leave "Required reviewers" UNCHECKED (development needs no approval)
   - [ ] Leave "Wait timer" UNCHECKED (deploys immediately)

   **Deployment Branches**:
   - Click the dropdown and select **"Selected branches and tags"**
   - Click **"Add deployment branch or tag rule"**
   - Type `develop` in the name pattern field
   - Click **"Add rule"**
   - Add another rule for `feature/*` (for feature branches)

   **Environment Secrets** (click "Add secret" for each):
   - Skip for now - development can use repository secrets

   **Environment Variables** (click "Add variable" for each):
   - Name: `ENVIRONMENT`, Value: `development`
   - Name: `BUILD_PROFILE`, Value: `development`

#### Creating the Staging Environment

1. **Return to Environments page** (click "Environments" in sidebar)
2. **Click "New environment"**
3. **Environment name**: Type `staging`
4. **Click "Configure environment"**

5. **Configure Staging Settings**:

   **Protection Rules**:
   - [x] Check **"Required reviewers"**
     - In the search box, type your GitHub username or team member
     - Select 1 reviewer from the dropdown
     - [x] Check **"Prevent self-review"**
   - [x] Check **"Wait timer"**
     - Enter `10` minutes

   **Deployment Branches**:
   - Select **"Selected branches and tags"**
   - Add rule: `staging`
   - Add rule: `release/*`

   **Environment Variables**:
   - Name: `ENVIRONMENT`, Value: `staging`
   - Name: `BUILD_PROFILE`, Value: `preview`

#### Creating the Production Environment

1. **Return to Environments page**
2. **Click "New environment"**
3. **Environment name**: Type `production`
4. **Click "Configure environment"**

5. **Configure Production Settings**:

   **Protection Rules**:
   - [x] Check **"Required reviewers"**
     - Add 2-3 reviewers (senior team members)
     - [x] Check **"Prevent self-review"**
   - [x] Check **"Wait timer"**
     - Enter `30` minutes
   - [ ] UNCHECK **"Allow administrators to bypass"** (even admins follow rules)

   **Deployment Branches**:
   - Select **"Selected branches and tags"**
   - Add rule: `master` (or `main` if that's your default)
   - Add rule: `v*` (check "Tag" box for this one - for version tags)

   **Environment Secrets** (for production-specific values):
   - Click "Add secret"
   - Name: `PRODUCTION_EXPO_TOKEN`
   - Value: Your production Expo token (if different from dev)

   **Environment Variables**:
   - Name: `ENVIRONMENT`, Value: `production`
   - Name: `BUILD_PROFILE`, Value: `production`

#### Understanding Environment vs Repository Secrets

**Repository Secrets** (Settings → Secrets and variables → Actions):
- Available to ALL workflows
- Less secure - any workflow can access
- Good for: Build tools, general credentials

**Environment Secrets** (Settings → Environments → [Name] → Secrets):
- Only available when deploying to that environment
- Protected by environment rules
- Good for: Production API keys, deployment credentials

#### Connecting Environments to Workflows

Update your workflows to use environments. Example in `.github/workflows/build.yml`:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.profile }}  # Uses the selected profile as environment
    steps:
      # Your build steps here
```

This ensures the workflow respects environment protection rules and uses environment-specific secrets.

### Step 3.4: Create CODEOWNERS File

Create `.github/CODEOWNERS`:

```
# Default owners for everything in the repo
* @mspnc1

# Frontend code
/src/ @mspnc1
/src/components/ @mspnc1
/src/screens/ @mspnc1

# Configuration files
/app.json @mspnc1
/eas.json @mspnc1
/package.json @mspnc1

# Documentation
/docs/ @mspnc1
*.md @mspnc1

# GitHub Actions
/.github/ @mspnc1
```

## Phase 4: Store Automation

### Step 4.1: App Store Connect Configuration

1. **Create API Key**:
   - Go to App Store Connect → Users and Access → Keys
   - Create a new key with "App Manager" role
   - Download the `.p8` file
   - Note the Key ID and Issuer ID

2. **Configure in EAS**:
   ```bash
   eas secret:create --name APPLE_API_KEY --value "$(cat AuthKey_XXXXXX.p8)"
   eas secret:create --name APPLE_API_KEY_ID --value "XXXXXXXXXX"
   eas secret:create --name APPLE_API_ISSUER_ID --value "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

3. **Update eas.json**:
   ```json
   {
     "submit": {
       "production": {
         "ios": {
           "appleId": "your-apple-id@example.com",
           "ascAppId": "6751146458",
           "appleTeamId": "YOUR_TEAM_ID"
         }
       }
     }
   }
   ```

### Step 4.2: Google Play Console Configuration

1. **Create Service Account**:
   - Go to Google Cloud Console
   - Create new service account
   - Download JSON key
   - Grant "Release Manager" role in Play Console

2. **Configure in EAS**:
   ```bash
   eas secret:create --name GOOGLE_SERVICE_ACCOUNT_JSON --value "$(cat service-account.json)" --type file
   ```

3. **Update eas.json**:
   ```json
   {
     "submit": {
       "production": {
         "android": {
           "serviceAccountKeyPath": "./service-account.json",
           "track": "production",
           "releaseStatus": "completed"
         }
       }
     }
   }
   ```

### Step 4.3: Automated Version Bumping

Create `.github/workflows/version-bump.yml`:

```yaml
name: Version Bump

on:
  workflow_dispatch:
    inputs:
      version_type:
        description: 'Version bump type'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  bump-version:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Configure Git
        run: |
          git config --local user.email "action@github.com"
          git config --local user.name "GitHub Action"

      - name: Bump version
        run: |
          npm version ${{ github.event.inputs.version_type }} --no-git-tag-version
          VERSION=$(node -p "require('./package.json').version")
          echo "VERSION=$VERSION" >> $GITHUB_ENV

      - name: Update app.json
        run: |
          node -e "
          const fs = require('fs');
          const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
          appJson.expo.version = '${{ env.VERSION }}';
          const buildNumber = parseInt(appJson.expo.ios.buildNumber) + 1;
          appJson.expo.ios.buildNumber = String(buildNumber);
          appJson.expo.android.versionCode = buildNumber;
          fs.writeFileSync('app.json', JSON.stringify(appJson, null, 2));
          "

      - name: Commit changes
        run: |
          git add package.json package-lock.json app.json
          git commit -m "chore: bump version to ${{ env.VERSION }}"

      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v5
        with:
          branch: version-bump-${{ env.VERSION }}
          title: "chore: bump version to ${{ env.VERSION }}"
          body: |
            ## Version Bump

            Bumping version to `${{ env.VERSION }}` (${{ github.event.inputs.version_type }} bump)

            ### Changes
            - Updated version in package.json
            - Updated version in app.json
            - Incremented build numbers

            ### Next Steps
            1. Review the changes
            2. Merge this PR
            3. Create a release tag: `v${{ env.VERSION }}`
          labels: version-bump
          assignees: ${{ github.actor }}
```

## Security Configuration

### Security Best Practices

1. **Never commit sensitive data**:
   - API keys
   - Passwords
   - Certificates
   - Private keys

2. **Use GitHub Secrets for all sensitive values**

3. **Rotate secrets regularly**:
   - Set calendar reminders for rotation
   - Use expiring tokens where possible

4. **Limit secret access**:
   - Use environment-specific secrets
   - Restrict workflow permissions

5. **Enable security features**:
   - Dependabot alerts
   - Code scanning
   - Secret scanning

### Setting Up Dependabot

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "04:00"
    open-pull-requests-limit: 10
    reviewers:
      - "mspnc1"
    labels:
      - "dependencies"
    groups:
      react-native:
        patterns:
          - "react-native*"
          - "@react-native*"
      expo:
        patterns:
          - "expo*"
          - "@expo/*"
      development:
        patterns:
          - "@types/*"
          - "eslint*"
          - "prettier*"
        update-types:
          - "minor"
          - "patch"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "github-actions"
```

## Testing & Validation

### Step-by-Step Validation

1. **Test CI Workflow**:
   ```bash
   # Create a test branch
   git checkout -b test/ci-workflow

   # Make a small change
   echo "// Test comment" >> src/App.tsx

   # Commit and push
   git add . && git commit -m "test: CI workflow"
   git push origin test/ci-workflow

   # Create a PR and verify checks pass
   ```

2. **Test Build Workflow**:
   - Go to Actions tab
   - Select "EAS Build" workflow
   - Click "Run workflow"
   - Select platform and profile
   - Monitor build progress

3. **Test Security Scanning**:
   - Security scans run automatically on push
   - Check Actions tab for results
   - Review any vulnerabilities found

4. **Test Branch Protection**:
   - Try to push directly to master (should fail)
   - Create PR without passing checks (merge should be blocked)
   - Verify required reviews work

### Monitoring & Alerts

1. **Set up GitHub notifications**:
   - Watch repository for all activity
   - Configure email alerts for failed workflows

2. **Create status badge**:
   Add to README.md:
   ```markdown
   ![CI](https://github.com/mspnc1/symposium-ai/workflows/Continuous%20Integration/badge.svg)
   ![Security](https://github.com/mspnc1/symposium-ai/workflows/Security%20Scan/badge.svg)
   ```

3. **Set up Slack notifications** (optional):
   Add to workflows:
   ```yaml
   - name: Notify Slack
     if: failure()
     uses: slackapi/slack-github-action@v1
     with:
       webhook-url: ${{ secrets.SLACK_WEBHOOK }}
       payload: |
         {
           "text": "Build failed: ${{ github.workflow }} - ${{ github.ref }}"
         }
   ```

## Troubleshooting

### Environment-Specific Issues

#### Issue: "Environments" option not visible in Settings
**Solution**:
- For private repos, you need GitHub Pro, Team, or Enterprise
- For public repos, ensure you have admin access to the repository
- Try refreshing the page or logging out and back in

#### Issue: Environment protection rules not working
**Solution**:
1. Verify the workflow specifies `environment: production` (or appropriate name)
2. Check that branch names in deployment rules match exactly
3. Ensure reviewers have repository access
4. Confirm the workflow is running on the correct branch

#### Issue: Can't find environment secrets in workflow
**Solution**:
- Environment secrets are only available when `environment:` is specified in the job
- Use `${{ secrets.SECRET_NAME }}` not `${{ env.SECRET_NAME }}`
- Check secret is added to the correct environment, not repository secrets

#### Issue: "Waiting for approval" but no notification received
**Solution**:
1. Check reviewer's GitHub notification settings
2. Verify reviewer email is confirmed
3. Look in Actions tab → click on the workflow run → "Review deployments" button
4. Ensure reviewer isn't the person who triggered the workflow (if "Prevent self-review" is checked)

### Common Issues and Solutions

#### Issue: "Expo token is invalid"
**Solution**:
1. Generate new token: `expo logout && expo login`
2. Get token: `expo whoami --token`
3. Update GitHub secret `EXPO_TOKEN`

#### Issue: "iOS build fails with provisioning profile error"
**Solution**:
1. Ensure Apple Developer account is active
2. Check certificates in App Store Connect
3. Run `eas credentials` to reset

#### Issue: "Android build fails with keystore error"
**Solution**:
1. Verify keystore is correctly base64 encoded
2. Check keystore passwords match
3. Ensure key alias is correct

#### Issue: "Workflow fails with permission denied"
**Solution**:
1. Check repository settings → Actions → General
2. Ensure "Read and write permissions" is selected
3. Verify workflow has necessary permissions

#### Issue: "PR checks never complete"
**Solution**:
1. Check if workflows are running in Actions tab
2. Verify branch protection rules are correct
3. Ensure required status checks names match workflow job names

### Debug Commands

```bash
# Check GitHub CLI authentication
gh auth status

# List repository secrets (names only)
gh secret list

# View workflow runs
gh run list

# View specific workflow run details
gh run view [run-id]

# Download workflow logs
gh run download [run-id]

# Trigger workflow manually
gh workflow run [workflow-name]

# Check branch protection
gh api repos/:owner/:repo/branches/master/protection
```

## Maintenance

### Weekly Tasks
- Review Dependabot PRs
- Check security scan results
- Update dependencies if needed
- Review failed workflow runs

### Monthly Tasks
- Rotate sensitive secrets
- Review and update workflow versions
- Check for new security best practices
- Update documentation

### Quarterly Tasks
- Full security audit
- Performance review of CI/CD pipelines
- Cost analysis of GitHub Actions usage
- Update branch protection rules if needed

### Annual Tasks
- Renew certificates and keys
- Review and update all documentation
- Audit repository access and permissions
- Plan for major version updates

## Next Steps

After completing this setup:

1. **Immediate Actions**:
   - [ ] Create all workflow files
   - [ ] Configure GitHub Secrets
   - [ ] Set up branch protection
   - [ ] Test CI/CD pipelines

2. **Within 1 Week**:
   - [ ] Configure store automation
   - [ ] Set up monitoring
   - [ ] Document team processes
   - [ ] Train team on new workflows

3. **Within 1 Month**:
   - [ ] Optimize build times
   - [ ] Add advanced testing
   - [ ] Implement code coverage
   - [ ] Set up staging environment

4. **Ongoing**:
   - [ ] Monitor and improve pipelines
   - [ ] Keep dependencies updated
   - [ ] Maintain security standards
   - [ ] Document lessons learned

## Resources

### Documentation
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [EAS Build Documentation](https://docs.expo.dev/eas/)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
- [Google Play Publishing API](https://developers.google.com/android-publisher)

### Tools
- [act](https://github.com/nektos/act) - Run GitHub Actions locally
- [actionlint](https://github.com/rhysd/actionlint) - Lint workflow files
- [gh](https://cli.github.com/) - GitHub CLI

### Community
- [GitHub Community Forum](https://github.community/)
- [Expo Forums](https://forums.expo.dev/)
- [React Native Community](https://github.com/react-native-community)

---

*Last Updated: September 2024*
*Version: 1.0.0*
*Maintained by: Symposium AI Development Team*