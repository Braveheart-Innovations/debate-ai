import React, { useState } from 'react';
import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';
import { showSheet } from '../store';
import { Box } from '../components/atoms';
import { 
  Header,
  APIConfigProgress, 
  APIProviderList, 
  APISecurityNote, 
  APIComingSoon 
} from '../components/organisms';
import { useAPIKeys } from '../hooks/useAPIKeys';
import { useProviderVerification } from '../hooks/useProviderVerification';
import { useAPIConfigHandlers } from '../hooks/useAPIConfigHandlers';
import { useAPIConfigData } from '../hooks/useAPIConfigData';

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

  // Create wrapper for toggle expand to pass state setters
  const onToggleExpand = (providerId: string) => {
    handleToggleExpand(providerId, expandedProvider, setExpandedProvider);
  };

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
            />
            
            <APIComingSoon providers={disabledProviders} />
            
            <APISecurityNote />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Box>
  );
};

export default APIConfigScreen;
