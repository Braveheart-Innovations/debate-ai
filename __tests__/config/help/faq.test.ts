import { FAQ_ITEMS, getFAQByCategory, searchFAQ } from '@/config/help/faq';
import { HELP_TOPICS } from '@/config/help/topics';
import { HelpCategory } from '@/config/help/types';

const validCategories: HelpCategory[] = [
  'getting-started',
  'chat',
  'debate-arena',
  'byok',
  'compare',
  'history',
  'expert-mode',
];

describe('FAQ_ITEMS', () => {
  it('contains FAQ items', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(0);
  });

  it('all items have required properties', () => {
    FAQ_ITEMS.forEach((item) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('question');
      expect(item).toHaveProperty('answer');
      expect(item).toHaveProperty('category');
      expect(typeof item.id).toBe('string');
      expect(typeof item.question).toBe('string');
      expect(typeof item.answer).toBe('string');
      expect(item.question.length).toBeGreaterThan(0);
      expect(item.answer.length).toBeGreaterThan(0);
    });
  });

  it('all categories reference valid HelpCategory values', () => {
    FAQ_ITEMS.forEach((item) => {
      expect(validCategories).toContain(item.category);
    });
  });

  it('all relatedTopic references are valid topic IDs', () => {
    const topicIds = Object.keys(HELP_TOPICS);
    FAQ_ITEMS.forEach((item) => {
      if (item.relatedTopic) {
        expect(topicIds).toContain(item.relatedTopic);
      }
    });
  });

  it('all FAQ IDs are unique', () => {
    const ids = FAQ_ITEMS.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('getFAQByCategory', () => {
  it('returns FAQs for getting-started category', () => {
    const faqs = getFAQByCategory('getting-started');
    expect(faqs.length).toBeGreaterThan(0);
    faqs.forEach((faq) => {
      expect(faq.category).toBe('getting-started');
    });
  });

  it('returns FAQs for byok category', () => {
    const faqs = getFAQByCategory('byok');
    expect(faqs.length).toBeGreaterThan(0);
    faqs.forEach((faq) => {
      expect(faq.category).toBe('byok');
    });
  });

  it('returns FAQs for debate-arena category', () => {
    const faqs = getFAQByCategory('debate-arena');
    expect(faqs.length).toBeGreaterThan(0);
    faqs.forEach((faq) => {
      expect(faq.category).toBe('debate-arena');
    });
  });

  it('returns FAQs for expert-mode category', () => {
    const faqs = getFAQByCategory('expert-mode');
    expect(faqs.length).toBeGreaterThan(0);
    faqs.forEach((faq) => {
      expect(faq.category).toBe('expert-mode');
    });
  });

  it('returns empty array for category with no FAQs', () => {
    // Some categories might not have FAQs - test those that don't
    const categoriesWithFAQs = new Set(FAQ_ITEMS.map((item) => item.category));
    const categoryWithoutFAQs = validCategories.find(
      (c) => !categoriesWithFAQs.has(c)
    );
    if (categoryWithoutFAQs) {
      const faqs = getFAQByCategory(categoryWithoutFAQs);
      expect(faqs).toEqual([]);
    }
  });
});

describe('searchFAQ', () => {
  it('finds FAQs matching question text', () => {
    const results = searchFAQ('API key');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((faq) => {
      const matchesQuestion = faq.question.toLowerCase().includes('api key');
      const matchesAnswer = faq.answer.toLowerCase().includes('api key');
      expect(matchesQuestion || matchesAnswer).toBe(true);
    });
  });

  it('finds FAQs matching answer text', () => {
    const results = searchFAQ('temperature');
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty array for no matches', () => {
    const results = searchFAQ('xyznonexistenttermxyz');
    expect(results).toEqual([]);
  });

  it('search is case-insensitive', () => {
    const lowerResults = searchFAQ('symposium');
    const upperResults = searchFAQ('SYMPOSIUM');
    const mixedResults = searchFAQ('Symposium');

    expect(lowerResults.length).toBe(upperResults.length);
    expect(lowerResults.length).toBe(mixedResults.length);
  });

  it('finds FAQs with partial word matches', () => {
    const results = searchFAQ('debat');
    expect(results.length).toBeGreaterThan(0);
  });
});
