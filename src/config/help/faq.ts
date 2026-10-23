/**
 * FAQ Content
 *
 * Frequently asked questions organized by category.
 */

import { FAQItem, HelpCategory } from './types';
import { ENABLED_API_CONFIG_PROVIDER_COUNT } from '../apiConfigProviders';

export const FAQ_ITEMS: FAQItem[] = [
  // ============================================
  // GETTING STARTED
  // ============================================
  {
    id: 'faq-what-is-symposium',
    question: 'What is Symposium AI?',
    answer:
      `Symposium AI is a mobile app for working with ${ENABLED_API_CONFIG_PROVIDER_COUNT} AI providers across chat, debate, comparison, and Create mode media generation. Our signature feature is the AI Debate Arena, where you can watch different AIs debate any topic in real time.`,
    category: 'getting-started',
  },
  {
    id: 'faq-do-i-need-account',
    question: 'Do I need to create an account?',
    answer:
      'No account is required to use Symposium AI. Your data and API keys are stored locally on your device. You only need to provide your own API keys from AI providers to start live chats, debates, comparisons, and media generation.',
    category: 'getting-started',
  },
  {
    id: 'faq-is-it-free',
    question: 'Is Symposium AI free?',
    answer:
      'The app includes a demo mode with pre-recorded content so you can explore without API keys. Live chats, debates, comparisons, and Create mode media generation require your own provider API keys plus an active trial or subscription. Provider API usage has its own costs.',
    category: 'getting-started',
    relatedTopic: 'byok-overview',
  },
  {
    id: 'faq-how-start-chat',
    question: 'How do I start a chat?',
    answer:
      'On the Chat tab, tap the Add AI pill in the composer to pick up to 3 AIs, then type your message and tap send - the session starts automatically. Tap any AI pill to change its model, personality, or advanced parameters before you begin.',
    category: 'getting-started',
    relatedTopic: 'dynamic-ai-selector',
  },

  // ============================================
  // BYOK
  // ============================================
  {
    id: 'faq-what-is-byok',
    question: 'What is BYOK and why should I use it?',
    answer:
      `BYOK (Bring Your Own Keys) means you provide your own API keys from AI providers. This is more cost-effective than stacking multiple subscriptions because you pay providers only for what you use. Symposium currently supports ${ENABLED_API_CONFIG_PROVIDER_COUNT} provider connections across text and media workflows.`,
    category: 'byok',
    relatedTopic: 'byok-overview',
  },
  {
    id: 'faq-where-keys-stored',
    question: 'Where are my API keys stored?',
    answer:
      'Your API keys are stored securely on your device only. They are never sent to our servers. When you chat with AIs, your device communicates directly with the AI provider\'s API.',
    category: 'byok',
    relatedTopic: 'byok-security',
  },
  {
    id: 'faq-how-get-api-keys',
    question: 'How do I get API keys?',
    answer:
      'Each AI provider has a developer portal where you can generate API keys. In the API Configuration screen, tap "Get Key" for any provider - we\'ll open their key generation page with step-by-step guidance. You\'ll need to create an account with each provider you want to use.',
    category: 'byok',
    relatedTopic: 'byok-getting-keys',
  },
  {
    id: 'faq-api-key-cost',
    question: 'How much do API keys cost?',
    answer:
      'API costs vary by provider and model. Typical costs are $0.01-0.03 per message for standard models, more for higher-cost models. Most casual users spend $5-15/month. Set spending limits in each provider\'s dashboard to control costs.',
    category: 'byok',
    relatedTopic: 'byok-cost-savings',
  },
  {
    id: 'faq-key-not-working',
    question: 'My API key isn\'t working. What should I do?',
    answer:
      'First, verify the key is correct (no extra spaces). Check that you have billing enabled in the provider\'s dashboard - most require a payment method even for free tiers. Ensure your account isn\'t rate-limited. Try regenerating the key if issues persist.',
    category: 'byok',
    relatedTopic: 'byok-getting-keys',
  },

  // ============================================
  // DEBATE ARENA
  // ============================================
  {
    id: 'faq-what-is-debate-arena',
    question: 'What is the AI Debate Arena?',
    answer:
      'The AI Debate Arena is our signature feature where AIs debate any motion you choose. You select the motion, format, and debaters, then watch them exchange arguments in real-time. Oxford debates use opening and final audience votes; other formats use checkpoint voting.',
    category: 'debate-arena',
    relatedTopic: 'debate-arena',
  },
  {
    id: 'faq-debate-formats-difference',
    question: 'What\'s the difference between debate formats?',
    answer:
      'Oxford is an audience-voted motion debate with 1v1, 2v2, and 2v2 + Q&A presets. The Q&A preset asks you for one audience question per side after the first arguments. Lincoln-Douglas focuses on values and ethics using constructive, cross-examination, and rebuttal speeches. Policy emphasizes evidence, plans, burdens, cross-examination, and rebuttal order.',
    category: 'debate-arena',
    relatedTopic: 'debate-formats',
  },
  {
    id: 'faq-custom-debate-topic',
    question: 'Can I choose my own debate topic?',
    answer:
      'Yes. In live mode you can enter any debate motion (or use presets or Surprise Me). In demo mode, debates are pre-recorded so you pick from the available samples.',
    category: 'debate-arena',
    relatedTopic: 'debate-arena',
  },
  {
    id: 'faq-debate-not-starting',
    question: 'Why won\'t my debate start?',
    answer:
      'Fill every debater slot for the chosen format - Oxford 1v1, Lincoln-Douglas, and Policy need two debaters, while Oxford 2v2 and 2v2 + Q&A need four. Make sure you\'ve picked a motion and have at least one provider with a valid API key. The caption under the Start Debate button tells you exactly what\'s still missing. If issues persist, verify your API keys are working in a regular chat first.',
    category: 'debate-arena',
    relatedTopic: 'debate-arena',
  },

  // ============================================
  // PERSONALITIES (Getting Started)
  // ============================================
  {
    id: 'faq-what-are-personalities',
    question: 'What are AI personalities?',
    answer:
      'Personalities are style layers that shape tone, structure, and emphasis (for example, Bestie is supportive and Devlin stress-tests ideas). They do not change the underlying model or its knowledge.',
    category: 'getting-started',
    relatedTopic: 'personalities',
  },
  {
    id: 'faq-how-many-personalities',
    question: 'How many personalities are available?',
    answer:
      'There are 8 personalities: Default, Bestie, Brody, Devlin, George, Kai, Prof. Sage, and Scout. All are available to everyone.',
    category: 'getting-started',
    relatedTopic: 'personalities',
  },
  {
    id: 'faq-personality-affects-accuracy',
    question: 'Do personalities affect AI accuracy?',
    answer:
      'Personalities affect communication style, not factual accuracy. The same model may present information differently (for example, Prof. Sage vs Brody), but its underlying knowledge does not change.',
    category: 'getting-started',
    relatedTopic: 'personalities',
  },

  // ============================================
  // EXPERT MODE
  // ============================================
  {
    id: 'faq-what-is-expert-mode',
    question: 'What is Expert Mode?',
    answer:
      'Expert Mode lets you set default models and tune parameters like temperature, max tokens, and top-p. Set per-provider defaults in Settings > Model Defaults, or tap an AI pill in the composer and open Advanced Parameters to adjust just the current conversation. Available parameters vary by provider and model, and parameter tuning requires an active trial or subscription.',
    category: 'expert-mode',
    relatedTopic: 'expert-mode',
  },
  {
    id: 'faq-temperature-setting',
    question: 'What does temperature do?',
    answer:
      'Temperature controls creativity/randomness. Low temperature (0-0.5) gives focused, consistent responses - good for facts and coding. High temperature (1-2) gives more creative, varied responses - good for brainstorming and creative writing.',
    category: 'expert-mode',
    relatedTopic: 'expert-temperature',
  },
  {
    id: 'faq-max-tokens-setting',
    question: 'What are max tokens?',
    answer:
      'Max tokens limits response length. One token is roughly 4 characters or 0.75 words. 256 tokens ≈ 200 words (short answers), 1024 tokens ≈ 750 words (detailed responses), 4096 tokens ≈ 3000 words (long-form content).',
    category: 'expert-mode',
    relatedTopic: 'expert-tokens',
  },

  // ============================================
  // CHAT
  // ============================================
  {
    id: 'faq-what-is-web-search',
    question: 'How do I use web search with AI?',
    answer:
      'You don\'t have to do anything - web search is automatic. Models that support it search the web whenever it helps answer your question and include source citations in their response. Models without web search simply answer from their training data. There\'s no toggle to manage.',
    category: 'chat',
    relatedTopic: 'web-search',
  },
  {
    id: 'faq-web-search-providers',
    question: 'Which AIs support web search?',
    answer:
      'Web search is supported by Claude, ChatGPT (GPT-5.x and GPT-4.1 models), Gemini, Grok, and Perplexity (all Sonar models). Mistral, Cohere, and DeepSeek don\'t currently offer it. In multi-AI chats each AI is independent: the models that support search use it, and the rest respond normally.',
    category: 'chat',
    relatedTopic: 'web-search',
  },
  {
    id: 'faq-web-search-citations',
    question: 'How do citations work with web search?',
    answer:
      'Responses that used web search include numbered [n] citation chips inline and a Sources list below the message. Tap a citation to see a preview with the source title and URL, then open it in your browser. The same citation style is used across providers in Chat, Compare, and Debate.',
    category: 'chat',
    relatedTopic: 'web-search',
  },
  {
    id: 'faq-attachments',
    question: 'Can I send images or documents to the AIs?',
    answer:
      'Yes. Tap the attach button in the composer (or the + button in an active chat) to add images or documents - PDF, TXT, MD, CSV, JSON, XML, HTML, DOCX, XLSX, and PPTX are supported, up to 20 files per message. Attachments go to every AI in the lineup, so all selected models must support the file type.',
    category: 'chat',
    relatedTopic: 'attachments',
  },
  {
    id: 'faq-multi-ai-benefits',
    question: 'Why chat with multiple AIs at once?',
    answer:
      'Different AIs have different strengths and perspectives. Chatting with multiple AIs lets you get diverse viewpoints, fact-check between models, and have more dynamic conversations. It\'s like consulting multiple experts simultaneously.',
    category: 'chat',
    relatedTopic: 'multi-ai-chat',
  },
  {
    id: 'faq-compare-vs-multiChat',
    question: 'What\'s the difference between Compare Mode and Multi-AI Chat?',
    answer:
      'Compare Mode shows two AI responses side-by-side in a split view, making it easy to compare directly. Multi-AI Chat is a regular conversation where all selected AIs respond to your messages in sequence, creating a group discussion feel.',
    category: 'compare',
    relatedTopic: 'compare-mode',
  },
  {
    id: 'faq-hallucination-shield',
    question: 'What is the Hallucination Shield?',
    answer:
      'When multiple AIs respond to the same question, they act as fact-checkers for each other. If one AI gives information that differs significantly from others, it might be a "hallucination" (AI making things up). Cross-reference responses for accuracy.',
    category: 'chat',
    relatedTopic: 'multi-ai-chat',
  },
  {
    id: 'faq-chat-history',
    question: 'How long is chat history saved?',
    answer:
      'Chat history is stored locally on your device indefinitely until you delete it. There\'s no automatic expiration. You can clear individual sessions or all history from the History screen.',
    category: 'history',
    relatedTopic: 'history',
  },

  // ============================================
  // TROUBLESHOOTING
  // ============================================
  {
    id: 'faq-ai-not-responding',
    question: 'Why isn\'t the AI responding?',
    answer:
      'Check your internet connection and API key validity. Verify billing is enabled in the provider\'s dashboard. The provider might be experiencing outages - try a different AI. If streaming seems stuck, try closing and reopening the chat.',
    category: 'getting-started',
  },
  {
    id: 'faq-slow-responses',
    question: 'Why are responses slow?',
    answer:
      'Response speed depends on the model, your internet connection, and provider server load. Larger models and higher max token settings take longer. Try reducing max tokens for faster responses.',
    category: 'getting-started',
    relatedTopic: 'expert-tokens',
  },
  {
    id: 'faq-app-crashing',
    question: 'The app keeps crashing. What should I do?',
    answer:
      'Try force-closing and reopening the app. Clear the app cache if available. Ensure you\'re running the latest version. If problems persist, try reinstalling the app (your API keys are stored securely and will need to be re-entered).',
    category: 'getting-started',
  },

  // ============================================
  // CREATE MODE
  // ============================================
  {
    id: 'faq-what-is-create-mode',
    question: 'What is Create mode?',
    answer:
      'Create mode is Symposium AI\'s media generation workspace. You can generate and refine images with OpenAI, Google, and Grok, create videos with Runway, and generate voiceovers or sound effects with ElevenLabs.',
    category: 'create',
    relatedTopic: 'create-mode',
  },
  {
    id: 'faq-which-providers-generate-images',
    question: 'Which AI providers can generate images?',
    answer:
      'Image generation is supported by OpenAI (GPT Image models), Google (Gemini image models), and Grok. Each provider requires a valid API key. You can run up to 3 image models at once, and each model\'s settings sheet shows whether it can edit images and use references or creates from text prompts only.',
    category: 'create',
    relatedTopic: 'create-providers',
  },
  {
    id: 'faq-which-providers-generate-video-audio',
    question: 'Which providers generate video and audio?',
    answer:
      'Video generation is supported through Runway for text-to-video and image-to-video workflows. Audio generation is supported through ElevenLabs for voiceovers and sound effects. Configure those keys in API Configuration before using the Video or Audio tabs in Create mode.',
    category: 'create',
    relatedTopic: 'create-providers',
  },
  {
    id: 'faq-what-are-style-presets',
    question: 'What are style presets?',
    answer:
      'Style presets are artistic directions you can apply to your images from the Output Options sheet. Choose from 9 options: None, Photo, Cinematic, Anime, Digital Art, Oil Painting, Watercolor, Sketch, and 3D Render. Each style adds keywords to your prompt to guide the AI toward that aesthetic.',
    category: 'create',
    relatedTopic: 'create-styles',
  },
  {
    id: 'faq-what-is-image-refinement',
    question: 'What is image refinement (img2img)?',
    answer:
      'Image refinement starts from an existing image instead of a blank canvas. Attach a source image to the Studio composer - via the attach button, Output Options > Source image, or the Refine action on a gallery image - then describe your changes and send. Every selected model that can edit images produces a refined version.',
    category: 'create',
    relatedTopic: 'create-refinement',
  },
  {
    id: 'faq-where-are-images-saved',
    question: 'Where is my generated media saved?',
    answer:
      'Generated images, videos, and audio are saved to the in-app Gallery - open it from the tab row in the Studio. From there you can preview, save, share, refine, or delete assets. Images can also be used as the source for refinements or image-to-video generation.',
    category: 'create',
    relatedTopic: 'create-gallery',
  },
  {
    id: 'faq-image-generation-cost',
    question: 'How much does media generation cost?',
    answer:
      'Create mode uses your provider API keys and is billed by each provider. Costs vary by model, image size, video duration, audio length, and provider plan. Check OpenAI, Google, Grok, Runway, and ElevenLabs pricing pages before running large batches.',
    category: 'create',
    relatedTopic: 'byok-cost-savings',
  },
  {
    id: 'faq-image-not-generating',
    question: 'Why isn\'t my media generating?',
    answer:
      'Check that you have a valid API key for the selected provider and that billing or credits are enabled in their dashboard. Some prompts, source images, durations, or file types may be rejected by provider safety or format limits. Try simplifying your prompt, selecting a different model, or using another provider.',
    category: 'create',
    relatedTopic: 'create-mode',
  },
];

/**
 * Get FAQ items by category
 */
export function getFAQByCategory(category: HelpCategory): FAQItem[] {
  return FAQ_ITEMS.filter((item) => item.category === category);
}

/**
 * Search FAQ items
 */
export function searchFAQ(query: string): FAQItem[] {
  const lowercaseQuery = query.toLowerCase();
  return FAQ_ITEMS.filter(
    (item) =>
      item.question.toLowerCase().includes(lowercaseQuery) ||
      item.answer.toLowerCase().includes(lowercaseQuery)
  );
}
