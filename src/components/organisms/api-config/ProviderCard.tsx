import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { GradientButton, Typography } from '@/components/molecules';
import { AIProvider } from '@/config/aiProviders';
import { AI_MODELS } from '@/config/modelConfigs';
import { MODEL_PRICING, getFreeMessageInfo } from '@/config/modelPricing';
import { ActualPricing } from '@/components/organisms/subscription/ActualPricing';
import { getAIProviderIcon } from '@/utils/aiProviderAssets';
import * as Haptics from 'expo-haptics';
import { ErrorService } from '@/services/errors/ErrorService';
import APIKeyService from '@/services/APIKeyService';

/**
 * Convert a raw model ID to a friendly display name
 * e.g., "mistral-medium-2505" → "Mistral Medium"
 *       "command-a-vision-07-2025" → "Command A Vision"
 *       "provider/model-name" → "Model Name"
 */
const formatModelName = (modelId: string): string => {
  // Handle provider format: "org/model-name" - extract just the model name
  if (modelId.includes('/')) {
    modelId = modelId.split('/').pop() || modelId;
  }

  // Remove common suffixes (dates, versions) - order matters: specific patterns first
  const name = modelId
    .replace(/-\d{2}-\d{4}$/, '')    // Remove month-year like -07-2025 (most specific, check first)
    .replace(/-\d{8}$/, '')          // Remove date suffixes like -20251001
    .replace(/-\d{4,}$/, '')         // Remove numeric suffixes like -2505 or -0709
    .replace(/-latest$/, '')         // Remove -latest suffix
    .replace(/-preview$/, '')        // Remove -preview suffix
    .replace(/-Instruct-Turbo$/, '')
    .replace(/-Instruct$/, '');      // Remove -Instruct suffix

  // Convert to title case and replace dashes/underscores with spaces
  return name
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

interface ProviderCardProps {
  provider: AIProvider;
  apiKey: string;
  onKeyChange?: (key: string) => void;
  onTest: (keyOverride?: string) => Promise<{ success: boolean; message?: string; model?: string }>;
  onSave: (keyOverride?: string) => Promise<void>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  index: number;
  testStatus?: 'idle' | 'testing' | 'success' | 'failed';
  testStatusMessage?: string;
  selectedModel?: string;
  expertModeEnabled?: boolean;
  /** Actual model returned by API during verification */
  verifiedModel?: string;
  /** Callback when user wants to get an API key. If not provided, opens URL directly. */
  onGetApiKey?: () => void;
  /** Whether a key was detected in clipboard. */
  clipboardKeyDetected?: boolean;
  /** Callback to use the detected clipboard key. */
  onUseClipboardKey?: () => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  apiKey,
  onKeyChange,
  onTest,
  onSave,
  isExpanded,
  onToggleExpand,
  index,
  testStatus = 'idle',
  testStatusMessage,
  selectedModel,
  expertModeEnabled = false,
  verifiedModel,
  onGetApiKey,
  clipboardKeyDetected = false,
  onUseClipboardKey,
}) => {
  const { theme, isDark } = useTheme();
  const [isEditing, setIsEditing] = useState(!apiKey);
  const [isTesting, setIsTesting] = useState(false);
  const [localKey, setLocalKey] = useState('');

  const getMaskedKey = (key: string) => {
    if (!key) return '';
    if (key.includes('•')) return key;
    if (key.length <= 10) return '•'.repeat(key.length);
    return key.slice(0, 3) + '•'.repeat(key.length - 6) + key.slice(-3);
  };

  const displayApiKey = getMaskedKey(apiKey);

  // Sync display state when the masked status changes. Raw keys are never
  // copied from Redux into component state.
  useEffect(() => {
    if (!displayApiKey) {
      setIsEditing(true);
      return;
    }
    if (!isEditing) {
      setLocalKey('');
    }
  }, [displayApiKey, isEditing]);

  // A key pasted into an empty card is kept when the card closes or the
  // screen is left without tapping Test Connection: it is saved unverified,
  // as a failed test would save it. Replacing an existing key still needs an
  // explicit test, so a half-typed edit can never overwrite a working key.
  const pendingKeyRef = useRef('');
  pendingKeyRef.current = isEditing && !displayApiKey ? localKey.trim() : '';
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const savePendingKey = useCallback(() => {
    const pendingKey = pendingKeyRef.current;
    pendingKeyRef.current = '';
    if (!pendingKey || !APIKeyService.validateKeyFormat(provider.id, pendingKey).isValid) return;
    onSaveRef.current(pendingKey).catch((error: unknown) => {
      ErrorService.handleWithToast(error, { feature: 'settings' });
    });
  }, [provider.id]);

  useEffect(() => {
    if (!isExpanded) savePendingKey();
  }, [isExpanded, savePendingKey]);

  useEffect(() => () => savePendingKey(), [savePendingKey]);

  const handleTest = async () => {
    setIsTesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const pendingKey = localKey.trim();
      const result = await onTest(pendingKey || undefined);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await onSave(pendingKey || undefined);
        setLocalKey('');
        setIsEditing(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const openURL = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      ErrorService.handleWithToast(new Error('Could not open URL'), { feature: 'settings' });
    }
  };


  return (
    <Animated.View
      entering={FadeInDown.delay(index * 100).springify()}
      style={{ 
        marginBottom: 16,
        zIndex: isExpanded ? 1000 - index : 1, // Higher z-index for expanded cards
        elevation: isExpanded && Platform.OS === 'android' ? 10 : 0,
      }}
    >
      <TouchableOpacity
        onPress={onToggleExpand}
        activeOpacity={0.7}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: isExpanded ? provider.color : theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {/* Provider Logo */}
            {(() => {
              const iconData = getAIProviderIcon(provider.id);
              if (iconData.iconType === 'image') {
                return (
                  <Image
                    source={iconData.icon as number}
                    style={{
                      width: 48,
                      height: 48,
                      marginRight: 12,
                      resizeMode: 'contain',
                      // Apply white tint in dark mode for visibility
                      ...(isDark && { tintColor: '#FFFFFF' }),
                    }}
                  />
                );
              } else {
                // Fallback to gradient circle with letter
                return (
                  <LinearGradient
                    colors={provider.gradient}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Text style={{ fontSize: 18, color: 'white', fontWeight: 'bold' }}>
                      {iconData.icon}
                    </Text>
                  </LinearGradient>
                );
              }
            })()}
            
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Typography variant="subtitle" weight="semibold">
                  {provider.name}
                </Typography>
                {/* Connection status icon */}
                {(testStatus === 'success' || testStatusMessage) && displayApiKey && (
                  <>
                    <Text style={{ fontSize: 16 }}>✅</Text>
                    {expertModeEnabled && (
                      <View style={{
                        backgroundColor: theme.colors.primary[100],
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 8,
                      }}>
                        <Text style={{ 
                          color: theme.colors.primary[600], 
                          fontSize: 10, 
                          fontWeight: 'bold' 
                        }}>
                          EXPERT
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>
              
              {/* Connection status and pricing */}
              {(testStatus === 'success' || testStatusMessage) && displayApiKey ? (
                <View style={{ marginTop: 4 }}>
                  {/* Model and pricing info */}
                  {(() => {
                    const models = AI_MODELS[provider.id] || [];
                    // Use verifiedModel (actual API response) first, then fall back to selectedModel
                    const modelToUse = verifiedModel || selectedModel;
                    const currentModel = modelToUse
                      ? models.find(m => m.id === modelToUse)
                      : models.find(m => m.isDefault);

                    // Get display name: try config first, then format raw model ID from API
                    const displayModelName = currentModel?.name
                      || (verifiedModel ? formatModelName(verifiedModel) : 'Unknown model');
                    const modelIdForPricing = currentModel?.id || verifiedModel || 'default';

                    if (currentModel || verifiedModel) {
                      const pricing = MODEL_PRICING[provider.id]?.[modelIdForPricing];
                      const freeInfo = getFreeMessageInfo(provider.id, modelIdForPricing);

                      return (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Typography
                              variant="body"
                              style={{
                                color: theme.colors.success[600],
                                fontSize: 14,
                                fontWeight: '500'
                              }}
                            >
                              {testStatusMessage || 'Verified'}
                            </Typography>
                            <Typography variant="caption" color="secondary">•</Typography>
                            <Typography variant="caption" color="secondary">
                              {displayModelName}
                            </Typography>
                            {/* Expert badge moved to header next to checkmark */}
                          </View>
                          {(pricing || freeInfo) ? (
                            <View style={{ marginTop: 2 }}>
                              <ActualPricing
                                inputPricePerM={pricing?.inputPer1M}
                                outputPricePerM={pricing?.outputPer1M}
                                freeInfo={freeInfo}
                                compact={true}
                              />
                            </View>
                          ) : (
                            <Typography variant="caption" color="warning">
                              No pricing data available
                            </Typography>
                          )}
                        </>
                      );
                    }
                    // Fallback for providers without model-specific pricing.
                    const pricing = MODEL_PRICING[provider.id]?.['default'];
                    const freeInfo = getFreeMessageInfo(provider.id, 'default');
                    
                    return (
                      <>
                        <Typography 
                          variant="body" 
                          style={{ 
                            color: theme.colors.success[600],
                            fontSize: 14,
                            fontWeight: '500'
                          }}
                        >
                          {testStatusMessage || 'Verified'}
                        </Typography>
                        {(pricing || freeInfo) && (
                          <View style={{ marginTop: 2 }}>
                            <ActualPricing
                              inputPricePerM={pricing?.inputPer1M}
                              outputPricePerM={pricing?.outputPer1M}
                              freeInfo={freeInfo}
                              compact={true}
                            />
                          </View>
                        )}
                      </>
                    );
                  })()}
                </View>
              ) : (
                <Typography 
                  variant="body" 
                  style={{ 
                    color: theme.colors.text.secondary,
                    fontSize: 14,
                    marginTop: 4
                  }}
                >
                  Not connected
                </Typography>
              )}
            </View>
          </View>
          
          <Text style={{ fontSize: 20, color: theme.colors.text.secondary }}>
            {isExpanded ? '−' : '+'}
          </Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            padding: 16,
            marginTop: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            // Fix for Android elevation/z-index issues
            elevation: Platform.OS === 'android' ? 5 : 0,
            zIndex: 1000,
            position: 'relative',
          }}
        >
          {/* Provider Description */}
          <Typography variant="body" color="secondary" style={{ marginBottom: 12 }}>
            {provider.description}
          </Typography>
          
          {/* Features */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
            {provider.features.map((feature, idx) => (
              <View
                key={idx}
                style={{
                  backgroundColor: isDark ? theme.colors.gray[800] : theme.colors.gray[100],
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  marginRight: 6,
                  marginBottom: 6,
                }}
              >
                <Typography variant="caption">{feature}</Typography>
              </View>
            ))}
          </View>

          {/* Clipboard Detection Banner */}
          {clipboardKeyDetected && onUseClipboardKey && (
            <TouchableOpacity
              onPress={onUseClipboardKey}
              style={{
                backgroundColor: theme.colors.success[100],
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{ marginRight: 8, fontSize: 16 }}>📋</Text>
                <View style={{ flex: 1 }}>
                  <Typography variant="body" weight="semibold" style={{ color: theme.colors.success[700] }}>
                    API key detected!
                  </Typography>
                  <Typography variant="caption" style={{ color: theme.colors.success[600] }}>
                    Tap to paste from clipboard
                  </Typography>
                </View>
              </View>
              <Typography variant="body" style={{ color: theme.colors.success[600] }}>
                Use →
              </Typography>
            </TouchableOpacity>
          )}

          {/* Get API Key Button */}
          <TouchableOpacity
            onPress={() => {
              if (onGetApiKey) {
                onGetApiKey();
              } else {
                openURL(provider.getKeyUrl);
              }
            }}
            style={{
              backgroundColor: theme.colors.primary[100],
              padding: 12,
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <Typography variant="body" color="brand" weight="semibold">
              Get API Key →
            </Typography>
          </TouchableOpacity>

          {/* API Key Input */}
          <View style={{ marginBottom: 16 }}>
            <Typography variant="caption" color="secondary" style={{ marginBottom: 8 }}>
              API Key
            </Typography>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? theme.colors.gray[900] : theme.colors.gray[50],
                borderRadius: 8,
                borderWidth: 1,
                borderColor: testStatus === 'failed' ? theme.colors.error[500] : theme.colors.border,
                paddingHorizontal: 12,
                height: 48,
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  color: theme.colors.text.primary,
                  fontSize: 14,
                }}
                placeholder={provider.apiKeyPlaceholder}
                placeholderTextColor={theme.colors.text.disabled}
                value={isEditing ? localKey : displayApiKey}
                onChangeText={(text) => {
                  setLocalKey(text);
                  onKeyChange?.(text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={isEditing}
                editable={isEditing}
                accessibilityLabel={`${provider.name} API key input`}
                accessibilityHint={`Enter your ${provider.name} API key. Current status: ${testStatus || 'not tested'}`}
              />
              
              {displayApiKey && (
                <TouchableOpacity
                  onPress={() => {
                    const nextEditing = !isEditing;
                    setIsEditing(nextEditing);
                    setLocalKey('');
                    if (nextEditing) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  style={{ padding: 8 }}
                  accessibilityLabel={isEditing ? 'Cancel API key edit' : 'Replace API key'}
                  accessibilityHint={isEditing ? 'Tap to cancel editing this API key' : 'Tap to replace this API key'}
                  accessibilityRole="button"
                >
                  <Text>{isEditing ? '✕' : '✏️'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Test Connection Button */}
          <GradientButton
            title={isTesting ? 'Testing...' : 'Test Connection'}
            onPress={handleTest}
            disabled={(!localKey.trim() && !displayApiKey) || isTesting}
            gradient={provider.gradient}
            fullWidth
          />

          {/* Documentation Link */}
          <TouchableOpacity
            onPress={() => openURL(provider.docsUrl)}
            style={{ alignItems: 'center', marginTop: 12 }}
          >
            <Typography variant="caption" color="secondary">
              View Documentation →
            </Typography>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};
