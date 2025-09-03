/**
 * useDebateMessages Hook
 * Manages debate message operations and typing indicators
 */

import { useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import { addMessage } from '../../store';
import { Message } from '../../types';

export interface UseDebateMessagesReturn {
  messages: Message[];
  typingAIs: string[];
  addHostMessage: (content: string) => void;
  getDebateMessages: () => Message[];
  messageCount: number;
}

export const useDebateMessages = (debateStartTime?: number): UseDebateMessagesReturn => {
  const dispatch = useDispatch();
  const currentSession = useSelector((state: RootState) => state.chat.currentSession);
  const typingAIs = useSelector((state: RootState) => state.chat.typingAIs);
  
  const messages = useMemo(() => currentSession?.messages || [], [currentSession?.messages]);
  // Be defensive: some environments reported messages disappearing due to overly strict time filtering.
  // We still allow optional filtering when a valid debateStartTime is provided, but with safeguards.
  const startTime = debateStartTime && Number.isFinite(debateStartTime) ? debateStartTime : 0;
  
  // Get only messages from the current debate session
  const getDebateMessages = useCallback((): Message[] => {
    // If no valid startTime, return all current session messages
    if (!startTime) return messages;

    // Filter by start time, but tolerate small clock skews or ordering issues
    const filtered = messages.filter(msg => msg.timestamp >= startTime - 250);

    // Safety net: if filtering yields nothing but we have messages, return all to avoid UI "disappearing" bug
    if (filtered.length === 0 && messages.length > 0) return messages;

    return filtered;
  }, [messages, startTime]);
  
  // Add host message
  const addHostMessage = useCallback((content: string) => {
    const hostMessage: Message = {
      id: `msg_${Date.now()}_host`,
      sender: 'Debate Host',
      senderType: 'user',
      content,
      timestamp: Date.now(),
    };
    
    dispatch(addMessage(hostMessage));
  }, [dispatch]);
  
  const debateMessages = getDebateMessages();
  
  return {
    messages: debateMessages,
    typingAIs,
    addHostMessage,
    getDebateMessages,
    messageCount: debateMessages.length,
  };
};
