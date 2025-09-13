import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setAIPersonality, setAIModel, preserveTopic, clearPreservedTopic, setGlobalStreaming, setStreamingSpeed } from '../store';
import { setProviderStreamingPreference } from '../store/streamingSlice';

import { Box } from '../components/atoms';
import { Button, Typography, GradientButton } from '../components/molecules';
import { Header, HeaderActions } from '../components/organisms';
// Legacy premium gating replaced by useFeatureAccess
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import {
  DebateTopicSelector,
  DebateAISelector,
  DebatePersonalitySelector,
  DebateStepIndicator,
} from '../components/organisms/debate';

import { useTheme } from '../theme';
import { AIConfig } from '../types';
import { AI_PROVIDERS } from '../config/aiProviders';
import { FormatModal } from '../components/organisms/debate/FormatModal';
import { TopicService } from '../services/debate/TopicService';
import { AI_MODELS } from '../config/modelConfigs';
import { getAIProviderIcon } from '../utils/aiProviderAssets';
// import { DEBATE_TOPICS } from '../constants/debateTopics';
import { usePreDebateValidation } from '../hooks/debate';
import { Card } from '@/components/molecules';
import { FORMATS } from '../config/debate/formats';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';

interface DebateSetupScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  route?: {
    params?: {
      preselectedAIs?: AIConfig[];
      prefilledTopic?: string;
    };
  };
}

