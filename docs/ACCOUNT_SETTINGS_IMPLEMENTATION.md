# Account Settings Implementation Guide
## Symposium AI - Profile & Subscription Management

*Last Updated: January 2025*  
*Version: 1.0*

---

## Executive Summary

This document provides implementation details for the Account Settings screen, accessible from the Profile screen. The Account Settings feature manages subscription status, trial information, payment methods, and subscription transitions between Demo, Trial, and Premium tiers.

**Key Features:**
- Subscription status display
- Trial countdown
- Payment management
- Plan switching
- Purchase restoration
- Platform-specific subscription links

---

## 1. Navigation Structure

### 1.1 Screen Hierarchy
```
HomeScreen
    ↓
ProfileScreen
    ├── Profile Info (existing)
    ├── Theme Settings (existing)
    ├── Account Settings (NEW) ←── Subscription Management
    ├── API Keys (existing)
    └── Sign Out (existing)
```

### 1.2 Navigation Implementation
```typescript
// src/screens/ProfileScreen.tsx
import { useNavigation } from '@react-navigation/native';

const ProfileScreen = () => {
  const navigation = useNavigation();
  
  const handleAccountSettings = () => {
    navigation.navigate('AccountSettings');
  };
  
  return (
    <ScrollView>
      {/* Existing profile content */}
      
      <TouchableOpacity onPress={handleAccountSettings}>
        <SettingsRow
          icon="credit-card"
          title="Account Settings"
          subtitle={getSubscriptionStatusText()}
          showChevron
        />
      </TouchableOpacity>
      
      {/* Other settings */}
    </ScrollView>
  );
};
```

---

## 2. Account Settings Screen Design

### 2.1 Screen Layout
```
┌────────────────────────────────┐
│       Account Settings         │
│                                │
│  ┌──────────────────────────┐ │
│  │   Subscription Status     │ │
│  │   [Premium/Trial/Demo]    │ │
│  │   Trial: 5 days left      │ │
│  └──────────────────────────┘ │
│                                │
│  ┌──────────────────────────┐ │
│  │   Current Plan            │ │
│  │   Monthly - $7.99/mo      │ │
│  │   Next billing: Jan 15    │ │
│  └──────────────────────────┘ │
│                                │
│  [  Start Free Trial  ]        │
│  [  Manage Subscription  ]     │
│  [  Restore Purchases  ]       │
│                                │
│  ┌──────────────────────────┐ │
│  │   Available Plans         │ │
│  │   ○ Monthly $7.99         │ │
│  │   ○ Annual $59.99 (-37%)  │ │
│  └──────────────────────────┘ │
│                                │
└────────────────────────────────┘
```

### 2.2 Component Structure
```typescript
// src/screens/AccountSettingsScreen.tsx
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Alert } from 'react-native';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { PurchaseService } from '../services/iap/PurchaseService';
import { SubscriptionManager } from '../services/subscription/SubscriptionManager';
import { 
  SubscriptionStatusCard,
  CurrentPlanCard,
  PlanSelector,
  ActionButtons 
} from '../components/subscription';

export const AccountSettingsScreen: React.FC = () => {
  const { 
    membershipStatus, 
    trialDaysRemaining,
    isPremium,
    isInTrial,
    isDemo,
    refresh 
  } = useFeatureAccess();
  
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  
  return (
    <ScrollView style={styles.container}>
      <SubscriptionStatusCard
        status={membershipStatus}
        trialDaysRemaining={trialDaysRemaining}
      />
      
      {(isPremium || isInTrial) && (
        <CurrentPlanCard
          planType={selectedPlan}
          nextBillingDate={getNextBillingDate()}
          autoRenewing={true}
        />
      )}
      
      <ActionButtons
        isDemo={isDemo}
        isInTrial={isInTrial}
        isPremium={isPremium}
        onStartTrial={handleStartTrial}
        onManageSubscription={handleManageSubscription}
        onRestorePurchases={handleRestorePurchases}
        loading={loading}
      />
      
      {isDemo && (
        <PlanSelector
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          onPurchase={handlePurchase}
        />
      )}
    </ScrollView>
  );
};
```

---

## 3. Component Specifications

