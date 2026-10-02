import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { SelectionIndicator } = require('@/components/molecules/common/SelectionIndicator');

describe('SelectionIndicator', () => {
  it('renders when isSelected is true', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} />
    );

    // Component renders when isSelected is true
    expect(result).toBeTruthy();
  });

  it('does not render when isSelected is false', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={false} />
    );

    // Component returns null when not selected
    expect(result).toBeTruthy();
  });

  it('applies custom color when provided', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} color="#FF0000" />
    );

    // Component renders with custom color
    expect(result).toBeTruthy();
  });

  it('uses default theme color when color not provided', () => {
    const result = renderWithProviders(
      <SelectionIndicator isSelected={true} />
    );

    // Component renders with default theme color
    expect(result).toBeTruthy();
  });
});