import React from 'react';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { TouchableOpacity, View } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, clearSheet } from '../store';
import { RootStackParamList } from '../types';
import { useTheme } from '../theme';
import { 
  ProfileSheet, 
  SettingsContent,
  SupportScreen
} from '../components/organisms';

export const GlobalSheets: React.FC = () => {
  const { theme } = useTheme();
  const dispatch = useDispatch();
  const { activeSheet, sheetVisible } = useSelector((state: RootState) => state.navigation);
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const handleSheetClose = () => {
    dispatch(clearSheet());
  };

  if (!sheetVisible || !activeSheet) return null;

  return (
    <>
      {activeSheet === 'profile' && (
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

      {activeSheet === 'settings' && (
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

      {activeSheet === 'support' && (
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
            <SupportScreen onClose={handleSheetClose} />
          </View>
        </>
      )}
    </>
  );
};

export default GlobalSheets;
