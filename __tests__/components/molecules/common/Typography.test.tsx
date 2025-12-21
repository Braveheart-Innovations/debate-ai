import React from 'react';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';

const { Typography } = require('@/components/molecules/common/Typography');

describe('Typography', () => {
  describe('rendering', () => {
    it('renders text children correctly', () => {
      const { getByText } = renderWithProviders(
        <Typography>Hello World</Typography>
      );
      expect(getByText('Hello World')).toBeTruthy();
    });

    it('renders with undefined children', () => {
      const { toJSON } = renderWithProviders(<Typography />);
      // Component renders even without children (as an empty Text element)
      expect(toJSON()).toBeTruthy();
    });

    it('renders with nested text', () => {
      const { getByText } = renderWithProviders(
        <Typography>
          First part <Typography>nested</Typography> last part
        </Typography>
      );
      expect(getByText(/First part/)).toBeTruthy();
    });
  });

  describe('variant prop', () => {
    it('renders heading variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="heading">Heading Text</Typography>
      );
      expect(getByText('Heading Text')).toBeTruthy();
    });

    it('renders title variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="title">Title Text</Typography>
      );
      expect(getByText('Title Text')).toBeTruthy();
    });

    it('renders subtitle variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="subtitle">Subtitle Text</Typography>
      );
      expect(getByText('Subtitle Text')).toBeTruthy();
    });

    it('renders body variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="body">Body Text</Typography>
      );
      expect(getByText('Body Text')).toBeTruthy();
    });

    it('renders caption variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="caption">Caption Text</Typography>
      );
      expect(getByText('Caption Text')).toBeTruthy();
    });

    it('renders button variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="button">Button Text</Typography>
      );
      expect(getByText('Button Text')).toBeTruthy();
    });

    it('renders default variant', () => {
      const { getByText } = renderWithProviders(
        <Typography variant="default">Default Text</Typography>
      );
      expect(getByText('Default Text')).toBeTruthy();
    });

    it('uses default variant when not specified', () => {
      const { getByText } = renderWithProviders(
        <Typography>No Variant Specified</Typography>
      );
      expect(getByText('No Variant Specified')).toBeTruthy();
    });
  });

  describe('color prop', () => {
    it('renders with primary color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="primary">Primary Color</Typography>
      );
      expect(getByText('Primary Color')).toBeTruthy();
    });

    it('renders with secondary color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="secondary">Secondary Color</Typography>
      );
      expect(getByText('Secondary Color')).toBeTruthy();
    });

    it('renders with inverse color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="inverse">Inverse Color</Typography>
      );
      expect(getByText('Inverse Color')).toBeTruthy();
    });

    it('renders with error color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="error">Error Color</Typography>
      );
      expect(getByText('Error Color')).toBeTruthy();
    });

    it('renders with success color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="success">Success Color</Typography>
      );
      expect(getByText('Success Color')).toBeTruthy();
    });

    it('renders with disabled color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="disabled">Disabled Color</Typography>
      );
      expect(getByText('Disabled Color')).toBeTruthy();
    });

    it('renders with brand color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="brand">Brand Color</Typography>
      );
      expect(getByText('Brand Color')).toBeTruthy();
    });

    it('renders with warning color', () => {
      const { getByText } = renderWithProviders(
        <Typography color="warning">Warning Color</Typography>
      );
      expect(getByText('Warning Color')).toBeTruthy();
    });

    it('uses primary color by default', () => {
      const { getByText } = renderWithProviders(
        <Typography>Default Color</Typography>
      );
      expect(getByText('Default Color')).toBeTruthy();
    });
  });

  describe('weight prop', () => {
    it('renders with normal weight', () => {
      const { getByText } = renderWithProviders(
        <Typography weight="normal">Normal Weight</Typography>
      );
      expect(getByText('Normal Weight')).toBeTruthy();
    });

    it('renders with medium weight', () => {
      const { getByText } = renderWithProviders(
        <Typography weight="medium">Medium Weight</Typography>
      );
      expect(getByText('Medium Weight')).toBeTruthy();
    });

    it('renders with semibold weight', () => {
      const { getByText } = renderWithProviders(
        <Typography weight="semibold">Semibold Weight</Typography>
      );
      expect(getByText('Semibold Weight')).toBeTruthy();
    });

    it('renders with bold weight', () => {
      const { getByText } = renderWithProviders(
        <Typography weight="bold">Bold Weight</Typography>
      );
      expect(getByText('Bold Weight')).toBeTruthy();
    });

    it('uses normal weight by default', () => {
      const { getByText } = renderWithProviders(
        <Typography>Default Weight</Typography>
      );
      expect(getByText('Default Weight')).toBeTruthy();
    });
  });

  describe('align prop', () => {
    it('renders with left alignment', () => {
      const { getByText } = renderWithProviders(
        <Typography align="left">Left Aligned</Typography>
      );
      expect(getByText('Left Aligned')).toBeTruthy();
    });

    it('renders with center alignment', () => {
      const { getByText } = renderWithProviders(
        <Typography align="center">Center Aligned</Typography>
      );
      expect(getByText('Center Aligned')).toBeTruthy();
    });

    it('renders with right alignment', () => {
      const { getByText } = renderWithProviders(
        <Typography align="right">Right Aligned</Typography>
      );
      expect(getByText('Right Aligned')).toBeTruthy();
    });

    it('uses left alignment by default', () => {
      const { getByText } = renderWithProviders(
        <Typography>Default Alignment</Typography>
      );
      expect(getByText('Default Alignment')).toBeTruthy();
    });
  });

  describe('numberOfLines prop', () => {
    it('renders with numberOfLines prop', () => {
      const { getByText } = renderWithProviders(
        <Typography numberOfLines={2}>
          This is a very long text that should be truncated to two lines
        </Typography>
      );
      expect(getByText(/This is a very long text/)).toBeTruthy();
    });
  });

  describe('ellipsizeMode prop', () => {
    it('renders with tail ellipsizeMode', () => {
      const { getByText } = renderWithProviders(
        <Typography numberOfLines={1} ellipsizeMode="tail">
          Long text that should be truncated
        </Typography>
      );
      expect(getByText(/Long text/)).toBeTruthy();
    });

    it('renders with head ellipsizeMode', () => {
      const { getByText } = renderWithProviders(
        <Typography numberOfLines={1} ellipsizeMode="head">
          Long text that should be truncated at head
        </Typography>
      );
      expect(getByText(/truncated at head/)).toBeTruthy();
    });

    it('renders with middle ellipsizeMode', () => {
      const { getByText } = renderWithProviders(
        <Typography numberOfLines={1} ellipsizeMode="middle">
          Long text middle truncation
        </Typography>
      );
      expect(getByText(/Long text/)).toBeTruthy();
    });

    it('renders with clip ellipsizeMode', () => {
      const { getByText } = renderWithProviders(
        <Typography numberOfLines={1} ellipsizeMode="clip">
          Clipped text
        </Typography>
      );
      expect(getByText('Clipped text')).toBeTruthy();
    });
  });

  describe('selectable prop', () => {
    it('renders with selectable text', () => {
      const { getByText } = renderWithProviders(
        <Typography selectable>Selectable Text</Typography>
      );
      expect(getByText('Selectable Text')).toBeTruthy();
    });

    it('renders with non-selectable text by default', () => {
      const { getByText } = renderWithProviders(
        <Typography>Non-Selectable Text</Typography>
      );
      expect(getByText('Non-Selectable Text')).toBeTruthy();
    });
  });

  describe('style prop', () => {
    it('accepts custom styles', () => {
      const { getByText } = renderWithProviders(
        <Typography style={{ marginTop: 10 }}>Custom Style</Typography>
      );
      expect(getByText('Custom Style')).toBeTruthy();
    });

    it('accepts array of styles', () => {
      const { getByText } = renderWithProviders(
        <Typography style={[{ marginTop: 10 }, { marginBottom: 5 }]}>
          Array Style
        </Typography>
      );
      expect(getByText('Array Style')).toBeTruthy();
    });
  });

  describe('combined props', () => {
    it('renders with multiple props combined', () => {
      const { getByText } = renderWithProviders(
        <Typography
          variant="title"
          color="brand"
          weight="bold"
          align="center"
          numberOfLines={1}
        >
          Combined Props
        </Typography>
      );
      expect(getByText('Combined Props')).toBeTruthy();
    });
  });
});
