# Store Submission Checklist
## Symposium AI React Native App

*Last Updated: December 2025*

---

## Pre-Submission Requirements

### Business Requirements
- [x] Apple Developer Account ($99/year) - Active
- [ ] Google Play Developer Account ($25 one-time) - Active
- [ ] D-U-N-S Number (for organization accounts)
- [x] Business verification completed
- [x] Tax information submitted
- [x] Banking information configured

### Legal Documents
- [x] Privacy Policy URL: `https://symposiumai.app/privacy`
- [x] Terms of Service URL: `https://symposiumai.app/terms`
- [ ] EULA (if different from Apple's standard)
- [x] Copyright documentation
- [x] Third-party licenses documented

---

## App Store Submission (iOS)

### 1. App Information

#### Basic Information
- [x] App Name: `Symposium AI` (30 characters max)
- [x] Subtitle: `Where Ideas Converge` (30 characters max)
- [x] Primary Category: `Productivity`
- [x] Secondary Category: `Utilities`
- [x] Bundle ID: `com.braveheartinnovations.debateai`

#### Age Rating
- [x] Complete age rating questionnaire
- [x] Expected rating: 12+ (Infrequent/Mild Profanity or Crude Humor)
- [x] No gambling content
- [x] No unrestricted web access

### 2. Version Information

#### What's New (Version 1.2.3)
```
Welcome to Symposium AI - Where Ideas Converge!

• AI Debate Arena: Watch different AIs debate any topic
• Chat with multiple AI providers simultaneously
• BYOK: Use your own API keys securely
• Hallucination Shield: AIs fact-check each other
• 12 unique personalities per AI
• Expert Mode for advanced users
• Beautiful light/dark themes
• Premium features with subscription or lifetime purchase

Your API keys stay private and secure on your device.
```

#### Version Details
- [x] Version Number: `1.2.3`
- [x] Build Number: `2`
- [x] Copyright: `© 2025 Braveheart Innovations LLC`

### 3. App Preview and Screenshots

#### Screenshots Required (6.7", 6.5", 5.5")
1. [x] Welcome screen showing key features
2. [x] Chat interface with multiple AIs
3. [x] AI Debate in action
4. [x] Personality selection screen
5. [x] Expert mode with model selection
6. [x] Premium upgrade screen

#### App Preview Video (Optional but Recommended)
- [ ] 15-30 seconds
- [ ] Show key features in action
- [ ] No pricing information in video
- [ ] Proper aspect ratio for each device size

### 4. In-App Purchases

#### Subscription Configuration
- [x] Product approved: `Premium Monthly ($5.99/month)`
- [ ] Product ready: `Premium Annual ($49.99/year)`
- [ ] Product ready: `Premium Lifetime ($129.99 one-time)`
- [x] Subscription group configured
- [x] Localized descriptions added
- [x] Screenshot of purchase screen uploaded
- [x] Auto-renewal disclosure included

#### Product IDs
| Product | iOS Product ID |
|---------|---------------|
| Monthly | `com.braveheartinnovations.debateai.premium.monthly.v2` |
| Annual | `com.braveheartinnovations.debateai.premium.annual.v2` |
| Lifetime | `com.braveheartinnovations.debateai.premium.lifetime.v2` |

#### Required Subscription Text
```
Symposium AI Premium - $5.99/month or $49.99/year

Payment will be charged to your Apple ID account at confirmation of purchase.
Subscription automatically renews unless it is canceled at least 24 hours before
the end of the current period. Your account will be charged for renewal within
24 hours prior to the end of the current period. You can manage and cancel your
subscriptions by going to your account settings on the App Store after purchase.

Privacy Policy: https://symposiumai.app/privacy
Terms of Service: https://symposiumai.app/terms
```

### 5. App Review Information

#### Review Notes
```
Test Account Credentials:
Email: reviewer@symposiumai.app
Password: ReviewTest2025!

To test premium features:
1. Sign in with test account
2. Navigate to Settings → Upgrade to Premium
3. Use sandbox account for purchase testing

API Keys for Testing:
The app uses BYOK (Bring Your Own Keys). Test API keys are pre-configured
in the test account. Users normally add their own API keys from providers
like OpenAI, Anthropic, or Google.

Key Features to Review:
- Multi-AI chat functionality
- AI Debate Arena (premium feature)
- Personality switching
- Expert mode with model selection
```

#### Contact Information
- [x] First Name: `Michael`
- [x] Last Name: `Spencer`
- [x] Phone: `+1 (555) 123-4567`
- [x] Email: `support@braveheart-innovations.com`

#### Demo Account
- [x] Username: `reviewer@symposiumai.app`
- [x] Password: `ReviewTest2025!`
- [x] Notes: Explain BYOK concept and test keys

### 6. Build Preparation

#### EAS Build Configuration
- [x] Bundle ID matches App Store Connect
- [x] Version and build number updated
- [x] Deployment target: iOS 12.0+
- [x] Device support: iPhone and iPad
- [x] Architectures: arm64

#### Capabilities
- [x] Sign in with Apple enabled
- [ ] Push Notifications (for future)
- [x] In-App Purchase enabled

#### Code Signing
- [x] Distribution certificate valid
- [x] Provisioning profile: App Store Distribution
- [x] Entitlements file configured correctly

### 7. Build Upload

#### Using EAS Build
```bash
# Build production iOS app
eas build --platform ios --profile production

# Submit to App Store (after build completes)
eas submit --platform ios
```

#### Manual Archive (Alternative)
```bash
# Clean build folder
rm -rf ~/Library/Developer/Xcode/DerivedData

# Archive from Xcode
Product → Archive

# Or via command line
xcodebuild -workspace ios/SymposiumAI.xcworkspace \
  -scheme SymposiumAI \
  -configuration Release \
  -archivePath build/SymposiumAI.xcarchive \
  archive
```

### 8. TestFlight

#### Internal Testing
- [x] Add internal testers (up to 100)
- [x] No review required
- [x] Test core functionality
- [x] Test IAP with sandbox accounts

#### External Testing (Beta)
- [ ] Add external testers (up to 10,000)
- [ ] Requires beta app review
- [ ] Collect feedback via TestFlight
- [ ] Monitor crash reports

### 9. App Store Optimization (ASO)

#### Keywords (100 characters)
```
ai,chat,gpt,claude,gemini,chatbot,debate,arena,conversation,api,keys,byok,premium,symposium
```

#### Promotional Text (170 characters)
```
Watch AIs debate any topic! Chat with Claude, ChatGPT, and Gemini simultaneously. Use your own API keys for maximum savings. Premium unlocks custom debates and more.
```

### 10. Final Submission

#### Submission Checklist
- [x] All metadata complete
- [x] Screenshots uploaded for all sizes
- [x] Build selected and attached
- [x] Pricing and availability configured
- [x] App review information complete
- [x] Export compliance info provided
- [ ] Submit for review

#### Expected Review Time
- Standard: 24-48 hours (as of 2025)
- Expedited: 6-12 hours (use sparingly)

---

## Firebase Backend Configuration

### Functions Deployed
- [x] `validatePurchase` - Receipt validation for iOS/Android
- [x] `handleAppStoreNotification` - App Store Server Notifications v2
- [x] `handlePlayStoreNotification` - Google Play RTDN
- [x] `deleteAccount` - GDPR/account deletion
- [x] `saveApiKey` / `deleteApiKey` / `getConfiguredProviders` - API key management
- [x] `proxyAIRequest` - AI API proxy
- [x] `proxyImageGeneration` - Image generation proxy

### Secrets Configured
- [x] `APPLE_SHARED_SECRET` - For iOS receipt validation

### Webhooks
- [x] App Store Server Notifications URL: `https://us-central1-symposium-ai.cloudfunctions.net/handleAppStoreNotification`

---

## Google Play Submission (Android) - Future

### 1. Store Listing

#### Product Details
- [ ] App name: `Symposium AI`
- [ ] Short description (80 chars): `AI Debate Arena - Watch AIs debate, chat with multiple providers`
- [ ] Full description (4000 chars max)

#### Categorization
- [ ] Category: `Productivity`
- [ ] Content rating: `Everyone 10+`
- [ ] Target audience: `18+`
- [ ] Contains ads: `No`
- [ ] In-app purchases: `Yes`

### 2. Product IDs (Android)
| Product | Android Product ID |
|---------|-------------------|
| Monthly | `premium_monthly` |
| Annual | `premium_annual` |
| Lifetime | `premium_lifetime` |

---

## Post-Submission

### Monitoring

#### Day 1-3
- [ ] Monitor crash reports
- [ ] Check user reviews
- [ ] Respond to support emails
- [ ] Track installation metrics
- [ ] Monitor subscription conversions

#### Week 1
- [ ] Analyze user feedback
- [ ] Plan first update
- [ ] Address critical bugs
- [ ] Optimize store listing
- [ ] A/B test screenshots

### Marketing

#### Launch Activities
- [ ] Press release prepared
- [ ] Social media announcements
- [ ] Email to beta testers
- [ ] Product Hunt submission
- [ ] Reddit announcements

---

## Emergency Procedures

### Critical Bug After Release

1. **Immediate Actions**
   - [ ] Assess severity and impact
   - [ ] Prepare hotfix
   - [ ] Test thoroughly
   - [ ] Submit expedited review (if needed)

2. **Communication**
   - [ ] Update app description with known issues
   - [ ] Email affected users
   - [ ] Post on social media
   - [ ] Respond to reviews

### Subscription Issues

1. **User Can't Purchase**
   - Check store configuration
   - Verify product IDs match code
   - Test with new account
   - Contact store support

2. **Receipt Validation Failing**
   - Check Firebase Functions logs
   - Verify APPLE_SHARED_SECRET
   - Test with sandbox
   - Check validatePurchase function

---

## Contact Information

### Store Support
- **Apple**: developer.apple.com/contact
- **Google**: support.google.com/googleplay/android-developer

### Internal Contacts
- **Technical Lead**: tech@braveheart-innovations.com
- **Marketing**: marketing@braveheart-innovations.com
- **Support**: support@symposiumai.app

---

## Final Pre-Submission Verification

### Technical Checklist
- [x] No debug code in production
- [x] API endpoints pointing to production
- [x] Analytics configured correctly
- [x] Crash reporting enabled
- [x] Console.logs minimized
- [x] Performance optimized

### Legal Checklist
- [x] All licenses documented
- [x] No copyright violations
- [x] GDPR compliant
- [x] CCPA compliant
- [ ] COPPA compliant (if applicable)

### Business Checklist
- [x] Support system ready
- [x] Documentation complete
- [x] Team briefed on launch
- [x] Monitoring tools configured
- [x] Backup plans in place

---

*Ready for submission? Take a deep breath and hit that submit button!*

*For urgent support during submission: team@braveheart-innovations.com*