### 3.1 Subscription Status Card
```typescript
// src/components/subscription/SubscriptionStatusCard.tsx
interface SubscriptionStatusCardProps {
  status: 'demo' | 'trial' | 'premium';
  trialDaysRemaining?: number | null;
}

export const SubscriptionStatusCard: React.FC<SubscriptionStatusCardProps> = ({
  status,
  trialDaysRemaining
}) => {
  const { theme } = useTheme();
  
  const getStatusColor = () => {
    switch(status) {
      case 'premium': return theme.colors.success[500];
      case 'trial': return theme.colors.info[500];
      case 'demo': return theme.colors.neutral[500];
    }
  };
  
  const getStatusText = () => {
    switch(status) {
      case 'premium': return 'Premium Member';
      case 'trial': return `Trial - ${trialDaysRemaining} days left`;
      case 'demo': return 'Demo Mode';
    }
  };
  
  const getStatusDescription = () => {
    switch(status) {
      case 'premium': 
        return 'You have full access to all features';
      case 'trial': 
        return `Your trial ends in ${trialDaysRemaining} days. You won't be charged until the trial ends.`;
      case 'demo': 
        return 'Explore demo content. Start your free trial for full access.';
    }
  };
  
  return (
    <Card style={[styles.card, { borderColor: getStatusColor() }]}>
      <View style={styles.statusHeader}>
        <MaterialCommunityIcons 
          name={getStatusIcon(status)} 
          size={24} 
          color={getStatusColor()} 
        />
        <Typography variant="h3" weight="semibold">
          {getStatusText()}
        </Typography>
      </View>
      <Typography variant="body" color="secondary">
        {getStatusDescription()}
      </Typography>
      
      {status === 'trial' && trialDaysRemaining && trialDaysRemaining <= 3 && (
        <View style={[styles.warning, { backgroundColor: theme.colors.warning[100] }]}>
          <Typography variant="caption" color="warning">
            ⚠️ Trial ending soon - Subscribe to keep full access
          </Typography>
        </View>
      )}
    </Card>
  );
};
```

### 3.2 Current Plan Card
```typescript
// src/components/subscription/CurrentPlanCard.tsx
interface CurrentPlanCardProps {
  planType: 'monthly' | 'annual';
  nextBillingDate: Date;
  autoRenewing: boolean;
}

export const CurrentPlanCard: React.FC<CurrentPlanCardProps> = ({
  planType,
  nextBillingDate,
  autoRenewing
}) => {
  const { theme } = useTheme();
  
  const planDetails = {
    monthly: { price: '$7.99', period: 'month' },
    annual: { price: '$59.99', period: 'year', savings: 'Save $36/year' }
  };
  
  const plan = planDetails[planType];
  
  return (
    <Card style={styles.card}>
      <Typography variant="subtitle" weight="semibold">
        Current Plan
      </Typography>
      
      <View style={styles.planRow}>
        <Typography variant="h2" weight="bold">
          {plan.price}
        </Typography>
        <Typography variant="body" color="secondary">
          /{plan.period}
        </Typography>
      </View>
      
      {plan.savings && (
        <Badge text={plan.savings} type="success" />
      )}
      
      <View style={styles.billingInfo}>
        <Typography variant="caption" color="secondary">
          {autoRenewing 
            ? `Next billing: ${formatDate(nextBillingDate)}`
            : `Expires: ${formatDate(nextBillingDate)}`
          }
        </Typography>
        
        {!autoRenewing && (
          <Typography variant="caption" color="warning">
            Auto-renewal is off
          </Typography>
        )}
      </View>
    </Card>
  );
};
```

### 3.3 Action Buttons
```typescript
// src/components/subscription/ActionButtons.tsx
interface ActionButtonsProps {
  isDemo: boolean;
  isInTrial: boolean;
  isPremium: boolean;
  onStartTrial: () => void;
  onManageSubscription: () => void;
  onRestorePurchases: () => void;
  loading: boolean;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({
  isDemo,
  isInTrial,
  isPremium,
  onStartTrial,
  onManageSubscription,
  onRestorePurchases,
  loading
}) => {
  return (
    <View style={styles.buttonContainer}>
      {isDemo && (
        <Button
          title="Start 7-Day Free Trial"
          onPress={onStartTrial}
          variant="primary"
          size="large"
          loading={loading}
          icon="rocket-launch"
        />
      )}
      
      {(isInTrial || isPremium) && (
        <Button
          title="Manage Subscription"
          onPress={onManageSubscription}
          variant="secondary"
          size="large"
          icon="credit-card"
        />
      )}
      
      <Button
        title="Restore Purchases"
        onPress={onRestorePurchases}
        variant="ghost"
        size="medium"
        loading={loading}
        icon="refresh"
      />
      
      {isInTrial && (
        <Button
          title="Cancel Trial"
          onPress={onManageSubscription}
          variant="ghost"
          size="small"
          textColor="warning"
        />
      )}
    </View>
  );
};
```

### 3.4 Plan Selector
```typescript
// src/components/subscription/PlanSelector.tsx
interface PlanSelectorProps {
  selectedPlan: 'monthly' | 'annual';
  onSelectPlan: (plan: 'monthly' | 'annual') => void;
  onPurchase: () => void;
}

export const PlanSelector: React.FC<PlanSelectorProps> = ({
  selectedPlan,
  onSelectPlan,
  onPurchase
}) => {
  return (
    <View style={styles.plansContainer}>
      <Typography variant="subtitle" weight="semibold" style={styles.plansTitle}>
        Choose Your Plan
      </Typography>
      
      <SubscriptionCard
        type="monthly"
        isSelected={selectedPlan === 'monthly'}
        onSelect={() => onSelectPlan('monthly')}
      />
      
      <SubscriptionCard
        type="annual"
        isSelected={selectedPlan === 'annual'}
        onSelect={() => onSelectPlan('annual')}
      />
      
      <Button
        title="Subscribe Now"
        onPress={onPurchase}
        variant="primary"
        size="large"
        style={styles.purchaseButton}
      />
      
      <Typography variant="caption" color="secondary" style={styles.disclaimer}>
        • 7-day free trial for new subscribers
        • Cancel anytime in your device settings
        • Payment processed by {Platform.OS === 'ios' ? 'Apple' : 'Google'}
      </Typography>
    </View>
  );
};
```

---

## 4. Business Logic Implementation

### 4.1 Purchase Flow
```typescript
// src/screens/AccountSettingsScreen.tsx - Purchase Handler
const handlePurchase = async () => {
  // Check if user is authenticated
  const user = auth().currentUser;
  
  if (!user || user.isAnonymous) {
    Alert.alert(
      'Sign In Required',
      'Please sign in to start your free trial',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Auth') }
      ]
    );
    return;
  }
  
