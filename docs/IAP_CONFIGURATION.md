# In-App Purchase Configuration Guide
## Symposium AI — React Native App

*Last Updated: September 2025*

---

## Overview

This guide covers the complete setup of in-app purchases for both iOS (App Store) and Android (Google Play) using react-native-iap v13.0.0.

> Update Note (Sept 2025)
> - App name: Symposium AI
> - Subscription: $7.99/month (auto‑renewable)
> - Free Trial: 7 days
> - BYOK‑only generation; Demo Mode at install

**Subscription Products**:
- Monthly: $7.99/month (7‑day free trial)
- Annual: $59.99/year (7‑day free trial; 37% savings)

---

## 1. App Store Configuration (iOS)

### 1.1 App Store Connect Setup

#### Create App
1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. My Apps → "+" → New App
3. Fill in details:
   - Platform: iOS
   - Name: Symposium AI
   - Primary Language: English (U.S.)
   - Bundle ID: `com.braveheartinnovations.debateai`
   - SKU: `SYMPOSIUM_IOS`

#### Configure In-App Purchases
1. Navigate to your app → Features → In-App Purchases
2. Click "+" to create new
3. Select "Auto-Renewable Subscription"
4. Fill in details:
   - Reference Name: `Premium Monthly`
   - Product ID: `com.braveheartinnovations.debateai.premium.monthly`
   - Subscription Group: `Premium Access`

#### Subscription Group Setup
1. Create Subscription Group: `Premium Access`
2. Add two products in the group:
   - Product A (Monthly): Duration 1 Month, Price $7.99 USD, Intro offer: 7‑day free trial
   - Product B (Annual): Duration 1 Year, Price $59.99 USD, Intro offer: 7‑day free trial
3. Localizations: Add for all target markets

#### Localization
For each language, provide:
- Display Name: "Symposium AI Premium"
- Description: "Unlock all AI personalities, unlimited group chats, expert mode, and premium features"
- Promotional Image: 1024x1024px

#### App Store Server Notifications
1. App Information → App Store Server Notifications
2. Production URL: `https://us-central1-symposium-ai-prod.cloudfunctions.net/handleAppStoreNotification`
3. Sandbox URL: `https://us-central1-symposium-ai-dev.cloudfunctions.net/handleAppStoreNotification`
4. Version: 2

### 1.2 Agreements, Tax, and Banking

#### Agreements
1. Agreements, Tax, and Banking → Agreements
2. Sign "Paid Applications Agreement"
3. Status must be "Active"

#### Banking Information
1. Add bank account details
2. Complete tax forms (W-9 for US)
3. Set up payment schedule

#### Tax Settings
1. Set tax categories for each region
2. For digital goods, most regions handle tax automatically

### 1.3 Sandbox Testing

#### Create Sandbox Testers
1. Users and Access → Sandbox Testers
2. Create test accounts:
   - Email: Must be unique, not used for real Apple ID
   - Password: Strong password
   - Region: Match your testing region

#### Testing Process
```bash
# On test device:
1. Settings → App Store → Sign Out
2. Don't sign in at Settings level
3. Launch app and attempt purchase
4. Sign in with sandbox account when prompted
```

### 1.4 App Review Guidelines

#### Required for Approval
- ✅ Restore Purchases button visible
- ✅ Privacy Policy URL accessible
- ✅ Terms of Service URL accessible
- ✅ Subscription terms clearly displayed
- ✅ Price shown before purchase
- ✅ Auto-renewal disclosure text

#### Auto-Renewal Disclosure Template
```
Payment will be charged to your Apple ID account at confirmation of purchase. 
Subscription automatically renews unless it is canceled at least 24 hours 
before the end of the current period. Your account will be charged for renewal 
within 24 hours prior to the end of the current period. You can manage and 
cancel your subscriptions by going to your account settings on the App Store 
after purchase.
```

---

## 2. Google Play Configuration (Android)

### 2.1 Google Play Console Setup

