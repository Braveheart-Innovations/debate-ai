import React, { useState, useCallback } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { showSheet } from '../store';
import { Box } from '../components/atoms';
import {
  Header,
  APIConfigProgress,
  APIProviderList,
  APISecurityNote,
  APIComingSoon,
  APIKeyGuidanceModal,
  APIKeyWebViewModal,
} from '../components/organisms';
import { useAPIKeys } from '../hooks/useAPIKeys';
import { useProviderVerification } from '../hooks/useProviderVerification';
import { useAPIConfigHandlers } from '../hooks/useAPIConfigHandlers';
import { useAPIConfigData } from '../hooks/useAPIConfigData';
import { useAPIKeyClipboardDetection } from '../hooks/apiKeyAcquisition/useAPIKeyClipboardDetection';
import { useAPIKeyFlowState } from '../hooks/apiKeyAcquisition/useAPIKeyFlowState';
import { AIProvider, getProviderById } from '../config/aiProviders';
import { ProviderId } from '../services/apiKeyAcquisition';

interface APIConfigScreenProps {
  navigation: {
    goBack: () => void;
  };
}

const APIConfigScreen: React.FC<APIConfigScreenProps> = ({ navigation }) => {
  const dispatch = useDispatch();
  // Custom hooks
  const { apiKeys, clearAll } = useAPIKeys();
  const { clearAllVerifications } = useProviderVerification();
  const {
    enabledProviders,
    disabledProviders,
    configuredCount,
    verificationStatus,
    expertModeConfigs
  } = useAPIConfigData();
  const {
    handleKeyChange,
    handleTestConnection,
    handleSaveKey,
    handleToggleExpand,
  } = useAPIConfigHandlers();

  // UI state
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  // Modal state
  const [guidanceModalProvider, setGuidanceModalProvider] = useState<AIProvider | null>(null);
  const [webViewModalProvider, setWebViewModalProvider] = useState<AIProvider | null>(null);

  // Clipboard detection - watch for keys when a provider is expanded
  const { detectedKey, clearDetectedKey, checkClipboard } = useAPIKeyClipboardDetection({
    expectedProviderId: expandedProvider as ProviderId | undefined,
    autoCheck: true,
  });

  // Flow state management
  const { startFlow, completeFlow, cancelFlow } = useAPIKeyFlowState();

  // Create wrapper for toggle expand to pass state setters
  const onToggleExpand = (providerId: string) => {
    handleToggleExpand(providerId, expandedProvider, setExpandedProvider);
  };

  // Handle "Get API Key" button press - show guidance modal
  const handleGetApiKey = useCallback((providerId: string) => {
    const provider = getProviderById(providerId);
    if (provider) {
      setGuidanceModalProvider(provider);
      startFlow(providerId as ProviderId);
    }
  }, [startFlow]);

  // Handle guidance modal "Let's Go" - open WebView
  const handleGuidanceContinue = useCallback(() => {
    setWebViewModalProvider(guidanceModalProvider);
    setGuidanceModalProvider(null);
  }, [guidanceModalProvider]);

  // Handle guidance modal "I already have a key" - just close
  const handleGuidanceSkip = useCallback(() => {
    setGuidanceModalProvider(null);
    cancelFlow();
  }, [cancelFlow]);

  // Handle WebView "I've copied my key" - close and check clipboard
  const handleWebViewKeyObtained = useCallback(async () => {
    setWebViewModalProvider(null);
    // Check clipboard for the key
    const result = await checkClipboard();
    if (result?.detected && result.content && webViewModalProvider) {
      // Auto-fill the key
      handleKeyChange(webViewModalProvider.id, result.content);
    }
    completeFlow();
  }, [checkClipboard, webViewModalProvider, handleKeyChange, completeFlow]);

  // Handle WebView close
  const handleWebViewClose = useCallback(() => {
    setWebViewModalProvider(null);
    cancelFlow();
  }, [cancelFlow]);

  // Handle WebView fallback to browser
  const handleFallbackToBrowser = useCallback(async () => {
    if (webViewModalProvider) {
      await Linking.openURL(webViewModalProvider.getKeyUrl);
    }
    setWebViewModalProvider(null);
  }, [webViewModalProvider]);

  // Handle using detected clipboard key
  const handleUseClipboardKey = useCallback((providerId: string) => {
    if (detectedKey?.content) {
      handleKeyChange(providerId, detectedKey.content);
      clearDetectedKey();
    }
  }, [detectedKey, handleKeyChange, clearDetectedKey]);

  // Determine which provider has a clipboard key detected
  const clipboardKeyProviderId = detectedKey?.detected && detectedKey?.providerId
    ? detectedKey.providerId
    : expandedProvider && detectedKey?.detected
      ? expandedProvider
      : null;

  return (
    <Box style={{ flex: 1 }} backgroundColor="background">
      <SafeAreaView style={{ flex: 1 }}>
        <Header
          variant="gradient"
          title="API Configuration"
          subtitle="Add or Modify Your AIs"
          onBack={() => {
            navigation.goBack();
            dispatch(showSheet({ sheet: 'settings' }));
          }}
          showBackButton={true}
          showTime={true}
          animated={true}
        />
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            <APIConfigProgress
              configuredCount={configuredCount}
              totalCount={enabledProviders.length}
              onClearAll={async () => {
                await clearAll();
                await clearAllVerifications();
              }}
            />
            
            <APIProviderList
              providers={enabledProviders}
              apiKeys={apiKeys}
              verificationStatus={verificationStatus}
              onKeyChange={handleKeyChange}
              onTest={handleTestConnection}
              onSave={handleSaveKey}
              onToggleExpand={onToggleExpand}
              expandedProvider={expandedProvider}
              expertModeConfigs={expertModeConfigs}
              onGetApiKey={handleGetApiKey}
              clipboardKeyProviderId={clipboardKeyProviderId}
              onUseClipboardKey={handleUseClipboardKey}
            />
            
            <APIComingSoon providers={disabledProviders} />
            
            <APISecurityNote />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Guidance Modal - Pre-flight instructions */}
      <APIKeyGuidanceModal
        visible={!!guidanceModalProvider}
        provider={guidanceModalProvider}
        onContinue={handleGuidanceContinue}
        onSkip={handleGuidanceSkip}
        onClose={() => {
          setGuidanceModalProvider(null);
          cancelFlow();
        }}
      />

      {/* WebView Modal - In-app browser */}
      <APIKeyWebViewModal
        visible={!!webViewModalProvider}
        provider={webViewModalProvider}
        onKeyObtained={handleWebViewKeyObtained}
        onClose={handleWebViewClose}
        onFallbackToBrowser={handleFallbackToBrowser}
      />
    </Box>
  );
};

export default APIConfigScreen;
