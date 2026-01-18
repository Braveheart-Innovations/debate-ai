/**
 * PersonalitySystemScreen - Dedicated screen for personality customization
 * Displays all 8 personalities in a grid with customization panels
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  FlatList,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Typography } from '@/components/molecules';
import { Header, PersonalityCard, PersonalityCustomizationPanel, CreateYourOwnCard } from '@/components/organisms';
import { useTheme } from '@/theme';
import { usePersonality, MergedPersonality } from '@/hooks/usePersonality';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useStorePrices } from '@/hooks/useStorePrices';
import { RootStackParamList } from '@/types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

// Grid item types for the personality list
type PersonalityGridItem =
  | { type: 'personality'; data: MergedPersonality }
  | { type: 'create-your-own' };

export default function PersonalitySystemScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();

  const { getAllPersonalities, isLoading } = usePersonality();
  const { isDemo, isPremium, canStartTrial } = useFeatureAccess();
  const { monthly } = useStorePrices();

  const [selectedPersonality, setSelectedPersonality] = useState<MergedPersonality | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  // Get all personalities excluding 'default', plus the CreateYourOwn teaser card
  const gridItems = useMemo((): PersonalityGridItem[] => {
    const personalities = getAllPersonalities().filter(p => p.id !== 'default');
    const items: PersonalityGridItem[] = personalities.map(p => ({
      type: 'personality' as const,
      data: p,
    }));
    // Add the "Create Your Own" teaser as the 8th card
    items.push({ type: 'create-your-own' as const });
    return items;
  }, [getAllPersonalities]);

  // Calculate number of columns based on screen width
  const numColumns = width > 600 ? 3 : 2;
  const cardWidth = (width - 48 - (numColumns - 1) * 12) / numColumns;

  const handlePersonalityPress = useCallback((personality: MergedPersonality) => {
    if (isDemo) {
      // Demo users can view but show upgrade prompt in panel
      setSelectedPersonality(personality);
      setPanelVisible(true);
    } else {
      setSelectedPersonality(personality);
      setPanelVisible(true);
    }
  }, [isDemo]);

  const handleClosePanel = useCallback(() => {
    setPanelVisible(false);
    // Clear selection after animation
    setTimeout(() => setSelectedPersonality(null), 300);
  }, []);

  const handleUpgradePress = useCallback(() => {
    navigation.navigate('Subscription');
  }, [navigation]);

  const renderGridItem = useCallback(
    ({ item }: { item: PersonalityGridItem }) => {
      if (item.type === 'create-your-own') {
        return (
          <View style={[styles.cardWrapper, { width: cardWidth }]}>
            <CreateYourOwnCard testID="create-your-own-card" />
          </View>
        );
      }

      return (
        <View style={[styles.cardWrapper, { width: cardWidth }]}>
          <PersonalityCard
            personality={item.data}
            onPress={() => handlePersonalityPress(item.data)}
            isLocked={isDemo}
            testID={`personality-card-${item.data.id}`}
          />
        </View>
      );
    },
    [cardWidth, handlePersonalityPress, isDemo]
  );

  const getItemKey = useCallback((item: PersonalityGridItem) => {
    if (item.type === 'create-your-own') return 'create-your-own';
    return item.data.id;
  }, []);

  const ctaText = canStartTrial ? 'Start 7-Day Free Trial' : 'Upgrade to Premium';

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Premium Banner for Demo Users - matches DemoBanner design */}
      {isDemo && (
        <TouchableOpacity
          style={[
            styles.upgradeBanner,
            {
              backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.10)',
              borderColor: theme.colors.primary[300],
            },
          ]}
          onPress={handleUpgradePress}
          activeOpacity={0.8}
        >
          <Typography
            variant="caption"
            weight="bold"
            style={{ color: theme.colors.primary[500] }}
          >
            Unlock Personality Customization
          </Typography>
          <Typography variant="caption" color="secondary" style={styles.upgradeDescription}>
            Premium and trial users can customize how each personality communicates
          </Typography>
          <View style={styles.ctaRow}>
            <View style={styles.ctaPill}>
              <Typography variant="caption" weight="semibold" color="inverse">
                {ctaText}
              </Typography>
            </View>
            {canStartTrial && (
              <Typography variant="caption" color="secondary" style={styles.priceText}>
                Then {monthly.localizedPrice}/mo
              </Typography>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Description */}
      <View style={styles.descriptionContainer}>
        <Typography variant="body" color="secondary">
          Each personality has unique communication traits and debate styles.
          {isPremium
            ? ' Tap any personality to customize their behavior.'
            : ' Upgrade to customize their behavior.'}
        </Typography>
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <Header
        variant="gradient"
        title="Personality System"
        subtitle="Customize AI Personalities"
        showBackButton={true}
        onBack={() => navigation.goBack()}
        animated={true}
        testID="personality-system-header"
      />

      {/* Personality Grid */}
      <FlatList
        data={gridItems}
        renderItem={renderGridItem}
        keyExtractor={getItemKey}
        numColumns={numColumns}
        key={numColumns} // Force re-render when columns change
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 20 },
        ]}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={renderHeader}
        showsVerticalScrollIndicator={false}
        testID="personality-grid"
      />

      {/* Customization Panel Modal */}
      <Modal
        visible={panelVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClosePanel}
      >
        {selectedPersonality && (
          <SafeAreaView
            style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}
            edges={['top']}
          >
            <PersonalityCustomizationPanel
              personality={selectedPersonality}
              onClose={handleClosePanel}
              canCustomize={isPremium}
              testID="personality-customization-panel"
            />
          </SafeAreaView>
        )}
      </Modal>

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Typography variant="body" color="secondary">
            Loading personalities...
          </Typography>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    justifyContent: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  cardWrapper: {
    // Width set dynamically
  },
  headerContent: {
    marginBottom: 16,
  },
  upgradeBanner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  upgradeDescription: {
    marginTop: 2,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ctaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#6366F1',
  },
  priceText: {
    marginLeft: 8,
  },
  descriptionContainer: {
    marginBottom: 8,
  },
  modalContainer: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
