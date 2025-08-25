import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../services/firebase/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  authLoading: boolean;
  authModalVisible: boolean;
  profileSheetVisible: boolean;
  userProfile: {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    createdAt: Date | null;
    membershipStatus: 'free' | 'premium';
    preferences?: Record<string, unknown>;
    authProvider?: 'email' | 'apple' | 'google' | 'anonymous';
  } | null;
  // Social auth state
  isAnonymous: boolean;
  lastAuthMethod: 'email' | 'apple' | 'google' | 'anonymous' | null;
  socialAuthLoading: boolean;
  socialAuthError: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  profileSheetVisible: false,
  userProfile: null,
  // Social auth state
  isAnonymous: false,
  lastAuthMethod: null,
  socialAuthLoading: false,
  socialAuthError: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setUserProfile: (state, action: PayloadAction<AuthState['userProfile']>) => {
      state.userProfile = action.payload;
      state.isPremium = action.payload?.membershipStatus === 'premium';
    },
    setPremiumStatus: (state, action: PayloadAction<boolean>) => {
      state.isPremium = action.payload;
      if (state.userProfile) {
        state.userProfile.membershipStatus = action.payload ? 'premium' : 'free';
      }
    },
    setAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.authLoading = action.payload;
    },
    setAuthModalVisible: (state, action: PayloadAction<boolean>) => {
      state.authModalVisible = action.payload;
    },
    setProfileSheetVisible: (state, action: PayloadAction<boolean>) => {
      state.profileSheetVisible = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isPremium = false;
      state.userProfile = null;
      state.authModalVisible = false;
      state.profileSheetVisible = false;
      state.isAnonymous = false;
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
    setIsAnonymous: (state, action: PayloadAction<boolean>) => {
      state.isAnonymous = action.payload;
      if (action.payload) {
        state.lastAuthMethod = 'anonymous';
      }
    },
    setAuthUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
      state.isAnonymous = action.payload?.isAnonymous || false;
    },
  },
});

export const {
  setUser,
  setUserProfile,
  setPremiumStatus,
  setAuthLoading,
  setAuthModalVisible,
  setProfileSheetVisible,
  logout,
  // Social auth actions
  setSocialAuthLoading,
  setSocialAuthError,
  setLastAuthMethod,
  setIsAnonymous,
  setAuthUser,
} = authSlice.actions;

export default authSlice.reducer;