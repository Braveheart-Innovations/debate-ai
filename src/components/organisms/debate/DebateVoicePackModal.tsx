import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/components/molecules';
import { useTheme } from '@/theme';
import type { DebateVoicePackCandidate } from '@/services/debate';

const FOOTER_PADDING = 16;

interface DebateVoicePackModalProps {
  visible: boolean;
  candidates: DebateVoicePackCandidate[];
  selectedIds: string[];
  isSaving: boolean;
  savingLabel?: string;
  canRetryAudio: boolean;
  onToggleClip: (id: string) => void;
  onSelectAllReady: () => void;
  onClearSelection: () => void;
  onRetryClip: (candidate: DebateVoicePackCandidate) => void;
  onClose: () => void;
  onSave: () => void;
}

function getStatusLabel(candidate: DebateVoicePackCandidate): string {
  if (candidate.status === 'ready') return candidate.voiceName ? `Ready with ${candidate.voiceName}` : 'Ready';
  if (candidate.status === 'generating') return 'Generating voice';
  if (candidate.status === 'failed') return candidate.error || 'Voice generation failed';
  return 'No voice clip yet';
}

function isIntroCandidate(candidate: DebateVoicePackCandidate): boolean {
  return candidate.message.metadata?.debateInterstitial?.kind === 'intro';
}

function getIntroWarningText(candidate: DebateVoicePackCandidate): string {
  if (candidate.status === 'generating') {
    return 'The MC opening statement is still generating. Generate now to omit it, or wait for the clip to finish.';
  }
  if (candidate.status === 'failed') {
    return 'The MC opening statement failed. Generate now to omit it, or regenerate it first if the extra ElevenLabs cost is worthwhile.';
  }
  if (candidate.status === 'ready') {
    return 'The MC opening statement is not selected. Generate now to omit it, or select it before creating the podcast.';
  }
  return 'The MC opening statement has no voice clip. Generate now to omit it, or regenerate it first if the extra ElevenLabs cost is worthwhile.';
}

