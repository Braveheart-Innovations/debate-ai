# Multi-AI ImageGen Enhancements - Web 2025

This document details all modifications made to the image generation system in the Symposium AI web application. These changes should be applied to the mobile app for feature parity.

## Overview

The image generation system was enhanced to support two distinct multi-AI modes:

1. **Compare Mode**: Parallel image generation across multiple providers for side-by-side comparison
2. **Chat Mode**: Sequential round-robin generation with img2img support for iterative improvement

## Architecture Changes

### 1. Image Generation Modes

A new `ImageGenerationMode` type was introduced to distinguish between generation strategies:

```typescript
export type ImageGenerationMode = 'single' | 'compare' | 'roundRobin';
```

| Mode | Description | Use Case |
|------|-------------|----------|
| `single` | Single AI generates image | Chat with one AI selected |
| `compare` | All AIs generate in parallel | Compare mode - side-by-side comparison |
| `roundRobin` | Sequential generation with img2img | Chat with multiple img2img-capable AIs |

### 2. ImageGenerationModal Updates

**File**: `src/components/image-gen/ImageGenerationModal.tsx`

Added `mode` prop to display appropriate UI text:

```typescript
interface ImageGenerationModalProps {
  // ... existing props
  mode?: ImageGenerationMode;
}
```

Mode-specific display:
- **Compare mode**: Title shows "Generate Image (Compare)", AI list prefixed with "Comparing:"
- **Round-robin mode**: Title shows "Generate Image (Round-Robin)", AI list prefixed with "Round-robin through:"
- **Single mode**: Title shows "Generate Image" with no AI list

Removed numbered prefixes from AI list in compare mode since order doesn't matter for parallel generation.

### 3. Image Generation Availability Logic

**File**: `src/hooks/useImageGenerationAvailability.ts`

Updated rules for when image generation is available:

| Mode | Requirement |
|------|-------------|
| Chat (single AI) | AI supports image generation |
| Chat (multiple AIs) | **ALL** AIs must support img2img |
| Compare | ALL AIs support image generation (img2img not required) |

**Key change**: For multi-AI chat mode, the generate button is only visible if ALL selected providers support img2img. This ensures true round-robin iteration where each AI can improve upon the previous image.

```typescript
// Chat mode with multiple AIs - require ALL to support img2img for true round-robin
const canDoRoundRobin = allSupport && allSupportImg2Img;

return {
  isAvailable: canDoRoundRobin,
  isRoundRobinAvailable: canDoRoundRobin,
  // ...
  reason: !allSupportImg2Img
    ? `${nonImg2ImgAIs.join(', ')} cannot improve images from other AIs. Select a single AI or only img2img-capable providers.`
    : undefined,
};
```

**Provider img2img support**:
| Provider | Image Generation | img2img Support |
|----------|-----------------|-----------------|
| OpenAI (gpt-image-1) | Yes | Yes |
| Google Gemini | Yes | Yes |
| Grok (xAI) | Yes | **No** |

## Compare Mode Implementation

**File**: `src/app/compare/page.tsx`

### Parallel Generation Flow

```typescript
const handleGenerateImage = useCallback(async (prompt: string) => {
  // Generate from ALL providers in parallel
  const generationPromises = selectedAIs.map(async (ai) => {
    const result = await service.generate({
      prompt,
      providerId: ai.provider,
    });

    if (result.success && result.images[0]) {
      const generatedImage: GeneratedImageMetadata = {
        url: result.images[0].url,
        base64: result.images[0].base64,
        revisedPrompt: result.images[0].revisedPrompt,
        prompt,
        model: result.model || ai.model,
        providerId: ai.provider,
      };

      // Update message with image in metadata (not content)
      const updatedMessage: Message = {
        ...aiMessage,
        content: '', // Image is the response; prompt stored in metadata
        metadata: {
          ...aiMessage.metadata,
          generatedImage,
        },
      };
      // ... persist and update state
    }
  });

  const results = await Promise.allSettled(generationPromises);
}, [/* deps */]);
```

**Key points**:
- Uses `Promise.allSettled` for true parallel execution
- Each AI's response stored in `message.metadata.generatedImage`
- `message.content` set to empty string (image is the response)
- Modal receives `mode="compare"` prop

## Chat Mode Round-Robin Implementation

**File**: `src/app/chat/page.tsx`

### Sequential Generation with img2img

