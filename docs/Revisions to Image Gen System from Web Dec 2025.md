# Revisions to Image Generation System from Web (December 2025)

This document details the changes made to the image generation system during the web app development. These changes should be adopted in the mobile app for consistency and compatibility.

---

## Summary of Changes

1. **Removed API-specific parameters** - No longer sending `size`, `aspectRatio`, `style`, `quality` to provider APIs
2. **Universal prompt builder** - All image options are translated to natural language and appended to the user's prompt
3. **gpt-image-1 fix** - Removed `response_format` parameter which is unsupported by GPT image models

---

## 1. GPT-Image-1 Parameter Fix

### Problem
OpenAI's newer image generation models (`gpt-image-1`, `gpt-image-1.5`, etc.) use different API parameters than DALL-E models. Sending `response_format: 'b64_json'` causes an error:

```
Unknown parameter: response_format
```

### Root Cause
- **DALL-E 2/3**: Uses `response_format` parameter with values `url` or `b64_json`
- **GPT image models**: Do NOT support `response_format` - they always return base64-encoded images

### Fix
Conditionally omit `response_format` for GPT image models:

```typescript
// In generateOpenAI function
const body: Record<string, any> = {
  model,
  prompt,
  n: Math.min(n, model === 'dall-e-3' ? 1 : 10),
};

// GPT image models don't support response_format - they always return base64
// DALL-E models need response_format to get base64
if (!model.startsWith('gpt-image')) {
  body.response_format = 'b64_json';
}
```

### Also Applies To
The image editing endpoint (`/v1/images/edits`) for gpt-image-1 also should NOT include `response_format`:

```typescript
// In generateOpenAIEdit function
const formData = new FormData();
formData.append('model', model);
formData.append('prompt', prompt);
formData.append('n', String(n));
// GPT image models always return base64, no response_format needed
// Do NOT append response_format for gpt-image-1
```

