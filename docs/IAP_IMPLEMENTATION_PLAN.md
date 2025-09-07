# In-App Purchase Implementation Plan

## Symposium AI - React Native

_Last Updated: January 2025_  
_Version: 1.0_

---

## Executive Summary

This document provides a comprehensive implementation guide for adding in-app purchases to Symposium AI using React Native community standards and atomic design principles. The implementation uses `react-native-iap` v13.0.0, the most mature and widely-adopted IAP library in the React Native ecosystem.

### Revenue Model

- **Single Tier**: Symposium AI Premium
- **Price**: $7.99/month (auto-renewable subscription)
- **Platforms**: iOS (App Store) and Android (Google Play)

### Timeline

- **Total Duration**: 12 days
- **Phase 1**: IAP Setup & Configuration (Days 1-3)
- **Phase 2**: Platform Configuration (Days 4-6)
- **Phase 3**: Receipt Validation (Days 7-8)
- **Phase 4**: UI Implementation (Days 9-10)
- **Phase 5**: Storage & Testing (Days 11-12)

---

## Premium vs Free Feature Comparison

| Feature               | Free Tier           | Premium Tier                |
| --------------------- | ------------------- | --------------------------- |
| **AI Personalities**  | Default only        | All 12 personalities per AI |
| **Compare Mode**      | ❌ Not available    | ✅ Full access              |
| **Debate Topics**     | Pre-defined only    | Custom topics               |
| **Chat Storage**      | 3 conversations max | Unlimited                   |
| **Compare Storage**   | 3 comparisons max   | Unlimited                   |
| **Debate Storage**    | 3 debates max       | Unlimited                   |
| **Share Transcripts** | ❌ Not available    | ✅ Available                |
| **Priority Support**  | Standard            | Priority                    |

---

## Technical Architecture

### React Native Standards

#### Core Dependencies

```json
{
  "dependencies": {
    "react-native-iap": "^13.0.0",
    "@react-native-firebase/functions": "^21.0.0",
    "@react-native-async-storage/async-storage": "^2.1.2"
  }
}
```

#### Key Principles

1. **Async-First**: All IAP operations are asynchronous
2. **Error Boundaries**: Wrap purchase flows in error boundaries
3. **Platform Abstraction**: Single API for both iOS and Android
4. **State Management**: Redux for subscription state
5. **Offline Support**: Cache subscription status locally

### Atomic Design Structure

```
src/
├── components/
│   ├── atoms/
│   │   ├── PremiumLockIcon.tsx         # Lock icon for premium features
│   │   ├── StorageIndicator.tsx        # Visual storage usage indicator
│   │   └── PriceTag.tsx                # Price display component
│   │
│   ├── molecules/
│   │   ├── PremiumBadge.tsx           # "Premium" badge for features
│   │   ├── PurchaseButton.tsx         # Subscribe button with states
│   │   ├── StorageUsageCard.tsx       # "2/3 Debates" display
│   │   ├── FeatureGate.tsx            # Blocks/allows feature access
│   │   └── RestorePurchaseLink.tsx    # Required restore functionality
│   │
│   └── organisms/
│       ├── PremiumUpgradeModal.tsx    # Full upgrade flow modal
│       ├── SubscriptionManager.tsx    # Manage subscription settings
│       ├── StorageLimitModal.tsx      # "Storage full" with options
│       └── PremiumFeatureList.tsx     # Benefits comparison table
│
├── services/
│   ├── payments/
│   │   ├── IAPService.ts              # Core IAP logic
│   │   ├── ReceiptValidator.ts        # Receipt validation
│   │   ├── SubscriptionCache.ts       # Local subscription cache
│   │   └── index.ts
│   │
│   └── storage/
│       ├── StorageLimitService.ts     # Enforce storage limits
│       ├── StorageMetrics.ts          # Track usage
│       └── index.ts
│
├── hooks/
│   ├── useSubscription.ts             # Subscription state hook
│   ├── useStorageLimit.ts             # Storage usage hook
│   └── usePremiumGate.ts              # Feature access hook
│
└── screens/
    └── PremiumUpgradeScreen.tsx       # Full-screen upgrade experience
```

