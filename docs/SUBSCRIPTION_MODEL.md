# Subscription Model Documentation
## Symposium AI - Three-Tier Membership System

*Last Updated: January 2025*  
*Version: 1.0*

---

## Executive Summary

Symposium AI implements a three-tier subscription model designed to provide a smooth user journey from discovery to paid subscription. The model emphasizes user choice with a free Demo Mode for exploration, a 7-day Trial with full access, and Premium subscriptions at competitive pricing with annual savings.

**Core Philosophy:**
- **Demo Mode**: Risk-free exploration with pre-recorded content
- **Trial**: Full experience with payment commitment
- **Premium**: Continued value at fair pricing
- **BYOK**: Users provide their own API keys for all live AI interactions

---

## 1. Membership Tiers Overview

### Tier Comparison

| Feature | Demo (Free) | Trial (7 days) | Premium (Paid) |
|---------|------------|----------------|----------------|
| **Price** | Free | Free for 7 days* | $7.99/mo or $59.99/yr |
| **Authentication** | Optional (Anonymous) | Required | Required |
| **Payment Method** | Not required | Required upfront | Active subscription |
| **Pre-recorded Content** | ✅ Full access | ✅ Full access | ✅ Full access |
| **Live AI Interactions** | ❌ | ✅ Full access | ✅ Full access |
| **API Key Configuration** | ❌ | ✅ Unlimited | ✅ Unlimited |
| **Custom Topics** | ❌ | ✅ Unlimited | ✅ Unlimited |
| **All AI Models** | View only | ✅ Full access | ✅ Full access |
| **All Personalities** | View only | ✅ Full access | ✅ Full access |
| **Export Features** | ❌ | ✅ Full access | ✅ Full access |
| **Save Conversations** | ❌ | ✅ Unlimited | ✅ Unlimited |

*Payment method required; auto-converts to Premium after 7 days unless cancelled

---

## 2. User Journey

### 2.1 Demo Mode Journey
```
App Install → Anonymous/Guest Access → Browse Demo Content → 
→ Explore Features (Read-only) → Hit Limitation → 
→ Prompted to Start Trial → Sign Up Required
```

**Key Points:**
- No barriers to initial exploration
- Clear labeling of demo vs. live content
- Strategic placement of upgrade prompts
- Anonymous Firebase auth for tracking

### 2.2 Trial Journey
```
Sign Up (Email/Social) → Add Payment Method → 
→ 7-Day Trial Starts → Full Access Granted → 
→ Trial Reminder (Day 5) → Final Warning (Day 6) → 
→ Auto-Convert to Premium OR Cancel
```

**Key Points:**
- Payment method captures intent
- Clear trial duration communication
- Proactive reminders before conversion
- Easy cancellation process

### 2.3 Premium Journey
```
Active Subscription → Full Ongoing Access → 
→ Monthly/Annual Billing → Usage Analytics → 
→ Retention Features → Upgrade to Annual (if monthly)
```

**Key Points:**
- Seamless continued access
- No feature restrictions
- Annual plan savings incentive
- Platform-managed billing

---

## 3. Detailed Tier Specifications

### 3.1 Demo Mode (Free Tier)

**Purpose:** Allow users to explore the app's interface and understand its value without commitment.

**Access Level:**
- Read-only access to all app screens
- Pre-recorded debates, chats, and comparisons
- Navigation through all menus
- View feature descriptions

**Technical Implementation:**
- Anonymous Firebase Authentication
- Local storage only (no cloud sync)
- Demo content bundled with app
- Clear "Demo" badges on content

**Restrictions:**
- Cannot input API keys
- Cannot create new content
- Cannot start live AI sessions
- Cannot export or save

**Upgrade Triggers:**
- Attempting to configure API keys
- Trying to create custom content
- Clicking on "Start Live Session"
- Export/Save actions

### 3.2 Trial Tier (7 Days Free)

**Purpose:** Provide full app experience to demonstrate value while securing payment commitment.

**Access Level:**
- Complete feature access
- All Premium features enabled
- Full BYOK API configuration
- Unlimited usage during trial

**Technical Implementation:**
- Authenticated user required
- Payment method via IAP
- Firestore trial tracking
- Automatic expiration handling

**Trial Mechanics:**
- Starts immediately upon subscription
- 7 calendar days duration
- Shows countdown in UI
- Auto-converts to paid unless cancelled
- One trial per user (tracked by account)

**User Communication:**
- Welcome message on trial start
- Daily countdown (last 3 days)
- Push notification on day 5
- Final reminder on day 6
- Conversion confirmation

### 3.3 Premium Tier (Paid)

**Purpose:** Sustainable revenue model providing full app value.

**Pricing Structure:**
- **Monthly**: $7.99/month
- **Annual**: $59.99/year (save $36/year - 37% discount)
- Both include 7-day free trial for new subscribers

