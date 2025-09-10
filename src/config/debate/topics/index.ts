import type { TopicCatalog } from './schema';

export const catalog: TopicCatalog = {
  categories: [
    { id: 'fun', name: 'Fun & Quirky', icon: '😄', color: '#FF6B6B', description: 'Light-hearted debates about everyday things' },
    { id: 'tech', name: 'Technology & Future', icon: '🤖', color: '#4ECDC4', description: 'AI, future tech, and digital society' },
    { id: 'philosophy', name: 'Philosophy & Life', icon: '🤔', color: '#45B7D1', description: 'Deep questions about existence and meaning' },
    { id: 'society', name: 'Society & Culture', icon: '🏛️', color: '#96CEB4', description: 'Politics, culture, and social issues' },
    { id: 'science', name: 'Science & Nature', icon: '🔬', color: '#FECA57', description: 'Scientific theories and discoveries' },
    { id: 'entertainment', name: 'Entertainment & Pop Culture', icon: '🎭', color: '#FF9FF3', description: 'Movies, games, and pop culture' },
    { id: 'health', name: 'Health & Lifestyle', icon: '🏥', color: '#54A0FF', description: 'Wellness, diet, and lifestyle choices' },
    { id: 'relationships', name: 'Relationships & Social', icon: '💕', color: '#FF7675', description: 'Love, friendship, and human connections' },
  ],
  topics: [
    // Fun & Quirky
    { id: 'hot-dog-sandwich', text: 'A hot dog is a sandwich.', categoryId: 'fun', difficulty: 'easy', tags: ['food', 'classification'], popularity: 5 },
    { id: 'pineapple-pizza', text: 'Pineapple on pizza is acceptable.', categoryId: 'fun', difficulty: 'easy', tags: ['food', 'taste'], popularity: 5 },
    { id: 'cereal-soup', text: 'Cereal is a soup.', categoryId: 'fun', difficulty: 'easy', tags: ['food', 'classification'], popularity: 4 },
    { id: 'gif-jif', text: 'GIF is pronounced with a hard G.', categoryId: 'fun', difficulty: 'easy', tags: ['language'], popularity: 3 },
    { id: 'die-hard-xmas', text: 'Die Hard is a Christmas movie.', categoryId: 'fun', difficulty: 'easy', tags: ['movies'], popularity: 4 },

    // Technology & Future
    { id: 'ai-rights', text: 'AI should have rights.', categoryId: 'tech', difficulty: 'hard', tags: ['ai','ethics'], popularity: 5 },
    { id: 'social-media-reg', text: 'Social media should be regulated.', categoryId: 'tech', difficulty: 'medium', tags: ['policy','internet'], popularity: 4 },
    { id: 'colonize-mars', text: 'Humanity should colonize Mars.', categoryId: 'tech', difficulty: 'hard', tags: ['space','exploration'], popularity: 4 },
    { id: 'ubi', text: 'There should be a universal basic income.', categoryId: 'tech', difficulty: 'medium', tags: ['economics','policy'], popularity: 4 },
    { id: 'privacy-dead', text: 'Privacy is dead in the digital age.', categoryId: 'tech', difficulty: 'medium', tags: ['privacy','surveillance'], popularity: 4 },

    // Philosophy & Life
    { id: 'free-will', text: 'Free will is an illusion.', categoryId: 'philosophy', difficulty: 'hard', tags: ['philosophy'], popularity: 4 },
    { id: 'money-happiness', text: 'Money can buy happiness.', categoryId: 'philosophy', difficulty: 'medium', tags: ['psychology','economics'], popularity: 4 },
    { id: 'objective-morality', text: 'There is objective morality.', categoryId: 'philosophy', difficulty: 'hard', tags: ['ethics'], popularity: 3 },
    { id: 'simulation', text: 'We are living in a simulation.', categoryId: 'philosophy', difficulty: 'hard', tags: ['metaphysics'], popularity: 4 },
    { id: 'altruism', text: 'True altruism exists.', categoryId: 'philosophy', difficulty: 'medium', tags: ['ethics','psychology'], popularity: 3 },

    // Society & Culture
    { id: 'tipping-abolish', text: 'Tipping culture should be abolished.', categoryId: 'society', difficulty: 'medium', tags: ['policy','service'], popularity: 3 },
    { id: 'college-free', text: 'College should be free.', categoryId: 'society', difficulty: 'medium', tags: ['education','policy'], popularity: 4 },
    { id: 'four-day-week', text: 'We should have a four-day work week.', categoryId: 'society', difficulty: 'medium', tags: ['work','productivity'], popularity: 4 },
    { id: 'term-limits', text: 'There should be term limits for all politicians.', categoryId: 'society', difficulty: 'medium', tags: ['politics','policy'], popularity: 3 },
    { id: 'cancel-culture', text: 'Cancel culture has gone too far.', categoryId: 'society', difficulty: 'medium', tags: ['culture'], popularity: 3 },

    // Science & Nature
    { id: 'pluto-planet', text: 'Pluto is a planet.', categoryId: 'science', difficulty: 'easy', tags: ['space'], popularity: 4 },
    { id: 'nuclear-solution', text: 'Nuclear energy is the best climate solution.', categoryId: 'science', difficulty: 'medium', tags: ['energy','climate'], popularity: 4 },
    { id: 'bring-back-extinct', text: 'We should bring back extinct species.', categoryId: 'science', difficulty: 'hard', tags: ['genetics'], popularity: 3 },
    { id: 'multiverse', text: 'There is a multiverse.', categoryId: 'science', difficulty: 'hard', tags: ['cosmology'], popularity: 3 },
    { id: 'animal-testing', text: 'We should ban animal testing.', categoryId: 'science', difficulty: 'medium', tags: ['ethics','science'], popularity: 3 },

    // Entertainment & Pop Culture
    { id: 'remakes-better', text: 'Remakes are better than originals.', categoryId: 'entertainment', difficulty: 'easy', tags: ['movies'], popularity: 2 },
    { id: 'streaming-killing-cinema', text: 'Streaming is killing cinema.', categoryId: 'entertainment', difficulty: 'medium', tags: ['movies','industry'], popularity: 3 },
    { id: 'games-art', text: 'Video games are art.', categoryId: 'entertainment', difficulty: 'medium', tags: ['games','art'], popularity: 4 },
    { id: 'sequel-limits', text: 'There should be a limit on sequels.', categoryId: 'entertainment', difficulty: 'easy', tags: ['movies'], popularity: 2 },
    { id: 'separate-art-artist', text: 'We should separate art from the artist.', categoryId: 'entertainment', difficulty: 'medium', tags: ['ethics','culture'], popularity: 3 },

    // Health & Lifestyle
    { id: 'veganism-future', text: 'Veganism is the future.', categoryId: 'health', difficulty: 'medium', tags: ['diet','ethics'], popularity: 3 },
    { id: 'ban-smoking', text: 'We should ban smoking completely.', categoryId: 'health', difficulty: 'medium', tags: ['public health'], popularity: 3 },
    { id: 'intermittent-fasting', text: 'Intermittent fasting is healthy.', categoryId: 'health', difficulty: 'easy', tags: ['diet'], popularity: 3 },
    { id: 'mental-health-days', text: 'Mental health days should be mandatory.', categoryId: 'health', difficulty: 'easy', tags: ['work','health'], popularity: 3 },
    { id: 'screen-time-limit', text: 'We should limit screen time.', categoryId: 'health', difficulty: 'easy', tags: ['lifestyle'], popularity: 3 },

    // Relationships & Social
    { id: 'marriage-outdated', text: 'Marriage is outdated.', categoryId: 'relationships', difficulty: 'medium', tags: ['relationships'], popularity: 3 },
    { id: 'open-relationships', text: 'Open relationships are sustainable.', categoryId: 'relationships', difficulty: 'medium', tags: ['relationships'], popularity: 2 },
    { id: 'online-dating-ruining', text: 'Online dating is ruining romance.', categoryId: 'relationships', difficulty: 'medium', tags: ['dating'], popularity: 3 },
    { id: 'friendzone-real', text: 'The friendzone is real.', categoryId: 'relationships', difficulty: 'easy', tags: ['relationships'], popularity: 2 },
    { id: 'live-together-before-marriage', text: 'Couples should live together before marriage.', categoryId: 'relationships', difficulty: 'easy', tags: ['relationships'], popularity: 3 },
  ],
};

export type { TopicCatalog, TopicCategoryId } from './schema';