export const DebateVoicePackModal: React.FC<DebateVoicePackModalProps> = ({
  visible,
  candidates,
  selectedIds,
  isSaving,
  savingLabel,
  canRetryAudio,
  onToggleClip,
  onSelectAllReady,
  onClearSelection,
  onRetryClip,
  onClose,
  onSave,
}) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const selectedSet = new Set(selectedIds);
  const readyCount = candidates.filter((candidate) => candidate.status === 'ready').length;
  const selectedCount = selectedIds.length;
  const canSave = selectedCount > 0 && !isSaving;
  const unavailableCandidates = candidates.filter((candidate) => candidate.status !== 'ready');
  const introCandidate = candidates.find(isIntroCandidate);
  const introWillBeOmitted = Boolean(introCandidate && !selectedSet.has(introCandidate.id));
  const canRetryIntro = Boolean(
    introCandidate &&
      canRetryAudio &&
      introCandidate.status !== 'ready' &&
      introCandidate.status !== 'generating'
  );
  const warningTitle = introWillBeOmitted
    ? 'MC opening statement will be omitted'
    : unavailableCandidates.length > 0
      ? `${unavailableCandidates.length} clip${unavailableCandidates.length === 1 ? '' : 's'} unavailable`
      : undefined;
  const warningText = introCandidate && introWillBeOmitted
    ? getIntroWarningText(introCandidate)
    : 'Generate now to include selected ready clips only, or use the refresh buttons below if regenerating unavailable clips is worthwhile.';
  const topSystemInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0);
  const bottomSystemInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 0);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={theme.colors.background}
        />
        <View style={[
          styles.header,
          {
            borderBottomColor: theme.colors.border,
            paddingTop: 12 + topSystemInset,
          },
        ]}>
          <View style={styles.headerText}>
            <Typography variant="subtitle" weight="semibold">
              Generate Podcast File
            </Typography>
            <Typography variant="caption" color="secondary">
              {selectedCount} selected • {readyCount} ready
            </Typography>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close podcast generation">
            <Ionicons name="close-outline" size={28} color={theme.colors.text.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.toolbarButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
            onPress={onSelectAllReady}
            accessibilityRole="button"
            accessibilityLabel="Select all ready voice clips"
          >
            <Typography variant="caption" weight="semibold">Select Ready</Typography>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
            onPress={onClearSelection}
            accessibilityRole="button"
            accessibilityLabel="Clear selected voice clips"
          >
            <Typography variant="caption" weight="semibold">Clear</Typography>
          </TouchableOpacity>
        </View>

        {warningTitle && (
          <View
            style={[
              styles.warningBanner,
              {
                backgroundColor: isDark ? theme.colors.overlays.medium : theme.colors.warning[50],
                borderColor: theme.colors.warning[300],
              },
            ]}
          >
            <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning[700]} />
            <View style={styles.warningBody}>
              <Typography variant="caption" weight="semibold" style={{ color: theme.colors.warning[800] }}>
                {warningTitle}
              </Typography>
              <Typography variant="caption" style={{ color: isDark ? theme.colors.warning[100] : theme.colors.text.secondary }}>
                {warningText}
              </Typography>
            </View>
            {canRetryIntro && introCandidate && (
              <TouchableOpacity
                style={[styles.warningAction, { borderColor: theme.colors.warning[600] }]}
                onPress={() => onRetryClip(introCandidate)}
                accessibilityRole="button"
                accessibilityLabel="Regenerate MC opening statement"
                testID="voice-pack-regenerate-intro"
              >
                <Ionicons name="refresh" size={15} color={theme.colors.warning[700]} />
                <Typography variant="caption" weight="semibold" style={{ color: theme.colors.warning[700] }}>
                  Regenerate
                </Typography>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {candidates.map((candidate, index) => {
            const isReady = candidate.status === 'ready';
            const selected = selectedSet.has(candidate.id);
            const canRetry = canRetryAudio && candidate.status !== 'ready' && candidate.status !== 'generating';
            const statusColor = candidate.status === 'ready'
              ? theme.colors.success[600]
              : candidate.status === 'failed'
                ? theme.colors.warning[600]
                : theme.colors.text.secondary;

            return (
              <TouchableOpacity
                key={candidate.id}
                style={[
                  styles.clipRow,
                  {
                    backgroundColor: isDark ? theme.colors.overlays.soft : theme.colors.surface,
                    borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
                    opacity: isReady ? 1 : 0.75,
                  },
                ]}
                onPress={() => isReady && onToggleClip(candidate.id)}
                disabled={!isReady}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: !isReady }}
                testID={`voice-pack-clip-${candidate.id}`}
              >
                <View style={[
                  styles.clipCheck,
                  {
                    borderColor: selected ? theme.colors.primary[500] : theme.colors.border,
                    backgroundColor: selected ? theme.colors.primary[500] : 'transparent',
                  },
                ]}>
                  {selected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                </View>

                <View style={styles.clipBody}>
                  <Typography variant="body" weight="semibold" numberOfLines={1}>
                    {index + 1}. {candidate.speakerName}
                  </Typography>
                  {candidate.speechLabel && (
                    <Typography variant="caption" color="secondary" numberOfLines={1}>
                      {candidate.speechLabel}
                    </Typography>
                  )}
                  <Typography variant="caption" color="secondary" numberOfLines={2} style={styles.previewText}>
                    {candidate.textPreview}
                  </Typography>
                  <Typography variant="caption" style={{ color: statusColor }} numberOfLines={1}>
                    {getStatusLabel(candidate)}
                  </Typography>
                </View>

                {candidate.status === 'generating' && (
                  <ActivityIndicator size="small" color={theme.colors.primary[500]} />
                )}
                {canRetry && (
                  <TouchableOpacity
                    style={[styles.retryButton, { borderColor: theme.colors.primary[500] }]}
                    onPress={() => onRetryClip(candidate)}
                    accessibilityRole="button"
                    accessibilityLabel={`Retry voice for ${candidate.speakerName}`}
                    testID={`voice-pack-retry-${candidate.id}`}
                  >
                    <Ionicons name="refresh" size={16} color={theme.colors.primary[500]} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View
          testID="voice-pack-footer"
          style={[
            styles.footer,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.background,
              paddingBottom: FOOTER_PADDING + bottomSystemInset,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: canSave ? theme.colors.primary[500] : theme.colors.text.disabled },
            ]}
            onPress={onSave}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Generate selected clips as a podcast file"
            testID="voice-pack-save"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="musical-notes-outline" size={20} color="#FFFFFF" />
            )}
            <Typography variant="button" weight="semibold" style={{ color: '#FFFFFF' }}>
              {isSaving ? savingLabel || 'Generating...' : 'Generate Podcast File'}
            </Typography>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    minHeight: 64,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  toolbar: {
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  toolbarButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBanner: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  warningAction: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 16,
    gap: 10,
  },
  clipRow: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clipCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewText: {
    marginTop: 2,
  },
  retryButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    borderTopWidth: 1,
    padding: FOOTER_PADDING,
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
