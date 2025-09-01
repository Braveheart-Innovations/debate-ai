# PR Bundle: Curated Model and Capability Updates

This bundle consolidates curated entries to update:
- src/config/modelConfigs.ts (add curated models)
- src/config/providerCapabilities.ts (image/video generation blocks)

## ModelConfigs additions (curated)
### Provider: openai
```ts
// Curated ModelConfig entries for AI_MODELS['openai'] (default + recommended)
{
      id: 'gpt-5-nano',
      name: 'gpt-5-nano',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'gpt-4.1-2025-04-14',
      name: 'gpt-4.1-2025-04-14',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
    },
{
      id: 'gpt-4o',
      name: 'gpt-4o',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
    },
{
      id: 'gpt-4o-mini-2024-07-18',
      name: 'gpt-4o-mini-2024-07-18',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsImageInput: true,
    },
{
      id: 'o3-mini',
      name: 'o3-mini',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
    },
{
      id: 'o1-mini-2024-09-12',
      name: 'o1-mini-2024-09-12',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
    },
{
      id: 'dall-e-3',
      name: 'dall-e-3',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsImageGeneration: true,
    },
```
### Provider: claude
```ts
// Curated ModelConfig entries for AI_MODELS['claude'] (default + recommended)
{
      id: 'claude-4.1-opus-20250805',
      name: 'Claude 4.1 Opus',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'claude-4-sonnet-20250514',
      name: 'Claude 4 Sonnet',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
```
### Provider: google
```ts
// Curated ModelConfig entries for AI_MODELS['google'] (default + recommended)
{
      id: 'gemini-2.5-pro-preview-03-25',
      name: 'Gemini 2.5 Pro Preview 03-25',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'gemini-2.5-flash-preview-05-20',
      name: 'Gemini 2.5 Flash Preview 05-20',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
{
      id: 'gemini-2.5-flash-lite-preview-06-17',
      name: 'Gemini 2.5 Flash-Lite Preview 06-17',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
{
      id: 'gemini-2.0-flash-exp-image-generation',
      name: 'Gemini 2.0 Flash (Image Generation) Experimental',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      supportsImageGeneration: true,
    },
```
### Provider: perplexity
```ts
// Curated ModelConfig entries for AI_MODELS['perplexity'] (default + recommended)
{
      id: 'sonar-pro',
      name: 'Sonar Pro',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'sonar',
      name: 'Sonar',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
```
### Provider: mistral
```ts
// Curated ModelConfig entries for AI_MODELS['mistral'] (default + recommended)
{
      id: 'mistral-large-latest',
      name: 'mistral-large-latest',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      isDefault: true,
    },
{
      id: 'mistral-medium-latest',
      name: 'mistral-medium-latest',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
    },
{
      id: 'pixtral-large-latest',
      name: 'pixtral-large-latest',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
```
### Provider: cohere
```ts
// Curated ModelConfig entries for AI_MODELS['cohere'] (default + recommended)
{
      id: 'command-r-plus-08-2024',
      name: 'command-r-plus-08-2024',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsDocuments: true,
      isDefault: true,
    },
{
      id: 'command-r7b-12-2024',
      name: 'command-r7b-12-2024',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsDocuments: true,
    },
{
      id: 'command-light',
      name: 'command-light',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsDocuments: true,
    },
```
### Provider: together
```ts
// together: no curated entries
```
### Provider: deepseek
```ts
// Curated ModelConfig entries for AI_MODELS['deepseek'] (default + recommended)
{
      id: 'deepseek-reasoner',
      name: 'deepseek-reasoner',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'deepseek-chat',
      name: 'deepseek-chat',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
```
### Provider: grok
```ts
// Curated ModelConfig entries for AI_MODELS['grok'] (default + recommended)
{
      id: 'grok-4-0709',
      name: 'grok-4-0709',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
      isDefault: true,
    },
{
      id: 'grok-3',
      name: 'grok-3',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
{
      id: 'grok-3-fast',
      name: 'grok-3-fast',
      description: 'Curated via discovery on 2025-08-31',
      contextLength: 128000,
      supportsVision: true,
      supportsDocuments: true,
      supportsImageInput: true,
    },
```

## ProviderCapabilities additions (imageGeneration)
### Provider: openai
```ts
// Insert into getProviderCapabilities('openai') imageGeneration models/sizes
imageGeneration: { supported: true, models: ["dall-e-3","dall-e-2","gpt-image-1"], sizes: ["auto","1024x1024","1024x1536","1536x1024"], maxPromptLength: 4000 },
```
### Provider: together
```ts
// together: no image generation models discovered
```
### Provider: grok
```ts
// Insert into getProviderCapabilities('grok') imageGeneration models/sizes
imageGeneration: { supported: true, models: ["grok-2-image-1212"], sizes: ["1024x1024"], maxPromptLength: 4000 },
```

## ProviderCapabilities additions (videoGeneration - future)
### Provider: openai
```ts
// openai: no video generation models discovered
```
### Provider: google
```ts
// google: no video generation models discovered
```
### Provider: together
```ts
// together: no video generation models discovered
```
### Provider: grok
```ts
// grok: no video generation models discovered
```