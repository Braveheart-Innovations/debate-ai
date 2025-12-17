import React, { useState } from 'react';
import { ScrollView, View, StyleSheet, Platform, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Typography } from '../components/molecules';
import { GradientButton, Button } from '../components/molecules';
import { Header, HeaderActions } from '@/components/organisms';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { PurchaseService } from '@/services/iap/PurchaseService';
import type { PlanType } from '@/services/iap/products';

const features = [
  'All Signature Styles + Seasonal Packs',
  'Unlimited AI Debates & Custom Motions',
  'Expert Models & Cost Control',
  'Faster Streaming & Priority Access',
  'History, Transcript Export & Sharing',
];

const plans = [
  { id: 'monthly', title: 'Monthly', price: '$5.99', period: '/mo', highlight: false },
  { id: 'yearly', title: 'Yearly', price: '$49.99', period: '/yr', highlight: true, badge: 'Save 30%' },
  { id: 'lifetime', title: 'Lifetime', price: '$129.99', period: '', highlight: false, badge: 'One-Time' },
];

export default function UpgradeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const onSubscribe = async (planId: string) => {
    try {
      setLoadingPlan(planId);
      const result = await PurchaseService.purchaseSubscription(planId as PlanType);
      if (result.success) {
        Alert.alert('Success', 'Thank you for your purchase!');
        (navigation as unknown as { goBack: () => void }).goBack();
      } else if ('cancelled' in result && result.cancelled) {
        // User cancelled, do nothing
      } else {
        Alert.alert('Error', 'Purchase could not be completed. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <>
      <Header
        variant="gradient"
        title="Unlock Premium"
        subtitle="Start your 7‑day free trial"
        showBackButton
        onBack={() => {
          try { (navigation as unknown as { goBack: () => void }).goBack(); } catch { /* noop */ }
        }}
        animated
        rightElement={<HeaderActions variant="gradient" />}
      />
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Hero */}
      <LinearGradient
        colors={(theme.colors.gradients.premium as unknown as [string, string])}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Typography variant="title" weight="bold" color="inverse" align="center">
          Unlock Premium
        </Typography>
        <Typography variant="body" color="inverse" align="center" style={{ marginTop: 8 }}>
          All Signature Styles, faster debates, and pro tools.
        </Typography>
      </LinearGradient>

      {/* Features */}
      <View style={{ padding: 20 }}>
        {features.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Typography style={{ fontSize: 18 }}>✨</Typography>
            <Typography variant="body" style={{ marginLeft: 8 }}>{f}</Typography>
          </View>
        ))}
      </View>

      {/* Pricing */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        {plans.map((p) => (
          <View
            key={p.id}
            style={[styles.planCard, { borderColor: p.highlight ? theme.colors.primary[500] : theme.colors.border }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle" weight="bold">{p.title}</Typography>
              {p.badge && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary[500] }]}>
                  <Typography variant="caption" color="inverse" weight="bold">{p.badge}</Typography>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
              <Typography variant="title" weight="bold">{p.price}</Typography>
              <Typography variant="caption" color="secondary" style={{ marginLeft: 6 }}>{p.period}</Typography>
            </View>
            <GradientButton
              title={loadingPlan === p.id ? 'Processing...' : (p.id === 'lifetime' ? 'Buy Now' : 'Subscribe Now')}
              onPress={() => onSubscribe(p.id)}
              gradient={theme.colors.gradients.primary}
              fullWidth
              style={{ marginTop: 12 }}
              disabled={loadingPlan !== null}
            />
          </View>
        ))}
        <Button
          title="Restore Purchases"
          onPress={async () => {
            try {
              setLoadingPlan('restore');
              const result = await PurchaseService.restorePurchases();
              if (result.success && result.restored) {
                Alert.alert('Success', 'Your purchases have been restored.');
                (navigation as unknown as { goBack: () => void }).goBack();
              } else if (result.success && !result.restored) {
                Alert.alert('No Purchases', 'No previous purchases were found.');
              } else {
                Alert.alert('Error', 'Could not restore purchases. Please try again.');
              }
            } catch {
              Alert.alert('Error', 'An unexpected error occurred.');
            } finally {
              setLoadingPlan(null);
            }
          }}
          variant="ghost"
          fullWidth
          disabled={loadingPlan !== null}
        />
      </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