---

## Platform-Specific Implementation

### iOS Implementation

#### 1. App Store Connect Configuration

```javascript
// Product Configuration
{
  productId: "com.braveheartinnovations.debateai.premium.monthly",
  type: "Auto-Renewable Subscription",
  referenceNam: "Symposium AI Premium Monthly",
  price: "$5.99",
  duration: "1 Month",
  familyShareable: true,
  subscriptionGroup: "Premium Access"
}
```

#### 2. Native iOS Setup

```swift
// ios/SymposiumAI/AppDelegate.swift
import StoreKit

func application(_ application: UIApplication,
                didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  // Initialize IAP
  SKPaymentQueue.default().add(TransactionObserver.shared)
  return true
}
```

#### 3. Info.plist Requirements

```xml
<key>SKAdNetworkItems</key>
<array>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>cstr6suwn9.skadnetwork</string>
  </dict>
</array>
```

### Android Implementation

#### 1. Google Play Console Configuration

```javascript
// Product Configuration
{
  productId: "premium_monthly",
  basePlanId: "monthly",
  type: "Subscription",
  billingPeriod: "P1M", // 1 month
  price: "$5.99",
  gracePeriod: 3, // days
  trialPeriod: null // no free trial
}
```

#### 2. Native Android Setup

```gradle
// android/app/build.gradle
dependencies {
    implementation 'com.android.billingclient:billing:7.0.0'
    implementation 'com.google.android.gms:play-services-auth:21.0.0'
}

// AndroidManifest.xml permissions
<uses-permission android:name="com.android.vending.BILLING" />
```

#### 3. ProGuard Rules

```proguard
# android/app/proguard-rules.pro
-keep class com.android.vending.billing.**
-keep class com.dooboolab.rniap.** { *; }
```

---

## Core Service Implementation

### IAPService.ts

```typescript
// src/services/payments/IAPService.ts
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  getAvailablePurchases,
  Purchase,
  Subscription,
  PurchaseError,
} from "react-native-iap";
import { Platform } from "react-native";
import { store } from "../../store";
import { updateSubscriptionStatus } from "../../store/subscriptionSlice";
import { validateReceipt } from "./ReceiptValidator";

const PRODUCT_IDS = Platform.select({
  ios: ["com.braveheartinnovations.debateai.premium.monthly"],
  android: ["premium_monthly"],
}) as string[];

class IAPService {
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;
  private products: Subscription[] = [];

  /**
   * Initialize IAP connection and listeners
   * Call this on app startup
   */
  async initialize(): Promise<void> {
    try {
      // Connect to store
      const result = await initConnection();
      if (!result) {
        throw new Error("Failed to connect to store");
      }

      // Set up listeners
      this.setupPurchaseListeners();

      // Load products
      await this.loadProducts();

      // Check for pending purchases
      await this.processPendingPurchases();

      console.log("IAP Service initialized successfully");
    } catch (error) {
      console.error("IAP initialization failed:", error);
      throw error;
    }
  }

  /**
   * Load available products from the store
   */
  private async loadProducts(): Promise<void> {
    try {
      this.products = await getSubscriptions({ skus: PRODUCT_IDS });

      if (this.products.length === 0) {
        console.warn("No products loaded from store");
      }
    } catch (error) {
      console.error("Failed to load products:", error);
      throw error;
    }
  }

  /**
   * Set up purchase event listeners
   */
  private setupPurchaseListeners(): void {
    // Listen for successful purchases
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        console.log("Purchase updated:", purchase.productId);

        try {
          // Validate receipt on server
          const isValid = await validateReceipt(purchase);

          if (isValid) {
            // Update local state
            store.dispatch(
              updateSubscriptionStatus({
                isPremium: true,
                expiresAt: purchase.transactionDate + 30 * 24 * 60 * 60 * 1000,
                productId: purchase.productId,
              })
            );

            // Acknowledge purchase
            await finishTransaction({
              purchase,
              isConsumable: false,
            });
          } else {
            throw new Error("Invalid receipt");
          }
        } catch (error) {
          console.error("Failed to process purchase:", error);
          // Don't finish transaction if validation fails
        }
      }
    );

    // Listen for purchase errors
    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: PurchaseError) => {
        if (error.code === "E_USER_CANCELLED") {
          console.log("User cancelled purchase");
        } else {
          console.error("Purchase error:", error);
        }
      }
    );
  }

  /**
   * Process any pending purchases from previous sessions
   */
  private async processPendingPurchases(): Promise<void> {
    if (Platform.OS === "android") {
      try {
        const purchases = await getAvailablePurchases();

        for (const purchase of purchases) {
          // Validate and finish pending transactions
          const isValid = await validateReceipt(purchase);

          if (isValid) {
            await finishTransaction({
              purchase,
              isConsumable: false,
            });
          }
        }
      } catch (error) {
        console.error("Failed to process pending purchases:", error);
      }
    }
  }

  /**
   * Purchase subscription
   */
  async purchaseSubscription(): Promise<boolean> {
    try {
      const productId = PRODUCT_IDS[0];

      if (Platform.OS === "ios") {
        await requestSubscription({
          sku: productId,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        });
      } else {
        // Android with offers
        await requestSubscription({
          sku: productId,
          subscriptionOffers: [
            {
              sku: productId,
              offerToken: "", // Will be populated by Play Store
            },
          ],
        });
      }

      return true;
    } catch (error: any) {
      if (error.code === "E_USER_CANCELLED") {
        return false;
      }
      throw error;
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<boolean> {
    try {
      const purchases = await getAvailablePurchases();

      if (purchases.length === 0) {
        return false;
      }

      // Find active subscription
      const activeSubscription = purchases.find((p) =>
        PRODUCT_IDS.includes(p.productId)
      );

      if (activeSubscription) {
        // Validate and update status
        const isValid = await validateReceipt(activeSubscription);

        if (isValid) {
          store.dispatch(
            updateSubscriptionStatus({
              isPremium: true,
              productId: activeSubscription.productId,
            })
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error("Failed to restore purchases:", error);
      throw error;
    }
  }

  /**
   * Get product details
   */
  getProduct(): Subscription | null {
    return this.products[0] || null;
  }

  /**
   * Clean up IAP connection
   */
  async cleanup(): Promise<void> {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }

    await endConnection();
  }
}

export const iapService = new IAPService();
export default iapService;
```

