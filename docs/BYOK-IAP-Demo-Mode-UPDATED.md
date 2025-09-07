# BYOK Strategy, IAP Plan, and Demo Mode Implementation
## Symposium AI - Updated January 2025

---

## Purpose
Define the three-tier subscription model: Demo Mode (free), Trial (7 days), and Premium ($7.99/mo or $59.99/yr) with BYOK (Bring Your Own Keys) for all live AI generation.

---

## Executive Summary

- **Core**: App requires user API keys (BYOK) for all live AI generation
- **Demo Mode**: Free tier with pre-recorded content only, no live AI access
- **Trial**: 7-day free trial with full access (payment method required)
- **Premium**: Full access at $7.99/month or $59.99/year (save $36)
- **Authentication**: Anonymous Firebase auth for Demo Mode, full auth for Trial/Premium

---

## App Store Review Compliance

- App is functional on first launch: Demo Mode with pre-recorded content
- Anonymous authentication allows immediate access without account creation
- Trial requires Apple ID/Google account payment method (platform IAP)
- Clear subscription terms with auto-renewal disclosure
- Restore purchases functionality implemented
- Subscription management links to platform settings
- Privacy policy and terms of service accessible
- Demo content clearly labeled as "Recorded examples"

---

## Subscription Tiers

### Demo Mode (Free)
- Access to pre-recorded debates, chats, and comparisons
- Browse all app features (read-only mode)
- No API key configuration allowed
- No live AI interactions
- No export or save capabilities
- Available to anonymous or authenticated users without subscription
- Clear "Demo" badges on all content

### Trial (7 Days Free)
- Full app access for 7 days
- Requires authentication and payment method upfront
- Configure unlimited API keys (BYOK)
- All AI models and personalities unlocked
- Create custom topics and live sessions
- Full export and save capabilities
- Auto-converts to Premium after 7 days unless cancelled
- One trial per user account (tracked)

### Premium (Paid)
- **Monthly**: $7.99/month with auto-renewal
- **Annual**: $59.99/year with auto-renewal (save $36 - 37% discount)
- Continuous full access to all features
- Same features as Trial tier
- Cancel anytime through platform subscription management
- Platform handles all billing and refunds

---

## Access Control Matrix

| Feature | Demo | Trial | Premium |
|---------|------|-------|---------|
| Pre-recorded content | ✅ | ✅ | ✅ |
| Live AI interactions | ❌ | ✅ | ✅ |
| API key configuration | ❌ | ✅ | ✅ |
| Custom topics | ❌ | ✅ | ✅ |
| All AI models | View only | ✅ | ✅ |
| All personalities | View only | ✅ | ✅ |
| Export features | ❌ | ✅ | ✅ |
| Save conversations | ❌ | ✅ | ✅ |
| Analytics dashboards | ❌ | ✅ | ✅ |
| Cross-device sync | ❌ | Future | Future |

---

## BYOK Policy

- **Requirement**: API keys required for all live AI generation (Trial and Premium only)
- **Demo Restriction**: Demo Mode users cannot configure API keys (feature gated)
- **Storage**: Stored locally only (Keychain on iOS, Keystore on Android)
- **Security**: Encrypted with user-specific key derived from Firebase UID
- **Privacy**: Never synced to cloud; never included in logs or analytics
- **Validation**: Quick metadata call on save with strict timeout
- **UX**: Provider setup wizard with deep links to provider documentation
- **Feature Gate**: Demo users see upgrade prompt when attempting configuration

---

## Demo Mode Implementation

### Principles
- **Access**: Free tier for all users (anonymous or authenticated)
- **Content**: Pre-recorded debates, chats, and comparisons bundled with app
- **Truthful Labeling**: Clear "Demo Mode" badges and "Recorded example" disclaimers
- **Restrictions**: No API keys, no custom topics, no live AI, no exports
- **Navigation**: Full app UI accessible in read-only mode
- **Upgrade Prompts**: Strategic placement at friction points
- **Authentication**: Supports anonymous Firebase auth for tracking
- **Offline Ready**: Assets bundled under `src/assets/demo/`

### Demo Content Types
1. **Debates**: 5-10 pre-recorded AI debates on popular topics
2. **Round-Robin Chats**: 5-10 multi-AI conversations
3. **Comparisons**: 5-10 side-by-side AI response comparisons

### Demo Asset Schema
```json
{
  "type": "debate",
  "id": "demo-debate-001",
  "title": "Should universal basic income be implemented?",
  "isDemo": true,
  "recorded": {
    "at": "2025-01-15T12:00:00Z",
    "source": "Pre-recorded example",
    "disclaimer": "This is a demo. Start your free trial for live AI debates."
  },
  "participants": [
    { "label": "AI A", "position": "Pro-UBI" },
    { "label": "AI B", "position": "Anti-UBI" }
  ],
  "turns": [
    {
      "round": "Opening",
      "speaker": "AI A",
      "content": "..."
    }
  ]
}
```

