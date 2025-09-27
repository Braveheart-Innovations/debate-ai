import { AI_BRAND_COLORS, BrandColor } from '@/constants/aiColors';

const PROVIDER_TO_BRAND: Record<string, keyof typeof AI_BRAND_COLORS> = {
  claude: 'claude',
  anthropic: 'claude',
  openai: 'openai',
  chatgpt: 'openai',
  gpt: 'openai',
  google: 'gemini',
  gemini: 'gemini',
  perplexity: 'perplexity',
  mistral: 'mistral',
  cohere: 'cohere',
  together: 'together',
  deepseek: 'deepseek',
  grok: 'grok',
  nomi: 'nomi',
  replika: 'replika',
  characterai: 'characterai',
};

const NAME_KEYWORDS: Array<{ keyword: string; brand: keyof typeof AI_BRAND_COLORS }> = [
  { keyword: 'claude', brand: 'claude' },
  { keyword: 'anthropic', brand: 'claude' },
  { keyword: 'gpt', brand: 'openai' },
  { keyword: 'openai', brand: 'openai' },
  { keyword: 'chatgpt', brand: 'openai' },
  { keyword: 'gemini', brand: 'gemini' },
  { keyword: 'google', brand: 'gemini' },
  { keyword: 'perplexity', brand: 'perplexity' },
  { keyword: 'mistral', brand: 'mistral' },
  { keyword: 'cohere', brand: 'cohere' },
  { keyword: 'together', brand: 'together' },
  { keyword: 'deepseek', brand: 'deepseek' },
  { keyword: 'grok', brand: 'grok' },
  { keyword: 'nomi', brand: 'nomi' },
  { keyword: 'replika', brand: 'replika' },
  { keyword: 'character', brand: 'characterai' },
];

const normalize = (value?: string) => value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';

export function getBrandPalette(provider?: string, fallbackName?: string): BrandColor | null {
  const normalizedProvider = normalize(provider);
  if (normalizedProvider && PROVIDER_TO_BRAND[normalizedProvider]) {
    const brandKey = PROVIDER_TO_BRAND[normalizedProvider];
    return AI_BRAND_COLORS[brandKey];
  }

  const normalizedName = normalize(fallbackName);
  if (normalizedName) {
    const match = NAME_KEYWORDS.find(({ keyword }) => normalizedName.includes(keyword));
    if (match) {
      return AI_BRAND_COLORS[match.brand];
    }
  }

  return null;
}

export function getBrandAccent(provider?: string, fallbackName?: string): string | null {
  const palette = getBrandPalette(provider, fallbackName);
  return palette ? palette[500] : null;
}
