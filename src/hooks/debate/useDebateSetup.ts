/**
 * Main orchestration hook for debate setup
 * Combines all debate setup functionality
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { 
  DebateConfig,
  UseDebateSetupReturn,
  DebateSetupUIState,
  AIDebater,
  Personality,
} from '../../types/debate';
import { TopicMode } from '../../config/debate/debateSetupConfig';
import { RootState } from '../../store';
import { useDebateSteps } from './useDebateSteps';
import { useAIDebaterSelection } from './useAIDebaterSelection';
import { useDebateTopic } from './useDebateTopic';
import { usePersonalitySelection } from './usePersonalitySelection';
import { useDebateValidation } from './useDebateValidation';
import { DebateSetupService } from '../../services/debate/DebateSetupService';
import { DebaterSelectionService } from '../../services/debate/DebaterSelectionService';

interface NavigationProp {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
}

export const useDebateSetup = (
  navigation: NavigationProp,
  isPremium: boolean = false
): UseDebateSetupReturn => {
  // Redux state
  const preservedTopic = useSelector((state: RootState) => state.debateStats?.preservedTopic);
  const preservedTopicMode = useSelector((state: RootState) => state.debateStats?.preservedTopicMode);
  
  // Initialize hooks
  const stepManagement = useDebateSteps('topic');
  
  const topicManagement = useDebateTopic(
    preservedTopic || '',
    (preservedTopicMode as TopicMode) || 'preset'
  );
  
  const aiSelection = useAIDebaterSelection([], 2);
  
  const personalitySelection = usePersonalitySelection(
    aiSelection.selectedAIs
  );
  
  const validation = useDebateValidation(
    topicManagement.currentTopic,
    aiSelection.selectedAIs,
    personalitySelection.selectedPersonalities
  );

  // UI State
  const state: DebateSetupUIState = useMemo(() => ({
    isLoading: false,
    error: undefined,
    selectedAIs: aiSelection.selectedAIs,
    topicSelection: {
      selectedTopic: topicManagement.selectedTopic,
      topicMode: topicManagement.topicMode,
      customTopic: topicManagement.customTopic,
      suggestedTopics: topicManagement.suggestedTopics,
    },
    personalitySelections: personalitySelection.selectedPersonalities,
    currentStep: stepManagement.currentStep,
    canProceed: validation.canStartDebate,
    validationState: {
      topic: validation.topicValidation,
      aiSelection: validation.aiValidation,
      personalities: validation.personalityValidation,
      overall: validation.overallValidation,
    },
  }), [
    aiSelection.selectedAIs,
    topicManagement,
    personalitySelection.selectedPersonalities,
    stepManagement.currentStep,
    validation,
  ]);

  // Actions
  const actions = useMemo(() => ({
    // Step management
    setCurrentStep: stepManagement.goToStep,
    nextStep: () => {
      // Validate current step before proceeding
      const currentStepValid = validation.isStepValid(stepManagement.currentStep);
      if (currentStepValid) {
        stepManagement.markStepCompleted(stepManagement.currentStep);
        stepManagement.nextStep();
      }
    },
    previousStep: stepManagement.previousStep,
    resetSetup: () => {
      stepManagement.resetSteps();
      topicManagement.resetTopic();
      aiSelection.clearSelection();
      personalitySelection.resetPersonalities();
    },
    
    // Topic management
    updateTopic: (topic: string, mode: TopicMode) => {
      if (mode === 'custom') {
        topicManagement.setCustomTopic(topic);
      } else {
        topicManagement.selectSuggestedTopic(topic);
      }
      topicManagement.setTopicMode(mode);
    },
    
    // AI management
    toggleAI: (ai: AIDebater) => {
      // Convert AIConfig to AIDebater if needed
      const debater = DebaterSelectionService.convertToDebater(ai);
      aiSelection.toggleAI(debater);
    },
    
    // Personality management
    setPersonality: (aiId: string, personality: Personality) => {
      personalitySelection.setPersonality(aiId, personality);
    },
    
    // Debate start
    startDebate: async () => {
      if (!validation.canStartDebate) {
        throw new Error('Cannot start debate: ' + validation.getNextAction());
      }

      // Create debate configuration
      const config: DebateConfig = {
        topic: topicManagement.currentTopic,
        topicMode: topicManagement.topicMode,
        debaters: aiSelection.selectedAIs,
        personalities: personalitySelection.selectedPersonalities,
        settings: {
          maxRounds: 3,
          turnDuration: 120,
          allowInterruptions: false,
          moderationLevel: 'light',
          isPremium,
        },
        createdAt: Date.now(),
        estimatedDuration: DebateSetupService.calculateEstimatedDuration(
          topicManagement.currentTopic,
          aiSelection.selectedAIs
        ),
      };

      // Validate final configuration
      const configValidation = DebateSetupService.validateDebateConfiguration(config);
      if (!configValidation.isValid) {
        throw new Error('Invalid configuration: ' + configValidation.errors.join(', '));
      }

      // Navigate to debate screen
      navigation.navigate('Debate', {
        selectedAIs: aiSelection.selectedAIs,
        topic: topicManagement.currentTopic,
        personalities: Object.fromEntries(personalitySelection.selectedPersonalities),
      });
    },
  }), [
    stepManagement,
    topicManagement,
    aiSelection,
    personalitySelection,
    validation,
    isPremium,
    navigation,
  ]);

  // Helper functions
  const getConfigurationSummary = useCallback(() => {
    const config: Partial<DebateConfig> = {
      topic: topicManagement.currentTopic,
      topicMode: topicManagement.topicMode,
      debaters: aiSelection.selectedAIs,
      personalities: personalitySelection.selectedPersonalities,
    };

    return DebateSetupService.previewDebate(config);
  }, [topicManagement, aiSelection.selectedAIs, personalitySelection.selectedPersonalities]);

  const getEstimatedDuration = useCallback(() => {
    if (!topicManagement.currentTopic || aiSelection.selectedAIs.length === 0) {
      return 0;
    }
    
    return DebateSetupService.calculateEstimatedDuration(
      topicManagement.currentTopic,
      aiSelection.selectedAIs
    );
  }, [topicManagement.currentTopic, aiSelection.selectedAIs]);

  // Extended return with additional utilities
  return {
    state,
    actions,
    validation: state.validationState,
    canProceed: state.canProceed,
    
    // Individual hook access for advanced usage
    steps: stepManagement,
    topic: topicManagement,
    aiSelection,
    personalities: personalitySelection,
    
    // Utilities
    getConfigurationSummary,
    getEstimatedDuration,
  };
};
