/**
 * ClipboardDetectionService
 *
 * Handles clipboard detection and validation for API keys.
 * Detects API key patterns when user returns to the app after copying a key.
 */

import * as Clipboard from 'expo-clipboard';

export type ProviderId =
  | 'openai'
  | 'claude'
  | 'google'
  | 'perplexity'
  | 'mistral'
  | 'grok'
  | 'cohere'
  | 'together'
  | 'deepseek';

export interface DetectionResult {
  detected: boolean;
  providerId?: ProviderId;
  confidence: 'high' | 'medium' | 'low';
  content?: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: 'high' | 'medium' | 'low';
  message?: string;
}

/**
 * API key pattern matchers for each provider.
 * These patterns are used to detect and validate API keys from clipboard.
 */
const API_KEY_PATTERNS: Record<ProviderId, RegExp> = {
  openai: /^sk-[a-zA-Z0-9_-]{20,}$/,
  claude: /^sk-ant-[a-zA-Z0-9_-]{40,}$/,
  google: /^AIza[a-zA-Z0-9_-]{35}$/,
  perplexity: /^pplx-[a-zA-Z0-9]{40,}$/,
  mistral: /^[a-zA-Z0-9]{32}$/,
  grok: /^xai-[a-zA-Z0-9]{40,}$/,
  cohere: /^[a-zA-Z0-9]{40}$/,
  together: /^[a-zA-Z0-9]{64}$/,
  deepseek: /^sk-[a-zA-Z0-9]{48}$/,
};

/**
 * Provider-specific prefixes for high-confidence detection.
 */
const PROVIDER_PREFIXES: Partial<Record<ProviderId, string>> = {
  openai: 'sk-',
  claude: 'sk-ant-',
  google: 'AIza',
  perplexity: 'pplx-',
  grok: 'xai-',
  deepseek: 'sk-',
};

/**
 * Minimum key lengths for validation.
 */
const MIN_KEY_LENGTHS: Record<ProviderId, number> = {
  openai: 20,
  claude: 40,
  google: 39,
  perplexity: 45,
  mistral: 32,
  grok: 43,
  cohere: 40,
  together: 64,
  deepseek: 50,
};

class ClipboardDetectionServiceClass {
  /**
   * Check clipboard for potential API key content.
   * @returns The clipboard content if accessible, null otherwise.
   */
  async getClipboardContent(): Promise<string | null> {
    try {
      const content = await Clipboard.getStringAsync();
      return content?.trim() || null;
    } catch {
      // Clipboard access may fail due to permissions
      return null;
    }
  }

  /**
   * Validate if a string matches the expected API key format for a provider.
   * @param content - The string to validate.
   * @param providerId - The provider to validate against.
   * @returns Validation result with confidence level.
   */
  validateAsApiKey(content: string, providerId: ProviderId): ValidationResult {
    if (!content || content.length < 10) {
      return {
        isValid: false,
        confidence: 'low',
        message: 'Content is too short to be an API key',
      };
    }

    const trimmed = content.trim();
    const pattern = API_KEY_PATTERNS[providerId];
    const prefix = PROVIDER_PREFIXES[providerId];
    const minLength = MIN_KEY_LENGTHS[providerId];

    // Check minimum length
    if (trimmed.length < minLength) {
      return {
        isValid: false,
        confidence: 'low',
        message: `Key is too short for ${providerId}`,
      };
    }

    // Check for known prefix (high confidence)
    if (prefix && trimmed.startsWith(prefix)) {
      if (pattern.test(trimmed)) {
        return {
          isValid: true,
          confidence: 'high',
          message: 'Key matches expected format',
        };
      }
      return {
        isValid: true,
        confidence: 'medium',
        message: 'Key has correct prefix but unusual format',
      };
    }

    // Check pattern match without prefix
    if (pattern.test(trimmed)) {
      return {
        isValid: true,
        confidence: 'medium',
        message: 'Key matches pattern',
      };
    }

    // For providers without distinctive prefixes, use length heuristic
    if (!prefix && trimmed.length >= minLength && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return {
        isValid: true,
        confidence: 'low',
        message: 'Key appears valid based on length and characters',
      };
    }

    return {
      isValid: false,
      confidence: 'low',
      message: 'Content does not match expected API key format',
    };
  }

  /**
   * Detect which provider an API key belongs to based on its format.
   * @param content - The potential API key.
   * @returns The detected provider ID or undefined if no match.
   */
  detectProvider(content: string): ProviderId | undefined {
    if (!content || content.length < 10) {
      return undefined;
    }

    const trimmed = content.trim();

    // Check prefixes first (highest confidence)
    for (const [providerId, prefix] of Object.entries(PROVIDER_PREFIXES)) {
      if (prefix && trimmed.startsWith(prefix)) {
        // Special case: both OpenAI and DeepSeek use 'sk-' prefix
        if (prefix === 'sk-' && !trimmed.startsWith('sk-ant-')) {
          // Differentiate by length: DeepSeek keys are longer
          if (trimmed.length >= 50) {
            return 'deepseek';
          }
          return 'openai';
        }
        return providerId as ProviderId;
      }
    }

    // Check pattern matches
    for (const [providerId, pattern] of Object.entries(API_KEY_PATTERNS)) {
      if (pattern.test(trimmed)) {
        return providerId as ProviderId;
      }
    }

    return undefined;
  }

  /**
   * Check clipboard and detect if it contains an API key.
   * @param expectedProviderId - Optional: The provider we expect the key to be for.
   * @returns Detection result with provider and confidence.
   */
  async checkClipboard(expectedProviderId?: ProviderId): Promise<DetectionResult> {
    const content = await this.getClipboardContent();

    if (!content) {
      return {
        detected: false,
        confidence: 'low',
      };
    }

    // If we have an expected provider, validate against it
    if (expectedProviderId) {
      const validation = this.validateAsApiKey(content, expectedProviderId);
      if (validation.isValid) {
        return {
          detected: true,
          providerId: expectedProviderId,
          confidence: validation.confidence,
          content,
        };
      }
    }

    // Try to detect provider from content
    const detectedProvider = this.detectProvider(content);
    if (detectedProvider) {
      const validation = this.validateAsApiKey(content, detectedProvider);
      return {
        detected: true,
        providerId: detectedProvider,
        confidence: validation.confidence,
        content,
      };
    }

    return {
      detected: false,
      confidence: 'low',
    };
  }

  /**
   * Check if the clipboard content looks like any API key (without provider specificity).
   * Useful for generic "we found something" detection.
   * @returns True if clipboard contains what looks like an API key.
   */
  async hasApiKeyLikeContent(): Promise<boolean> {
    const content = await this.getClipboardContent();
    if (!content) return false;

    const trimmed = content.trim();

    // Basic heuristics for API key-like content:
    // - At least 20 characters
    // - Only alphanumeric, dash, underscore
    // - No spaces
    // - Has common API key prefixes
    if (trimmed.length < 20) return false;
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return false;

    // Check for common API key prefixes
    const commonPrefixes = ['sk-', 'AIza', 'pplx-', 'xai-'];
    for (const prefix of commonPrefixes) {
      if (trimmed.startsWith(prefix)) return true;
    }

    // Long alphanumeric strings are likely API keys
    return trimmed.length >= 32;
  }
}

export const ClipboardDetectionService = new ClipboardDetectionServiceClass();