---

## Storage Limit Implementation

### StorageLimitService.ts

```typescript
// src/services/storage/StorageLimitService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { store } from "../../store";

interface StorageMetrics {
  chats: number;
  comparisons: number;
  debates: number;
}

interface StorageLimits {
  chats: number;
  comparisons: number;
  debates: number;
}

class StorageLimitService {
  private readonly STORAGE_KEY = "@storage_metrics";

  private readonly FREE_LIMITS: StorageLimits = {
    chats: 3,
    comparisons: 3,
    debates: 3,
  };

  private readonly PREMIUM_LIMITS: StorageLimits = {
    chats: -1, // Unlimited
    comparisons: -1,
    debates: -1,
  };

  /**
   * Get current storage metrics
   */
  async getMetrics(): Promise<StorageMetrics> {
    try {
      const metricsJson = await AsyncStorage.getItem(this.STORAGE_KEY);

      if (metricsJson) {
        return JSON.parse(metricsJson);
      }

      return { chats: 0, comparisons: 0, debates: 0 };
    } catch (error) {
      console.error("Failed to get storage metrics:", error);
      return { chats: 0, comparisons: 0, debates: 0 };
    }
  }

  /**
   * Check if user can create new item of type
   */
  async canCreate(type: "chats" | "comparisons" | "debates"): Promise<boolean> {
    const metrics = await this.getMetrics();
    const limits = this.getCurrentLimits();

    // Premium users have unlimited storage
    if (limits[type] === -1) {
      return true;
    }

    return metrics[type] < limits[type];
  }

  /**
   * Increment storage count for type
   */
  async increment(type: "chats" | "comparisons" | "debates"): Promise<void> {
    const metrics = await this.getMetrics();
    metrics[type]++;

    await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(metrics));
  }

  /**
   * Decrement storage count for type
   */
  async decrement(type: "chats" | "comparisons" | "debates"): Promise<void> {
    const metrics = await this.getMetrics();
    metrics[type] = Math.max(0, metrics[type] - 1);

    await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(metrics));
  }

  /**
   * Get current limits based on subscription
   */
  getCurrentLimits(): StorageLimits {
    const state = store.getState();
    const isPremium = state.subscription?.isPremium || false;

    return isPremium ? this.PREMIUM_LIMITS : this.FREE_LIMITS;
  }

  /**
   * Get usage percentage for UI display
   */
  async getUsagePercentage(
    type: "chats" | "comparisons" | "debates"
  ): Promise<number> {
    const metrics = await this.getMetrics();
    const limits = this.getCurrentLimits();

    if (limits[type] === -1) {
      return 0; // Unlimited
    }

    return (metrics[type] / limits[type]) * 100;
  }

  /**
   * Get formatted usage string (e.g., "2/3 Debates")
   */
  async getUsageString(
    type: "chats" | "comparisons" | "debates"
  ): Promise<string> {
    const metrics = await this.getMetrics();
    const limits = this.getCurrentLimits();

    if (limits[type] === -1) {
      return `${metrics[type]} ${this.getTypeLabel(type)}`;
    }

    return `${metrics[type]}/${limits[type]} ${this.getTypeLabel(type)}`;
  }

  private getTypeLabel(type: "chats" | "comparisons" | "debates"): string {
    const labels = {
      chats: "Chats",
      comparisons: "Comparisons",
      debates: "Debates",
    };
    return labels[type];
  }
}

export const storageLimitService = new StorageLimitService();
export default storageLimitService;
```

