import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { Button } = require('@/components/molecules/common/Button');

describe('Button', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders title correctly', () => {
      const { getByText } = renderWithProviders(
        <Button title="Click Me" onPress={mockOnPress} />
      );
      expect(getByText('Click Me')).toBeTruthy();
    });

    it('has correct accessibility role', () => {
      const { getByRole } = renderWithProviders(
        <Button title="Submit" onPress={mockOnPress} />
      );
      expect(getByRole('button')).toBeTruthy();
    });

    it('uses title as accessibility label by default', () => {
      const { getByLabelText } = renderWithProviders(
        <Button title="Submit Form" onPress={mockOnPress} />
      );
      expect(getByLabelText('Submit Form')).toBeTruthy();
    });

    it('uses custom accessibility label when provided', () => {
      const { getByLabelText } = renderWithProviders(
        <Button
          title="Submit"
          onPress={mockOnPress}
          accessibilityLabel="Submit the form"
        />
      );
      expect(getByLabelText('Submit the form')).toBeTruthy();
    });
  });

  describe('variants', () => {
    it('renders primary variant', () => {
      const { getByText } = renderWithProviders(
        <Button title="Primary" onPress={mockOnPress} variant="primary" />
      );
      expect(getByText('Primary')).toBeTruthy();
    });

    it('renders secondary variant', () => {
      const { getByText } = renderWithProviders(
        <Button title="Secondary" onPress={mockOnPress} variant="secondary" />
      );
      expect(getByText('Secondary')).toBeTruthy();
    });

    it('renders ghost variant', () => {
      const { getByText } = renderWithProviders(
        <Button title="Ghost" onPress={mockOnPress} variant="ghost" />
      );
      expect(getByText('Ghost')).toBeTruthy();
    });

    it('renders danger variant', () => {
      const { getByText } = renderWithProviders(
        <Button title="Danger" onPress={mockOnPress} variant="danger" />
      );
      expect(getByText('Danger')).toBeTruthy();
    });

    it('renders tonal variant', () => {
      const { getByText } = renderWithProviders(
        <Button title="Tonal" onPress={mockOnPress} variant="tonal" />
      );
      expect(getByText('Tonal')).toBeTruthy();
    });
  });

  describe('sizes', () => {
    it('renders small size', () => {
      const { getByText } = renderWithProviders(
        <Button title="Small" onPress={mockOnPress} size="small" />
      );
      expect(getByText('Small')).toBeTruthy();
    });

    it('renders medium size (default)', () => {
      const { getByText } = renderWithProviders(
        <Button title="Medium" onPress={mockOnPress} size="medium" />
      );
      expect(getByText('Medium')).toBeTruthy();
    });

    it('renders large size', () => {
      const { getByText } = renderWithProviders(
        <Button title="Large" onPress={mockOnPress} size="large" />
      );
      expect(getByText('Large')).toBeTruthy();
    });
  });

  describe('interactions', () => {
    it('calls onPress when pressed', () => {
      const { getByText } = renderWithProviders(
        <Button title="Press Me" onPress={mockOnPress} />
      );
      fireEvent.press(getByText('Press Me'));
      expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
      const { getByText } = renderWithProviders(
        <Button title="Disabled" onPress={mockOnPress} disabled />
      );
      fireEvent.press(getByText('Disabled'));
      expect(mockOnPress).not.toHaveBeenCalled();
    });

    it('does not call onPress when loading', () => {
      const { getByRole } = renderWithProviders(
        <Button title="Loading" onPress={mockOnPress} loading />
      );
      fireEvent.press(getByRole('button'));
      expect(mockOnPress).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows ActivityIndicator when loading', () => {
      const { queryByText, UNSAFE_getByType } = renderWithProviders(
        <Button title="Loading" onPress={mockOnPress} loading />
      );
      // Title should not be visible when loading
      expect(queryByText('Loading')).toBeNull();
      // ActivityIndicator should be present
      const ActivityIndicator = require('react-native').ActivityIndicator;
      expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    it('has disabled accessibility state when loading', () => {
      const { getByRole } = renderWithProviders(
        <Button title="Loading" onPress={mockOnPress} loading />
      );
      const button = getByRole('button');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('disabled state', () => {
    it('has disabled accessibility state', () => {
      const { getByRole } = renderWithProviders(
        <Button title="Disabled" onPress={mockOnPress} disabled />
      );
      const button = getByRole('button');
      expect(button.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe('fullWidth prop', () => {
    it('renders with fullWidth styling', () => {
      const { getByText } = renderWithProviders(
        <Button title="Full Width" onPress={mockOnPress} fullWidth />
      );
      expect(getByText('Full Width')).toBeTruthy();
    });
  });

  describe('textAlign prop', () => {
    it('renders with left text alignment', () => {
      const { getByText } = renderWithProviders(
        <Button title="Left Aligned" onPress={mockOnPress} textAlign="left" />
      );
      expect(getByText('Left Aligned')).toBeTruthy();
    });

    it('renders with center text alignment (default)', () => {
      const { getByText } = renderWithProviders(
        <Button title="Centered" onPress={mockOnPress} textAlign="center" />
      );
      expect(getByText('Centered')).toBeTruthy();
    });
  });

  describe('rightIcon prop', () => {
    it('renders with chevron-down icon when textAlign is left', () => {
      const { getByText } = renderWithProviders(
        <Button
          title="With Icon"
          onPress={mockOnPress}
          textAlign="left"
          rightIcon="chevron-down"
        />
      );
      expect(getByText('With Icon')).toBeTruthy();
    });

    it('renders with custom text icon when textAlign is left', () => {
      const { getByText } = renderWithProviders(
        <Button
          title="Custom Icon"
          onPress={mockOnPress}
          textAlign="left"
          rightIcon="→"
        />
      );
      expect(getByText('Custom Icon')).toBeTruthy();
      expect(getByText('→')).toBeTruthy();
    });
  });
});
