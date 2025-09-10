import React, { useState, useMemo } from 'react';
import { ScrollView, View, Alert, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setAIPersonality, setAIModel } from '../store';

import { Box } from '../components/atoms';
import { Typography, Button } from '../components/molecules';
import { Header, HeaderActions, DynamicAISelector } from '../components/organisms';

import { useTheme } from '../theme';
import { AIConfig } from '../types';
import { AI_PROVIDERS } from '../config/aiProviders';
import { AI_MODELS } from '../config/modelConfigs';
import { getAIProviderIcon } from '../utils/aiProviderAssets';
import { TrialBanner } from '@/components/molecules/subscription/TrialBanner';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';

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
  const dispatch = useDispatch();
  const apiKeys = useSelector((state: RootState) => state.settings.apiKeys || {});
  const access = useFeatureAccess();
  const expertMode = useSelector((state: RootState) => state.settings.expertMode || {});
  
  // Calculate half screen width for each selector
  const screenWidth = Dimensions.get('window').width;
  const selectorWidth = (screenWidth - theme.spacing.lg * 2 - theme.spacing.sm * 2) / 2;
  
  // Get configured AIs based on which ones have API keys
  const configuredAIs = useMemo(() => {
    return AI_PROVIDERS
      .filter(provider => provider.enabled && apiKeys[provider.id as keyof typeof apiKeys])
      .map(provider => {
        const iconData = getAIProviderIcon(provider.id);
        const providerDefault = AI_MODELS[provider.id]?.find(m => m.isDefault)?.id || AI_MODELS[provider.id]?.[0]?.id || '';
        const expertCfg = (expertMode as Record<string, { enabled?: boolean; selectedModel?: string }>)[provider.id];
        const defaultModel = expertCfg?.enabled && expertCfg.selectedModel ? expertCfg.selectedModel : providerDefault;
        return {
          id: provider.id,
          provider: provider.id,
          name: provider.name,
          model: defaultModel,
          personality: 'balanced',
          icon: iconData.icon,
          iconType: iconData.iconType,
          color: provider.color,
        } as AIConfig;
      });
  }, [apiKeys, expertMode]);
  
  // Separate states for left and right AI selection - initialize from route params if available
  const [leftAI, setLeftAI] = useState<AIConfig[]>(
    route?.params?.preselectedLeftAI ? [route.params.preselectedLeftAI] : []
  );
  const [rightAI, setRightAI] = useState<AIConfig[]>(
    route?.params?.preselectedRightAI ? [route.params.preselectedRightAI] : []
  );
  
  // Separate personality and model states
  const [leftPersonalities, setLeftPersonalities] = useState<{ [aiId: string]: string }>({});
  const [rightPersonalities, setRightPersonalities] = useState<{ [aiId: string]: string }>({});
  const [leftModels, setLeftModels] = useState<{ [aiId: string]: string }>({});
  const [rightModels, setRightModels] = useState<{ [aiId: string]: string }>({});
  
  const handleToggleLeftAI = (ai: AIConfig) => {
    setLeftAI(leftAI.length > 0 && leftAI[0].id === ai.id ? [] : [ai]);
  };
  
  const handleToggleRightAI = (ai: AIConfig) => {
    setRightAI(rightAI.length > 0 && rightAI[0].id === ai.id ? [] : [ai]);
  };
  
  const handleStartComparison = () => {
    if (leftAI.length === 0 || rightAI.length === 0) {
      Alert.alert('Select Both AIs', 'You need to select one AI for each side to start comparing!');
      return;
    }
    
    // Update AIs with selected models
    const leftAIConfig = {
      ...leftAI[0],
      model: leftModels[leftAI[0].id] || leftAI[0].model,
      personality: leftPersonalities[leftAI[0].id] || 'balanced',
    };
    
    const rightAIConfig = {
      ...rightAI[0],
      model: rightModels[rightAI[0].id] || rightAI[0].model,
      personality: rightPersonalities[rightAI[0].id] || 'balanced',
    };
    
    // Save personalities and models to Redux for the session
    dispatch(setAIPersonality({ aiId: leftAI[0].id, personalityId: leftAIConfig.personality }));
    dispatch(setAIModel({ aiId: leftAI[0].id, modelId: leftAIConfig.model }));
    dispatch(setAIPersonality({ aiId: rightAI[0].id, personalityId: rightAIConfig.personality }));
    dispatch(setAIModel({ aiId: rightAI[0].id, modelId: rightAIConfig.model }));
    
    navigation.navigate('CompareSession', { 
      leftAI: leftAIConfig,
      rightAI: rightAIConfig,
    });
  };
  
  const bothSelected = leftAI.length > 0 && rightAI.length > 0;
  
  return (
    <SafeAreaView 
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'left', 'right']}
    >
      <TrialBanner />
      <Header
        variant="gradient"
        title="Compare AIs"
        subtitle={bothSelected ? "Ready to compare" : "Select two AIs to compare"}
        showTime={false}
        showDate={true}
        animated={true}
        rightElement={<HeaderActions variant="gradient" />}
      />
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Instructions */}
        <Box style={{ marginBottom: theme.spacing.xl }}>
          <Typography variant="body" color="secondary" style={{ textAlign: 'center' }}>
            Select two different AIs to compare their responses to the same prompts. 
            Each AI will respond independently without seeing the other's response.
          </Typography>
        </Box>
        
        {/* Side by Side AI Selectors */}
        <View style={{ flexDirection: 'row', marginBottom: theme.spacing.xl }}>
          {/* Left AI Selector */}
          <View style={{ flex: 1, paddingRight: theme.spacing.sm }}>
            <Typography 
              variant="subtitle" 
              weight="bold" 
              color="primary" 
              style={{ textAlign: 'center', marginBottom: theme.spacing.md }}
            >
              Left AI
            </Typography>
            <DynamicAISelector
              configuredAIs={configuredAIs}
              selectedAIs={leftAI}
              maxAIs={1}
              onToggleAI={handleToggleLeftAI}
              hideStartButton={true}
              hideHeader={true}
              columnCount={1}
              containerWidth={selectorWidth}
              onAddAI={() => navigation.navigate('APIConfig')}
              isPremium={access.isPremium || access.isInTrial}
              aiPersonalities={leftPersonalities}
              selectedModels={leftModels}
              onPersonalityChange={(aiId, personalityId) => 
                setLeftPersonalities(prev => ({ ...prev, [aiId]: personalityId }))
              }
              onModelChange={(aiId, modelId) => 
                setLeftModels(prev => ({ ...prev, [aiId]: modelId }))
              }
            />
          </View>
          
          {/* Divider */}
          <View style={{ 
            width: 1, 
            backgroundColor: theme.colors.border,
            marginHorizontal: theme.spacing.sm,
          }} />
          
          {/* Right AI Selector */}
          <View style={{ flex: 1, paddingLeft: theme.spacing.sm }}>
            <Typography 
              variant="subtitle" 
              weight="bold" 
              color="primary" 
              style={{ textAlign: 'center', marginBottom: theme.spacing.md }}
            >
              Right AI
            </Typography>
            <DynamicAISelector
              configuredAIs={configuredAIs}
              selectedAIs={rightAI}
              maxAIs={1}
              onToggleAI={handleToggleRightAI}
              hideStartButton={true}
              hideHeader={true}
              columnCount={1}
              containerWidth={selectorWidth}
              onAddAI={() => navigation.navigate('APIConfig')}
              isPremium={access.isPremium || access.isInTrial}
              aiPersonalities={rightPersonalities}
              selectedModels={rightModels}
              onPersonalityChange={(aiId, personalityId) => 
                setRightPersonalities(prev => ({ ...prev, [aiId]: personalityId }))
              }
              onModelChange={(aiId, modelId) => 
                setRightModels(prev => ({ ...prev, [aiId]: modelId }))
              }
            />
          </View>
        </View>
        
        {/* Start Comparison Button */}
        {bothSelected && (
          <Button
            title="Start Comparison"
            onPress={handleStartComparison}
            variant="primary"
            size="large"
            style={{ marginTop: theme.spacing.lg }}
          />
        )}
        
        {/* Need More AIs Message */}
        {configuredAIs.length < 2 && (
          <Box style={{ 
            marginTop: theme.spacing.xl, 
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.warning[100],
            borderRadius: theme.borderRadius.lg,
          }}>
            <Typography variant="body" color="primary" style={{ textAlign: 'center' }}>
              You need at least 2 configured AIs to use the Compare feature.
            </Typography>
            <Button
              title="Add AI Keys"
              onPress={() => navigation.navigate('APIConfig')}
              variant="secondary"
              size="medium"
              style={{ marginTop: theme.spacing.md }}
            />
          </Box>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default CompareSetupScreen;
