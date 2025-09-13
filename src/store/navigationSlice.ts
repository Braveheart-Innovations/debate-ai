import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type SheetType = 'profile' | 'settings' | 'support' | 'demo' | 'subscription' | null;

interface NavigationState {
  // Sheet management
  activeSheet: SheetType;
  sheetVisible: boolean;
  sheetData?: Record<string, unknown>;
  
  // Header state
  headerTitle?: string;
  headerSubtitle?: string;
  showHeaderActions: boolean;
  showProfileIcon: boolean;
  
  // UI state
  isLoading: boolean;
  lastNavigatedTab?: string;
}

const initialState: NavigationState = {
  activeSheet: null,
  sheetVisible: false,
  sheetData: undefined,
  showHeaderActions: true,
  showProfileIcon: true,
  isLoading: false,
};

const navigationSlice = createSlice({
  name: 'navigation',
  initialState,
  reducers: {
    // Sheet actions
    showSheet: (state, action: PayloadAction<{ sheet: SheetType; data?: Record<string, unknown> }>) => {
      state.activeSheet = action.payload.sheet;
      state.sheetVisible = true;
      state.sheetData = action.payload.data;
    },
    hideSheet: (state) => {
      state.sheetVisible = false;
      // Keep activeSheet for animation purposes
    },
    clearSheet: (state) => {
      state.activeSheet = null;
      state.sheetVisible = false;
      state.sheetData = undefined;
    },
    
    // Header actions
    setHeaderTitle: (state, action: PayloadAction<string | undefined>) => {
      state.headerTitle = action.payload;
    },
    setHeaderSubtitle: (state, action: PayloadAction<string | undefined>) => {
      state.headerSubtitle = action.payload;
    },
    setShowHeaderActions: (state, action: PayloadAction<boolean>) => {
      state.showHeaderActions = action.payload;
    },
    setShowProfileIcon: (state, action: PayloadAction<boolean>) => {
      state.showProfileIcon = action.payload;
    },
    
    // UI state
    setNavigationLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setLastNavigatedTab: (state, action: PayloadAction<string>) => {
      state.lastNavigatedTab = action.payload;
    },
    
    // Reset all navigation state
    resetNavigationState: () => initialState,
  },
});

export const {
  showSheet,
  hideSheet,
  clearSheet,
  setHeaderTitle,
  setHeaderSubtitle,
  setShowHeaderActions,
  setShowProfileIcon,
  setNavigationLoading,
  setLastNavigatedTab,
  resetNavigationState,
} = navigationSlice.actions;

export default navigationSlice.reducer;
