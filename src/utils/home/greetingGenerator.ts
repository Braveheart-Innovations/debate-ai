import { HOME_CONSTANTS } from '../../config/homeConstants';

/**
 * Screen categories for context-specific greetings
 */
export type ScreenCategory = 'home' | 'debate' | 'compare' | 'create' | 'history';

/**
 * Time periods for greeting selection
 */
export type TimePeriod = 'late_night' | 'morning' | 'afternoon' | 'evening';

/**
 * Greeting pair structure - each greeting has a matching subtitle
 */
export interface GreetingPair {
  greeting: string;
  subtitle: string;
}

// ============================================================================
// HOME SCREEN GREETINGS
// ============================================================================

const HOME_LATE_NIGHT_GREETINGS: GreetingPair[] = [
  // Existential
  { greeting: 'The void called', subtitle: 'You answered' },
  { greeting: 'Nothing matters', subtitle: 'Which is oddly freeing' },
  { greeting: 'We\'re all just atoms', subtitle: 'Anxious, caffeinated atoms' },
  { greeting: 'Time is an illusion', subtitle: 'Especially right now' },
  { greeting: 'The universe is indifferent', subtitle: 'But we\'re not. Somehow.' },
  { greeting: 'Existence is exhausting', subtitle: 'And yet here we are' },
  { greeting: 'The silence is deafening', subtitle: 'Fill it with questions' },
  { greeting: 'Staring into the abyss', subtitle: 'It\'s staring back' },
  { greeting: 'Everything is temporary', subtitle: 'Including this feeling' },
  { greeting: 'We\'re all alone', subtitle: 'Together, technically' },

  // Self-deprecating
  { greeting: 'Bad decisions: loading', subtitle: 'You\'re in good company' },
  { greeting: 'Sleep? Never heard of it', subtitle: 'Neither have we' },
  { greeting: 'This is fine', subtitle: 'Everything is fine' },
  { greeting: 'Questionable life choices', subtitle: 'We support them all' },
  { greeting: 'You should be asleep', subtitle: 'So should we' },
  { greeting: 'Another night of this', subtitle: 'We\'re not judging' },
  { greeting: 'Your sleep schedule is broken', subtitle: 'Welcome to the club' },
  { greeting: 'This isn\'t healthy', subtitle: 'But neither is anything' },
  { greeting: 'You\'ll regret this tomorrow', subtitle: 'Future you\'s problem' },
  { greeting: 'Making poor choices', subtitle: 'At least you\'re consistent' },

  // Ironic
  { greeting: 'Peak productivity hours', subtitle: 'Obviously' },
  { greeting: 'Totally normal behavior', subtitle: 'Don\'t let anyone tell you otherwise' },
  { greeting: 'Living your best life', subtitle: 'At 3 AM. As one does.' },
  { greeting: 'Well-adjusted human', subtitle: 'Clearly' },
  { greeting: 'Healthy sleep schedule', subtitle: 'What\'s that?' },
];

const HOME_MORNING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Oh, you\'re awake', subtitle: 'Condolences' },
  { greeting: 'Another day, another existential crisis', subtitle: 'Let\'s go' },
  { greeting: 'Coffee hasn\'t kicked in', subtitle: 'We can tell' },
  { greeting: 'Adulting: attempt #???', subtitle: 'We\'ve lost count too' },
  { greeting: 'You made it to morning', subtitle: 'That\'s the whole achievement' },
  { greeting: 'Pretending to be functional', subtitle: 'Same here' },
  { greeting: 'Not a morning person', subtitle: 'Noted' },
  { greeting: 'Already tired', subtitle: 'The day just started' },
  { greeting: 'Running on empty', subtitle: 'As usual' },
  { greeting: 'Barely conscious', subtitle: 'Good enough' },

  // Existential
  { greeting: 'The simulation continues', subtitle: 'Please enjoy your stay' },
  { greeting: 'Consciousness: rebooted', subtitle: 'Terms and conditions apply' },
  { greeting: 'You exist', subtitle: 'Make of that what you will' },
  { greeting: 'Another spin around the sun', subtitle: 'Whether you wanted it or not' },
  { greeting: 'Entropy increases', subtitle: 'But so does caffeine intake' },
  { greeting: 'The absurdity continues', subtitle: 'Embrace it or don\'t' },
  { greeting: 'Reality resumes', subtitle: 'Unfortunately' },
  { greeting: 'The dream is over', subtitle: 'Back to whatever this is' },
  { greeting: 'Another chance to exist', subtitle: 'Use it however' },
  { greeting: 'The wheel keeps turning', subtitle: 'You\'re still on it' },

  // Ironic
  { greeting: 'Bright-eyed and bushy-tailed', subtitle: 'Or at least vertical' },
  { greeting: 'Ready to conquer the world', subtitle: 'After coffee. Maybe.' },
  { greeting: 'Living the dream', subtitle: 'The dream is confusing' },
  { greeting: 'Rise and shine', subtitle: 'Or just rise. Shining is optional.' },
  { greeting: 'A brand new day', subtitle: 'Same old everything else' },
];

const HOME_AFTERNOON_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Productivity: questionable', subtitle: 'But we\'re here' },
  { greeting: 'Still pretending to work', subtitle: 'Impressive commitment' },
  { greeting: 'Lunch coma survivor', subtitle: 'Barely' },
  { greeting: 'Afternoon slump solidarity', subtitle: 'We feel you' },
  { greeting: 'Halfway through the lie', subtitle: 'That today would be productive' },
  { greeting: 'Procrastination station', subtitle: 'All aboard' },
  { greeting: 'Running out of steam', subtitle: 'There wasn\'t much to begin with' },
  { greeting: 'Focus levels: critical', subtitle: 'Not the good kind of critical' },
  { greeting: 'Motivation has left the building', subtitle: 'It sends its regards' },
  { greeting: 'The afternoon struggle', subtitle: 'You\'re not alone' },

  // Existential
  { greeting: 'Time continues to pass', subtitle: 'Weird how it does that' },
  { greeting: 'We\'re all just winging it', subtitle: 'The AIs included' },
  { greeting: 'Meaning is what you make it', subtitle: 'No pressure' },
  { greeting: 'The afternoon void', subtitle: 'Stare into it. It\'s fine.' },
  { greeting: 'Existence persists', subtitle: 'Despite everything' },
  { greeting: 'Another hour closer to entropy', subtitle: 'Cheerful thought' },
  { greeting: 'The day drags on', subtitle: 'As days do' },
  { greeting: 'Is this all there is?', subtitle: 'For now, yes' },
  { greeting: 'Life continues', subtitle: 'Whether you\'re ready or not' },
  { greeting: 'The present moment', subtitle: 'It\'s fine. It\'s fine.' },

  // Ironic
  { greeting: 'Peak performance', subtitle: 'If we squint' },
  { greeting: 'Crushing it', subtitle: 'Loosely defined' },
  { greeting: 'Very important business', subtitle: 'This. Right here.' },
  { greeting: 'Absolutely essential', subtitle: 'This conversation' },
  { greeting: 'Maximum efficiency', subtitle: 'Citation needed' },
];