---

## UI Components

### Premium Gate Component (Molecule)

```typescript
// src/components/molecules/FeatureGate.tsx
import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Typography } from "./Typography";
import { Box } from "../atoms/Box";
import { useSubscription } from "../../hooks/useSubscription";
import { useTheme } from "../../theme";

interface FeatureGateProps {
  feature: "personalities" | "compare" | "customTopics";
  children: React.ReactNode;
  message?: string;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  message,
}) => {
  const { isPremium } = useSubscription();
  const navigation = useNavigation();
  const { theme } = useTheme();

  if (isPremium) {
    return <>{children}</>;
  }

  const defaultMessages = {
    personalities: "Unlock all AI personalities with Premium",
    compare: "Compare mode is a Premium feature",
    customTopics: "Create custom topics with Premium",
  };

  const displayMessage = message || defaultMessages[feature];

  const handleUpgrade = () => {
    navigation.navigate("PremiumUpgrade" as never);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleUpgrade}
      activeOpacity={0.8}
    >
      <View
        style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
      />

      <Box style={styles.lockContainer}>
        <Typography variant="h6" weight="semibold" color="primary">
          🔒
        </Typography>
        <Typography
          variant="body2"
          weight="semibold"
          style={{ marginTop: 8, textAlign: "center" }}
        >
          {displayMessage}
        </Typography>
        <Typography variant="caption" color="primary" style={{ marginTop: 4 }}>
          Tap to upgrade
        </Typography>
      </Box>

      <View style={styles.blurredContent}>{children}</View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.95,
    zIndex: 1,
  },
  lockContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    padding: 20,
  },
  blurredContent: {
    opacity: 0.2,
  },
});
```

### Storage Limit Modal (Organism)