const DebateSetupScreen: React.FC<DebateSetupScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const scrollViewRef = useRef<ScrollView>(null);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const expertMode = useSelector((state: RootState) => state.settings.expertMode || {});
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const selectedModelsFromStore = useSelector((state: RootState) => state.chat.selectedModels);
  const preservedTopic = useSelector((state: RootState) => state.debateStats.preservedTopic);
  const preservedTopicMode = useSelector((state: RootState) => state.debateStats.preservedTopicMode);
  const access = useFeatureAccess();
  const streamingState = useSelector((state: RootState) => state.streaming);
  
  // Pre-debate validation
  const validation = usePreDebateValidation(navigation);
  
  // Get configured AIs based on which ones have API keys
  const configuredAIs = useMemo(() => {
    return AI_PROVIDERS
      .filter(provider => provider.enabled && apiKeys[provider.id as keyof typeof apiKeys])
      .map(provider => {
        const iconData = getAIProviderIcon(provider.id);
        const providerDefault = AI_MODELS[provider.id]?.find(m => m.isDefault)?.id || AI_MODELS[provider.id]?.[0]?.id || '';
        const expertCfg = (expertMode as Record<string, { enabled?: boolean; selectedModel?: string }>)[provider.id];
        const defaultModel = expertCfg?.enabled && expertCfg.selectedModel ? expertCfg.selectedModel : providerDefault;
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
  }, [apiKeys, expertMode]);
  
  const [currentStep, setCurrentStep] = useState<'topic' | 'ai' | 'personality'>('topic');
  const [selectedAIs, setSelectedAIs] = useState<AIConfig[]>(route?.params?.preselectedAIs || []);
  const [selectedTopic, setSelectedTopic] = useState<string>(route?.params?.prefilledTopic || preservedTopic || '');
  const [customTopic, setCustomTopic] = useState(
    route?.params?.prefilledTopic || (preservedTopicMode === 'custom' ? (preservedTopic || '') : '')
  );
  const [topicMode, setTopicMode] = useState<'preset' | 'custom' | 'surprise'>(preservedTopicMode || 'preset');
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>(selectedModelsFromStore || {});
  // New configuration toggles
  const [formatId, setFormatId] = useState<'oxford' | 'lincoln_douglas' | 'policy' | 'socratic'>('oxford');
  const [exchanges, setExchanges] = useState<number>(3);
  // Removed: category/preset inline picker (using DebateTopicSelector instead)
  const [civility, setCivility] = useState<1|2|3|4|5>(1);
  const [formatModalVisible, setFormatModalVisible] = useState(false);
  // Removed category UI for now to prioritize proven UX
  
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
      Alert.alert('Select a Motion', 'Please choose a debate motion first!');
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
      formatId,
      rounds: exchanges,
      civility,
    });
  };
  
  // Deprecated: selectRandomTopic (superseded by inline Surprise Me handler)
  
  const handleTopicModeChange = (mode: 'preset' | 'custom' | 'surprise') => {
    // No gating: allow custom topics for all users
    setTopicMode(mode);
    // Auto-scroll to show the content when mode changes
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 300, animated: true });
    }, 100);
  };
  
  const handleTopicNext = () => {
    const finalTopic = topicMode === 'custom' ? customTopic : selectedTopic;
    if (!finalTopic) {
      Alert.alert('Select a Motion', 'Please choose or enter a debate motion first!');
      return;
    }
    setCurrentStep('ai');
  };
  
  const handleAINext = () => {
    if (selectedAIs.length < 2) {
      Alert.alert('Select 2 AIs', 'Please select exactly 2 AIs for the debate!');
      return;
    }
    // Always allow personality selection (restriction removed)
    setCurrentStep('personality');
  };
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={['top', 'left', 'right']}>
      <TrialBanner />
      <Header
        variant="gradient"
        title="Debate Arena"
        subtitle="Choose Your Combatants"
        showTime={true}
        showDate={true}
        animated={true}
        rightElement={<HeaderActions variant="gradient" />}
      />
      
      {/* Stats Button - positioned in lower right of header */}
      <Box style={{ 
        position: 'absolute', 
        top: 140,  // Position at bottom of gradient header
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
          isPremium={access.isPremium || access.isInTrial}
        />

        {/* Step 1: Format, Rounds, Topic (clean and minimal) */}
        {currentStep === 'topic' && (
          <>
            {/* Topic card first */}
            <Card shadow style={{ marginTop: theme.spacing.sm, marginBottom: theme.spacing.xl }}>
              <Box style={{ marginBottom: theme.spacing.md }}>
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 4 }}>
                  💭 Choose Your Motion
                </Typography>
                <Typography variant="caption" color="secondary">
                  Presets, custom input, or let fate decide
                </Typography>
              </Box>
              <DebateTopicSelector
                selectedTopic={selectedTopic}
                customTopic={customTopic}
                topicMode={topicMode}
                onTopicSelect={setSelectedTopic}
                onCustomTopicChange={setCustomTopic}
                onTopicModeChange={handleTopicModeChange}
                onSurpriseMe={() => {
                  const t = TopicService.generateRandomTopicString();
                  setSelectedTopic(t);
                  setTopicMode('surprise');
                }}
                showHeading={false}
                compact
              />
            </Card>

            {/* Debate Configuration card second */}
            <Card shadow style={{ marginBottom: theme.spacing.xl }}>
              {/* Header */}
              <Box style={{ marginBottom: theme.spacing.md }}>
                <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 4 }}>
                  ⚙️ Debate Configuration
                </Typography>
                <Typography variant="caption" color="secondary">
                  Choose format and rounds
                </Typography>
              </Box>

              {/* Format row */}
              <Box style={{ marginBottom: theme.spacing.md }}>
                <Box style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.xs }}>
                  <Typography variant="body" weight="semibold">Format</Typography>
                </Box>
                <Box style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Button
                    title={`${formatId === 'oxford' ? 'Oxford' : formatId === 'lincoln_douglas' ? 'Lincoln–Douglas' : formatId === 'policy' ? 'Policy' : 'Socratic'}`}
                    onPress={() => setFormatModalVisible(true)}
                    variant="tonal"
                    size="medium"
                    textAlign="left"
                    style={{ flex: 1 }}
                    rightIcon="chevron-down"
                  />
                </Box>
                <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
                  {FORMATS[formatId].description}
                </Typography>
              </Box>

              {/* Exchanges selector (3, 5, 7) */}
              <Box>
                <Typography variant="body" weight="semibold" style={{ marginBottom: theme.spacing.xs }}>Exchanges</Typography>
                <Box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[3,5,7].map((n) => (
                    <Button
                      key={n}
                      title={`${n}`}
                      onPress={() => setExchanges(n)}
                      variant={n === exchanges ? 'primary' : 'tonal'}
                      size="small"
                      style={{ minWidth: 56 }}
                    />
                  ))}
                </Box>
                {/* Help text showing debate phases for exchanges */}
                <Typography variant="caption" color="secondary" style={{ marginTop: 6 }}>
                  {exchanges === 3 && 'Opening Argument → Rebuttal → Closing Argument'}
                  {exchanges === 5 && 'Opening Argument → Rebuttal → Cross-examination → Counter → Closing'}
                  {exchanges === 7 && 'Opening → Rebuttal → Deep analysis → Cross-examination → Counter → Synthesis → Closing'}
                </Typography>
              </Box>
            </Card>

            {/* Bottom CTA: Next */}
            <Box style={{ marginTop: theme.spacing.md }}>
              <GradientButton
                title="Next: Choose Debaters →"
                onPress={handleTopicNext}
                disabled={!((topicMode === 'preset' && !!selectedTopic) || (topicMode === 'custom' && !!customTopic) || (topicMode === 'surprise' && !!selectedTopic))}
                gradient={theme.colors.gradients.primary}
                fullWidth
              />
            </Box>
          </>
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
            isPremium={access.isPremium || access.isInTrial}
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

        {/* Civility UI moved into DebatePersonalitySelector */}

        {/* Format modal */}
        <FormatModal visible={formatModalVisible} selected={formatId} onSelect={(id) => setFormatId(id)} onClose={() => setFormatModalVisible(false)} />
        
        {/* Streaming Settings (per-provider) */}
        {currentStep === 'ai' && selectedAIs.length > 0 && (
          <Box
            style={{
              marginTop: theme.spacing.lg,
              padding: theme.spacing.md,
              borderRadius: 12,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            {/* Global streaming toggle */}
            <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Button
                title={streamingState?.globalStreamingEnabled ? 'Streaming: On' : 'Streaming: Off'}
                onPress={() => dispatch(setGlobalStreaming(!(streamingState?.globalStreamingEnabled ?? true)))}
                variant={streamingState?.globalStreamingEnabled ? 'primary' : 'secondary'}
                size="small"
                style={{ alignSelf: 'flex-start' }}
              />
              <Button
                title={`Speed: ${((streamingState?.streamingSpeed || 'natural') as 'instant' | 'natural' | 'slow').replace(/^(\w)/, (m) => m.toUpperCase())}`}
                onPress={() => {
                  if (!streamingState?.globalStreamingEnabled) return;
                  const current = (streamingState?.streamingSpeed || 'natural') as 'instant' | 'natural' | 'slow';
                  const next = current === 'instant' ? 'natural' : current === 'natural' ? 'slow' : 'instant';
                  dispatch(setStreamingSpeed(next));
                }}
                variant={streamingState?.globalStreamingEnabled ? 'secondary' : 'ghost'}
                size="small"
                disabled={!streamingState?.globalStreamingEnabled}
              />
            </Box>
            {selectedAIs.map(ai => {
              const providerId = ai.id;
              const providerPref = streamingState?.streamingPreferences?.[providerId]?.enabled ?? true;
              const hasVerificationError = !!streamingState?.providerVerificationErrors?.[providerId];
              const willStream = (streamingState?.globalStreamingEnabled ?? true) && providerPref && !hasVerificationError;
              const statusText = hasVerificationError
                ? 'Won’t stream (verification required)'
                : willStream
                  ? 'Will stream'
                  : 'Won’t stream';
              return (
                <Box key={providerId} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                }}>
                  <Box>
                    <Button
                      title={`${ai.name}: ${statusText}`}
                      onPress={() => {}}
                      variant="ghost"
                      size="small"
                      disabled
                    />
                  </Box>
                  <Box>
                    <Button
                      title={providerPref ? 'Streaming On' : 'Streaming Off'}
                      onPress={() => dispatch(setProviderStreamingPreference({ providerId, enabled: !providerPref }))}
                      variant={providerPref ? 'secondary' : 'ghost'}
                      size="small"
                      disabled={!!hasVerificationError}
                    />
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
        
        {/* Step 3: Personality Selection */}
        {currentStep === 'personality' && (
          <DebatePersonalitySelector
            selectedTopic={selectedTopic}
            customTopic={customTopic}
            topicMode={topicMode}
            selectedAIs={selectedAIs}
            aiPersonalities={aiPersonalities}
            onPersonalityChange={handlePersonalityChange}
            onStartDebate={handleStartDebate}
            onBack={() => setCurrentStep('ai')}
            civility={civility}
            onChangeCivility={(v)=>setCivility(v)}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default DebateSetupScreen;
