import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { ProfileSheet } from '@/components/organisms/profile/ProfileSheet';

const mockSheetHeader = jest.fn(() => null);
const mockProfileContent = jest.fn(() => null);

jest.mock('@/components/molecules', () => ({
  SheetHeader: (props: any) => mockSheetHeader(props),
}));

jest.mock('@/components/organisms/profile/ProfileContent', () => ({
  ProfileContent: (props: any) => mockProfileContent(props),
}));

describe('ProfileSheet', () => {
  it('renders sheet header and content with onClose passthrough', () => {
    const onClose = jest.fn();
    renderWithProviders(<ProfileSheet onClose={onClose} />);

    expect(mockSheetHeader).toHaveBeenCalledWith(expect.objectContaining({ title: 'Profile', onClose }));
    expect(mockProfileContent).toHaveBeenCalledWith(expect.objectContaining({ onClose }));
  });
});
