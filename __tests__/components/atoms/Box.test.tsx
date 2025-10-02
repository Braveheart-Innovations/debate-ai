import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Box } from '@/components/atoms/layout/Box';

// Helper to extract first style object from style array
const getStyle = (styleArray: any) => {
  if (Array.isArray(styleArray)) {
    return Object.assign({}, ...styleArray.filter(Boolean));
  }
  return styleArray;
};

describe('Box', () => {
  it('renders children correctly', () => {
    const { getByText } = render(
      <Box>
        <Text>Test Child</Text>
      </Box>
    );
    expect(getByText('Test Child')).toBeTruthy();
  });

  it('applies flex layout props', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        flex={1}
        flexDirection="row"
        justifyContent="center"
        alignItems="flex-end"
        alignSelf="stretch"
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-end',
      alignSelf: 'stretch',
    });
  });

  it('applies spacing props - padding', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        padding={16}
        paddingTop={8}
        paddingBottom={12}
        paddingLeft={4}
        paddingRight={20}
        paddingHorizontal={10}
        paddingVertical={15}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      padding: 16,
      paddingTop: 8,
      paddingBottom: 12,
      paddingLeft: 4,
      paddingRight: 20,
      paddingHorizontal: 10,
      paddingVertical: 15,
    });
  });

  it('applies spacing props - margin', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        margin={16}
        marginTop={8}
        marginBottom={12}
        marginLeft={4}
        marginRight={20}
        marginHorizontal={10}
        marginVertical={15}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      margin: 16,
      marginTop: 8,
      marginBottom: 12,
      marginLeft: 4,
      marginRight: 20,
      marginHorizontal: 10,
      marginVertical: 15,
    });
  });

  it('applies visual props', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        backgroundColor="#FF0000"
        borderRadius={8}
        borderWidth={2}
        borderColor="#00FF00"
        opacity={0.5}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      backgroundColor: '#FF0000',
      borderRadius: 8,
      borderWidth: 2,
      borderColor: '#00FF00',
      opacity: 0.5,
    });
  });

  it('applies size props', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        width={100}
        height={200}
        minWidth={50}
        minHeight={100}
        maxWidth={150}
        maxHeight={250}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      width: 100,
      height: 200,
      minWidth: 50,
      minHeight: 100,
      maxWidth: 150,
      maxHeight: 250,
    });
  });

  it('applies position props', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        position="absolute"
        top={10}
        bottom={20}
        left={5}
        right={15}
        zIndex={100}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      position: 'absolute',
      top: 10,
      bottom: 20,
      left: 5,
      right: 15,
      zIndex: 100,
    });
  });

  it('merges custom style prop with box props', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        padding={16}
        style={{ borderStyle: 'dashed' }}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      padding: 16,
      borderStyle: 'dashed',
    });
  });

  it('passes through other ViewProps', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <Box
        testID="box"
        accessible
        accessibilityLabel="Test Box"
        onTouchEnd={onPress}
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    expect(box.props.accessible).toBe(true);
    expect(box.props.accessibilityLabel).toBe('Test Box');
  });

  it('handles string dimensions for width/height', () => {
    const { getByTestId } = render(
      <Box
        testID="box"
        width="100%"
        height="50%"
      >
        <Text>Content</Text>
      </Box>
    );

    const box = getByTestId('box');
    const styles = getStyle(box.props.style);
    expect(styles).toMatchObject({
      width: '100%',
      height: '50%',
    });
  });
});