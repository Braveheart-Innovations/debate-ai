/**
 * PersonalityCustomizationPanel - Full customization interface for a personality
 * Displayed as a modal/sheet when tapping a PersonalityCard
 * Uses Lock/Unlock pattern to protect against accidental changes
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Typography,
  SheetHeader,
  TraitSlider,
  ArgumentStyleSelect,
} from '@/components/molecules';
import { useTheme } from '@/theme';
import { MergedPersonality } from '@/contexts/PersonalityContext';
import { usePersonality } from '@/hooks/usePersonality';
import {
  PersonalityTone,
  PersonalityDebateProfile,
  DEFAULT_TONE,
  DEFAULT_DEBATE_PROFILE,
  DEFAULT_MODEL_PARAMETERS,
} from '@/types/personality';
import {
  getToneDescription,
  getDebateProfileDescription,
} from '@/lib/personality';
import { getPersonality as getBasePersonality } from '@/config/personalities';

interface PersonalityCustomizationPanelProps {
  /** The personality being customized */
  personality: MergedPersonality;
  /** Callback to close the panel */
  onClose: () => void;
  /** Whether customization is allowed (premium/trial users) */
  canCustomize?: boolean;
  /** Test ID for testing */
  testID?: string;
}

export const PersonalityCustomizationPanel: React.FC<PersonalityCustomizationPanelProps> = ({
  personality,
  onClose,
  canCustomize = true,
  testID,
}) => {
  const { theme } = useTheme();
  const {
    updateTone,
    updateDebateProfile,
    updateModelParameters,
    resetToDefaults,
  } = usePersonality();

  // Lock state - defaults to locked to prevent accidental changes
  const [isLocked, setIsLocked] = useState(true);

  // Local state for immediate UI feedback
  const [localTone, setLocalTone] = useState<PersonalityTone>(personality.mergedTone);
  const [localDebateProfile, setLocalDebateProfile] = useState<PersonalityDebateProfile>(
    personality.mergedDebateProfile
  );
  const [localTemperature, setLocalTemperature] = useState(
    personality.mergedModelParameters.temperature
  );

  // Track if we've made any changes this session (for showing customized state)
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  const handleToggleLock = useCallback(() => {
    setIsLocked(prev => !prev);
  }, []);

  const handleToneChange = useCallback(
    async (key: keyof PersonalityTone, value: number) => {
      const newTone = { ...localTone, [key]: value };
      setLocalTone(newTone);
      setHasLocalChanges(true);

      // Always save when unlocked (lock state is just UI protection)
      await updateTone(personality.id, { [key]: value });
    },
    [localTone, personality.id, updateTone]
  );

  const handleDebateProfileChange = useCallback(
    async (key: keyof PersonalityDebateProfile, value: PersonalityDebateProfile[keyof PersonalityDebateProfile]) => {
      const newProfile = { ...localDebateProfile, [key]: value };
      setLocalDebateProfile(newProfile as PersonalityDebateProfile);
      setHasLocalChanges(true);

      await updateDebateProfile(personality.id, { [key]: value });
    },
    [localDebateProfile, personality.id, updateDebateProfile]
  );

  const handleTemperatureChange = useCallback(
    async (value: number) => {
      setLocalTemperature(value);
      setHasLocalChanges(true);

      await updateModelParameters(personality.id, { temperature: value });
    },
    [personality.id, updateModelParameters]
  );

  const handleResetToDefaults = useCallback(() => {
    Alert.alert(
      'Reset to Defaults',
      `Are you sure you want to reset ${personality.name} to their original settings? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetToDefaults(personality.id);

            // Get the BASE personality values (not merged with customizations)
            const basePersonality = getBasePersonality(personality.id);

            // Reset local state to actual defaults
            const baseTone: PersonalityTone = {
              ...DEFAULT_TONE,
              ...(basePersonality?.tone || {}),
            };
            const baseDebateProfile: PersonalityDebateProfile = {
              ...DEFAULT_DEBATE_PROFILE,
              ...(basePersonality?.debateProfile || {}),
            };
            const baseTemperature = basePersonality?.modelParameters?.temperature
              ?? DEFAULT_MODEL_PARAMETERS.temperature;

            setLocalTone(baseTone);
            setLocalDebateProfile(baseDebateProfile);
            setLocalTemperature(baseTemperature);
            setHasLocalChanges(false);
            setIsLocked(true);
          },
        },
      ]
    );
  }, [personality.id, personality.name, resetToDefaults]);

  // Sliders are disabled if user can't customize OR if locked
  const slidersDisabled = !canCustomize || isLocked;

  // Show customized state if personality was already customized or we made changes
  const showCustomizedState = personality.isCustomized || hasLocalChanges;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]} testID={testID}>
      {/* Header */}
      <SheetHeader
        title={`${personality.emoji} ${personality.name}`}
        onClose={onClose}
        showHandle={false}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Personality Description */}
        <View style={[styles.descriptionCard, { backgroundColor: theme.colors.surface }]}>
          <Typography variant="body" color="secondary">
            {personality.bio}
          </Typography>
        </View>

        {/* Lock/Unlock Control */}
        {canCustomize && (
          <View style={styles.controlsContainer}>
            <TouchableOpacity
              style={[
                styles.lockRow,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: isLocked ? theme.colors.border : theme.colors.primary[400],
                  borderWidth: isLocked ? 1 : 2,
                },
              ]}
              onPress={handleToggleLock}
              activeOpacity={0.7}
            >
              <View style={styles.lockContent}>
                <Ionicons
                  name={isLocked ? 'lock-closed' : 'lock-open'}
                  size={20}
                  color={isLocked ? theme.colors.text.secondary : theme.colors.primary[500]}
                />
                <View style={styles.lockLabel}>
                  <Typography
                    variant="body"
                    weight="medium"
                    color={isLocked ? 'secondary' : 'primary'}
                  >
                    {isLocked ? 'Locked' : 'Unlocked - Editing'}
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    {isLocked
                      ? 'Tap to unlock and make changes'
                      : 'Sliders are now active'}
                  </Typography>
                </View>
              </View>
              {showCustomizedState && (
                <View
                  style={[
                    styles.customizedBadge,
                    { backgroundColor: theme.colors.primary[500] },
                  ]}
                >
                  <Typography variant="caption" style={styles.badgeText}>
                    Customized
                  </Typography>
                </View>
              )}
            </TouchableOpacity>

            {/* Reset link - shown when customized */}
            {showCustomizedState && (
              <TouchableOpacity
                style={styles.resetLink}
                onPress={handleResetToDefaults}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="refresh"
                  size={14}
                  color={theme.colors.error[500]}
                />
                <Typography variant="caption" color="error">
                  Reset to defaults
                </Typography>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Premium Upsell for Demo Users */}
        {!canCustomize && (
          <View style={[styles.upsellCard, { backgroundColor: theme.colors.surface }]}>
            <Ionicons
              name="lock-closed"
              size={20}
              color={theme.colors.warning[500]}
            />
            <View style={styles.upsellText}>
              <Typography variant="body" weight="medium" color="warning">
                Upgrade to Customize
              </Typography>
              <Typography variant="caption" color="secondary">
                Premium users can customize personality traits and debate style
              </Typography>
            </View>
          </View>
        )}

        {/* Tone Section */}
        <View style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            Tone & Style
          </Typography>

          <TraitSlider
            label="Formality"
            value={localTone.formality}
            onValueChange={(v) => handleToneChange('formality', v)}
            lowLabel={getToneDescription('formality', 0).low}
            highLabel={getToneDescription('formality', 1).high}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Humor"
            value={localTone.humor}
            onValueChange={(v) => handleToneChange('humor', v)}
            lowLabel={getToneDescription('humor', 0).low}
            highLabel={getToneDescription('humor', 1).high}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Energy"
            value={localTone.energy}
            onValueChange={(v) => handleToneChange('energy', v)}
            lowLabel={getToneDescription('energy', 0).low}
            highLabel={getToneDescription('energy', 1).high}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Empathy"
            value={localTone.empathy}
            onValueChange={(v) => handleToneChange('empathy', v)}
            lowLabel={getToneDescription('empathy', 0).low}
            highLabel={getToneDescription('empathy', 1).high}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Technicality"
            value={localTone.technicality}
            onValueChange={(v) => handleToneChange('technicality', v)}
            lowLabel={getToneDescription('technicality', 0).low}
            highLabel={getToneDescription('technicality', 1).high}
            disabled={slidersDisabled}
          />
        </View>

        {/* Debate Profile Section */}
        <View style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            Debate Profile
          </Typography>

          <ArgumentStyleSelect
            value={localDebateProfile.argumentStyle}
            onValueChange={(v) => handleDebateProfileChange('argumentStyle', v)}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Aggression"
            value={localDebateProfile.aggression}
            onValueChange={(v) => handleDebateProfileChange('aggression', v)}
            lowLabel={getDebateProfileDescription('aggression', 0).low}
            highLabel={getDebateProfileDescription('aggression', 1).high}
            disabled={slidersDisabled}
          />

          <TraitSlider
            label="Concession"
            value={localDebateProfile.concession}
            onValueChange={(v) => handleDebateProfileChange('concession', v)}
            lowLabel={getDebateProfileDescription('concession', 0).low}
            highLabel={getDebateProfileDescription('concession', 1).high}
            disabled={slidersDisabled}
          />
        </View>

        {/* Model Parameters Section */}
        <View style={styles.section}>
          <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
            Model Parameters
          </Typography>

          <TraitSlider
            label="Temperature"
            value={localTemperature}
            onValueChange={handleTemperatureChange}
            lowLabel="Precise"
            highLabel="Creative"
            disabled={slidersDisabled}
          />

          <Typography variant="caption" color="secondary" style={styles.paramNote}>
            Higher temperature = more creative but less predictable responses
          </Typography>
        </View>

        {/* Signature Moves (Read-only) */}
        {personality.signatureMoves.length > 0 && (
          <View style={styles.section}>
            <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
              Signature Moves
            </Typography>
            <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
              {personality.signatureMoves.map((move, index) => (
                <View key={index} style={styles.signatureMove}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={theme.colors.success[500]}
                  />
                  <Typography variant="body" color="secondary" style={styles.moveText}>
                    {move}
                  </Typography>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Watchouts (Read-only) */}
        {personality.watchouts && personality.watchouts.length > 0 && (
          <View style={styles.section}>
            <Typography variant="title" weight="semibold" style={styles.sectionTitle}>
              Watch Out For
            </Typography>
            <View style={[styles.infoCard, { backgroundColor: theme.colors.surface }]}>
              {personality.watchouts.map((watchout, index) => (
                <View key={index} style={styles.signatureMove}>
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={theme.colors.warning[500]}
                  />
                  <Typography variant="body" color="secondary" style={styles.moveText}>
                    {watchout}
                  </Typography>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Bottom padding for scroll */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  descriptionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  controlsContainer: {
    marginBottom: 16,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
  },
  resetLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 8,
    paddingRight: 4,
  },
  lockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  lockLabel: {
    flex: 1,
  },
  customizedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  upsellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  upsellText: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  paramNote: {
    marginTop: -8,
    marginBottom: 8,
  },
  infoCard: {
    padding: 12,
    borderRadius: 12,
  },
  signatureMove: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  moveText: {
    flex: 1,
  },
  bottomPadding: {
    height: 40,
  },
});
