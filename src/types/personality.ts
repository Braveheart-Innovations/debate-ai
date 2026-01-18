/**
 * Personality Customization Types
 * Types for user customization of built-in personalities
 */

/**
 * Tone settings that affect response style
 * All values are 0-1 scale
 */
export interface PersonalityTone {
  formality: number;      // 0=casual, 1=formal
  humor: number;          // 0=serious, 1=witty
  energy: number;         // 0=calm, 1=enthusiastic
  empathy: number;        // 0=detached, 1=empathetic
  technicality: number;   // 0=accessible, 1=technical
}

/**
 * Debate-specific behavior settings
 */
export interface PersonalityDebateProfile {
  argumentStyle: 'logical' | 'emotional' | 'balanced';
  aggression: number;     // 0=gentle, 1=aggressive
  concession: number;     // 0=firm, 1=yielding
  interruption?: number;  // 0=patient, 1=interruptive
}

/**
 * Model parameters that can be customized per personality
 */
export interface PersonalityModelParameters {
  temperature: number;    // 0.0-1.0, lower=precise, higher=creative
  topP?: number;          // 0.0-1.0
}

/**
 * User's customization for a single personality
 */
export interface PersonalityCustomization {
  personalityId: string;
  isCustomized: boolean;
  tone?: Partial<PersonalityTone>;
  debateProfile?: Partial<PersonalityDebateProfile>;
  modelParameters?: Partial<PersonalityModelParameters>;
  updatedAt: number;
}

/**
 * Top-level settings object stored in AsyncStorage
 */
export interface UserPersonalitySettings {
  customizations: { [personalityId: string]: PersonalityCustomization };
  lastSyncedAt: number;  // For future cloud sync
  version: number;       // Schema version for migrations
}

/**
 * A personality with user customizations merged in
 * Extends the base PersonalityOption with customization state
 */
export interface MergedPersonalityData {
  isCustomized: boolean;
  tone: PersonalityTone;
  debateProfile: PersonalityDebateProfile;
  modelParameters: PersonalityModelParameters;
}

/**
 * Default tone values used when no customization exists
 */
export const DEFAULT_TONE: PersonalityTone = {
  formality: 0.5,
  humor: 0.5,
  energy: 0.5,
  empathy: 0.5,
  technicality: 0.5,
};

/**
 * Default debate profile used when no customization exists
 */
export const DEFAULT_DEBATE_PROFILE: PersonalityDebateProfile = {
  argumentStyle: 'balanced',
  aggression: 0.5,
  concession: 0.5,
  interruption: 0.3,
};

/**
 * Default model parameters used when no customization exists
 */
export const DEFAULT_MODEL_PARAMETERS: PersonalityModelParameters = {
  temperature: 0.7,
  topP: 1.0,
};

/**
 * Initial empty settings object
 */
export const EMPTY_PERSONALITY_SETTINGS: UserPersonalitySettings = {
  customizations: {},
  lastSyncedAt: 0,
  version: 1,
};

/**
 * Type guard to check if a value is a valid PersonalityTone
 */
export function isValidTone(tone: unknown): tone is PersonalityTone {
  if (typeof tone !== 'object' || tone === null) return false;
  const t = tone as Record<string, unknown>;
  return (
    typeof t.formality === 'number' &&
    typeof t.humor === 'number' &&
    typeof t.energy === 'number' &&
    typeof t.empathy === 'number' &&
    typeof t.technicality === 'number'
  );
}

/**
 * Type guard to check if a value is a valid PersonalityDebateProfile
 */
export function isValidDebateProfile(profile: unknown): profile is PersonalityDebateProfile {
  if (typeof profile !== 'object' || profile === null) return false;
  const p = profile as Record<string, unknown>;
  return (
    ['logical', 'emotional', 'balanced'].includes(p.argumentStyle as string) &&
    typeof p.aggression === 'number' &&
    typeof p.concession === 'number'
  );
}
