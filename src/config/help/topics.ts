/**
 * Help Topics
 *
 * Comprehensive help content for all app features.
 * Each topic includes in-app summary content and optional
 * web URL for detailed documentation.
 */

import { HelpTopic, HelpCategory, HelpCategoryInfo } from "./types";
import { ENABLED_API_CONFIG_PROVIDER_COUNT } from "../apiConfigProviders";

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
    id: "create",
    title: "Create",
    icon: "image-outline",
    description: "Generate images, video, and audio",
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
    content: `The AI Debate Arena is Symposium AI's signature feature where you can watch different AI models debate any motion you choose. Setup happens on a single screen:

1. Motion: pick a preset motion, write a custom one, or tap Surprise Me
2. Format: choose Oxford, Lincoln-Douglas, or Policy, plus a length preset
3. Debate Teams: tap a slot to add a debater, then tap it again to change its provider, model, or personality
4. Debate Settings: with an ElevenLabs key you can enable Debate Voices or Podcast Mode
5. Tap Start Debate

Demo vs Live:
- Demo mode plays curated, pre-recorded debates
- Start a trial or subscription to run live debates with your API keys

Each AI will present arguments, respond to their opponent, and try to make the most compelling case. Oxford debates ask for your stance before and after the speeches; other formats ask you to vote at format-specific checkpoints.`,
    relatedTopics: ["debate-formats", "debate-voting", "debate-stats"],
  },

  "debate-formats": {
    id: "debate-formats",
    title: "Debate Formats",
    icon: "list",
    category: "debate-arena",
    shortDescription: "Three structured debate styles to choose from",
    content: `Symposium AI offers three structured debate formats:

Oxford Format:
Audience-voted motion debate with proposition and opposition speeches. Choose the 1v1, 2v2, or 2v2 + Q&A preset. In Q&A, you enter one audience question for each side after the first arguments. You vote before the first speech and again after the closing speeches. Best for: Public-facing debates on policy or ethics.

Lincoln-Douglas:
Philosophical debate focusing on values and ethics. Uses AC, CX, NC/1NR, 1AR, NR/2NR, and 2AR structure. Best for: Ethical dilemmas and value-based topics.

Policy Debate:
Data-driven debate with emphasis on evidence and practical solutions. Uses 1AC, 1NC, 2AC, 2NC, 1NR, 1AR, 2NR, and 2AR speech order. Best for: Current events and real-world issues.

Choosing a Preset:
The preset buttons below the format control debate length: 1v1, 2v2, and 2v2 + Q&A for Oxford; Short, Standard, and Extended for Lincoln-Douglas and Policy.

Speech Length:
Brief, Balanced, and Detailed set how long each speech is, from openings of about 100 words to about 350, while the preset sets how many speeches there are. Setup remembers your last choice.`,
    relatedTopics: ["debate-arena", "debate-voting"],
  },

  "debate-voting": {
    id: "debate-voting",
    title: "Voting & Scoring",
    icon: "trophy",
    category: "debate-arena",
    shortDescription: "How to judge and vote on debates",
    content: `Voting depends on the debate format.

Oxford Voting:
Oxford uses an audience model. You cast an opening stance before the first speech, then a required final vote after the debate. The result shows whether the proposition or opposition persuaded, held, or flipped the audience.

Checkpoint Voting:
Lincoln-Douglas and Policy use format-specific checkpoint votes. At each checkpoint, choose which debater handled that part of the debate more effectively.

Voting Criteria:
Consider these factors when deciding your vote:
- Strength of arguments presented
- Quality of evidence and reasoning
- Response to opponent's points
- Clarity and persuasiveness
- Adherence to the debate format

Your Vote Matters:
Voting helps you engage critically with the debate content and track which AIs or teams perform best on different topics.

Debate History:
All your debates and votes are saved in your history, so you can review past debates and see patterns in AI performance.`,
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
- Final audience decision or round scores (if available)`,
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
    content: `BYOK (Bring Your Own Keys) lets you use your own API keys across ${ENABLED_API_CONFIG_PROVIDER_COUNT} supported providers, including text, image, video, and audio services.

Why BYOK?
Instead of paying monthly subscriptions to multiple AI services, you pay only for what you use. This can save significant money, especially if you're already subscribed to these services.

Supported Providers:
- Claude (Anthropic)
- ChatGPT (OpenAI)
- Gemini (Google)
- Perplexity
- Mistral
- Cohere
- DeepSeek
- Grok (xAI)
- Runway (video)
- ElevenLabs (audio)

Your keys are stored securely on your device and never sent to our servers.`,
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
Instead of stacking several consumer AI subscriptions, you connect the provider APIs you actually need and pay those providers based on usage.

With BYOK:
Text API costs are typically usage-based and vary by model and length. Media generation has separate provider pricing based on image size, video duration, or audio length. Symposium supports ${ENABLED_API_CONFIG_PROVIDER_COUNT} provider connections, so you can choose the providers and models that fit each task.

Pay-Per-Use Benefits:
- No monthly minimums
- Scale down in light months
- Access supported providers from day one
- No feature restrictions based on tier

Tip: Start with the most affordable models (like Claude Haiku, GPT-5.6 Luna, or Gemini Flash-Lite) and upgrade to higher-cost models only when needed.`,
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
- George: PG-13 satirical mirror with sharp, sarcastic wit
- Kai: Staff engineer mindset; structured and detail-focused
- Prof. Sage: Socratic scholar; precise and citation-friendly
- Scout: Narrative strategist who uses scenes and analogies

How to Use:
1. Tap an AI's pill in the composer (or a filled debater slot in the Arena)
2. Tap the Personality row
3. Tap a personality to select it

Mix and Match:
In multi-AI chats, give each AI a different personality to see varied perspectives and communication styles on the same topic.`,
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

Where to Find It:
- Settings > Model Defaults: set each provider's default model and default parameters for all new sessions
- In the composer, tap an AI pill and open Advanced Parameters to tune the current conversation, then Save for This Session or Save as Default

What You Can Control:
- Model selection (per provider)
- Temperature: Creativity vs consistency
- Max Tokens: Response length limits
- Top-P: Response diversity
- Top-K and frequency/presence penalties (provider-dependent)

Controls are model-aware: a slider only appears when the selected model supports that parameter, and some of the newest models manage temperature automatically.

When to Use Expert Mode:
- Creative writing: Higher temperature for variety
- Factual queries: Lower temperature for accuracy
- Long-form content: Increase max tokens
- Quick answers: Decrease max tokens

Notes:
- Choosing default models is available to everyone with API keys
- Parameter tuning requires an active trial or subscription`,
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

Tip: Start with the default and adjust based on results. Too high can produce nonsensical output.

Note: Some models only support their default temperature - for those, the slider is locked or hidden.`,
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

Note: The AI may stop before reaching max tokens if it completes its thought. Debate speeches are an exception - their length is set by the debate format, not this setting.`,
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

Tip: If using Top-P, consider setting temperature to 1.0 and only adjusting Top-P. Not every model exposes Top-P - the slider only appears when the selected model supports it.`,
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
    content: `Compare Mode lets you see how two AIs respond to the same prompt, displayed side-by-side.

How It Works:
1. Go to the Compare tab
2. Use the Add AI pill to pick your two AIs - the first pill (L) answers in the left pane, the second (R) in the right
3. Tap a pill to change its model, personality, or advanced parameters
4. Type your prompt and tap send - the session starts automatically

You can compare two different providers, or the same provider with different models or personalities.

Synchronized Streaming:
Responses stream in real-time, so you can watch both AIs "think" at the same time.

View Options:
- Split view: Both responses visible
- Expand: Focus on one response full-width
- Continue with this AI: Keep chatting with the side you prefer

Attachments:
Use the attach button to include images or documents with your first message (when both selected models support them).

Use Cases:
- Compare writing styles
- Get diverse perspectives
- Fact-check between models
- Find the best explanation`,
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
1. On the Chat tab, tap the Add AI pill and choose a provider (repeat for up to 3 AIs)
2. Tap any pill to set its model, personality, or advanced parameters
3. Type your message and tap send - the chat starts automatically

Why Use Multi-AI:
- Get diverse perspectives on any topic
- Compare how different AIs approach problems
- Fact-check by seeing multiple viewpoints
- More dynamic, interesting conversations

@ Mentions:
Use @Claude, @ChatGPT, etc. to direct a message to a specific AI. Otherwise, all AIs respond.

Hallucination Shield:
With multiple AIs, they can fact-check each other. If responses differ significantly, investigate further!`,
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
    content: `Quick Start helps you begin meaningful conversations without having to think of a prompt from scratch.

How It Works:
1. On the Chat tab, tap the Quick Start chip above the composer
2. Enter what you want to talk through
3. Choose how the first response should be shaped
4. Review the preview of the exact first message that will be sent
5. Tap Start Chat to create the chat and send that prompt

Smart Prompts:
Quick Start sends your own prompt as the first chat message. The selected response style only shapes the hidden first-response instruction, so Chat can answer directly, brainstorm, explain, plan, draft, or troubleshoot without switching modes.

Available Response Styles:
- Direct Answer: Clear, useful response
- Brainstorm: Options and fresh angles
- Explain: Teach with examples
- Plan: Steps and priorities
- Draft: Write or rewrite text
- Troubleshoot: Diagnose and fix`,
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
- Resume past chats and comparisons; completed debates open as a transcript, with Rematch to run them again
- Delete individual sessions or clear all

Session Stats:
See your total sessions, message counts, and breakdown by type.

Privacy:
All history is stored locally on your device. Clearing the app data or uninstalling will remove history.`,
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
When you send a message, each selected AI responds in turn. The order matches your AI pills in the composer, from left to right.

For example, if your pills are Claude, then ChatGPT, then Gemini:
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
    relatedTopics: ["multi-ai-chat", "round-robin"],
  },

  attachments: {
    id: "attachments",
    title: "Attachments",
    icon: "attach",
    category: "chat",
    shortDescription: "Send images and documents with your messages",
    content: `Attach images and documents so the AIs can read and discuss them.

Where to Attach:
- Before the first message: tap the attach button in the Chat or Compare composer
- In an active chat: tap the + button next to the input

Supported Files:
- Images
- Documents: PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, and PPTX
- Up to 20 attachments per message

How It Works:
Attachments are sent to every AI in the lineup. The attach button only appears when your selected models support image or document input. If you switch to a model that can't read a staged file, sending is blocked until you remove the file or change models.`,
    relatedTopics: ["multi-ai-chat", "compare-mode"],
  },

  "web-search": {
    id: "web-search",
    title: "Web Search",
    icon: "globe",
    category: "chat",
    shortDescription: "Get real-time information from the web",
    content: `Web Search lets AIs access current information from the internet, providing up-to-date answers with source citations.

Always On - No Toggle:
There's nothing to enable. Every model that supports web search uses it automatically whenever it helps answer your question. Models without web search simply answer from their training data.

Supported Providers:
- Claude (native web search)
- ChatGPT (GPT-5.x and GPT-4.1 models)
- Gemini (current models)
- Perplexity (all Sonar models)
- Grok (current models)

Mistral, Cohere, and DeepSeek models don't currently support web search.

Multi-AI Mode:
Web search is independent per AI. In a mixed lineup, the models that support search use it and the rest respond normally.

Citations:
Responses include numbered [n] citation chips inline plus a Sources list below the message. Tap a citation to preview the source or open it in your browser.

Best Use Cases:
- Current events and news
- Recent product information
- Up-to-date statistics and data
- Fact-checking and verification
- Research on recent topics`,
    relatedTopics: ["multi-ai-chat", "compare-mode"],
  },

  // ============================================
  // GETTING STARTED - NEW TOPICS
  // ============================================
  "dynamic-ai-selector": {
    id: "dynamic-ai-selector",
    title: "Choosing Your AIs",
    icon: "apps",
    category: "getting-started",
    shortDescription: "Pick AIs, personalities, and models in the composer",
    content: `Your AI lineup lives right in the composer at the bottom of the Chat and Compare tabs.

Adding AIs:
Tap the Add AI pill and choose a provider. Each AI appears as a pill above the input. Chat supports up to 3 AIs; Compare uses exactly 2.

Configuring an AI:
Tap a pill to open its settings:
- Model: choose a specific model, with pricing shown
- Personality: pick how that AI communicates
- Advanced Parameters: fine-tune generation settings
- Remove from conversation

Starting:
Type your message and tap send - the session is created automatically. There's no separate start button.`,
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
Tap the stats icon at the top of the Debate setup screen to view your debate statistics.

Note: Stats are calculated from your local debate history.`,
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
    content: `In Compare mode, expand a response pane when you want to read one answer full-width.

Why Expand?
Side-by-side view can make long responses hard to read. Expanding shows the full response without cramped columns.

How to Use:
Tap the expand button on either pane to give that AI's response the full screen. Tap it again to return to the split view.

Comparing Content:
Use this to carefully read each AI's full response before deciding which answer you prefer.`,
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
Tap "Continue with this AI" beneath a response. After you confirm, the session narrows to a single-pane conversation with that AI.

Conversation Context:
The conversation continues in place, so the AI keeps the full context of what was discussed.

Use Case:
Great for when one AI gives a better answer and you want to explore the topic further with them.`,
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
    relatedTopics: ["history-overview", "chat-history"],
  },

  // ============================================
  // CREATE MODE (AI Media Generation)
  // ============================================
  "create-mode": {
    id: "create-mode",
    title: "Create Mode",
    icon: "image",
    category: "getting-started",
    shortDescription: "Generate images, video, and audio",
    content: `Create Mode (the Studio) lets you generate images, videos, voiceovers, and sound effects using your own provider keys.

How to Use:
1. Go to the Create tab and pick the Image, Video, or Audio tab
2. Set up your models: tap the pills in the composer to configure each one
3. Adjust options: the sliders chip opens Output Options (style, frame, count, source image); each pill has its own per-model settings
4. Type a prompt or script and tap send

Image Generation:
Generate with up to 3 models at once to compare different AI interpretations of your prompt. Attach a source image to refine or edit it instead of starting from scratch.

Video Generation:
Use Runway for text-to-video, or attach an image for image-to-video.

Audio Generation:
Use ElevenLabs to create voiceovers from scripts or generate sound effects from prompts.

Create Gallery:
Tap Gallery in the tab row to browse everything you've generated. You can preview, save, share, refine, or delete assets.`,
    relatedTopics: ["create-providers", "create-styles", "create-frame", "create-refinement", "create-gallery"],
  },

  "create-providers": {
    id: "create-providers",
    title: "Create Providers",
    icon: "apps",
    category: "create",
    shortDescription: "Providers for images, video, and audio",
    content: `Symposium AI supports Create mode across image, video, and audio providers, each with unique capabilities.

Supported Providers:
- OpenAI (GPT Image models): High-quality image generation and editing
- Google (Gemini image models and Imagen): Photorealistic results; Gemini models can edit, Imagen creates from text only
- Grok (xAI): Fast image generation and editing
- Runway: Text-to-video and image-to-video generation
- ElevenLabs: Text-to-speech voiceovers and generated sound effects

Provider Selection:
The Image tab supports up to 3 image models at once. Tap a pill to pick the model - its sheet shows whether it can edit images and use references or creates from text prompts only.

Video and Audio:
The Video tab uses your Runway key. The Audio tab uses your ElevenLabs key and can load voices, models, and output formats from your account.

API Keys Required:
Each provider requires a valid API key configured in Settings > API Configuration. Media generation may have different pricing than text generation.`,
    relatedTopics: ["create-mode", "byok-overview"],
  },

  "create-styles": {
    id: "create-styles",
    title: "Style Presets",
    icon: "color-palette",
    category: "create",
    shortDescription: "Artistic styles for image generation",
    content: `Style presets enhance your prompts with artistic direction, helping you achieve specific visual aesthetics.

Available Styles:
- None: Your prompt as-is, no style modification
- Photo: Photorealistic, like professional photography
- Cinematic: Movie-like dramatic scenes with film grain
- Anime: Japanese animation style with vibrant colors
- Digital Art: Modern digital illustration, clean lines
- Oil Painting: Classical oil painting with visible brush strokes
- Watercolor: Soft colors with flowing washes and paper texture
- Sketch: Hand-drawn pencil sketch style
- 3D Render: CGI quality with ray tracing and studio lighting

Where to Find Styles:
On the Image tab, tap the sliders chip next to the input to open Output Options. The style you pick applies to every selected model.

How Styles Work:
When you select a style, descriptive keywords are automatically appended to your prompt to guide the AI toward that aesthetic.

Combining with Prompts:
Write your core idea in the prompt, then let the style preset handle the artistic direction. For example: "a cozy cabin in the mountains" + Watercolor style.`,
    relatedTopics: ["create-mode", "create-frame"],
  },

  "create-refinement": {
    id: "create-refinement",
    title: "Image Refinement",
    icon: "brush",
    category: "create",
    shortDescription: "Refine and iterate on images",
    content: `Image refinement (img2img) starts from an existing image instead of a blank canvas - attaching a source image is what turns a generation into a refinement.

How It Works:
1. Attach a source image: tap the attach button in the composer, use Output Options > Source image (Upload image / Use latest image), or tap Refine on a gallery image
2. Describe the changes you want in the prompt
3. Tap send - every selected model that can edit images produces a refined version

Use Cases:
- Iterate on generated images to improve details
- Change the style of an existing image
- Add or remove elements from a scene
- Apply artistic effects to photos

Refinement vs New Generation:
- Without a source image, models start from scratch with just your prompt
- With a source image, models use it as a reference, maintaining composition

Which Models Can Edit:
GPT Image (OpenAI), Gemini image models (Google), and Grok can edit images and use references. Imagen models create from text only - if you attach an image, you'll be prompted to switch any model that can't edit.`,
    relatedTopics: ["create-mode", "create-gallery", "create-providers"],
  },

  "create-gallery": {
    id: "create-gallery",
    title: "Create Gallery",
    icon: "images",
    category: "create",
    shortDescription: "Manage generated media",
    content: `Your generated images, videos, and audio are automatically saved to a persistent gallery - open it from the Gallery entry in the Studio's tab row.

Gallery Features:
- Browse All, Images, Videos, or Audio
- Search, filter (provider, model, type, date), and sort
- Video tiles show poster thumbnails
- Tap any asset to preview it

Actions:
From the detail view, you can:
- Save: Download supported assets to your device
- Share: Send via messages, email, or social media
- Refine: Use an image as the source for a new refinement
- Delete: Remove from your gallery

Multi-Select:
Long-press an asset (or tap Select) to choose several at once for bulk save or delete.

Storage:
Generated assets are stored locally on your device. The gallery persists across app sessions, so your creations are always available.`,
    relatedTopics: ["create-mode", "create-refinement"],
  },

  "create-quality": {
    id: "create-quality",
    title: "Quality",
    icon: "diamond",
    category: "create",
    shortDescription: "Detail level vs cost and speed",
    content: `Higher quality renders more detail but costs more and takes longer to generate.

OpenAI GPT Image models:
- Match model: lets the model pick its best default
- Draft: fastest and cheapest, good for quick exploration
- Medium / High: progressively more detail and cost

Gemini and Grok:
Manage quality automatically, so this control only appears for models that expose it. That's why you may see a Quality control on one model's card but not another's.`,
    relatedTopics: ["create-providers"],
  },

  "create-safety": {
    id: "create-safety",
    title: "Safety",
    icon: "shield-checkmark",
    category: "create",
    shortDescription: "Content moderation level",
    content: `Controls how strictly generated images are moderated.

- Default safety: recommended for most uses
- Less restrictive: permits a broader range of creative content while still blocking disallowed material

Where it applies:
Only OpenAI GPT Image models expose this setting, so it appears on the OpenAI card only. Other providers apply their own fixed moderation.`,
    relatedTopics: ["create-providers"],
  },

  "create-background": {
    id: "create-background",
    title: "Background",
    icon: "square-outline",
    category: "create",
    shortDescription: "Transparent or solid backgrounds",
    content: `Choose how the image background is rendered.

- Default: the model decides
- Opaque: a solid background
- Transparent: no background, ideal for logos, icons, and stickers

Requirements:
Transparent backgrounds need an alpha-capable format (PNG or WebP) and are supported on OpenAI GPT Image models.`,
    relatedTopics: ["create-format", "create-providers"],
  },

  "create-format": {
    id: "create-format",
    title: "File Format",
    icon: "document",
    category: "create",
    shortDescription: "PNG, JPEG, or WebP",
    content: `The file format of the generated image.

- PNG: lossless, supports transparency, larger files
- JPEG: smaller files, no transparency, best for photos
- WebP: small files with optional transparency

Pick PNG or WebP if you need a transparent background. This control appears only for models that let you choose (OpenAI GPT Image).`,
    relatedTopics: ["create-background", "create-compression"],
  },

  "create-resolution": {
    id: "create-resolution",
    title: "Resolution",
    icon: "scan",
    category: "create",
    shortDescription: "Output detail size",
    content: `Sets the output resolution for models that support multiple sizes (such as Gemini image models and Grok).

Higher resolutions capture more detail but cost more and take longer. Options vary by model - for example 1K, 2K, or 4K - so this control only appears for models that expose it.`,
    relatedTopics: ["create-quality", "create-frame"],
  },

  "create-frame": {
    id: "create-frame",
    title: "Frame",
    icon: "crop",
    category: "create",
    shortDescription: "Shared aspect ratio for all models",
    content: `Frame sets the aspect ratio applied to every selected AI, so a side-by-side comparison stays consistent. You'll find it in the Output Options sheet (the sliders chip next to the input).

- Model default: each provider's own default frame
- Square (1:1), Portrait, Landscape

Each provider maps these to its supported dimensions automatically (OpenAI uses pixel sizes, Gemini and Grok use aspect ratios).`,
    relatedTopics: ["create-styles", "create-resolution"],
  },

  "create-compression": {
    id: "create-compression",
    title: "Compression",
    icon: "archive",
    category: "create",
    shortDescription: "File size vs quality for JPEG/WebP",
    content: `Adjusts the compression level for JPEG and WebP output. Higher values keep more detail but produce larger files.

This control appears only when you've chosen a JPEG or WebP format on a model that supports compression (OpenAI GPT Image). PNG is lossless and ignores this setting.`,
    relatedTopics: ["create-format"],
  },

  "create-video-source": {
    id: "create-video-source",
    title: "Video Source Image",
    icon: "image",
    category: "create",
    shortDescription: "Optional image-to-video input",
    content: `Optionally provide a starting image for image-to-video generation. Runway animates from that frame using your prompt as direction.

- Leave empty for text-to-video (generate purely from the prompt)
- Add an image (upload or reuse a gallery image) to animate it

Adding an image switches the model list to image-to-video capable models.`,
    relatedTopics: ["create-video-model"],
  },

  "create-video-model": {
    id: "create-video-model",
    title: "Video Model",
    icon: "videocam",
    category: "create",
    shortDescription: "Runway generation models",
    content: `Choose the Runway model that generates your video. Models differ in quality, speed, supported durations, and aspect ratios.

The available models change based on whether you've added a source image (image-to-video) or are generating from text only (text-to-video). Switching models may adjust the available durations and frames.`,
    relatedTopics: ["create-video-duration", "create-video-frame"],
  },

  "create-video-duration": {
    id: "create-video-duration",
    title: "Video Duration",
    icon: "time",
    category: "create",
    shortDescription: "Clip length in seconds",
    content: `Sets how long the generated clip is. Longer clips cost more and take longer to render.

Available lengths depend on the selected model, so the options update when you change models.`,
    relatedTopics: ["create-video-model"],
  },

  "create-video-frame": {
    id: "create-video-frame",
    title: "Video Frame",
    icon: "crop",
    category: "create",
    shortDescription: "Video aspect ratio",
    content: `Sets the aspect ratio of the generated video, such as 16:9 (widescreen) or 9:16 (vertical for phones and social stories).

Supported ratios depend on the selected model.`,
    relatedTopics: ["create-video-model"],
  },

  "create-audio-mode": {
    id: "create-audio-mode",
    title: "Voiceover vs Sound Effect",
    icon: "headset",
    category: "create",
    shortDescription: "Speech or generated sound",
    content: `Choose what ElevenLabs generates.

- Voiceover (text-to-speech): reads your script aloud in a chosen voice
- Sound effect: generates a sound from a description (for example, "soft rain with distant thunder")

The available controls change with the mode - voice selection applies to Voiceover, while duration and prompt influence apply to Sound effects.`,
    relatedTopics: ["create-audio-voice"],
  },

  "create-audio-voice": {
    id: "create-audio-voice",
    title: "Voice",
    icon: "person",
    category: "create",
    shortDescription: "Choose the speaking voice",
    content: `Selects the voice used for voiceover. Each voice has its own tone, accent, and character.

Voices are loaded from your ElevenLabs account; use the picker's search to find one, and scroll to load more.`,
    relatedTopics: ["create-audio-mode", "create-audio-model"],
  },

  "create-audio-model": {
    id: "create-audio-model",
    title: "Audio Model",
    icon: "musical-notes",
    category: "create",
    shortDescription: "ElevenLabs generation model",
    content: `Selects the ElevenLabs model used to generate audio. Models trade off expressiveness, language support, and latency.

The available models depend on whether you're generating a voiceover or a sound effect.`,
    relatedTopics: ["create-audio-mode", "create-audio-format"],
  },

  "create-audio-format": {
    id: "create-audio-format",
    title: "Audio Format",
    icon: "document",
    category: "create",
    shortDescription: "Output file format and bitrate",
    content: `Sets the output audio format and quality (for example MP3 at various bitrates, Opus, or WAV).

Higher bitrates sound better but produce larger files. MP3 is the most widely compatible choice.`,
    relatedTopics: ["create-audio-model"],
  },

  "create-audio-duration": {
    id: "create-audio-duration",
    title: "Sound Duration",
    icon: "time",
    category: "create",
    shortDescription: "Length of the sound effect",
    content: `Sets how long the generated sound effect lasts.

- Auto duration: lets the model choose a natural length for the described sound
- Fixed values: force a specific length in seconds

This applies to sound effects only.`,
    relatedTopics: ["create-audio-mode", "create-audio-influence"],
  },

  "create-audio-influence": {
    id: "create-audio-influence",
    title: "Prompt Influence",
    icon: "options",
    category: "create",
    shortDescription: "How closely to follow the prompt",
    content: `Controls how strictly the sound effect follows your description.

- Lower values: more variation and creativity
- Higher values: closer adherence to the prompt, less variation

This applies to sound effects only.`,
    relatedTopics: ["create-audio-duration"],
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