const HOME_EVENING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'You survived another day', subtitle: 'Achievement unlocked' },
  { greeting: 'Day\'s almost over', subtitle: 'You made it. Somehow.' },
  { greeting: 'Responsibilities: avoided', subtitle: 'Successfully' },
  { greeting: 'Too tired to function', subtitle: 'Functioning anyway' },
  { greeting: 'Work is over', subtitle: 'The existential dread remains' },
  { greeting: 'Evening mode: activated', subtitle: 'Standards: lowered' },
  { greeting: 'Running on fumes', subtitle: 'The fumes are also tired' },
  { greeting: 'Brain is offline', subtitle: 'Proceeding regardless' },
  { greeting: 'Energy levels: depleted', subtitle: 'Refill pending' },
  { greeting: 'The day won', subtitle: 'But tomorrow is a rematch' },

  // Existential
  { greeting: 'Another day in the books', subtitle: 'The books are concerning' },
  { greeting: 'The sun sets', subtitle: 'As it does. Relentlessly.' },
  { greeting: 'Night approaches', subtitle: 'With its questions' },
  { greeting: 'Darkness falls', subtitle: 'Metaphorically. Mostly.' },
  { greeting: 'The day ends', subtitle: 'The thoughts begin' },
  { greeting: 'Time for reflection', subtitle: 'Or avoidance. Your call.' },
  { greeting: 'The quiet before the quiet', subtitle: 'It\'s quiet all the way down' },
  { greeting: 'Another day processed', subtitle: 'Filed under "survived"' },
  { greeting: 'Evening existentialism', subtitle: 'Right on schedule' },
  { greeting: 'The void is calling', subtitle: 'Let it go to voicemail' },

  // Ironic
  { greeting: 'Winding down', subtitle: 'Or winding up. Hard to tell.' },
  { greeting: 'Relaxing evening', subtitle: 'Anxiety? What anxiety?' },
  { greeting: 'Well-deserved rest approaching', subtitle: 'After this. Maybe.' },
  { greeting: 'Totally going to bed soon', subtitle: 'Sure you are' },
  { greeting: 'Quality me-time', subtitle: 'With an AI. Technically.' },
];

// ============================================================================
// DEBATE SCREEN GREETINGS
// ============================================================================

const DEBATE_LATE_NIGHT_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Arguing at 3 AM', subtitle: 'As one does' },
  { greeting: 'This is a healthy use of time', subtitle: 'Definitely' },
  { greeting: 'Your sleep schedule died for this', subtitle: 'Worth it? Maybe.' },
  { greeting: 'Night owls unite', subtitle: 'In pointless arguments' },
  { greeting: 'Another late night debate', subtitle: 'We\'ve stopped counting' },
  { greeting: 'This could wait until morning', subtitle: 'But here we are' },
  { greeting: 'Sacrificing sleep for opinions', subtitle: 'The usual trade' },
  { greeting: 'Your circadian rhythm hates this', subtitle: 'Join the club' },

  // Existential
  { greeting: 'The darkness brings clarity', subtitle: 'Or delusion. Fine line.' },
  { greeting: 'Night thoughts need airing', subtitle: 'The AIs are ready' },
  { greeting: 'Everyone\'s asleep', subtitle: 'Perfect time to question everything' },
  { greeting: 'The quiet hours', subtitle: 'Fill them with conflict' },
  { greeting: 'Late night, big questions', subtitle: 'Answers optional' },
  { greeting: 'The world is silent', subtitle: 'Your opinions are not' },
  { greeting: '3 AM clarity', subtitle: 'Or 3 AM delusion' },
  { greeting: 'The night has no answers', subtitle: 'But we have debates' },

  // Ironic
  { greeting: 'Sleep is for people without opinions', subtitle: 'You have opinions' },
  { greeting: 'Completely rational hour', subtitle: 'For completely rational debate' },
  { greeting: 'Peak intellectual hours', subtitle: 'Definitely not delirium' },
  { greeting: 'Well-rested and ready', subtitle: 'One of those is true' },
  { greeting: 'The optimal time for hot takes', subtitle: 'According to no one' },
  { greeting: 'Sound judgment hours', subtitle: 'At 3 AM' },
  { greeting: 'Clear-headed discourse', subtitle: 'After zero sleep' },
  { greeting: 'Definitely your best ideas', subtitle: 'Definitely' },
  { greeting: 'Nothing you\'ll regret', subtitle: 'Surely' },
];

