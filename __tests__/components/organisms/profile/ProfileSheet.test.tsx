import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { PropsOf } from '@test-utils/mockComponents';
import type { SheetHeader } from '@/components/molecules';
import type { ProfileContent } from '@/components/organisms/profile/ProfileContent';
import { ProfileSheet } from '@/components/organisms/profile/ProfileSheet';

const mockSheetHeader = jest.fn((_props: PropsOf<typeof SheetHeader>) => null);
const mockProfileContent = jest.fn((_props: PropsOf<typeof ProfileContent>) => null);

jest.mock('@/components/molecules', () => ({
  SheetHeader: (props: PropsOf<typeof SheetHeader>) => mockSheetHeader(props),
}));

jest.mock('@/components/organisms/profile/ProfileContent', () => ({
  ProfileContent: (props: PropsOf<typeof ProfileContent>) => mockProfileContent(props),
}));

describe('ProfileSheet', () => {
  it('renders sheet header and content with onClose passthrough', () => {
    const onClose = jest.fn();
    renderWithProviders(<ProfileSheet onClose={onClose} />);

    expect(mockSheetHeader).toHaveBeenCalledWith(expect.objectContaining({ title: 'Profile', onClose }));
    expect(mockProfileContent).toHaveBeenCalledWith(expect.objectContaining({ onClose }));
  });
});
