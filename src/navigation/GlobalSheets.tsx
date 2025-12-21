import React, { useEffect, useState, useMemo } from 'react';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity, View, ViewStyle } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, clearSheet, hideHelpWebView } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import {
  ProfileSheet,
  SettingsContent,
  SupportSheet
} from '../components/organisms';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';
import { HelpSheet, HelpWebViewModal } from '@/components/organisms/help';
import { DebugMenu } from '@/components/organisms/debug';

export const GlobalSheets: React.FC = () => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { activeSheet, sheetVisible, helpWebViewUrl } = useSelector(
    (state: RootState) => state.navigation
  );
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [debugMenuVisible, setDebugMenuVisible] = useState(false);
  const { isTablet, responsive } = useResponsive();

  const handleSheetClose = () => {
    dispatch(clearSheet());
  };

  const handleWebViewClose = () => {
    dispatch(hideHelpWebView());
  };

  // Responsive sheet styles: centered on iPad, slide-up on phone
  const sheetContainerStyle = useMemo((): ViewStyle => {
    if (isTablet) {
      return {
        position: 'absolute',
        top: '10%',
        bottom: '10%',
        left: '15%',
        right: '15%',
        backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.xl,
        zIndex: 1001,
        overflow: 'hidden',
        // Shadow for floating effect
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
      };
    }
    // Phone: slide up from bottom
    return {
      position: 'absolute',
      top: responsive(100, 80),
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.borderRadius.xl,
      borderTopRightRadius: theme.borderRadius.xl,
      zIndex: 1001,
    };
  }, [isTablet, responsive, theme]);

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
          {/* Foreground - responsive: centered on iPad, slide-up on phone */}
          <View style={sheetContainerStyle}>
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
          {/* Foreground - responsive: centered on iPad, slide-up on phone */}
          <View style={sheetContainerStyle}>
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
              onOpenDebugMenu={() => {
                handleSheetClose();
                setDebugMenuVisible(true);
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
          {/* Foreground - responsive: centered on iPad, slide-up on phone */}
          <View style={sheetContainerStyle}>
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
          {/* Foreground - responsive: centered on iPad, slide-up on phone */}
          <View style={sheetContainerStyle}>
            <HelpSheet onClose={handleSheetClose} />
          </View>
        </>
      )}

      {showSheets && activeSheet === 'demo' && (
        <>
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
          {/* Foreground - responsive: centered on iPad, slide-up on phone */}
          <View style={sheetContainerStyle}>
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

      {/* Debug Menu - only in development */}
      {__DEV__ && (
        <DebugMenu
          visible={debugMenuVisible}
          onClose={() => setDebugMenuVisible(false)}
        />
      )}
    </>
  );
};

export default GlobalSheets;
