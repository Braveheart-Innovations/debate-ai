/**
 * FlowStateService
 *
 * Manages the state of API key acquisition flows.
 * Persists flow state so users can resume if they leave the app.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProviderId } from './ClipboardDetectionService';

const FLOW_STATE_KEY = 'symposium_api_key_flow_state';
const FLOW_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export type FlowStep =
  | 'guidance_shown'
  | 'webview_opened'
  | 'key_page_reached'
  | 'key_copied'
  | 'completed'
  | 'cancelled';

export interface FlowState {
  providerId: ProviderId;
  step: FlowStep;
  startedAt: number;
  lastUpdatedAt: number;
  currentUrl?: string;
}

class FlowStateServiceClass {
  private currentFlow: FlowState | null = null;

  /**
   * Start a new API key acquisition flow.
   * @param providerId - The provider the user is getting a key for.
   * @returns The new flow state.
   */
  async startFlow(providerId: ProviderId): Promise<FlowState> {
    const now = Date.now();
    const flow: FlowState = {
      providerId,
      step: 'guidance_shown',
      startedAt: now,
      lastUpdatedAt: now,
    };

    this.currentFlow = flow;
    await this.persistFlow(flow);
    return flow;
  }

  /**
   * Update the current flow step.
   * @param step - The new step.
   * @param currentUrl - Optional: The current URL in the WebView.
   */
  async updateStep(step: FlowStep, currentUrl?: string): Promise<void> {
    if (!this.currentFlow) return;

    this.currentFlow = {
      ...this.currentFlow,
      step,
      lastUpdatedAt: Date.now(),
      currentUrl: currentUrl || this.currentFlow.currentUrl,
    };

    await this.persistFlow(this.currentFlow);
  }

  /**
   * Mark the current flow as completed.
   */
  async completeFlow(): Promise<void> {
    if (this.currentFlow) {
      this.currentFlow.step = 'completed';
      this.currentFlow.lastUpdatedAt = Date.now();
    }
    await this.clearFlow();
  }

  /**
   * Mark the current flow as cancelled.
   */
  async cancelFlow(): Promise<void> {
    if (this.currentFlow) {
      this.currentFlow.step = 'cancelled';
      this.currentFlow.lastUpdatedAt = Date.now();
    }
    await this.clearFlow();
  }

  /**
   * Get the current active flow.
   * @returns The current flow state or null.
   */
  getCurrentFlow(): FlowState | null {
    return this.currentFlow;
  }

  /**
   * Check if there's a pending flow that can be resumed.
   * @returns The pending flow state if one exists and hasn't expired.
   */
  async getPendingFlow(): Promise<FlowState | null> {
    try {
      const stored = await AsyncStorage.getItem(FLOW_STATE_KEY);
      if (!stored) return null;

      const flow: FlowState = JSON.parse(stored);

      // Check if flow has expired
      if (Date.now() - flow.lastUpdatedAt > FLOW_EXPIRY_MS) {
        await this.clearFlow();
        return null;
      }

      // Don't return completed or cancelled flows
      if (flow.step === 'completed' || flow.step === 'cancelled') {
        await this.clearFlow();
        return null;
      }

      this.currentFlow = flow;
      return flow;
    } catch {
      return null;
    }
  }

  /**
   * Check if user was in the middle of getting a key for a specific provider.
   * @param providerId - The provider to check.
   * @returns True if there's a pending flow for this provider.
   */
  async hasPendingFlowFor(providerId: ProviderId): Promise<boolean> {
    const pending = await this.getPendingFlow();
    return pending?.providerId === providerId;
  }

  /**
   * Get a human-readable message about the pending flow.
   * @returns A message describing the pending flow state.
   */
  getPendingFlowMessage(): string | null {
    if (!this.currentFlow) return null;

    const providerName = this.getProviderDisplayName(this.currentFlow.providerId);

    switch (this.currentFlow.step) {
      case 'guidance_shown':
        return `You were setting up ${providerName}. Would you like to continue?`;
      case 'webview_opened':
      case 'key_page_reached':
        return `You were getting an API key from ${providerName}. Did you copy your key?`;
      case 'key_copied':
        return `You copied a key from ${providerName}. Would you like to paste it now?`;
      default:
        return null;
    }
  }

  /**
   * Get elapsed time since flow started.
   * @returns Time elapsed in seconds, or 0 if no flow.
   */
  getElapsedTime(): number {
    if (!this.currentFlow) return 0;
    return Math.floor((Date.now() - this.currentFlow.startedAt) / 1000);
  }

  /**
   * Persist flow state to AsyncStorage.
   */
  private async persistFlow(flow: FlowState): Promise<void> {
    try {
      await AsyncStorage.setItem(FLOW_STATE_KEY, JSON.stringify(flow));
    } catch {
      // Storage failure is non-critical
    }
  }

  /**
   * Clear persisted flow state.
   */
  private async clearFlow(): Promise<void> {
    this.currentFlow = null;
    try {
      await AsyncStorage.removeItem(FLOW_STATE_KEY);
    } catch {
      // Storage failure is non-critical
    }
  }

  /**
   * Get display name for a provider.
   */
  private getProviderDisplayName(providerId: ProviderId): string {
    const names: Record<ProviderId, string> = {
      openai: 'OpenAI',
      claude: 'Claude',
      google: 'Google Gemini',
      perplexity: 'Perplexity',
      mistral: 'Mistral',
      grok: 'Grok',
      cohere: 'Cohere',
      together: 'Together AI',
      deepseek: 'DeepSeek',
    };
    return names[providerId] || providerId;
  }
}

export const FlowStateService = new FlowStateServiceClass();
