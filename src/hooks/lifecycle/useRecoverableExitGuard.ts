import { useCallback, useEffect } from 'react';
import { Alert, BackHandler } from 'react-native';

interface BeforeRemoveEvent {
  preventDefault: () => void;
  data?: {
    action?: unknown;
  };
}

interface GuardNavigation {
  addListener?: (event: 'beforeRemove', callback: (event: BeforeRemoveEvent) => void) => (() => void) | undefined;
  dispatch?: (action: unknown) => void;
  goBack?: () => void;
}

interface RecoverableExitGuardOptions {
  navigation: GuardNavigation;
  shouldGuard: boolean;
  title: string;
  message: string;
  leaveText?: string;
  onLeave: () => void | Promise<void>;
}

export const useRecoverableExitGuard = ({
  navigation,
  shouldGuard,
  title,
  message,
  leaveText = 'Leave',
  onLeave,
}: RecoverableExitGuardOptions): ((continueNavigation?: () => void) => void) => {
  const confirmLeave = useCallback((continueNavigation?: () => void) => {
    if (!shouldGuard) {
      continueNavigation?.();
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: leaveText,
          style: 'destructive',
          onPress: () => {
            void Promise.resolve(onLeave()).finally(() => {
              continueNavigation?.();
            });
          },
        },
      ]
    );
  }, [leaveText, message, onLeave, shouldGuard, title]);

  useEffect(() => {
    if (!navigation.addListener) return undefined;

    return navigation.addListener('beforeRemove', (event: BeforeRemoveEvent) => {
      if (!shouldGuard) return;
      event.preventDefault();
      confirmLeave(() => {
        if (event.data?.action && navigation.dispatch) {
          navigation.dispatch(event.data.action);
        } else {
          navigation.goBack?.();
        }
      });
    });
  }, [confirmLeave, navigation, shouldGuard]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!shouldGuard) return false;
      confirmLeave(() => navigation.goBack?.());
      return true;
    });

    return () => subscription.remove();
  }, [confirmLeave, navigation, shouldGuard]);

  return confirmLeave;
};