### Reference
- [OpenAI Images API Reference](https://platform.openai.com/docs/api-reference/images)
- [GPT Image 1 Guide](https://platform.openai.com/docs/guides/image-generation?image-generation-model=gpt-image-1)

---

## 2. Universal Prompt Builder Approach

### Problem
Different image generation providers support different parameters:
- OpenAI DALL-E: `size` (1024x1024, 1792x1024, etc.), `style` (vivid, natural), `quality` (standard, hd)
- OpenAI GPT-image-1: `size` (1024x1024, 1536x1024, etc.), no style/quality params
- Google Gemini: No size/style parameters at all
- Grok: Limited parameter support

Maintaining provider-specific parameter mappings is error-prone and requires constant updates as APIs change.

### Solution
**All styling is done via natural language in the prompt.** The UI provides universal toggles that get translated to descriptive text appended to the user's prompt.

### How It Works

1. User writes their prompt: `"A castle on a hill"`
2. User selects toggles: Size=Large, Orientation=Landscape, Style=Cinematic
3. Final prompt sent to API:
```
A castle on a hill

Image specifications: Large size, high resolution, detailed. Landscape orientation, horizontal format. Cinematic style, dramatic lighting, movie-like.
```

### Universal Toggle Options

#### Size
| Option | Prompt Text |
|--------|-------------|
| Small | "Small size, suitable for thumbnails" |
| Medium | (default - omit from prompt) |
| Large | "Large size, high resolution, detailed" |

#### Orientation
| Option | Prompt Text |
|--------|-------------|
| Square | (default - omit from prompt) |
| Portrait | "Portrait orientation, vertical format" |
| Landscape | "Landscape orientation, horizontal format" |

#### Style Presets
| Option | Prompt Text |
|--------|-------------|
| None | (default - omit from prompt) |
| Photo Realistic | "Photorealistic style, like a photograph" |
| Cinematic | "Cinematic style, dramatic lighting, movie-like" |
| Anime | "Anime style, Japanese animation aesthetic" |
| Watercolor | "Watercolor painting style" |
| Sketch | "Pencil sketch style, hand-drawn" |
| 3D Render | "3D rendered style, CGI quality" |
| Oil Painting | "Oil painting style, classical art" |
| Minimalist | "Minimalist style, clean and simple" |

#### Quality
| Option | Prompt Text |
|--------|-------------|
| Standard | (default - omit from prompt) |
| High Detail | "Highly detailed, intricate details, sharp focus" |

### Prompt Builder Function

```typescript
const SIZE_DESCRIPTIONS: Record<string, string> = {
  small: 'Small size, suitable for thumbnails',
  large: 'Large size, high resolution, detailed',
};

const ORIENTATION_DESCRIPTIONS: Record<string, string> = {
  portrait: 'Portrait orientation, vertical format',
  landscape: 'Landscape orientation, horizontal format',
};

const STYLE_OPTIONS = [
  { id: 'none', label: 'None', description: '' },
  { id: 'photorealistic', label: 'Photo Realistic', description: 'Photorealistic style, like a photograph' },
  { id: 'cinematic', label: 'Cinematic', description: 'Cinematic style, dramatic lighting, movie-like' },
  { id: 'anime', label: 'Anime', description: 'Anime style, Japanese animation aesthetic' },
  { id: 'watercolor', label: 'Watercolor', description: 'Watercolor painting style' },
  { id: 'sketch', label: 'Sketch', description: 'Pencil sketch style, hand-drawn' },
  { id: '3d', label: '3D Render', description: '3D rendered style, CGI quality' },
  { id: 'oil', label: 'Oil Painting', description: 'Oil painting style, classical art' },
  { id: 'minimalist', label: 'Minimalist', description: 'Minimalist style, clean and simple' },
];

function buildFinalPrompt(
  userPrompt: string,
  options: { size: string; orientation: string; style: string; quality: string }
): string {
  const specs: string[] = [];

  if (options.size !== 'medium' && SIZE_DESCRIPTIONS[options.size]) {
    specs.push(SIZE_DESCRIPTIONS[options.size]);
  }

  if (options.orientation !== 'square' && ORIENTATION_DESCRIPTIONS[options.orientation]) {
    specs.push(ORIENTATION_DESCRIPTIONS[options.orientation]);
  }

  if (options.style !== 'none') {
    const styleOption = STYLE_OPTIONS.find((s) => s.id === options.style);
    if (styleOption?.description) {
      specs.push(styleOption.description);
    }
  }

  if (options.quality === 'high') {
    specs.push('Highly detailed, intricate details, sharp focus');
  }

  if (specs.length === 0) return userPrompt;
  return `${userPrompt}\n\nImage specifications: ${specs.join('. ')}.`;
}
```

---

## 3. Simplified API Request Structure

### Before (Complex)
```typescript
interface ImageProxyRequest {
  providerId: string;
  model: string;
  prompt: string;
  size?: ImageSize;
  aspectRatio?: AspectRatio;
  style?: ImageStyle;
  quality?: ImageQuality;
  n?: number;
  sourceImage?: string;
}
```

### After (Simplified)
```typescript
interface ImageProxyRequest {
  providerId: string;
  model?: string;
  prompt: string;        // Contains all styling via natural language
  n?: number;            // Number of images (usually 1)
  sourceImage?: string;  // Base64 for img2img
}
```

---

## 4. Simplified Provider Functions

Each provider function now just passes the prompt directly without manipulating parameters:

```typescript
// Example: Grok provider
export async function generateGrok(
  request: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  const model = request.model || 'grok-2-image-1212';

  const proxyRequest: ImageProxyRequest = {
    providerId: 'grok',
    model,
    prompt: request.prompt,  // Already contains styling from prompt builder
    n: request.n || 1,
  };

  const response = await sendProxiedImageRequest(proxyRequest);
  // ... handle response
}
```

---

## 5. Firebase Function Changes

The `proxyImageGeneration` function in `functions/src/imageProxy.ts` was simplified:

### Removed
- `size`, `aspectRatio`, `style`, `quality` from request interface
- Size/style parameter handling in all provider generator functions
- Provider-specific parameter mappings

### Kept
- `providerId`, `model`, `prompt`, `n`, `sourceImage`
- Basic validation
- Error handling

### Provider-Specific Notes

#### OpenAI (generateOpenAI)
```typescript
const body: Record<string, any> = {
  model,
  prompt,
  n: Math.min(n, model === 'dall-e-3' ? 1 : 10),
};

// Only add response_format for DALL-E models
if (!model.startsWith('gpt-image')) {
  body.response_format = 'b64_json';
}
```

#### Google Gemini (generateGemini)
```typescript
const body = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseModalities: ['IMAGE', 'TEXT'],
  },
};
// No size/style parameters - all in prompt
```

#### Grok (generateGrok)
```typescript
const body = {
  model,
  prompt,
  n,
  response_format: 'b64_json',  // Grok still supports this
};
// No size/style parameters - all in prompt
```

---

## 6. UI Changes (Web Implementation)

The `ImageGenerationModal` was rewritten with pill-button toggles:

```
┌─────────────────────────────────────────┐
│  Generate Image                      ✕  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐   │
│  │ Describe your image...          │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Size                                   │
│  [Small] [Medium•] [Large]              │
│                                         │
│  Orientation                            │
│  [Square•] [Portrait] [Landscape]       │
│                                         │
│  Style                                  │
│  [None•] [Photo] [Cinematic] [Anime]    │
│  [Watercolor] [Sketch] [3D] [Oil]       │
│                                         │
│  Quality                                │
│  [Standard•] [High Detail]              │
│                                         │
├─────────────────────────────────────────┤
│  [Cancel]              [Generate]       │
└─────────────────────────────────────────┘
```

---

## 7. Benefits of This Approach

1. **Universal compatibility** - Works across all providers without API-specific handling
2. **Future-proof** - No need to update when provider APIs change
3. **Simpler codebase** - Less code to maintain
4. **Consistent UX** - Users get the same interface regardless of provider
5. **Natural language understanding** - All modern image models understand descriptive prompts well
6. **Easy to extend** - Adding new style presets is just adding strings

---

## 8. Migration Checklist for Mobile App

- [ ] Update `imageProxy.ts` (or equivalent) to remove `response_format` for gpt-image models
- [ ] Remove size/aspectRatio/style/quality parameters from API requests
- [ ] Implement `buildFinalPrompt()` function with toggle options
- [ ] Update image generation UI to use universal toggles instead of provider-specific options
- [ ] Remove provider capability checks for sizes/styles (no longer needed)
- [ ] Test with all providers: OpenAI (DALL-E + gpt-image-1), Gemini, Grok

---

## 9. Files Changed (Web App Reference)

| File | Changes |
|------|---------|
| `src/components/image-gen/ImageGenerationModal.tsx` | Complete rewrite with prompt builder UI |
| `src/lib/ai/image/types.ts` | Removed ImageSize, AspectRatio, ImageStyle, ImageQuality types |
| `src/lib/ai/image/ImageGenerationService.ts` | Removed capabilities complexity |
| `src/lib/ai/image/providers/openai.ts` | Simplified to just pass prompt |
| `src/lib/ai/image/providers/gemini.ts` | Simplified to just pass prompt |
| `src/lib/ai/image/providers/grok.ts` | Simplified to just pass prompt |
| `src/lib/ai/proxy-service.ts` | Simplified ImageProxyRequest interface |
| `functions/src/imageProxy.ts` | Removed parameter handling, fixed gpt-image-1 |
