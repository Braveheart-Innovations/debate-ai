import React from 'react';
import { View } from 'react-native';

const WebView = React.forwardRef((props: Record<string, unknown>, ref) => {
  return <View testID="mock-webview" {...props} ref={ref as React.Ref<View>} />;
});

WebView.displayName = 'WebView';

export { WebView };
export default WebView;
