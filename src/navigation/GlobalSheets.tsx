import React, { useEffect } from 'react';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity, View } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, clearSheet, hideHelpWebView } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import {
  ProfileSheet,
  SettingsContent,
  SupportSheet
} from '../components/organisms';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';
import { HelpSheet, HelpWebViewModal } from '@/components/organisms/help';

export const GlobalSheets: React.FC = () => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { activeSheet, sheetVisible, helpWebViewUrl } = useSelector(
    (state: RootState) => state.navigation
  );
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleSheetClose = () => {
    dispatch(clearSheet());
  };

  const handleWebViewClose = () => {
    dispatch(hideHelpWebView());
  };

  // Redirect subscription sheet to Subscription screen
  useEffect(() => {
    if (sheetVisible && activeSheet === 'subscription') {
      dispatch(clearSheet());
      navigation.navigate('Subscription');
    }
  }, [sheetVisible, activeSheet, dispatch, navigation]);

  // Only render sheets if visible, but always render WebView modal
  const showSheets = sheetVisible && activeSheet;

  return (
    <>
      {/* Help WebView Modal - only render when URL is set to avoid WebView overhead */}
      {helpWebViewUrl && (
        <HelpWebViewModal
          visible={true}
          url={helpWebViewUrl}
          title="Help"
          onClose={handleWebViewClose}
        />
      )}

      {showSheets && activeSheet === 'profile' && (
        <>
          {/* Backdrop */}
          <TouchableOpacity 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            activeOpacity={1}
            onPress={handleSheetClose}
          />
          {/* Foreground as sibling to avoid gesture conflicts */}
          <View 
            style={{
              position: 'absolute',
              top: 100,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.background,
              zIndex: 1001,
            }}
          >
            <ProfileSheet onClose={handleSheetClose} />
          </View>
        </>
      )}

      {showSheets && activeSheet === 'settings' && (
        <>
          {/* Backdrop */}
          <TouchableOpacity 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            activeOpacity={1}
            onPress={handleSheetClose}
          />
          {/* Foreground as sibling to avoid gesture conflicts */}
          <View 
            style={{
              position: 'absolute',
              top: 100,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.background,
              zIndex: 1001,
            }}
          >
            <SettingsContent
              onClose={handleSheetClose}
              onNavigateToAPIConfig={() => {
                handleSheetClose();
                navigation.navigate('APIConfig');
              }}
              onNavigateToExpertMode={() => {
                handleSheetClose();
                navigation.navigate('ExpertMode');
              }}
            />
          </View>
        </>
      )}

      {showSheets && activeSheet === 'support' && (
        <>
          {/* Dimmed backdrop that closes the sheet when tapped */}
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            activeOpacity={1}
            onPress={handleSheetClose}
          />
          {/* Foreground sheet content as a sibling to avoid gesture conflicts */}
          <View
            style={{
              position: 'absolute',
              top: 100,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.background,
              zIndex: 1001,
            }}
          >
            <SupportSheet onClose={handleSheetClose} />
          </View>
        </>
      )}

      {showSheets && activeSheet === 'help' && (
        <>
          {/* Dimmed backdrop that closes the sheet when tapped */}
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            activeOpacity={1}
            onPress={handleSheetClose}
          />
          {/* Foreground sheet content */}
          <View
            style={{
              position: 'absolute',
              top: 100,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.background,
              zIndex: 1001,
            }}
          >
            <HelpSheet onClose={handleSheetClose} />
          </View>
        </>
      )}

      {showSheets && activeSheet === 'demo' && (
        <>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
            activeOpacity={1}
            onPress={handleSheetClose}
          />
          <View style={{ position: 'absolute', top: 100, left: 0, right: 0, bottom: 0, backgroundColor: theme.colors.background, zIndex: 1001 }}>
            <DemoExplainerSheet
              onClose={handleSheetClose}
              onStartTrial={() => {
                handleSheetClose();
                // Navigate to Subscription screen
                navigation.navigate('Subscription');
              }}
            />
          </View>
        </>
      )}

      {/* Subscription sheet now redirects to Subscription screen via useEffect */}
    </>
  );
};

export default GlobalSheets;
