/**
 * useAPIKeyFlowState
 *
 * Hook for managing API key acquisition flow state.
 * Handles starting, updating, and resuming flows.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FlowStateService,
  FlowState,
  FlowStep,
  ProviderId,
} from '@/services/apiKeyAcquisition';

interface UseAPIKeyFlowStateReturn {
  /** The current flow state, if any. */
  currentFlow: FlowState | null;
  /** Whether there's a pending flow that can be resumed. */
  hasPendingFlow: boolean;
  /** Message describing the pending flow state. */
  pendingFlowMessage: string | null;
  /** Start a new flow for a provider. */
  startFlow: (providerId: ProviderId) => Promise<FlowState>;
  /** Update the current flow step. */
  updateStep: (step: FlowStep, currentUrl?: string) => Promise<void>;
  /** Mark the flow as completed. */
  completeFlow: () => Promise<void>;
  /** Cancel the current flow. */
  cancelFlow: () => Promise<void>;
  /** Check for and load a pending flow. */
  checkPendingFlow: () => Promise<FlowState | null>;
  /** Get elapsed time since flow started (in seconds). */
  elapsedTime: number;
}

export function useAPIKeyFlowState(): UseAPIKeyFlowStateReturn {
  const [currentFlow, setCurrentFlow] = useState<FlowState | null>(null);
  const [hasPendingFlow, setHasPendingFlow] = useState(false);
  const [pendingFlowMessage, setPendingFlowMessage] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Check for pending flow on mount
  useEffect(() => {
    const loadPendingFlow = async () => {
      const pending = await FlowStateService.getPendingFlow();
      if (pending) {
        setCurrentFlow(pending);
        setHasPendingFlow(true);
        setPendingFlowMessage(FlowStateService.getPendingFlowMessage());
      }
    };
    loadPendingFlow();
  }, []);

  // Update elapsed time while flow is active
  useEffect(() => {
    if (!currentFlow) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(FlowStateService.getElapsedTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [currentFlow]);

  const checkPendingFlow = useCallback(async (): Promise<FlowState | null> => {
    const pending = await FlowStateService.getPendingFlow();
    if (pending) {
      setCurrentFlow(pending);
      setHasPendingFlow(true);
      setPendingFlowMessage(FlowStateService.getPendingFlowMessage());
      return pending;
    }
    setHasPendingFlow(false);
    setPendingFlowMessage(null);
    return null;
  }, []);

  const startFlow = useCallback(async (providerId: ProviderId): Promise<FlowState> => {
    const flow = await FlowStateService.startFlow(providerId);
    setCurrentFlow(flow);
    setHasPendingFlow(false);
    setPendingFlowMessage(null);
    return flow;
  }, []);

  const updateStep = useCallback(
    async (step: FlowStep, currentUrl?: string): Promise<void> => {
      await FlowStateService.updateStep(step, currentUrl);
      const updated = FlowStateService.getCurrentFlow();
      setCurrentFlow(updated);
    },
    []
  );

  const completeFlow = useCallback(async (): Promise<void> => {
    await FlowStateService.completeFlow();
    setCurrentFlow(null);
    setHasPendingFlow(false);
    setPendingFlowMessage(null);
  }, []);

  const cancelFlow = useCallback(async (): Promise<void> => {
    await FlowStateService.cancelFlow();
    setCurrentFlow(null);
    setHasPendingFlow(false);
    setPendingFlowMessage(null);
  }, []);

  return {
    currentFlow,
    hasPendingFlow,
    pendingFlowMessage,
    startFlow,
    updateStep,
    completeFlow,
    cancelFlow,
    checkPendingFlow,
    elapsedTime,
  };
}