  setLoading(true);
  
  try {
    // Start purchase flow
    const result = await PurchaseService.purchaseSubscription(selectedPlan);
    
    if (result.success) {
      // Purchase successful
      Alert.alert(
        'Welcome to Premium!',
        'Your 7-day free trial has started. You now have full access to all features.',
        [{ text: 'OK', onPress: () => refresh() }]
      );
      
      // Track analytics
      analytics().logEvent('trial_started', {
        plan_type: selectedPlan,
        source: 'account_settings'
      });
    } else if (result.cancelled) {
      // User cancelled
      console.log('Purchase cancelled by user');
    } else {
      // Error occurred
      Alert.alert(
        'Purchase Failed',
        'Unable to complete purchase. Please try again.',
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    console.error('Purchase error:', error);
    Alert.alert(
      'Error',
      'An unexpected error occurred. Please try again.',
      [{ text: 'OK' }]
    );
  } finally {
    setLoading(false);
  }
};
```

### 4.2 Subscription Management
```typescript
// src/screens/AccountSettingsScreen.tsx - Manage Subscription
const handleManageSubscription = () => {
  // Open platform-specific subscription management
  if (Platform.OS === 'ios') {
    // iOS: Open App Store subscription management
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    // Android: Open Google Play subscription management  
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
  
  // Track analytics
  analytics().logEvent('manage_subscription_tapped', {
    platform: Platform.OS,
    membership_status: membershipStatus
  });
};
```

### 4.3 Restore Purchases
```typescript
// src/screens/AccountSettingsScreen.tsx - Restore Handler
const handleRestorePurchases = async () => {
  setLoading(true);
  
  try {
    const result = await PurchaseService.restorePurchases();
    
    if (result.success && result.restored) {
      // Purchases restored successfully
      Alert.alert(
        'Purchases Restored',
        'Your subscription has been restored successfully.',
        [{ text: 'OK', onPress: () => refresh() }]
      );
      
      analytics().logEvent('purchases_restored', {
        source: 'account_settings'
      });
    } else {
      // No purchases to restore
      Alert.alert(
        'No Purchases Found',
        'No active subscriptions found for this account.',
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    console.error('Restore error:', error);
    Alert.alert(
      'Restore Failed',
      'Unable to restore purchases. Please try again.',
      [{ text: 'OK' }]
    );
  } finally {
    setLoading(false);
  }
};
```

### 4.4 Trial Start Flow
```typescript
// src/screens/AccountSettingsScreen.tsx - Start Trial
const handleStartTrial = async () => {
  // Check authentication
  const user = auth().currentUser;
  
  if (!user || user.isAnonymous) {
    // Need to sign up first
    Alert.alert(
      'Create Account',
      'Sign up to start your 7-day free trial with full access to all features.',
      [
        { text: 'Not Now', style: 'cancel' },
        { 
          text: 'Sign Up', 
          onPress: () => navigation.navigate('Auth', { 
            mode: 'signup',
            returnTo: 'AccountSettings' 
          })
        }
      ]
    );
    return;
  }
  
  // Check if user has already used trial
  const userDoc = await firestore()
    .collection('users')
    .doc(user.uid)
    .get();
  
  const hasUsedTrial = userDoc.data()?.hasUsedTrial;
  
  if (hasUsedTrial) {
    Alert.alert(
      'Trial Already Used',
      'You\'ve already used your free trial. Subscribe to get full access.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View Plans', onPress: () => setSelectedPlan('monthly') }
      ]
    );
    return;
  }
  
  // Proceed with purchase (includes trial)
  await handlePurchase();
};
```

---

## 5. State Management

### 5.1 Redux Integration
```typescript
// src/store/subscriptionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SubscriptionState {
  membershipStatus: 'demo' | 'trial' | 'premium';
  trialDaysRemaining: number | null;
  subscriptionId: string | null;
  productId: 'monthly' | 'annual' | null;
  nextBillingDate: string | null;
  autoRenewing: boolean;
}

const initialState: SubscriptionState = {
  membershipStatus: 'demo',
  trialDaysRemaining: null,
  subscriptionId: null,
  productId: null,
  nextBillingDate: null,
  autoRenewing: false,
};

const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    setSubscriptionStatus: (state, action: PayloadAction<Partial<SubscriptionState>>) => {
      return { ...state, ...action.payload };
    },
    resetSubscription: () => initialState,
  },
});

