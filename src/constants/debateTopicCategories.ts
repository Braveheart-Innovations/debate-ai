export type DebateTopicCategory =
  | 'Fun & Quirky'
  | 'Technology & Future'
  | 'Philosophy & Life'
  | 'Society & Culture'
  | 'Science & Nature'
  | 'Entertainment & Pop Culture'
  | 'Health & Lifestyle'
  | 'Relationships & Social';

// Curated categories with representative topics (expandable)
export const DEBATE_TOPIC_CATEGORIES: Record<DebateTopicCategory, string[]> = {
  'Fun & Quirky': [
    'Is a hot dog a sandwich?',
    'Is pineapple on pizza acceptable?',
    'Is cereal soup?',
    'Is it gif or jif?',
    'Is Die Hard a Christmas movie?',
  ],
  'Technology & Future': [
    'Should AI have rights?',
    'Should social media be regulated?',
    'Should we colonize Mars?',
    'Will robots replace most human jobs?',
    'Is privacy dead in the digital age?',
  ],
  'Philosophy & Life': [
    'Is free will an illusion?',
    'Does true altruism exist?',
    'Can money buy happiness?',
    'Is there objective morality?',
    'Is karma real?',
  ],
  'Society & Culture': [
    'Should tipping culture be abolished?',
    'Is cancel culture going too far?',
    'Should college be free?',
    'Is the education system outdated?',
    'Should we have a four-day work week?',
  ],
  'Science & Nature': [
    'Is Pluto a planet?',
    'Are we alone in the universe?',
    'Should we bring back extinct species?',
    'Is nuclear energy the solution?',
    'Is there a multiverse?',
  ],
  'Entertainment & Pop Culture': [
    'Are remakes better than originals?',
    'Is streaming killing cinema?',
    'Are video games art?',
    'Should there be a limit on sequels?',
    'Are superhero movies oversaturated?',
  ],
  'Health & Lifestyle': [
    'Is veganism the future?',
    'Should we normalize naps at work?',
    'Is intermittent fasting healthy?',
    'Should we ban smoking completely?',
    'Should mental health days be mandatory?',
  ],
  'Relationships & Social': [
    'Is marriage outdated?',
    'Are open relationships sustainable?',
    'Is the friendzone real?',
    'Are long-distance relationships worth it?',
    'Should you live together before marriage?',
  ],
};

export const ALL_PRESET_TOPICS: string[] = Object.values(DEBATE_TOPIC_CATEGORIES).flat();

