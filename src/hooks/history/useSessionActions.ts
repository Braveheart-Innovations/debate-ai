import { useState, useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { useDispatch } from 'react-redux';
import { StorageService } from '../../services/chat';
import { loadSession } from '../../store';
import { ChatSession } from '../../types';
import { UseSessionActionsReturn, HistoryScreenNavigationProps } from '../../types/history';

export const useSessionActions = (navigation: HistoryScreenNavigationProps): UseSessionActionsReturn => {
  const dispatch = useDispatch();
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Delete a session with confirmation
   */
  const deleteSession = useCallback(async (sessionId: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      Alert.alert(
        'Delete Chat',
        'Are you sure you want to delete this conversation?',
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => resolve()
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setIsProcessing(true);
                await StorageService.deleteSession(sessionId);
                resolve();
              } catch (error) {
                console.error('Error deleting session:', error);
                Alert.alert(
                  'Error',
                  'Failed to delete the conversation. Please try again.',
                  [{ text: 'OK', onPress: () => resolve() }]
                );
              } finally {
                setIsProcessing(false);
              }
            },
          },
        ]
      );
    });
  }, []);

  /**
   * Resume a session based on its type
   */
  const resumeSession = useCallback((session: ChatSession) => {
    try {
      const sessionType = session.sessionType || 'chat';
      
      switch (sessionType) {
        case 'debate': {
          // Debates are completed events - view transcript or rematch
          const topic = session.messages.find(m => m.sender === 'Debate Host')?.content || 'Debate';
          Alert.alert(
            'Debate Results',
            `Topic: ${topic}\nParticipants: ${session.selectedAIs.map(ai => ai.name).join(' vs ')}\n\nDebates cannot be resumed once completed.`,
            [
              { text: 'Close', style: 'cancel' },
              { 
                text: 'Rematch', 
                onPress: () => {
                  // Navigate to debate tab to start new debate with same setup
                  navigation.navigate('MainTabs', { 
                    screen: 'DebateTab',
                    params: {
                      selectedAIs: session.selectedAIs,
                      suggestedTopic: topic
                    }
                  });
                }
              }
            ]
          );
          break;
        }
          
        case 'comparison':
          // Comparisons may be resumable if they diverged to a single AI chat
          // For now, offer to start new comparison with same AIs
          Alert.alert(
            'Comparison Session',
            'Start a new comparison with the same AIs?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'New Comparison',
                onPress: () => {
                  if (session.selectedAIs.length >= 2) {
                    navigation.navigate('MainTabs', {
                      screen: 'CompareTab',
                      params: {
                        leftAI: session.selectedAIs[0],
                        rightAI: session.selectedAIs[1]
                      }
                    });
                  }
                }
              }
            ]
          );
          break;
          
        case 'chat':
        default:
          // Regular chat resume - preserve existing functionality exactly
          dispatch(loadSession(session));
          navigation.navigate('Chat', { 
            sessionId: session.id, 
            resuming: true 
          });
          break;
      }
    } catch (error) {
      console.error('Error resuming session:', error);
      Alert.alert(
        'Error',
        'Failed to open the session. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, [dispatch, navigation]);

  /**
   * Share a session (export conversation)
   */
  const shareSession = useCallback(async (session: ChatSession): Promise<void> => {
    try {
      setIsProcessing(true);
      
      // Create shareable content
      const aiNames = session.selectedAIs.map(ai => ai.name).join(', ');
      const messageCount = session.messages.length;
      const createdDate = new Date(session.createdAt).toLocaleDateString();
      
      let shareContent = `Conversation with ${aiNames}\n`;
      shareContent += `Created: ${createdDate}\n`;
      shareContent += `Messages: ${messageCount}\n\n`;
      
      // Include messages (limit to prevent too long content)
      const maxMessages = 10;
      const messagesToShare = session.messages.slice(-maxMessages);
      
      if (session.messages.length > maxMessages) {
        shareContent += `[Showing last ${maxMessages} of ${messageCount} messages]\n\n`;
      }
      
      messagesToShare.forEach(message => {
        shareContent += `${message.sender}: ${message.content}\n\n`;
      });
      
      await Share.share({
        message: shareContent,
        title: `Symposium AI Conversation - ${aiNames}`
      });
      
    } catch (error) {
      console.error('Error sharing session:', error);
      Alert.alert(
        'Error',
        'Failed to share the conversation. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Archive a session (future feature - placeholder)
   */
  const archiveSession = useCallback(async (_sessionId: string): Promise<void> => {
    try {
      setIsProcessing(true);
      
      // For now, just show a message that it's not implemented
      Alert.alert(
        'Coming Soon',
        'Session archiving will be available in a future update.',
        [{ text: 'OK' }]
      );
      
      // Future implementation would:
      // 1. Add an 'archived' field to session
      // 2. Update session in storage
      // 3. Filter out archived sessions from main list
      
    } catch (error) {
      console.error('Error archiving session:', error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  /**
   * Bulk delete multiple sessions
   */
  const bulkDelete = useCallback(async (sessionIds: string[]): Promise<void> => {
    if (sessionIds.length === 0) return;
    
    const sessionWord = sessionIds.length === 1 ? 'conversation' : 'conversations';
    
    return new Promise<void>((resolve) => {
      Alert.alert(
        'Delete Conversations',
        `Are you sure you want to delete ${sessionIds.length} ${sessionWord}?`,
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => resolve()
          },
          {
            text: 'Delete All',
            style: 'destructive',
            onPress: async () => {
              try {
                setIsProcessing(true);
                
                // Delete sessions one by one (could be optimized with bulk operation)
                for (const sessionId of sessionIds) {
                  await StorageService.deleteSession(sessionId);
                }
                
                resolve();
              } catch (error) {
                console.error('Error in bulk delete:', error);
                Alert.alert(
                  'Error',
                  'Failed to delete some conversations. Please try again.',
                  [{ text: 'OK', onPress: () => resolve() }]
                );
              } finally {
                setIsProcessing(false);
              }
            },
          },
        ]
      );
    });
  }, []);

  // Future features like duplicate and export will be added here

  return {
    deleteSession,
    resumeSession,
    shareSession,
    archiveSession,
    bulkDelete,
    isProcessing
  };
};