import React from 'react';
import { View } from 'react-native';
import { GPT5LatencyWarning } from '../../molecules/GPT5LatencyWarning';
import { AIConfig } from '../../../types';

export interface ChatWarningsProps {
  selectedAIs: AIConfig[];
  onSwitchModel?: (from: string, to: string) => void;
}

export const ChatWarnings: React.FC<ChatWarningsProps> = ({
  selectedAIs,
  onSwitchModel,
}) => {
  // Check if any selected AI is using GPT-5
  const hasGPT5 = selectedAIs.some(ai => 
    ai.model.startsWith('gpt-5') || ai.model === 'gpt-5'
  );

  if (!hasGPT5) {
    return null;
  }

  const handleSwitchToGPT4o = () => {
    // Find the AI using GPT-5 and switch to GPT-4o
    const gpt5AI = selectedAIs.find(ai => 
      ai.model.startsWith('gpt-5') || ai.model === 'gpt-5'
    );
    
    if (gpt5AI && onSwitchModel) {
      onSwitchModel(gpt5AI.model, 'gpt-4o');
    }
  };

  return (
    <View>
      <GPT5LatencyWarning
        showAlternativeButton={!!onSwitchModel}
        onSwitchToAlternative={handleSwitchToGPT4o}
      />
    </View>
  );
};