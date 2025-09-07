# Premium Implementation Guide
## Symposium AI React Native App

*Last Updated: January 2025*  
*Version: 3.0*

---

## Executive Summary

This document provides a comprehensive implementation guide for the Demo/Trial/Premium subscription model in Symposium AI. The app uses a three-tier system with Firebase Authentication, react-native-iap for payments, and platform-native subscription management through App Store and Google Play.

**Subscription Model:**
- **Demo Mode**: Free, anonymous access to pre-recorded content only
- **Trial**: 7-day free trial with full access (payment method required)
- **Premium**: $7.99/month or $59.99/year (save $36)

**Key Principles:**
- BYOK (Bring Your Own Keys) for all live AI interactions
- Platform-native IAP for all payments (App Store/Google Play)
- Anonymous authentication for Demo Mode access
- Full feature access for Trial and Premium users
- No artificial gates on AI models or personalities

---

## 1. Subscription Tiers

### Demo Mode (Free)
- **Access Level**: Pre-recorded content only
- **Authentication**: Anonymous Firebase auth or signed in without subscription
- **Features**:
  - Browse pre-recorded debates
  - View sample chat conversations
  - Explore comparison examples
  - Navigate all app menus (read-only)
  - View feature descriptions
- **Restrictions**:
  - Cannot configure API keys
  - Cannot create custom topics
  - Cannot initiate live AI interactions
  - Cannot save or export content

### Trial (7 Days Free)
- **Access Level**: Full app access for 7 days
- **Authentication**: Required (Email/Apple/Google sign-in)
- **Payment**: Payment method required upfront via IAP
- **Features**:
  - All Premium features for 7 days
  - Configure unlimited API keys (BYOK)
  - Create custom debate topics
  - Use all AI models and personalities
  - Full chat, debate, and comparison features
  - Export and save capabilities
- **Auto-Renewal**: Converts to Premium after 7 days unless cancelled

### Premium (Paid)
- **Pricing**: 
  - Monthly: $7.99/month
  - Annual: $59.99/year (save $36/year)
- **Access Level**: Full app access
- **Features**: Same as Trial, continued indefinitely
- **Cancellation**: Can cancel anytime, access until period ends

---

## 2. Technology Stack

### Core Dependencies
```json
{
  "dependencies": {
    "@react-native-firebase/app": "^21.0.0",
    "@react-native-firebase/auth": "^21.0.0",
    "@react-native-firebase/firestore": "^21.0.0",
    "@react-native-firebase/functions": "^21.0.0",
    "@react-native-firebase/analytics": "^21.0.0",
    "react-native-iap": "^13.0.0",
    "@invertase/react-native-apple-authentication": "^3.0.0",
    "@react-native-google-signin/google-signin": "^13.0.0"
  }
}
```

---

## 3. Firebase User Schema

```typescript
// Firestore user document structure
interface UserDocument {
  // Basic info
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  
  // Authentication
  authProvider: 'email' | 'apple' | 'google' | 'anonymous';
  isAnonymous: boolean;
  createdAt: Timestamp;
  lastActive: Timestamp;
  
  // Subscription
  membershipStatus: 'demo' | 'trial' | 'premium';
  subscriptionId?: string; // Platform subscription ID
  productId?: string; // 'monthly' | 'annual'
  
  // Trial tracking
  trialStartDate?: Timestamp;
  trialEndDate?: Timestamp;
  hasUsedTrial: boolean;
  
  // Payment
  paymentPlatform?: 'ios' | 'android';
  lastReceiptData?: string; // Encrypted receipt
  subscriptionExpiryDate?: Timestamp;
  autoRenewing: boolean;
  
  // Preferences
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
  };
  
  // API Keys (encrypted)
  apiKeys?: {
    [provider: string]: string; // Encrypted with user-specific key
  };
}
```

---

## 4. Authentication Implementation

### 4.1 Anonymous Authentication for Demo Mode

