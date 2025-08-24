import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header, HeaderActions } from '../components/organisms';
import { DynamicAISelector } from '../components/organisms/DynamicAISelector';
import { QuickStartsSection } from '../components/organisms/QuickStartsSection';
import { PromptWizard } from '../components/organisms/PromptWizard';

import { useTheme } from '../theme';
import { HOME_CONSTANTS } from '../config/homeConstants';

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
  
  // Compose hooks for clean separation of concerns
  const greeting = useGreeting();
  const premium = usePremiumFeatures();
  const aiSelection = useAISelection(premium.maxAIs);
  const session = useSessionManagement();
  const quickStart = useQuickStart();
  
  // Event handlers using hook methods
  const handleStartChat = () => {
    if (aiSelection.hasSelection) {
      const sessionId = session.createSession(aiSelection.selectedAIs);
      navigation.navigate(HOME_CONSTANTS.SCREENS.CHAT, { sessionId });
    }
  };
  
  const handleSelectTopic = (topic: typeof quickStart.topics[0]) => {
    if (aiSelection.hasSelection && quickStart.isAvailable(aiSelection.selectionCount)) {
      quickStart.selectTopic(topic);
    }
  };
  
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
        showProfileIcon={true}
        rightElement={<HeaderActions variant="gradient" />}
      />
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ 
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Primary: AI Selection & Chat */}
        <View style={{ marginBottom: theme.spacing.xl }}>
          <DynamicAISelector
            configuredAIs={aiSelection.configuredAIs}
            selectedAIs={aiSelection.selectedAIs}
            maxAIs={aiSelection.maxAIs}
            onToggleAI={aiSelection.toggleAI}
            onStartChat={handleStartChat}
            onAddAI={handleAddAI}
            isPremium={premium.isPremium}
            aiPersonalities={aiSelection.aiPersonalities}
            selectedModels={aiSelection.selectedModels}
            onPersonalityChange={aiSelection.changePersonality}
            onModelChange={aiSelection.changeModel}
          />
        </View>
        
        {/* Quick Starts - Guided Chat */}
        <QuickStartsSection
          topics={quickStart.topics}
          onSelectTopic={handleSelectTopic}
          disabled={!aiSelection.hasSelection}
        />
      </ScrollView>
      
      {/* Prompt Wizard Modal */}
      <PromptWizard
        visible={quickStart.showWizard}
        topic={quickStart.selectedTopic}
        onClose={quickStart.closeWizard}
        onComplete={handleCompleteWizard}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;