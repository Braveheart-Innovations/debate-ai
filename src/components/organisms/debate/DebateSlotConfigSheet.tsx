/**
 * DebateSlotConfigSheet
 *
 * Per-debater config sheet for debate setup, mirroring the composer's
 * AIConfigSheet design language: one PagedSheet whose root page links to
 * in-sheet model, personality and provider pages, plus a voice row
 * (full-screen DebateVoicePicker presented above this sheet) and a
 * destructive remove action. Also used for the Podcast MC slot, which hides
 * the personality row. Changing provider is a page, not a second sheet: on
 * iOS a sheet opened while this one is still dismissing can fail to appear.
 */

import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography, ConfigRow, InfoButton } from '@/components/molecules';
import { AIAvatar } from '../common/AIAvatar';
import { PagedSheet, usePagedSheetNav } from '../common/PagedSheet';
import { ModelOptionList, getModelTokenPricing } from '../home/ModelOptionList';
import { PersonalityOptionGrid } from '../personality/PersonalityOptionGrid';
import { ProviderOptionList, ProviderPickerItem } from '../composer/ProviderOptionList';
import { DebateVoicePicker } from './DebateVoicePicker';
import { UNIVERSAL_PERSONALITIES } from '@/config/personalities';
import { getProviderModels } from '@/config/modelConfigs';
import { getAIProviderIcon } from '@/utils/aiProviderAssets';
import type { AIConfig, DebateVoiceSelection } from '@/types';
import type {
  ElevenLabsSharedVoiceQuery,
  ElevenLabsVoiceListQuery,
  MediaProviderOptionsResponse,
  MediaProviderVoiceOption,
} from '@/types/media';

export interface DebateSlotConfigSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Slot occupant; the sheet renders nothing when null. */
  ai: AIConfig | null;
  /** e.g. "Affirmative 1", "Podcast MC". */
  slotLabel: string;
  /** Effective model id for this slot. */
  modelId: string;
  onChangeModel: (modelId: string) => void;
  /** Personality row is hidden when undefined (Podcast MC, demo mode). */
  personalityId?: string;
  onChangePersonality?: (personalityId: string) => void;
  /** Voice row is shown only when true (voiced debate / podcast active). */
  showVoice?: boolean;
  voiceRequired?: boolean;
  voice?: DebateVoiceSelection;
  onSelectVoice?: (voice: MediaProviderVoiceOption) => void;
  /** Loaders for the in-sheet DebateVoicePicker. */
  onLoadVoices?: (query: ElevenLabsVoiceListQuery) => Promise<MediaProviderOptionsResponse>;
  onLoadSharedVoices?: (query: ElevenLabsSharedVoiceQuery) => Promise<MediaProviderOptionsResponse>;
  onAddSharedVoice?: (voice: MediaProviderVoiceOption) => Promise<MediaProviderVoiceOption>;
  elevenLabsTier?: string;
  /** Rows for the in-sheet "Change provider" page. */
  providerOptions: ProviderPickerItem[];
  configuredProviderIds: string[];
  onChangeProvider: (providerId: string) => void;
  /** Un-keyed providers route to their API key card (hidden in demo mode). */
  onRequestAddKey?: (providerId: string) => void;
  onRemove: () => void;
  removeLabel?: string;
  testID?: string;
}

interface RootPageProps {
  ai: AIConfig;
  slotLabel: string;
  modelId: string;
  personalityId?: string;
  showVoice: boolean;
  voiceRequired: boolean;
  voice?: DebateVoiceSelection;
  canPickVoice: boolean;
  onOpenVoicePicker: () => void;
  onRemove: () => void;
  removeLabel: string;
}

