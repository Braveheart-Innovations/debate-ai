import React, { useEffect, useState } from 'react';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity, View } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, clearSheet, hideHelpWebView } from '../store';
import { RootStackParamList } from '../types';
import { useSheetContainerStyle } from '../hooks/useSheetContainerStyle';
import {
  ProfileSheet,
  SettingsContent,
  SupportSheet
} from '../components/organisms';
import { DemoExplainerSheet } from '@/components/organisms/demo/DemoExplainerSheet';
import { HelpModal, HelpWebViewModal } from '@/components/organisms/help';
import { DebugMenu } from '@/components/organisms/debug';

export const GlobalSheets: React.FC = () => {
  const dispatch = useDispatch();
  const { activeSheet, sheetVisible, helpWebViewUrl, helpModalHostCount } = useSelector(
    (state: RootState) => state.navigation
  );
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [debugMenuVisible, setDebugMenuVisible] = useState(false);

  const handleSheetClose = () => {
    dispatch(clearSheet());
  };

  const handleWebViewClose = () => {
    dispatch(hideHelpWebView());
  };

  // Responsive sheet styles: centered on iPad, slide-up on phone
  const sheetContainerStyle = useSheetContainerStyle();

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
      {/* Help WebView Modal - only render when URL is set to avoid WebView overhead.
          Rendered inside the help Modal instead while the help sheet is open,
          so it stacks above it. */}
      {helpWebViewUrl && !(showSheets && activeSheet === 'help') && (
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
                navigation.navigate('APIConfig', { from: 'settings' });
              }}
              onNavigateToExpertMode={() => {
                handleSheetClose();
                navigation.navigate('ExpertMode', { from: 'settings' });
              }}
              onNavigateToPersonalitySystem={() => {
                handleSheetClose();
                navigation.navigate('PersonalitySystem');
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

      {/* Help presents as a native Modal so it can layer above the other
          sheets. While a native-Modal sheet with its own HelpModalHost is
          mounted, it presents help instead - a sibling Modal mounted here
          cannot present above an already-open native Modal on iOS. */}
      {helpModalHostCount === 0 && <HelpModal />}

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
