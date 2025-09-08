import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SheetHeader } from '../../molecules/SheetHeader';
import { ProfileContent } from './ProfileContent';
import { useTheme } from '../../../theme';

interface ProfileSheetProps {
  onClose: () => void;
  onSettingsPress?: () => void;
}

export const ProfileSheet: React.FC<ProfileSheetProps> = ({
  onClose,
  onSettingsPress,
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Consistent Sheet Header */}
      <SheetHeader
        title="Profile"
        onClose={onClose}
        showHandle={false}
        testID="profile-sheet-header"
      />
      
      {/* Profile Content */}
      <ProfileContent
        onClose={onClose}
        onSettingsPress={onSettingsPress}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