const DEBATE_MORNING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Ready to be wrong?', subtitle: 'The AIs certainly are' },
  { greeting: 'Arguing before breakfast', subtitle: 'Bold strategy' },
  { greeting: 'Pre-coffee arguments', subtitle: 'Dangerously unfiltered' },
  { greeting: 'Too early for this', subtitle: 'And yet' },
  { greeting: 'Brain not fully online', subtitle: 'Debating anyway' },
  { greeting: 'Morning crankiness: channeled', subtitle: 'Into discourse' },
  { greeting: 'Not awake enough for nuance', subtitle: 'Perfect for debate' },
  { greeting: 'Barely conscious confrontation', subtitle: 'A specialty' },

  // Existential
  { greeting: 'Another day of being wrong', subtitle: 'About something' },
  { greeting: 'Fresh arguments, same uncertainty', subtitle: 'The human condition' },
  { greeting: 'Morning brings no clarity', subtitle: 'Only opinions' },
  { greeting: 'The sun rises on our ignorance', subtitle: 'As it does' },
  { greeting: 'New day, same disagreements', subtitle: 'The cycle continues' },
  { greeting: 'Consciousness brings conflict', subtitle: 'That\'s just how it is' },
  { greeting: 'Dawn of more questions', subtitle: 'Fewer answers' },
  { greeting: 'Waking up to argue', subtitle: 'The human experience' },

  // Ironic
  { greeting: 'Fresh arguments, stale positions', subtitle: 'Let\'s see what happens' },
  { greeting: 'Morning rage: channeled productively', subtitle: 'Allegedly' },
  { greeting: 'The AIs woke up ready to fight', subtitle: 'Intellectually speaking' },
  { greeting: 'Alert and argumentative', subtitle: 'Peak morning energy' },
  { greeting: 'Good morning, contrarian', subtitle: 'We expected you' },
  { greeting: 'Rise and disagree', subtitle: 'The natural order' },
  { greeting: 'Optimism meets hot takes', subtitle: 'Optimism loses' },
  { greeting: 'Sunshine and spite', subtitle: 'A perfect morning' },
  { greeting: 'Ready to learn nothing', subtitle: 'While arguing everything' },
];

const DEBATE_AFTERNOON_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Post-lunch confrontation', subtitle: 'Carb-fueled courage' },
  { greeting: 'Avoiding real work', subtitle: 'Through intellectual combat' },
  { greeting: 'The food coma wants peace', subtitle: 'You want arguments' },
  { greeting: 'Procrastinating productively', subtitle: 'Through debate' },
  { greeting: 'This counts as work', subtitle: 'If you squint' },
  { greeting: 'Arguing instead of napping', subtitle: 'Questionable choice' },
  { greeting: 'Productivity theater', subtitle: 'Debate edition' },
  { greeting: 'Looking busy', subtitle: 'By watching AIs fight' },

  // Existential
  { greeting: 'Afternoon existential crisis', subtitle: 'Debate it out' },
  { greeting: 'The midday void', subtitle: 'Fill it with arguments' },
  { greeting: 'What are we even doing?', subtitle: 'Debating, apparently' },
  { greeting: 'The meaning of the afternoon', subtitle: 'Still unclear' },
  { greeting: 'Time passes either way', subtitle: 'Might as well argue' },
  { greeting: 'The sun doesn\'t care', subtitle: 'But the AIs do' },
  { greeting: 'Afternoon malaise', subtitle: 'Meet afternoon discourse' },
  { greeting: 'Seeking purpose', subtitle: 'Finding debate' },

  // Ironic
  { greeting: 'Peak disagreement hours', subtitle: 'According to science. Probably.' },
  { greeting: 'Prime arguing conditions', subtitle: 'Slightly drowsy, very opinionated' },
  { greeting: 'Optimal conflict time', subtitle: 'The research is in' },
  { greeting: 'Siesta? No. Debate.', subtitle: 'Obviously' },
  { greeting: 'The civilized hours', subtitle: 'For uncivilized debates' },
  { greeting: 'Post-lunch wisdom', subtitle: 'Or post-lunch aggression' },
  { greeting: 'Afternoon enlightenment', subtitle: 'Through conflict' },
  { greeting: 'Very mature discourse', subtitle: 'Coming right up' },
  { greeting: 'Totally objective right now', subtitle: 'Sugar crash notwithstanding' },
];

const DEBATE_EVENING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Day\'s over, gloves off', subtitle: 'Finally' },
  { greeting: 'Too tired for politeness', subtitle: 'Perfect for debate' },
  { greeting: 'Evening filter: disabled', subtitle: 'Proceed with caution' },
  { greeting: 'All pretense of objectivity', subtitle: 'Gone' },
  { greeting: 'The day defeated you', subtitle: 'Take it out on ideas' },
  { greeting: 'Exhausted but combative', subtitle: 'The winning combination' },
  { greeting: 'Energy for life: zero', subtitle: 'Energy for arguing: unlimited' },
  { greeting: 'Post-work irritability', subtitle: 'Put to good use' },

  // Existential
  { greeting: 'The night is young', subtitle: 'Your arguments are tired' },
  { greeting: 'Darkness falls, questions rise', subtitle: 'As always' },
  { greeting: 'Evening brings no resolution', subtitle: 'Only more debate' },
  { greeting: 'The day ends unresolved', subtitle: 'Add more conflict' },
  { greeting: 'Twilight uncertainty', subtitle: 'Time to argue about it' },
  { greeting: 'The sun sets on agreement', subtitle: 'Never had it anyway' },
  { greeting: 'Night approaches with questions', subtitle: 'And we have AIs' },
  { greeting: 'Another evening of doubt', subtitle: 'Debate it away' },

  // Ironic
  { greeting: 'Post-work rage: redirected', subtitle: 'Toward healthy discourse' },
  { greeting: 'Wine optional, opinions mandatory', subtitle: 'House rules' },
  { greeting: 'Evening entertainment', subtitle: 'Watching AIs disagree' },
  { greeting: 'Totally unwinding', subtitle: 'Through conflict' },
  { greeting: 'Relaxing evening debate', subtitle: 'An oxymoron' },
  { greeting: 'This is what evenings are for', subtitle: 'Apparently' },
  { greeting: 'Dinner and a fight', subtitle: 'Intellectual one' },
  { greeting: 'Perfect way to end the day', subtitle: 'More arguments' },
  { greeting: 'Evening calm', subtitle: 'Interrupted by hot takes' },
];

// ============================================================================
// COMPARE SCREEN GREETINGS
// ============================================================================