**Access Level:**
- Identical to Trial tier
- Continuous access while subscribed
- No usage limitations
- Priority support (future)

**Billing:**
- Handled entirely by App Store/Google Play
- Auto-renewable subscriptions
- Platform manages payment methods
- Platform handles refunds

**Retention Features:**
- Annual plan discount
- Smooth billing experience
- No unexpected restrictions
- Regular feature updates

---

## 4. Pricing Strategy

### 4.1 Price Points Rationale

**Monthly: $7.99**
- Below psychological $10 barrier
- Competitive with single AI service subscriptions
- Fair value for BYOK model
- Accessible to individual users

**Annual: $59.99**
- Significant savings (37% off monthly)
- Under $5/month when annualized
- Strong value proposition
- Encourages commitment

### 4.2 Competitive Analysis

| Service | Monthly Price | Annual Price | API Keys Required |
|---------|--------------|--------------|-------------------|
| **Symposium AI** | $7.99 | $59.99 | Yes (BYOK) |
| ChatGPT Plus | $20 | N/A | No |
| Claude Pro | $20 | N/A | No |
| Perplexity Pro | $20 | $200 | No |

**Value Proposition:**
- Much cheaper than individual AI subscriptions
- User controls costs via BYOK
- Access to multiple AIs in one app
- Unique debate and comparison features

### 4.3 Trial Strategy

**7-Day Duration:**
- Long enough to experience value
- Short enough to maintain urgency
- Industry standard for apps
- Reduces forgotten trials

**Payment Required:**
- Filters to high-intent users
- Reduces trial abuse
- Improves conversion rates
- Standard for subscription apps

---

## 5. Implementation Requirements

### 5.1 Technical Infrastructure

**Authentication:**
- Firebase Auth (Anonymous + Full)
- Social login providers
- Account linking for anonymous → full

**Payment Processing:**
- react-native-iap integration
- App Store subscriptions
- Google Play subscriptions
- Receipt validation

**Data Management:**
- Firestore user documents
- Subscription status tracking
- Trial expiration monitoring
- Usage analytics

### 5.2 User Interface Elements

**Demo Mode:**
- "Demo" badges on content
- Upgrade prompts at friction points
- Clear value propositions
- Easy trial start flow

**Trial Mode:**
- Countdown timer display
- Days remaining indicator
- Management options
- Cancellation flow

**Premium Mode:**
- Subscription status display
- Renewal date information
- Plan switching options
- Billing history access

### 5.3 Backend Services

**Firebase Functions:**
- Receipt validation
- Trial expiration processing
- Subscription webhooks
- Analytics tracking

**Scheduled Jobs:**
- Trial expiration checks (hourly)
- Reminder notifications
- Subscription status sync
- Analytics aggregation

---

## 6. Account Settings Features

### 6.1 Subscription Management

**Display Elements:**
- Current membership tier
- Trial days remaining (if applicable)
- Next billing date (if premium)
- Payment method indicator

**Action Buttons:**
- Start Free Trial (demo users)
- Manage Subscription (trial/premium)
- Restore Purchases
- Cancel Subscription
- Switch Plans (monthly ↔ annual)

### 6.2 Navigation Flow

```
Profile Screen
    ↓
Account Settings
    ├── Subscription Status
    ├── Start Trial / Upgrade
    ├── Manage Subscription
    ├── Restore Purchases
    └── Billing History (future)
```

### 6.3 Platform Integration

**iOS:**
- Links to App Store subscriptions
- Uses iOS subscription management
- Respects iOS refund policies
- Follows iOS design guidelines

**Android:**
- Links to Play Store subscriptions
- Uses Google Play billing
- Respects Play Store policies
- Follows Material Design

---

## 7. User Communication

### 7.1 Onboarding Messages

**Demo Users:**
```
"Welcome to Symposium AI! Explore our demo content to see 
what AI debates look like. Start your free trial anytime 
to unlock live AI interactions."
```

**Trial Users:**
```
"Your 7-day free trial has started! You have full access 
to all features. Configure your API keys to begin live 
AI interactions."
```

**Premium Users:**
```
"Welcome to Symposium AI Premium! You have unlimited access 
to all features. Thank you for your subscription!"
```

### 7.2 Upgrade Prompts

**From Demo:**
```
"This feature requires a subscription. Start your 7-day 
free trial to access live AI features, custom topics, 
and more!"

[Start Free Trial] [Learn More]
```

**Trial Ending:**
```
"Your trial ends in 2 days. Continue enjoying full access 
for just $7.99/month or save 37% with annual billing."

[Continue Subscription] [View Plans]
```

### 7.3 Notification Schedule

| Day | Trial Users | Demo Users |
|-----|------------|------------|
| Install | Welcome | Welcome + Feature intro |
| Day 2 | - | Gentle upgrade reminder |
| Day 5 (Trial) | 2 days left reminder | - |
| Day 6 (Trial) | Final reminder | - |
| Day 7 (Trial) | Conversion/Expiration | - |
| Day 7 (Demo) | - | Value proposition |