```typescript
// src/services/firebase/auth.ts
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export class AuthService {
  static async signInAnonymously() {
    try {
      const userCredential = await auth().signInAnonymously();
      
      // Create minimal user document for anonymous users
      await firestore().collection('users').doc(userCredential.user.uid).set({
        uid: userCredential.user.uid,
        authProvider: 'anonymous',
        isAnonymous: true,
        membershipStatus: 'demo',
        hasUsedTrial: false,
        createdAt: firestore.FieldValue.serverTimestamp(),
        lastActive: firestore.FieldValue.serverTimestamp(),
        preferences: {
          theme: 'auto',
          notifications: false,
        },
      }, { merge: true });
      
      return { success: true, user: userCredential.user };
    } catch (error) {
      console.error('Anonymous sign-in failed:', error);
      return { success: false, error };
    }
  }
  
  static async convertAnonymousToFull(email: string, password: string) {
    try {
      const credential = auth.EmailAuthProvider.credential(email, password);
      const user = auth().currentUser;
      
      if (!user?.isAnonymous) {
        throw new Error('Current user is not anonymous');
      }
      
      // Link anonymous account with email/password
      await user.linkWithCredential(credential);
      
      // Update user document
      await firestore().collection('users').doc(user.uid).update({
        email,
        authProvider: 'email',
        isAnonymous: false,
      });
      
      return { success: true, user };
    } catch (error) {
      console.error('Account conversion failed:', error);
      return { success: false, error };
    }
  }
}
```

### 4.2 Subscription Status Management

```typescript
// src/services/subscription/SubscriptionManager.ts
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export class SubscriptionManager {
  static async checkSubscriptionStatus(): Promise<MembershipStatus> {
    const user = auth().currentUser;
    if (!user) return 'demo';
    
    const userDoc = await firestore()
      .collection('users')
      .doc(user.uid)
      .get();
    
    const data = userDoc.data();
    if (!data) return 'demo';
    
    // Check trial status
    if (data.membershipStatus === 'trial') {
      const now = Date.now();
      const trialEnd = data.trialEndDate?.toMillis();
      
      if (trialEnd && now > trialEnd) {
        // Trial expired, update to demo
        await firestore()
          .collection('users')
          .doc(user.uid)
          .update({ membershipStatus: 'demo' });
        return 'demo';
      }
      return 'trial';
    }
    
    // Check premium subscription
    if (data.membershipStatus === 'premium') {
      const now = Date.now();
      const expiryDate = data.subscriptionExpiryDate?.toMillis();
      
      if (expiryDate && now > expiryDate && !data.autoRenewing) {
        // Subscription expired
        await firestore()
          .collection('users')
          .doc(user.uid)
          .update({ membershipStatus: 'demo' });
        return 'demo';
      }
      return 'premium';
    }
    
    return data.membershipStatus || 'demo';
  }
  
  static async getTrialDaysRemaining(): Promise<number | null> {
    const user = auth().currentUser;
    if (!user) return null;
    
    const userDoc = await firestore()
      .collection('users')
      .doc(user.uid)
      .get();
    
    const data = userDoc.data();
    if (data?.membershipStatus !== 'trial') return null;
    
    const now = Date.now();
    const trialEnd = data.trialEndDate?.toMillis();
    
    if (!trialEnd) return null;
    
    const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  }
}
```

---

## 5. IAP Integration

### 5.1 Product Configuration

```typescript
// src/services/iap/products.ts
import { Platform } from 'react-native';

export const SUBSCRIPTION_PRODUCTS = {
  monthly: Platform.select({
    ios: 'com.braveheartinnovations.symposium.premium.monthly',
    android: 'premium_monthly',
  })!,
  annual: Platform.select({
    ios: 'com.braveheartinnovations.symposium.premium.annual',
    android: 'premium_annual',
  })!,
};

export const PRODUCT_DETAILS = {
  monthly: {
    id: SUBSCRIPTION_PRODUCTS.monthly,
    price: '$7.99',
    period: 'month',
    title: 'Symposium AI Premium',
    description: 'Full access to all AI features',
  },
  annual: {
    id: SUBSCRIPTION_PRODUCTS.annual,
    price: '$59.99',
    period: 'year',
    title: 'Symposium AI Premium (Annual)',
    description: 'Full access - Save $36/year',
    savings: '$36',
    percentSaved: '37%',
  },
};
```

