import {
  SUGGESTED_TOPICS,
  TOPIC_CATEGORIES,
  TopicUtils,
  type SuggestedTopic,
} from '@/config/debate/suggestedTopics';
import { QUICK_START_TOPICS, TOPIC_PROMPTS } from '@/config/quickStartTopics';

describe('Suggested topics catalog', () => {
  it('maps catalog entries into typed suggested topics with bounds', () => {
    expect(SUGGESTED_TOPICS).not.toHaveLength(0);
    for (const topic of SUGGESTED_TOPICS) {
      expect(topic.id).toBeTruthy();
      expect(topic.topic.length).toBeGreaterThan(0);
      expect(Object.keys(TOPIC_CATEGORIES)).toContain(topic.category);
      expect(topic.estimatedDuration).toBeGreaterThanOrEqual(8);
      expect(topic.estimatedDuration).toBeLessThanOrEqual(25);
      expect(topic.popularity).toBeGreaterThanOrEqual(0);
    }
  });

  it('applies fallbacks when catalog data omits optional fields', () => {
    jest.isolateModules(() => {
      jest.doMock('@/config/debate/topics', () => ({
        catalog: {
          topics: [
            {
              id: 'fallback-topic',
              text: 'Fallback example topic',
              categoryId: 'unknown',
            },
          ],
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const module = require('@/config/debate/suggestedTopics') as typeof import('@/config/debate/suggestedTopics');
      const [topic] = module.SUGGESTED_TOPICS;
      expect(topic).toMatchObject({
        id: 'fallback-topic',
        topic: 'Fallback example topic',
        category: 'Fun & Quirky',
        difficulty: 'medium',
        tags: [],
        popularity: 3,
      });
      expect(topic.estimatedDuration).toBeGreaterThanOrEqual(8);
      expect(topic.estimatedDuration).toBeLessThanOrEqual(25);
    });
    jest.resetModules();
  });
});

describe('Suggested topic helpers', () => {
  it('filters topics by category', () => {
    const techTopics = TopicUtils.getTopicsByCategory('Technology');
    expect(techTopics.length).toBeGreaterThan(0);
    for (const topic of techTopics) {
      expect(topic.category).toBe('Technology');
    }
  });

  it('returns most popular topics in descending order', () => {
    const popular = TopicUtils.getPopularTopics(5);
    expect(popular).toHaveLength(5);
    for (let i = 1; i < popular.length; i += 1) {
      expect(popular[i - 1].popularity).toBeGreaterThanOrEqual(popular[i].popularity);
    }
  });

  it('returns deterministic random topic when Math.random is stubbed', () => {
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(TopicUtils.getRandomTopic()).toEqual(SUGGESTED_TOPICS[0]);
    spy.mockRestore();
  });

  it('looks up topics by id and query strings', () => {
    const target = SUGGESTED_TOPICS.find(topic => topic.id === 'pineapple-pizza');
    expect(target).toBeDefined();
    expect(TopicUtils.getTopicById('pineapple-pizza')).toEqual(target);

    const results = TopicUtils.searchTopics('pizza');
    expect(results.some(topic => topic.id === 'pineapple-pizza')).toBe(true);
  });

  it('derives related topics based on category and tags', () => {
    const current = SUGGESTED_TOPICS.find(topic => topic.id === 'ai-rights') as SuggestedTopic;
    const related = TopicUtils.getRelatedTopics(current, 3);
    expect(related.length).toBeLessThanOrEqual(3);
    expect(related.every(topic => topic.id !== current.id)).toBe(true);
    expect(
      related.every(topic => topic.category === current.category || topic.tags.some(tag => current.tags.includes(tag))),
    ).toBe(true);
  });
});

describe('Quick start topics', () => {
  it('exposes prompts for each quick start topic', () => {
    const ids = QUICK_START_TOPICS.map(topic => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const topic of QUICK_START_TOPICS) {
      expect(topic.emoji).toBeTruthy();
      expect(topic.title).toBeTruthy();
      expect(topic.subtitle).toBeTruthy();
      expect(TOPIC_PROMPTS[topic.id]).toBeTruthy();
    }
  });
});
