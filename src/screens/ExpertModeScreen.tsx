import React, { useState, useCallback } from 'react';
import { ScrollView, TouchableOpacity, View, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Box } from '../components/atoms';
import { Header } from '../components/organisms';
import { Typography } from '../components/molecules';
import { AI_PROVIDERS } from '../config/aiProviders';
import { useTheme } from '../theme';
import { ProviderExpertSettings } from '../components/organisms';
import { DEFAULT_PARAMETERS } from '../config/modelConfigs';
import { RootState, updateExpertMode, showSheet } from '../store';
import { useDispatch } from 'react-redux';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getAIProviderIcon } from '../utils/aiProviderAssets';

const ExpertModeScreen: React.FC<{ navigation: { goBack: () => void } }> = ({ navigation }) => {
  const { theme, isDark } = useTheme();
  const dispatch = useDispatch();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const expertMode = useSelector((state: RootState) => state.settings.expertMode || {});

  const providersWithKeys = AI_PROVIDERS.filter(p => p.enabled && !!apiKeys[p.id]);
  const [expanded, setExpanded] = useState<string | null>(providersWithKeys[0]?.id || null);

  const toggle = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(prev => (prev === id ? null : id));
  }, []);

  return (
    <Box style={{ flex: 1 }} backgroundColor="background">
      <SafeAreaView style={{ flex: 1 }}>
        <Header
          variant="gradient"
          title="Expert Mode"
          subtitle="Set Defaults & Parameters"
          onBack={() => {
            navigation.goBack();
            dispatch(showSheet({ sheet: 'settings' }));
          }}
          showBackButton={true}
          showTime={true}
          animated={true}
        />
        <ScrollView
          contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          {providersWithKeys.length === 0 ? (
            <Box style={{ padding: theme.spacing.lg }}>
              <Typography variant="body" color="secondary" align="center">
                Add an API key in Settings → API Configuration to configure Expert Mode.
              </Typography>
            </Box>
          ) : (
            providersWithKeys.map((provider, index) => {
              const cfg = expertMode[provider.id] || { enabled: false, parameters: DEFAULT_PARAMETERS };
              return (
                <Animated.View key={provider.id} entering={FadeInDown.delay(index * 60).springify()} layout={Layout.springify()}>
                  <View
                    style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: theme.borderRadius.lg,
                      borderWidth: 1,
                      borderColor: expanded === provider.id ? provider.color : theme.colors.border,
                      marginBottom: theme.spacing.md,
                      overflow: 'hidden',
                      ...(expanded === provider.id
                        ? Platform.select({
                            android: { elevation: 10 },
                            ios: {
                              shadowColor: '#000',
                              shadowOpacity: 0.2,
                              shadowRadius: 12,
                              shadowOffset: { width: 0, height: 6 },
                            },
                            default: {},
                          })
                        : {}),
                    }}
                  >
                    {/* Header row with branding and collapse toggle */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => toggle(provider.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: theme.spacing.md,
                        backgroundColor: theme.colors.card,
                      }}
                    >
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
                                ...(isDark && { tintColor: '#FFFFFF' }),
                              }}
                            />
                          );
                        }
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
                            <Typography style={{ color: '#FFFFFF', fontWeight: 'bold' }}>
                              {String(iconData.icon)}
                            </Typography>
                          </LinearGradient>
                        );
                      })()}
                      <View style={{ flex: 1 }}>
                        <Typography variant="subtitle" weight="semibold">
                          {provider.name}
                        </Typography>
                        <Typography variant="caption" color="secondary">
                          Configure default model and parameters
                        </Typography>
                      </View>
                      <Typography variant="body" color="secondary">
                        {expanded === provider.id ? '▲' : '▼'}
                      </Typography>
                    </TouchableOpacity>

                    {/* Collapsible content */}
                    {expanded === provider.id && (
                      <Animated.View
                        entering={FadeInDown.springify()}
                        exiting={FadeOutUp.springify()}
                        style={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md }}
                      >
                        <ProviderExpertSettings
                          providerId={provider.id}
                          isEnabled={cfg.enabled}
                          onToggle={(enabled) => dispatch(updateExpertMode({ provider: provider.id, config: { ...cfg, enabled } }))}
                          selectedModel={cfg.enabled ? cfg.selectedModel : undefined}
                          onModelChange={(modelId) => dispatch(updateExpertMode({ provider: provider.id, config: { ...cfg, selectedModel: modelId || undefined } }))}
                          parameters={{ ...DEFAULT_PARAMETERS, ...cfg.parameters }}
                          onParameterChange={(param, value) => {
                            dispatch(updateExpertMode({
                              provider: provider.id,
                              config: {
                                ...cfg,
                                parameters: {
                                  ...DEFAULT_PARAMETERS,
                                  ...cfg.parameters,
                                  [param]: Number(value),
                                },
                              },
                            }));
                          }}
                        />
                      </Animated.View>
                    )}
                  </View>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Box>
  );
};

export default ExpertModeScreen;