const COMPARE_LATE_NIGHT_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Judging AIs at 3 AM', subtitle: 'Normal behavior' },
  { greeting: 'Sleep or compare robots', subtitle: 'You chose' },
  { greeting: 'Your standards are as tired as you', subtitle: 'Perfect' },
  { greeting: 'Late night quality control', subtitle: 'Quality questionable' },
  { greeting: 'Optimal evaluation conditions', subtitle: 'Exhausted and skeptical' },
  { greeting: 'Night shift AI auditor', subtitle: 'Unpaid, unfortunately' },
  { greeting: 'Too tired to be fooled', subtitle: 'Or too tired to notice' },
  { greeting: 'Comparing robots while barely conscious', subtitle: 'Science!' },

  // Existential
  { greeting: 'Which AI disappoints least?', subtitle: 'The eternal question' },
  { greeting: 'Seeking truth at 3 AM', subtitle: 'From machines' },
  { greeting: 'In the dark, all AIs are equal', subtitle: 'Equally confusing' },
  { greeting: 'The night reveals nothing', subtitle: 'Let\'s compare anyway' },
  { greeting: 'Who\'s less wrong?', subtitle: 'The real question' },
  { greeting: 'Searching for answers', subtitle: 'Finding more questions' },
  { greeting: 'The void has opinions', subtitle: 'So do the AIs' },
  { greeting: 'Truth is elusive', subtitle: 'AI responses are here' },

  // Ironic
  { greeting: 'Spot the difference', subtitle: 'They\'re both wrong differently' },
  { greeting: 'Peak objectivity hours', subtitle: 'At 3 AM' },
  { greeting: 'Very scientific approach', subtitle: 'Sleep-deprived and judgmental' },
  { greeting: 'Rigorous methodology', subtitle: 'Vibes-based' },
  { greeting: 'The 3 AM peer review', subtitle: 'Peers are asleep' },
  { greeting: 'Unbiased comparison', subtitle: 'By someone who needs sleep' },
  { greeting: 'Critical analysis', subtitle: 'Critically tired' },
  { greeting: 'Fair and balanced', subtitle: 'Delirious, but fair' },
  { greeting: 'Scholarly evaluation', subtitle: 'In pajamas' },
];

const COMPARE_MORNING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Judging AIs before coffee', subtitle: 'Brave' },
  { greeting: 'Morning skepticism activated', subtitle: 'Naturally occurring' },
  { greeting: 'Too early for trust', subtitle: 'Perfect for comparison' },
  { greeting: 'Pre-caffeine criticism', subtitle: 'The harshest kind' },
  { greeting: 'Barely awake, very judgmental', subtitle: 'The morning special' },
  { greeting: 'Your expectations are low', subtitle: 'They should be' },
  { greeting: 'Morning grumpiness: weaponized', subtitle: 'Against AIs' },
  { greeting: 'Fresh eyes, fresh disappointment', subtitle: 'Potentially' },

  // Existential
  { greeting: 'Which AI lies best?', subtitle: 'They all try' },
  { greeting: 'Morning brings no truth', subtitle: 'Only comparisons' },
  { greeting: 'Seeking clarity in confusion', subtitle: 'From two confused AIs' },
  { greeting: 'The sun reveals nothing', subtitle: 'Neither do these AIs' },
  { greeting: 'Another day of uncertainty', subtitle: 'Compare it' },
  { greeting: 'Who knows anything?', subtitle: 'Let\'s find out' },
  { greeting: 'Reality is negotiable', subtitle: 'So are AI responses' },
  { greeting: 'Truth: still pending', subtitle: 'AI responses: here' },

  // Ironic
  { greeting: 'Morning! Let\'s judge some AIs', subtitle: 'Responsibly, of course' },
  { greeting: 'Fresh eyes on AI lies', subtitle: 'That\'s aggressive. But fair.' },
  { greeting: 'The morning audit', subtitle: 'AIs hate this one trick' },
  { greeting: 'Objective morning brain', subtitle: 'Allegedly' },
  { greeting: 'Unbiased evaluation incoming', subtitle: 'Sure' },
  { greeting: 'Fair comparison ahead', subtitle: 'With morning irritability' },
  { greeting: 'Rational analysis time', subtitle: 'Before the coffee kicks in' },
  { greeting: 'Scientific method: engaged', subtitle: 'Sort of' },
  { greeting: 'Very fair, very balanced', subtitle: 'Very tired' },
];

const COMPARE_AFTERNOON_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Post-lunch tribunal', subtitle: 'The AIs are on trial' },
  { greeting: 'Sleepy but judgmental', subtitle: 'The afternoon mood' },
  { greeting: 'Sugar crash skepticism', subtitle: 'Very effective' },
  { greeting: 'Avoiding work by comparing AIs', subtitle: 'Productive' },
  { greeting: 'The afternoon critic', subtitle: 'Tired but relentless' },
  { greeting: 'Carb coma clarity', subtitle: 'Or lack thereof' },
  { greeting: 'Mid-afternoon suspicion', subtitle: 'Of everything' },
  { greeting: 'Your attention span is short', subtitle: 'So is this comparison' },

  // Existential
  { greeting: 'Which AI disappoints less?', subtitle: 'The afternoon question' },
  { greeting: 'Seeking answers in silicon', subtitle: 'As one does' },
  { greeting: 'The afternoon void judges', subtitle: 'So do you' },
  { greeting: 'Who\'s more confused?', subtitle: 'You or the AIs?' },
  { greeting: 'Meaning through comparison', subtitle: 'Or just comparison' },
  { greeting: 'The sun is high, expectations low', subtitle: 'Optimal conditions' },
  { greeting: 'Another afternoon of doubt', subtitle: 'Now with AI responses' },
  { greeting: 'Nothing is certain', subtitle: 'Especially AI outputs' },

  // Ironic
  { greeting: 'Prime judging hours', subtitle: 'The data supports this' },
  { greeting: 'Very professional evaluation', subtitle: 'Between snacks' },
  { greeting: 'Rigorous afternoon testing', subtitle: 'Rigorously drowsy' },
  { greeting: 'Peak analytical capacity', subtitle: 'After lunch. Obviously.' },
  { greeting: 'The siesta showdown', subtitle: 'Too interesting for naps' },
  { greeting: 'Optimal comparison conditions', subtitle: 'Subjectively speaking' },
  { greeting: 'Unbiased afternoon review', subtitle: 'Completely' },
  { greeting: 'Scientific scrutiny', subtitle: 'With snack breaks' },
  { greeting: 'Fair and balanced tribunal', subtitle: 'Powered by coffee' },
];

