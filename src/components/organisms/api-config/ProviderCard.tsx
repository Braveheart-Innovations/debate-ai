import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Linking,
  Alert,
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

interface ProviderCardProps {
  provider: AIProvider;
  apiKey: string;
  onKeyChange: (key: string) => void;
  onTest: () => Promise<{ success: boolean; message?: string; model?: string }>;
  onSave: () => Promise<void>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  index: number;
  testStatus?: 'idle' | 'testing' | 'success' | 'failed';
  testStatusMessage?: string;
  selectedModel?: string;
  expertModeEnabled?: boolean;
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
}) => {
  const { theme, isDark } = useTheme();
  const [isEditing, setIsEditing] = useState(!apiKey);
  const [isTesting, setIsTesting] = useState(false);
  const [localKey, setLocalKey] = useState(apiKey);

  const handleTest = async () => {
    setIsTesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const result = await onTest();
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Auto-save on successful test
        await onSave();
        setIsEditing(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const getMaskedKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 10) return '•'.repeat(key.length);
    return key.slice(0, 3) + '•'.repeat(key.length - 6) + key.slice(-3);
  };

  const openURL = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not open URL');
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
                {(testStatus === 'success' || testStatusMessage) && apiKey && (
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
              {(testStatus === 'success' || testStatusMessage) && apiKey ? (
                <View style={{ marginTop: 4 }}>
                  {/* Model and pricing info */}
                  {(() => {
                    const models = AI_MODELS[provider.id] || [];
                    const currentModel = selectedModel 
                      ? models.find(m => m.id === selectedModel)
                      : models.find(m => m.isDefault);
                    
                    if (currentModel) {
                      const pricing = MODEL_PRICING[provider.id]?.[currentModel.id];
                      const freeInfo = getFreeMessageInfo(provider.id, currentModel.id);
                      
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
                              {currentModel.name}
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
                    // Fallback for providers without model configs (like Nomi)
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

          {/* Get API Key Button */}
          <TouchableOpacity
            onPress={() => openURL(provider.getKeyUrl)}
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
                value={isEditing ? localKey : getMaskedKey(localKey)}
                onChangeText={(text) => {
                  setLocalKey(text);
                  onKeyChange(text);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!isEditing && !!apiKey}
                editable={isEditing}
                accessibilityLabel={`${provider.name} API key input`}
                accessibilityHint={`Enter your ${provider.name} API key. Current status: ${testStatus || 'not tested'}`}
              />
              
              {apiKey && (
                <TouchableOpacity
                  onPress={() => {
                    setIsEditing(!isEditing);
                    if (!isEditing) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                  }}
                  style={{ padding: 8 }}
                  accessibilityLabel={isEditing ? 'Hide API key' : 'Edit API key'}
                  accessibilityHint={isEditing ? 'Tap to hide the API key for security' : 'Tap to reveal and edit the API key'}
                  accessibilityRole="button"
                >
                  <Text>{isEditing ? '👁️' : '✏️'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Test Connection Button */}
          <GradientButton
            title={isTesting ? 'Testing...' : 'Test Connection'}
            onPress={handleTest}
            disabled={!localKey || isTesting}
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
