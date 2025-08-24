import React, { createContext, useContext, useReducer, ReactNode } from 'react';

// Define the types of sheets that can be shown
export type SheetType = 'profile' | 'settings' | 'notifications' | 'help' | null;

// Sheet state interface
interface SheetState {
  activeSheet: SheetType;
  isVisible: boolean;
  data?: Record<string, unknown>;
}

// Actions for the sheet reducer
type SheetAction =
  | { type: 'SHOW_SHEET'; payload: { sheet: SheetType; data?: Record<string, unknown> } }
  | { type: 'HIDE_SHEET' }
  | { type: 'HIDE_ALL_SHEETS' };

// Initial state
const initialState: SheetState = {
  activeSheet: null,
  isVisible: false,
  data: undefined,
};

// Reducer function
const sheetReducer = (state: SheetState, action: SheetAction): SheetState => {
  switch (action.type) {
    case 'SHOW_SHEET':
      return {
        ...state,
        activeSheet: action.payload.sheet,
        isVisible: true,
        data: action.payload.data,
      };
    case 'HIDE_SHEET':
      return {
        ...state,
        isVisible: false,
        // Keep activeSheet for animation purposes, clear it after animation
      };
    case 'HIDE_ALL_SHEETS':
      return {
        ...initialState,
      };
    default:
      return state;
  }
};

// Context interface
interface SheetContextValue {
  state: SheetState;
  showSheet: (sheet: SheetType, data?: Record<string, unknown>) => void;
  hideSheet: () => void;
  hideAllSheets: () => void;
  isSheetVisible: (sheet: SheetType) => boolean;
}

// Create context
const SheetContext = createContext<SheetContextValue | undefined>(undefined);

// Provider component
interface SheetProviderProps {
  children: ReactNode;
}

export const SheetProvider: React.FC<SheetProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(sheetReducer, initialState);

  const showSheet = (sheet: SheetType, data?: Record<string, unknown>) => {
    dispatch({ type: 'SHOW_SHEET', payload: { sheet, data } });
  };

  const hideSheet = () => {
    dispatch({ type: 'HIDE_SHEET' });
  };

  const hideAllSheets = () => {
    dispatch({ type: 'HIDE_ALL_SHEETS' });
  };

  const isSheetVisible = (sheet: SheetType) => {
    return state.isVisible && state.activeSheet === sheet;
  };

  const value: SheetContextValue = {
    state,
    showSheet,
    hideSheet,
    hideAllSheets,
    isSheetVisible,
  };

  return (
    <SheetContext.Provider value={value}>
      {children}
    </SheetContext.Provider>
  );
};

// Custom hook to use the sheet context
export const useSheet = (): SheetContextValue => {
  const context = useContext(SheetContext);
  if (context === undefined) {
    throw new Error('useSheet must be used within a SheetProvider');
  }
  return context;
};

// Convenience hooks for specific sheets
export const useProfileSheet = () => {
  const { showSheet, hideSheet, isSheetVisible } = useSheet();
  
  return {
    show: (data?: Record<string, unknown>) => showSheet('profile', data),
    hide: hideSheet,
    isVisible: isSheetVisible('profile'),
  };
};

export const useSettingsSheet = () => {
  const { showSheet, hideSheet, isSheetVisible } = useSheet();
  
  return {
    show: (data?: Record<string, unknown>) => showSheet('settings', data),
    hide: hideSheet,
    isVisible: isSheetVisible('settings'),
  };
};

export const useNotificationsSheet = () => {
  const { showSheet, hideSheet, isSheetVisible } = useSheet();
  
  return {
    show: (data?: Record<string, unknown>) => showSheet('notifications', data),
    hide: hideSheet,
    isVisible: isSheetVisible('notifications'),
  };
};

export const useHelpSheet = () => {
  const { showSheet, hideSheet, isSheetVisible } = useSheet();
  
  return {
    show: (data?: Record<string, unknown>) => showSheet('help', data),
    hide: hideSheet,
    isVisible: isSheetVisible('help'),
  };
};