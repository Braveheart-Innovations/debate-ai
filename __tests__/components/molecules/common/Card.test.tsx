import React from 'react';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { Card } = require('@/components/molecules/common/Card');

describe('Card', () => {
  describe('rendering', () => {
    it('renders children correctly', () => {
      const { getByText } = renderWithProviders(
        <Card>
          <Text>Card Content</Text>
        </Card>
      );
      expect(getByText('Card Content')).toBeTruthy();
    });

    it('renders multiple children', () => {
      const { getByText } = renderWithProviders(
        <Card>
          <Text>First Child</Text>
          <Text>Second Child</Text>
        </Card>
      );
      expect(getByText('First Child')).toBeTruthy();
      expect(getByText('Second Child')).toBeTruthy();
    });
  });

  describe('padding prop', () => {
    it('renders with none padding', () => {
      const { getByText } = renderWithProviders(
        <Card padding="none">
          <Text>No Padding</Text>
        </Card>
      );
      expect(getByText('No Padding')).toBeTruthy();
    });

    it('renders with small padding', () => {
      const { getByText } = renderWithProviders(
        <Card padding="small">
          <Text>Small Padding</Text>
        </Card>
      );
      expect(getByText('Small Padding')).toBeTruthy();
    });

    it('renders with medium padding (default)', () => {
      const { getByText } = renderWithProviders(
        <Card padding="medium">
          <Text>Medium Padding</Text>
        </Card>
      );
      expect(getByText('Medium Padding')).toBeTruthy();
    });

    it('renders with large padding', () => {
      const { getByText } = renderWithProviders(
        <Card padding="large">
          <Text>Large Padding</Text>
        </Card>
      );
      expect(getByText('Large Padding')).toBeTruthy();
    });

    it('uses medium padding by default', () => {
      const { getByText } = renderWithProviders(
        <Card>
          <Text>Default Padding</Text>
        </Card>
      );
      expect(getByText('Default Padding')).toBeTruthy();
    });
  });

  describe('margin prop', () => {
    it('renders with none margin', () => {
      const { getByText } = renderWithProviders(
        <Card margin="none">
          <Text>No Margin</Text>
        </Card>
      );
      expect(getByText('No Margin')).toBeTruthy();
    });

    it('renders with small margin', () => {
      const { getByText } = renderWithProviders(
        <Card margin="small">
          <Text>Small Margin</Text>
        </Card>
      );
      expect(getByText('Small Margin')).toBeTruthy();
    });

    it('renders with medium margin', () => {
      const { getByText } = renderWithProviders(
        <Card margin="medium">
          <Text>Medium Margin</Text>
        </Card>
      );
      expect(getByText('Medium Margin')).toBeTruthy();
    });

    it('renders with large margin', () => {
      const { getByText } = renderWithProviders(
        <Card margin="large">
          <Text>Large Margin</Text>
        </Card>
      );
      expect(getByText('Large Margin')).toBeTruthy();
    });

    it('uses none margin by default', () => {
      const { getByText } = renderWithProviders(
        <Card>
          <Text>Default Margin</Text>
        </Card>
      );
      expect(getByText('Default Margin')).toBeTruthy();
    });
  });

  describe('shadow prop', () => {
    it('renders with shadow by default', () => {
      const { getByText } = renderWithProviders(
        <Card>
          <Text>With Shadow</Text>
        </Card>
      );
      expect(getByText('With Shadow')).toBeTruthy();
    });

    it('renders with shadow when explicitly true', () => {
      const { getByText } = renderWithProviders(
        <Card shadow={true}>
          <Text>With Shadow</Text>
        </Card>
      );
      expect(getByText('With Shadow')).toBeTruthy();
    });

    it('renders without shadow when false', () => {
      const { getByText } = renderWithProviders(
        <Card shadow={false}>
          <Text>No Shadow</Text>
        </Card>
      );
      expect(getByText('No Shadow')).toBeTruthy();
    });
  });

  describe('style prop', () => {
    it('accepts custom styles', () => {
      const { getByText } = renderWithProviders(
        <Card style={{ backgroundColor: 'red' }}>
          <Text>Custom Style</Text>
        </Card>
      );
      expect(getByText('Custom Style')).toBeTruthy();
    });
  });

  describe('combined props', () => {
    it('renders with multiple props combined', () => {
      const { getByText } = renderWithProviders(
        <Card padding="large" margin="small" shadow={false}>
          <Text>Combined Props</Text>
        </Card>
      );
      expect(getByText('Combined Props')).toBeTruthy();
    });
  });
});
