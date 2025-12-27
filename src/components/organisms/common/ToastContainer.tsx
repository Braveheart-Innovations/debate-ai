import React, { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { ToastNotification } from '../../molecules/feedback/ToastNotification';
import {
  selectActiveToast,
  selectToastDuration,
  clearActiveToast,
} from '../../../store/errorSlice';

/**
 * ToastContainer - Global toast notification container
 *
 * Connects to Redux error state and displays the active toast.
 * Should be rendered at the root level of the app.
 *
 * Features:
 * - Displays active error toast from Redux
 * - Handles dismiss to show next error in queue
 * - Respects toast duration from settings
 * - Critical errors require manual dismissal
 */
export const ToastContainer: React.FC = () => {
  const dispatch = useDispatch();
  const activeToast = useSelector(selectActiveToast);
  const duration = useSelector(selectToastDuration);

  const handleDismiss = useCallback(() => {
    dispatch(clearActiveToast());
  }, [dispatch]);

  const handleRetry = useCallback(() => {
    // Note: Actual retry logic would be handled by the component
    // that triggered the error. For now, just dismiss.
    // Future enhancement: Store retry action in errorSlice
    handleDismiss();
  }, [handleDismiss]);

  if (!activeToast) {
    return null;
  }

  return (
    <ToastNotification
      message={activeToast.message}
      severity={activeToast.severity}
      visible={true}
      onDismiss={handleDismiss}
      onRetry={activeToast.retryable ? handleRetry : undefined}
      retryable={activeToast.retryable}
      duration={duration}
      position="top"
    />
  );
};
