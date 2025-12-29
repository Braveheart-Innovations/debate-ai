# Image Refinement System - Functional & Technical Design

## Document Purpose

This document details the user-driven image refinement functionality implemented in the Symposium AI mobile app. It is intended as a reference for porting these changes to the `symposium-ai-web` project.

---

## Executive Summary

### What Changed

The original plan included an automated **round-robin multi-AI image generation** mode where multiple AIs would sequentially improve each other's images. This approach has been **replaced** with a **user-driven refinement workflow** that gives users explicit control over when and how images are refined.

### Why the Change

1. **User Control**: Users want to decide if/when an image needs improvement
2. **Cost Efficiency**: Automated round-robin would consume API credits without user consent
3. **Quality Control**: Users can provide specific instructions for improvements
4. **Provider Selection**: Users can choose which AI provider to use for refinement

---

## Functional Design

### User Journey

```
1. User generates image via ImageGenerationModal
   └── Image appears in chat with "Refine" button (if any provider supports img2img)

2. User taps "Refine" button on generated image
   └── ImageRefinementModal opens with:
       - Preview of current image
       - Original prompt display
       - Text input for refinement instructions
       - Quick suggestion chips
       - Provider selection (only img2img-capable providers)

3. User enters instructions and selects provider
   └── Taps "Refine Image" button

4. System generates refined image
   └── New image appears in chat as a separate message
       - Linked to original via refinementOf metadata
       - Marked as isRefinement: true
```

### UI Components

#### Refine Button (on ImageBubble)
- Location: Bottom-right corner of generated images
- Visibility: Only shown when `canRefine=true` (at least one provider supports img2img)
- Icon: Wand icon + "Refine" text
- Color: Primary theme color

#### Expand Icon (on ImageBubble)
- Location: Top-right corner of generated images
- Icon: Expand outline
- Always visible on generated images

#### ImageRefinementModal
- Modal presentation: Slide up from bottom
- Sections:
  1. **Image Preview**: Current image thumbnail
  2. **Original Prompt**: Truncated display of original generation prompt
  3. **Instructions Input**: Multi-line text input for refinement instructions
  4. **Quick Suggestions**: Chip buttons with common refinement phrases
  5. **Provider Selection**: Radio button list of available providers
  6. **Action Buttons**: Cancel and Refine Image

### Quick Suggestions

Pre-defined refinement instructions users can tap to append:

| Label | Instruction Text |
|-------|------------------|
| More detail | Add more fine details and textures throughout the image |
| Vibrant colors | Make the colors more vibrant and saturated |
| Dramatic lighting | Add more dramatic lighting and shadows |
| Sharper | Make the image sharper and crisper with more defined edges |
| Artistic style | Apply a more artistic, painterly style |
| Fix faces | Improve the faces to look more natural and realistic |

---

## Technical Design

### Type System Changes

#### `src/types/index.ts`

```typescript
// Image generation modes - roundRobin REMOVED
export type ImageGenerationMode = 'single' | 'compare';

// Metadata for generated images
export interface GeneratedImageMetadata {
  url: string;
  // NOTE: base64 is NOT stored - bloats storage. Loaded from file when needed.
  revisedPrompt?: string;
  prompt: string;
  model: string;
  providerId: string;
  // Refinement tracking
  isRefinement?: boolean;
  refinementOf?: string; // Message ID of the original image
}
```

**Key Decision**: Base64 data is intentionally NOT stored in message metadata to avoid bloating AsyncStorage/SQLite. Instead, base64 is loaded from the cached file URI when needed for refinement.

### Provider Capabilities

#### `src/config/providerCapabilities.ts`

```typescript
export interface ProviderCapabilities {
  imageGeneration?: {
    supported: boolean;
    supportsImageInput?: boolean;  // img2img capability
    models?: string[];
    sizes?: string[];
    maxPromptLength?: number;
  };
  // ...
}
```

**Provider img2img Support Matrix:**

| Provider | imageGeneration.supported | supportsImageInput (img2img) |
|----------|--------------------------|------------------------------|
| OpenAI   | true                     | **true** (gpt-image-1)       |
| Google   | true                     | **true** (Gemini)            |
| Grok     | true                     | **false**                    |

### Modality Availability Hook

#### `src/hooks/multimodal/useModalityAvailability.ts`

New hook for determining image generation availability:

```typescript
export interface ImageGenerationAvailabilityResult {
  isAvailable: boolean;
  mode: ImageGenerationMode;
  reason?: string;
  providers: Array<{
    provider: string;
    supportsImageGen: boolean;
    supportsImg2Img: boolean;
  }>;
}

export function useImageGenerationAvailability(
  items: Array<{ provider: string; model: string }>,
  screenMode: 'chat' | 'compare'
): ImageGenerationAvailabilityResult
```

