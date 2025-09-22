/**
 * Hook for managing personality selection for AI debaters
 * Handles personality assignments, validation, and recommendations
 */

import { useState, useMemo } from 'react';
import { AIDebater, Personality, UsePersonalitySelectionReturn } from '../../types/debate';
import { PersonalityService } from '../../services/debate/PersonalityService';

export const usePersonalitySelection = (
  selectedAIs: AIDebater[] = [],
  initialPersonalities: Map<string, Personality> = new Map()
): UsePersonalitySelectionReturn => {
  const [selectedPersonalities, setSelectedPersonalities] = useState<Map<string, Personality>>(
    initialPersonalities
  );

  // Get available personalities based on premium status
  const availablePersonalities = useMemo(() => {
    return PersonalityService.getAvailablePersonalities();
  }, []);

  // Set personality for specific AI
  const setPersonality = (aiId: string, personality: Personality) => {
    setSelectedPersonalities(prev => {
      const newMap = new Map(prev);
      newMap.set(aiId, personality);
      return newMap;
    });
  };

  // Reset all personalities to default
  const resetPersonalities = () => {
    const newMap = new Map<string, Personality>();
    const defaultPersonality = PersonalityService.getDefaultPersonality();
    
    selectedAIs.forEach(ai => {
      newMap.set(ai.id, defaultPersonality);
    });
    
    setSelectedPersonalities(newMap);
  };

  // Auto-assign personalities to new AIs
  useMemo(() => {
    const currentAIIds = new Set(selectedPersonalities.keys());
    const newAIIds = selectedAIs.filter(ai => !currentAIIds.has(ai.id));
    
    if (newAIIds.length > 0) {
      const defaultPersonality = PersonalityService.getDefaultPersonality();
      const updatedMap = new Map(selectedPersonalities);
      
      newAIIds.forEach(ai => {
        updatedMap.set(ai.id, defaultPersonality);
      });
      
      setSelectedPersonalities(updatedMap);
    }
    
    // Remove personalities for AIs that are no longer selected
    const selectedAIIds = new Set(selectedAIs.map(ai => ai.id));
    const outdatedEntries = Array.from(selectedPersonalities.keys())
      .filter(aiId => !selectedAIIds.has(aiId));
    
    if (outdatedEntries.length > 0) {
      const updatedMap = new Map(selectedPersonalities);
      outdatedEntries.forEach(aiId => {
        updatedMap.delete(aiId);
      });
      setSelectedPersonalities(updatedMap);
    }
  }, [selectedAIs, selectedPersonalities]);

  // Check if using custom personalities
  const hasCustomPersonalities = useMemo(() => {
    const defaultPersonality = PersonalityService.getDefaultPersonality();
    return Array.from(selectedPersonalities.values())
      .some(personality => personality.id !== defaultPersonality.id);
  }, [selectedPersonalities]);

  // Validation
  const validation = useMemo(() => {
    return PersonalityService.validatePersonalitySelection(selectedPersonalities);
  }, [selectedPersonalities]);

  // Get personality for specific AI
  const getPersonalityForAI = (aiId: string): Personality | null => {
    return selectedPersonalities.get(aiId) || null;
  };

  // Get personality combinations and compatibility
  const getPersonalityCombinations = () => {
    return PersonalityService.getRecommendedCombinations();
  };

  const getCompatibilityScore = (): number => {
    const personalities = Array.from(selectedPersonalities.values());
    if (personalities.length < 2) return 50;

    // Calculate average compatibility for all pairs
    let totalScore = 0;
    let pairCount = 0;

    for (let i = 0; i < personalities.length; i++) {
      for (let j = i + 1; j < personalities.length; j++) {
        totalScore += PersonalityService.getCompatibilityScore(
          personalities[i], 
          personalities[j]
        );
        pairCount++;
      }
    }

    return pairCount > 0 ? Math.round(totalScore / pairCount) : 50;
  };

  // Apply recommended combination
  const applyRecommendedCombination = (combination: { personalities: string[] }) => {
    if (combination.personalities.length !== selectedAIs.length) {
      return false;
    }

    const newMap = new Map<string, Personality>();
    
    selectedAIs.forEach((ai, index) => {
      const personalityId = combination.personalities[index];
      const personality = PersonalityService.getPersonalityById(personalityId);
      
      if (personality) {
        newMap.set(ai.id, personality);
      }
    });

    if (newMap.size === selectedAIs.length) {
      setSelectedPersonalities(newMap);
      return true;
    }
    
    return false;
  };

  // Generate random personalities
  const randomizePersonalities = () => {
    const personalities = PersonalityService.getAvailablePersonalities();
    const newMap = new Map<string, Personality>();
    
    selectedAIs.forEach(ai => {
      const randomIndex = Math.floor(Math.random() * personalities.length);
      newMap.set(ai.id, personalities[randomIndex]);
    });
    
    setSelectedPersonalities(newMap);
  };

  // Create summary for display
  const getSummary = () => {
    const personalities = Array.from(selectedPersonalities.values());
    const uniquePersonalities = new Set(personalities.map(p => p.id));
    
    return {
      totalAssigned: selectedPersonalities.size,
      expectedTotal: selectedAIs.length,
      uniqueCount: uniquePersonalities.size,
      hasCustom: hasCustomPersonalities,
      compatibilityScore: getCompatibilityScore(),
      isComplete: selectedPersonalities.size === selectedAIs.length,
      isValid: validation.isValid,
    };
  };

  return {
    selectedPersonalities,
    setPersonality,
    resetPersonalities,
    hasCustomPersonalities,
    isPremiumFeature: false,
    availablePersonalities,
    validation,
    getPersonalityForAI,
    getPersonalityCombinations,
    applyRecommendedCombination,
    randomizePersonalities,
    getCompatibilityScore,
    getSummary,
  };
};