### 5.2 Purchase Service

```typescript
// src/services/iap/PurchaseService.ts
import {
  initConnection,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getSubscriptions,
  requestSubscription,
  finishTransaction,
  getAvailablePurchases,
  type Purchase,
} from 'react-native-iap';
import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { SUBSCRIPTION_PRODUCTS } from './products';

export class PurchaseService {
  private static purchaseUpdateSubscription: any;
  private static purchaseErrorSubscription: any;
  
  static async initialize() {
    try {
      await initConnection();
      this.setupListeners();
      return { success: true };
    } catch (error) {
      console.error('IAP initialization failed:', error);
      return { success: false, error };
    }
  }
  
  private static setupListeners() {
    this.purchaseUpdateSubscription = purchaseUpdatedListener(
      async (purchase: Purchase) => {
        await this.handlePurchaseUpdate(purchase);
      }
    );
    
    this.purchaseErrorSubscription = purchaseErrorListener(
      (error: any) => {
        console.warn('Purchase error:', error);
      }
    );
  }
  
  static async purchaseSubscription(productType: 'monthly' | 'annual') {
    try {
      const user = auth().currentUser;
      if (!user) throw new Error('User must be authenticated');
      
      const sku = SUBSCRIPTION_PRODUCTS[productType];
      
      // Check if user has already used trial
      const userDoc = await firestore()
        .collection('users')
        .doc(user.uid)
        .get();
      
      const hasUsedTrial = userDoc.data()?.hasUsedTrial || false;
      
      if (Platform.OS === 'ios') {
        await requestSubscription({
          sku,
          andDangerouslyFinishTransactionAutomaticallyIOS: false,
        });
      } else {
        await requestSubscription({
          sku,
          subscriptionOffers: [{
            sku,
            offerToken: '', // Google Play will populate this
          }],
        });
      }
      
      // If this is their first subscription and they haven't used trial
      if (!hasUsedTrial) {
        await this.startTrial(productType);
      }
      
      return { success: true };
    } catch (error: any) {
      if (error.code === 'E_USER_CANCELLED') {
        return { success: false, cancelled: true };
      }
      return { success: false, error };
    }
  }
  
  private static async startTrial(productType: 'monthly' | 'annual') {
    const user = auth().currentUser;
    if (!user) return;
    
    const now = firestore.Timestamp.now();
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);
    
    await firestore().collection('users').doc(user.uid).update({
      membershipStatus: 'trial',
      trialStartDate: now,
      trialEndDate: firestore.Timestamp.fromDate(trialEndDate),
      hasUsedTrial: true,
      productId: productType,
      paymentPlatform: Platform.OS,
    });
  }
  
  private static async handlePurchaseUpdate(purchase: Purchase) {
    const receipt = purchase.transactionReceipt;
    
    if (receipt) {
      try {
        // Validate receipt with Firebase Function
        await this.validateAndSavePurchase(purchase);
        
        // Acknowledge the purchase
        await finishTransaction({ purchase, isConsumable: false });
      } catch (error) {
        console.error('Failed to process purchase:', error);
      }
    }
  }
  
  private static async validateAndSavePurchase(purchase: Purchase) {
    const user = auth().currentUser;
    if (!user) throw new Error('User not authenticated');
    
    // Call Firebase Function to validate receipt
    const functions = (await import('@react-native-firebase/functions')).default();
    const validatePurchase = functions.httpsCallable('validatePurchase');
    
    const result = await validatePurchase({
      receipt: purchase.transactionReceipt,
      platform: Platform.OS,
      productId: purchase.productId,
    });
    
    if (result.data.valid) {
      // Update user subscription status
      await firestore().collection('users').doc(user.uid).update({
        membershipStatus: 'premium',
        subscriptionId: purchase.transactionId,
        subscriptionExpiryDate: result.data.expiryDate,
        autoRenewing: result.data.autoRenewing,
        lastReceiptData: purchase.transactionReceipt,
      });
    }
  }
  
  static async restorePurchases() {
    try {
      const purchases = await getAvailablePurchases();
      
      if (purchases.length > 0) {
        // Find active subscription
        const activeSubscription = purchases.find(p => 
          Object.values(SUBSCRIPTION_PRODUCTS).includes(p.productId)
        );
        
        if (activeSubscription) {
          await this.validateAndSavePurchase(activeSubscription);
          return { success: true, restored: true };
        }
      }
      
      return { success: true, restored: false };
    } catch (error) {
      console.error('Restore failed:', error);
      return { success: false, error };
    }
  }
  
  static cleanup() {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
    }
  }
}
```