const SlotRootPage: React.FC<RootPageProps> = ({
  ai,
  slotLabel,
  modelId,
  personalityId,
  showVoice,
  voiceRequired,
  voice,
  canPickVoice,
  onOpenVoicePicker,
  onRemove,
  removeLabel,
}) => {
  const { theme } = useTheme();
  const nav = usePagedSheetNav();
  const iconData = getAIProviderIcon(ai.provider);

  const models = (getProviderModels(ai.provider) || []).filter((m) => !m.isDeprecated);
  const currentModel = models.find((m) => m.id === modelId) || models.find((m) => m.isDefault);
  const currentPersonality = personalityId
    ? UNIVERSAL_PERSONALITIES.find((p) => p.id === personalityId) || UNIVERSAL_PERSONALITIES[0]
    : undefined;

  return (
    <ScrollView
      style={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.identityRow}>
        <AIAvatar icon={iconData.icon} iconType={iconData.iconType} size="small" color={ai.color} />
        <Typography variant="caption" color="secondary">
          {slotLabel}
        </Typography>
      </View>

      <View style={styles.section}>
        <Typography variant="caption" color="secondary" style={styles.label}>
          Model
        </Typography>
        <ConfigRow
          primary={currentModel?.name || 'Select Model'}
          secondary={currentModel ? getModelTokenPricing(ai.provider, currentModel.id) ?? undefined : undefined}
          onPress={() => nav.push('model')}
          accessibilityLabel={`Model: ${currentModel?.name || 'none selected'}`}
          accessibilityHint="Opens model picker"
          testID="debate-slot-model-row"
        />
      </View>

      {currentPersonality && (
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
            onPress={() => nav.push('personality')}
            accessibilityLabel={`Personality: ${currentPersonality.name}`}
            accessibilityHint="Opens personality picker"
            testID="debate-slot-personality-row"
          />
        </View>
      )}

      {showVoice && (
        <View style={styles.section}>
          <Typography variant="caption" color="secondary" style={styles.label}>
            Voice {voiceRequired ? '(required)' : '(optional)'}
          </Typography>
          {canPickVoice ? (
            <ConfigRow
              primary={voice?.voiceName || 'Choose a voice'}
              secondary={voiceRequired ? 'Required for the podcast playlist.' : 'ElevenLabs voice for this debater.'}
              onPress={onOpenVoicePicker}
              accessibilityLabel={`Voice: ${voice?.voiceName || 'none selected'}`}
              accessibilityHint="Opens voice picker"
              testID="debate-slot-voice-row"
            />
          ) : (
            <Typography variant="caption" color="secondary">
              Voices are still loading — try again in a moment.
            </Typography>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={() => nav.push('provider')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Change provider"
        accessibilityHint="Choose a different AI provider for this slot"
        style={[
          styles.changeProviderRow,
          { borderColor: theme.colors.border, backgroundColor: theme.colors.card },
        ]}
        testID="debate-slot-change-provider-row"
      >
        <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.text.secondary} />
        <Typography variant="body" weight="medium" style={styles.changeProviderLabel}>
          Change provider
        </Typography>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.text.secondary} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRemove}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        style={styles.removeRow}
        testID="debate-slot-remove-row"
      >
        <Ionicons name="trash-outline" size={18} color={theme.colors.error[500]} />
        <Typography variant="body" weight="medium" color="error">
          {removeLabel}
        </Typography>
      </TouchableOpacity>
    </ScrollView>
  );
};

export const DebateSlotConfigSheet: React.FC<DebateSlotConfigSheetProps> = ({
  visible,
  onClose,
  ai,
  slotLabel,
  modelId,
  onChangeModel,
  personalityId,
  onChangePersonality,
  showVoice = false,
  voiceRequired = false,
  voice,
  onSelectVoice,
  onLoadVoices,
  onLoadSharedVoices,
  onAddSharedVoice,
  elevenLabsTier,
  providerOptions,
  configuredProviderIds,
  onChangeProvider,
  onRequestAddKey,
  onRemove,
  removeLabel = 'Remove debater',
  testID,
}) => {
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);

  useEffect(() => {
    if (!visible) setVoicePickerVisible(false);
  }, [visible]);

  if (!ai) return null;

  const canPickVoice = Boolean(onLoadVoices && onSelectVoice);

  const handleRemove = () => {
    onClose();
    onRemove();
  };

  const handleRequestAddKey = onRequestAddKey
    ? (providerId: string) => {
        onClose();
        onRequestAddKey(providerId);
      }
    : undefined;

  return (
    <PagedSheet visible={visible} onClose={onClose} testID={testID}>
      <PagedSheet.Page id="root" title={ai.name}>
        <SlotRootPage
          ai={ai}
          slotLabel={slotLabel}
          modelId={modelId}
          personalityId={personalityId}
          showVoice={showVoice}
          voiceRequired={voiceRequired}
          voice={voice}
          canPickVoice={canPickVoice}
          onOpenVoicePicker={() => setVoicePickerVisible(true)}
          onRemove={handleRemove}
          removeLabel={removeLabel}
        />
        {/* Full-screen picker is a native Modal mounted inside this sheet's
            Modal so it presents above it on iOS (see modal-stacking notes). */}
        {canPickVoice && onLoadVoices && (
          <DebateVoicePicker
            visible={voicePickerVisible}
            target={{ kind: 'single', label: `${ai.name} — ${slotLabel}` }}
            currentVoiceId={voice?.voiceId}
            elevenLabsTier={elevenLabsTier}
            onClose={() => setVoicePickerVisible(false)}
            onLoadVoices={onLoadVoices}
            onLoadSharedVoices={onLoadSharedVoices}
            onAddSharedVoice={onAddSharedVoice}
            onSelectVoice={(picked) => {
              onSelectVoice?.(picked);
              setVoicePickerVisible(false);
            }}
          />
        )}
      </PagedSheet.Page>
      <PagedSheet.Page id="model" title="Select Model">
        <ModelPage ai={ai} modelId={modelId} onChangeModel={onChangeModel} />
      </PagedSheet.Page>
      {personalityId !== undefined && onChangePersonality && (
        <PagedSheet.Page id="personality" title="Choose a Personality">
          <PersonalityPage
            ai={ai}
            personalityId={personalityId}
            onChangePersonality={onChangePersonality}
          />
        </PagedSheet.Page>
      )}
      <PagedSheet.Page id="provider" title="Change Provider">
        <ProviderPage
          ai={ai}
          providers={providerOptions}
          configuredProviderIds={configuredProviderIds}
          onChangeProvider={onChangeProvider}
          onRequestAddKey={handleRequestAddKey}
        />
      </PagedSheet.Page>
    </PagedSheet>
  );
};

const ProviderPage: React.FC<{
  ai: AIConfig;
  providers: ProviderPickerItem[];
  configuredProviderIds: string[];
  onChangeProvider: (providerId: string) => void;
  onRequestAddKey?: (providerId: string) => void;
}> = ({ ai, providers, configuredProviderIds, onChangeProvider, onRequestAddKey }) => {
  const { theme } = useTheme();
  const nav = usePagedSheetNav();

  return (
    <View style={styles.pickerPage}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: 8 }}>
        <Typography variant="caption" color="secondary">
          replacing {ai.name}
        </Typography>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ProviderOptionList
          providers={providers}
          configuredProviderIds={configuredProviderIds}
          selectedProviderIds={[]}
          allowDuplicates
          onSelectProvider={(providerId) => {
            onChangeProvider(providerId);
            nav.popToRoot();
          }}
          onRequestAddKey={onRequestAddKey}
          testID="debate-slot-provider-list"
        />
      </ScrollView>
    </View>
  );
};

