import { useDispatch, useSelector } from 'react-redux';
import { RootState, startSession } from '../../store';
import { SessionService } from '../../services/home/SessionService';
import { AIConfig } from '../../types';

/**
 * Custom hook for managing session lifecycle and creation.
 * Encapsulates session-related state and actions.
 */
export const useSessionManagement = () => {
  const dispatch = useDispatch();
  const aiPersonalities = useSelector((state: RootState) => state.chat.aiPersonalities);
  const selectedModels = useSelector((state: RootState) => state.chat.selectedModels);

  /**
   * Creates a new session with the provided AIs.
   * 
   * @param selectedAIs - Array of AI configurations for the session
   * @returns Generated session ID
   */
  const createSession = (selectedAIs: AIConfig[]): string => {
    // Validate session before creation
    SessionService.validateSessionAIs(selectedAIs);
    
    // Update AIs with selected models
    const aisWithModels = selectedAIs.map(ai => ({
      ...ai,
      model: selectedModels[ai.id] || ai.model,
    }));
    
    // Prepare session data for Redux
    const sessionData = SessionService.prepareSessionData(aisWithModels, aiPersonalities, selectedModels);
    
    // Dispatch session creation to Redux
    dispatch(startSession(sessionData));
    
    // Return the session ID that Redux will create
    // The ChatScreen will save it when it loads
    return `session_${Date.now()}`;
  };

  /**
   * Validates session configuration.
   * 
   * @param selectedAIs - Array of AI configurations to validate
   * @returns True if session configuration is valid
   */
  const validateSession = (selectedAIs: AIConfig[]): boolean => {
    return SessionService.validateSessionConfiguration(selectedAIs, aiPersonalities);
  };

  /**
   * Checks if session can be created with current selection.
   * 
   * @param selectedAIs - Array of AI configurations
   * @returns True if session can be created
   */
  const canCreateSession = (selectedAIs: AIConfig[]): boolean => {
    try {
      SessionService.validateSessionAIs(selectedAIs);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Gets session limits based on premium status.
   * 
   * @param isPremium - Whether user has premium access
   * @param totalAvailableAIs - Total number of configured AIs
   * @returns Maximum number of AIs allowed
   */
  const getSessionLimits = (_isPremium: boolean, totalAvailableAIs: number): number => {
    return SessionService.calculateSessionLimits(totalAvailableAIs);
  };

  return {
    createSession,
    validateSession,
    canCreateSession,
    getSessionLimits,
    aiPersonalities,
  };
};
