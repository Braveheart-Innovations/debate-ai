/**
 * Suggested topics derived from the single topic catalog
 */
import { catalog } from '../debate/topics';

export interface SuggestedTopic {
  id: string;
  topic: string;
  category: TopicCategory;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number;
  tags: string[];
  popularity: number;
}

export type TopicCategory =
  | 'Fun & Quirky'
  | 'Technology'
  | 'Philosophy'
  | 'Society'
  | 'Science'
  | 'Entertainment'
  | 'Health'
  | 'Relationships';

const catMap: Record<string, TopicCategory> = {
  fun: 'Fun & Quirky',
  tech: 'Technology',
  philosophy: 'Philosophy',
  society: 'Society',
  science: 'Science',
  entertainment: 'Entertainment',
  health: 'Health',
  relationships: 'Relationships',
};

export const SUGGESTED_TOPICS: SuggestedTopic[] = catalog.topics.map(t => ({
  id: t.id,
  topic: t.text,
  category: catMap[t.categoryId] || 'Fun & Quirky',
  difficulty: t.difficulty || 'medium',
  estimatedDuration: Math.max(8, Math.min(25, Math.round(t.text.length / 6))),
  tags: t.tags || [],
  popularity: t.popularity || 3,
}));

export const TOPIC_CATEGORIES: Record<TopicCategory, { name: string; icon: string; color: string; description: string }> = {
  'Fun & Quirky': { name: 'Fun & Quirky', icon: '😄', color: '#FF6B6B', description: 'Light-hearted debates about everyday things' },
  Technology: { name: 'Technology', icon: '🤖', color: '#4ECDC4', description: 'AI, future tech, and digital society' },
  Philosophy: { name: 'Philosophy', icon: '🤔', color: '#45B7D1', description: 'Deep questions about existence and meaning' },
  Society: { name: 'Society', icon: '🏛️', color: '#96CEB4', description: 'Politics, culture, and social issues' },
  Science: { name: 'Science', icon: '🔬', color: '#FECA57', description: 'Scientific theories and discoveries' },
  Entertainment: { name: 'Entertainment', icon: '🎭', color: '#FF9FF3', description: 'Movies, games, and pop culture' },
  Health: { name: 'Health', icon: '🏥', color: '#54A0FF', description: 'Wellness, diet, and lifestyle choices' },
  Relationships: { name: 'Relationships', icon: '💕', color: '#FF7675', description: 'Love, friendship, and human connections' },
};

export const TopicUtils = {
  getTopicsByCategory: (category: TopicCategory) => SUGGESTED_TOPICS.filter(t => t.category === category),
  getPopularTopics: (limit = 6) => [...SUGGESTED_TOPICS].sort((a,b) => b.popularity - a.popularity).slice(0, limit),
  getRandomTopic: () => SUGGESTED_TOPICS[Math.floor(Math.random() * SUGGESTED_TOPICS.length)],
  getTopicById: (id: string) => SUGGESTED_TOPICS.find(t => t.id === id),
  searchTopics: (query: string) => SUGGESTED_TOPICS.filter(t => t.topic.toLowerCase().includes(query.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))),
  getRelatedTopics: (current: SuggestedTopic, limit = 3) => SUGGESTED_TOPICS.filter(t => t.id !== current.id && (t.category === current.category || t.tags.some(tag => current.tags.includes(tag)))).slice(0, limit),
};
