import {
  HELP_CATEGORIES,
  HELP_TOPICS,
  getTopicsByCategory,
  getTopicById,
  getRelatedTopics,
} from '@/config/help/topics';
import { HelpCategory } from '@/config/help/types';

describe('HELP_CATEGORIES', () => {
  it('contains all expected categories', () => {
    const categoryIds = HELP_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain('getting-started');
    expect(categoryIds).toContain('chat');
    expect(categoryIds).toContain('debate-arena');
    expect(categoryIds).toContain('byok');
    expect(categoryIds).toContain('compare');
    expect(categoryIds).toContain('history');
    expect(categoryIds).toContain('expert-mode');
    expect(HELP_CATEGORIES).toHaveLength(7);
  });

  it('each category has required properties', () => {
    HELP_CATEGORIES.forEach((category) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('title');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('description');
      expect(typeof category.id).toBe('string');
      expect(typeof category.title).toBe('string');
      expect(typeof category.icon).toBe('string');
      expect(typeof category.description).toBe('string');
    });
  });
});

describe('HELP_TOPICS', () => {
  const topicIds = Object.keys(HELP_TOPICS);
  const validCategories: HelpCategory[] = [
    'getting-started',
    'chat',
    'debate-arena',
    'byok',
    'compare',
    'history',
    'expert-mode',
  ];

  it('contains topics', () => {
    expect(topicIds.length).toBeGreaterThan(0);
  });

  it('all topics have required properties', () => {
    topicIds.forEach((id) => {
      const topic = HELP_TOPICS[id];
      expect(topic).toHaveProperty('id');
      expect(topic).toHaveProperty('title');
      expect(topic).toHaveProperty('icon');
      expect(topic).toHaveProperty('category');
      expect(topic).toHaveProperty('shortDescription');
      expect(topic).toHaveProperty('content');
      expect(topic.id).toBe(id);
    });
  });

  it('all topic categories reference valid categories', () => {
    topicIds.forEach((id) => {
      const topic = HELP_TOPICS[id];
      expect(validCategories).toContain(topic.category);
    });
  });

  it('all relatedTopics reference valid topic IDs', () => {
    topicIds.forEach((id) => {
      const topic = HELP_TOPICS[id];
      if (topic.relatedTopics) {
        topic.relatedTopics.forEach((relatedId) => {
          expect(topicIds).toContain(relatedId);
        });
      }
    });
  });
});

describe('getTopicsByCategory', () => {
  it('returns correct topics for getting-started category', () => {
    const topics = getTopicsByCategory('getting-started');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('getting-started');
    });
  });

  it('returns correct topics for chat category', () => {
    const topics = getTopicsByCategory('chat');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('chat');
    });
  });

  it('returns correct topics for debate-arena category', () => {
    const topics = getTopicsByCategory('debate-arena');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('debate-arena');
    });
  });

  it('returns correct topics for byok category', () => {
    const topics = getTopicsByCategory('byok');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('byok');
    });
  });

  it('returns correct topics for compare category', () => {
    const topics = getTopicsByCategory('compare');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('compare');
    });
  });

  it('returns correct topics for history category', () => {
    const topics = getTopicsByCategory('history');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('history');
    });
  });

  it('returns correct topics for expert-mode category', () => {
    const topics = getTopicsByCategory('expert-mode');
    expect(topics.length).toBeGreaterThan(0);
    topics.forEach((topic) => {
      expect(topic.category).toBe('expert-mode');
    });
  });

  it('returns empty array for invalid category', () => {
    const topics = getTopicsByCategory('invalid-category' as HelpCategory);
    expect(topics).toEqual([]);
  });
});

describe('getTopicById', () => {
  it('returns topic for valid ID', () => {
    const topic = getTopicById('debate-arena');
    expect(topic).toBeDefined();
    expect(topic?.id).toBe('debate-arena');
    expect(topic?.title).toBe('AI Debate Arena');
  });

  it('returns topic for another valid ID', () => {
    const topic = getTopicById('quick-start-wizard');
    expect(topic).toBeDefined();
    expect(topic?.id).toBe('quick-start-wizard');
  });

  it('returns undefined for invalid ID', () => {
    const topic = getTopicById('non-existent-topic');
    expect(topic).toBeUndefined();
  });
});

describe('getRelatedTopics', () => {
  it('returns related topics for topic with relations', () => {
    const relatedTopics = getRelatedTopics('debate-arena');
    expect(relatedTopics.length).toBeGreaterThan(0);
    relatedTopics.forEach((topic) => {
      expect(topic).toHaveProperty('id');
      expect(topic).toHaveProperty('title');
    });
  });

  it('returns empty array for topic without relations', () => {
    // Find a topic without relatedTopics
    const topicWithoutRelations = Object.values(HELP_TOPICS).find(
      (t) => !t.relatedTopics || t.relatedTopics.length === 0
    );
    if (topicWithoutRelations) {
      const relatedTopics = getRelatedTopics(topicWithoutRelations.id);
      expect(relatedTopics).toEqual([]);
    }
  });

  it('returns empty array for invalid topic ID', () => {
    const relatedTopics = getRelatedTopics('non-existent-topic');
    expect(relatedTopics).toEqual([]);
  });
});