```typescript
const handleGenerateImage = useCallback(async (prompt: string) => {
  let currentImage: GeneratedImage | null = null;

  // Sequential round-robin through all selected AIs
  for (let i = 0; i < selectedAIs.length; i++) {
    const ai = selectedAIs[i];
    const isFirstAI = i === 0;

    // Improvement prompt for subsequent iterations
    const improvementPrompt = isFirstAI
      ? prompt
      : `${prompt}\n\nImprove upon this image, enhancing details and quality while maintaining the core composition.`;

    // Validate base64 data exists for img2img
    const sourceImageBase64 = isFirstAI ? undefined : currentImage?.base64;
    if (!isFirstAI && !sourceImageBase64) {
      toast.error('Cannot improve image: previous image data unavailable');
      break;
    }

    const result = await service.generate({
      prompt: improvementPrompt,
      providerId: ai.provider,
      model: service.getDefaultModel(ai.provider) || undefined,
      sourceImage: sourceImageBase64, // Pass previous image for img2img
    });

    if (result.success && result.images[0]) {
      currentImage = result.images[0]; // Store for next iteration

      const generatedImageMeta: GeneratedImageMetadata = {
        url: currentImage.url,
        base64: currentImage.base64,
        revisedPrompt: currentImage.revisedPrompt,
        prompt,
        model: result.model,
        providerId: ai.provider,
        iterationNumber: i + 1,
        totalIterations: selectedAIs.length,
      };
      // ... create message and persist
    }
  }
}, [/* deps */]);
```

**Key points**:
- Sequential `for` loop (not parallel)
- Previous image's base64 passed as `sourceImage` for img2img
- Validates base64 exists before attempting img2img
- Iteration metadata stored for UI display (e.g., "Iteration 1/2")

## Message Bubble Changes

### Generated Image Display

**File**: `src/components/image-gen/GeneratedImageDisplay.tsx`

#### Expand Icon Placement

Moved expand functionality from a bottom button to an icon overlay in the top-right corner:

```tsx
{/* Expand icon - top right */}
<div className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
</div>
```

Applied to both compact and full display modes.

#### Removed Separate Expand Button

The bottom action area now only contains the Download button:

```tsx
{/* Actions */}
<div className="flex gap-2">
  <Button variant="secondary" size="sm" onClick={handleDownload} disabled={downloading} className="flex-1">
    {downloading ? 'Downloading...' : 'Download'}
  </Button>
</div>
```

### ChatMessageBubble

**File**: `src/components/chat/ChatMessageBubble.tsx`

Hide Copy button when message contains a generated image to prevent overlap:

```tsx
{!isUser && message.content && !message.metadata?.generatedImage && (
  <button onClick={handleCopy} className="absolute bottom-2 right-2 ...">
    {copied ? 'Copied' : 'Copy'}
  </button>
)}
```

### CompareMessageBubble

**File**: `src/components/compare/CompareMessageBubble.tsx`

Added support for rendering generated images from metadata:

```tsx
export function CompareMessageBubble({ message, isStreaming }: CompareMessageBubbleProps) {
  const generatedImage = message.metadata?.generatedImage;

  return (
    <div className="...">
      {/* Show generated image if present */}
      {generatedImage && (
        <div className="mb-3">
          <GeneratedImageDisplay
            image={{
              url: generatedImage.url,
              base64: generatedImage.base64,
              revisedPrompt: generatedImage.revisedPrompt,
            }}
            prompt={generatedImage.prompt}
            providerId={generatedImage.providerId as AIProvider}
            compact
          />
        </div>
      )}
      {/* ... text content */}
    </div>
  );
}
```

### CompareResponseColumn

**File**: `src/components/compare/CompareResponseColumn.tsx`

Updated `hasContent` check to include generated images:

```typescript
const hasContent = Boolean(message?.content?.trim())
  || Boolean(message?.attachments?.length)
  || Boolean(message?.metadata?.generatedImage);
```

## Proxy Service Changes

**File**: `src/lib/ai/proxy-service.ts`

### Added responseFormat Field

```typescript
export interface ImageProxyRequest {
  providerId: string;
  model: string;
  prompt: string;
  n?: number;
  sourceImage?: string; // Base64 for img2img
  responseFormat?: 'url' | 'b64_json'; // Request base64 for img2img support
}
```

### Increased Client Timeout

Firebase `httpsCallable` has a default 70-second timeout. Increased to match server:

