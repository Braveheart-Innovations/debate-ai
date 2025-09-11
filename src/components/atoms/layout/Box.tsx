import React from 'react';
import { View, ViewProps, ViewStyle, DimensionValue } from 'react-native';

// Box is just View with convenient style props as shortcuts
// This is a common pattern in React Native apps for cleaner JSX
export interface BoxProps extends ViewProps {
  // Layout props
  flex?: number;
  flexDirection?: ViewStyle['flexDirection'];
  justifyContent?: ViewStyle['justifyContent'];
  alignItems?: ViewStyle['alignItems'];
  alignSelf?: ViewStyle['alignSelf'];
  
  // Spacing props
  padding?: DimensionValue;
  paddingTop?: DimensionValue;
  paddingBottom?: DimensionValue;
  paddingLeft?: DimensionValue;
  paddingRight?: DimensionValue;
  paddingHorizontal?: DimensionValue;
  paddingVertical?: DimensionValue;
  margin?: DimensionValue;
  marginTop?: DimensionValue;
  marginBottom?: DimensionValue;
  marginLeft?: DimensionValue;
  marginRight?: DimensionValue;
  marginHorizontal?: DimensionValue;
  marginVertical?: DimensionValue;
  
  // Visual props
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  opacity?: number;
  
  // Size props
  width?: DimensionValue;
  height?: DimensionValue;
  minWidth?: DimensionValue;
  minHeight?: DimensionValue;
  maxWidth?: DimensionValue;
  maxHeight?: DimensionValue;
  
  // Position props
  position?: ViewStyle['position'];
  top?: DimensionValue;
  bottom?: DimensionValue;
  left?: DimensionValue;
  right?: DimensionValue;
  zIndex?: number;
}

export const Box: React.FC<BoxProps> = ({
  // Layout props
  flex,
  flexDirection,
  justifyContent,
  alignItems,
  alignSelf,
  
  // Spacing props
  padding,
  paddingTop,
  paddingBottom,
  paddingLeft,
  paddingRight,
  paddingHorizontal,
  paddingVertical,
  margin,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  marginHorizontal,
  marginVertical,
  
  // Visual props
  backgroundColor,
  borderRadius,
  borderWidth,
  borderColor,
  opacity,
  
  // Size props
  width,
  height,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  
  // Position props
  position,
  top,
  bottom,
  left,
  right,
  zIndex,
  
  // Other props
  style,
  children,
  ...rest
}) => {
  const boxStyle: ViewStyle = {
    // Apply all the style props
    ...(flex !== undefined && { flex }),
    ...(flexDirection && { flexDirection }),
    ...(justifyContent && { justifyContent }),
    ...(alignItems && { alignItems }),
    ...(alignSelf && { alignSelf }),
    
    ...(padding !== undefined && { padding }),
    ...(paddingTop !== undefined && { paddingTop }),
    ...(paddingBottom !== undefined && { paddingBottom }),
    ...(paddingLeft !== undefined && { paddingLeft }),
    ...(paddingRight !== undefined && { paddingRight }),
    ...(paddingHorizontal !== undefined && { paddingHorizontal }),
    ...(paddingVertical !== undefined && { paddingVertical }),
    ...(margin !== undefined && { margin }),
    ...(marginTop !== undefined && { marginTop }),
    ...(marginBottom !== undefined && { marginBottom }),
    ...(marginLeft !== undefined && { marginLeft }),
    ...(marginRight !== undefined && { marginRight }),
    ...(marginHorizontal !== undefined && { marginHorizontal }),
    ...(marginVertical !== undefined && { marginVertical }),
    
    ...(backgroundColor && { backgroundColor }),
    ...(borderRadius !== undefined && { borderRadius }),
    ...(borderWidth !== undefined && { borderWidth }),
    ...(borderColor && { borderColor }),
    ...(opacity !== undefined && { opacity }),
    
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(minWidth !== undefined && { minWidth }),
    ...(minHeight !== undefined && { minHeight }),
    ...(maxWidth !== undefined && { maxWidth }),
    ...(maxHeight !== undefined && { maxHeight }),
    
    ...(position && { position }),
    ...(top !== undefined && { top }),
    ...(bottom !== undefined && { bottom }),
    ...(left !== undefined && { left }),
    ...(right !== undefined && { right }),
    ...(zIndex !== undefined && { zIndex }),
  };
  
  return (
    <View style={[boxStyle, style]} {...rest}>
      {children}
    </View>
  );
};
