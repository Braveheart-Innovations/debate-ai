/**
 * Service for managing debate topics
 * Single source of truth backed by the topic catalog
 */

import { catalog } from '../../config/debate/topics';
import type { TopicCategoryId } from '../../config/debate/topics';
import type { SuggestedTopic, TopicCategory } from '../../config/debate/suggestedTopics';
import { DEBATE_SETUP_CONFIG } from '../../config/debate/debateSetupConfig';
import { TopicValidationResult } from '../../types/debate';

export class TopicService {
  // Catalog helpers
  static getCategories(): { id: TopicCategoryId; name: TopicCategory }[] {
    return catalog.categories.map(c => ({ id: c.id, name: TopicService.categoryIdToName(c.id) }));
  }

  static getTopicsByCategory(category: TopicCategory): string[] {
    // Match by display name prefix to tolerate minor label differences
    const cat = catalog.categories.find(c => c.name.startsWith(category.split(' ')[0]));
    const id = cat?.id;
    return id ? catalog.topics.filter(t => t.categoryId === id).map(t => t.text) : [];
  }

  static getSuggestedTopics(limit?: number): SuggestedTopic[] {
    const take = limit || DEBATE_SETUP_CONFIG.SUGGESTED_TOPICS_COUNT;
    const byPopularity = [...catalog.topics].sort((a,b) => (b.popularity || 0) - (a.popularity || 0));
    return byPopularity.slice(0, take).map(TopicService.toSuggested);
  }

  static generateRandomTopic(): SuggestedTopic {
    const n = Math.floor(Math.random() * catalog.topics.length);
    return TopicService.toSuggested(catalog.topics[n]);
  }

  static generateRandomTopicString(): string {
    return TopicService.generateRandomTopic().topic;
  }

  // Custom-topic normalization: suggest only
  static normalizeMotion(topic: string): string {
    if (!topic) return topic;
    const t = topic.trim();
    if (/^[A-Z].*\.$/.test(t)) return t;
    const stripQ = (s: string) => s.replace(/\?+$/, '').trim();
    const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const mShouldWe = /^should\s+we\s+(.+?)\?$/i.exec(t);
    if (mShouldWe) return `We should ${stripQ(mShouldWe[1])}.`;
    const mShouldBe = /^should\s+(.+?)\s+be\s+(.+?)\?$/i.exec(t);
    if (mShouldBe) return `${cap(stripQ(mShouldBe[1]))} should be ${stripQ(mShouldBe[2])}.`;
    const mShould = /^should\s+(.+?)\?$/i.exec(t);
    if (mShould) return `${cap(stripQ(mShould[1]))} should.`;
    const mIsDet = /^is\s+(.+?)\s+(a|an|the)\s+(.+?)\?$/i.exec(t);
    if (mIsDet) return `${cap(stripQ(mIsDet[1]))} is ${mIsDet[2].toLowerCase()} ${stripQ(mIsDet[3])}.`;
    const mIs = /^is\s+(.+?)\s+(.+?)\?$/i.exec(t);
    if (mIs) return `${cap(stripQ(mIs[1]))} is ${stripQ(mIs[2])}.`;
    const mAre = /^are\s+(.+?)\s+(.+?)\?$/i.exec(t);
    if (mAre) return `${cap(stripQ(mAre[1]))} are ${stripQ(mAre[2])}.`;
    const mCan = /^can\s+(.+?)\s+(.+?)\?$/i.exec(t);
    if (mCan) return `${cap(stripQ(mCan[1]))} can ${stripQ(mCan[2])}.`;
    return t;
  }

