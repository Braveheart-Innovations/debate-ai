import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { HelpModalHost } from '@/components/organisms/help/HelpModalHost';

jest.mock('@/components/organisms/help/HelpModal', () => ({
  HelpModal: () => null,
}));

describe('HelpModalHost', () => {
  it('registers as help host while mounted and unregisters on unmount', () => {
    const { store, unmount } = renderWithProviders(<HelpModalHost />);
    expect(store.getState().navigation.helpModalHostCount).toBe(1);

    unmount();
    expect(store.getState().navigation.helpModalHostCount).toBe(0);
  });
});