---

## 6. Access Control

### 6.1 Feature Gating

```typescript
// src/hooks/useFeatureAccess.ts
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import { SubscriptionManager } from '../services/subscription/SubscriptionManager';

export const useFeatureAccess = () => {
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('demo');
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    checkAccess();
  }, []);
  
  const checkAccess = async () => {
    setLoading(true);
    try {
      const status = await SubscriptionManager.checkSubscriptionStatus();
      setMembershipStatus(status);
      
      if (status === 'trial') {
        const days = await SubscriptionManager.getTrialDaysRemaining();
        setTrialDaysRemaining(days);
      }
    } finally {
      setLoading(false);
    }
  };
  
  const canAccessLiveAI = membershipStatus === 'trial' || membershipStatus === 'premium';
  const canConfigureAPIKeys = canAccessLiveAI;
  const canCreateCustomTopics = canAccessLiveAI;
  const canExportContent = canAccessLiveAI;
  const isInTrial = membershipStatus === 'trial';
  const isPremium = membershipStatus === 'premium';
  const isDemo = membershipStatus === 'demo';
  
  return {
    membershipStatus,
    trialDaysRemaining,
    loading,
    canAccessLiveAI,
    canConfigureAPIKeys,
    canCreateCustomTopics,
    canExportContent,
    isInTrial,
    isPremium,
    isDemo,
    refresh: checkAccess,
  };
};
```

### 6.2 Demo Mode Restrictions

```typescript
// src/components/gates/FeatureGate.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Typography } from '../molecules';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { useTheme } from '../../theme';

interface FeatureGateProps {
  children: React.ReactNode;
  feature: 'api_keys' | 'custom_topics' | 'live_ai' | 'export';
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({ 
  children, 
  feature,
  fallback,
  showUpgradePrompt = true,
}) => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { 
    canAccessLiveAI,
    canConfigureAPIKeys,
    canCreateCustomTopics,
    canExportContent,
    isDemo,
  } = useFeatureAccess();
  
  const hasAccess = {
    'api_keys': canConfigureAPIKeys,
    'custom_topics': canCreateCustomTopics,
    'live_ai': canAccessLiveAI,
    'export': canExportContent,
  }[feature];
  
  if (hasAccess) {
    return <>{children}</>;
  }
  
  if (fallback) {
    return <>{fallback}</>;
  }
  
  if (!showUpgradePrompt) {
    return null;
  }
  
  const handleUpgrade = () => {
    navigation.navigate('AccountSettings' as never);
  };
  
  return (
    <TouchableOpacity 
      style={styles.container} 
      onPress={handleUpgrade}
      activeOpacity={0.8}
    >
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <MaterialCommunityIcons 
          name="lock-outline" 
          size={32} 
          color={theme.colors.primary[500]} 
        />
        <Typography variant="body" weight="semibold" style={styles.title}>
          Premium Feature
        </Typography>
        <Typography variant="caption" color="secondary" style={styles.description}>
          Start your 7-day free trial to access this feature
        </Typography>
        <View style={[styles.button, { backgroundColor: theme.colors.primary[500] }]}>
          <Typography variant="caption" style={{ color: 'white' }}>
            Start Free Trial
          </Typography>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  card: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    marginTop: 16,
    marginBottom: 8,
  },
  description: {
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
});
```

