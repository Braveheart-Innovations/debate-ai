import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@/theme';
import { Typography, InfoButton, ConfigRow, Button } from '@/components/molecules';
import { AIAvatar } from '../common/AIAvatar';
import { PagedSheet, usePagedSheetNav } from '../common/PagedSheet';
import { ModelOptionList, getModelTokenPricing } from '../home/ModelOptionList';
import { PersonalityOptionGrid } from '../personality/PersonalityOptionGrid';
import { ParameterSlider } from '../api-config/ParameterSlider';
import { AISelectionConfig } from '@/types/aiSelection';
import { ModelParameters } from '@/types';
import { RootState, updateExpertMode } from '@/store';
import { getProviderById } from '@/config/aiProviders';
import {
  getProviderModels,
  DEFAULT_PARAMETERS,
  PARAMETER_RANGES,
  getParameterRange,
  getSupportedParams,
} from '@/config/modelConfigs';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { usePersonality } from '@/hooks/usePersonality';
import { getAIProviderIcon } from '@/utils/aiProviderAssets';
import { HelpTopicId } from '@/config/help/types';

interface AIConfigSheetProps {
  visible: boolean;
  onClose: () => void;
  config: AISelectionConfig | null;
  onChangeModel: (modelId: string) => void;
  onChangePersonality: (personalityId: string) => void;
  /** Session-scoped parameter overrides; undefined clears back to defaults. */
  onChangeParameters: (parameters: ModelParameters | undefined) => void;
  onRemove: () => void;
  /** Hidden when false (e.g. demo mode, where advanced parameters are gated). */
  showAdvanced?: boolean;
  testID?: string;
}

interface PageProps {
  config: AISelectionConfig;
  providerName: string;
}

const ConfigRootPage: React.FC<
  PageProps & {
    company: string;
    iconData: ReturnType<typeof getAIProviderIcon>;
    color: string;
    onRemove: () => void;
    showAdvanced?: boolean;
  }