```typescript
// src/components/organisms/StorageLimitModal.tsx
import React from "react";
import { View, Modal, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Typography } from "../molecules/Typography";
import { Button } from "../molecules/Button";
import { Card } from "../molecules/Card";
import { useTheme } from "../../theme";

interface StorageLimitModalProps {
  visible: boolean;
  onClose: () => void;
  type: "chats" | "comparisons" | "debates";
  onDelete: () => void;
}

export const StorageLimitModal: React.FC<StorageLimitModalProps> = ({
  visible,
  onClose,
  type,
  onDelete,
}) => {
  const navigation = useNavigation();
  const { theme } = useTheme();

  const typeLabels = {
    chats: "chat conversations",
    comparisons: "comparisons",
    debates: "debates",
  };

  const handleUpgrade = () => {
    onClose();
    navigation.navigate("PremiumUpgrade" as never);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Card style={styles.modal}>
          <Typography variant="h5" weight="bold" style={{ marginBottom: 16 }}>
            Storage Limit Reached
          </Typography>

          <Typography
            variant="body1"
            color="secondary"
            style={{ marginBottom: 24 }}
          >
            You've reached your limit of 3 {typeLabels[type]}. Free users can
            store up to 3 items in each category.
          </Typography>

          <View style={styles.options}>
            <Typography
              variant="h6"
              weight="semibold"
              style={{ marginBottom: 12 }}
            >
              Your Options:
            </Typography>

            <TouchableOpacity
              style={[
                styles.option,
                { backgroundColor: theme.colors.surface.secondary },
              ]}
              onPress={onDelete}
            >
              <Typography variant="body2" weight="medium">
                🗑️ Delete an existing {typeLabels[type].slice(0, -1)}
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.option,
                styles.premiumOption,
                { backgroundColor: theme.colors.primary[500] },
              ]}
              onPress={handleUpgrade}
            >
              <Typography
                variant="body2"
                weight="bold"
                style={{ color: "white" }}
              >
                ⭐ Upgrade to Premium for unlimited storage
              </Typography>
            </TouchableOpacity>
          </View>

          <Button variant="text" onPress={onClose} style={{ marginTop: 16 }}>
            Cancel
          </Button>
        </Card>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modal: {
    width: "100%",
    maxWidth: 400,
    padding: 24,
  },
  options: {
    marginTop: 8,
  },
  option: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  premiumOption: {
    marginTop: 8,
  },
});
```

---

## Receipt Validation

### Firebase Function

```typescript
// functions/src/validatePurchase.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
const APPLE_SHARED_SECRET = functions.config().apple.shared_secret;

export const validatePurchase = functions.https.onCall(
  async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const { receipt, platform, productId } = data;
    const userId = context.auth.uid;

    try {
      let isValid = false;
      let expiryDate: Date | null = null;

      if (platform === "ios") {
        // Validate with Apple
        const validation = await validateAppleReceipt(receipt);
        isValid = validation.isValid;
        expiryDate = validation.expiryDate;
      } else if (platform === "android") {
        // Validate with Google Play
        const validation = await validateGoogleReceipt(receipt, productId);
        isValid = validation.isValid;
        expiryDate = validation.expiryDate;
      }

      if (isValid && expiryDate) {
        // Update user subscription in Firestore
        await admin.firestore().collection("users").doc(userId).update({
          subscription: "premium",
          subscriptionExpiry: expiryDate,
          subscriptionPlatform: platform,
          subscriptionProductId: productId,
          lastValidated: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Log for analytics
        await admin.analytics().logEvent("subscription_validated", {
          user_id: userId,
          platform,
          product_id: productId,
        });

        return {
          valid: true,
          expiryDate,
        };
      }

      return {
        valid: false,
        error: "Invalid receipt",
      };
    } catch (error) {
      console.error("Receipt validation error:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Failed to validate receipt"
      );
    }
  }
);

async function validateAppleReceipt(receiptData: string) {
  try {
    // Try production first
    let response = await axios.post(APPLE_PRODUCTION_URL, {
      "receipt-data": receiptData,
      password: APPLE_SHARED_SECRET,
      "exclude-old-transactions": true,
    });

    // If sandbox receipt, retry with sandbox URL
    if (response.data.status === 21007) {
      response = await axios.post(APPLE_SANDBOX_URL, {
        "receipt-data": receiptData,
        password: APPLE_SHARED_SECRET,
        "exclude-old-transactions": true,
      });
    }

    if (response.data.status === 0) {
      const latestReceipt = response.data.latest_receipt_info?.[0];

      if (latestReceipt) {
        return {
          isValid: true,
          expiryDate: new Date(parseInt(latestReceipt.expires_date_ms)),
        };
      }
    }

    return { isValid: false, expiryDate: null };
  } catch (error) {
    console.error("Apple receipt validation error:", error);
    return { isValid: false, expiryDate: null };
  }
}

async function validateGoogleReceipt(purchaseToken: string, productId: string) {
  // Implementation for Google Play validation
  // Uses Google Play Developer API
  // Similar structure to Apple validation
  return { isValid: true, expiryDate: new Date() };
}
```

