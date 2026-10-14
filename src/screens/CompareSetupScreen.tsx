import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { setAIPersonality, setAIModel, showSheet, stageComposerAttachments } from '../store';
import { MessageAttachment } from '../types';

import { Box, ResponsiveContainer } from '../components/atoms';
import { Typography, Button, KeyboardAvoider } from '../components/molecules';
import { Header, HeaderActions, AIComposer } from '../components/organisms';
import { useGreeting } from '../hooks/useGreeting';

import { useTheme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { AIConfig } from '../types';
import { HOME_CONSTANTS } from '../config/homeConstants';
import { isValidProviderId } from '../utils/typeGuards';
import { fromAIConfig } from '../utils/aiSelection';
import { useComposerSelection } from '../hooks/home/useComposerSelection';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { DemoBanner } from '@/components/molecules/subscription/DemoBanner';
import { CompareSamplePickerModal } from '@/components/organisms/demo/CompareSamplePickerModal';

interface CompareSetupScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  route?: {
    params?: {
      preselectedLeftAI?: AIConfig;
      preselectedRightAI?: AIConfig;
    };
  };
}

const CompareSetupScreen: React.FC<CompareSetupScreenProps> = ({ navigation, route }) => {
  const { theme } = useTheme();
  const { rs } = useResponsive();
  const dispatch = useDispatch();
  const access = useFeatureAccess();

  const selection = useComposerSelection('compare', {
    minAIs: HOME_CONSTANTS.MIN_AIS_FOR_COMPARE,
    maxAIs: HOME_CONSTANTS.MAX_AIS_FOR_COMPARE,
  });

  const [inputText, setInputText] = useState('');
  const [samplePickerVisible, setSamplePickerVisible] = useState(false);
  const { timeBasedGreeting, welcomeMessage } = useGreeting({ screenCategory: 'compare' });

  // History rematch: route params seed the pills (left = pill 1, right = pill 2).
  const rematchSeededRef = useRef(false);
  const { preselectedLeftAI, preselectedRightAI } = route?.params ?? {};
  const { replaceConfigs } = selection;
  useEffect(() => {
    if (rematchSeededRef.current) return;
    if (!preselectedLeftAI || !preselectedRightAI) return;
    if (!isValidProviderId(preselectedLeftAI.provider) || !isValidProviderId(preselectedRightAI.provider)) return;
    rematchSeededRef.current = true;
    replaceConfigs([fromAIConfig(preselectedLeftAI), fromAIConfig(preselectedRightAI)]);
  }, [preselectedLeftAI, preselectedRightAI, replaceConfigs]);

  const configuredProviderIds = selection.configuredAIs.map(ai => ai.id);
  const leftAI = selection.selectedAIConfigs[0];
  const rightAI = selection.selectedAIConfigs[1];

  const seedSessionMaps = () => {
    // CompareScreen and session persistence read the chat-slice maps,
    // matching the previous setup screen's behavior.
    selection.selectedAIConfigs.forEach(ai => {
      dispatch(setAIPersonality({ aiId: ai.id, personalityId: ai.personality || 'default' }));
      dispatch(setAIModel({ aiId: ai.id, modelId: ai.model }));
    });
  };

  const handleSend = (text: string, attachments?: MessageAttachment[]) => {
    if (!selection.hasEnoughAIs || !leftAI || !rightAI) return;
    seedSessionMaps();
    Keyboard.dismiss();

    if (access.isDemo) {
      setSamplePickerVisible(true);
      return;
    }

    // Stage (never navigate with) attachment payloads: nav params are
    // persisted to AsyncStorage. Overwrite semantics — an empty list wipes
    // anything a previously abandoned composer left behind.
    dispatch(stageComposerAttachments({ mode: 'compare', attachments: attachments ?? [] }));
    navigation.navigate('CompareSession', {
      leftAI,
      rightAI,
      initialPrompt: text,
    });
    setInputText('');
  };

  const needsMoreKeys = !access.isDemo && selection.configuredAIs.length < 2;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['left', 'right']}
    >
      <Header
        variant="gradient"
        slim
        title="The Lens"
        rightElement={<HeaderActions variant="gradient" helpTopicId="compare-mode" />}
      />
      <TrialBanner />
      {access.isDemo && (
        <DemoBanner
          subtitle={access.canStartTrial
            ? 'Sample comparisons only in Demo. Start a free trial for live comparisons.'
            : 'Sample comparisons only in Demo. Upgrade to Premium for live comparisons.'}
          onPress={() => dispatch(showSheet({ sheet: 'subscription' }))}
        />
      )}

      <KeyboardAvoider>
        <ResponsiveContainer maxWidth="md" center style={{ flex: 1 }}>
          {/* Empty state above the docked composer — greeting first, like Home */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs('lg') }}>
            <Typography variant="title" align="center">
              {timeBasedGreeting}
            </Typography>
            <Typography
              variant="body"
              color="secondary"
              align="center"
              style={{ marginTop: 8, marginBottom: 20 }}
            >
              {welcomeMessage}
            </Typography>
            <Typography
              variant="caption"
              color="secondary"
              align="center"
            >
              Ask two AIs the same question — each answers independently, side by side.
            </Typography>
            <Typography
              variant="caption"
              color="secondary"
              align="center"
              style={{ marginTop: rs('xs') }}
            >
              Pill 1 answers in the left pane, pill 2 in the right.
            </Typography>

            {needsMoreKeys && (
              <Box style={{
                marginTop: rs('xl'),
                padding: rs('lg'),
                backgroundColor: theme.colors.warning[100],
                borderRadius: theme.borderRadius.lg,
                alignSelf: 'stretch',
              }}>
                <Typography variant="body" style={{ textAlign: 'center', color: theme.colors.warning[900] }}>
                  You need at least 2 configured AIs to use the Compare feature.
                </Typography>
                <Button
                  title="Add AI Keys"
                  onPress={() => navigation.navigate('APIConfig')}
                  variant="secondary"
                  size="medium"
                  style={{ marginTop: rs('md') }}
                />
              </Box>
            )}
          </View>

          <View style={{ paddingHorizontal: rs('md'), paddingBottom: rs('md') }}>
            <AIComposer
              mode="compare"
              configs={selection.configs}
              minAIs={HOME_CONSTANTS.MIN_AIS_FOR_COMPARE}
              maxAIs={HOME_CONSTANTS.MAX_AIS_FOR_COMPARE}
              onAddProvider={selection.addProvider}
              onUpdateConfig={selection.updateConfig}
              onRemoveConfig={selection.removeConfig}
              configuredProviderIds={configuredProviderIds}
              allowedProviderIds={access.isDemo ? configuredProviderIds : undefined}
              onRequestAddKey={
                access.isDemo ? undefined : (providerId) => navigation.navigate('APIConfig', { providerId })
              }
              showAdvancedParams={!access.isDemo}
              inputText={inputText}
              onChangeText={setInputText}
              onSend={handleSend}
              requireText={!access.isDemo}
              allowAttachments={!access.isDemo}
              placeholder={access.isDemo ? 'Pick a sample comparison to preview' : 'Ask both AIs anything…'}
              pillIndexLabels={['L', 'R']}
              testID="compare-composer"
            />
          </View>
        </ResponsiveContainer>
      </KeyboardAvoider>

      <CompareSamplePickerModal
        visible={samplePickerVisible}
        providers={leftAI && rightAI ? [leftAI.provider, rightAI.provider] : []}
        onSelect={(sampleId) => {
          setSamplePickerVisible(false);
          if (!leftAI || !rightAI) return;
          navigation.navigate('CompareSession', {
            leftAI,
            rightAI,
            demoSampleId: sampleId,
          });
        }}
        onClose={() => setSamplePickerVisible(false)}
      />
    </SafeAreaView>
  );
};

export default CompareSetupScreen;
