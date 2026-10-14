import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme';
import { Typography } from '@/components/molecules';
import { CreateSheetShell } from './CreateSheetShell';
import { DiscreteSlider, OptionGrid, OutputControlGroup, SelectableChip } from './createControls';
import { STYLE_PRESETS } from '@/config/create/stylePresets';
import { SIZE_OPTIONS } from '@/config/create/sizeOptions';
import type { StylePreset, SizeOption } from '@/store/createSlice';

interface CreateOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  style: StylePreset;
  onChangeStyle: (style: StylePreset) => void;
  size: SizeOption;
  onChangeSize: (size: SizeOption) => void;
  count: number;
  maxCount: number;
  onChangeCount: (count: number) => void;
  /** Opens the device image picker; the sheet closes first. */
  onAttachImage: () => void;
  /** Attaches the newest gallery image; hidden when the gallery is empty. */
  onUseLatestImage?: () => void;
  attachDisabledReason?: string;
  testID?: string;
}

/**
 * Composer-level output options for the image tab: style, frame, count, and
 * source-image attachment — everything that applies across all selected
 * models. Per-model settings live in ImageModelConfigSheet behind each pill.
 */
export const CreateOptionsSheet: React.FC<CreateOptionsSheetProps> = ({
  visible,
  onClose,
  style,
  onChangeStyle,
  size,
  onChangeSize,
  count,
  maxCount,
  onChangeCount,
  onAttachImage,
  onUseLatestImage,
  attachDisabledReason,
  testID,
}) => {
  const { theme } = useTheme();
  const countOptions = Array.from({ length: maxCount }, (_, index) => index + 1);

  const withLightHaptic = (action: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    action();
  };

  return (
    <CreateSheetShell visible={visible} title="Output options" onClose={onClose} testID={testID}>
      <OutputControlGroup label="Style" helpTopicId="create-styles">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.styleScroll}
        >
          {STYLE_PRESETS.map(preset => {
            const isSelected = style === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.styleChip,
                  {
                    backgroundColor: isSelected ? theme.colors.primary[500] : theme.colors.surface,
                    borderColor: isSelected ? theme.colors.primary[500] : theme.colors.border,
                  },
                ]}
                onPress={withLightHaptic(() => onChangeStyle(preset.id))}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Ionicons
                  name={preset.icon as keyof typeof Ionicons.glyphMap}
                  size={20}
                  color={isSelected ? '#FFFFFF' : theme.colors.text.secondary}
                />
                <Typography
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    color: isSelected ? '#FFFFFF' : theme.colors.text.primary,
                    marginTop: 4,
                    textAlign: 'center',
                  }}
                >
                  {preset.label}
                </Typography>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </OutputControlGroup>

      <OutputControlGroup label="Frame" helpTopicId="create-frame">
        <OptionGrid
          options={SIZE_OPTIONS.map(option => ({
            id: option.id,
            label: option.label,
            description: option.description,
          }))}
          selectedId={size}
          onSelect={withHapticSelect(onChangeSize)}
          testID="create-image-frame-grid"
        />
      </OutputControlGroup>

      {maxCount > 1 && (
        <OutputControlGroup label="Count">
          <DiscreteSlider
            options={countOptions}
            value={Math.min(count, maxCount)}
            getLabel={value => `${value} image${value === 1 ? '' : 's'}`}
            onChange={value => onChangeCount(value || 1)}
            testID="create-image-count-slider"
          />
        </OutputControlGroup>
      )}

      <OutputControlGroup label="Source image">
        {attachDisabledReason ? (
          <View style={styles.attachHintRow}>
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={theme.colors.text.secondary}
            />
            <Typography variant="caption" color="secondary" style={styles.attachHintText}>
              {attachDisabledReason}
            </Typography>
          </View>
        ) : (
          <View style={styles.attachActions}>
            <SelectableChip
              label="Upload image"
              onPress={withLightHaptic(() => {
                onClose();
                onAttachImage();
              })}
              testID="create-options-attach"
            />
            {onUseLatestImage && (
              <SelectableChip
                label="Use latest image"
                onPress={withLightHaptic(() => {
                  onClose();
                  onUseLatestImage();
                })}
                testID="create-options-use-latest"
              />
            )}
          </View>
        )}
      </OutputControlGroup>
    </CreateSheetShell>
  );
};

// OptionGrid passes the tapped id; wrap the change handler with the light
// haptic every option tap on this screen has always had.
function withHapticSelect<T>(onSelect: (value: T) => void) {
  return (value: T) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSelect(value);
  };
}

const styles = StyleSheet.create({
  styleScroll: {
    paddingRight: 16,
  },
  styleChip: {
    minWidth: 88,
    height: 80,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  attachActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachHintText: {
    flex: 1,
  },
});

export default CreateOptionsSheet;
