import { AIConfig } from '../../types';
import { generateSimpleSessionId } from '../../utils/home/sessionIdGenerator';
import { HOME_CONSTANTS } from '../../config/homeConstants';

/**
 * Session management service for handling session creation, validation, and lifecycle.
 * Encapsulates all business logic related to AI chat sessions.
 */
export class SessionService {
  /**
   * Creates a new session with the provided AIs, personalities, and models.
   * 
   * @param selectedAIs - Array of AI configurations for the session
   * @param aiPersonalities - Mapping of AI IDs to personality IDs
   * @param selectedModels - Mapping of AI IDs to model IDs
   * @returns Session data object
   */
  static createSession(
    selectedAIs: AIConfig[], 
    aiPersonalities: Record<string, string>,
    selectedModels?: Record<string, string>
  ) {
    this.validateSessionAIs(selectedAIs);
    
    return {
      selectedAIs,
      aiPersonalities,
      selectedModels: selectedModels || {},
      sessionId: generateSimpleSessionId(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a new unique session ID.
   * 
   * @returns New session ID string
   */
  static generateSessionId(): string {
    return generateSimpleSessionId();
  }

  /**
   * Validates that the session has the required AIs for creation.
   * 
   * @param selectedAIs - Array of AI configurations to validate
   * @throws Error if validation fails
   */
  static validateSessionAIs(selectedAIs: AIConfig[]): void {
    if (!selectedAIs || selectedAIs.length < HOME_CONSTANTS.MIN_AIS_FOR_CHAT) {
      throw new Error(`At least ${HOME_CONSTANTS.MIN_AIS_FOR_CHAT} AI must be selected to start a session`);
    }

    // Validate each AI has required fields
    selectedAIs.forEach((ai, index) => {
      if (!ai.id || !ai.provider || !ai.name) {
        throw new Error(`AI at index ${index} is missing required fields (id, provider, name)`);
      }
    });
  }

  /**
   * Prepares session data for Redux dispatch.
   * 
   * @param selectedAIs - Array of AI configurations
   * @param aiPersonalities - Mapping of AI IDs to personality IDs
   * @param selectedModels - Mapping of AI IDs to model IDs
   * @returns Session data formatted for Redux action
   */
  static prepareSessionData(
    selectedAIs: AIConfig[], 
    aiPersonalities: Record<string, string>,
    selectedModels?: Record<string, string>
  ) {
    return {
      selectedAIs,
      aiPersonalities,
      selectedModels: selectedModels || {},
    };
  }

  /**
   * Validates session configuration before creation.
   * 
   * @param selectedAIs - Array of AI configurations
   * @param aiPersonalities - Mapping of AI IDs to personality IDs
   * @returns True if session is valid, false otherwise
   */
  static validateSessionConfiguration(
    selectedAIs: AIConfig[], 
    aiPersonalities: Record<string, string>
  ): boolean {
    try {
      this.validateSessionAIs(selectedAIs);
      
      // Validate personalities mapping
      const hasValidPersonalities = selectedAIs.every(ai => {
        const personality = aiPersonalities[ai.id];
        return personality && typeof personality === 'string';
      });

      return hasValidPersonalities;
    } catch {
      return false;
    }
  }

  /**
   * Calculates session limits based on premium status.
   * 
   * @param isPremium - Whether the user has premium access
   * @param totalAvailableAIs - Total number of configured AIs
   * @returns Maximum number of AIs allowed in a session
   */
  static calculateSessionLimits(totalAvailableAIs: number): number {
    const maxSelectable = HOME_CONSTANTS.MAX_AIS_FOR_CHAT;
    return Math.min(maxSelectable, totalAvailableAIs);
  }
}
