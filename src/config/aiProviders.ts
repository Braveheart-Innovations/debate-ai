export interface GuidanceStep {
  urlPattern: string;
  title: string;
  instruction: string;
}

export interface ProviderGuidance {
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  steps: GuidanceStep[];
  tips: string[];
}

export interface AIProvider {
  id: string;
  name: string;
  company: string;
  color: string;
  gradient: [string, string];
  icon?: string | number;
  iconType?: 'letter' | 'image';
  apiKeyPrefix: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
  getKeyUrl: string;
  description: string;
  features: string[];
  testEndpoint?: string;
  enabled: boolean;
  guidance?: ProviderGuidance;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'claude',
    name: 'Claude',
    company: 'Anthropic',
    color: '#C15F3C',
    gradient: ['#C15F3C', '#D97757'],
    apiKeyPrefix: 'sk-ant-',
    apiKeyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://docs.anthropic.com',
    getKeyUrl: 'https://console.anthropic.com/account/keys',
    description: 'Advanced reasoning and analysis',
    features: ['Deep thinking', 'Code generation', 'Creative writing'],
    testEndpoint: 'https://api.anthropic.com/v1/messages',
    enabled: true,
    guidance: {
      difficulty: 'medium',
      estimatedTime: '~3 min',
      steps: [
        {
          urlPattern: 'console.anthropic.com',
          title: 'Log in to Anthropic',
          instruction: 'Sign in with your Anthropic account or create a new one.',
        },
        {
          urlPattern: '/account/keys',
          title: 'Navigate to API Keys',
          instruction: 'You should see your API keys page. Click "Create Key".',
        },
        {
          urlPattern: '/account/keys',
          title: 'Copy your key',
          instruction: 'Copy the new API key. You won\'t be able to see it again!',
        },
      ],
      tips: [
        'You\'ll need to set up billing before the key works',
        'New accounts may get free credits to start',
      ],
    },
  },
  {
    id: 'openai',
    name: 'ChatGPT',
    company: 'OpenAI',
    color: '#10A37F',
    gradient: ['#10A37F', '#147C5F'],
    apiKeyPrefix: 'sk-',
    apiKeyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/docs',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'Versatile and creative AI',
    features: ['General knowledge', 'Problem solving', 'Conversation'],
    testEndpoint: 'https://api.openai.com/v1/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'medium',
      estimatedTime: '~3 min',
      steps: [
        {
          urlPattern: 'platform.openai.com',
          title: 'Log in to OpenAI',
          instruction: 'Sign in with your OpenAI account or create a new one.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Create API Key',
          instruction: 'Click "Create new secret key" and give it a name.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Copy your key',
          instruction: 'Copy the key immediately - you won\'t see it again!',
        },
      ],
      tips: [
        'You may need to set up an organization first',
        'Add billing/payment method for the key to work',
      ],
    },
  },
  {
    id: 'google',
    name: 'Gemini',
    company: 'Google',
    color: '#4888F8',
    gradient: ['#4888F8', '#38A858'],
    apiKeyPrefix: 'AI',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://ai.google.dev/docs',
    getKeyUrl: 'https://makersuite.google.com/app/apikey',
    description: 'Google\'s multimodal AI',
    features: ['Multimodal', 'Fast responses', 'Large context'],
    testEndpoint: 'https://generativelanguage.googleapis.com/v1/models/',
    enabled: true,
    guidance: {
      difficulty: 'easy',
      estimatedTime: '~1 min',
      steps: [
        {
          urlPattern: 'makersuite.google.com',
          title: 'Sign in with Google',
          instruction: 'Sign in with your Google account.',
        },
        {
          urlPattern: '/app/apikey',
          title: 'Create API Key',
          instruction: 'Click "Create API key" - it\'s a single click!',
        },
        {
          urlPattern: '/app/apikey',
          title: 'Copy your key',
          instruction: 'Copy the generated API key.',
        },
      ],
      tips: [
        'Google AI Studio has a generous free tier',
        'No billing setup required to start',
      ],
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    company: 'Perplexity AI',
    color: '#20808D',
    gradient: ['#20808D', '#1A6A75'],
    apiKeyPrefix: 'pplx-',
    apiKeyPlaceholder: 'pplx-...',
    docsUrl: 'https://docs.perplexity.ai',
    getKeyUrl: 'https://www.perplexity.ai/settings/api',
    description: 'AI with real-time web search',
    features: ['Web search', 'Citations', 'Current information'],
    testEndpoint: 'https://api.perplexity.ai/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'medium',
      estimatedTime: '~2 min',
      steps: [
        {
          urlPattern: 'perplexity.ai',
          title: 'Log in to Perplexity',
          instruction: 'Sign in with your Perplexity account.',
        },
        {
          urlPattern: '/settings/api',
          title: 'Access API Settings',
          instruction: 'Navigate to the API section in settings.',
        },
        {
          urlPattern: '/settings/api',
          title: 'Generate & Copy Key',
          instruction: 'Generate a new API key and copy it.',
        },
      ],
      tips: [
        'API access may require a Perplexity Pro subscription',
        'Check your usage limits in the dashboard',
      ],
    },
  },
  {
    id: 'mistral',
    name: 'Mistral',
    company: 'Mistral AI',
    color: '#FA520F',
    gradient: ['#FA520F', '#E8430C'],
    apiKeyPrefix: '',
    apiKeyPlaceholder: 'Your Mistral API key',
    docsUrl: 'https://docs.mistral.ai',
    getKeyUrl: 'https://console.mistral.ai/api-keys',
    description: 'European AI with multilingual support',
    features: ['Fast inference', 'Code generation', 'Multilingual'],
    testEndpoint: 'https://api.mistral.ai/v1/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'medium',
      estimatedTime: '~3 min',
      steps: [
        {
          urlPattern: 'console.mistral.ai',
          title: 'Log in to Mistral',
          instruction: 'Sign in or create a Mistral AI account.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Create New Key',
          instruction: 'Click "Create new key" button.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Copy your key',
          instruction: 'Copy and save your API key securely.',
        },
      ],
      tips: [
        'Based in Europe with GDPR compliance',
        'May require email verification for new accounts',
      ],
    },
  },
  {
    id: 'cohere',
    name: 'Cohere',
    company: 'Cohere',
    color: '#FF7759',
    gradient: ['#FF7759', '#E86548'],
    apiKeyPrefix: '',
    apiKeyPlaceholder: 'Your Cohere API key',
    docsUrl: 'https://docs.cohere.com',
    getKeyUrl: 'https://dashboard.cohere.com/api-keys',
    description: 'Excellent for RAG and search',
    features: ['Semantic search', 'RAG optimization', 'Generation'],
    testEndpoint: 'https://api.cohere.ai/v1/chat',
    enabled: true,
    guidance: {
      difficulty: 'easy',
      estimatedTime: '~1 min',
      steps: [
        {
          urlPattern: 'dashboard.cohere.com',
          title: 'Log in to Cohere',
          instruction: 'Sign in with your Cohere account.',
        },
        {
          urlPattern: '/api-keys',
          title: 'View API Keys',
          instruction: 'Your trial key is shown automatically, or create a new one.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Copy your key',
          instruction: 'Copy your API key.',
        },
      ],
      tips: [
        'Trial API keys are available for free',
        'Simple dashboard with easy navigation',
      ],
    },
  },
  {
    id: 'together',
    name: 'Together',
    company: 'Together AI',
    color: '#0F6FFF',
    gradient: ['#0F6FFF', '#133B76'],
    apiKeyPrefix: '',
    apiKeyPlaceholder: 'Your Together API key',
    docsUrl: 'https://docs.together.ai',
    getKeyUrl: 'https://api.together.xyz/settings/api-keys',
    description: 'Access to open-source models',
    features: ['Llama models', 'Mixtral', 'Many open models'],
    testEndpoint: 'https://api.together.xyz/v1/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'easy',
      estimatedTime: '~2 min',
      steps: [
        {
          urlPattern: 'together.xyz',
          title: 'Log in to Together AI',
          instruction: 'Sign in or create a Together AI account.',
        },
        {
          urlPattern: '/settings/api-keys',
          title: 'Access API Keys',
          instruction: 'Navigate to Settings > API Keys.',
        },
        {
          urlPattern: '/settings/api-keys',
          title: 'Copy your key',
          instruction: 'Copy your API key from the dashboard.',
        },
      ],
      tips: [
        'New accounts get free credits to start',
        'Access to many open-source models like Llama',
      ],
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    company: 'DeepSeek',
    color: '#4D6BFE',
    gradient: ['#4D6BFE', '#3A52E5'],
    apiKeyPrefix: '',
    apiKeyPlaceholder: 'Your DeepSeek API key',
    docsUrl: 'https://platform.deepseek.com/docs',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'Excellent for code, very cost-effective',
    features: ['Code generation', 'Low cost', 'Fast responses'],
    testEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'easy',
      estimatedTime: '~2 min',
      steps: [
        {
          urlPattern: 'platform.deepseek.com',
          title: 'Log in to DeepSeek',
          instruction: 'Sign in or create a DeepSeek account.',
        },
        {
          urlPattern: '/api_keys',
          title: 'Create API Key',
          instruction: 'Click "Create new API key".',
        },
        {
          urlPattern: '/api_keys',
          title: 'Copy your key',
          instruction: 'Copy and save your API key.',
        },
      ],
      tips: [
        'Very cost-effective for code generation',
        'Clean, simple interface',
      ],
    },
  },
  {
    id: 'grok',
    name: 'Grok',
    company: 'X.AI',
    color: '#1DA1F2',
    gradient: ['#1DA1F2', '#0E7490'],
    apiKeyPrefix: 'xai-',
    apiKeyPlaceholder: 'xai-...',
    docsUrl: 'https://docs.x.ai/api',
    getKeyUrl: 'https://console.x.ai/api-keys',
    description: 'Real-time knowledge, wit, and reasoning',
    features: ['Real-time info', 'Humor', 'Deep reasoning', '256K context'],
    testEndpoint: 'https://api.x.ai/v1/chat/completions',
    enabled: true,
    guidance: {
      difficulty: 'hard',
      estimatedTime: '~5 min',
      steps: [
        {
          urlPattern: 'console.x.ai',
          title: 'Log in with X',
          instruction: 'Sign in with your X (Twitter) account.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Request API Access',
          instruction: 'You may need to request API access if new.',
        },
        {
          urlPattern: '/api-keys',
          title: 'Create & Copy Key',
          instruction: 'Create a new API key and copy it.',
        },
      ],
      tips: [
        'Requires an X (Twitter) account',
        'API access approval may take time for new users',
        'Check for free credits in your account',
      ],
    },
  },
];

export const getProviderById = (id: string): AIProvider | undefined => {
  return AI_PROVIDERS.find(provider => provider.id === id);
};

export const getEnabledProviders = (): AIProvider[] => {
  return AI_PROVIDERS.filter(provider => provider.enabled);
};