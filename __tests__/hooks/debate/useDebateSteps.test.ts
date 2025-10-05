import { act, renderHook } from '@testing-library/react-native';
import { useDebateSteps } from '@/hooks/debate/useDebateSteps';

describe('useDebateSteps', () => {
  it('advances through steps and marks completion', () => {
    const { result } = renderHook(() => useDebateSteps('topic'));

    expect(result.current.currentStep).toBe('topic');
    expect(result.current.isFirstStep).toBe(true);

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.currentStep).toBe('ai');
    expect(result.current.completedSteps).toContain('topic');
    expect(result.current.isFirstStep).toBe(false);

    act(() => {
      result.current.goToStep('review');
    });

    expect(result.current.currentStep).toBe('review');
    expect(result.current.isLastStep).toBe(true);
    expect(result.current.stepProgress).toBe(100);
  });

  it('prevents jumping forward when prerequisites missing', () => {
    const { result } = renderHook(() => useDebateSteps('topic'));

    expect(result.current.canProceedToStep('personality')).toBe(false);

    act(() => {
      result.current.markStepCompleted('topic');
    });

    expect(result.current.canProceedToStep('ai')).toBe(true);
    expect(result.current.canProceedToStep('review')).toBe(false);
  });

  it('resets back to initial state', () => {
    const { result } = renderHook(() => useDebateSteps('topic'));

    act(() => {
      result.current.nextStep();
      result.current.resetSteps();
    });

    expect(result.current.currentStep).toBe('topic');
    expect(result.current.completedSteps).toHaveLength(0);
    expect(result.current.getStepLabel('ai')).toBe('Debaters');
  });
});