#### Create App
1. Log in to [Google Play Console](https://play.google.com/console)
2. All apps → Create app
3. Fill in details:
   - App name: Symposium AI
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free

#### Configure In-App Products
1. Navigate to Monetize → In-app products → Subscriptions
2. Create Monthly subscription:
   - Product ID: `premium_monthly`
   - Name: Symposium AI Premium (Monthly)
   - Description: Full premium access with 7-day trial
   - Billing period: 1 month
   - Default price: $7.99 USD
3. Create Annual subscription:
   - Product ID: `premium_annual`
   - Name: Symposium AI Premium (Annual)
   - Description: Full premium access - Save $36/year
   - Billing period: 1 year
   - Default price: $59.99 USD

#### Base Plans and Offers (2025 requirement)
1. Create Base Plans:
   - Base plan ID: `monthly` (Billing period: Monthly, Auto-renewing, Grace period: 7 days)
   - Base plan ID: `annual` (Billing period: Yearly, Auto-renewing, Grace period: 7 days)

2. Add Offers (per base plan):
   - Free trial: 7 days (for new subscribers)

#### Pricing
1. Set prices for all countries
2. Google handles tax automatically for most regions
3. Consider local pricing strategies

### 2.2 Service Account Setup

#### Create Service Account
1. Google Cloud Console → IAM & Admin → Service Accounts
2. Create service account:
   - Name: `symposium-ai-iap`
   - Role: `Pub/Sub Admin`
3. Create key (JSON format)
4. Save securely for server-side validation

#### Link to Play Console
1. Play Console → Setup → API access
2. Link Google Cloud project
3. Grant access to service account:
   - Financial data: View
   - Manage orders and subscriptions: Yes

### 2.3 Real-Time Developer Notifications

#### Configure Pub/Sub
1. Google Cloud Console → Pub/Sub
2. Create topic: `play-store-notifications`
3. Create subscription: `play-store-notifications-sub`

#### Set in Play Console
1. Monetization setup → Real-time developer notifications
2. Topic name: `projects/symposium-ai-prod/topics/play-store-notifications`

#### Cloud Function Handler
```typescript
// functions/src/handlePlayStoreNotification.ts
import * as functions from 'firebase-functions';
import { PubSub } from '@google-cloud/pubsub';

export const handlePlayStoreNotification = functions.pubsub
  .topic('play-store-notifications')
  .onPublish(async (message) => {
    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    switch (data.notificationType) {
      case 1: // SUBSCRIPTION_RECOVERED
      case 2: // SUBSCRIPTION_RENEWED
        await handleSubscriptionActive(data);
        break;
      case 3: // SUBSCRIPTION_CANCELED
      case 13: // SUBSCRIPTION_EXPIRED
        await handleSubscriptionEnded(data);
        break;
    }
  });
```

### 2.4 Testing

#### Internal Testing Track
1. Release → Testing → Internal testing
2. Create internal test
3. Add testers (Google accounts)
4. Testers join via opt-in URL

#### Test Payments
1. Play Console → Setup → License testing
2. Add tester Gmail accounts
3. Test cards provided by Google:
   - Always approves: 4111 1111 1111 1111
   - Always declines: 4000 0000 0000 0002

---

## 3. React Native IAP Implementation

### 3.1 Installation

```bash
# Install package
npm install react-native-iap@^13.0.0

# iOS specific
cd ios && pod install

# Android - ensure in android/app/build.gradle:
implementation 'com.android.billingclient:billing:7.0.0'
```

### 3.2 iOS Native Setup

react-native-iap supports autolinking. No manual AppDelegate changes are required for iOS.

### 3.3 Android Native Setup

```java
// android/app/src/main/java/com/braveheartinnovations/debateai/MainApplication.java
import com.dooboolab.rniap.RNIapPackage;

// Package should be auto-linked, verify it's in the list
```

### 3.4 Implementation Code

```typescript
// src/services/iap/manager.ts
import {
  initConnection,
  endConnection,
  flushFailedPurchasesCachedAsPendingAndroid,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
  type Subscription,
  type ProductPurchase,
} from 'react-native-iap';
import { Platform } from 'react-native';
import functions from '@react-native-firebase/functions';

class IAPManager {
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;
  
  private products: Subscription[] = [];
  
  async init() {
    try {
      const result = await initConnection();
      
      if (Platform.OS === 'android') {
        // Clear any pending purchases from previous sessions
        await flushFailedPurchasesCachedAsPendingAndroid();
      }
      
      // Set up listeners
      this.setupListeners();
      
      // Load products
      await this.loadProducts();
      
      return { success: true };
    } catch (error) {
      console.error('IAP initialization failed:', error);
      return { success: false, error };
    }
  }
  
  private setupListeners() {
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        console.log('Purchase updated:', purchase);
        
        // Validate receipt with your server
        const isValid = await this.validateReceipt(purchase);
        
        if (isValid) {
          // Acknowledge the purchase
          await finishTransaction({
            purchase,
            isConsumable: false,
          });
          
          // Update user subscription status
          await this.updateSubscriptionStatus(purchase);
        }
      }
    );
    
    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: any) => {
        console.warn('Purchase error:', error);
        
        if (error.code === 'E_USER_CANCELLED') {
          // User cancelled, no action needed
        } else {
          // Show error to user
          this.handlePurchaseError(error);
        }
      }
    );
  }
  
  async loadProducts() {
    try {
      const productIds = Platform.select({
        ios: [
          'com.braveheartinnovations.debateai.premium.monthly',
          'com.braveheartinnovations.debateai.premium.annual',
        ],
        android: ['premium_monthly', 'premium_annual'],
      })!;
      
      this.products = await getSubscriptions({ skus: productIds });
      return this.products;
    } catch (error) {
      console.error('Failed to load products:', error);
      return [];
    }
  }
  
  async purchase(plan: 'monthly' | 'annual' = 'monthly') {
    try {
      const productId = Platform.select({
        ios: plan === 'annual'
          ? 'com.braveheartinnovations.debateai.premium.annual'
          : 'com.braveheartinnovations.debateai.premium.monthly',
        android: plan === 'annual' ? 'premium_annual' : 'premium_monthly',
      })!;
      
      if (Platform.OS === 'ios') {
        await requestSubscription({
          sku: productId,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        });
      } else {
        // Android with base plans/offers: pass the correct offerToken for trials
        const subs = await getSubscriptions({ skus: [productId] });
        const product = subs?.[0];
        const offerToken = product?.subscriptionOfferDetails?.find((o) =>
          o.pricingPhases.pricingPhaseList.some((p) => p.priceAmountMicros === '0')
        )?.offerToken || product?.subscriptionOfferDetails?.[0]?.offerToken;
        await requestSubscription({
          sku: productId,
          subscriptionOffers: offerToken ? [{ sku: productId, offerToken }] : undefined,
        });
      }
    } catch (error: any) {
      if (error.code !== 'E_USER_CANCELLED') {
        throw error;
      }
    }
  }
  
  async restore() {
    try {
      const purchases = await getAvailablePurchases();
      
      if (purchases.length > 0) {
        // Find active subscription
        const ids = Platform.select({
          ios: [
            'com.braveheartinnovations.debateai.premium.monthly',
            'com.braveheartinnovations.debateai.premium.annual',
          ],
          android: ['premium_monthly', 'premium_annual'],
        })!;
        const activeSub = purchases.find(p => ids.includes(p.productId));
        
        if (activeSub) {
          await this.validateReceipt(activeSub);
          return { success: true, restored: true };
        }
      }
      
      return { success: true, restored: false };
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  }
  
  private async validateReceipt(purchase: Purchase) {
    const validate = functions().httpsCallable('validatePurchase');
    const result = await validate({
      receipt: purchase.transactionReceipt,
      platform: Platform.OS,
      productId: purchase.productId,
    });
    return !!result.data?.valid;
  }
  
  cleanup() {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }
    endConnection();
  }
}

export default new IAPManager();
```

---

## 4. Receipt Validation

### 4.1 iOS Receipt Validation

```typescript
// Server-side validation with Apple
async function validateAppleReceipt(receiptData: string) {
  const isProduction = process.env.NODE_ENV === 'production';
  const url = isProduction
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password: process.env.APPLE_SHARED_SECRET, // From App Store Connect
    }),
  });
  
  const data = await response.json();
  
  if (data.status === 0) {
    // Valid receipt
    const latestReceipt = data.latest_receipt_info?.[0];
    return {
      valid: true,
      expiresAt: new Date(parseInt(latestReceipt.expires_date_ms)),
      productId: latestReceipt.product_id,
    };
  }
  
  // Handle sandbox receipt in production
  if (data.status === 21007) {
    // Retry with sandbox URL
    return validateAppleReceipt(receiptData);
  }
  
  return { valid: false };
}
```

### 4.2 Android Receipt Validation

```typescript
// Server-side validation with Google Play
import { google } from 'googleapis';

async function validateAndroidReceipt(
  purchaseToken: string,
  productId: string
) {
  const androidpublisher = google.androidpublisher('v3');
  
  const auth = new google.auth.GoogleAuth({
    keyFile: './google-service-account.json',
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  
  const authClient = await auth.getClient();
  google.options({ auth: authClient });
  
  try {
    const response = await androidpublisher.purchases.subscriptions.get({
      packageName: 'com.braveheartinnovations.debateai',
      subscriptionId: productId,
      token: purchaseToken,
    });
    
    const subscription = response.data;
    
    return {
      valid: subscription.paymentState === 1, // 1 = Paid
      expiresAt: new Date(parseInt(subscription.expiryTimeMillis!)),
      autoRenewing: subscription.autoRenewing,
    };
  } catch (error) {
    console.error('Android validation error:', error);
    return { valid: false };
  }
}
```

---

## 5. Testing Checklist

### iOS Testing
- [ ] Sandbox account created in App Store Connect
- [ ] Signed out of production App Store on device
- [ ] Can purchase with sandbox account
- [ ] Receipt validation works
- [ ] Restore purchases works
- [ ] Subscription shows in Settings → Apple ID → Subscriptions
- [ ] Can cancel subscription
- [ ] Auto-renewal works (accelerated in sandbox)

### Android Testing
- [ ] Test account added to license testers
- [ ] Internal testing track published
- [ ] Tester opted in via URL
- [ ] Can purchase with test account
- [ ] Receipt validation works
- [ ] Restore purchases works
- [ ] Subscription shows in Play Store → Payments & subscriptions
- [ ] Can cancel subscription
- [ ] Real-time notifications received

### Edge Cases
- [ ] Network interruption during purchase
- [ ] App crash during purchase
- [ ] Multiple rapid purchase attempts
- [ ] Subscription upgrade/downgrade (future)
- [ ] Family sharing (iOS)
- [ ] Refund handling

---

## 6. Production Deployment

### Pre-Launch Checklist

#### App Store
- [ ] Agreements signed and active
- [ ] Banking information complete
- [ ] Tax forms submitted
- [ ] In-app purchases approved
- [ ] Server notifications configured
- [ ] Shared secret noted

#### Google Play
- [ ] Merchant account verified
- [ ] Service account configured
- [ ] Real-time notifications set up
- [ ] Base plans configured
- [ ] Pricing in all regions

#### App Requirements
- [ ] Restore purchases implemented
- [ ] Privacy policy linked
- [ ] Terms of service linked
- [ ] Subscription terms displayed
- [ ] Price clearly shown
- [ ] Cancel instructions provided

### Launch Day
1. Deploy server-side validation
2. Enable production URLs
3. Monitor first purchases closely
4. Check analytics and crash reports
5. Respond to user issues quickly

---

## 7. Troubleshooting

### Common Issues

**Issue**: "Product not found"  
**Solution**: Ensure product IDs match exactly, products are active in store

**Issue**: "User cancelled" error when not cancelled  
**Solution**: Check if agreements are signed, payment methods valid

**Issue**: Sandbox purchases not working  
**Solution**: Completely sign out of production account, use sandbox credentials

**Issue**: Android purchases fail silently  
**Solution**: Check Google Play Services is updated, clear Play Store cache

**Issue**: Restore not finding purchases  
**Solution**: Ensure using same store account that made purchase

---

## 8. Revenue Optimization

### Best Practices
1. **Free Trial**: Consider 7-day free trial to increase conversions
2. **Introductory Pricing**: First month at reduced price
3. **Annual Plans**: Offer discount for yearly subscription
4. **Localized Pricing**: Adjust prices for different markets
5. **Promotional Offers**: Use App Store promotional offers

### Analytics to Track
- Conversion rate from free to paid
- Trial to paid conversion
- Churn rate
- Average revenue per user (ARPU)
- Lifetime value (LTV)

---

## 9. Legal Requirements

### Required Disclosures
1. Auto-renewal terms
2. How to cancel subscription
3. Refund policy
4. Privacy policy
5. Terms of service

### GDPR Compliance (EU)
- Explicit consent for data processing
- Right to data deletion
- Data portability
- Clear privacy policy

### CCPA Compliance (California)
- Do Not Sell My Info option
- Privacy policy updates
- Data collection disclosure

---

## Support Resources

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [react-native-iap Documentation](https://react-native-iap.dooboolab.com/)
- [RevenueCat Blog](https://www.revenuecat.com/blog/) - Best practices

---

*For implementation support: team@braveheart-innovations.com*
