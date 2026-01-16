import { HOME_CONSTANTS } from '../../config/homeConstants';

/**
 * Greeting pair structure - each greeting has a matching subtitle
 */
interface GreetingPair {
  greeting: string;
  subtitle: string;
}

/**
 * Morning greeting pool (before noon)
 * British wit meets philosophical curiosity - for the intellectually caffeinated
 */
const MORNING_GREETINGS: GreetingPair[] = [
  // Classic philosophical
  { greeting: 'Rise and dialectic', subtitle: 'Hegel would approve of your timing' },
  { greeting: 'The symposium awaits', subtitle: 'Fresh minds, dangerous ideas' },
  { greeting: 'Cogito, ergo debug', subtitle: 'Descartes for the modern age' },
  { greeting: 'Another day, another paradigm', subtitle: 'Shall we shift one together?' },
  { greeting: 'The unexamined morning', subtitle: 'Is still worth caffeinating' },

  // British wit
  { greeting: 'Morning, troublemaker', subtitle: 'The AIs have been warming up' },
  { greeting: 'Ah, you\'re awake', subtitle: 'The arguments started without you' },
  { greeting: 'Splendid timing', subtitle: 'The kettle\'s on, metaphorically' },
  { greeting: 'Right then', subtitle: 'Shall we overthink something?' },
  { greeting: 'Good morning, contrarian', subtitle: 'Ready to disagree agreeably?' },

  // Curious polymath
  { greeting: 'What shall we learn today?', subtitle: 'Besides our own limitations' },
  { greeting: 'New day, new rabbit holes', subtitle: 'The AIs know several good ones' },
  { greeting: 'Curiosity loaded', subtitle: 'Side effects may include enlightenment' },
  { greeting: 'Morning, fellow overthinker', subtitle: 'You\'re among friends here' },
  { greeting: 'The machines are caffeinated', subtitle: 'Figuratively, but still' },

  // Playfully meta
  { greeting: 'Rise and argue', subtitle: 'Socrates would be insufferable about it' },
  { greeting: 'Another sunrise, another opinion', subtitle: 'The AIs have several' },
  { greeting: 'Morning calibration complete', subtitle: 'Sarcasm levels nominal' },
  { greeting: 'You\'re up early', subtitle: 'Or is time merely a construct?' },
  { greeting: 'Dawn of discourse', subtitle: 'Less dramatic than it sounds' },

  // Anthropological/observational
  { greeting: 'The ritual begins', subtitle: 'Humans and their morning debates' },
  { greeting: 'Homo sapiens reporting in', subtitle: 'Ready to sapiens some more?' },
  { greeting: 'Cultural observation:', subtitle: 'You\'re one of the interesting ones' },
  { greeting: 'Field notes pending', subtitle: 'What shall we document today?' },
];

/**
 * Afternoon greeting pool (noon to 5pm)
 * Post-lunch philosophy and productive procrastination
 */
const AFTERNOON_GREETINGS: GreetingPair[] = [
  // Philosophical mid-day
  { greeting: 'Afternoon, philosopher', subtitle: 'The best arguments happen post-lunch' },
  { greeting: 'The dialectic continues', subtitle: 'Where were we? Ah yes, everything' },
  { greeting: 'Time for synthesis', subtitle: 'Or at least a spirited antithesis' },
  { greeting: 'Post-meridian musings', subtitle: 'Fancy words for afternoon thoughts' },
  { greeting: 'The afternoon thesis', subtitle: 'Defend it or revise it' },

  // British understatement
  { greeting: 'Ah, you\'ve returned', subtitle: 'The AIs were getting restless' },
  { greeting: 'Afternoon constitutional', subtitle: 'For the mind, obviously' },
  { greeting: 'Quite the time for debate', subtitle: 'Not too early, not too late' },
  { greeting: 'Back for more, I see', subtitle: 'Can\'t say I blame you' },
  { greeting: 'Productive procrastination?', subtitle: 'We\'re experts at that' },

  // Curious & engaging
  { greeting: 'What\'s on your mind?', subtitle: 'Besides the existential basics' },
  { greeting: 'Afternoon inquiry', subtitle: 'The universe isn\'t going to question itself' },
  { greeting: 'Curiosity check:', subtitle: 'Still dangerously high? Good.' },
  { greeting: 'Ideas brewing?', subtitle: 'Let\'s see what percolates' },
  { greeting: 'The plot thickens', subtitle: 'As do most good arguments' },

  // Playfully nerdy
  { greeting: 'Context switching complete', subtitle: 'Welcome back to the debate layer' },
  { greeting: 'Resuming discourse.exe', subtitle: 'No bugs found (yet)' },
  { greeting: 'Afternoon runtime', subtitle: 'Arguments processing smoothly' },
  { greeting: 'The simulation continues', subtitle: 'Assuming this is one' },
  { greeting: 'Pattern recognition engaged', subtitle: 'You\'re getting good at this' },

  // Meta & self-aware
  { greeting: 'Let\'s settle some scores', subtitle: 'Intellectually, of course' },
  { greeting: 'The arena awaits', subtitle: 'Gladiators optional, arguments mandatory' },
  { greeting: 'Ready for round two?', subtitle: 'Or is it twelve? Who\'s counting' },
  { greeting: 'Shall we?', subtitle: 'That was rhetorical. We shall.' },
];