---

## Testing Strategy

### iOS Sandbox Testing

1. **Create Sandbox Testers**

   - App Store Connect → Users and Access → Sandbox Testers
   - Create test accounts with unique emails

2. **Testing Flow**

   ```bash
   # Device Setup
   1. Settings → App Store → Sign Out
   2. Don't sign in at Settings level
   3. Launch app and attempt purchase
   4. Sign in with sandbox account when prompted
   ```

3. **Test Scenarios**
   - Purchase flow completion
   - Cancel during purchase
   - Restore purchases
   - Subscription renewal (accelerated in sandbox)
   - Network interruption handling

### Android License Testing

1. **Setup Test Accounts**

   - Google Play Console → Setup → License testing
   - Add tester Gmail accounts

2. **Test Cards**

   ```
   Always Approves: 4111 1111 1111 1111
   Always Declines: 4000 0000 0000 0002
   Insufficient Funds: 4000 0000 0000 0019
   ```

3. **Internal Testing Track**
   - Upload signed APK/AAB
   - Add internal testers
   - Test via opt-in URL

### Storage Limit Testing

```typescript
// Test scenarios to verify
describe("Storage Limits", () => {
  it("should block creation at limit for free users", async () => {
    // Set user as free
    // Create 3 debates
    // Attempt to create 4th
    // Verify modal appears
  });

  it("should allow unlimited for premium users", async () => {
    // Set user as premium
    // Create > 3 items
    // Verify no blocking
  });

  it("should update counts on deletion", async () => {
    // Create 3 items
    // Delete 1
    // Verify can create new item
  });
});
```

---

## Compliance Requirements

### App Store Requirements

#### Required Elements

- ✅ Restore Purchases button (visible and functional)
- ✅ Privacy Policy URL in app and App Store Connect
- ✅ Terms of Service URL in app
- ✅ Clear pricing before purchase ($5.99/month)
- ✅ Auto-renewal disclosure text

#### Auto-Renewal Disclosure

```
Symposium AI Premium - $5.99/month

• Payment will be charged to your Apple ID account at confirmation of purchase
• Subscription automatically renews unless canceled at least 24 hours before the end of the current period
• Your account will be charged for renewal within 24 hours prior to the end of the current period
• You can manage and cancel subscriptions in your account settings on the App Store
• Any unused portion of a free trial period will be forfeited when purchasing a subscription

Privacy Policy: https://symposium-ai.com/privacy
Terms of Service: https://symposium-ai.com/terms
```

### Google Play Requirements

#### Required Elements

- ✅ Privacy Policy URL in Play Console and app
- ✅ In-app products configured correctly
- ✅ Clear pricing and billing period
- ✅ Cancellation instructions

#### Subscription Description

```
Symposium AI Premium unlocks:
• All AI personalities (12 per AI)
• Compare mode for side-by-side AI responses
• Custom debate topics
• Unlimited storage for all conversations
• Share and export features
• Priority support

Subscription automatically renews monthly unless canceled.
Cancel anytime in Google Play Store → Payments & subscriptions.
```

---

## Error Handling

### Common Scenarios

```typescript
// src/utils/iapErrors.ts
export const handleIAPError = (error: any): string => {
  const errorMessages: Record<string, string> = {
    E_USER_CANCELLED: "Purchase cancelled",
    E_ITEM_UNAVAILABLE: "Product not available",
    E_NETWORK_ERROR: "Network error. Please try again.",
    E_SERVICE_ERROR: "Store service error. Please try later.",
    E_RECEIPT_FAILED: "Purchase validation failed",
    E_ALREADY_OWNED: "You already own this subscription",
    E_DEFERRED: "Purchase requires approval",
    E_UNKNOWN: "An unexpected error occurred",
  };

  return errorMessages[error.code] || errorMessages["E_UNKNOWN"];
};
```

---

## Redux Integration

### Subscription Slice

