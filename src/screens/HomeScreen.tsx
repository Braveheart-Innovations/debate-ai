import React, { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ResponsiveContainer } from '../components/atoms';
import { Header, HeaderActions, AIComposer, HomeEmptyState, QuickStartSheet } from '../components/organisms';
import { ChatTopicPickerModal } from '@/components/organisms/demo/ChatTopicPickerModal';

import { useTheme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { HOME_CONSTANTS } from '../config/homeConstants';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { KeyboardAvoider } from '@/components/molecules';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, isApiKeyConfigured, showSheet, stageComposerAttachments } from '@/store';
import { MEDIA_PROVIDERS } from '@/config/mediaProviders';
import type { MessageAttachment } from '../types';

// Custom hooks
import { useComposerSelection } from '../hooks/home/useComposerSelection';
import { useSessionManagement } from '../hooks/home/useSessionManagement';
import { useQuickStart } from '../hooks/home/useQuickStart';
import type { QuickStartPromptPayload } from '@/services/home/QuickStartService';

interface HomeScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { theme } = useTheme();
  const { rs } = useResponsive();

  // Compose hooks for clean separation of concerns.
  // Cap is the product constant, not min(3, keyed providers): the picker
  // offers "Add key" rows for un-keyed providers, so [+] must stay reachable.
  const selection = useComposerSelection('chat', {
    minAIs: HOME_CONSTANTS.MIN_AIS_FOR_CHAT,
    maxAIs: HOME_CONSTANTS.MAX_AIS_FOR_CHAT,
  });
  const session = useSessionManagement();
  const quickStart = useQuickStart();
  const { isDemo, canStartTrial } = useFeatureAccess();
  const dispatch = useDispatch();
  const [inputText, setInputText] = useState('');
  const [topicPickerVisible, setTopicPickerVisible] = useState(false);

  const configuredProviderIds = selection.configuredAIs.map(ai => ai.id);
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const studioOnlyProviderNames = isDemo
    ? []
    : MEDIA_PROVIDERS.filter(provider => isApiKeyConfigured(apiKeys[provider.id])).map(
        provider => provider.name
      );

  const startChatSession = (params: Record<string, unknown>) => {
    const sessionId = session.createSession(selection.selectedAIConfigs, selection.sessionMaps);
    Keyboard.dismiss();
    navigation.navigate(HOME_CONSTANTS.SCREENS.CHAT, { sessionId, ...params });
  };

  const handleSend = (text: string, attachments?: MessageAttachment[]) => {
    if (!selection.hasEnoughAIs) return;
    if (isDemo) {
      setTopicPickerVisible(true);
      return;
    }
    // Stage (never navigate with) attachment payloads: nav params are
    // persisted to AsyncStorage. Overwrite semantics — an empty list wipes
    // anything a previously abandoned composer left behind.
    dispatch(stageComposerAttachments({ mode: 'chat', attachments: attachments ?? [] }));
    // Reuses the Quick Start auto-send rail in ChatScreen: identical
    // initialPrompt/userPrompt render and send the typed message as-is.
    startChatSession({ initialPrompt: text, userPrompt: text, autoSend: true });
    setInputText('');
  };

  const handleCompleteQuickStart = (payload: QuickStartPromptPayload) => {
    if (selection.hasEnoughAIs) {
      dispatch(stageComposerAttachments({ mode: 'chat', attachments: [] }));
      startChatSession({
        initialPrompt: payload.aiPrompt,
        userPrompt: payload.userPrompt,
        autoSend: true,
      });
    }
    quickStart.closeSheet();
  };

  const handleAddKey = (providerId?: string) => {
    if (providerId) {
      navigation.navigate(HOME_CONSTANTS.SCREENS.API_CONFIG, { providerId });
    } else {
      navigation.navigate(HOME_CONSTANTS.SCREENS.API_CONFIG);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['left', 'right']}>
      <Header
        variant="gradient"
        slim
        title="The Forum"
        rightElement={<HeaderActions variant="gradient" helpCategoryId="chat" />}
      />

      <TrialBanner />

      {isDemo && (
        <DemoBanner
          subtitle={canStartTrial
            ? 'Simulated chat preview. Start a free trial to chat for real.'
            : 'Simulated chat preview. Upgrade to Premium to chat for real.'}
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />
      )}

      <KeyboardAvoider>
        <ResponsiveContainer maxWidth="md" center style={{ flex: 1 }}>
          <HomeEmptyState
            hasConfiguredAIs={selection.configuredAIs.length > 0}
            onQuickStart={!isDemo && selection.hasEnoughAIs ? quickStart.openSheet : undefined}
            onConfigureAIs={() => handleAddKey()}
            studioOnlyProviderNames={studioOnlyProviderNames}
            onOpenStudio={() => navigation.navigate('CreateTab')}
          />

          <View style={{ paddingHorizontal: rs('md'), paddingBottom: rs('md') }}>
            <AIComposer
              mode="chat"
              configs={selection.configs}
              minAIs={HOME_CONSTANTS.MIN_AIS_FOR_CHAT}
              maxAIs={HOME_CONSTANTS.MAX_AIS_FOR_CHAT}
              onAddProvider={selection.addProvider}
              onUpdateConfig={selection.updateConfig}
              onRemoveConfig={selection.removeConfig}
              configuredProviderIds={configuredProviderIds}
              allowedProviderIds={isDemo ? configuredProviderIds : undefined}
              onRequestAddKey={isDemo ? undefined : handleAddKey}
              showAdvancedParams={!isDemo}
              inputText={inputText}
              onChangeText={setInputText}
              onSend={handleSend}
              requireText={!isDemo}
              allowAttachments={!isDemo}
              placeholder={isDemo ? 'Pick a sample topic to preview' : 'Ask anything…'}
              testID="home-composer"
            />
          </View>
        </ResponsiveContainer>
      </KeyboardAvoider>

      <QuickStartSheet
        visible={quickStart.showSheet}
        templates={quickStart.templates}
        onClose={quickStart.closeSheet}
        onStart={handleCompleteQuickStart}
      />

      {/* Demo Mode: Chat Topic Picker */}
      {isDemo && (
        <ChatTopicPickerModal
          visible={topicPickerVisible}
          providers={selection.selectedAIConfigs.map(a => a.provider)}
          personaId={selection.configs.length === 1 ? selection.configs[0].personalityId : undefined}
          onClose={() => setTopicPickerVisible(false)}
          onSelect={(sampleId) => {
            setTopicPickerVisible(false);
            startChatSession({ demoSampleId: sampleId });
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default HomeScreen;
