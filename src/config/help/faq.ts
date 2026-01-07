/**
 * FAQ Content
 *
 * Frequently asked questions organized by category.
 */

import { FAQItem, HelpCategory } from './types';

export const FAQ_ITEMS: FAQItem[] = [
  // ============================================
  // GETTING STARTED
  // ============================================
  {
    id: 'faq-what-is-symposium',
    question: 'What is Symposium AI?',
    answer:
      'Symposium AI is a mobile app that lets you chat with multiple AI providers (like ChatGPT, Claude, and Gemini) simultaneously. Our signature feature is the AI Debate Arena, where you can watch different AIs debate any topic in real-time.',
    category: 'getting-started',
  },
  {
    id: 'faq-do-i-need-account',
    question: 'Do I need to create an account?',
    answer:
      'No account is required to use Symposium AI. Your data and API keys are stored locally on your device. You only need to provide your own API keys from AI providers to start chatting.',
    category: 'getting-started',
  },
  {
    id: 'faq-is-it-free',
    question: 'Is Symposium AI free?',
    answer:
      'The app includes a demo mode with pre-recorded content so you can explore without API keys. Live chats, debates, and comparisons require your own provider API keys plus an active trial or subscription. Provider API usage has its own costs.',
    category: 'getting-started',
    relatedTopic: 'byok-overview',
  },

  // ============================================
  // BYOK
  // ============================================
  {
    id: 'faq-what-is-byok',
    question: 'What is BYOK and why should I use it?',
    answer:
      'BYOK (Bring Your Own Keys) means you provide your own API keys from AI providers. This is more cost-effective than multiple subscriptions - you pay only for what you use. For example, instead of $60/month for ChatGPT Plus + Claude Pro + Gemini Advanced, most users spend $5-15/month on API usage.',
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
      'The AI Debate Arena is our signature feature where two AIs debate any topic you choose. You select the topic, format, and debaters, then watch them exchange arguments in real-time. After the debate, you can vote on who made the better case.',
    category: 'debate-arena',
    relatedTopic: 'debate-arena',
  },
  {
    id: 'faq-debate-formats-difference',
    question: 'What\'s the difference between debate formats?',
    answer:
      'Oxford is traditional formal debate. Lincoln-Douglas focuses on values and ethics. Policy emphasizes evidence and practical solutions. Socratic uses questions to explore ideas. Each format produces different styles of argument and exchange.',
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
      'Ensure you have at least two AIs configured with valid API keys. Both AIs must be selected for the debate. Check that you\'ve chosen a topic and format. If issues persist, verify your API keys are working in regular chat first.',
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
      'Expert Mode lets you set a default model and tune parameters like temperature, max tokens, and top-p per provider. It is available once you add API keys, and parameter availability varies by provider.',
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
      'Look for the globe icon next to the message input. Tap it to enable web search (the icon will highlight). When enabled, the AI will search the web for current information and include source citations in its response. The toggle only appears when your selected AI supports web search.',
    category: 'chat',
    relatedTopic: 'web-search',
  },
  {
    id: 'faq-web-search-providers',
    question: 'Which AIs support web search?',
    answer:
      'Web search is supported by ChatGPT (GPT-5.x, GPT-4.x models), Gemini (2.0+ models), and Perplexity (all Sonar models). Claude does not currently support web search. In multi-AI mode, all selected AIs must support web search for the toggle to appear.',
    category: 'chat',
    relatedTopic: 'web-search',
  },
  {
    id: 'faq-web-search-citations',
    question: 'How do citations work with web search?',
    answer:
      'When web search is enabled, responses include clickable source links. Tap any link to see a preview with the source title and URL, then choose "View Source" to open it in a browser. Citations appear both inline in the text and as a list below the response.',
    category: 'chat',
    relatedTopic: 'web-search',
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
      'Create mode is Symposium AI\'s image generation feature. You can generate images using AI providers like OpenAI (DALL-E), Google (Imagen), and Grok. Enter a prompt, choose a style and size, then generate images from multiple providers simultaneously.',
    category: 'create',
    relatedTopic: 'create-mode',
  },
  {
    id: 'faq-which-providers-generate-images',
    question: 'Which AI providers can generate images?',
    answer:
      'Image generation is supported by OpenAI (using DALL-E), Google (using Imagen), and Grok. Each provider requires a valid API key. Providers that support image refinement (img2img) display a special badge in the selection screen.',
    category: 'create',
    relatedTopic: 'create-providers',
  },
  {
    id: 'faq-what-are-style-presets',
    question: 'What are style presets?',
    answer:
      'Style presets are artistic directions you can apply to your images. Choose from 9 options: None, Photo, Cinematic, Anime, Digital Art, Oil Painting, Watercolor, Sketch, and 3D Render. Each style adds keywords to your prompt to guide the AI toward that aesthetic.',
    category: 'create',
    relatedTopic: 'create-styles',
  },
  {
    id: 'faq-what-is-image-refinement',
    question: 'What is image refinement (img2img)?',
    answer:
      'Image refinement lets you use an existing image as a starting point and modify it with a new prompt. You can refine images from your gallery or upload your own photos. This is great for iterating on ideas or changing the style of an image.',
    category: 'create',
    relatedTopic: 'create-refinement',
  },
  {
    id: 'faq-where-are-images-saved',
    question: 'Where are my generated images saved?',
    answer:
      'Generated images are automatically saved to your in-app gallery and persist across app sessions. From the gallery, you can save images to your device\'s photo library, share them, use them for refinement, or delete them.',
    category: 'create',
    relatedTopic: 'create-gallery',
  },
  {
    id: 'faq-image-generation-cost',
    question: 'How much does image generation cost?',
    answer:
      'Image generation uses your API keys and is billed by each provider. Costs vary: OpenAI DALL-E charges per image (typically $0.02-0.08 depending on size/quality), Google Imagen has similar pricing, and Grok pricing varies. Check each provider\'s pricing page for current rates.',
    category: 'create',
    relatedTopic: 'byok-cost-savings',
  },
  {
    id: 'faq-image-not-generating',
    question: 'Why isn\'t my image generating?',
    answer:
      'Check that you have a valid API key for the selected provider and that billing is enabled in their dashboard. Some prompts may be rejected by provider safety filters. Try simplifying your prompt or selecting a different provider.',
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
