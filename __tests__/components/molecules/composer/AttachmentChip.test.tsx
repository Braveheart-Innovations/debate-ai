import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import { AttachmentChip } from '@/components/molecules/composer/AttachmentChip';

jest.mock('expo-haptics', () => ({
  impactAsync: () => Promise.resolve(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

describe('AttachmentChip', () => {
  it('renders an image preview by default and removes on tap', () => {
    const onRemove = jest.fn();
    const { getByTestId, getByLabelText } = renderWithProviders(
      <AttachmentChip uri="file://a.png" onRemove={onRemove} testID="chip" />
    );

    expect(getByTestId('chip')).toBeTruthy();
    expect(getByLabelText('Remove attached image')).toBeTruthy();
    fireEvent.press(getByTestId('chip-remove'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('renders a document variant with its file name', () => {
    const onRemove = jest.fn();
    const { getByText, getByLabelText } = renderWithProviders(
      <AttachmentChip
        kind="document"
        fileName="notes.pdf"
        onRemove={onRemove}
        testID="chip"
      />
    );

    expect(getByText('notes.pdf')).toBeTruthy();
    expect(getByLabelText('Remove attached document')).toBeTruthy();
  });
});