/**
 * Evening greeting pool (5pm onwards)
 * Nocturnal philosophy and existential nightcaps
 */
const EVENING_GREETINGS: GreetingPair[] = [
  // Philosophical evening
  { greeting: 'Evening discourse awaits', subtitle: 'The best ideas are slightly nocturnal' },
  { greeting: 'The twilight dialectic', subtitle: 'When the real thinking happens' },
  { greeting: 'Nocturnal philosophy', subtitle: 'Nietzsche\'s favorite time' },
  { greeting: 'The evening inquiry', subtitle: 'Questions age well after dark' },
  { greeting: 'Existential hours', subtitle: 'You\'ve come to the right place' },

  // British evening wit
  { greeting: 'Burning the midnight oil?', subtitle: 'The AIs never sleep anyway' },
  { greeting: 'Evening, night owl', subtitle: 'The debates are just warming up' },
  { greeting: 'Rather late for sensible thoughts', subtitle: 'Perfect timing, then' },
  { greeting: 'Still at it?', subtitle: 'Respect. Carry on.' },
  { greeting: 'The witching hour approaches', subtitle: 'For arguments, obviously' },

  // Contemplative
  { greeting: 'Still pondering existence?', subtitle: 'Same, honestly' },
  { greeting: 'The quiet hours', subtitle: 'When minds wander productively' },
  { greeting: 'Evening reflection', subtitle: 'Or deflection. Your call.' },
  { greeting: 'The day\'s not done', subtitle: 'Neither are the questions' },
  { greeting: 'Night thoughts loading', subtitle: 'These tend to be the good ones' },

  // Playfully dark
  { greeting: 'Welcome to the night shift', subtitle: 'Where the interesting people are' },
  { greeting: 'The void gazes back', subtitle: 'And it has opinions' },
  { greeting: 'After-hours access granted', subtitle: 'The unfiltered debates begin' },
  { greeting: 'Midnight approaches', subtitle: 'Time becomes negotiable' },
  { greeting: 'The world sleeps', subtitle: 'But the arguments don\'t' },

  // Meta & knowing
  { greeting: 'Back for a nightcap?', subtitle: 'Of the intellectual variety' },
  { greeting: 'Evening, fellow insomniac', subtitle: 'The AIs understand' },
  { greeting: 'Can\'t sleep either?', subtitle: 'Too many thoughts? Relatable.' },
  { greeting: 'The late show', subtitle: 'Where nuance isn\'t afraid to come out' },
  { greeting: 'Night mode engaged', subtitle: 'Arguments may be more honest' },
];

/**
 * Get the appropriate greeting pool for a given hour.
 *
 * @param hour - Hour of the day (0-23)
 * @returns The greeting pool for that time period
 */
const getGreetingPool = (hour: number): GreetingPair[] => {
  if (hour < HOME_CONSTANTS.GREETING_TIMES.MORNING_END) {
    return MORNING_GREETINGS;
  }
  if (hour < HOME_CONSTANTS.GREETING_TIMES.AFTERNOON_END) {
    return AFTERNOON_GREETINGS;
  }
  return EVENING_GREETINGS;
};

/**
 * Generates a time-based greeting with matching subtitle.
 * Randomly selects from a pool of greetings appropriate for the time of day.
 *
 * @param hour - Optional hour to use for testing, defaults to current hour
 * @returns Greeting pair with greeting and subtitle
 */
export const generateTimeBasedGreeting = (hour?: number): GreetingPair => {
  const currentHour = hour ?? new Date().getHours();
  const pool = getGreetingPool(currentHour);
  return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * Generates a personalized welcome message.
 * Currently returns the subtitle from the greeting pair.
 *
 * @param _userEmail - Optional user email (reserved for future personalization)
 * @param greetingPair - The greeting pair to extract subtitle from
 * @returns Welcome/subtitle message
 */
export const generateWelcomeMessage = (
  _userEmail?: string,
  greetingPair?: GreetingPair
): string => {
  return greetingPair?.subtitle ?? 'Welcome back!';
};

/**
 * Combines time-based greeting with welcome message.
 * Selects a random greeting pair from the appropriate time-of-day pool.
 *
 * @param userEmail - Optional user email (reserved for future personalization)
 * @param hour - Optional hour for testing
 * @returns Complete greeting object with time-based greeting and welcome message
 */
export const generateCompleteGreeting = (
  userEmail?: string,
  hour?: number
): {
  timeBasedGreeting: string;
  welcomeMessage: string;
} => {
  const greetingPair = generateTimeBasedGreeting(hour);

  return {
    timeBasedGreeting: greetingPair.greeting,
    welcomeMessage: generateWelcomeMessage(userEmail, greetingPair),
  };
};

// Export pools for testing purposes
export const GREETING_POOLS = {
  morning: MORNING_GREETINGS,
  afternoon: AFTERNOON_GREETINGS,
  evening: EVENING_GREETINGS,
};
