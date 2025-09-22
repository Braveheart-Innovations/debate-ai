/**
 * Service for managing AI personalities in debates
 * Handles personality selection, validation, and application
 */

import { 
  PersonalityOption, 
  UNIVERSAL_PERSONALITIES, 
  getPersonality, 
  getDebatePrompt 
} from '../../config/personalities';
import { AIDebater, Personality, ValidationResult } from '../../types/debate';

export class PersonalityService {
  /**
   * Get default personality for an AI
   */
  static getDefaultPersonality(): Personality {
    const defaultPersonalityOption = UNIVERSAL_PERSONALITIES.find(p => p.id === 'default');
    
    if (!defaultPersonalityOption) {
      throw new Error('Default personality not found');
    }

    return PersonalityService.convertToPersonality(defaultPersonalityOption);
  }

  /**
   * Get available personalities based on premium status
   */
  static getAvailablePersonalities(_isPremium: boolean = true): Personality[] {
    return UNIVERSAL_PERSONALITIES.map(p => PersonalityService.convertToPersonality(p));
  }

  /**
   * Validate personality selections for all AIs
   */
  static validatePersonalitySelection(selections: Map<string, Personality>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if all personalities are valid
    for (const [aiId, personality] of selections.entries()) {
      if (!personality || !personality.id) {
        errors.push(`Invalid personality selection for AI: ${aiId}`);
        continue;
      }

      const personalityExists = UNIVERSAL_PERSONALITIES.some(p => p.id === personality.id);
      if (!personalityExists) {
        errors.push(`Unknown personality "${personality.id}" for AI: ${aiId}`);
      }
    }

    // Check for personality diversity (warning only)
    const personalityIds = Array.from(selections.values()).map(p => p.id);
    const uniquePersonalities = new Set(personalityIds);
    
    if (uniquePersonalities.size === 1 && personalityIds.length > 1) {
      warnings.push('Consider using different personalities for more diverse debate perspectives');
    }

    // Check for conflicting personalities (informational)
    if (PersonalityService.hasConflictingPersonalities(Array.from(selections.values()))) {
      warnings.push('Some personality combinations might create very intense debates');
    }

    return {
      isValid: errors.length === 0,
      message: errors.length > 0 ? errors[0] : undefined,
      errors,
      warnings,
    };
  }

  /**
   * Apply personality to debater configuration
   */
  static applyPersonalityToDebater(debater: AIDebater, personality: Personality): AIDebater {
    return {
      ...debater,
      personality: personality.id,
      debatingStyle: {
        ...debater.debatingStyle,
        ...PersonalityService.getDebatingStyleFromPersonality(personality),
      },
    };
  }

  /**
   * Get personality by ID
   */
  static getPersonalityById(id: string): Personality | null {
    const personalityOption = getPersonality(id);
    if (!personalityOption) {
      return null;
    }
    return PersonalityService.convertToPersonality(personalityOption);
  }

  /**
   * Get debate prompt for personality
   */
  static getDebatePromptForPersonality(personalityId: string): string {
    return getDebatePrompt(personalityId);
  }

  /**
   * Get recommended personality combinations
   */
  static getRecommendedCombinations(): {
    name: string;
    description: string;
    personalities: string[];
  }[] {
    return [];
  }

  /**
   * Get personality compatibility score
   */
  static getCompatibilityScore(personality1: Personality, personality2: Personality): number {
    // Base compatibility
    let score = 50;

    // Same personality = less interesting
    if (personality1.id === personality2.id) {
      score -= 30;
    }

    // Specific interesting combinations
    const combination = [personality1.id, personality2.id].sort().join('-');
    const bonusCombinations: string[] = [];

    if (bonusCombinations.includes(combination)) {
      score += 25;
    }

    if (personality1.id === personality2.id) {
      score -= 20;
    }

    return Math.min(100, Math.max(0, score));
  }

  // Private helper methods

  private static convertToPersonality(personalityOption: PersonalityOption): Personality {
    const tone = personalityOption.tone ?? { formality: 0.6, humor: 0.3, energy: 0.4, empathy: 0.6, technicality: 0.5 };
    const debateProfile = personalityOption.debateProfile ?? {
      argumentStyle: 'balanced' as const,
      aggression: 0.4,
      concession: 0.5,
      interruption: 0.3,
    };

    return {
      id: personalityOption.id,
      name: personalityOption.name,
      description: personalityOption.tagline || personalityOption.description,
      systemPrompt: personalityOption.systemPrompt,
      traits: {
        formality: tone.formality,
        humor: tone.humor,
        technicality: tone.technicality,
        empathy: tone.empathy,
      },
      isPremium: false,
      debateModifiers: {
        argumentStyle: debateProfile.argumentStyle,
        aggression: debateProfile.aggression,
        concession: debateProfile.concession,
        interruption: debateProfile.interruption ?? 0.3,
      },
    };
  }

  private static getDebatingStyleFromPersonality(personality: Personality) {
    if (!personality.debateModifiers) {
      return {
        aggression: 0.5,
        formality: 0.6,
        evidenceBased: 0.7,
        emotional: 0.4,
      };
    }

    return {
      aggression: personality.debateModifiers.aggression,
      formality: personality.traits.formality,
      evidenceBased: personality.traits.technicality,
      emotional: 1 - personality.traits.technicality,
    };
  }

  private static hasConflictingPersonalities(personalities: Personality[]): boolean {
    // Check for potentially intense combinations
    const aggressivePersonalities = personalities.filter(p => 
      p.debateModifiers && p.debateModifiers.aggression > 0.6
    );

    // Multiple aggressive personalities might create very heated debates
    return aggressivePersonalities.length > 1;
  }
}
