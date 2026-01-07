/**
 * Help System Types
 *
 * Type definitions for the help content system including
 * topics, categories, and FAQ items.
 */

export type HelpTopicId =
  // Getting Started
  | 'dynamic-ai-selector'
  | 'personalities'
  | 'multi-ai-chat'
  | 'debate-arena'
  | 'compare-mode'
  | 'history-overview'
  | 'byok-overview'
  | 'expert-mode'
  | 'create-mode'
  // Chat
  | 'quick-start-wizard'
  | 'round-robin'
  | 'history'
  | 'ai-mentions'
  | 'web-search'
  // Debate Arena
  | 'debate-formats'
  | 'debate-voting'
  | 'debate-transcripts'
  | 'debate-stats'
  // BYOK
  | 'byok-getting-keys'
  | 'byok-security'
  | 'byok-cost-savings'
  // Compare
  | 'compare-bubble'
  | 'compare-continue'
  // History
  | 'chat-history'
  | 'debate-history'
  | 'compare-history'
  | 'history-clear-all'
  // Expert Mode
  | 'expert-temperature'
  | 'expert-tokens'
  | 'expert-top-p'
  // Create Mode
  | 'create-styles'
  | 'create-sizes'
  | 'create-refinement'
  | 'create-gallery'
  | 'create-providers';

export type HelpCategory =
  | 'getting-started'
  | 'chat'
  | 'debate-arena'
  | 'byok'
  | 'compare'
  | 'history'
  | 'expert-mode'
  | 'create';

export interface HelpTopic {
  id: HelpTopicId;
  title: string;
  icon: string; // Ionicons name
  category: HelpCategory;
  shortDescription: string;
  content: string; // In-app content (supports basic formatting)
  relatedTopics?: HelpTopicId[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: HelpCategory;
  relatedTopic?: HelpTopicId;
}

export interface HelpCategoryInfo {
  id: HelpCategory;
  title: string;
  icon: string;
  description: string;
}