const COMPARE_EVENING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Evening evaluation', subtitle: 'While barely functional' },
  { greeting: 'Too tired to be fooled', subtitle: 'Maybe' },
  { greeting: 'Post-work judgment', subtitle: 'The harshest kind' },
  { greeting: 'Day\'s exhaustion, night\'s skepticism', subtitle: 'Perfect combo' },
  { greeting: 'Your patience is gone', subtitle: 'So is the AIs\' credibility' },
  { greeting: 'Evening critic mode', subtitle: 'Engaged by default' },
  { greeting: 'Tired eyes, sharp judgment', subtitle: 'Or tired judgment' },
  { greeting: 'End of day, end of tolerance', subtitle: 'For AI nonsense' },

  // Existential
  { greeting: 'The twilight trial', subtitle: 'Truth remains elusive' },
  { greeting: 'Evening brings no answers', subtitle: 'Only comparisons' },
  { greeting: 'Darkness and doubt', subtitle: 'Plus two AI responses' },
  { greeting: 'The night questions everything', subtitle: 'So should you' },
  { greeting: 'Who knows what\'s true?', subtitle: 'Not these AIs' },
  { greeting: 'Sunset on certainty', subtitle: 'As usual' },
  { greeting: 'Evening uncertainty', subtitle: 'Now with data' },
  { greeting: 'The void has no preference', subtitle: 'But you might' },

  // Ironic
  { greeting: 'Totally objective at this hour', subtitle: 'Absolutely' },
  { greeting: 'Evening enlightenment', subtitle: 'Through AI comparison' },
  { greeting: 'The dusk duel', subtitle: 'Both AIs lose somehow' },
  { greeting: 'Fair evening evaluation', subtitle: 'If squinting counts' },
  { greeting: 'Unbiased comparison incoming', subtitle: 'Trust us' },
  { greeting: 'Prime evaluation hours', subtitle: 'Exhaustion = wisdom' },
  { greeting: 'The evening tribunal convenes', subtitle: 'Verdicts: arbitrary' },
  { greeting: 'Rational analysis', subtitle: 'After a long day' },
  { greeting: 'Clear-headed judgment', subtitle: 'Crystal clear' },
];

// ============================================================================
// CREATE SCREEN GREETINGS
// ============================================================================

const CREATE_LATE_NIGHT_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Creating at 3 AM', subtitle: 'No one will know' },
  { greeting: 'Insomnia meets creativity', subtitle: 'Results may vary' },
  { greeting: 'This will look different in daylight', subtitle: 'Probably worse' },
  { greeting: 'Sleep-deprived genius', subtitle: 'Or just sleep-deprived' },
  { greeting: 'Your taste is compromised', subtitle: 'Proceed anyway' },
  { greeting: 'Night brain has ideas', subtitle: 'Morning brain will judge' },
  { greeting: '3 AM masterpiece incoming', subtitle: 'Masterpiece is generous' },
  { greeting: 'Creating instead of sleeping', subtitle: 'Classic' },

  // Existential
  { greeting: 'The void wants art', subtitle: 'Give the void what it wants' },
  { greeting: 'Creating in the darkness', subtitle: 'Metaphorically apt' },
  { greeting: 'What is art anyway?', subtitle: 'We\'ll find out' },
  { greeting: 'Existence through creation', subtitle: 'Or just creation' },
  { greeting: 'The night inspires', subtitle: 'Whether you want it to or not' },
  { greeting: 'Making something from nothing', subtitle: 'Like the universe did' },
  { greeting: 'Temporary art for a temporary existence', subtitle: 'Deep thoughts at 3 AM' },
  { greeting: 'Creating meaning', subtitle: 'Or pixels. Same thing.' },

  // Ironic
  { greeting: 'Peak creative hours', subtitle: 'Obviously' },
  { greeting: 'Optimal artistic conditions', subtitle: 'Exhausted and delusional' },
  { greeting: 'When the best ideas happen', subtitle: 'According to no one' },
  { greeting: 'Clear creative vision', subtitle: 'At 3 AM' },
  { greeting: 'Your best work ahead', subtitle: 'Surely' },
  { greeting: 'Inspiration strikes', subtitle: 'Or is that exhaustion?' },
  { greeting: 'The muse appears', subtitle: 'She\'s also tired' },
  { greeting: 'Artistic clarity', subtitle: 'Through sleep deprivation' },
  { greeting: 'Nothing you\'ll regret', subtitle: 'Everything you\'ll keep' },
];

const CREATE_MORNING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Make something before reality kicks in', subtitle: 'Quick!' },
  { greeting: 'Morning creativity', subtitle: 'Before the day ruins it' },
  { greeting: 'Brain barely on, creating anyway', subtitle: 'How hard can it be?' },
  { greeting: 'Pre-coffee art', subtitle: 'Bold' },
  { greeting: 'Your artistic vision is foggy', subtitle: 'Like your brain' },
  { greeting: 'Morning masterpiece', subtitle: 'Or morning attempt' },
  { greeting: 'Create before doubt sets in', subtitle: 'It will' },
  { greeting: 'Half-awake creativity', subtitle: 'Full commitment' },

  // Existential
  { greeting: 'Another day to create', subtitle: 'Whether it matters or not' },
  { greeting: 'Making something exist', subtitle: 'That\'s already a lot' },
  { greeting: 'Art in an indifferent universe', subtitle: 'Still art' },
  { greeting: 'Creating meaning, or just images', subtitle: 'Same thing maybe' },
  { greeting: 'The morning canvas', subtitle: 'Exists for no reason' },
  { greeting: 'Pixels in the void', subtitle: 'Your pixels specifically' },
  { greeting: 'Why create?', subtitle: 'Why not?' },
  { greeting: 'Existence through creation', subtitle: 'The morning edition' },

  // Ironic
  { greeting: 'Artistic genius incoming', subtitle: 'Probably' },
  { greeting: 'Today\'s the day', subtitle: 'For something' },
  { greeting: 'Peak creative conditions', subtitle: 'Grogginess and all' },
  { greeting: 'The morning muse', subtitle: 'Running late as usual' },
  { greeting: 'Inspiration awaits', subtitle: 'Or coffee. Coffee first.' },
  { greeting: 'Your best work yet', subtitle: 'Low bar, but still' },
  { greeting: 'Art before adulting', subtitle: 'Priorities' },
  { greeting: 'Creative energy', subtitle: 'Borrowed from tomorrow' },
  { greeting: 'Fresh ideas', subtitle: 'Fresh-ish' },
];

