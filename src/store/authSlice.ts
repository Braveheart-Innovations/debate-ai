import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { User } from '../services/firebase/auth';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isPremium: boolean;
  authLoading: boolean;
  authModalVisible: boolean;
  userProfile: {
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    createdAt: Date | null;
    membershipStatus: 'free' | 'premium';
    preferences?: Record<string, unknown>;
  } | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isPremium: false,
  authLoading: false,
  authModalVisible: false,
  userProfile: null,
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
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.isPremium = false;
      state.userProfile = null;
      state.authModalVisible = false;
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
} = authSlice.actions;

export default authSlice.reducer;