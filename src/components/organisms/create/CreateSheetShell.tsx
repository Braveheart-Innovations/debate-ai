import React from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme';
import { SheetHeader } from '@/components/molecules';
import { HelpModalHost } from '@/components/organisms/help/HelpModalHost';

/**
 * Shared slide-up bottom-sheet shell for the Studio's config sheets, keeping
 * the exact frame the old in-screen settings sheet used.
 */
export const CreateSheetShell: React.FC<{
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Modals shown above this sheet. They must mount inside this sheet's Modal —
   * a sibling Modal silently fails to present while this one is open on iOS.
   */
  stackedModals?: React.ReactNode;
  testID?: string;
}> = ({ visible, title, onClose, children, stackedModals, testID }) => {
  const { theme } = useTheme();

  if (!visible) return null;

  return (
    // onDismiss resyncs state if iOS dismisses the modal natively (e.g. a
    // stacked picker's dismissal cascading); otherwise the sheet can never
    // reopen because `visible` is stuck true.
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onDismiss={onClose}
    >
      <View style={styles.overlay} testID={testID}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.background }]}>
          <SheetHeader title={title} onClose={onClose} showHandle />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
      {stackedModals}
      {/* Lets the InfoButtons' help sheet present above this Modal */}
      <HelpModalHost />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
});

export default CreateSheetShell;
