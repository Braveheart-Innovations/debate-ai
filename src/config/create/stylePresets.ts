/**
 * Style presets for Create mode image generation
 * Each style appends a prompt suffix to enhance the generation
 */

import { StylePreset } from '../../store/createSlice';

export interface StylePresetConfig {
  id: StylePreset;
  label: string;
  description: string;
  promptSuffix: string;
  icon: string; // Ionicons name
}

export const STYLE_PRESETS: StylePresetConfig[] = [
  {
    id: 'none',
    label: 'None',
    description: 'No style modification',
    promptSuffix: '',
    icon: 'close-circle-outline',
  },
  {
    id: 'photo',
    label: 'Photo',
    description: 'Photorealistic photography',
    promptSuffix: 'Photorealistic, like a professional photograph, high quality, sharp focus',
    icon: 'camera-outline',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Movie-like dramatic scenes',
    promptSuffix: 'Cinematic style, dramatic lighting, film grain, movie poster quality, atmospheric',
    icon: 'film-outline',
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Japanese animation style',
    promptSuffix: 'Anime style, Japanese animation, vibrant colors, cel-shaded, detailed illustration',
    icon: 'sparkles-outline',
  },
  {
    id: 'digital-art',
    label: 'Digital Art',
    description: 'Modern digital illustration',
    promptSuffix: 'Digital art style, modern illustration, clean lines, vibrant colors, professional',
    icon: 'brush-outline',
  },
  {
    id: 'oil-painting',
    label: 'Oil Painting',
    description: 'Classical oil painting style',
    promptSuffix: 'Oil painting style, classical art, rich textures, brush strokes visible, museum quality',
    icon: 'color-palette-outline',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    description: 'Soft watercolor painting',
    promptSuffix: 'Watercolor painting style, soft colors, paper texture, artistic, flowing washes',
    icon: 'water-outline',
  },
  {
    id: 'sketch',
    label: 'Sketch',
    description: 'Hand-drawn pencil sketch',
    promptSuffix: 'Pencil sketch style, hand-drawn, graphite, detailed line work, artistic',
    icon: 'pencil-outline',
  },
  {
    id: '3d-render',
    label: '3D Render',
    description: 'CGI 3D rendered style',
    promptSuffix: '3D rendered, CGI quality, ray tracing, photorealistic materials, studio lighting',
    icon: 'cube-outline',
  },
];

/**
 * Get style preset config by ID
 */
export function getStylePreset(id: StylePreset): StylePresetConfig | undefined {
  return STYLE_PRESETS.find(style => style.id === id);
}

/**
 * Get the prompt suffix for a style
 */
export function getStylePromptSuffix(id: StylePreset): string {
  const preset = getStylePreset(id);
  return preset?.promptSuffix || '';
}

/**
 * Build enhanced prompt with style suffix
 */
export function buildEnhancedPrompt(prompt: string, style: StylePreset): string {
  const suffix = getStylePromptSuffix(style);
  if (!suffix) return prompt;
  return `${prompt}. ${suffix}`;
}