---

## 7. UI Components

### 7.1 Trial Banner

```typescript
// src/components/subscription/TrialBanner.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Typography } from '../molecules';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { useTheme } from '../../theme';

export const TrialBanner: React.FC = () => {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { isInTrial, trialDaysRemaining } = useFeatureAccess();
  
  if (!isInTrial || trialDaysRemaining === null) {
    return null;
  }
  
  const handleManage = () => {
    navigation.navigate('AccountSettings' as never);
  };
  
  const bannerColor = trialDaysRemaining <= 2 
    ? theme.colors.warning[500] 
    : theme.colors.info[500];
  
  return (
    <TouchableOpacity 
      style={[styles.banner, { backgroundColor: bannerColor }]}
      onPress={handleManage}
      activeOpacity={0.9}
    >
      <Typography variant="caption" style={styles.text}>
        {trialDaysRemaining === 1 
          ? 'Trial ends tomorrow' 
          : `${trialDaysRemaining} days left in trial`}
      </Typography>
      <Typography variant="caption" weight="semibold" style={styles.text}>
        Manage →
      </Typography>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: 'white',
  },
});
```

### 7.2 Subscription Card

```typescript
// src/components/subscription/SubscriptionCard.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Typography } from '../molecules';
import { useTheme } from '../../theme';
import { PRODUCT_DETAILS } from '../../services/iap/products';

interface SubscriptionCardProps {
  type: 'monthly' | 'annual';
  isSelected: boolean;
  onSelect: () => void;
}

export const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  type,
  isSelected,
  onSelect,
}) => {
  const { theme } = useTheme();
  const product = PRODUCT_DETAILS[type];
  
  return (
    <TouchableOpacity
      style={[
        styles.card,
        { 
          backgroundColor: theme.colors.surface,
          borderColor: isSelected ? theme.colors.primary[500] : theme.colors.border,
          borderWidth: isSelected ? 2 : 1,
        }
      ]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      {type === 'annual' && (
        <View style={[styles.badge, { backgroundColor: theme.colors.success[500] }]}>
          <Typography variant="caption" style={{ color: 'white', fontSize: 10 }}>
            SAVE {product.percentSaved}
          </Typography>
        </View>
      )}
      
      <View style={styles.header}>
        <Typography variant="h3" weight="bold">
          {product.price}
        </Typography>
        <Typography variant="caption" color="secondary">
          /{product.period}
        </Typography>
      </View>
      
      <Typography variant="body" style={styles.title}>
        {product.title}
      </Typography>
      
      {type === 'annual' && (
        <Typography variant="caption" color="success" style={styles.savings}>
          Save {product.savings} per year
        </Typography>
      )}
      
      <View style={styles.features}>
        <FeatureItem text="7-day free trial" />
        <FeatureItem text="Full AI access" />
        <FeatureItem text="Unlimited API keys" />
        <FeatureItem text="Custom topics" />
        <FeatureItem text="Export capabilities" />
      </View>
      
      {isSelected && (
        <View style={[styles.checkmark, { backgroundColor: theme.colors.primary[500] }]}>
          <MaterialCommunityIcons name="check" size={16} color="white" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const FeatureItem: React.FC<{ text: string }> = ({ text }) => {
  const { theme } = useTheme();
  return (
    <View style={styles.featureItem}>
      <MaterialCommunityIcons 
        name="check-circle" 
        size={16} 
        color={theme.colors.success[500]} 
      />
      <Typography variant="caption" style={{ marginLeft: 8 }}>
        {text}
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  title: {
    marginBottom: 4,
  },
  savings: {
    marginBottom: 16,
  },
  features: {
    marginTop: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkmark: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

---

## 8. Firebase Functions

### 8.1 Receipt Validation

```typescript
// functions/src/validatePurchase.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { verifyPurchase } from './utils/receiptValidation';

