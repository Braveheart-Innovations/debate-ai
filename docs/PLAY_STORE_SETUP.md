# Google Play Store Setup Guide

## Prerequisites
- Google account
- $25 one-time registration fee for Google Play Developer account
- Production-ready app
- Required graphics and screenshots

## Step 1: Create Google Play Developer Account

1. Go to [Google Play Console](https://play.google.com/console)
2. Sign in with your Google account
3. Pay the $25 registration fee
4. Complete your account details:
   - Developer name (displayed on Play Store)
   - Contact email
   - Website (optional)
   - Phone number for verification

## Step 2: Generate Production Keystore

**IMPORTANT**: Keep this keystore file safe! You'll need it for all future updates.

### Generate the keystore:
```bash
cd android/app
keytool -genkey -v -keystore symposium-ai-release.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias symposium-ai
```

You'll be prompted for:
- Keystore password (save this!)
- Key password (can be same as keystore password)
- Your name
- Organizational unit
- Organization
- City/Locality
- State/Province
- Country code (2 letters)

### Configure gradle for release builds:

1. Create `android/keystore.properties` (DO NOT commit this file):
```properties
storePassword=YOUR_STORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=symposium-ai
storeFile=symposium-ai-release.keystore
```

2. Add to `.gitignore`:
```
android/keystore.properties
android/app/*.keystore
```

3. Update `android/app/build.gradle`:
```gradle
// Load keystore properties
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

## Step 3: Get SHA Fingerprints

### Get Release SHA-1 and SHA-256:
```bash
cd android/app
keytool -list -v -keystore symposium-ai-release.keystore -alias symposium-ai
```

Save these values - you'll need them for Firebase!

### Add to Firebase:
1. Go to Firebase Console → Project Settings
2. Under your Android app, click "Add fingerprint"
3. Add both SHA-1 and SHA-256 from release keystore
4. Download the updated `google-services.json`
5. Replace `android/app/google-services.json`

## Step 4: Build Release AAB

### Using EAS Build (Recommended):
```bash
# Configure EAS for production
eas build:configure

# Build Android release
eas build --platform android --profile production
```

### Or build locally:
```bash
cd android
./gradlew bundleRelease
```

The AAB file will be at: `android/app/build/outputs/bundle/release/app-release.aab`

## Step 5: Create App on Play Console

1. In Play Console, click "Create app"
2. Fill in app details:
   - App name: **Symposium AI**
   - Default language: English (US)
   - App or game: App
   - Free or paid: Free
   - Accept declarations

3. Complete all sections under "Set up your app":

### App access
- All functionality available without special access

### Content rating
- Start questionnaire
- Email address
- Category: Social
- Answer content questions (no violence, drugs, etc.)

### Target audience
- Age group: 13+
- Target audience: General

### News apps
- Answer: No (unless you plan to include news)

### COVID-19 apps
- Answer: No

### Data safety
- Fill out the form about data collection
- Data collected:
  - Email address (for authentication)
  - Display name (optional)
  - Chat messages (stored locally)
- Data is encrypted in transit
- Users can request data deletion

### Government apps
- Answer: No

## Step 6: Store Listing

### App details:
- **App name**: Symposium AI
- **Short description** (80 chars max):
  "AI debates & multi-AI chat. Where ideas converge, understanding emerges."
  
- **Full description** (4000 chars max):
```
Symposium AI brings together the world's leading AI models for unprecedented debates and conversations. Watch different AIs debate any topic, or chat with multiple AI providers simultaneously.

KEY FEATURES:

🎭 AI Debate Arena
Watch Claude, ChatGPT, Gemini and other leading AIs debate any topic in real-time. From philosophy to science, witness different AI perspectives clash and converge.

💬 Multi-AI Chat
Chat with multiple AI providers at once. Compare responses, fact-check answers, and get diverse perspectives on any question.

🛡️ Hallucination Shield
Multiple AIs fact-check each other, reducing misinformation and improving accuracy through cross-validation.

🔑 BYOK (Bring Your Own Keys)
Use your existing API keys from OpenAI, Anthropic, Google, and more. Save money compared to multiple AI subscriptions.

🎨 12 Unique Personalities
Each AI can adopt different personalities - from Socratic Teacher to Devil's Advocate, Creative Muse to Technical Expert.

✨ PREMIUM FEATURES:
• Unlimited AI debates
• Custom debate topics
• All 12 AI personalities
• Priority access to new features
• Expert mode with model selection

Perfect for:
- Students researching topics
- Professionals seeking diverse perspectives
- Anyone curious about AI capabilities
- Developers comparing AI models
- Writers seeking creative inspiration

Join the symposium where ideas converge and understanding emerges.
```

### Graphics needed:
1. **App icon**: 512x512px (we have this)
2. **Feature graphic**: 1024x500px (create this)
3. **Screenshots**: At least 2, up to 8 per device type
   - Phone: 1080x1920px or similar 16:9 or 9:16
   - Tablet: 1920x1080px or similar 16:9

### Categories:
- Category: Productivity
- Tags: AI, Chat, Debate, Education, Productivity

## Step 7: Upload AAB

1. Go to "Production" → "Create new release"
2. Upload your AAB file
3. Write release notes:
```
Initial release of Symposium AI
- AI Debate Arena with real-time debates
- Multi-AI chat with major providers
- 12 unique AI personalities
- BYOK support for API keys
- Premium features available
```
4. Save and review

## Step 8: Pricing & Distribution

1. **Countries/regions**: Select all or choose specific ones
2. **Pricing**: Free (with in-app purchases for Premium)

## Step 9: Review and Publish

1. Review all sections - must have green checkmarks
2. Submit for review
3. Initial review takes 2-3 hours to 2-3 days
4. You'll receive email when approved/rejected

## Important Files to Create

### privacy-policy.html
Create and host a privacy policy. You can use services like:
- GitHub Pages (free)
- Firebase Hosting (free)
- Termly.io (privacy policy generator)

### terms-of-service.html
Create and host terms of service

## Testing Before Release

### Internal Testing (Recommended first):
1. Go to "Testing" → "Internal testing"
2. Create internal test
3. Add tester emails (your team)
4. Upload AAB
5. Test everything thoroughly

### Closed/Open Beta:
- After internal testing succeeds
- Gradually roll out to more users
- Get feedback before production release

## Post-Launch Checklist

- [ ] Monitor crash reports in Play Console
- [ ] Respond to user reviews
- [ ] Track installation and uninstallation metrics
- [ ] Update app regularly (Google favors actively maintained apps)
- [ ] Add more screenshots/videos based on user feedback
- [ ] Consider implementing in-app reviews API
- [ ] Set up Google Play App Signing (recommended)

## SHA Fingerprint Summary

You'll have multiple SHA fingerprints:
1. **Debug SHA-1**: For development (already added)
2. **Release SHA-1**: From your keystore (add to Firebase)
3. **Google Play App Signing SHA-1**: After enabling App Signing (add to Firebase)

All must be added to Firebase for Google Sign-In to work in all scenarios.

## Common Issues

### Google Sign-In not working in production
- Ensure release SHA-1 is added to Firebase
- Download and update google-services.json
- If using App Signing, add Google's SHA-1 too

### Upload failed - version code
- Each upload needs a higher versionCode in app.json
- Increment before each build

### App rejected
Common reasons:
- Missing privacy policy
- Inappropriate content
- Misleading description
- Copyright/trademark issues
- Incomplete data safety form

## Costs

- Google Play Developer: $25 one-time
- No per-app fees
- Google takes 15% of first $1M revenue, then 30%

## Timeline

- Account approval: Instant to 48 hours
- First app review: 2-3 hours to 3 days
- Updates: Usually within 2 hours

## Next Steps

1. Create developer account
2. Generate keystore (keep it safe!)
3. Get SHA fingerprints → Add to Firebase
4. Build release AAB
5. Create store listing with screenshots
6. Submit for review

Remember: The keystore is critical - lose it and you can't update your app!