const CREATE_AFTERNOON_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Post-lunch creativity', subtitle: 'Carbs as fuel' },
  { greeting: 'Procrastination as art', subtitle: 'You\'re doing great' },
  { greeting: 'Avoiding work through creation', subtitle: 'Very productive' },
  { greeting: 'The afternoon creative slump', subtitle: 'Create through it' },
  { greeting: 'Your focus is questionable', subtitle: 'Your art doesn\'t care' },
  { greeting: 'Creating instead of napping', subtitle: 'Debatable choice' },
  { greeting: 'Distracted creativity', subtitle: 'Still counts' },
  { greeting: 'Half-hearted art time', subtitle: 'Full-hearted pixels' },

  // Existential
  { greeting: 'Creating in the void', subtitle: 'The afternoon void' },
  { greeting: 'Art means nothing', subtitle: 'Which means it can mean anything' },
  { greeting: 'Making things exist', subtitle: 'In a universe that doesn\'t care' },
  { greeting: 'The afternoon canvas', subtitle: 'Blank and waiting' },
  { greeting: 'Why are we here?', subtitle: 'To make stuff, apparently' },
  { greeting: 'Pixels in the cosmic sense', subtitle: 'Still pixels' },
  { greeting: 'Temporary art', subtitle: 'Like everything' },
  { greeting: 'Creating for no reason', subtitle: 'The best reason' },

  // Ironic
  { greeting: 'Peak creative hours', subtitle: 'If you believe that' },
  { greeting: 'Artistic excellence incoming', subtitle: 'Any minute now' },
  { greeting: 'Optimal creative conditions', subtitle: 'Post-lunch drowsiness' },
  { greeting: 'The afternoon muse', subtitle: 'Fashionably late' },
  { greeting: 'Inspiration strikes', subtitle: 'Or that\'s the sugar crash' },
  { greeting: 'Your best work awaits', subtitle: 'It\'s very patient' },
  { greeting: 'Very productive session ahead', subtitle: 'Definitely' },
  { greeting: 'Focused creation time', subtitle: 'Focus sold separately' },
  { greeting: 'Professional art mode', subtitle: 'Professional-ish' },
];

const CREATE_EVENING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Evening creativity', subtitle: 'Day\'s filter disabled' },
  { greeting: 'Too tired to doubt yourself', subtitle: 'Perfect for art' },
  { greeting: 'Post-work creation', subtitle: 'Work? What work?' },
  { greeting: 'Your standards are lowered', subtitle: 'Creativity flows' },
  { greeting: 'Evening art therapy', subtitle: 'Self-prescribed' },
  { greeting: 'Brain is done, hands aren\'t', subtitle: 'Let\'s go' },
  { greeting: 'The day is over', subtitle: 'The creating isn\'t' },
  { greeting: 'Exhausted creativity', subtitle: 'Still creativity' },

  // Existential
  { greeting: 'Creating in the twilight', subtitle: 'Metaphor intended' },
  { greeting: 'Evening art for an uncaring universe', subtitle: 'Still art' },
  { greeting: 'Making things exist before sleep', subtitle: 'Full day' },
  { greeting: 'Pixels as legacy', subtitle: 'Temporary but real' },
  { greeting: 'Art before the void', subtitle: 'Tonight\'s void specifically' },
  { greeting: 'Creation against entropy', subtitle: 'Entropy wins eventually' },
  { greeting: 'The evening canvas', subtitle: 'Indifferent but available' },
  { greeting: 'Why not create?', subtitle: 'No good reason not to' },

  // Ironic
  { greeting: 'Evening genius mode', subtitle: 'Or evening fatigue mode' },
  { greeting: 'Peak creative time', subtitle: 'After everything else' },
  { greeting: 'The evening muse arrives', subtitle: 'Late as usual' },
  { greeting: 'Fresh ideas', subtitle: 'Fresh is relative' },
  { greeting: 'Your best work yet', subtitle: 'By process of elimination' },
  { greeting: 'Optimal conditions', subtitle: 'Tired and opinionated' },
  { greeting: 'Artistic clarity', subtitle: 'Or evening delirium' },
  { greeting: 'Very intentional art', subtitle: 'Mostly' },
  { greeting: 'Professional creation time', subtitle: 'Unprofessionally tired' },
];

// ============================================================================
// HISTORY SCREEN GREETINGS
// ============================================================================

const HISTORY_LATE_NIGHT_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Revisiting past mistakes', subtitle: 'The 3 AM tradition' },
  { greeting: 'What were you thinking?', subtitle: 'Let\'s find out together' },
  { greeting: 'Memory lane at 3 AM', subtitle: 'A scenic route to regret' },
  { greeting: 'Judging past-you', subtitle: 'Harshly' },
  { greeting: 'Your past questions', subtitle: 'Were they good? Probably not.' },
  { greeting: 'Late night self-reflection', subtitle: 'Through chat logs' },
  { greeting: 'The cringe archives', subtitle: 'Proceed with caution' },
  { greeting: 'Reading old conversations', subtitle: 'No one made you do this' },

  // Existential
  { greeting: 'The archive never sleeps', subtitle: 'Neither do you, apparently' },
  { greeting: 'Past-you had questions', subtitle: 'Present-you has more' },
  { greeting: 'The night remembers everything', subtitle: 'So does this app' },
  { greeting: 'What were we seeking?', subtitle: 'Scroll to find out' },
  { greeting: 'Memory is a strange thing', subtitle: 'So is chat history' },
  { greeting: 'The past is frozen here', subtitle: 'In uncomfortable detail' },
  { greeting: 'Time passes, logs remain', subtitle: 'Eternally' },
  { greeting: 'Digital memories at 3 AM', subtitle: 'A modern condition' },

  // Ironic
  { greeting: 'Peak reflection hours', subtitle: 'Definitely not overthinking' },
  { greeting: 'Healthy activity at 3 AM', subtitle: 'Reviewing old chats' },
  { greeting: 'Well-adjusted behavior', subtitle: 'Nothing concerning here' },
  { greeting: 'The optimal time for nostalgia', subtitle: 'Sleepless and vulnerable' },
  { greeting: 'Definitely won\'t regret this', subtitle: 'The reading, not the sleeping' },
  { greeting: 'Very normal thing to do', subtitle: 'At this hour' },
  { greeting: 'Productive use of insomnia', subtitle: 'Questionably' },
  { greeting: 'Self-improvement time', subtitle: 'Through cringing' },
  { greeting: 'No emotional damage ahead', subtitle: 'Surely' },
];

