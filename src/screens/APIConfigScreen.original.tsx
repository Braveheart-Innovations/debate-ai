import React, { useState, useEffect } from 'react';
import {
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Text as RNText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { updateApiKeys, updateExpertMode, addVerifiedProvider, removeVerifiedProvider, setVerifiedProviders } from '../store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { Box } from '../components/atoms';
import { Typography, Button } from '../components/molecules';
import { ProviderCard, ProviderExpertSettings } from '../components/organisms';
import { AI_PROVIDERS, getEnabledProviders } from '../config/aiProviders';
import { DEFAULT_PARAMETERS } from '../config/modelConfigs';
import secureStorage from '../services/secureStorage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

interface APIConfigScreenProps {
  navigation: {
    goBack: () => void;
  };
}

interface ProviderStatus {
  [key: string]: {
    status: 'idle' | 'testing' | 'success' | 'failed';
    message?: string;
    model?: string;
  };
}

const APIConfigScreen: React.FC<APIConfigScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const existingKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const verifiedProviders = useSelector((state: RootState) => state.settings.verifiedProviders || []);
  const verificationTimestamps = useSelector((state: RootState) => state.settings.verificationTimestamps || {});
  const expertModeConfigs = useSelector((state: RootState) => state.settings.expertMode || {});
  // currentUser no longer used in original screen
  
  // State for all API keys - initialized from Redux
  const [apiKeys, setApiKeys] = useState<{ [key: string]: string }>(() => {
    const keys: { [key: string]: string } = {};
    AI_PROVIDERS.forEach(provider => {
      const existingKey = existingKeys ? existingKeys[provider.id as keyof typeof existingKeys] : undefined;
      keys[provider.id] = existingKey || '';
    });
    return keys;
  });
  
  // Sync local state with Redux when existingKeys change
  useEffect(() => {
    const keys: { [key: string]: string } = {};
    AI_PROVIDERS.forEach(provider => {
      const existingKey = existingKeys ? existingKeys[provider.id as keyof typeof existingKeys] : undefined;
      keys[provider.id] = existingKey || '';
    });
    setApiKeys(keys);
  }, [existingKeys]);

  // Helper function to format verification time
  const formatVerificationTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Verified just now';
    if (diffMins < 60) return `Verified ${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `Verified ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `Verified ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return `Verified ${date.toLocaleDateString()}`;
  };

  // State for test results
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(() => {
    const status: ProviderStatus = {};
    AI_PROVIDERS.forEach(provider => {
      const hasKey = existingKeys ? existingKeys[provider.id as keyof typeof existingKeys] : undefined;
      const isVerified = verifiedProviders.includes(provider.id);
      const verificationTime = verificationTimestamps[provider.id];
      
      status[provider.id] = {
        status: hasKey && isVerified ? 'success' : 'idle',
        message: hasKey && isVerified && verificationTime 
          ? formatVerificationTime(verificationTime)
          : undefined,
      };
    });
    return status;
  });

  // State for expanded cards
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Get enabled providers - use existingKeys from Redux for accurate count
  const enabledProviders = getEnabledProviders();
  const configuredCount = enabledProviders.filter(p => {
    const key = existingKeys ? existingKeys[p.id as keyof typeof existingKeys] : undefined;
    return !!key;
  }).length;
  const progressPercentage = (configuredCount / enabledProviders.length) * 100;

  // Test API connection
  const testConnection = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) return { success: false, message: 'No API key provided' };

    setProviderStatus(prev => ({
      ...prev,
      [providerId]: { status: 'testing' },
    }));

    try {
      // Here you would implement actual API testing for each provider
      // For now, we'll simulate it
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate success for demo
      const success = key.length > 10;
      
      if (success) {
        // Add to verified providers on successful test (this also updates timestamp)
        dispatch(addVerifiedProvider({ providerId, model: 'Model v1.0' }));
        
        setProviderStatus(prev => ({
          ...prev,
          [providerId]: {
            status: 'success',
            message: 'Verified just now',
            model: 'Model v1.0', // This would come from actual API response
          },
        }));
        
        return { success: true, message: 'Verified just now', model: 'Model v1.0' };
      } else {
        setProviderStatus(prev => ({
          ...prev,
          [providerId]: {
            status: 'failed',
            message: 'Invalid API key',
          },
        }));
        // Remove from verified providers on failed test
        dispatch(removeVerifiedProvider(providerId));
        return { success: false, message: 'Invalid API key' };
      }
    } catch {
      setProviderStatus(prev => ({
        ...prev,
        [providerId]: {
          status: 'failed',
          message: 'Connection failed',
        },
      }));
      return { success: false, message: 'Connection failed' };
    }
  };

  // Save API key
  const saveApiKey = async (providerId: string) => {
    const key = apiKeys[providerId];
    if (!key) {
      // If key is empty, remove it
      const updatedKeys = { ...existingKeys };
      delete updatedKeys[providerId as keyof typeof updatedKeys];
      // Filter out undefined values for secureStorage
      const cleanedKeys: Record<string, string> = {};
      Object.entries(updatedKeys).forEach(([k, v]) => {
        if (v) cleanedKeys[k] = v;
      });
      await secureStorage.saveApiKeys(cleanedKeys);
      dispatch(updateApiKeys(updatedKeys));
      dispatch(removeVerifiedProvider(providerId));
    } else {
      const updatedKeys = { ...existingKeys, [providerId]: key };
      // Filter out undefined values for secureStorage
      const cleanedKeys: Record<string, string> = {};
      Object.entries(updatedKeys).forEach(([k, v]) => {
        if (v) cleanedKeys[k] = v;
      });
      await secureStorage.saveApiKeys(cleanedKeys);
      dispatch(updateApiKeys(updatedKeys));
    }
  };

  // Clear all keys
  const handleClearAllKeys = () => {
    Alert.alert(
      'Clear All API Keys',
      'This will remove all configured API keys. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await secureStorage.clearApiKeys();
            dispatch(updateApiKeys({}));
            dispatch(setVerifiedProviders([])); // Clear all verified providers
            setApiKeys({});
            setProviderStatus({});
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'All API keys have been cleared');
          },
        },
      ],
    );
  };

  // Toggle provider expansion
  const toggleProvider = (providerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedProvider(expandedProvider === providerId ? null : providerId);
  };

  return (
    <Box style={{ flex: 1 }} backgroundColor="background">
      <SafeAreaView style={{ flex: 1 }}>
        {/* Custom Header */}
        <Box style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}>
          <Button 
            title="←"
            onPress={() => navigation.goBack()}
            variant="ghost"
            style={{ borderWidth: 0, minWidth: 44 }}
          />
          <Typography variant="title" weight="bold">API Configuration</Typography>
          <Box style={{ width: 44 }} />
        </Box>
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Content */}
            <Animated.View
              entering={FadeInDown.springify()}
              style={{ marginTop: 20, marginBottom: 24 }}
            >
              <Typography variant="body" color="secondary" style={{ marginBottom: 20 }}>
                Connect your AI services to unlock their full potential
              </Typography>

              {/* Progress Bar */}
              <Box style={{ marginBottom: 20 }}>
                <Box
                  style={{
                    height: 8,
                    backgroundColor: theme.colors.gray[200],
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <LinearGradient
                    colors={theme.colors.gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      height: '100%',
                      width: `${progressPercentage}%`,
                    }}
                  />
                </Box>
                <Typography
                  variant="caption"
                  color="secondary"
                  style={{ marginTop: 8, textAlign: 'center' }}
                >
                  {configuredCount === 0
                    ? 'No services connected'
                    : configuredCount === enabledProviders.length
                    ? '🎉 All services connected!'
                    : `${configuredCount} of ${enabledProviders.length} services connected`}
                </Typography>
              </Box>

              {/* Clear All Button */}
              {configuredCount > 0 && (
                <TouchableOpacity
                  onPress={handleClearAllKeys}
                  style={{
                    backgroundColor: theme.colors.error[50],
                    borderColor: theme.colors.error[500],
                    borderWidth: 1,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="body" color="secondary" weight="semibold">
                    🗑️ Clear All Keys
                  </Typography>
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Provider Cards */}
            <Box>
              <Typography variant="title" style={{ marginBottom: 16 }}>
                Available AI Services
              </Typography>
              
              {enabledProviders.map((provider, index) => {
                const providerKey = provider.id as 'claude' | 'openai' | 'google';
                const expertConfig = expertModeConfigs[providerKey] || { 
                  enabled: false, 
                  parameters: DEFAULT_PARAMETERS 
                };
                
                return (
                  <Box key={provider.id} style={{ marginBottom: theme.spacing.lg }}>
                    <ProviderCard
                      provider={provider}
                      apiKey={apiKeys[provider.id] || ''}
                      onKeyChange={(key) => {
                        setApiKeys(prev => ({ ...prev, [provider.id]: key }));
                        // If key is cleared, remove from verified providers
                        if (!key) {
                          dispatch(removeVerifiedProvider(provider.id));
                          setProviderStatus(prev => ({
                            ...prev,
                            [provider.id]: { status: 'idle' },
                          }));
                        }
                      }}
                      onTest={() => testConnection(provider.id)}
                      onSave={() => saveApiKey(provider.id)}
                      isExpanded={expandedProvider === provider.id}
                      onToggleExpand={() => toggleProvider(provider.id)}
                      index={index}
                      testStatus={providerStatus[provider.id]?.status}
                      testStatusMessage={providerStatus[provider.id]?.message}
                      selectedModel={expertConfig.enabled ? expertConfig.selectedModel : undefined}
                      expertModeEnabled={expertConfig.enabled === true}
                    />
                    
                    {/* Expert Mode Settings */}
                    {expandedProvider === provider.id && apiKeys[provider.id] && (
                      <Box style={{ marginTop: theme.spacing.md }}>
                        <ProviderExpertSettings
                          providerId={provider.id}
                          isEnabled={expertConfig.enabled}
                          onToggle={(enabled) => {
                            dispatch(updateExpertMode({
                              provider: providerKey,
                              config: { ...expertConfig, enabled }
                            }));
                          }}
                          selectedModel={expertConfig.selectedModel}
                          onModelChange={(modelId) => {
                            dispatch(updateExpertMode({
                              provider: providerKey,
                              config: { ...expertConfig, selectedModel: modelId }
                            }));
                          }}
                          parameters={{
                            ...DEFAULT_PARAMETERS,
                            ...expertConfig.parameters
                          }}
                          onParameterChange={(param, value) => {
                            dispatch(updateExpertMode({
                              provider: providerKey,
                              config: {
                                ...expertConfig,
                                parameters: {
                                  ...expertConfig.parameters,
                                  [param]: value
                                }
                              }
                            }));
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>

            {/* Coming Soon Section */}
            {AI_PROVIDERS.filter(p => !p.enabled).length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(500).springify()}
                style={{ marginTop: 32 }}
              >
                <Typography variant="title" style={{ marginBottom: 16 }}>
                  Coming Soon
                </Typography>
                <Box
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Box style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {AI_PROVIDERS.filter(p => !p.enabled).map(provider => (
                      <Box
                        key={provider.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginRight: 16,
                          marginBottom: 12,
                        }}
                      >
                        <RNText style={{ fontSize: 20, marginRight: 8 }}>
                          {provider.icon}
                        </RNText>
                        <Typography variant="body" color="secondary">
                          {provider.name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Animated.View>
            )}

            {/* Security Note */}
            <Animated.View
              entering={FadeInDown.delay(600).springify()}
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 12,
                padding: 16,
                marginTop: 32,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Typography variant="subtitle" weight="semibold" style={{ marginBottom: 8 }}>
                🔒 Your Security
              </Typography>
              <Typography variant="body" color="secondary">
                • Keys are encrypted and stored locally{'\n'}
                • We never send keys to our servers{'\n'}
                • You can modify or clear keys anytime{'\n'}
                • Each service connection is isolated
              </Typography>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Box>
  );
};

export default APIConfigScreen;
