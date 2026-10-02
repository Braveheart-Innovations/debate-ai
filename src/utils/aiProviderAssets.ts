import claudeLogo from '../../assets/ai-providers/claude/logo.png';
import openaiLogo from '../../assets/ai-providers/openai/logo.png';
import googleLogo from '../../assets/ai-providers/google/logo.png';
import perplexityLogo from '../../assets/ai-providers/perplexity/logo.png';
import mistralLogo from '../../assets/ai-providers/mistral/logo.png';
import grokLogo from '../../assets/ai-providers/grok/logo.png';
import cohereLogo from '../../assets/ai-providers/cohere/logo.png';
import deepseekLogo from '../../assets/ai-providers/deepseek/logo.png';
import moonshotLogo from '../../assets/ai-providers/moonshot/logo.png';
import zaiLogo from '../../assets/ai-providers/zai/logo.png';

// Helper to get AI provider logos with automatic fallback
// NOTE: Metro resolves assets statically, so every possible logo is imported explicitly
// To update logos: 1) Replace the file 2) Clear Metro cache: npx expo start -c

const aiProviderLogos: { [key: string]: number } = {
  claude: claudeLogo,
  openai: openaiLogo,
  google: googleLogo,
  perplexity: perplexityLogo,
  mistral: mistralLogo,
  grok: grokLogo,
  cohere: cohereLogo,
  deepseek: deepseekLogo,
  moonshot: moonshotLogo,
  zai: zaiLogo,
};

export function getAIProviderIcon(providerId: string) {
  // Check if we have a logo for this provider
  if (aiProviderLogos[providerId]) {
    return {
      icon: aiProviderLogos[providerId],
      iconType: 'image' as const,
    };
  }
  
  // Fallback to letter-based icon
  const letterMap: { [key: string]: string } = {
    claude: 'C',
    openai: 'GPT',
    google: 'G',
    perplexity: 'P',
    mistral: 'M',
    cohere: 'Co',
    deepseek: 'DS',
    grok: 'X',
    moonshot: 'K',
    zai: 'GLM',
    runway: 'R',
    elevenlabs: '11',
  };
  
  return {
    icon: letterMap[providerId] || providerId.charAt(0).toUpperCase(),
    iconType: 'letter' as const,
  };
}
