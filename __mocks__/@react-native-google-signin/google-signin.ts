export const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn().mockResolvedValue(true),
  signIn: jest.fn().mockResolvedValue({
    user: {
      id: 'mock-google-id',
      email: 'test@example.com',
      name: 'Test User',
      photo: null,
    },
  }),
  signOut: jest.fn().mockResolvedValue(null),
  revokeAccess: jest.fn().mockResolvedValue(null),
  isSignedIn: jest.fn().mockResolvedValue(false),
  getCurrentUser: jest.fn().mockResolvedValue(null),
  getTokens: jest.fn().mockResolvedValue({
    idToken: 'mock-id-token',
    accessToken: 'mock-access-token',
  }),
};

export const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

export default GoogleSignin;
