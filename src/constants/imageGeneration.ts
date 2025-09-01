export const IMAGE_GENERATION_CONSTANTS = {
  SIZES: {
    AUTO: 'auto',
    SQUARE_1024: '1024x1024',
    PORTRAIT_1024x1536: '1024x1536',
    LANDSCAPE_1536x1024: '1536x1024',
  },
  QUALITY: {
    STANDARD: 'standard',
    HD: 'hd',
  },
  MODELS: {
    OPENAI_IMAGE: 'gpt-image-1',
    DALLE3: 'dall-e-3',
    DALLE2: 'dall-e-2',
  },
} as const;

export type ImageSizeOpenAI = typeof IMAGE_GENERATION_CONSTANTS.SIZES[keyof typeof IMAGE_GENERATION_CONSTANTS.SIZES];

