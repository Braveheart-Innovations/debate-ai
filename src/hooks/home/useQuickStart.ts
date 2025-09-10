import { useState, useMemo } from 'react';
import type { QuickStartTopic } from '@/components/organisms';
import { QuickStartService } from '../../services/home/QuickStartService';

/**
 * Custom hook for managing Quick Start functionality.
 * Handles topic selection, wizard state, and prompt processing.
 */
export const useQuickStart = () => {
  const [selectedTopic, setSelectedTopic] = useState<QuickStartTopic | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Get all available topics
  const topics = useMemo(() => {
    return QuickStartService.getTopics();
  }, []);

  /**
   * Handles topic selection and opens the wizard.
   * 
   * @param topic - Selected Quick Start topic
   */
  const selectTopic = (topic: QuickStartTopic) => {
    if (QuickStartService.validateTopicSelection(topic)) {
      setSelectedTopic(topic);
      setShowWizard(true);
    }
  };

  /**
   * Closes the prompt wizard and clears selection.
   */
  const closeWizard = () => {
    setShowWizard(false);
    setSelectedTopic(null);
  };

  /**
   * Validates wizard completion data.
   * 
   * @param userPrompt - User's original prompt
   * @param enrichedPrompt - AI-enriched prompt
   * @returns True if completion data is valid
   */
  const validateCompletion = (userPrompt: string, enrichedPrompt: string): boolean => {
    return QuickStartService.validateWizardCompletion(userPrompt, enrichedPrompt);
  };

  /**
   * Prepares prompt data for the wizard.
   * 
   * @param topic - Selected topic
   * @param userInput - Optional user input
   * @returns Prepared prompt data
   */
  const preparePromptData = (topic: QuickStartTopic, userInput?: string) => {
    return QuickStartService.preparePromptData(topic, userInput);
  };

  /**
   * Enriches a user prompt with topic context.
   * 
   * @param userPrompt - User's original prompt
   * @returns Enriched prompt with topic context
   */
  const enrichPrompt = (userPrompt: string): string => {
    if (!selectedTopic) {
      return userPrompt;
    }
    
    return QuickStartService.enrichPromptForTopic(selectedTopic.id, userPrompt);
  };

  /**
   * Checks if Quick Start is available based on AI selection.
   * 
   * @param selectedAICount - Number of selected AIs
   * @returns True if Quick Start can be used
   */
  const isAvailable = (selectedAICount: number): boolean => {
    return QuickStartService.isQuickStartAvailable(selectedAICount);
  };

  /**
   * Gets a topic by its ID.
   * 
   * @param topicId - ID of the topic to find
   * @returns Topic if found, null otherwise
   */
  const getTopicById = (topicId: string): QuickStartTopic | null => {
    return QuickStartService.getTopicById(topicId);
  };

  /**
   * Searches topics by a search term.
   * 
   * @param searchTerm - Term to search for
   * @returns Array of matching topics
   */
  const searchTopics = (searchTerm: string): QuickStartTopic[] => {
    return QuickStartService.searchTopics(searchTerm);
  };

  /**
   * Gets the current topic's prompt.
   * 
   * @returns Topic prompt string, or empty string if no topic selected
   */
  const getCurrentTopicPrompt = (): string => {
    if (!selectedTopic) {
      return '';
    }
    
    return QuickStartService.getTopicPrompt(selectedTopic.id);
  };

  /**
   * Resets the Quick Start state.
   */
  const reset = () => {
    setSelectedTopic(null);
    setShowWizard(false);
  };

  /**
   * Gets Quick Start status information.
   * 
   * @returns Object with Quick Start status details
   */
  const getStatus = () => {
    return {
      hasSelectedTopic: !!selectedTopic,
      wizardVisible: showWizard,
      topicCount: QuickStartService.getTopicCount(),
      selectedTopicId: selectedTopic?.id || null,
    };
  };

  return {
    // State
    selectedTopic,
    showWizard,
    topics,
    
    // Actions
    selectTopic,
    closeWizard,
    reset,
    
    // Validation
    validateCompletion,
    isAvailable,
    
    // Prompt Handling
    enrichPrompt,
    preparePromptData,
    getCurrentTopicPrompt,
    
    // Data Access
    getTopicById,
    searchTopics,
    getStatus,
    
    // Computed Properties
    hasSelectedTopic: !!selectedTopic,
    topicCount: topics.length,
  };
};