const HISTORY_MORNING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Morning! Remember yesterday?', subtitle: 'Neither do we fully' },
  { greeting: 'Fresh perspective on past failures', subtitle: 'Refreshing' },
  { greeting: 'Judging yesterday-you', subtitle: 'From today\'s ivory tower' },
  { greeting: 'What did past-you need?', subtitle: 'Probably more sleep' },
  { greeting: 'The morning archive', subtitle: 'Open for self-criticism' },
  { greeting: 'Reviewing the evidence', subtitle: 'Against yourself' },
  { greeting: 'Yesterday\'s questions, today\'s judgment', subtitle: 'Harsh' },
  { greeting: 'Coffee and regret', subtitle: 'The breakfast combo' },

  // Existential
  { greeting: 'The past is preserved here', subtitle: 'Whether you like it or not' },
  { greeting: 'What were we thinking?', subtitle: 'The eternal question' },
  { greeting: 'Memory persists', subtitle: 'Unlike wisdom' },
  { greeting: 'The archive awaits', subtitle: 'Indifferent and complete' },
  { greeting: 'Past conversations linger', subtitle: 'Like existential dread' },
  { greeting: 'History repeats', subtitle: 'So do we, apparently' },
  { greeting: 'The record of our confusion', subtitle: 'Carefully preserved' },
  { greeting: 'Digital permanence', subtitle: 'For impermanent beings' },

  // Ironic
  { greeting: 'Rise and remember', subtitle: 'The uncomfortable parts' },
  { greeting: 'Fresh eyes on old problems', subtitle: 'Still problems' },
  { greeting: 'Morning clarity on past confusion', subtitle: 'Slightly clearer' },
  { greeting: 'Starting the day with nostalgia', subtitle: 'Healthy' },
  { greeting: 'Productive morning activity', subtitle: 'Scrolling through history' },
  { greeting: 'Very necessary review', subtitle: 'Definitely' },
  { greeting: 'Morning self-improvement', subtitle: 'Via self-criticism' },
  { greeting: 'The healthy start', subtitle: 'Reviewing past mistakes' },
  { greeting: 'Fresh day, old regrets', subtitle: 'As tradition dictates' },
];

const HISTORY_AFTERNOON_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Procrastinating via nostalgia', subtitle: 'A fine tradition' },
  { greeting: 'Avoiding present by reviewing past', subtitle: 'Classic move' },
  { greeting: 'What was that thing again?', subtitle: 'It\'s in here somewhere' },
  { greeting: 'Afternoon self-reflection', subtitle: 'Through cringing' },
  { greeting: 'Revisiting questionable queries', subtitle: 'Questionably' },
  { greeting: 'The afternoon scroll of shame', subtitle: 'Embrace it' },
  { greeting: 'Past-you was interesting', subtitle: 'Generously speaking' },
  { greeting: 'Memory check', subtitle: 'Results: concerning' },

  // Existential
  { greeting: 'Time passes, logs remain', subtitle: 'The human condition' },
  { greeting: 'What were we looking for?', subtitle: 'Still unclear' },
  { greeting: 'The archive knows all', subtitle: 'Uncomfortably so' },
  { greeting: 'Past questions, present confusion', subtitle: 'Continuous' },
  { greeting: 'Digital footprints', subtitle: 'Very visible' },
  { greeting: 'The record of our seeking', subtitle: 'And not finding' },
  { greeting: 'Memory is permanent here', subtitle: 'Unlike everywhere else' },
  { greeting: 'The afternoon archive', subtitle: 'Neutral and judging' },

  // Ironic
  { greeting: 'Very productive use of time', subtitle: 'Scrolling through history' },
  { greeting: 'This is definitely necessary', subtitle: 'To review right now' },
  { greeting: 'Important work happening', subtitle: 'In the history tab' },
  { greeting: 'Peak productivity', subtitle: 'Reading old conversations' },
  { greeting: 'Crucial afternoon activity', subtitle: 'Nostalgia browsing' },
  { greeting: 'Time well spent', subtitle: 'On past time' },
  { greeting: 'Valuable reflection period', subtitle: 'Questionably' },
  { greeting: 'The siesta alternative', subtitle: 'Reading old chats' },
  { greeting: 'Working hard', subtitle: 'On memory lane' },
];

const HISTORY_EVENING_GREETINGS: GreetingPair[] = [
  // Self-deprecating
  { greeting: 'Evening nostalgia', subtitle: 'When it hits hardest' },
  { greeting: 'Post-work self-reflection', subtitle: 'Through chat history' },
  { greeting: 'The day is over', subtitle: 'Time to review it and others' },
  { greeting: 'Too tired to do new things', subtitle: 'Perfect for reviewing old ones' },
  { greeting: 'Evening archive diving', subtitle: 'A meditation practice' },
  { greeting: 'Unwinding with past conversations', subtitle: 'Relaxing?' },
  { greeting: 'The evening scroll', subtitle: 'Of questionable benefit' },
  { greeting: 'Past-you says hello', subtitle: 'From the archive' },

  // Existential
  { greeting: 'The evening archive', subtitle: 'Permanent and indifferent' },
  { greeting: 'What did we learn?', subtitle: 'The logs will show' },
  { greeting: 'Memory as twilight', subtitle: 'Fading but there' },
  { greeting: 'Past questions, current uncertainty', subtitle: 'The cycle' },
  { greeting: 'Evening reflection on impermanence', subtitle: 'Permanently recorded' },
  { greeting: 'The record of our wandering', subtitle: 'Intellectual and otherwise' },
  { greeting: 'Digital ghosts of conversations', subtitle: 'Still haunting' },
  { greeting: 'The night remembers', subtitle: 'In chat log format' },

  // Ironic
  { greeting: 'Evening self-improvement', subtitle: 'Via self-criticism' },
  { greeting: 'Relaxing evening activity', subtitle: 'Reviewing past mistakes' },
  { greeting: 'Healthy wind-down ritual', subtitle: 'Reading old chats' },
  { greeting: 'Perfect end to the day', subtitle: 'Nostalgic cringing' },
  { greeting: 'Very therapeutic', subtitle: 'Probably' },
  { greeting: 'Evening enlightenment', subtitle: 'From past confusion' },
  { greeting: 'Peaceful reflection time', subtitle: 'Through archived anxiety' },
  { greeting: 'The calm before sleep', subtitle: 'After reviewing everything' },
  { greeting: 'Setting yourself up for rest', subtitle: 'With memories. Good plan.' },
];

