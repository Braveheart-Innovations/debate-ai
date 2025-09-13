/**
 * Hook for comprehensive debate setup validation
 * Validates all aspects of debate configuration
 */

import { useMemo } from 'react';
import { 
  ValidationResult, 
  AIDebater, 
  Personality, 
  UseDebateValidationReturn 
} from '../../types/debate';
import { TopicService } from '../../services/debate/TopicService';
import { DebaterSelectionService } from '../../services/debate/DebaterSelectionService';
import { PersonalityService } from '../../services/debate/PersonalityService';

export const useDebateValidation = (
  topic: string,
  selectedAIs: AIDebater[],
  personalities: Map<string, Personality>
): UseDebateValidationReturn => {
  
  // Validate topic
  const validateTopic = (topicToValidate: string): ValidationResult => {
    if (!topicToValidate || topicToValidate.trim().length === 0) {
      return {
        isValid: false,
        message: 'Motion is required',
        errors: ['Please select or enter a debate motion'],
        warnings: [],
      };
    }

    return TopicService.validateCustomTopic(topicToValidate);
  };

  // Validate AI selection
  const validateAISelection = (ais: AIDebater[]): ValidationResult => {
    return DebaterSelectionService.validateSelection(ais);
  };

  // Validate personalities
  const validatePersonalities = (personalityMap: Map<string, Personality>): ValidationResult => {
    return PersonalityService.validatePersonalitySelection(personalityMap);
  };

  // Individual validation results
  const topicValidation = useMemo(() => {
    return validateTopic(topic);
  }, [topic]);

  const aiValidation = useMemo(() => {
    return validateAISelection(selectedAIs);
  }, [selectedAIs]);

  const personalityValidation = useMemo(() => {
    return validatePersonalities(personalities);
  }, [personalities]);

  // Overall validation
  const overallValidation = useMemo((): ValidationResult => {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // Collect all errors and warnings
    if (!topicValidation.isValid) {
      allErrors.push(...topicValidation.errors);
    }
    allWarnings.push(...topicValidation.warnings);

    if (!aiValidation.isValid) {
      allErrors.push(...aiValidation.errors);
    }
    allWarnings.push(...aiValidation.warnings);

    if (!personalityValidation.isValid) {
      allErrors.push(...personalityValidation.errors);
    }
    allWarnings.push(...personalityValidation.warnings);

    // Cross-validation checks
    if (selectedAIs.length !== personalities.size) {
      allWarnings.push('Not all selected AIs have personality assignments');
    }

    // Check for provider diversity
    const providers = new Set(selectedAIs.map(ai => ai.provider));
    if (providers.size === 1 && selectedAIs.length > 1) {
      allWarnings.push('Consider selecting AIs from different providers for more diverse perspectives');
    }

    // Check topic-AI alignment
    if (topic && selectedAIs.length > 0) {
      const category = TopicService.getTopicCategory(topic);
      if (category === 'Philosophy' || category === 'Science') {
        const hasAnalyticalAI = selectedAIs.some(ai => 
          ai.strengthAreas?.includes('analysis') || 
          ai.strengthAreas?.includes('reasoning')
        );
        if (!hasAnalyticalAI) {
          allWarnings.push('Consider including an analytical AI for complex topics');
        }
      }
    }

    const isValid = allErrors.length === 0;
    const mainMessage = isValid 
      ? 'Debate configuration is valid'
      : allErrors[0];

    return {
      isValid,
      message: mainMessage,
      errors: allErrors,
      warnings: allWarnings,
    };
  }, [topicValidation, aiValidation, personalityValidation, selectedAIs, personalities, topic]);

  // Can start debate check
  const canStartDebate = useMemo(() => {
    return overallValidation.isValid && 
           selectedAIs.length >= 2 && 
           topic.trim().length > 0;
  }, [overallValidation.isValid, selectedAIs.length, topic]);

  // Validation errors for display
  const validationErrors = useMemo(() => {
    return overallValidation.errors;
  }, [overallValidation.errors]);

  // Get validation summary for UI
  const getValidationSummary = () => {
    return {
      topic: {
        isValid: topicValidation.isValid,
        errors: topicValidation.errors,
        warnings: topicValidation.warnings,
      },
      aiSelection: {
        isValid: aiValidation.isValid,
        errors: aiValidation.errors,
        warnings: aiValidation.warnings,
      },
      personalities: {
        isValid: personalityValidation.isValid,
        errors: personalityValidation.errors,
        warnings: personalityValidation.warnings,
      },
      overall: {
        isValid: overallValidation.isValid,
        errors: overallValidation.errors,
        warnings: overallValidation.warnings,
      },
      canProceed: canStartDebate,
      nextAction: getNextAction(),
    };
  };

  // Get next required action
  const getNextAction = (): string | null => {
    if (!topicValidation.isValid) {
      return 'Select or enter a valid debate motion';
    }
    
    if (!aiValidation.isValid) {
      if (selectedAIs.length < 2) {
        return 'Select at least 2 AI debaters';
      }
      return 'Fix AI selection issues';
    }
    
    if (selectedAIs.length !== personalities.size) {
      return 'Assign personalities to all selected AIs';
    }
    
    if (!personalityValidation.isValid) {
      return 'Fix personality selection issues';
    }
    
    if (!canStartDebate) {
      return 'Complete the debate setup';
    }
    
    return null; // Ready to start
  };

  // Check if specific step is valid
  const isStepValid = (step: string): boolean => {
    switch (step) {
      case 'topic':
        return topicValidation.isValid;
      case 'ai':
        return aiValidation.isValid;
      case 'personality':
        return personalityValidation.isValid;
      case 'review':
        return overallValidation.isValid;
      default:
        return false;
    }
  };

  return {
    validateTopic,
    validateAISelection,
    validatePersonalities,
    canStartDebate,
    validationErrors,
    overallValidation,
    topicValidation,
    aiValidation,
    personalityValidation,
    getValidationSummary,
    getNextAction,
    isStepValid,
  };
};
