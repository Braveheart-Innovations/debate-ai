# Grok 4 API Advanced Features

## Multimodal Capabilities

### Current Status (2025)
Grok 4 currently supports:
- ✅ **Text**: Full support
- ✅ **Vision**: Image understanding (in API)
- ✅ **Image Generation**: Available via `grok-2-image` model
- 🔜 **Audio**: Voice capabilities planned
- 🔜 **Video**: On roadmap

### Vision / Image Input

```javascript
// Image input support (when available)
const imageMessage = {
  model: 'grok-4',
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What is in this image?'
        },
        {
          type: 'image_url',
          image_url: {
            url: 'data:image/jpeg;base64,${base64Image}'
          }
        }
      ]
    }
  ]
};

const response = await fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(imageMessage)
});
```

### Image Generation

Grok's image generation API uses the `grok-2-image` model. Note that **size, quality, and style parameters are NOT supported** - the API generates images at a fixed size.

```javascript
// Image generation endpoint
const imageGeneration = await fetch('https://api.x.ai/v1/images/generations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'grok-2-image',
    prompt: 'A futuristic city at sunset',
    n: 1,  // Number of images (1-10)
    response_format: 'url'  // 'url' or 'b64_json'
  })
});

// Response format
// {
//   "data": [
//     { "url": "https://..." }
//   ]
// }
```

**Important**: Unlike OpenAI's DALL-E, Grok does not support:
- `size` parameter (images are generated at a fixed size)
- `quality` parameter
- `style` parameter

Style hints should be included directly in your prompt (e.g., "in watercolor style", "photorealistic", etc.).

## Function Calling / Tool Use

### Native Tool Integration
Grok 4 supports function calling for external tool integration:

```javascript
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather in a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City and state, e.g. San Francisco, CA'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit']
          }
        },
        required: ['location']
      }
    }
  }
];

const response = await fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'grok-4',
    messages: [
      { role: 'user', content: 'What\'s the weather in San Francisco?' }
    ],
    tools: tools,
    tool_choice: 'auto'
  })
});

const result = await response.json();
const message = result.choices[0].message;

// Check if tool was called
if (message.tool_calls) {
  for (const toolCall of message.tool_calls) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);
    
    // Execute the function locally
    const functionResult = await executeFunction(functionName, args);
    
    // Send result back to Grok
    const followUp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { /* same headers */ },
      body: JSON.stringify({
        model: 'grok-4',
        messages: [
          { role: 'user', content: 'What\'s the weather in San Francisco?' },
          message, // Previous Grok response with tool_calls
          {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult)
          }
        ]
      })
    });
  }
}
```

### Multiple Tool Calls
```javascript
// Grok can determine multiple tools needed
const tools = [
  { type: 'function', function: { name: 'get_weather', /* ... */ } },
  { type: 'function', function: { name: 'get_news', /* ... */ } },
  { type: 'function', function: { name: 'search_web', /* ... */ } }
];

// Grok may call multiple tools in response
```

## Live Search Integration

### Real-Time X (Twitter) Data
Grok 4 has unique access to live data from X:

```javascript
// Live search is integrated natively
const response = await fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'grok-4',
    messages: [
      {
        role: 'user',
        content: 'What are people saying about the latest SpaceX launch on X?'
      }
    ],
    // Live search is automatic when needed
  })
});

// Cost: $25 per 1,000 sources used ($0.025 per source)
```

### Web Search Capabilities
```javascript
// Grok automatically searches when needed
const response = await fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'grok-4',
    messages: [
      {
        role: 'user',
        content: 'What are the latest developments in quantum computing?'
      }
    ]
  })
});

// Response will include real-time information from web and X
```

## Extended Context Window

### 256K Token Context
```javascript
// Grok 4 Heavy supports up to 256K tokens
const longContextRequest = {
  model: 'grok-4',  // or 'grok-4-heavy' for guaranteed 256K
  messages: [
    {
      role: 'system',
      content: 'You are analyzing a large document...'
    },
    {
      role: 'user',
      content: veryLongDocument  // Up to 256K tokens
    }
  ]
};

// Pricing notes:
// - Up to 128K: Standard pricing ($3/$15 per 1M)
// - Above 128K: Higher rates apply
```

## Cached Inputs

### 75% Cost Savings
```javascript
// Cached inputs cost only $0.75 per 1M tokens
const cachedRequest = {
  model: 'grok-4',
  messages: [
    {
      role: 'system',
      content: 'Long system prompt that will be cached...',
      // This will be cached automatically for repeated use
    },
    {
      role: 'user',
      content: 'New user question'
    }
  ]
};

// Subsequent requests with same system prompt get 75% discount
```