---

## IAP Implementation

### Product Configuration
- **iOS Monthly**: `com.braveheartinnovations.debateai.premium.monthly`
- **iOS Annual**: `com.braveheartinnovations.debateai.premium.annual`
- **Android Monthly**: `premium_monthly`
- **Android Annual**: `premium_annual`

### Pricing Structure
- **Monthly**: $7.99/month with 7-day free trial
- **Annual**: $59.99/year with 7-day free trial (save $36/year)
- **Trial**: 7 days free, payment method required, auto-renews

### Implementation Details
- **Library**: react-native-iap v13.0.0
- **Receipt Validation**: Firebase Functions
- **Subscription Tracking**: Firestore user documents
- **Platform Handling**: App Store and Google Play manage all payments
- **Restore Purchases**: Required functionality for both platforms

---

## User Journey Flows

### Demo → Trial Flow
1. User installs app
2. Anonymous Firebase auth (automatic)
3. Explores demo content
4. Hits limitation (e.g., tries to configure API key)
5. Sees upgrade prompt
6. Creates account or signs in
7. Adds payment method via IAP
8. Trial starts (7 days)

### Trial → Premium Flow
1. Trial user receives reminders (day 5, day 6)
2. Day 7: Auto-converts to Premium
3. OR: User cancels before day 7
4. Cancelled users downgrade to Demo Mode

### Direct Premium Purchase
1. Demo user chooses plan (monthly/annual)
2. Signs in or creates account
3. Adds payment method via IAP
4. If new user: Gets 7-day trial
5. If returning user: Immediate Premium access

---

## Firebase Configuration

### Authentication Methods
- **Anonymous**: Enabled for Demo Mode
- **Email/Password**: For account creation
- **Apple Sign In**: iOS users
- **Google Sign In**: Cross-platform

### User Document Schema
```typescript
interface UserDocument {
  uid: string;
  authProvider: 'anonymous' | 'email' | 'apple' | 'google';
  isAnonymous: boolean;
  
  // Subscription fields
  membershipStatus: 'demo' | 'trial' | 'premium';
  trialStartDate?: Timestamp;
  trialEndDate?: Timestamp;
  hasUsedTrial: boolean;
  subscriptionId?: string;
  productId?: 'monthly' | 'annual';
  
  // Preferences and keys
  preferences: object;
  apiKeys?: { [provider: string]: string }; // Encrypted
}
```

---

## Account Settings Screen

### Features
- Display current membership status
- Show trial days remaining (if applicable)
- Start Free Trial button (Demo users)
- Manage Subscription button (Trial/Premium users)
- Restore Purchases option
- Plan selector (monthly vs annual)
- Subscription terms and links

### Navigation
```
Profile Screen
    ↓
Account Settings
    ├── Subscription Status
    ├── Trial/Premium Management
    ├── Plan Selection
    └── Restore Purchases
```

---

## Implementation Checklist

### ✅ Documentation Complete
- [x] PREMIUM_IMPLEMENTATION.md updated
- [x] IAP_CONFIGURATION.md updated
- [x] SUBSCRIPTION_MODEL.md created
- [x] ACCOUNT_SETTINGS_IMPLEMENTATION.md created
- [x] FIREBASE_SETUP.md created
- [x] BYOK-IAP-Demo-Mode.md updated

### ⏳ Development Pending
- [ ] Firebase anonymous auth setup
- [ ] IAP integration (react-native-iap)
- [ ] Account Settings screen UI
- [ ] Demo content creation
- [ ] Feature gating implementation
- [ ] Trial countdown system
- [ ] Receipt validation functions
- [ ] Subscription webhooks

### 📱 Testing Required
- [ ] Demo Mode flow
- [ ] Trial signup and conversion
- [ ] Premium purchase flow
- [ ] Restore purchases
- [ ] Anonymous to full account conversion
- [ ] Platform-specific testing (iOS/Android)

---

## Key Differentiators

1. **BYOK Model**: Users control costs by providing their own API keys
2. **Three-Tier System**: Clear progression from Demo → Trial → Premium
3. **Fair Pricing**: $7.99/month is much cheaper than individual AI subscriptions
4. **Annual Savings**: 37% discount encourages long-term commitment
5. **Platform Native**: Uses App Store/Google Play for all payments
6. **Demo First**: Risk-free exploration before any commitment

---

## Support & Resources

- **Documentation**: `/docs` folder in repository
- **Firebase Console**: https://console.firebase.google.com
- **App Store Connect**: https://appstoreconnect.apple.com
- **Google Play Console**: https://play.google.com/console
- **Support Email**: team@braveheart-innovations.com

---

*Last Updated: January 2025*  
*Version: 2.0*
