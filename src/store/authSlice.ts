import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../services/firebase/auth';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  authLoading: boolean;
  authModalVisible: boolean;
  userProfile: {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    createdAt: number | null;
    membershipStatus: 'demo' | 'trial' | 'premium';
    preferences?: Record<string, unknown>;
    authProvider?: 'email' | 'apple' | 'google';
  } | null;
  // Social auth state
  lastAuthMethod: 'email' | 'apple' | 'google' | null;
  socialAuthLoading: boolean;
  socialAuthError: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  userProfile: null,
  // Social auth state
  lastAuthMethod: null,
  socialAuthLoading: false,
  socialAuthError: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setUserProfile: (state, action: PayloadAction<AuthState['userProfile']>) => {
      state.userProfile = action.payload;
      // Premium access includes both 'premium' and 'trial' status
      state.isPremium = action.payload?.membershipStatus === 'premium' || action.payload?.membershipStatus === 'trial';
    },
    setPremiumStatus: (state, action: PayloadAction<boolean>) => {
      state.isPremium = action.payload;
      if (state.userProfile) {
        state.userProfile.membershipStatus = action.payload ? 'premium' : 'demo';
      }
    },
    setAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.authLoading = action.payload;
    },
    setAuthModalVisible: (state, action: PayloadAction<boolean>) => {
      state.authModalVisible = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isPremium = false;
      state.userProfile = null;
      state.authModalVisible = false;
      state.lastAuthMethod = null;
      state.socialAuthLoading = false;
      state.socialAuthError = null;
    },
    // Social auth actions
    setSocialAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.socialAuthLoading = action.payload;
    },
    setSocialAuthError: (state, action: PayloadAction<string | null>) => {
      state.socialAuthError = action.payload;
    },
    setLastAuthMethod: (state, action: PayloadAction<AuthState['lastAuthMethod']>) => {
      state.lastAuthMethod = action.payload;
    },
    setAuthUser: (state, action: PayloadAction<AuthUser | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
  },
});

export const {
  setUser,
  setUserProfile,
  setPremiumStatus,
  setAuthLoading,
  setAuthModalVisible,
  logout,
  // Social auth actions
  setSocialAuthLoading,
  setSocialAuthError,
  setLastAuthMethod,
  setAuthUser,
} = authSlice.actions;

export default authSlice.reducer;