export const { setSubscriptionStatus, resetSubscription } = subscriptionSlice.actions;
export default subscriptionSlice.reducer;
```

### 5.2 Hook Implementation
```typescript
// src/hooks/useAccountSettings.ts
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setSubscriptionStatus } from '../store/subscriptionSlice';
import { SubscriptionManager } from '../services/subscription/SubscriptionManager';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

export const useAccountSettings = () => {
  const dispatch = useDispatch();
  const subscription = useSelector((state: RootState) => state.subscription);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  
  useEffect(() => {
    loadSubscriptionStatus();
    loadProducts();
    subscribeToStatusChanges();
  }, []);
  
  const loadSubscriptionStatus = async () => {
    const status = await SubscriptionManager.checkSubscriptionStatus();
    const trialDays = await SubscriptionManager.getTrialDaysRemaining();
    
    dispatch(setSubscriptionStatus({
      membershipStatus: status,
      trialDaysRemaining: trialDays,
    }));
  };
  
  const loadProducts = async () => {
    const result = await PurchaseService.loadProducts();
    if (result.success) {
      setProducts(result.products);
    }
  };
  
  const subscribeToStatusChanges = () => {
    const user = auth().currentUser;
    if (!user) return;
    
    return firestore()
      .collection('users')
      .doc(user.uid)
      .onSnapshot((doc) => {
        const data = doc.data();
        if (data) {
          dispatch(setSubscriptionStatus({
            membershipStatus: data.membershipStatus,
            subscriptionId: data.subscriptionId,
            productId: data.productId,
            autoRenewing: data.autoRenewing,
          }));
        }
      });
  };
  
  return {
    ...subscription,
    loading,
    products,
    refresh: loadSubscriptionStatus,
  };
};
```

---

## 6. Platform-Specific Considerations

### 6.1 iOS Implementation
```typescript
// ios/SymposiumAI/AppDelegate.mm
#import "RNIap.h"

- (BOOL)application:(UIApplication *)application 
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Initialize IAP
  [RNIap configureIAP];
  
  // ... rest of initialization
  return YES;
}
```

### 6.2 Android Implementation
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="com.android.vending.BILLING" />
```

```gradle
// android/app/build.gradle
dependencies {
    implementation 'com.android.billingclient:billing:7.0.0'
    // ... other dependencies
}
```

---

## 7. UI/UX Guidelines

### 7.1 Visual Design
- Use card-based layout for clear information hierarchy
- Color coding: Green (Premium), Blue (Trial), Gray (Demo)
- Clear CTAs with appropriate sizing
- Loading states for all async operations
- Error states with helpful messages

### 7.2 Copy Guidelines
**Demo Users:**
- Emphasize "7-day free trial"
- Highlight value proposition
- Use encouraging language