**Logic:**
- **Chat mode**: `mode='single'`, uses first AI for generation
- **Compare mode**: `mode='compare'`, requires ALL AIs to support image generation

**Note**: Round-robin mode was removed. Multi-AI chat no longer automatically chains image generation.

### File Cache Utility

#### `src/services/images/fileCache.ts`

New utility for loading base64 from cached files:

```typescript
/**
 * Load base64 data from a file URI (for img2img refinement)
 * @param fileUri - The file:// URI or cache path of the image
 * @returns Base64 string of the image, or null if loading fails
 */
export async function loadBase64FromFileUri(fileUri: string): Promise<string | null>
```

**Handles:**
- Data URIs (`data:image/png;base64,...`) - extracts base64 directly
- File URIs (`file://...`) - reads file and encodes as base64
- Cache paths - same as file URIs

### ImageService Updates

#### `src/services/images/ImageService.ts`

**New Option:**
```typescript
export interface GenerateImageOptions {
  // ... existing options
  sourceImage?: string;  // Base64-encoded source image for img2img
}
```

**New Response Field:**
```typescript
export interface GeneratedImage {
  url?: string;
  b64?: string;  // Base64 data for img2img chaining
  mimeType: string;
}
```

**Provider-Specific img2img Implementation:**

1. **OpenAI**: Uses `/v1/images/edits` endpoint with `gpt-image-1` model
   - Source image sent as FormData blob
   - Returns new image as b64_json or URL

2. **Google Gemini**: Uses `generateContent` with inline image data
   - Source image sent as `inlineData` part
   - Explicit instruction to generate NEW image (not just describe)
   - Returns image in `candidates[].content.parts[].inlineData`

3. **Grok**: Does NOT support img2img - `supportsImageInput: false`

### ImageRefinementModal Component

#### `src/components/organisms/chat/ImageRefinementModal.tsx`

**Props Interface:**
```typescript
export interface RefinementProvider {
  provider: AIProvider;
  name: string;
  supportsImg2Img: boolean;
  hasApiKey: boolean;
}

export interface ImageRefinementModalProps {
  visible: boolean;
  imageUri: string;
  originalPrompt: string;
  originalProvider: AIProvider;
  availableProviders: RefinementProvider[];
  onClose: () => void;
  onRefine: (opts: {
    instructions: string;
    provider: AIProvider;
  }) => void;
}
```

**Key Features:**
- Filters providers to only show those with `supportsImg2Img && hasApiKey`
- Auto-selects first eligible provider if current selection isn't eligible
- Quick suggestions append to existing instructions
- Theme-aware styling for dark/light mode

### ChatScreen Integration

#### `src/screens/ChatScreen.tsx`

**State:**
```typescript
const [refinementModalVisible, setRefinementModalVisible] = useState(false);
const [refinementImageUri, setRefinementImageUri] = useState('');
const [refinementOriginalPrompt, setRefinementOriginalPrompt] = useState('');
const [refinementOriginalProvider, setRefinementOriginalProvider] = useState<AIProvider>('openai');
const [refinementMessageId, setRefinementMessageId] = useState<string | undefined>();
```

**Provider List Builder:**
```typescript
const refinementProviders = useMemo((): RefinementProvider[] => {
  const providers: RefinementProvider[] = [];
  const providerIds: AIProvider[] = ['openai', 'google', 'grok'];

  for (const providerId of providerIds) {
    const caps = getProviderCapabilities(providerId);
    if (caps.imageGeneration?.supported) {
      providers.push({
        provider: providerId,
        name: providerDisplayNames[providerId] || providerId,
        supportsImg2Img: Boolean(caps.imageGeneration?.supportsImageInput),
        hasApiKey: Boolean(apiKeys[providerId]),
      });
    }
  }
  return providers;
}, [apiKeys]);
```

**Refinement Handler Flow:**
1. Add placeholder message with `isGeneratingImage: true`
2. Load base64 from file URI using `loadBase64FromFileUri()`
3. Get API key for selected provider
4. Build refinement prompt: `Original: "..." + User instructions: "..."`
5. Call `ImageService.generateImage()` with `sourceImage`
6. Update message with generated image metadata
7. Close modal

### ImageBubble Component

#### `src/components/organisms/chat/ImageBubble.tsx`

**Props:**
```typescript
export interface ImageBubbleProps {
  uris: string[];
  onPressImage?: (uri: string) => void;
  onRefine?: (uri: string) => void;  // Called when user taps Refine
  canRefine?: boolean;  // Whether refinement is available
}
```

