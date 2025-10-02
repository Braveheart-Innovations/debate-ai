import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { SheetProvider, useSheet, useProfileSheet } from '@/contexts/SheetContext';

describe('SheetContext', () => {
  it('updates state when showing and hiding sheets', () => {
    const { result } = renderHook(() => useSheet(), {
      wrapper: ({ children }) => <SheetProvider>{children}</SheetProvider>,
    });

    act(() => {
      result.current.showSheet('settings', { from: 'test' });
    });

    expect(result.current.state.activeSheet).toBe('settings');
    expect(result.current.state.isVisible).toBe(true);
    expect(result.current.state.data).toEqual({ from: 'test' });

    act(() => {
      result.current.hideSheet();
    });

    expect(result.current.state.isVisible).toBe(false);

    act(() => {
      result.current.hideAllSheets();
    });

    expect(result.current.state.activeSheet).toBeNull();
    expect(result.current.state.data).toBeUndefined();
  });

  it('provides convenience hooks for specific sheets', () => {
    const { result } = renderHook(() => useProfileSheet(), {
      wrapper: ({ children }) => <SheetProvider>{children}</SheetProvider>,
    });

    act(() => {
      result.current.show({ reason: 'profile' });
    });

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.hide();
    });

    expect(result.current.isVisible).toBe(false);
  });
});
