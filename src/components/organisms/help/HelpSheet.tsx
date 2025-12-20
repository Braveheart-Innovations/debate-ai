/**
 * HelpSheet
 *
 * Comprehensive help and support sheet with how-to guides,
 * FAQ, contact support, and legal/about sections.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ScrollView,
  View,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import AppIcon from '../../../../assets/icon.png';
import BraveheartLogo from '../../../../assets/BraveheartInnovationsLogoNoText.png';
import { Box } from '@/components/atoms';
import { Typography, SheetHeader } from '@/components/molecules';
import { HelpTopicCard } from '@/components/molecules/help/HelpTopicCard';
import { FAQItem } from '@/components/molecules/help/FAQItem';
import { useTheme } from '@/theme';
import { showHelpWebView } from '@/store/navigationSlice';
import { RootState } from '@/store';
import {
  HELP_CATEGORIES,
  HELP_TOPICS,
  getTopicsByCategory,
} from '@/config/help/topics';
import { FAQ_ITEMS } from '@/config/help/faq';
import { HelpTopicId, HelpCategory } from '@/config/help/types';

interface HelpSheetProps {
  onClose: () => void;
}

type TabType = 'guides' | 'faq' | 'contact';

const SUPPORT_EMAIL = 'support@braveheartinnovations.com';
const PRIVACY_POLICY_URL = 'https://www.symposiumai.app/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.symposiumai.app/terms';

export const HelpSheet: React.FC<HelpSheetProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();

  // Get initial topic or category from sheet data (if opened via InfoButton or Header)
  const sheetData = useSelector((state: RootState) => state.navigation.sheetData);
  const initialTopicId = sheetData?.topicId as HelpTopicId | undefined;
  const initialCategoryId = sheetData?.categoryId as HelpCategory | undefined;

  const [activeTab, setActiveTab] = useState<TabType>('guides');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(
    initialTopicId || null
  );
  const [expandedFAQId, setExpandedFAQId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | 'all'>(
    initialCategoryId || 'all'
  );

  // If opened with a specific topic, scroll to guides and expand it
  useEffect(() => {
    if (initialTopicId) {
      setActiveTab('guides');
      setExpandedTopicId(initialTopicId);
      // Find the category for this topic
      const topic = HELP_TOPICS[initialTopicId];
      if (topic) {
        setSelectedCategory(topic.category);
      }
    } else if (initialCategoryId) {
      // If opened with a category, filter to that category
      setActiveTab('guides');
      setSelectedCategory(initialCategoryId);
    }
  }, [initialTopicId, initialCategoryId]);

  // Filter topics by selected category
  const filteredTopics = useMemo(() => {
    if (selectedCategory === 'all') {
      return Object.values(HELP_TOPICS);
    }
    return getTopicsByCategory(selectedCategory);
  }, [selectedCategory]);

  const handleTabChange = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleTopicPress = useCallback((topicId: string) => {
    setExpandedTopicId((prev) => (prev === topicId ? null : topicId));
  }, []);

  const handleLearnMore = useCallback(
    (webUrl: string) => {
      dispatch(showHelpWebView(webUrl));
    },
    [dispatch]
  );

  const handleFAQToggle = useCallback((faqId: string) => {
    setExpandedFAQId((prev) => (prev === faqId ? null : faqId));
  }, []);

  const handleCategoryChange = (category: HelpCategory | 'all') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(category);
    setExpandedTopicId(null);
  };

  const getDeviceInfo = () => {
    const info = [
      'App Version: 1.0.0',
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Device: ${Device.brand} ${Device.modelName}`,
      `OS: ${Device.osName} ${Device.osVersion}`,
    ];
    return info.join('\n');
  };

  const handleContactSupport = async () => {
    const subject = encodeURIComponent('Support Request - Symposium AI');
    const deviceInfo = encodeURIComponent(
      `\n\n---\nDevice Information:\n${getDeviceInfo()}`
    );
    const body = encodeURIComponent(
      `Hi Symposium AI Team,\n\nI need help with:\n\n[Please describe your issue here]${decodeURIComponent(
        deviceInfo
      )}`
    );
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Client Not Available',
          `Please send an email to ${SUPPORT_EMAIL}`,
          [{ text: 'OK' }]
        );
      }
    } catch {
      Alert.alert(
        'Error',
        `Could not open email client. Please email ${SUPPORT_EMAIL} directly.`,
        [{ text: 'OK' }]
      );
    }
  };

  const renderTabBar = () => (
    <View style={[styles.tabBar, { borderBottomColor: theme.colors.border }]}>
      {[
        { id: 'guides' as TabType, label: 'Guides', icon: 'book-outline' },
        { id: 'faq' as TabType, label: 'FAQ', icon: 'help-circle-outline' },
        { id: 'contact' as TabType, label: 'Contact', icon: 'mail-outline' },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => handleTabChange(tab.id)}
          style={[
            styles.tab,
            activeTab === tab.id && {
              borderBottomColor: theme.colors.primary[500],
            },
          ]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={tab.icon as keyof typeof Ionicons.glyphMap}
            size={20}
            color={
              activeTab === tab.id
                ? theme.colors.primary[500]
                : theme.colors.text.secondary
            }
          />
          <Typography
            variant="caption"
            weight={activeTab === tab.id ? 'semibold' : 'normal'}
            style={{
              color:
                activeTab === tab.id
                  ? theme.colors.primary[500]
                  : theme.colors.text.secondary,
            }}
          >
            {tab.label}
          </Typography>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCategoryFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryFilterContent}
      style={styles.categoryFilter}
    >
      <TouchableOpacity
        onPress={() => handleCategoryChange('all')}
        style={[
          styles.categoryChip,
          {
            backgroundColor:
              selectedCategory === 'all'
                ? theme.colors.primary[500]
                : theme.colors.surface,
          },
        ]}
        activeOpacity={0.7}
      >
        <Typography
          variant="caption"
          weight="medium"
          style={{
            color:
              selectedCategory === 'all'
                ? '#FFFFFF'
                : theme.colors.text.primary,
          }}
        >
          All
        </Typography>
      </TouchableOpacity>
      {HELP_CATEGORIES.map((category) => (
        <TouchableOpacity
          key={category.id}
          onPress={() => handleCategoryChange(category.id)}
          style={[
            styles.categoryChip,
            {
              backgroundColor:
                selectedCategory === category.id
                  ? theme.colors.primary[500]
                  : theme.colors.surface,
            },
          ]}
          activeOpacity={0.7}
        >
          <Typography
            variant="caption"
            weight="medium"
            style={{
              color:
                selectedCategory === category.id
                  ? '#FFFFFF'
                  : theme.colors.text.primary,
            }}
          >
            {category.title}
          </Typography>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const renderGuidesTab = () => (
    <View>
      {renderCategoryFilter()}
      <View style={styles.topicsContainer}>
        {filteredTopics.map((topic) => (
          <HelpTopicCard
            key={topic.id}
            topic={topic}
            isExpanded={expandedTopicId === topic.id}
            onPress={() => handleTopicPress(topic.id)}
            onLearnMore={
              topic.webUrl ? () => handleLearnMore(topic.webUrl!) : undefined
            }
          />
        ))}
      </View>
    </View>
  );

  const renderFAQTab = () => (
    <View style={styles.faqContainer}>
      {FAQ_ITEMS.map((item) => (
        <FAQItem
          key={item.id}
          question={item.question}
          answer={item.answer}
          isExpanded={expandedFAQId === item.id}
          onToggle={() => handleFAQToggle(item.id)}
        />
      ))}
    </View>
  );

  const renderContactTab = () => (
    <View>
      {/* Get Help Section */}
      <Box style={styles.section}>
        <Typography
          variant="title"
          weight="semibold"
          style={styles.sectionTitle}
        >
          Get Help
        </Typography>

        <TouchableOpacity
          style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
          onPress={handleContactSupport}
          activeOpacity={0.7}
        >
          <View style={styles.listItemContent}>
            <Ionicons
              name="mail-outline"
              size={24}
              color={theme.colors.primary[500]}
            />
            <View style={styles.listItemText}>
              <Typography variant="body" weight="medium">
                Contact Support
              </Typography>
              <Typography variant="caption" color="secondary">
                Send us an email with your question or issue
              </Typography>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.secondary}
          />
        </TouchableOpacity>
      </Box>

      {/* Legal & Policies Section */}
      <Box style={styles.section}>
        <Typography
          variant="title"
          weight="semibold"
          style={styles.sectionTitle}
        >
          Legal &amp; Policies
        </Typography>
        <TouchableOpacity
          style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
          onPress={() => handleLearnMore(PRIVACY_POLICY_URL)}
          activeOpacity={0.7}
        >
          <View style={styles.listItemContent}>
            <Ionicons
              name="shield-checkmark-outline"
              size={24}
              color={theme.colors.text.secondary}
            />
            <View style={styles.listItemText}>
              <Typography variant="body" weight="medium">
                Privacy Policy
              </Typography>
              <Typography variant="caption" color="secondary">
                View our privacy policy
              </Typography>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.secondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.listItem, { backgroundColor: theme.colors.surface }]}
          onPress={() => handleLearnMore(TERMS_OF_SERVICE_URL)}
          activeOpacity={0.7}
        >
          <View style={styles.listItemContent}>
            <Ionicons
              name="document-text-outline"
              size={24}
              color={theme.colors.text.secondary}
            />
            <View style={styles.listItemText}>
              <Typography variant="body" weight="medium">
                Terms of Service
              </Typography>
              <Typography variant="caption" color="secondary">
                View our terms of service
              </Typography>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.colors.text.secondary}
          />
        </TouchableOpacity>
      </Box>

      {/* About Section */}
      <Box style={styles.section}>
        <Typography
          variant="title"
          weight="semibold"
          style={styles.sectionTitle}
        >
          About
        </Typography>

        <Box
          style={[styles.aboutCard, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.logoContainer}>
            <Image source={AppIcon} style={styles.appIcon} />
          </View>
          <Typography
            variant="title"
            weight="bold"
            style={{ textAlign: 'center' }}
          >
            Symposium AI
          </Typography>
          <Typography
            variant="body"
            color="secondary"
            style={{ textAlign: 'center' }}
          >
            Version 1.0.0
          </Typography>
        </Box>
      </Box>

      {/* Credits Section */}
      <Box
        style={[
          styles.section,
          styles.creditsSection,
          { borderTopColor: theme.colors.border },
        ]}
      >
        <View style={styles.braveheartRow}>
          <Typography
            variant="caption"
            color="secondary"
            style={{ textAlign: 'center' }}
          >
            Made with
          </Typography>
          <Image
            source={BraveheartLogo as unknown as number}
            style={styles.braveheartLogo}
            resizeMode="contain"
          />
          <Typography
            variant="caption"
            color="secondary"
            style={{ textAlign: 'center' }}
          >
            by Braveheart Innovations LLC
          </Typography>
        </View>
      </Box>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <SheetHeader
        title="Help & Support"
        onClose={onClose}
        showHandle={false}
        testID="help-sheet-header"
      />

      {renderTabBar()}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 40 + insets.bottom,
        }}
        showsVerticalScrollIndicator
        bounces
        scrollEnabled
        nestedScrollEnabled
      >
        {activeTab === 'guides' && renderGuidesTab()}
        {activeTab === 'faq' && renderFAQTab()}
        {activeTab === 'contact' && renderContactTab()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  categoryFilter: {
    marginBottom: 16,
    marginHorizontal: -20,
  },
  categoryFilterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topicsContainer: {
    gap: 0,
  },
  faqContainer: {
    gap: 0,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  listItemText: {
    marginLeft: 12,
    flex: 1,
  },
  aboutCard: {
    padding: 24,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 12,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  creditsSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  braveheartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  braveheartLogo: {
    width: 18,
    height: 18,
    marginHorizontal: 6,
  },
});
