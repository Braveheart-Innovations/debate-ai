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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Typography, GradientButton } from '@/components/molecules';
import { Header, PersonalityCard, PersonalityCustomizationPanel } from '@/components/organisms';
import { useTheme } from '@/theme';
import { usePersonality, MergedPersonality } from '@/hooks/usePersonality';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { RootStackParamList } from '@/types';

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function PersonalitySystemScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();

  const { getAllPersonalities, isLoading } = usePersonality();
  const { isDemo, isPremium } = useFeatureAccess();

  const [selectedPersonality, setSelectedPersonality] = useState<MergedPersonality | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  // Get all personalities excluding 'default'
  const personalities = useMemo(() => {
    return getAllPersonalities().filter(p => p.id !== 'default');
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

  const renderPersonalityCard = useCallback(
    ({ item }: { item: MergedPersonality }) => (
      <View style={[styles.cardWrapper, { width: cardWidth }]}>
        <PersonalityCard
          personality={item}
          onPress={() => handlePersonalityPress(item)}
          isLocked={isDemo}
          testID={`personality-card-${item.id}`}
        />
      </View>
    ),
    [cardWidth, handlePersonalityPress, isDemo]
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Premium Banner for Demo Users */}
      {isDemo && (
        <View style={[styles.upgradeBanner, { backgroundColor: theme.colors.primary[50] }]}>
          <View style={styles.upgradeBannerContent}>
            <Typography variant="body" weight="semibold" color="primary">
              Unlock Personality Customization
            </Typography>
            <Typography variant="caption" color="secondary" style={styles.upgradeDescription}>
              Premium and trial users can customize how each personality communicates
            </Typography>
          </View>
          <GradientButton
            title="Upgrade"
            onPress={handleUpgradePress}
            size="small"
          />
        </View>
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
        data={personalities}
        renderItem={renderPersonalityCard}
        keyExtractor={(item) => item.id}
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  upgradeBannerContent: {
    flex: 1,
    marginRight: 12,
  },
  upgradeDescription: {
    marginTop: 4,
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
