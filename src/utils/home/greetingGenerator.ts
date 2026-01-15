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
 * Mix of debate/philosophy themed and playful/witty
 */
const MORNING_GREETINGS: GreetingPair[] = [
  // Debate/Philosophy themed
  { greeting: 'Rise and debate', subtitle: 'The AIs have been warming up' },
  { greeting: 'A new day of discourse', subtitle: 'What truths shall we uncover?' },
  { greeting: 'The symposium awaits', subtitle: 'Fresh minds, fresh arguments' },
  { greeting: 'Ready to philosophize?', subtitle: 'Coffee optional, curiosity required' },
  // Playful/Witty
  { greeting: 'The machines are caffeinated', subtitle: "Let's cause some intellectual chaos" },
  { greeting: 'What shall we overthink today?', subtitle: 'The AIs are already at it' },
  { greeting: 'Morning, troublemaker', subtitle: 'The debate floor is yours' },
  { greeting: 'Rise and argue', subtitle: 'Socrates would be proud' },
];

/**
 * Afternoon greeting pool (noon to 5pm)
 * Mix of debate/philosophy themed and playful/witty
 */
const AFTERNOON_GREETINGS: GreetingPair[] = [
  // Debate/Philosophy themed
  { greeting: 'Time for a showdown', subtitle: 'The afternoon dialectic begins' },
  { greeting: "Let's settle some scores", subtitle: 'The AIs have opinions' },
  { greeting: 'The debate continues', subtitle: 'Where were we?' },
  { greeting: 'Afternoon discourse', subtitle: 'Prime arguing hours' },
  // Playful/Witty
  { greeting: 'Post-lunch philosophy', subtitle: 'Best time for bold claims' },
  { greeting: 'The AIs are restless', subtitle: "They've been waiting for you" },
  { greeting: 'Back for more?', subtitle: "We knew you couldn't resist" },
  { greeting: "Let's get controversial", subtitle: 'In a scholarly way, of course' },
];

/**
 * Evening greeting pool (5pm onwards)
 * Mix of debate/philosophy themed and playful/witty
 */
const EVENING_GREETINGS: GreetingPair[] = [
  // Debate/Philosophy themed
  { greeting: 'Evening discourse awaits', subtitle: 'The best ideas come at night' },
  { greeting: 'A nocturnal symposium', subtitle: 'When the real debates happen' },
  { greeting: 'Late-night dialectics', subtitle: "The AIs don't sleep" },
  { greeting: 'The evening session', subtitle: 'Time for the serious discussions' },
  // Playful/Witty
  { greeting: 'Burning the midnight oil?', subtitle: 'The AIs are here for it' },
  { greeting: 'Night owl mode', subtitle: 'Best time for hot takes' },
  { greeting: 'Still pondering existence?', subtitle: 'Same, honestly' },
  { greeting: 'Evening, philosopher', subtitle: "Let's get existential" },
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