**Trial Users:**
- Show urgency with countdown
- Remind about auto-renewal
- Provide easy cancellation

**Premium Users:**
- Thank for subscription
- Show renewal information
- Offer upgrade to annual

### 7.3 Accessibility
- VoiceOver/TalkBack support
- Minimum touch target 44x44 (iOS) / 48x48 (Android)
- High contrast text
- Clear focus indicators
- Screen reader descriptions

---

## 8. Error Handling

### 8.1 Common Errors
```typescript
const handlePurchaseError = (error: any) => {
  const errorMessages: Record<string, string> = {
    'E_USER_CANCELLED': 'Purchase cancelled',
    'E_ITEM_UNAVAILABLE': 'This subscription is not available',
    'E_NETWORK_ERROR': 'Network error. Please check your connection.',
    'E_SERVICE_ERROR': 'Store service unavailable. Please try again later.',
    'E_RECEIPT_FAILED': 'Unable to verify purchase. Please contact support.',
    'E_ALREADY_OWNED': 'You already have an active subscription.',
  };
  
  const message = errorMessages[error.code] || 'An unexpected error occurred';
  
  Alert.alert('Purchase Error', message, [{ text: 'OK' }]);
};
```

### 8.2 Recovery Flows
- Network errors: Retry with exponential backoff
- Payment failures: Guide to payment method update
- Validation failures: Offer restore purchases
- Store errors: Provide offline information

---

## 9. Analytics Events

### 9.1 Key Events to Track
```typescript
// Account Settings events
analytics().logEvent('account_settings_viewed');
analytics().logEvent('subscription_card_tapped');
analytics().logEvent('plan_selected', { plan_type: 'monthly' | 'annual' });
analytics().logEvent('trial_start_tapped');
analytics().logEvent('purchase_initiated', { plan_type, has_trial });
analytics().logEvent('purchase_completed', { plan_type, amount });
analytics().logEvent('purchase_failed', { error_code });
analytics().logEvent('restore_initiated');
analytics().logEvent('restore_completed', { restored: boolean });
analytics().logEvent('manage_subscription_tapped');
analytics().logEvent('cancel_trial_tapped');
```

### 9.2 User Properties
```typescript
// Set user properties for segmentation
analytics().setUserProperty('membership_status', membershipStatus);
analytics().setUserProperty('subscription_plan', productId);
analytics().setUserProperty('trial_days_remaining', trialDaysRemaining?.toString());
analytics().setUserProperty('has_used_trial', hasUsedTrial.toString());
```

---

## 10. Testing Checklist

### 10.1 Functional Tests
- [ ] Navigation from Profile to Account Settings
- [ ] Correct status display for all tiers
- [ ] Trial countdown accuracy
- [ ] Purchase flow completion
- [ ] Restore purchases functionality
- [ ] Subscription management links
- [ ] Plan switching UI
- [ ] Loading states
- [ ] Error handling

### 10.2 Edge Cases
- [ ] Expired trial handling
- [ ] Payment method failures
- [ ] Network interruptions
- [ ] Anonymous user flows
- [ ] Already subscribed users
- [ ] Grace period handling
- [ ] Multiple device sync

### 10.3 Platform Tests
- [ ] iOS sandbox purchases
- [ ] Android test purchases
- [ ] iOS subscription management
- [ ] Android subscription management
- [ ] Receipt validation
- [ ] Cross-platform restore

---

## 11. Implementation Timeline

### Phase 1: Basic UI (2 days)
- Create AccountSettingsScreen
- Implement navigation
- Build status cards
- Add plan selector

### Phase 2: IAP Integration (3 days)
- Connect PurchaseService
- Implement purchase flow
- Add restore functionality
- Handle receipts

### Phase 3: State Management (2 days)
- Redux integration
- Firestore sync
- Real-time updates
- Trial tracking

### Phase 4: Polish (2 days)
- Error handling
- Loading states
- Analytics
- Platform testing

### Phase 5: QA (1 day)
- End-to-end testing
- Edge case validation
- Performance optimization
- Bug fixes

---

## Conclusion

The Account Settings implementation provides a comprehensive subscription management interface that handles the complete user journey from Demo to Premium. The design prioritizes clarity, user control, and platform compliance while maintaining a smooth user experience.

Key success factors:
1. Clear subscription status communication
2. Simple purchase flow with trial
3. Easy subscription management
4. Reliable restore functionality
5. Platform-native payment handling

---

*For implementation support: team@braveheart-innovations.com*