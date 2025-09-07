import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import AppIcon from '../../../../assets/icon.png';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setAuthModalVisible, setAuthUser, setUserProfile } from '../../../store';
import { useTheme } from '../../../theme';
import { Typography } from '../../molecules/Typography';
import { Button } from '../../molecules/Button';
import { EmailAuthForm } from '../../molecules/auth/EmailAuthForm';
import { 
  signInWithEmail, 
  signUpWithEmail, 
  signInAnonymously,
  signOut,
  toAuthUser
} from '../../../services/firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from '@react-native-firebase/firestore';

interface AuthModalProps {
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { authModalVisible, isAuthenticated, userProfile, authLoading } = useSelector(
    (state: RootState) => state.auth
  );
  
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'profile'>('signin');
  const [loading, setLoading] = useState(false);
  
  // Determine initial mode based on auth state
  useEffect(() => {
    if (isAuthenticated && userProfile) {
      setAuthMode('profile');
    } else {
      setAuthMode('signin');
    }
  }, [isAuthenticated, userProfile]);
  
  const handleClose = () => {
    if (onClose) onClose();
    dispatch(setAuthModalVisible(false));
  };
  
  const handleEmailAuth = async (email: string, password: string) => {
    setLoading(true);
    try {
      let user;
      if (authMode === 'signup') {
        user = await signUpWithEmail(email, password);
        
        // Create user profile in Firestore
        const db = getFirestore();
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName || email.split('@')[0],
          createdAt: serverTimestamp(),
          membershipStatus: 'free',
          preferences: {},
        });
      } else {
        user = await signInWithEmail(email, password);
      }
      
      // Fetch user profile
      const db = getFirestore();
      const userDocRef = doc(db, 'users', user.uid);
      const profileDoc = await getDoc(userDocRef);
      
      const profileData = profileDoc.data();
      
      dispatch(setAuthUser(toAuthUser(user)));
      dispatch(setUserProfile({
        email: user.email,
        displayName: profileData?.displayName || user.displayName,
        photoURL: user.photoURL,
        createdAt: profileData?.createdAt?.toDate
          ? profileData.createdAt.toDate().getTime()
          : typeof profileData?.createdAt === 'number'
          ? profileData.createdAt
          : Date.now(),
        membershipStatus: profileData?.membershipStatus || 'free',
        preferences: profileData?.preferences || {},
      }));
      
      handleClose();
    } catch (error) {
      Alert.alert(
        'Authentication Error',
        error instanceof Error ? error.message : 'An error occurred during authentication'
      );
    } finally {
      setLoading(false);
    }
  };
  
  const handleAnonymousSignIn = async () => {
    setLoading(true);
    try {
      const user = await signInAnonymously();
      dispatch(setAuthUser(toAuthUser(user)));
      dispatch(setUserProfile({
        email: null,
        displayName: 'Anonymous User',
        photoURL: null,
        createdAt: Date.now(),
        membershipStatus: 'free',
        preferences: {},
      }));
      handleClose();
    } catch {
      Alert.alert('Error', 'Failed to sign in anonymously');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      dispatch(setAuthUser(null));
      dispatch(setUserProfile(null));
      setAuthMode('signin');
      handleClose();
    } catch {
      Alert.alert('Error', 'Failed to sign out');
    } finally {
      setLoading(false);
    }
  };
  
  const renderProfileView = () => (
    <View style={styles.profileContainer}>
      <Typography variant="title" weight="bold" style={styles.profileName}>
        {userProfile?.displayName || 'Anonymous User'}
      </Typography>
      
      {userProfile?.email && (
        <Typography variant="body" color="secondary" style={styles.profileEmail}>
          {userProfile.email}
        </Typography>
      )}
      
      <View style={[styles.membershipBadge, {
        backgroundColor: userProfile?.membershipStatus === 'premium' 
          ? theme.colors.primary[500] 
          : theme.colors.surface
      }]}>
        <Ionicons 
          name={userProfile?.membershipStatus === 'premium' ? 'star' : 'person-outline'} 
          size={16} 
          color={userProfile?.membershipStatus === 'premium' 
            ? theme.colors.background 
            : theme.colors.text.secondary} 
        />
        <Typography 
          variant="caption" 
          weight="bold"
          color={userProfile?.membershipStatus === 'premium' ? 'inverse' : 'secondary'}
        >
          {userProfile?.membershipStatus === 'premium' ? 'Premium Member' : 'Free Account'}
        </Typography>
      </View>
      
      {userProfile?.membershipStatus === 'free' && (
        <Button
          title="Upgrade to Premium"
          onPress={() => Alert.alert('Coming Soon', 'Premium upgrades will be available soon!')}
          variant="primary"
          fullWidth
          style={styles.upgradeButton}
        />
      )}
      
      <Button
        title="Sign Out"
        onPress={handleSignOut}
        variant="danger"
        fullWidth
        style={styles.signOutButton}
      />
    </View>
  );
  
  const renderAuthView = () => (
      
    <View style={styles.authContainer}>
      <EmailAuthForm
        mode={authMode === 'profile' ? 'signin' : authMode}
        onSubmit={handleEmailAuth}
        loading={loading}
      />
      
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
        <Typography variant="caption" color="secondary" style={styles.dividerText}>
          OR
        </Typography>
        <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
      </View>
      
      <Button
        title="Continue as Guest"
        onPress={handleAnonymousSignIn}
        variant="ghost"
        fullWidth
        style={styles.guestButton}
      />
      
      <TouchableOpacity
        onPress={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
        style={styles.switchMode}
      >
        <Typography variant="body" color="secondary">
          {authMode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        </Typography>
        <Typography variant="body" color="primary" weight="bold">
          {authMode === 'signin' ? 'Sign Up' : 'Sign In'}
        </Typography>
      </TouchableOpacity>
    </View>
  );
  
  return (
    <Modal
      visible={authModalVisible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <BlurView intensity={20} style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableOpacity 
            style={styles.backdrop} 
            activeOpacity={1} 
            onPress={handleClose}
          />
          
          <View style={[styles.modal, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.headerContent}>
                <Image 
                  source={AppIcon} 
                  style={styles.appLogo}
                />
                <View style={styles.headerTextContainer}>
                  <Typography variant="title" weight="bold">
                    Welcome to Symposium AI
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    Where Ideas Converge. Where Understanding Emerges.
                  </Typography>
                </View>
              </View>
              <TouchableOpacity 
                onPress={handleClose}
                style={[styles.closeButton, { backgroundColor: theme.colors.surface }]}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {loading || authLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={theme.colors.primary[500]} />
                </View>
              ) : isAuthenticated ? (
                renderProfileView()
              ) : (
                renderAuthView()
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  appLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 24,
    lineHeight: 24,
  },
  content: {
    padding: 24,
  },
  loadingContainer: {
    padding: 48,
    alignItems: 'center',
  },
  authContainer: {
    alignItems: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
  },
  guestButton: {
    marginBottom: 16,
  },
  switchMode: {
    flexDirection: 'row',
    marginTop: 16,
  },
  profileContainer: {
    alignItems: 'center',
    paddingTop: 20,
  },
  profileName: {
    marginBottom: 4,
  },
  profileEmail: {
    marginBottom: 24,
  },
  membershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 24,
  },
  upgradeButton: {
    marginBottom: 12,
  },
  signOutButton: {
    marginTop: 8,
  },
});
