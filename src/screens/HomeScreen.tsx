import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResponsiveContainer } from '../components/atoms';
import { Header, HeaderActions } from '../components/organisms';
import { DynamicAISelector, PromptWizard, QuickStartTopicPicker } from '../components/organisms';
import { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';

import { useTheme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { HOME_CONSTANTS } from '../config/homeConstants';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useDispatch } from 'react-redux';
import { showSheet } from '@/store';

// Custom hooks
import { useGreeting } from '../hooks/home/useGreeting';
import { usePremiumFeatures } from '../hooks/home/usePremiumFeatures';
import { useAISelection } from '../hooks/home/useAISelection';
import { useSessionManagement } from '../hooks/home/useSessionManagement';
import { useQuickStart } from '../hooks/home/useQuickStart';

interface HomeScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}



const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { rs } = useResponsive();

  // Compose hooks for clean separation of concerns
  const greeting = useGreeting();
  const premium = usePremiumFeatures();
  const aiSelection = useAISelection(premium.maxAIs);
  const session = useSessionManagement();
  const quickStart = useQuickStart();
  const { isDemo } = useFeatureAccess();
  const dispatch = useDispatch();
  const [topicPickerVisible, setTopicPickerVisible] = React.useState(false);
  
  // Event handlers using hook methods
  const handleStartChat = () => {
    if (!aiSelection.hasSelection) return;
    if (isDemo) {
      setTopicPickerVisible(true);
      return;
    }
    const sessionId = session.createSession(aiSelection.selectedAIs);
    navigation.navigate(HOME_CONSTANTS.SCREENS.CHAT, { sessionId });
  };
  
  // handleSelectTopic removed - now using FAB + TopicPicker flow
  
  const handleCompleteWizard = (userPrompt: string, enrichedPrompt: string) => {
    if (quickStart.validateCompletion(userPrompt, enrichedPrompt) && aiSelection.hasSelection) {
      const sessionId = session.createSession(aiSelection.selectedAIs);
      navigation.navigate(HOME_CONSTANTS.SCREENS.CHAT, {
        sessionId,
        initialPrompt: enrichedPrompt,
        userPrompt,
        autoSend: true,
      });
    }
    quickStart.closeWizard();
  };
  
  const handleAddAI = () => {
    navigation.navigate(HOME_CONSTANTS.SCREENS.API_CONFIG);
  };
  
  
  return (
    <SafeAreaView 
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'left', 'right']}>
      <Header
        variant="gradient"
        title={greeting.timeBasedGreeting}
        subtitle={greeting.welcomeMessage}
        showTime={true}
        showDate={true}
        animated={true}
        rightElement={<HeaderActions variant="gradient" helpCategoryId="chat" />}
        showDemoBadge={isDemo}
      />

      {isDemo && (
        <DemoBanner
          subtitle="Simulated chat preview. Start a free trial to chat for real."
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: rs('lg'),
          paddingBottom: rs('xl') * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContainer maxWidth="xl" center>
          <TrialBanner />
          {/* Primary: AI Selection & Chat */}
          <View style={{ marginBottom: rs('xl') }}>
            <DynamicAISelector
              configuredAIs={aiSelection.configuredAIs}
              selectedAIs={aiSelection.selectedAIs}
              maxAIs={aiSelection.maxAIs}
              onToggleAI={aiSelection.toggleAI}
              onStartChat={handleStartChat}
              onAddAI={handleAddAI}
              hideAddAI={isDemo}
              aiPersonalities={aiSelection.aiPersonalities}
              selectedModels={aiSelection.selectedModels}
              onPersonalityChange={aiSelection.changePersonality}
              onModelChange={aiSelection.changeModel}
              onQuickStart={isDemo ? undefined : quickStart.openTopicPicker}
            />
          </View>
        </ResponsiveContainer>
      </ScrollView>

      {/* Topic Picker Modal */}
      <QuickStartTopicPicker
        visible={quickStart.showTopicPicker}
        topics={quickStart.topics}
        onSelectTopic={quickStart.selectTopicFromPicker}
        onClose={quickStart.closeTopicPicker}
      />
      
      {/* Prompt Wizard Modal */}
      <PromptWizard
        visible={quickStart.showWizard}
        topic={quickStart.selectedTopic}
        onClose={quickStart.closeWizard}
        onComplete={handleCompleteWizard}
        selectedAIs={aiSelection.selectedAIs}
        aiPersonalities={aiSelection.aiPersonalities}
      />

      {/* Demo Mode: Chat Topic Picker */}
      {isDemo && (
        <ChatTopicPickerModal
          visible={topicPickerVisible}
          providers={aiSelection.selectedAIs.map(a => a.provider)}
          personaId={aiSelection.selectedAIs.length === 1 ? (aiSelection.aiPersonalities[aiSelection.selectedAIs[0].id] || 'default') : undefined}
          onClose={() => setTopicPickerVisible(false)}
          onSelect={(sampleId) => {
            setTopicPickerVisible(false);
            const sessionId = session.createSession(aiSelection.selectedAIs);
            navigation.navigate(HOME_CONSTANTS.SCREENS.CHAT, { sessionId, demoSampleId: sampleId });
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default HomeScreen;