  static validateCustomTopic(topic: string): TopicValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    if (!topic || topic.trim().length === 0) {
      errors.push('Topic cannot be empty');
    } else if (topic.trim().length < DEBATE_SETUP_CONFIG.TOPIC_MIN_LENGTH) {
      errors.push(DEBATE_SETUP_CONFIG.VALIDATION_MESSAGES.TOPIC_TOO_SHORT);
    } else if (topic.length > DEBATE_SETUP_CONFIG.TOPIC_MAX_LENGTH) {
      errors.push(DEBATE_SETUP_CONFIG.VALIDATION_MESSAGES.TOPIC_TOO_LONG);
    }
    const trimmed = topic.trim();
    const inappropriateWords = ['hate', 'kill', 'murder', 'violent'];
    if (inappropriateWords.some(w => trimmed.toLowerCase().includes(w))) {
      errors.push('Topic contains inappropriate content');
    }
    if (/\?$/.test(trimmed)) {
      const suggested = TopicService.normalizeMotion(trimmed);
      if (suggested && suggested !== trimmed) {
        suggestions.push(`Suggested motion: ${suggested}`);
      }
    }
    if (trimmed.length > 150) warnings.push('Long topics may be harder to debate effectively');
    else if (trimmed.length < 20) warnings.push('Short topics might benefit from more context');
    const similar = TopicService.findSimilarTopics(trimmed);
    if (similar.length > 0) {
      suggestions.push(`Similar topics exist: ${similar.slice(0,2).map(t => `"${t.topic}"`).join(', ')}`);
    }
    return { isValid: errors.length === 0, errors, warnings, suggestions };
  }

  static getTopicCategory(topic: string): TopicCategory | null {
    const t = catalog.topics.find(x => x.text.toLowerCase() === topic.toLowerCase());
    return t ? TopicService.categoryIdToName(t.categoryId) : null;
  }

  static getRelatedTopics(topic: string, limit = 3): SuggestedTopic[] {
    const t = catalog.topics.find(x => x.text.toLowerCase() === topic.toLowerCase());
    const pool = t ? catalog.topics.filter(x => x.categoryId === t.categoryId && x.id !== t.id) : catalog.topics;
    return pool.slice(0, limit).map(TopicService.toSuggested);
  }

  static searchTopics(query: string): SuggestedTopic[] {
    if (!query || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return catalog.topics
      .filter(t => t.text.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)))
      .map(TopicService.toSuggested);
  }

  static getEstimatedDuration(topic: string): number {
    const len = topic.length;
    const cat = TopicService.getTopicCategory(topic);
    if (len < 30) return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.SHORT_TOPIC;
    if (len < 60) return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.MEDIUM_TOPIC;
    if (len < 100) return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.LONG_TOPIC;
    if (cat === 'Philosophy' || cat === 'Science') return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.COMPLEX_TOPIC;
    if (cat === 'Fun & Quirky') return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.SHORT_TOPIC;
    return DEBATE_SETUP_CONFIG.ESTIMATED_DURATION.MEDIUM_TOPIC;
  }

  static isTopicDebatable(topic: string): boolean {
    return TopicService.validateCustomTopic(topic).isValid;
  }

  // Private
  private static toSuggested(t: (typeof catalog.topics)[number]): SuggestedTopic {
    return {
      id: t.id,
      topic: t.text,
      category: TopicService.categoryIdToName(t.categoryId),
      difficulty: t.difficulty || 'medium',
      estimatedDuration: TopicService.getEstimatedDuration(t.text),
      tags: t.tags || [],
      popularity: t.popularity || 3,
    };
  }

  private static findSimilarTopics(topic: string): SuggestedTopic[] {
    const words = topic.toLowerCase().split(' ').filter(w => w.length > 3);
    if (words.length === 0) return [];
    const hits = catalog.topics.filter(t => words.some(w => t.text.toLowerCase().includes(w)));
    return hits.slice(0, 3).map(TopicService.toSuggested);
  }

  private static categoryIdToName(id: TopicCategoryId): TopicCategory {
    const m: Record<TopicCategoryId, TopicCategory> = {
      fun: 'Fun & Quirky',
      tech: 'Technology',
      philosophy: 'Philosophy',
      society: 'Society',
      science: 'Science',
      entertainment: 'Entertainment',
      health: 'Health',
      relationships: 'Relationships',
    };
    return m[id];
  }
}