export const validatePurchase = functions.https.onCall(async (data, context) => {
  // Verify user authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const { receipt, platform, productId } = data;
  const userId = context.auth.uid;
  
  try {
    // Validate receipt with appropriate service
    const validationResult = await verifyPurchase({
      receipt,
      platform,
      productId,
    });
    
    if (!validationResult.valid) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid receipt');
    }
    
    // Determine if this is monthly or annual
    const isAnnual = productId.includes('annual');
    
    // Calculate expiry date
    const now = admin.firestore.Timestamp.now();
    const expiryDate = new Date();
    if (isAnnual) {
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 1);
    }
    
    // Update user subscription in Firestore
    await admin.firestore().collection('users').doc(userId).update({
      membershipStatus: 'premium',
      subscriptionExpiryDate: admin.firestore.Timestamp.fromDate(expiryDate),
      productId: isAnnual ? 'annual' : 'monthly',
      autoRenewing: validationResult.autoRenewing,
      lastValidated: now,
    });
    
    // Log for analytics
    await admin.analytics().logEvent('subscription_activated', {
      userId,
      platform,
      productId,
      type: isAnnual ? 'annual' : 'monthly',
    });
    
    return { 
      valid: true,
      expiryDate: expiryDate.toISOString(),
      autoRenewing: validationResult.autoRenewing,
    };
    
  } catch (error) {
    console.error('Validation error:', error);
    throw new functions.https.HttpsError('internal', 'Validation failed');
  }
});
```

### 8.2 Trial Conversion Handler

```typescript
// functions/src/handleTrialConversion.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const handleTrialConversion = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    
    // Find users whose trials have expired
    const expiredTrials = await admin.firestore()
      .collection('users')
      .where('membershipStatus', '==', 'trial')
      .where('trialEndDate', '<=', now)
      .get();
    
    const batch = admin.firestore().batch();
    
    expiredTrials.forEach((doc) => {
      const userData = doc.data();
      
      // If they have a valid subscription, convert to premium
      if (userData.subscriptionId && userData.autoRenewing) {
        batch.update(doc.ref, {
          membershipStatus: 'premium',
        });
      } else {
        // Otherwise, convert to demo
        batch.update(doc.ref, {
          membershipStatus: 'demo',
        });
      }
    });
    
    await batch.commit();
    
    console.log(`Processed ${expiredTrials.size} trial conversions`);
  });
```

---

## 9. Security Considerations

### 9.1 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anonymous users to read their own document
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && 
        request.auth.uid == userId &&
        // Prevent users from directly modifying subscription fields
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['membershipStatus', 'subscriptionId', 'trialEndDate', 'subscriptionExpiryDate']);
    }
    
    // Subscription updates only from Cloud Functions
    match /subscriptions/{subId} {
      allow read: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow write: if false; // Only Cloud Functions can write
    }
  }
}
```

### 9.2 API Key Encryption

```typescript
// src/services/security/encryption.ts
import CryptoJS from 'crypto-js';
import auth from '@react-native-firebase/auth';

export class EncryptionService {
  private static getUserKey(): string {
    const user = auth().currentUser;
    if (!user) throw new Error('User not authenticated');
    
    // Use user UID as part of encryption key
    return `${user.uid}-${process.env.ENCRYPTION_SALT}`;
  }
  
  static encryptAPIKey(apiKey: string): string {
    const key = this.getUserKey();
    return CryptoJS.AES.encrypt(apiKey, key).toString();
  }
  
  static decryptAPIKey(encryptedKey: string): string {
    const key = this.getUserKey();
    const bytes = CryptoJS.AES.decrypt(encryptedKey, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}
```

