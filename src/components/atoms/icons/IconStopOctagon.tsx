import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconStopOctagonProps {
  size?: number;
  color?: string; // fill color (red)
  border?: string; // border color (white)
  borderWidth?: number;
}

// Universal stop sign: red octagon with white border
const IconStopOctagon: React.FC<IconStopOctagonProps> = ({ 
  size = 18, 
  color = '#F44336', 
  border = '#FFFFFF', 
  borderWidth = 1.5 
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7.05 2.5h9.9l4.55 4.55v9.9L16.95 21.5h-9.9L2.5 16.95v-9.9L7.05 2.5Z"
      fill={color}
      stroke={border}
      strokeWidth={borderWidth}
      strokeLinejoin="round"
    />
  </Svg>
);

export default IconStopOctagon;