> = ({ config, providerName, company, iconData, color, onRemove, showAdvanced }) => {
  const { theme } = useTheme();
  const nav = usePagedSheetNav();
  const { isCustomized } = usePersonality();

  const models = (getProviderModels(config.providerId) || []).filter((m) => !m.isDeprecated);
  const currentModel =
    models.find((m) => m.id === config.modelId) || models.find((m) => m.isDefault);
  const currentPersonality =
    UNIVERSAL_PERSONALITIES.find((p) => p.id === config.personalityId) || UNIVERSAL_PERSONALITIES[0];

  return (
    <ScrollView
      style={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.identityRow}>
        <AIAvatar icon={iconData.icon} iconType={iconData.iconType} size="small" color={color} />
        <Typography variant="caption" color="secondary">
          {company}
        </Typography>
      </View>

      <View style={styles.section}>
        <Typography variant="caption" color="secondary" style={styles.label}>
          Model
        </Typography>
        <ConfigRow
          primary={currentModel?.name || 'Select Model'}
          secondary={currentModel ? getModelTokenPricing(config.providerId, currentModel.id) ?? undefined : undefined}
          onPress={() => nav.push('model')}
          accessibilityLabel={`Model: ${currentModel?.name || 'none selected'}`}
          accessibilityHint="Opens model picker"
          testID="ai-config-model-row"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.labelRow}>
          <Typography variant="caption" color="secondary">
            Personality
          </Typography>
          <InfoButton topicId="personalities" size="small" />
        </View>
        <ConfigRow
          primary={`${currentPersonality.emoji} ${currentPersonality.name}`}
          secondary={currentPersonality.tagline}
          showIndicatorDot={isCustomized(currentPersonality.id)}
          onPress={() => nav.push('personality')}
          accessibilityLabel={`Personality: ${currentPersonality.name}`}
          accessibilityHint="Opens personality picker"
          testID="ai-config-personality-row"
        />
      </View>

      {showAdvanced && (
        <TouchableOpacity
          onPress={() => nav.push('advanced')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Advanced parameters"
          accessibilityHint="Opens advanced parameters"
          style={[
            styles.advancedRow,
            { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
          ]}
          testID="ai-config-advanced-row"
        >
          <Ionicons name="options-outline" size={18} color={theme.colors.text.secondary} />
          <Typography variant="body" weight="medium" style={styles.advancedLabel}>
            Advanced parameters
          </Typography>
          {config.parameters && (
            <View
              style={[styles.customizedDot, { backgroundColor: theme.colors.primary[500] }]}
              testID="ai-config-advanced-row-dot"
            />
          )}
          <Ionicons name="chevron-forward" size={16} color={theme.colors.text.secondary} />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={onRemove}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${providerName} from conversation`}
        style={styles.removeRow}
      >
        <Ionicons name="trash-outline" size={18} color={theme.colors.error[500]} />
        <Typography variant="body" weight="medium" color="error">
          Remove from conversation
        </Typography>
      </TouchableOpacity>
    </ScrollView>
  );
};

const ModelPage: React.FC<PageProps & { onChangeModel: (modelId: string) => void }> = ({
  config,
  providerName,
  onChangeModel,
}) => {
  const { theme } = useTheme();
  const nav = usePagedSheetNav();

  return (
    <View style={styles.pickerPage}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: 8 }}>
        <Typography variant="caption" color="secondary">
          for {providerName}
        </Typography>
      </View>
      <ModelOptionList
        providerId={config.providerId}
        selectedModel={config.modelId}
        onSelectModel={(modelId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChangeModel(modelId);
          nav.pop();
        }}
        testID="ai-config-model-list"
      />
    </View>
  );
};

const PersonalityPage: React.FC<
  PageProps & { onChangePersonality: (personalityId: string) => void }
> = ({ config, providerName, onChangePersonality }) => {
  const nav = usePagedSheetNav();

  return (
    <View style={[styles.pickerPage, styles.personalityPage]}>
      <View style={{ paddingTop: 8, paddingBottom: 4 }}>
        <Typography variant="caption" color="secondary">
          for {providerName}
        </Typography>
      </View>
      <PersonalityOptionGrid
        personalities={UNIVERSAL_PERSONALITIES}
        selectedPersonalityId={config.personalityId}
        onSelectPersonality={(personalityId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChangePersonality(personalityId);
          nav.pop();
        }}
        testID="ai-config-personality-grid"
      />
    </View>
  );
};

const PARAM_HELP_TOPICS: Partial<Record<keyof ModelParameters, HelpTopicId>> = {
  temperature: 'expert-temperature',
  maxTokens: 'expert-tokens',
  topP: 'expert-top-p',
};

const AdvancedParamsPage: React.FC<
  PageProps & { onChangeParameters: (parameters: ModelParameters | undefined) => void }
> = ({ config, providerName, onChangeParameters }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const nav = usePagedSheetNav();
  const expertConfig = useSelector(
    (state: RootState) => state.settings.expertMode?.[config.providerId]
  );

  const models = (getProviderModels(config.providerId) || []).filter((m) => !m.isDeprecated);
  const currentModel =
    models.find((m) => m.id === config.modelId) || models.find((m) => m.isDefault);

  // Only params with a numeric range are editable here (stopSequences/seed
  // have no range), mirroring the Model Defaults screen.
  const editableParams = getSupportedParams(config.providerId, currentModel?.id).filter(
    (param): param is keyof typeof PARAMETER_RANGES => param in PARAMETER_RANGES
  );

  // Baseline mirrors send-time precedence when no session override exists:
  // saved Model Defaults (when Expert Mode is enabled), else app defaults.
  const savedDefaults: ModelParameters = {
    ...DEFAULT_PARAMETERS,
    ...(expertConfig?.enabled ? expertConfig.parameters : undefined),
  };

  // Edits stay local until Save; nothing is committed by tapping a stepper.
  const [values, setValues] = useState<ModelParameters>({ ...savedDefaults, ...config.parameters });

  const matchesSavedDefaults = editableParams.every(
    (param) => values[param] === savedDefaults[param]
  );

  const handleSaveForSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Values identical to the defaults are stored as "no override" so the
    // session keeps following future Model Defaults edits.
    onChangeParameters(matchesSavedDefaults ? undefined : values);
    nav.pop();
  };

  const handleSaveAsDefault = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(
      updateExpertMode({
        provider: config.providerId,
        config: { ...expertConfig, enabled: true, parameters: values },
      })
    );
    // The saved defaults now carry these values; clearing the session
    // override lets later Model Defaults edits flow through again.
    onChangeParameters(undefined);
    nav.pop();
  };

  return (
    <ScrollView
      style={[styles.body, styles.pickerPage]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.advancedIntro}>
        <Typography variant="caption" color="secondary">
          for {providerName}
          {currentModel ? ` · ${currentModel.name}` : ''}
        </Typography>
        <Typography variant="caption" color="secondary" style={styles.advancedIntroLine}>
          Changes apply to this conversation unless saved as the default.
        </Typography>
      </View>

      {editableParams.map((param) => {
        const range = getParameterRange(config.providerId, param, currentModel?.id);
        // An unset maxTokens stays empty: the model's own limit.
        const stored = values[param] ?? DEFAULT_PARAMETERS[param];
        const value = param === 'maxTokens' && stored === undefined
          ? undefined
          : Math.max(range.min, Math.min(Number(stored ?? range.min), range.max));
        const helpTopicId = PARAM_HELP_TOPICS[param];

        return (
          <ParameterSlider
            key={param}
            name={param}
            value={value}
            min={range.min}
            max={range.max}
            step={range.step}
            description={range.description}
            onChange={(newValue) => setValues((prev) => ({ ...prev, [param]: newValue }))}
            rightElement={
              helpTopicId ? <InfoButton topicId={helpTopicId} size="small" /> : undefined
            }
            {...(param === 'maxTokens'
              ? {
                  emptyLabel: 'Model default',
                  emptyStart: range.max,
                  onClear: () => setValues((prev) => ({ ...prev, maxTokens: undefined })),
                }
              : {})}
          />
        );
      })}

      <Button
        title="Save for This Session"
        variant="primary"
        onPress={handleSaveForSession}
        style={styles.saveParamsButton}
      />
      <Button
        title="Save as Default"
        variant="secondary"
        onPress={handleSaveAsDefault}
      />
      <Typography variant="caption" color="secondary" align="center" style={styles.advancedFootnote}>
        Default applies to all new sessions (Settings → Model Defaults).
      </Typography>
      {!matchesSavedDefaults && (
        <TouchableOpacity
          onPress={() => setValues({ ...savedDefaults })}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Reset to defaults"
          style={styles.resetLink}
        >
          <Typography variant="caption" weight="medium" style={{ color: theme.colors.primary[500] }}>
            Reset to defaults
          </Typography>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

/**
 * Per-pill config sheet: one PagedSheet whose root page links to in-sheet
 * model, personality, and advanced-parameter pages (tap an option to select
 * and return), plus a destructive remove action.
 */
export const AIConfigSheet: React.FC<AIConfigSheetProps> = ({
  visible,
  onClose,
  config,
  onChangeModel,
  onChangePersonality,
  onChangeParameters,
  onRemove,
  showAdvanced,
  testID,
}) => {
  const provider = config ? getProviderById(config.providerId) : undefined;
  if (!config || !provider) return null;
  const iconData = getAIProviderIcon(provider.id);

  const handleRemove = () => {
    onClose();
    onRemove();
  };

  return (
    <PagedSheet visible={visible} onClose={onClose} testID={testID}>
      <PagedSheet.Page id="root" title={provider.name}>
        <ConfigRootPage
          config={config}
          providerName={provider.name}
          company={provider.company}
          iconData={iconData}
          color={provider.color}
          onRemove={handleRemove}
          showAdvanced={showAdvanced}
        />
      </PagedSheet.Page>
      <PagedSheet.Page id="model" title="Select Model">
        <ModelPage config={config} providerName={provider.name} onChangeModel={onChangeModel} />
      </PagedSheet.Page>
      <PagedSheet.Page id="personality" title="Choose a Personality">
        <PersonalityPage
          config={config}
          providerName={provider.name}
          onChangePersonality={onChangePersonality}
        />
      </PagedSheet.Page>
      {showAdvanced && (
        <PagedSheet.Page id="advanced" title="Advanced Parameters">
          <AdvancedParamsPage
            config={config}
            providerName={provider.name}
            onChangeParameters={onChangeParameters}
          />
        </PagedSheet.Page>
      )}
    </PagedSheet>
  );
};

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  advancedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  advancedLabel: {
    flex: 1,
  },
  customizedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 2,
  },
  advancedIntro: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  advancedIntroLine: {
    marginTop: 4,
  },
  saveParamsButton: {
    marginTop: 8,
    marginBottom: 12,
  },
  advancedFootnote: {
    marginTop: 10,
  },
  resetLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
  },
  removeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickerPage: {
    flex: 1,
  },
  personalityPage: {
    paddingHorizontal: 16,
  },
});

export default AIConfigSheet;
