import type { QuickStartTopic } from '@/components/organisms';
import { QUICK_START_TOPICS, TOPIC_PROMPTS } from '../../config/quickStartTopics';
import { HOME_CONSTANTS } from '../../config/homeConstants';

/**
 * Service for managing Quick Start topics, validation, and prompt enrichment.
 * Handles all business logic related to Quick Start conversation starters.
 */
export class QuickStartService {
  /**
   * Gets all available Quick Start topics.
   * 
   * @returns Array of Quick Start topics
   */
  static getTopics(): QuickStartTopic[] {
    return QUICK_START_TOPICS;
  }

  /**
   * Validates a Quick Start topic selection.
   * 
   * @param topic - The topic to validate
   * @returns True if topic is valid, false otherwise
   */
  static validateTopicSelection(topic: QuickStartTopic | null): boolean {
    if (!topic) {
      return false;
    }

    const validTopic = QUICK_START_TOPICS.find(t => t.id === topic.id);
    if (!validTopic) {
      return false;
    }

    return this.validateTopicStructure(topic);
  }

  /**
   * Validates the structure of a Quick Start topic.
   * 
   * @param topic - Topic to validate
   * @returns True if structure is valid, false otherwise
   */
  static validateTopicStructure(topic: QuickStartTopic): boolean {
    const { MIN_TITLE_LENGTH, MAX_TITLE_LENGTH, MIN_SUBTITLE_LENGTH, MAX_SUBTITLE_LENGTH } = 
      HOME_CONSTANTS.QUICK_START_VALIDATION;

    if (!topic.id || !topic.title || !topic.subtitle || !topic.emoji) {
      return false;
    }

    if (topic.title.length < MIN_TITLE_LENGTH || topic.title.length > MAX_TITLE_LENGTH) {
      return false;
    }

    if (topic.subtitle.length < MIN_SUBTITLE_LENGTH || topic.subtitle.length > MAX_SUBTITLE_LENGTH) {
      return false;
    }

    return true;
  }

  /**
   * Gets the enrichment prompt for a specific topic.
   * 
   * @param topicId - ID of the topic
   * @returns Enrichment prompt string, or default prompt if not found
   */
  static getTopicPrompt(topicId: string): string {
    return TOPIC_PROMPTS[topicId] || "Let's have a conversation about this topic.";
  }

  /**
   * Prepares prompt data for the PromptWizard.
   * 
   * @param topic - Selected Quick Start topic
   * @param userInput - User's custom input (optional)
   * @returns Prepared prompt data object
   */
  static preparePromptData(topic: QuickStartTopic, userInput?: string) {
    const basePrompt = this.getTopicPrompt(topic.id);
    
    return {
      topicId: topic.id,
      topicTitle: topic.title,
      basePrompt,
      userInput: userInput || '',
      enrichedPrompt: userInput ? `${basePrompt} ${userInput}` : basePrompt,
    };
  }

  /**
   * Enriches a user prompt with topic-specific context.
   * 
   * @param topicId - ID of the selected topic
   * @param userPrompt - User's prompt
   * @returns Enriched prompt with topic context
   */
  static enrichPromptForTopic(topicId: string, userPrompt: string): string {
    const topicPrompt = this.getTopicPrompt(topicId);
    
    if (!userPrompt.trim()) {
      return topicPrompt;
    }

    return `${topicPrompt} Specifically: ${userPrompt}`;
  }

  /**
   * Checks if Quick Start is available based on AI selection.
   * 
   * @param selectedAICount - Number of currently selected AIs
   * @returns True if Quick Start can be used, false otherwise
   */
  static isQuickStartAvailable(selectedAICount: number): boolean {
    return selectedAICount >= HOME_CONSTANTS.MIN_AIS_FOR_CHAT;
  }

  /**
   * Gets a topic by its ID.
   * 
   * @param topicId - ID of the topic to find
   * @returns Topic object if found, null otherwise
   */
  static getTopicById(topicId: string): QuickStartTopic | null {
    return QUICK_START_TOPICS.find(topic => topic.id === topicId) || null;
  }

  /**
   * Gets topics filtered by a search term.
   * 
   * @param searchTerm - Term to search for in titles and subtitles
   * @returns Array of matching topics
   */
  static searchTopics(searchTerm: string): QuickStartTopic[] {
    if (!searchTerm.trim()) {
      return QUICK_START_TOPICS;
    }

    const normalizedSearch = searchTerm.toLowerCase();
    
    return QUICK_START_TOPICS.filter(topic => 
      topic.title.toLowerCase().includes(normalizedSearch) ||
      topic.subtitle.toLowerCase().includes(normalizedSearch)
    );
  }

  /**
   * Gets the count of available topics.
   * 
   * @returns Number of available Quick Start topics
   */
  static getTopicCount(): number {
    return QUICK_START_TOPICS.length;
  }

  /**
   * Validates wizard completion data.
   * 
   * @param userPrompt - User's original prompt
   * @param enrichedPrompt - Enriched prompt for AI
   * @returns True if data is valid for navigation, false otherwise
   */
  static validateWizardCompletion(userPrompt: string, enrichedPrompt: string): boolean {
    return userPrompt.trim().length > 0 && enrichedPrompt.trim().length > 0;
  }
}