```typescript
// src/store/subscriptionSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface SubscriptionState {
  isPremium: boolean;
  productId: string | null;
  expiresAt: number | null;
  platform: "ios" | "android" | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: SubscriptionState = {
  isPremium: false,
  productId: null,
  expiresAt: null,
  platform: null,
  isLoading: false,
  error: null,
};

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState,
  reducers: {
    setSubscriptionLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    updateSubscriptionStatus: (
      state,
      action: PayloadAction<Partial<SubscriptionState>>
    ) => {
      return { ...state, ...action.payload };
    },
    clearSubscription: (state) => {
      return initialState;
    },
    setSubscriptionError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setSubscriptionLoading,
  updateSubscriptionStatus,
  clearSubscription,
  setSubscriptionError,
} = subscriptionSlice.actions;

export default subscriptionSlice.reducer;
```

---

## Implementation Checklist

### Phase 1: Setup (Days 1-3)

- [ ] Install react-native-iap v13.0.0
- [ ] Configure iOS native setup
- [ ] Configure Android native setup
- [ ] Create IAPService.ts
- [ ] Create ReceiptValidator.ts
- [ ] Set up Redux subscription slice
- [ ] Initialize IAP on app startup

### Phase 2: Platform Config (Days 4-6)

- [ ] Create App Store Connect product ($5.99/month)
- [ ] Create Google Play Console product
- [ ] Configure sandbox testing (iOS)
- [ ] Configure license testing (Android)
- [ ] Set up Firebase Functions project
- [ ] Deploy receipt validation function

### Phase 3: Validation (Days 7-8)

- [ ] Implement Apple receipt validation
- [ ] Implement Google receipt validation
- [ ] Store subscription status in Firestore
- [ ] Handle subscription expiry
- [ ] Test validation endpoints

### Phase 4: UI (Days 9-10)

- [ ] Create PremiumUpgradeScreen
- [ ] Create FeatureGate component
- [ ] Create StorageLimitModal
- [ ] Create PremiumBadge molecule
- [ ] Update ProfileSheet with upgrade CTA
- [ ] Add restore purchases button

### Phase 5: Storage & Testing (Days 11-12)

- [ ] Implement StorageLimitService
- [ ] Add storage indicators to UI
- [ ] Test purchase flow (iOS sandbox)
- [ ] Test purchase flow (Android test)
- [ ] Test storage limits enforcement
- [ ] Test restore purchases
- [ ] Verify compliance requirements

---

## Monitoring & Analytics

### Key Metrics to Track

```typescript
// Analytics events to implement
analytics.logEvent("premium_screen_viewed");
analytics.logEvent("purchase_initiated", { product_id: "premium_monthly" });
analytics.logEvent("purchase_completed", { revenue: 5.99, currency: "USD" });
analytics.logEvent("purchase_cancelled");
analytics.logEvent("purchase_failed", { error_code: "E_NETWORK" });
analytics.logEvent("subscription_restored");
analytics.logEvent("storage_limit_reached", { type: "debates" });
analytics.logEvent("feature_blocked", { feature: "compare_mode" });
```

### Conversion Funnel

1. App Launch → Premium Screen View
2. Premium Screen → Purchase Initiated
3. Purchase Initiated → Purchase Completed
4. Track retention at 7, 14, 30 days

---

## Support Resources

### Documentation

- [react-native-iap Documentation](https://react-native-iap.dooboolab.com/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
- [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)

### Testing Tools

- [App Store Sandbox Testing](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_in_xcode)
- [Google Play Testing](https://developer.android.com/google/play/billing/test)

### Community

- [React Native IAP GitHub Issues](https://github.com/dooboolab/react-native-iap/issues)
- [React Native Community Discord](https://discord.gg/reactnative)

---

## Conclusion

This implementation plan provides a complete roadmap for adding in-app purchases to Symposium AI. The approach follows React Native community standards, maintains atomic design principles, and ensures compliance with both App Store and Google Play requirements.

The single-tier pricing model at $5.99/month simplifies the user experience while the clear distinction between free and premium features creates a compelling upgrade path. Storage limits on the free tier encourage upgrades without being overly restrictive.

---

_For questions or clarifications, contact: team@symposium-ai.com_