const ModelPage: React.FC<{
  ai: AIConfig;
  modelId: string;
  onChangeModel: (modelId: string) => void;
}> = ({ ai, modelId, onChangeModel }) => {
  const { theme } = useTheme();
  const nav = usePagedSheetNav();

  return (
    <View style={styles.pickerPage}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: 8 }}>
        <Typography variant="caption" color="secondary">
          for {ai.name}
        </Typography>
      </View>
      <ModelOptionList
        providerId={ai.provider}
        selectedModel={modelId}
        onSelectModel={(nextModelId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChangeModel(nextModelId);
          nav.pop();
        }}
        testID="debate-slot-model-list"
      />
    </View>
  );
};

const PersonalityPage: React.FC<{
  ai: AIConfig;
  personalityId: string;
  onChangePersonality: (personalityId: string) => void;
}> = ({ ai, personalityId, onChangePersonality }) => {
  const nav = usePagedSheetNav();

  return (
    <View style={[styles.pickerPage, styles.personalityPage]}>
      <View style={{ paddingTop: 8, paddingBottom: 4 }}>
        <Typography variant="caption" color="secondary">
          for {ai.name}
        </Typography>
      </View>
      <PersonalityOptionGrid
        personalities={UNIVERSAL_PERSONALITIES}
        selectedPersonalityId={personalityId}
        onSelectPersonality={(nextPersonalityId) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChangePersonality(nextPersonalityId);
          nav.pop();
        }}
        testID="debate-slot-personality-grid"
      />
    </View>
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
  changeProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  changeProviderLabel: {
    flex: 1,
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

export default DebateSlotConfigSheet;