## Multi-Turn Conversations

### Building Context
```javascript
class GrokConversation {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.messages = [];
  }

  async addMessage(role, content) {
    this.messages.push({ role, content });
    
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-4',
        messages: this.messages,
        stream: true  // Stream for real-time responses
      })
    });

    // Handle streaming response
    const assistantMessage = await this.handleStream(response);
    this.messages.push({ role: 'assistant', content: assistantMessage });
    
    return assistantMessage;
  }

  async handleStream(response) {
    // Implementation for handling SSE stream
    let fullResponse = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // Parse SSE events and accumulate response
      // ... (streaming logic)
      fullResponse += parsedContent;
    }
    
    return fullResponse;
  }
}
```

## Voice Capabilities (Eve Assistant)

### British-Accented Voice
```javascript
// When voice features are available
const voiceRequest = {
  model: 'grok-4',
  messages: [
    {
      role: 'user',
      content: 'Hello, Eve!'
    }
  ],
  voice: {
    enabled: true,
    persona: 'eve',  // British-accented assistant
    output_format: 'mp3'
  }
};
```

## Performance Optimization

### Output Speed
- **Standard**: ~75-90 tokens per second
- **Optimized**: Token-by-token streaming for perceived speed

### Parallel Processing
```javascript
async function parallelGrokRequests(queries) {
  const promises = queries.map(query => 
    fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'grok-4',
        messages: [{ role: 'user', content: query }]
      })
    })
  );
  
  return await Promise.allSettled(promises);
}
```

## SDK Compatibility

### OpenAI SDK
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.GROK_API_KEY
});

// Use exactly like OpenAI
const completion = await client.chat.completions.create({
  model: 'grok-4',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
});

for await (const chunk of completion) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### Anthropic SDK Compatibility
```javascript
// Similar compatibility with Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';

// Configure to use Grok endpoint
const anthropic = new Anthropic({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.GROK_API_KEY
});
```

## Unique Grok Features

### 1. Real-Time X Integration
- Direct access to live X (Twitter) data
- Real-time trending topics and discussions
- Social sentiment analysis

### 2. Native Reasoning Mode
- Always in reasoning mode (no toggle needed)
- Enhanced logical deduction
- Step-by-step problem solving

### 3. Frontier Multimodal (Coming)
- Vision, audio, and video processing
- Unified API for all modalities
- Cross-modal understanding

## Integration Tips for Debates

### 1. Leverage Live Data
```javascript
// Use Grok's unique X access for real-time context
const debateWithLiveContext = {
  model: 'grok-4',
  messages: [
    {
      role: 'user',
      content: 'Debate the current public sentiment on climate policy based on X discussions'
    }
  ]
};
```

### 2. Extended Context for Long Debates
```javascript
// Use 256K context for maintaining full debate history
const longDebate = {
  model: 'grok-4-heavy',  // Maximum context
  messages: entireDebateHistory  // Can be very long
};
```

### 3. Multi-Turn Reasoning
```javascript
// Grok 4's native reasoning excels at debate logic
const reasoningDebate = {
  model: 'grok-4',
  messages: [
    {
      role: 'system',
      content: 'You are a debate participant. Analyze arguments logically and provide counterpoints.'
    },
    // Debate history...
  ]
};
```

## Cost Optimization Strategies

### 1. Use Cached Inputs
- System prompts are cached automatically
- 75% discount on repeated content

### 2. Model Selection
```javascript
function selectGrokModel(task) {
  if (task.requiresLiveData) {
    return 'grok-4';  // Has X integration
  }
  
  if (task.contextSize > 128000) {
    return 'grok-4-heavy';  // 256K context
  }
  
  if (task.simple && task.highVolume) {
    return 'grok-3-mini';  // Lowest cost
  }
  
  return 'grok-4';  // Default
}
```

### 3. Optimize Search Usage
- Live search costs $0.025 per source
- Cache search results when possible
- Batch related queries

## Error Handling for Advanced Features

```javascript
try {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      model: 'grok-4',
      messages: [ /* ... */ ],
      tools: [ /* ... */ ]
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    // Handle specific Grok 4 errors
    if (error.message?.includes('presencePenalty')) {
      console.error('Grok 4 does not support presence penalty');
    }
    
    if (error.message?.includes('reasoning_effort')) {
      console.error('Grok 4 does not use reasoning_effort parameter');
    }
  }
} catch (error) {
  console.error('Request failed:', error);
}
```