---

## 8. Analytics & KPIs

### 8.1 Key Metrics

**Conversion Metrics:**
- Demo → Trial conversion rate (Target: >10%)
- Trial → Premium conversion rate (Target: >60%)
- Monthly → Annual upgrade rate (Target: >20%)

**Engagement Metrics:**
- Trial activation rate (% who configure API keys)
- Feature usage during trial
- Sessions per user by tier
- Retention by subscription type

**Revenue Metrics:**
- MRR (Monthly Recurring Revenue)
- ARPU (Average Revenue Per User)
- LTV (Lifetime Value)
- Churn rate by plan type

### 8.2 Tracking Events

```javascript
// Key events to track
- demo_mode_entered
- trial_started
- trial_cancelled
- trial_converted
- subscription_purchased
- subscription_cancelled
- subscription_renewed
- plan_switched
- feature_gate_hit
- api_key_configured
```

---

## 9. Edge Cases & Policies

### 9.1 Trial Policies

**One Trial Per User:**
- Tracked by Firebase user account
- Persists across app reinstalls
- Cannot be reset by user
- Applies to all sign-in methods

**Payment Failure:**
- Grace period (3 days monthly, 7 days annual)
- Downgrade to Demo after grace period
- Restore on successful payment
- Clear communication to user

### 9.2 Subscription Changes

**Upgrading (Monthly → Annual):**
- Prorated credit for unused monthly time
- Immediate access to annual benefits
- Handled by platform stores
- Confirmation required

**Downgrading (Annual → Monthly):**
- Takes effect at annual renewal
- Continues annual until expiry
- No partial refunds
- Clear communication of timeline

### 9.3 Refund Policy

**Platform Managed:**
- App Store: Apple's refund policy
- Google Play: Google's refund policy
- No in-app refund mechanism
- Support can guide to platform

**Impact on Access:**
- Refund triggers immediate downgrade
- Reverts to Demo Mode
- Trial cannot be reused
- Purchase history maintained

---

## 10. Future Considerations

### 10.1 Potential Enhancements

**Pricing Experiments:**
- Regional pricing adjustments
- Limited-time promotions
- Student discounts
- Referral programs

**Feature Differentiation:**
- Premium-exclusive features (future)
- Usage tiers (tokens/month)
- Team/Family plans
- Educational licenses

### 10.2 Expansion Options

**Additional Tiers:**
- Pro tier with higher limits
- Business tier with team features
- Educational tier with bulk licensing
- Enterprise with custom terms

**Monetization:**
- One-time purchases for features
- Consumable credits system
- Sponsored content (carefully)
- API reselling (future)

---

## 11. Compliance & Legal

### 11.1 Store Requirements

**App Store:**
- Restore purchases required ✅
- Subscription terms displayed ✅
- Price clearly shown ✅
- Auto-renewal disclosed ✅
- Privacy policy linked ✅

**Google Play:**
- In-app billing only ✅
- Clear pricing display ✅
- Subscription management ✅
- Cancellation instructions ✅
- Terms of service ✅

### 11.2 Legal Disclosures

**Required Text (iOS):**
```
Payment will be charged to your Apple ID account at the 
confirmation of purchase. The subscription automatically 
renews unless it is canceled at least 24 hours before the 
end of the current period. Your account will be charged for 
renewal within 24 hours prior to the end of the current 
period. You can manage and cancel your subscriptions by 
going to your App Store account settings after purchase.
```

**Required Text (Android):**
```
Payment will be charged to your Google Play account at 
confirmation of purchase. The subscription automatically 
renews unless it is canceled at least 24 hours before the 
end of the current period. You can manage and cancel your 
subscriptions in your Google Play account settings.
```

---

## 12. Success Criteria

### 12.1 Launch Targets (First 90 Days)

- 1000+ app installs
- 10% demo → trial conversion
- 60% trial → premium conversion
- 20% choose annual plan
- <5% monthly churn rate
- 4.5+ app store rating

### 12.2 Long-term Goals (Year 1)

- 10,000+ active users
- 1,500+ paying subscribers
- $10,000+ MRR
- 30% annual plan adoption
- <3% monthly churn
- Positive unit economics

---

## Conclusion

The three-tier subscription model provides a balanced approach to user acquisition and monetization. Demo Mode removes barriers to entry, Trial captures high-intent users, and Premium provides sustainable revenue. The BYOK model keeps costs low while the platform subscription provides value through features and convenience.

Success depends on:
1. Smooth user experience across all tiers
2. Clear value communication
3. Competitive pricing with savings options
4. Reliable technical implementation
5. Continuous optimization based on metrics

---

*For questions: team@braveheart-innovations.com*