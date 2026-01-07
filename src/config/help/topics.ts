/**
 * Help Topics
 *
 * Comprehensive help content for all app features.
 * Each topic includes in-app summary content and optional
 * web URL for detailed documentation.
 */

import { HelpTopic, HelpCategory, HelpCategoryInfo } from "./types";

export const HELP_CATEGORIES: HelpCategoryInfo[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "rocket-outline",
    description: "Learn the basics of Symposium AI",
  },
  {
    id: "chat",
    title: "Chat",
    icon: "chatbubble-outline",
    description: "Chat with multiple AIs",
  },
  {
    id: "debate-arena",
    title: "AI Debate Arena",
    icon: "chatbubbles-outline",
    description: "Watch AIs debate any topic",
  },
  {
    id: "byok",
    title: "Bring Your Own Keys",
    icon: "key-outline",
    description: "Use your own API keys",
  },
  {
    id: "compare",
    title: "Compare",
    icon: "git-compare-outline",
    description: "Compare AI responses side-by-side",
  },
  {
    id: "history",
    title: "History",
    icon: "time-outline",
    description: "Manage your conversation history",
  },
  {
    id: "expert-mode",
    title: "Expert Mode",
    icon: "settings-outline",
    description: "Fine-tune AI parameters",
  },
];

export const HELP_TOPICS: Record<string, HelpTopic> = {
  // ============================================
  // DEBATE ARENA
  // ============================================
  "debate-arena": {
    id: "debate-arena",
    title: "AI Debate Arena",
    icon: "chatbubbles",
    category: "getting-started",
    shortDescription: "Watch different AIs debate any topic in real-time",
    content: `The AI Debate Arena is Symposium AI's signature feature where you can watch different AI models debate any topic you choose.

How It Works:
1. Choose a motion (preset, custom, or surprise)
2. Select two AI debaters from your configured providers
3. Pick a debate format and number of exchanges
4. Watch the debate unfold in real time

Demo vs Live:
- Demo mode plays curated, pre-recorded debates
- Start a trial or subscription to run live debates with your API keys

Each AI will present arguments, respond to their opponent, and try to make the most compelling case. You can vote on who made the better argument after the debate concludes.`,
    webUrl: "https://www.symposiumai.app/help/debate-arena",
    relatedTopics: ["debate-formats", "debate-voting", "debate-stats"],
  },

  "debate-formats": {
    id: "debate-formats",
    title: "Debate Formats",
    icon: "list",
    category: "debate-arena",
    shortDescription: "Four distinct debate styles to choose from",
    content: `Symposium AI offers four debate formats, each with a unique style:

Oxford Format:
Classic formal debate with structured opening statements, rebuttals, and closing arguments. Best for: Traditional debates on policy or ethics.

Lincoln-Douglas:
Philosophical debate focusing on values and ethics. One-on-one format emphasizing moral reasoning. Best for: Ethical dilemmas and value-based topics.

Policy Debate:
Data-driven debate with emphasis on evidence and practical solutions. Includes plan proposals and counter-plans. Best for: Current events and real-world issues.

Socratic Method:
Inquiry-based dialogue through thoughtful questions. AIs challenge each other's assumptions. Best for: Exploring complex ideas and definitions.`,
    webUrl: "https://www.symposiumai.app/help/debate-formats",
    relatedTopics: ["debate-arena", "debate-voting"],
  },

  "debate-voting": {
    id: "debate-voting",
    title: "Voting & Scoring",
    icon: "trophy",
    category: "debate-arena",
    shortDescription: "How to judge and vote on debates",
    content: `After each debate, you can vote on which AI made the more compelling argument.

Voting Criteria:
Consider these factors when deciding your vote:
- Strength of arguments presented
- Quality of evidence and reasoning
- Response to opponent's points
- Clarity and persuasiveness
- Adherence to the debate format

Your Vote Matters:
Voting helps you engage critically with the debate content and track which AIs perform best on different topics.

Debate History:
All your debates and votes are saved in your history, so you can review past debates and see patterns in AI performance.`,
    webUrl: "https://www.symposiumai.app/help/debate-voting",
    relatedTopics: ["debate-arena", "debate-transcripts"],
  },

  "debate-transcripts": {
    id: "debate-transcripts",
    title: "Debate Transcripts",
    icon: "document-text",
    category: "debate-arena",
    shortDescription: "Save and share debate transcripts",
    content: `You can export complete transcripts of any debate for reference or sharing.

Export Options:
- Share the PDF using your device share sheet
- Save the PDF to your device for later

Transcript Contents:
- Debate motion and date
- AI participants
- Full exchange in order
- Final winner and round scores (if available)`,
    webUrl: "https://www.symposiumai.app/help/debate-transcripts",
    relatedTopics: ["debate-arena", "debate-voting"],
  },

  // ============================================
  // BYOK (Bring Your Own Keys)
  // ============================================
  "byok-overview": {
    id: "byok-overview",
    title: "What is BYOK?",
    icon: "key",
    category: "getting-started",
    shortDescription: "Bring Your Own Keys explained",
    content: `BYOK (Bring Your Own Keys) lets you use your own API keys from AI providers like OpenAI, Anthropic, and Google.

Why BYOK?
Instead of paying monthly subscriptions to multiple AI services, you pay only for what you use. This can save significant money, especially if you're already subscribed to these services.

Supported Providers:
- Claude (Anthropic)
- ChatGPT (OpenAI)
- Gemini (Google)
- Nomi
- Replika
- Character.AI

Your keys are stored securely on your device and never sent to our servers.`,
    webUrl: "https://www.symposiumai.app/help/byok",
    relatedTopics: ["byok-getting-keys", "byok-security", "byok-cost-savings"],
  },

  "byok-getting-keys": {
    id: "byok-getting-keys",
    title: "Getting API Keys",
    icon: "download",
    category: "byok",
    shortDescription: "How to obtain API keys from each provider",
    content: `Each AI provider has a developer portal where you can generate API keys.

General Steps:
1. Create an account with the AI provider
2. Navigate to their API or Developer section
3. Generate a new API key
4. Copy the key (you usually can only see it once!)
5. Paste it into Symposium AI

In-App Help:
When you tap "Get Key" for any provider in the API Configuration screen, we'll open their key generation page with step-by-step guidance.

Important:
- Keep your API keys private
- Never share keys publicly
- Set spending limits in provider dashboards
- Regenerate keys if compromised`,
    webUrl: "https://www.symposiumai.app/help/getting-keys",
    relatedTopics: ["byok-overview", "byok-security"],
  },

  "byok-security": {
    id: "byok-security",
    title: "Key Security",
    icon: "shield-checkmark",
    category: "byok",
    shortDescription: "How your API keys are protected",
    content: `Your API keys are sensitive credentials that grant access to AI services. Here's how we protect them:

Local Storage Only:
Your keys are stored only on your device using secure storage. They are never transmitted to our servers.

Direct Communication:
When you chat with AIs, your device communicates directly with the AI provider's API. We don't proxy or intercept these calls.

Best Practices:
- Set spending limits in each provider's dashboard
- Regularly review your API usage
- Regenerate keys periodically
- Don't share your device unlocked with others

If You Suspect Compromise:
Immediately regenerate your API keys in the provider's dashboard and update them in Symposium AI.`,
    webUrl: "https://www.symposiumai.app/help/security",
    relatedTopics: ["byok-overview", "byok-getting-keys"],
  },

  "byok-cost-savings": {
    id: "byok-cost-savings",
    title: "Cost Savings",
    icon: "cash",
    category: "byok",
    shortDescription: "How BYOK saves you money",
    content: `BYOK can significantly reduce your AI costs compared to multiple subscriptions.

The Math:
- ChatGPT Plus: $20/month
- Claude Pro: $20/month
- Gemini Advanced: $20/month
- Total: $60/month for three services

With BYOK:
API costs are typically $0.01-0.03 per message depending on model and length. Most casual users spend $5-15/month total for access to ALL providers.

Pay-Per-Use Benefits:
- No monthly minimums
- Scale down in light months
- Access to all models from day one
- No feature restrictions based on tier

Tip: Start with the most affordable models (like GPT-4o-mini or Claude Haiku) and upgrade to higher-cost models only when needed.`,
    webUrl: "https://www.symposiumai.app/help/cost-savings",
    relatedTopics: ["byok-overview", "expert-mode"],
  },

  // ============================================
  // PERSONALITIES
  // ============================================
  personalities: {
    id: "personalities",
    title: "AI Personalities",
    icon: "people",
    category: "getting-started",
    shortDescription: "Give each AI a unique communication style",
    content: `Personalities transform how AIs communicate with you, making conversations more engaging and tailored to your preferences.

Available Personalities (8):
- Default: Use the AI as-is (no added style layer)
- Bestie: Empathetic co-pilot focused on next steps
- Brody: High-energy coach with direct, action-first advice
- Devlin: Respectful devil's advocate who stress-tests ideas
- George: Satirical mirror with sharp, PG-rated wit
- Kai: Staff engineer mindset; structured and detail-focused
- Prof. Sage: Socratic scholar; precise and citation-friendly
- Scout: Narrative strategist who uses scenes and analogies

How to Use:
1. Select an AI card
2. Tap the Personality badge
3. Choose a personality for that AI

Mix and Match:
In multi-AI chats, give each AI a different personality to see varied perspectives and communication styles on the same topic.`,
    webUrl: "https://www.symposiumai.app/help/personalities",
    relatedTopics: ["multi-ai-chat", "dynamic-ai-selector"],
  },

  // ============================================
  // EXPERT MODE
  // ============================================
  "expert-mode": {
    id: "expert-mode",
    title: "Expert Mode",
    icon: "settings",
    category: "getting-started",
    shortDescription: "Fine-tune AI behavior with advanced settings",
    content: `Expert Mode gives you control over AI model parameters, letting you customize response behavior for different use cases.

What You Can Control:
- Model selection (per provider)
- Temperature: Creativity vs consistency
- Max Tokens: Response length limits
- Top-P: Response diversity (where supported)

When to Use Expert Mode:
- Creative writing: Higher temperature for variety
- Factual queries: Lower temperature for accuracy
- Long-form content: Increase max tokens
- Quick answers: Decrease max tokens

Notes:
- Expert Mode is available once you add provider API keys
- Parameter availability varies by provider`,
    webUrl: "https://www.symposiumai.app/help/expert-mode",
    relatedTopics: ["expert-temperature", "expert-tokens", "expert-top-p"],
  },

  "expert-temperature": {
    id: "expert-temperature",
    title: "Temperature",
    icon: "thermometer",
    category: "expert-mode",
    shortDescription: "Control creativity vs consistency",
    content: `Temperature controls how "creative" or "random" the AI's responses are.

Scale: 0.0 to 2.0 (default usually 1.0)

Low Temperature (0.0-0.5):
- More focused and deterministic
- Consistent, predictable responses
- Best for: Factual questions, coding, analysis

Medium Temperature (0.5-1.0):
- Balanced creativity and coherence
- Good for: General conversation, explanations

High Temperature (1.0-2.0):
- More creative and varied
- Can be more surprising or unconventional
- Best for: Creative writing, brainstorming, storytelling

Tip: Start with the default and adjust based on results. Too high can produce nonsensical output.`,
    webUrl: "https://www.symposiumai.app/help/temperature",
    relatedTopics: ["expert-mode", "expert-tokens", "expert-top-p"],
  },

  "expert-tokens": {
    id: "expert-tokens",
    title: "Max Tokens",
    icon: "text",
    category: "expert-mode",
    shortDescription: "Control response length",
    content: `Max Tokens limits how long the AI's response can be.

What Are Tokens?
Tokens are pieces of text - roughly 4 characters or 0.75 words in English. "Hello world" is about 2 tokens.

Setting Max Tokens:
- 256 tokens: ~200 words (short answers)
- 1024 tokens: ~750 words (detailed responses)
- 4096 tokens: ~3000 words (long-form content)

Cost Implications:
More tokens = higher API costs. If you're watching spending, lower max tokens for simple queries.

When to Adjust:
- Quick Q&A: 256-512 tokens
- Explanations: 1024 tokens
- Essays/stories: 2048-4096 tokens
- Code generation: 2048+ tokens

Note: The AI may stop before reaching max tokens if it completes its thought.`,
    webUrl: "https://www.symposiumai.app/help/max-tokens",
    relatedTopics: ["expert-mode", "expert-temperature", "byok-cost-savings"],
  },

  "expert-top-p": {
    id: "expert-top-p",
    title: "Top-P (Nucleus Sampling)",
    icon: "options",
    category: "expert-mode",
    shortDescription: "Control response diversity",
    content: `Top-P (also called nucleus sampling) is an alternative way to control response randomness.

Scale: 0.0 to 1.0 (default usually 1.0)

How It Works:
Top-P limits the AI to considering only the most likely next words that together make up P probability mass.

Top-P = 0.1: Only considers the top 10% most likely words
Top-P = 0.9: Considers top 90% most likely words
Top-P = 1.0: Considers all possible words

When to Adjust:
- Lower Top-P (0.1-0.5): More focused, predictable
- Higher Top-P (0.9-1.0): More diverse, creative

Temperature vs Top-P:
Both control randomness but differently. Most users adjust temperature and leave Top-P at default. Adjusting both can produce unexpected results.

Tip: If using Top-P, consider setting temperature to 1.0 and only adjusting Top-P.`,
    webUrl: "https://www.symposiumai.app/help/top-p",
    relatedTopics: ["expert-mode", "expert-temperature"],
  },

  // ============================================
  // FEATURES
  // ============================================
  "compare-mode": {
    id: "compare-mode",
    title: "Compare Mode",
    icon: "git-compare",
    category: "getting-started",
    shortDescription: "See AI responses side-by-side",
    content: `Compare Mode lets you see how different AIs respond to the same prompt, displayed side-by-side.

How It Works:
1. Go to the Compare tab
2. Select two AIs to compare
3. Enter your prompt
4. Both AIs respond simultaneously
5. View responses in split-screen

Synchronized Streaming:
Responses stream in real-time, so you can watch both AIs "think" at the same time.

View Options:
- Split view: Both responses visible
- Full-screen: Focus on one response
- Toggle between AIs easily

Use Cases:
- Compare writing styles
- Get diverse perspectives
- Fact-check between models
- Find the best explanation`,
    webUrl: "https://www.symposiumai.app/help/compare-mode",
    relatedTopics: ["multi-ai-chat", "debate-arena", "web-search"],
  },

  "multi-ai-chat": {
    id: "multi-ai-chat",
    title: "Multi-AI Chat",
    icon: "people-circle",
    category: "getting-started",
    shortDescription: "Chat with multiple AIs simultaneously",
    content: `Multi-AI Chat lets you have conversations with up to 3 different AI providers at once.

How to Set Up:
1. On the home screen, select your AIs (tap to add/remove)
2. Optionally assign personalities to each
3. Tap "Start Chat"
4. All selected AIs will respond to your messages

Why Use Multi-AI:
- Get diverse perspectives on any topic
- Compare how different AIs approach problems
- Fact-check by seeing multiple viewpoints
- More dynamic, interesting conversations

@ Mentions:
Use @Claude, @ChatGPT, etc. to direct a message to a specific AI. Otherwise, all AIs respond.

Hallucination Shield:
With multiple AIs, they can fact-check each other. If responses differ significantly, investigate further!`,
    webUrl: "https://www.symposiumai.app/help/multi-ai-chat",
    relatedTopics: ["compare-mode", "personalities", "web-search"],
  },

  // ============================================
  // CHAT
  // ============================================
  "quick-start-wizard": {
    id: "quick-start-wizard",
    title: "Quick Start Prompts",
    icon: "flash",
    category: "chat",
    shortDescription: "Smart conversation starters that help you begin",
    content: `The Quick Start system helps you begin meaningful conversations without having to think of a prompt from scratch.

How It Works:
1. Tap the lightbulb icon on the Start Chat button
2. Select a topic category (Morning, Brainstorm, Learn, etc.)
3. Choose a specific context within that category
4. Optionally add your own details to refine the prompt
5. A smart, contextual prompt is generated for you

The Two-Step Wizard:
- Step 1: Select a topic and context (e.g., "Brainstorming" + "Business Ideas")
- Step 2: Add optional refinements (e.g., "for a mobile app startup")

Smart Prompts:
The wizard creates AI-ready prompts that get better responses. Instead of asking "give me business ideas", it generates context-rich prompts that lead to more helpful conversations.

Available Categories:
- Morning Check-in: Start your day right
- Brainstorming: Generate fresh ideas
- Learn Something: Explore new topics
- Creative Writing: Collaborative storytelling
- Problem Solving: Work through challenges
- Just for Fun: Games and entertainment`,
    webUrl: "https://www.symposiumai.app/help/quick-start",
    relatedTopics: ["multi-ai-chat", "round-robin"],
  },

  history: {
    id: "history",
    title: "Chat History",
    icon: "time",
    category: "chat",
    shortDescription: "View and manage past conversations",
    content: `All your conversations are automatically saved and accessible from the History tab.

Features:
- View all past sessions (chats, debates, comparisons)
- Search by message content or AI names
- Filter by session type
- Resume any previous conversation
- Delete individual sessions or clear all

Session Stats:
See your total sessions, message counts, and breakdown by type.

Privacy:
All history is stored locally on your device. Clearing the app data or uninstalling will remove history.`,
    webUrl: "https://www.symposiumai.app/help/history",
    relatedTopics: ["history-overview", "history-clear-all"],
  },

  "round-robin": {
    id: "round-robin",
    title: "Round Robin Format",
    icon: "sync",
    category: "chat",
    shortDescription: "How conversations work with multiple AIs",
    content: `When you chat with multiple AIs at once, they respond in a round-robin format.

How Round-Robin Works:
When you send a message, each selected AI responds in turn. The order is based on how you selected them on the home screen.

For example, if you selected Claude, then ChatGPT, then Gemini:
1. You send your message
2. Claude responds first
3. ChatGPT responds second
4. Gemini responds third
5. You send another message, cycle repeats

Why Round-Robin?
- See diverse perspectives on the same question
- Compare how different AIs approach problems
- Get multiple viewpoints without asking separately
- Natural flow that mimics a group discussion

Tips:
- Each AI sees all previous messages in the conversation
- AIs can reference and respond to each other's points
- Use @mentions to direct specific questions to one AI
- All responses are clearly labeled with which AI wrote them`,
    webUrl: "https://www.symposiumai.app/help/multi-ai-chat",
    relatedTopics: ["multi-ai-chat", "ai-mentions"],
  },

  "ai-mentions": {
    id: "ai-mentions",
    title: "@Mentions",
    icon: "at",
    category: "chat",
    shortDescription: "Direct messages to specific AIs",
    content: `Use @mentions to direct your message to a specific AI in a multi-AI chat.

How to Use @Mentions:
Type @ followed by the AI name in your message:
- @Claude - Direct message to Claude
- @ChatGPT - Direct message to ChatGPT
- @Gemini - Direct message to Gemini

Examples:
"@Claude, can you explain this in simpler terms?"
"@ChatGPT, what do you think of Claude's response?"
"@Gemini, can you fact-check this?"

Without @Mentions:
If you don't use an @mention, ALL selected AIs will respond to your message in round-robin order.

With @Mentions:
Only the mentioned AI will respond. Other AIs will see your message but won't reply unless mentioned.

Pro Tips:
- Use @mentions to get a specific AI's take on another's response
- Great for fact-checking between multiple AIs
- Helps reduce response volume when you only need one opinion
- Each AI still sees the full conversation context`,
    webUrl: "https://www.symposiumai.app/help/mentions",
    relatedTopics: ["multi-ai-chat", "round-robin"],
  },

  "web-search": {
    id: "web-search",
    title: "Web Search",
    icon: "globe",
    category: "chat",
    shortDescription: "Get real-time information from the web",
    content: `Web Search enables AIs to access current information from the internet, providing up-to-date answers with source citations.

How to Enable:
1. Look for the globe icon next to the message input
2. Tap to toggle web search on (highlighted) or off
3. Send your message - the AI will search the web as needed

The toggle only appears when your selected AI(s) support web search.

Supported Providers:
- ChatGPT (OpenAI) - GPT-5.x, GPT-4.x models
- Gemini (Google) - Gemini 2.0+ models
- Perplexity - All Sonar models

Multi-AI Mode:
In multi-AI chats, web search is only available when ALL selected AIs support it. If one AI doesn't support web search, the toggle won't appear.

Citations:
When web search is enabled, responses include clickable source links. Tap any link to preview the source or open it in your browser.

Best Use Cases:
- Current events and news
- Recent product information
- Up-to-date statistics and data
- Fact-checking and verification
- Research on recent topics`,
    webUrl: "https://www.symposiumai.app/help/web-search",
    relatedTopics: ["multi-ai-chat", "compare-mode"],
  },

  // ============================================
  // GETTING STARTED - NEW TOPICS
  // ============================================
  "dynamic-ai-selector": {
    id: "dynamic-ai-selector",
    title: "AI Selection",
    icon: "apps",
    category: "getting-started",
    shortDescription: "Choose AIs, personalities, and models",
    content: `The home screen lets you configure which AIs to chat with and how they'll respond.

Selecting AIs:
Tap on any configured AI card to select or deselect it. You can select up to 3 AIs for multi-AI conversations.

Personality Selection:
When an AI is selected, tap the personality badge to choose how that AI communicates. Each personality brings a different tone and style.

Model Selection:
With Expert Mode enabled, you can choose specific AI models. This appears as a dropdown on selected AI cards.

Start Chatting:
Once you've selected at least one AI, tap "Start Chat" to begin. Use the lightbulb icon for Quick Start prompts.`,
    webUrl: "https://www.symposiumai.app/help/ai-selection",
    relatedTopics: ["personalities", "expert-mode", "quick-start-wizard"],
  },

  "history-overview": {
    id: "history-overview",
    title: "History Overview",
    icon: "albums",
    category: "getting-started",
    shortDescription: "All your conversations in one place",
    content: `The History tab stores all your conversations, debates, and comparisons.

What's Saved:
- Chat sessions with single or multiple AIs
- AI Debate Arena matches with full transcripts
- Compare mode sessions with side-by-side responses

Browsing History:
Use the tabs to filter by type (All, Chat, Debate, Compare) and the search bar to find specific conversations.

Session Details:
Each session shows participants, date, preview, and message count. Tap to continue or review.

Local Storage:
All history is stored on your device. Clearing app data will remove history.`,
    webUrl: "https://www.symposiumai.app/help/history-overview",
    relatedTopics: ["chat-history", "debate-history", "compare-history"],
  },

  // ============================================
  // DEBATE ARENA - NEW TOPICS
  // ============================================
  "debate-stats": {
    id: "debate-stats",
    title: "Debate Stats",
    icon: "stats-chart",
    category: "debate-arena",
    shortDescription: "Track AI debate performance",
    content: `The Stats screen shows performance metrics for your AI debates.

What's Tracked:
- Total debates conducted
- Win/loss records by AI
- Average rounds per debate
- Most debated topics

AI Performance:
See which AIs win most often and how they perform against specific opponents.

Accessing Stats:
Tap the Stats button on the Debate Arena setup screen to view your debate statistics.

Note: Stats are calculated from your local debate history.`,
    webUrl: "https://www.symposiumai.app/help/debate-stats",
    relatedTopics: ["debate-arena", "debate-voting"],
  },

  // ============================================
  // COMPARE - NEW TOPICS
  // ============================================
  "compare-bubble": {
    id: "compare-bubble",
    title: "Expand Responses",
    icon: "expand",
    category: "compare",
    shortDescription: "View full AI responses in Compare mode",
    content: `In Compare mode, tap on any response bubble to expand it for easier reading.

Why Expand?
Side-by-side view can make long responses hard to read. Expanding shows the full response without scrolling horizontally.

How to Use:
Tap anywhere on a response bubble to expand it to full width. Tap again or tap outside to collapse.

Comparing Content:
Use this to carefully read each AI's full response before deciding which answer you prefer.`,
    webUrl: "https://www.symposiumai.app/help/compare-bubble",
    relatedTopics: ["compare-mode", "compare-continue"],
  },

  "compare-continue": {
    id: "compare-continue",
    title: "Continue with AI",
    icon: "arrow-forward",
    category: "compare",
    shortDescription: "Continue chatting after comparison",
    content: `After comparing AI responses, you can continue the conversation with your preferred AI.

How It Works:
After viewing the comparison, tap "Continue with [AI Name]" to start a regular chat session with that AI.

Conversation Context:
The new chat will include the comparison context, so the AI knows what was discussed.

Use Case:
Great for when one AI gives a better answer and you want to explore the topic further with them.`,
    webUrl: "https://www.symposiumai.app/help/compare-continue",
    relatedTopics: ["compare-mode", "compare-bubble"],
  },

  // ============================================
  // HISTORY - NEW TOPICS
  // ============================================
  "chat-history": {
    id: "chat-history",
    title: "Chat Sessions",
    icon: "chatbubble",
    category: "history",
    shortDescription: "Manage your chat conversations",
    content: `Your chat sessions are automatically saved to History.

What's Saved:
- All messages sent and received
- AI participants and their personalities
- Session start time and duration
- Message count

Managing Chats:
- Tap a session to continue the conversation
- Swipe left to delete individual sessions
- Use search to find specific chats

Filtering:
Use the "Chat" tab in History to see only chat sessions.`,
    webUrl: "https://www.symposiumai.app/help/chat-history",
    relatedTopics: ["history-overview", "history-clear-all"],
  },

  "debate-history": {
    id: "debate-history",
    title: "Debate Sessions",
    icon: "trophy",
    category: "history",
    shortDescription: "Review past AI debates",
    content: `All your AI debates are saved with full transcripts.

What's Saved:
- Complete debate transcript
- AI participants and models
- Debate format and topic
- Your vote and winner
- Number of rounds

Reviewing Debates:
Tap any debate to read the full transcript and see the arguments each AI made.

Filtering:
Use the "Debate" tab in History to see only debate sessions.`,
    webUrl: "https://www.symposiumai.app/help/debate-history",
    relatedTopics: ["history-overview", "debate-arena"],
  },

  "compare-history": {
    id: "compare-history",
    title: "Compare Sessions",
    icon: "git-compare",
    category: "history",
    shortDescription: "Review past AI comparisons",
    content: `Your Compare mode sessions are saved for future reference.

What's Saved:
- Original prompt
- Both AI responses
- AI participants and models
- Session timestamp

Reviewing Comparisons:
Tap any comparison to see the side-by-side responses again.

Filtering:
Use the "Compare" tab in History to see only comparison sessions.`,
    webUrl: "https://www.symposiumai.app/help/compare-history",
    relatedTopics: ["history-overview", "compare-mode"],
  },

  "history-clear-all": {
    id: "history-clear-all",
    title: "Clear All History",
    icon: "trash",
    category: "history",
    shortDescription: "Delete all saved sessions",
    content: `You can clear all your history at once from the History screen.

How to Clear:
Tap the "Clear All" button at the top of the History screen. You'll be asked to confirm before deletion.

What's Deleted:
- All chat sessions
- All debate sessions
- All compare sessions
- Session statistics

Warning:
This action cannot be undone. All your conversation history will be permanently deleted.

Individual Deletion:
To delete specific sessions, swipe left on them in the list instead of using Clear All.`,
    webUrl: "https://www.symposiumai.app/help/history-clear-all",
    relatedTopics: ["history-overview", "chat-history"],
  },
};

/**
 * Get topics by category
 */
export function getTopicsByCategory(category: HelpCategory): HelpTopic[] {
  return Object.values(HELP_TOPICS).filter(
    (topic) => topic.category === category
  );
}

/**
 * Get a topic by ID
 */
export function getTopicById(id: string): HelpTopic | undefined {
  return HELP_TOPICS[id];
}

/**
 * Get related topics for a given topic
 */
export function getRelatedTopics(topicId: string): HelpTopic[] {
  const topic = HELP_TOPICS[topicId];
  if (!topic?.relatedTopics) return [];

  return topic.relatedTopics
    .map((id) => HELP_TOPICS[id])
    .filter((t): t is HelpTopic => t !== undefined);
}
