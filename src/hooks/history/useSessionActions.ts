import { useState, useCallback } from 'react';
import { Alert, Share } from 'react-native';
import { useDispatch } from 'react-redux';
import { StorageService } from '../../services/chat';
import { loadSession } from '../../store';
import { ChatSession } from '../../types';
import { UseSessionActionsReturn, HistoryScreenNavigationProps } from '../../types/history';
import useFeatureAccess from '@/hooks/useFeatureAccess';
import { showTrialCTA } from '@/utils/demoGating';
import { ErrorService } from '@/services/errors/ErrorService';
import { buildRematchNavigationParams, buildRematchSetupFromSavedDebate } from '@/services/debate/debateRematch';

const UNKNOWN_DEBATE_TOPIC = 'Unknown Topic';

export const useSessionActions = (
  navigation: HistoryScreenNavigationProps,
  onRefresh?: () => void
): UseSessionActionsReturn => {
  const dispatch = useDispatch();
  const [isProcessing, setIsProcessing] = useState(false);
  const { isDemo, canStartTrial } = useFeatureAccess();

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
                // Refresh the list after successful deletion
                if (onRefresh) {
                  onRefresh();
                }
                resolve();
              } catch (error) {
                console.error('Error deleting session:', error);
                ErrorService.handleWithToast(new Error('Failed to delete the conversation. Please try again.'), { feature: 'history' });
                resolve();
              } finally {
                setIsProcessing(false);
              }
            },
          },
        ]
      );
    });
  }, [onRefresh]);

  /**
   * Resume a session based on its type
   */
  const resumeSession = useCallback((session: ChatSession) => {
    // Gate resuming in Demo Mode with CTA
    if (isDemo) {
      showTrialCTA(navigation.navigate, {
        message: canStartTrial
          ? 'Continuing conversations requires a Free Trial.'
          : 'Continuing conversations requires Premium.',
        ctaText: canStartTrial ? 'Start 7-Day Free Trial' : 'Upgrade to Premium',
      });
      return;
    }
    try {
      const sessionType = session.sessionType || 'chat'; // Keep backward compat here for resuming old sessions
      
      switch (sessionType) {
        case 'debate': {
          // Debates are completed events - view transcript or rematch
          // Use stored topic first, fall back to extraction for older sessions
          let topic = session.topic || UNKNOWN_DEBATE_TOPIC;
          let winner = '';
          
          if (!session.topic) {
            // Extract topic from the debate host message for older sessions
            const topicMessage = session.messages.find(m => m.sender === 'Debate Host');
            if (topicMessage) {
              // Topic is in quotes at the beginning of the host message
              const topicMatch = topicMessage.content.match(/^"([^"]+)"/);
              topic = topicMatch ? topicMatch[1] : UNKNOWN_DEBATE_TOPIC;
            }
          }
          
          // Find winner message
          const winnerMessage = session.messages.find(m => 
            m.sender === 'Debate Host' && m.content.includes('OVERALL WINNER')
          );
          
          if (winnerMessage) {
            const winnerMatch = winnerMessage.content.match(/OVERALL WINNER: (.+?)!/);
            const tieMatch = winnerMessage.content.includes('DEBATE ENDED IN A TIE');
            
            if (tieMatch) {
              winner = '\n\n🏆 Result: TIE';
            } else if (winnerMatch) {
              winner = `\n\n🏆 Winner: ${winnerMatch[1]}`;
            }
          }
          
          Alert.alert(
            'Debate Results',
            `Motion: ${topic}\nParticipants: ${session.selectedAIs.map(ai => ai.name).join(' vs ')}${winner}\n\nDebates cannot be resumed once completed.`,
            [
              { text: 'View Transcript', onPress: () => {
                // Navigate to the transcript screen with the session data
                navigation.navigate('DebateTranscript', { session });
              }},
              { 
                text: 'Rematch', 
                onPress: () => {
                  // Debate setup, pre-filled with this debate's configuration
                  const rematch = buildRematchSetupFromSavedDebate(
                    topic === UNKNOWN_DEBATE_TOPIC ? session : { ...session, topic }
                  );
                  navigation.navigate('MainTabs', rematch
                    ? buildRematchNavigationParams(rematch)
                    : { screen: 'DebateTab' });
                }
              },
              { text: 'Close', style: 'cancel' }
            ]
          );
          break;
        }
          
        case 'comparison': {
          // Check if the comparison diverged
          const comparisonData = session as { hasDiverged?: boolean; continuedWithAI?: string } & typeof session;
          
          if (comparisonData.hasDiverged && comparisonData.continuedWithAI) {
            // Comparison diverged - can resume as regular chat
            Alert.alert(
              'Comparison Session',
              `This comparison diverged when you continued with ${comparisonData.continuedWithAI}. Resume the conversation?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Resume Chat',
                  onPress: () => {
                    // Load as regular chat session
                    dispatch(loadSession({
                      ...session,
                      sessionType: 'chat',
                    }));
                    navigation.navigate('Chat', { 
                      sessionId: session.id, 
                      resuming: true 
                    });
                  }
                },
                {
                  text: 'New Comparison',
                  onPress: () => {
                    if (session.selectedAIs.length >= 2) {
                      navigation.navigate('MainTabs', {
                        screen: 'Compare',
                        initial: false,
                        params: {
                          preselectedLeftAI: session.selectedAIs[0],
                          preselectedRightAI: session.selectedAIs[1]
                        }
                      });
                    }
                  }
                }
              ]
            );
          } else {
            // Comparison not diverged - can continue comparing
            Alert.alert(
              'Comparison Session',
              'Continue this comparison or start a new one?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue Comparison',
                  onPress: () => {
                    // Load comparison session and navigate to CompareScreen
                    dispatch(loadSession(session));
                    navigation.navigate('CompareSession', {
                      sessionId: session.id,
                      resuming: true,
                      leftAI: session.selectedAIs[0],
                      rightAI: session.selectedAIs[1]
                    });
                  }
                },
                {
                  text: 'New Comparison',
                  onPress: () => {
                    if (session.selectedAIs.length >= 2) {
                      navigation.navigate('MainTabs', {
                        screen: 'Compare',
                        initial: false,
                        params: {
                          preselectedLeftAI: session.selectedAIs[0],
                          preselectedRightAI: session.selectedAIs[1]
                        }
                      });
                    }
                  }
                }
              ]
            );
          }
          break;
        }
          
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
      ErrorService.handleWithToast(new Error('Failed to open the session. Please try again.'), { feature: 'history' });
    }
  }, [canStartTrial, dispatch, navigation, isDemo]);

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
      ErrorService.handleWithToast(new Error('Failed to share the conversation. Please try again.'), { feature: 'history' });
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
      ErrorService.showInfo('Session archiving will be available in a future update.', 'history');
      
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
  const bulkDelete = useCallback(async (sessionIds: string[]): Promise<boolean> => {
    if (sessionIds.length === 0) return false;
    
    const sessionWord = sessionIds.length === 1 ? 'conversation' : 'conversations';
    
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Delete Conversations',
        `Are you sure you want to delete ${sessionIds.length} ${sessionWord}?`,
        [
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => resolve(false)
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
                
                // Refresh the list after successful bulk deletion
                if (onRefresh) {
                  onRefresh();
                }
                
                resolve(true);
              } catch (error) {
                console.error('Error in bulk delete:', error);
                ErrorService.handleWithToast(new Error('Failed to delete some conversations. Please try again.'), { feature: 'history' });
                resolve(false);
              } finally {
                setIsProcessing(false);
              }
            },
          },
        ]
      );
    });
  }, [onRefresh]);

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
