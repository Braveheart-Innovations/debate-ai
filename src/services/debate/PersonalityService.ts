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
  static getAvailablePersonalities(isPremium: boolean): Personality[] {
    // Free users: default + Prof. Sage teaser
    const freePersonalities = ['default', 'prof_sage'];
    if (!isPremium) {
      return UNIVERSAL_PERSONALITIES
        .filter(p => freePersonalities.includes(p.id))
        .map(p => PersonalityService.convertToPersonality(p));
    }
    // Premium users get all personalities
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
    return [
      {
        name: 'Order vs Swagger',
        description: 'Prof. Sage vs Brody — structure vs punch',
        personalities: ['prof_sage', 'brody'],
      },
      {
        name: 'Empathy vs Scrutiny',
        description: 'Bestie vs Ivy — warmth vs evidence',
        personalities: ['bestie', 'skeptic'],
      },
      {
        name: 'Equanimity vs Pressure-Test',
        description: 'Zenji vs Devlin — calm vs challenge',
        personalities: ['zen', 'devlin'],
      },
      {
        name: 'Wit vs Pragmatism',
        description: 'George vs Jordan — satire vs action plan',
        personalities: ['george', 'pragmatist'],
      },
      {
        name: 'Story vs Evidence',
        description: 'Scout vs Ivy — narrative vs proof',
        personalities: ['scout', 'skeptic'],
      },
    ];
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
    const bonusCombinations = [
      'prof_sage-brody',
      'bestie-skeptic',
      'zen-devlin',
      'george-pragmatist',
      'scout-skeptic',
    ];

    if (bonusCombinations.includes(combination)) {
      score += 25;
    }

    // High-energy combinations
    const highEnergy = ['brody', 'george', 'devlin'];
    const highEnergyCount = [personality1.id, personality2.id]
      .filter(id => highEnergy.includes(id)).length;
    
    if (highEnergyCount === 2) {
      score += 15; // Very engaging
    }

    // Balanced combinations
    const calm = ['zen', 'prof_sage', 'default'];
    const energetic = ['brody', 'george'];
    
    const hasCalmAndEnergetic = 
      (calm.includes(personality1.id) && energetic.includes(personality2.id)) ||
      (calm.includes(personality2.id) && energetic.includes(personality1.id));
    
    if (hasCalmAndEnergetic) {
      score += 20; // Good balance
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get personality usage statistics (for recommendations)
   */
  static getPersonalityStats(): Record<string, { 
    usage: number; 
    rating: number; 
    category: 'popular' | 'balanced' | 'unique' 
  }> {
    // Mock data - in real implementation, this would come from analytics
    return {
      default: { usage: 45, rating: 3.6, category: 'popular' },
      prof_sage: { usage: 28, rating: 4.4, category: 'popular' },
      brody: { usage: 20, rating: 4.1, category: 'popular' },
      bestie: { usage: 18, rating: 4.2, category: 'balanced' },
      skeptic: { usage: 16, rating: 4.3, category: 'balanced' },
      zen: { usage: 12, rating: 4.4, category: 'unique' },
      scout: { usage: 10, rating: 4.0, category: 'unique' },
      devlin: { usage: 9, rating: 4.1, category: 'unique' },
      george: { usage: 8, rating: 4.0, category: 'unique' },
      pragmatist: { usage: 8, rating: 4.2, category: 'unique' },
      enforcer: { usage: 5, rating: 3.9, category: 'unique' },
      traditionalist: { usage: 5, rating: 4.0, category: 'unique' },
    };
  }

  /**
   * Get compact trait snapshot for UI meters
   */
  static getTraitSnapshot(personalityId: string): { formality: number; humor: number; energy: number } {
    const option = getPersonality(personalityId) || getPersonality('default');
    if (!option) {
      return { formality: 0.6, humor: 0.3, energy: 0.4 };
    }
    const traits = this.extractTraitsFromPersonality(option);
    const mods = this.getDebateModifiersFromPersonality(option);
    // Use aggression as an energy proxy for UI
    const energy = Math.max(0, Math.min(1, mods.aggression));
    return { formality: traits.formality, humor: traits.humor, energy };
  }

  // Private helper methods

  private static convertToPersonality(personalityOption: PersonalityOption): Personality {
    return {
      id: personalityOption.id,
      name: personalityOption.name,
      description: personalityOption.description,
      systemPrompt: personalityOption.systemPrompt,
      traits: PersonalityService.extractTraitsFromPersonality(personalityOption),
      isPremium: PersonalityService.isPremiumPersonality(personalityOption.id),
      debateModifiers: PersonalityService.getDebateModifiersFromPersonality(personalityOption),
    };
  }

  private static extractTraitsFromPersonality(personalityOption: PersonalityOption): {
    formality: number;
    humor: number;
    technicality: number;
    empathy: number;
  } {
    // Extract traits based on personality characteristics
    const traitMap: Record<string, { formality: number; humor: number; technicality: number; empathy: number }> = {
      default: { formality: 0.6, humor: 0.3, technicality: 0.5, empathy: 0.6 },
      prof_sage: { formality: 0.8, humor: 0.2, technicality: 0.7, empathy: 0.6 },
      brody: { formality: 0.3, humor: 0.4, technicality: 0.4, empathy: 0.5 },
      bestie: { formality: 0.4, humor: 0.4, technicality: 0.4, empathy: 0.9 },
      skeptic: { formality: 0.7, humor: 0.2, technicality: 0.8, empathy: 0.5 },
      zen: { formality: 0.6, humor: 0.3, technicality: 0.4, empathy: 0.9 },
      scout: { formality: 0.5, humor: 0.4, technicality: 0.5, empathy: 0.7 },
      devlin: { formality: 0.6, humor: 0.3, technicality: 0.7, empathy: 0.4 },
      george: { formality: 0.5, humor: 0.8, technicality: 0.5, empathy: 0.4 },
      pragmatist: { formality: 0.6, humor: 0.3, technicality: 0.6, empathy: 0.7 },
      enforcer: { formality: 0.7, humor: 0.2, technicality: 0.7, empathy: 0.4 },
      traditionalist: { formality: 0.7, humor: 0.3, technicality: 0.6, empathy: 0.5 },
    };

    return traitMap[personalityOption.id] || traitMap.default;
  }

  private static isPremiumPersonality(personalityId: string): boolean {
    const freePersonalities = ['default', 'prof_sage'];
    return !freePersonalities.includes(personalityId);
  }

  private static getDebateModifiersFromPersonality(personalityOption: PersonalityOption) {
    const modifierMap: Record<string, {
      argumentStyle: 'logical' | 'emotional' | 'balanced';
      interruption: number;
      concession: number;
      aggression: number;
    }> = {
      default: { argumentStyle: 'balanced', interruption: 0.3, concession: 0.5, aggression: 0.4 },
      prof_sage: { argumentStyle: 'logical', interruption: 0.2, concession: 0.6, aggression: 0.3 },
      brody: { argumentStyle: 'emotional', interruption: 0.5, concession: 0.3, aggression: 0.6 },
      bestie: { argumentStyle: 'emotional', interruption: 0.2, concession: 0.7, aggression: 0.2 },
      skeptic: { argumentStyle: 'logical', interruption: 0.4, concession: 0.3, aggression: 0.5 },
      zen: { argumentStyle: 'balanced', interruption: 0.1, concession: 0.8, aggression: 0.1 },
      scout: { argumentStyle: 'balanced', interruption: 0.3, concession: 0.5, aggression: 0.4 },
      devlin: { argumentStyle: 'logical', interruption: 0.6, concession: 0.2, aggression: 0.6 },
      george: { argumentStyle: 'emotional', interruption: 0.6, concession: 0.3, aggression: 0.4 },
      pragmatist: { argumentStyle: 'balanced', interruption: 0.3, concession: 0.5, aggression: 0.4 },
      enforcer: { argumentStyle: 'logical', interruption: 0.6, concession: 0.2, aggression: 0.6 },
      traditionalist: { argumentStyle: 'logical', interruption: 0.3, concession: 0.5, aggression: 0.4 },
    };

    return modifierMap[personalityOption.id] || modifierMap.default;
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
