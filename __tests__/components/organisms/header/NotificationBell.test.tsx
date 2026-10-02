import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { capturePropsOf } from '@test-utils/mockComponents';
import { NotificationBell } from '@/components/organisms/header/NotificationBell';
import type { HeaderIcon } from '@/components/molecules';

const mockHeaderIcon = capturePropsOf<typeof HeaderIcon>();

jest.mock('@/components/molecules', () => ({
  get HeaderIcon() {
    return mockHeaderIcon.Stub;
  },
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    mockHeaderIcon.reset();
  });

  it('renders HeaderIcon with notifications icon', () => {
    const onPress = jest.fn();

    renderWithProviders(
      <NotificationBell onPress={onPress} color="#123456" testID="notification" />
    );

    expect(mockHeaderIcon.latest()).toEqual(expect.objectContaining({
      name: 'notifications-outline',
      onPress,
      color: '#123456',
      badge: undefined,
      testID: 'notification',
    }));
  });
});
