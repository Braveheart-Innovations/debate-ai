/**
 * PersonalityCustomizationPanel - Full customization interface for a personality
 * Displayed as a modal/sheet when tapping a PersonalityCard
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
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
} from '@/types/personality';
import {
  getToneDescription,
  getDebateProfileDescription,
} from '@/lib/personality';

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
    toggleCustomization,
    resetToDefaults,
    isCustomized,
  } = usePersonality();

  const [isEnabled, setIsEnabled] = useState(isCustomized(personality.id));

  // Local state for immediate UI feedback
  const [localTone, setLocalTone] = useState<PersonalityTone>(personality.mergedTone);
  const [localDebateProfile, setLocalDebateProfile] = useState<PersonalityDebateProfile>(
    personality.mergedDebateProfile
  );
  const [localTemperature, setLocalTemperature] = useState(
    personality.mergedModelParameters.temperature
  );

  const handleToggleCustomization = useCallback(async () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    await toggleCustomization(personality.id, newEnabled);
  }, [isEnabled, personality.id, toggleCustomization]);

  const handleToneChange = useCallback(
    async (key: keyof PersonalityTone, value: number) => {
      const newTone = { ...localTone, [key]: value };
      setLocalTone(newTone);

      if (isEnabled) {
        await updateTone(personality.id, { [key]: value });
      }
    },
    [localTone, isEnabled, personality.id, updateTone]
  );

  const handleDebateProfileChange = useCallback(
    async (key: keyof PersonalityDebateProfile, value: PersonalityDebateProfile[keyof PersonalityDebateProfile]) => {
      const newProfile = { ...localDebateProfile, [key]: value };
      setLocalDebateProfile(newProfile as PersonalityDebateProfile);

      if (isEnabled) {
        await updateDebateProfile(personality.id, { [key]: value });
      }
    },
    [localDebateProfile, isEnabled, personality.id, updateDebateProfile]
  );

  const handleTemperatureChange = useCallback(
    async (value: number) => {
      setLocalTemperature(value);

      if (isEnabled) {
        await updateModelParameters(personality.id, { temperature: value });
      }
    },
    [isEnabled, personality.id, updateModelParameters]
  );

  const handleResetToDefaults = useCallback(async () => {
    await resetToDefaults(personality.id);
    // Reset local state to defaults from the personality
    setLocalTone(personality.mergedTone);
    setLocalDebateProfile(personality.mergedDebateProfile);
    setLocalTemperature(personality.mergedModelParameters.temperature);
    setIsEnabled(false);
  }, [personality, resetToDefaults]);

  const disabled = !canCustomize || !isEnabled;

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

        {/* Customization Toggle */}
        {canCustomize && (
          <View style={[styles.toggleRow, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.toggleLabel}>
              <Typography variant="body" weight="medium">
                Enable Customization
              </Typography>
              <Typography variant="caption" color="secondary">
                Override default personality settings
              </Typography>
            </View>
            <Switch
              value={isEnabled}
              onValueChange={handleToggleCustomization}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary[400],
              }}
              thumbColor={isEnabled ? theme.colors.primary[500] : theme.colors.text.disabled}
            />
          </View>
        )}

        {/* Premium Upsell for Demo Users */}
        {!canCustomize && (
          <View style={[styles.upsellCard, { backgroundColor: theme.colors.warning[50] }]}>
            <Ionicons
              name="lock-closed"
              size={20}
              color={theme.colors.warning[700]}
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
            disabled={disabled}
          />

          <TraitSlider
            label="Humor"
            value={localTone.humor}
            onValueChange={(v) => handleToneChange('humor', v)}
            lowLabel={getToneDescription('humor', 0).low}
            highLabel={getToneDescription('humor', 1).high}
            disabled={disabled}
          />

          <TraitSlider
            label="Energy"
            value={localTone.energy}
            onValueChange={(v) => handleToneChange('energy', v)}
            lowLabel={getToneDescription('energy', 0).low}
            highLabel={getToneDescription('energy', 1).high}
            disabled={disabled}
          />

          <TraitSlider
            label="Empathy"
            value={localTone.empathy}
            onValueChange={(v) => handleToneChange('empathy', v)}
            lowLabel={getToneDescription('empathy', 0).low}
            highLabel={getToneDescription('empathy', 1).high}
            disabled={disabled}
          />

          <TraitSlider
            label="Technicality"
            value={localTone.technicality}
            onValueChange={(v) => handleToneChange('technicality', v)}
            lowLabel={getToneDescription('technicality', 0).low}
            highLabel={getToneDescription('technicality', 1).high}
            disabled={disabled}
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
            disabled={disabled}
          />

          <TraitSlider
            label="Aggression"
            value={localDebateProfile.aggression}
            onValueChange={(v) => handleDebateProfileChange('aggression', v)}
            lowLabel={getDebateProfileDescription('aggression', 0).low}
            highLabel={getDebateProfileDescription('aggression', 1).high}
            disabled={disabled}
          />

          <TraitSlider
            label="Concession"
            value={localDebateProfile.concession}
            onValueChange={(v) => handleDebateProfileChange('concession', v)}
            lowLabel={getDebateProfileDescription('concession', 0).low}
            highLabel={getDebateProfileDescription('concession', 1).high}
            disabled={disabled}
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
            disabled={disabled}
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
            <View style={[styles.infoCard, { backgroundColor: theme.colors.warning[50] }]}>
              {personality.watchouts.map((watchout, index) => (
                <View key={index} style={styles.signatureMove}>
                  <Ionicons
                    name="alert-circle"
                    size={16}
                    color={theme.colors.warning[600]}
                  />
                  <Typography variant="body" color="secondary" style={styles.moveText}>
                    {watchout}
                  </Typography>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Reset Button */}
        {canCustomize && isEnabled && (
          <TouchableOpacity
            style={[
              styles.resetButton,
              { borderColor: theme.colors.error[500] },
            ]}
            onPress={handleResetToDefaults}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={theme.colors.error[500]}
            />
            <Typography variant="body" color="error" style={styles.resetText}>
              Reset to Defaults
            </Typography>
          </TouchableOpacity>
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  toggleLabel: {
    flex: 1,
    marginRight: 16,
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
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  resetText: {
    marginLeft: 4,
  },
  bottomPadding: {
    height: 40,
  },
});