// ============================================================================
// GREETING POOL SELECTOR
// ============================================================================

const getGreetingPool = (hour: number, screenCategory: ScreenCategory = 'home'): GreetingPair[] => {
  let timePeriod: TimePeriod;
  if (hour < HOME_CONSTANTS.GREETING_TIMES.LATE_NIGHT_END) {
    timePeriod = 'late_night';
  } else if (hour < HOME_CONSTANTS.GREETING_TIMES.MORNING_END) {
    timePeriod = 'morning';
  } else if (hour < HOME_CONSTANTS.GREETING_TIMES.AFTERNOON_END) {
    timePeriod = 'afternoon';
  } else {
    timePeriod = 'evening';
  }

  const pools: Record<ScreenCategory, Record<TimePeriod, GreetingPair[]>> = {
    home: {
      late_night: HOME_LATE_NIGHT_GREETINGS,
      morning: HOME_MORNING_GREETINGS,
      afternoon: HOME_AFTERNOON_GREETINGS,
      evening: HOME_EVENING_GREETINGS,
    },
    debate: {
      late_night: DEBATE_LATE_NIGHT_GREETINGS,
      morning: DEBATE_MORNING_GREETINGS,
      afternoon: DEBATE_AFTERNOON_GREETINGS,
      evening: DEBATE_EVENING_GREETINGS,
    },
    compare: {
      late_night: COMPARE_LATE_NIGHT_GREETINGS,
      morning: COMPARE_MORNING_GREETINGS,
      afternoon: COMPARE_AFTERNOON_GREETINGS,
      evening: COMPARE_EVENING_GREETINGS,
    },
    create: {
      late_night: CREATE_LATE_NIGHT_GREETINGS,
      morning: CREATE_MORNING_GREETINGS,
      afternoon: CREATE_AFTERNOON_GREETINGS,
      evening: CREATE_EVENING_GREETINGS,
    },
    history: {
      late_night: HISTORY_LATE_NIGHT_GREETINGS,
      morning: HISTORY_MORNING_GREETINGS,
      afternoon: HISTORY_AFTERNOON_GREETINGS,
      evening: HISTORY_EVENING_GREETINGS,
    },
  };

  return pools[screenCategory][timePeriod];
};

export const generateTimeBasedGreeting = (
  hour?: number,
  screenCategory: ScreenCategory = 'home'
): GreetingPair => {
  const currentHour = hour ?? new Date().getHours();
  const pool = getGreetingPool(currentHour, screenCategory);
  return pool[Math.floor(Math.random() * pool.length)];
};

export const generateWelcomeMessage = (
  _userEmail?: string,
  greetingPair?: GreetingPair
): string => {
  return greetingPair?.subtitle ?? 'Welcome back!';
};

export const generateCompleteGreeting = (
  userEmail?: string,
  hour?: number,
  screenCategory: ScreenCategory = 'home'
): {
  timeBasedGreeting: string;
  welcomeMessage: string;
} => {
  const greetingPair = generateTimeBasedGreeting(hour, screenCategory);
  return {
    timeBasedGreeting: greetingPair.greeting,
    welcomeMessage: generateWelcomeMessage(userEmail, greetingPair),
  };
};

export const getTimePeriodForHour = (hour: number): TimePeriod => {
  if (hour < HOME_CONSTANTS.GREETING_TIMES.LATE_NIGHT_END) {
    return 'late_night';
  }
  if (hour < HOME_CONSTANTS.GREETING_TIMES.MORNING_END) {
    return 'morning';
  }
  if (hour < HOME_CONSTANTS.GREETING_TIMES.AFTERNOON_END) {
    return 'afternoon';
  }
  return 'evening';
};

export const GREETING_POOLS = {
  home: {
    late_night: HOME_LATE_NIGHT_GREETINGS,
    morning: HOME_MORNING_GREETINGS,
    afternoon: HOME_AFTERNOON_GREETINGS,
    evening: HOME_EVENING_GREETINGS,
  },
  debate: {
    late_night: DEBATE_LATE_NIGHT_GREETINGS,
    morning: DEBATE_MORNING_GREETINGS,
    afternoon: DEBATE_AFTERNOON_GREETINGS,
    evening: DEBATE_EVENING_GREETINGS,
  },
  compare: {
    late_night: COMPARE_LATE_NIGHT_GREETINGS,
    morning: COMPARE_MORNING_GREETINGS,
    afternoon: COMPARE_AFTERNOON_GREETINGS,
    evening: COMPARE_EVENING_GREETINGS,
  },
  create: {
    late_night: CREATE_LATE_NIGHT_GREETINGS,
    morning: CREATE_MORNING_GREETINGS,
    afternoon: CREATE_AFTERNOON_GREETINGS,
    evening: CREATE_EVENING_GREETINGS,
  },
  history: {
    late_night: HISTORY_LATE_NIGHT_GREETINGS,
    morning: HISTORY_MORNING_GREETINGS,
    afternoon: HISTORY_AFTERNOON_GREETINGS,
    evening: HISTORY_EVENING_GREETINGS,
  },
};
