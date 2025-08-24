import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setAIPersonality, setAIModel, preserveTopic, clearPreservedTopic, setAuthModalVisible } from '../store';

import { Box } from '../components/atoms';
import { Button } from '../components/molecules';
import { Header } from '../components/organisms';
import { hasFeatureAccess, getPremiumUpsellMessage } from '../services/PremiumService';
import {
  DebateTopicSelector,
  DebateAISelector,
  DebatePersonalitySelector,
  DebateStepIndicator,
} from '../components/organisms/debate';

import { useTheme } from '../theme';
import { AIConfig } from '../types';
import { AI_PROVIDERS } from '../config/aiProviders';
import { AI_MODELS } from '../config/modelConfigs';
import { getAIProviderIcon } from '../utils/aiProviderAssets';
import { DEBATE_TOPICS } from '../constants/debateTopics';
import { usePreDebateValidation } from '../hooks/debate';

interface DebateSetupScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const DebateSetupScreen: React.FC<DebateSetupScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const scrollViewRef = useRef<ScrollView>(null);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const selectedModelsFromStore = useSelector((state: RootState) => state.chat.selectedModels);
  const preservedTopic = useSelector((state: RootState) => state.debateStats.preservedTopic);
  const preservedTopicMode = useSelector((state: RootState) => state.debateStats.preservedTopicMode);
  const isPremium = useSelector((state: RootState) => state.auth.isPremium);
  
  // Pre-debate validation
  const validation = usePreDebateValidation(navigation);
  
  // Get configured AIs based on which ones have API keys
  const configuredAIs = useMemo(() => {
    return AI_PROVIDERS
      .filter(provider => provider.enabled && apiKeys[provider.id as keyof typeof apiKeys])
      .map(provider => {
        const iconData = getAIProviderIcon(provider.id);
        const defaultModel = AI_MODELS[provider.id]?.find(m => m.isDefault)?.id || AI_MODELS[provider.id]?.[0]?.id || '';
        return {
          id: provider.id,
          provider: provider.id,
          name: provider.name,
          model: defaultModel,
          personality: 'balanced',
          avatar: iconData.icon, // Keep for backwards compatibility
          icon: iconData.icon,
          iconType: iconData.iconType,
          color: provider.color,
        } as AIConfig;
      });
  }, [apiKeys]);
  
  const [currentStep, setCurrentStep] = useState<'topic' | 'ai' | 'personality'>('topic');
  const [selectedAIs, setSelectedAIs] = useState<AIConfig[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>(preservedTopic || '');
  const [customTopic, setCustomTopic] = useState(preservedTopicMode === 'custom' ? (preservedTopic || '') : '');
  const [topicMode, setTopicMode] = useState<'preset' | 'custom' | 'surprise'>(preservedTopicMode || 'preset');
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(selectedModelsFromStore || {});
  
  // Debate mode always requires exactly 2 AIs
  const maxAIs = 2;
  
  // Check validation on mount
  useEffect(() => {
    if (!validation.isReady) {
      validation.checkReadiness();
    }
  }, [validation]);
  
  // Save topic when navigating away
  useEffect(() => {
    return () => {
      const currentTopic = topicMode === 'custom' ? customTopic : selectedTopic;
      const preserveMode = topicMode === 'surprise' ? 'preset' : topicMode;
      if (currentTopic) {
        dispatch(preserveTopic({ topic: currentTopic, mode: preserveMode }));
      }
    };
  }, [selectedTopic, customTopic, topicMode, dispatch]);
  
  // Clear preserved topic when debate starts
  const clearPreservedData = () => {
    dispatch(clearPreservedTopic());
  };
  
  const handleToggleAI = (ai: AIConfig) => {
    setSelectedAIs(prev => {
      const isSelected = prev.some(s => s.id === ai.id);
      if (isSelected) {
        return prev.filter(s => s.id !== ai.id);
      } else if (prev.length < maxAIs) {
        return [...prev, ai];
      }
      return prev;
    });
  };
  
  const handlePersonalityChange = (aiId: string, personalityId: string) => {
    dispatch(setAIPersonality({ aiId, personalityId }));
  };
  
  const handleModelChange = (aiId: string, modelId: string) => {
    dispatch(setAIModel({ aiId, modelId }));
    setSelectedModels(prev => ({
      ...prev,
      [aiId]: modelId
    }));
  };
  
  const handleStartDebate = () => {
    if (selectedAIs.length < 2) {
      Alert.alert('Select More AIs', 'You need at least 2 AIs for a debate!');
      return;
    }
    
    const finalTopic = topicMode === 'custom' ? customTopic : selectedTopic;
    if (!finalTopic) {
      Alert.alert('Select a Topic', 'Please choose a debate topic first!');
      return;
    }
    
    // Update AIs with selected models
    const aiConfigsWithModels = selectedAIs.map(ai => ({
      ...ai,
      model: selectedModels[ai.id] || ai.model,
    }));
    
    // Clear preserved topic since we're starting the debate
    clearPreservedData();
    
    navigation.navigate('Debate', { 
      selectedAIs: aiConfigsWithModels,
      topic: finalTopic,
      personalities: aiPersonalities,
    });
  };
  
  const selectRandomTopic = () => {
    const randomIndex = Math.floor(Math.random() * DEBATE_TOPICS.length);
    const randomTopic = DEBATE_TOPICS[randomIndex];
    setSelectedTopic(randomTopic);
    setCustomTopic('');
    setTopicMode('surprise');
    // Auto-scroll to show the selected topic
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 300, animated: true });
    }, 100);
  };
  
  const handleTopicModeChange = (mode: 'preset' | 'custom' | 'surprise') => {
    // Check if user can use custom topics
    if (mode === 'custom' && !hasFeatureAccess('customDebateTopics')) {
      Alert.alert(
        'Premium Feature',
        getPremiumUpsellMessage('customDebateTopics'),
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Upgrade', 
            onPress: () => dispatch(setAuthModalVisible(true))
          }
        ]
      );
      return;
    }
    
    setTopicMode(mode);
    // Auto-scroll to show the content when mode changes
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 300, animated: true });
    }, 100);
  };
  
  const handleTopicNext = () => {
    const finalTopic = topicMode === 'custom' ? customTopic : selectedTopic;
    if (!finalTopic) {
      Alert.alert('Select a Topic', 'Please choose or enter a debate topic first!');
      return;
    }
    setCurrentStep('ai');
  };
  
  const handleAINext = () => {
    if (selectedAIs.length < 2) {
      Alert.alert('Select 2 AIs', 'Please select exactly 2 AIs for the debate!');
      return;
    }
    if (isPremium) {
      setCurrentStep('personality');
    } else {
      handleStartDebate();
    }
  };
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'left', 'right']}>
      <Header
        variant="gradient"
        title="Debate Arena"
        subtitle="Choose Your Combatants"
        showTime={true}
        showDate={true}
        animated={true}
      />
      
      {/* Stats Button */}
      <Box style={{ 
        position: 'absolute', 
        top: 60, 
        right: 16,
        zIndex: 10,
      }}>
        <Button
          title="📊 Stats"
          onPress={() => navigation.navigate('Stats')}
          variant="secondary"
          size="small"
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 20,
            backgroundColor: theme.colors.surface,
          }}
        />
      </Box>
      
      <ScrollView 
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ 
          padding: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Step Indicator */}
        <DebateStepIndicator
          currentStep={currentStep}
          completedSteps={currentStep === 'ai' ? ['topic'] : currentStep === 'personality' ? ['topic', 'ai'] : []}
          isPremium={isPremium}
        />

        {/* Step 1: Topic Selection */}
        {currentStep === 'topic' && (
          <DebateTopicSelector
            selectedTopic={selectedTopic}
            customTopic={customTopic}
            topicMode={topicMode}
            onTopicSelect={setSelectedTopic}
            onCustomTopicChange={setCustomTopic}
            onTopicModeChange={handleTopicModeChange}
            onNext={handleTopicNext}
            onSurpriseMe={selectRandomTopic}
          />
        )}
        
        {/* Step 2: AI Selection */}
        {currentStep === 'ai' && (
          <DebateAISelector
            selectedTopic={selectedTopic}
            customTopic={customTopic}
            topicMode={topicMode}
            configuredAIs={configuredAIs}
            selectedAIs={selectedAIs}
            maxAIs={maxAIs}
            isPremium={isPremium}
            aiPersonalities={aiPersonalities}
            selectedModels={selectedModels}
            onToggleAI={handleToggleAI}
            onPersonalityChange={handlePersonalityChange}
            onModelChange={handleModelChange}
            onAddAI={() => navigation.navigate('APIConfig')}
            onNext={handleAINext}
            onBack={() => setCurrentStep('topic')}
          />
        )}
        
        {/* Step 3: Personality Selection (Premium Only) */}
        {currentStep === 'personality' && isPremium && (
          <DebatePersonalitySelector
            selectedTopic={selectedTopic}
            customTopic={customTopic}
            topicMode={topicMode}
            selectedAIs={selectedAIs}
            aiPersonalities={aiPersonalities}
            onPersonalityChange={handlePersonalityChange}
            onStartDebate={handleStartDebate}
            onBack={() => setCurrentStep('ai')}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default DebateSetupScreen;