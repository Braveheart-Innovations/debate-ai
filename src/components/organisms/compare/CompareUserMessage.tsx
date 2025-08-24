import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MessageBubble } from '../MessageBubble';
import { Message } from '../../../types';

interface CompareUserMessageProps {
  message: Message;
}

export const CompareUserMessage: React.FC<CompareUserMessageProps> = ({ message }) => {
  return (
    <View style={styles.container}>
      <MessageBubble
        message={message}
        isLast={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
});