---

## 10. Testing Strategy

### 10.1 Test Scenarios

#### Demo Mode Testing
- [ ] Anonymous user can access demo content
- [ ] Anonymous user cannot configure API keys
- [ ] Anonymous user sees upgrade prompts
- [ ] Demo content is clearly labeled

#### Trial Testing
- [ ] New user can start 7-day trial
- [ ] Trial countdown displays correctly
- [ ] Trial converts to premium after purchase
- [ ] Trial expires to demo after 7 days
- [ ] User cannot start multiple trials

#### Premium Testing
- [ ] Monthly subscription works
- [ ] Annual subscription works
- [ ] Subscription renews automatically
- [ ] User can cancel subscription
- [ ] Restore purchases works

#### Platform Testing
- [ ] iOS sandbox testing works
- [ ] Android test purchases work
- [ ] Receipt validation succeeds
- [ ] Cross-platform restore works

### 10.2 Sandbox Configuration

```bash
# iOS Sandbox Testing
1. Create sandbox tester in App Store Connect
2. Sign out of production Apple ID on device
3. Sign in with sandbox account when prompted during purchase

# Android Testing
1. Add tester email to Google Play Console
2. Join internal testing track
3. Use test card for purchases
```

---

## 11. Analytics & Monitoring

### 11.1 Key Metrics

```typescript
// Track with Firebase Analytics
analytics().logEvent('trial_started', {
  product_type: 'monthly' | 'annual',
});

analytics().logEvent('trial_converted', {
  days_used: 5,
  product_type: 'monthly',
});

analytics().logEvent('subscription_cancelled', {
  reason: 'user_action',
  days_subscribed: 45,
});

analytics().logEvent('demo_to_trial_conversion', {
  trigger_feature: 'api_keys',
});
```

### 11.2 Conversion Funnel

1. **Demo → Trial**: Track which features trigger upgrades
2. **Trial → Premium**: Monitor trial conversion rate
3. **Monthly → Annual**: Track upgrade to annual plans
4. **Churn**: Monitor cancellation reasons and timing

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Set up Firebase anonymous auth
- [ ] Update user document schema
- [ ] Implement membership status tracking
- [ ] Create demo mode restrictions

### Phase 2: IAP Setup
- [ ] Configure products in App Store Connect
- [ ] Configure products in Google Play Console
- [ ] Implement react-native-iap
- [ ] Set up receipt validation

### Phase 3: Trial System
- [ ] Implement 7-day trial logic
- [ ] Create trial countdown UI
- [ ] Handle trial expiration
- [ ] Prevent multiple trials

### Phase 4: UI Components
- [ ] Build Account Settings screen
- [ ] Create subscription cards
- [ ] Implement trial banner
- [ ] Add feature gates

### Phase 5: Testing
- [ ] Test all three tiers
- [ ] Verify platform payments
- [ ] Test edge cases
- [ ] Monitor analytics

### Phase 6: Launch
- [ ] Submit to App Store
- [ ] Submit to Google Play
- [ ] Monitor first purchases
- [ ] Track conversion metrics

---

## Conclusion

This implementation provides a robust three-tier subscription system with Demo Mode for free users, a 7-day trial for new subscribers, and premium tiers at $7.99/month or $59.99/year. The system leverages platform-native IAP for payments, Firebase for authentication and data storage, and provides a seamless upgrade path from demo to premium.

**Key Benefits:**
- Low friction demo access with anonymous auth
- Trial with payment method captures high-intent users
- Platform-native payments ensure compliance
- BYOK model reduces operational costs
- Full feature access for paying users

---

*For implementation support: team@braveheart-innovations.com*