**UI Elements:**
- Expand icon (always visible, top-right)
- Refine button (conditional, bottom-right)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         ChatScreen                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌─────────────────────┐                   │
│  │ ImageBubble  │────▶│ onRefine(imageUri)  │                   │
│  └──────────────┘     └─────────────────────┘                   │
│                                │                                 │
│                                ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 ImageRefinementModal                       │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │ - Image preview                                       │ │  │
│  │  │ - Original prompt                                     │ │  │
│  │  │ - Instructions input                                  │ │  │
│  │  │ - Quick suggestions                                   │ │  │
│  │  │ - Provider selection (filtered by img2img support)    │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                │                                 │
│                                ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              handleRefineImage(opts)                       │  │
│  │  1. Add placeholder message                                │  │
│  │  2. loadBase64FromFileUri(imageUri)                        │  │
│  │  3. ImageService.generateImage({ sourceImage: base64 })    │  │
│  │  4. Update message with new image                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Migration Checklist for Web

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/index.ts` | Modify | Remove `'roundRobin'` from `ImageGenerationMode`, add refinement metadata |
| `src/config/providerCapabilities.ts` | Modify | Add `supportsImageInput` flag to providers |
| `src/hooks/useModalityAvailability.ts` | Modify | Add `useImageGenerationAvailability` hook |
| `src/services/images/fileCache.ts` | Create/Modify | Add base64 loading utility (web equivalent) |
| `src/services/images/ImageService.ts` | Modify | Add `sourceImage` option, implement img2img for each provider |
| `src/components/ImageRefinementModal.tsx` | Create | New modal component for refinement |
| `src/components/ImageBubble.tsx` | Modify | Add Refine button and expand icon |
| `src/screens/ChatScreen.tsx` | Modify | Add refinement state and handlers |

### Web-Specific Considerations

1. **File Loading**: Web doesn't use `expo-file-system`. Use:
   - `fetch()` to load blob from URL
   - `FileReader` to convert to base64
   - Or store base64 directly in IndexedDB

2. **Modal Presentation**: Replace React Native Modal with:
   - Dialog component (Radix, Headless UI, etc.)
   - Or Sheet component for mobile-web

3. **Blur Background**: Replace `expo-blur` with CSS:
   ```css
   backdrop-filter: blur(10px);
   ```

4. **Form Data for OpenAI**: Browser `FormData` works the same

5. **Theme System**: Adapt `useTheme()` calls to web theme context

---

## Removed Functionality

### Round-Robin Mode (DEFUNCT)

The following functionality was planned but **NOT implemented**:

```typescript
// REMOVED from ImageGenerationMode
type ImageGenerationMode = 'single' | 'compare' | 'roundRobin';  // roundRobin removed
```

**What was planned:**
- In multi-AI chat mode, image would be generated by first AI
- Then automatically passed to second AI for improvement
- Continue until all AIs have refined the image

**Why removed:**
- Replaced by user-driven refinement workflow
- User has explicit control over each refinement step
- No automatic API consumption without user consent

### Compare Mode Image Generation

Compare mode (`mode='compare'`) still exists but requires ALL providers to support image generation. The `supportsImageInput` flag is NOT required for compare mode - it only affects refinement availability.

---

## Testing Checklist

- [ ] Single AI chat: Refine button appears on generated images (if provider supports img2img)
- [ ] Multi-AI chat: Refine button appears if ANY provider supports img2img
- [ ] Refinement modal shows only eligible providers (supportsImg2Img && hasApiKey)
- [ ] Quick suggestions append to existing instructions
- [ ] Provider auto-selection when current provider is ineligible
- [ ] Refined image appears as new message with refinement metadata
- [ ] Original prompt displayed correctly (without "Image specifications:" suffix)
- [ ] Theme/dark mode styling works correctly
- [ ] Cancel closes modal without action
- [ ] Refine button disabled when no instructions entered
- [ ] Error handling when image fails to load for refinement

---

## Appendix: API Endpoints

### OpenAI Image Edit
```
POST https://api.openai.com/v1/images/edits
Content-Type: multipart/form-data

FormData:
- model: "gpt-image-1"
- prompt: string
- image: File (PNG)
- n: number (optional)
```

### Google Gemini Image Generation
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key={API_KEY}
Content-Type: application/json

{
  "contents": [{
    "parts": [
      { "inlineData": { "mimeType": "image/png", "data": "{base64}" } },
      { "text": "GENERATE A NEW IMAGE: ..." }
    ]
  }],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"],
    "imageConfig": { "aspectRatio": "1:1" }
  }
}
```

---

*Last Updated: 2025-12-29*