```typescript
const proxyImageGeneration = httpsCallable<ImageProxyRequest, ImageProxyResponse>(
  functions,
  'proxyImageGeneration',
  { timeout: 300000 } // 5 minutes to match server-side timeout
);
```

## Provider Updates

### OpenAI Provider

**File**: `src/lib/ai/image/providers/openai.ts`

Always request base64 format:

```typescript
const proxyRequest: ImageProxyRequest = {
  providerId: 'openai',
  model,
  prompt: request.prompt,
  n: request.n || 1,
  responseFormat: 'b64_json', // Required for img2img round-robin
};
```

### Gemini Provider

**File**: `src/lib/ai/image/providers/gemini.ts`

Always request base64 format:

```typescript
const proxyRequest: ImageProxyRequest = {
  providerId: 'google',
  model,
  prompt: request.prompt,
  responseFormat: 'b64_json', // Required for img2img round-robin
};
```

## Firebase Function Changes

**File**: `functions/src/imageProxy.ts`

### Added Logging for Debugging

```typescript
// Log img2img request info
if (sourceImage) {
  console.log(`[ImageProxy] img2img request for ${providerId}/${resolvedModel}, sourceImage length: ${sourceImage.length}`);
  if (!providerConfig.supportsImageInput) {
    console.warn(`[ImageProxy] ${providerId} does not support img2img - sourceImage will be ignored`);
  }
}

// Log success with base64 availability
console.log(`[ImageProxy] ${providerId} generated ${data.length} image(s), has base64: ${data.every(d => !!d.b64_json)}`);

// Gemini-specific response structure logging
console.log(`[Gemini] Response structure: candidates=${data.candidates?.length || 0}, promptFeedback=${JSON.stringify(data.promptFeedback || {})}`);
```

### Added responseFormat to Interface

```typescript
interface ImageProxyRequest {
  providerId: string;
  model?: string;
  prompt: string;
  n?: number;
  sourceImage?: string;
  responseFormat?: 'url' | 'b64_json'; // Always returns b64_json regardless
}
```

Note: The function already returns base64 for all providers. This field is for API consistency.

## Type Changes

### GeneratedImageMetadata

**File**: `src/types/index.ts`

```typescript
export interface GeneratedImageMetadata {
  url: string;
  base64?: string;
  revisedPrompt?: string;
  prompt: string;
  model: string;
  providerId: string;
  iterationNumber?: number;   // For round-robin display
  totalIterations?: number;   // For round-robin display
}
```

## Summary of Key Behavioral Changes

1. **Compare Mode**: All selected AIs generate images in parallel from the same prompt. Results displayed side-by-side for comparison.

2. **Chat Mode Multi-AI**: Only available when ALL selected AIs support img2img. First AI generates from prompt, subsequent AIs receive the previous image + improvement instructions.

3. **Chat Mode Single AI**: Standard image generation, no img2img.

4. **UI Consistency**: Expand icon moved to top-right corner on hover. Copy button hidden for image messages. Both compact and full display modes updated.

5. **Timeout Handling**: Client-side timeout increased to 5 minutes to match server, preventing premature "Deadline exceeded" errors.

6. **Base64 Requirement**: All providers now request base64 format to ensure img2img capability in round-robin mode.

## Files Modified

| File | Changes |
|------|---------|
| `src/app/chat/page.tsx` | Round-robin with img2img, base64 validation |
| `src/app/compare/page.tsx` | Parallel generation, empty content for images |
| `src/components/chat/ChatMessageBubble.tsx` | Hide Copy for image messages |
| `src/components/compare/CompareMessageBubble.tsx` | Render GeneratedImageDisplay |
| `src/components/compare/CompareResponseColumn.tsx` | Include generatedImage in hasContent |
| `src/components/image-gen/GeneratedImageDisplay.tsx` | Expand icon in top-right |
| `src/components/image-gen/ImageGenerationModal.tsx` | Mode prop for compare/roundRobin |
| `src/components/image-gen/index.ts` | Export ImageGenerationMode type |
| `src/hooks/useImageGenerationAvailability.ts` | Require img2img for multi-AI chat |
| `src/lib/ai/image/providers/openai.ts` | Request b64_json format |
| `src/lib/ai/image/providers/gemini.ts` | Request b64_json format |
| `src/lib/ai/proxy-service.ts` | responseFormat field, 5-min timeout |
| `functions/src/imageProxy.ts` | Debug logging, responseFormat interface |

---

*Document created: December 2025*
*Last updated: December 28, 2025*
