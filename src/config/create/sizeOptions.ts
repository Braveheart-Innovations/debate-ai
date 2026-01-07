/**
 * Size/aspect ratio options for Create mode image generation
 */

import { SizeOption } from '../../store/createSlice';
import { AIProvider } from '../../types';

export interface SizeOptionConfig {
  id: SizeOption;
  label: string;
  description: string;
  aspect: number; // width/height ratio for preview
  preview: string; // Display string like "1:1"
  icon: string; // Ionicons name
}

export const SIZE_OPTIONS: SizeOptionConfig[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Provider default',
    aspect: 1,
    preview: 'Auto',
    icon: 'resize-outline',
  },
  {
    id: 'square',
    label: 'Square',
    description: 'Perfect square',
    aspect: 1,
    preview: '1:1',
    icon: 'square-outline',
  },
  {
    id: 'portrait',
    label: 'Portrait',
    description: 'Vertical orientation',
    aspect: 2 / 3,
    preview: '2:3',
    icon: 'phone-portrait-outline',
  },
  {
    id: 'landscape',
    label: 'Landscape',
    description: 'Horizontal orientation',
    aspect: 3 / 2,
    preview: '3:2',
    icon: 'phone-landscape-outline',
  },
];

/**
 * Map UI size option to provider-specific size parameter
 */
export function mapSizeToProvider(size: SizeOption, provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      // OpenAI supports specific pixel dimensions
      switch (size) {
        case 'square':
        case 'auto':
          return '1024x1024';
        case 'portrait':
          return '1024x1536';
        case 'landscape':
          return '1536x1024';
        default:
          return '1024x1024';
      }

    case 'google':
      // Gemini uses aspect ratio strings
      switch (size) {
        case 'square':
        case 'auto':
          return '1:1';
        case 'portrait':
          return '9:16';
        case 'landscape':
          return '16:9';
        default:
          return '1:1';
      }

    case 'grok':
      // Grok doesn't support size parameter, return empty
      return '';

    default:
      return '1024x1024';
  }
}

/**
 * Get size option config by ID
 */
export function getSizeOption(id: SizeOption): SizeOptionConfig | undefined {
  return SIZE_OPTIONS.find(size => size.id === id);
}
