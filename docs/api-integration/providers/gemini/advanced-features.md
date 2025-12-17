# Google Gemini API Advanced Features

## Multimodal Capabilities

### Vision / Image Input
```javascript
const imageRequest = {
  contents: [
    {
      parts: [
        {
          text: 'What is in this image?'
        },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64ImageData  // Base64 encoded image
          }
        }
      ]
    }
  ]
};

// Alternative: Image from URL (if supported)
const urlImageRequest = {
  contents: [
    {
      parts: [
        {
          text: 'Describe this image'
        },
        {
          fileData: {
            mimeType: 'image/jpeg',
            fileUri: 'gs://bucket-name/image.jpg'  // Google Cloud Storage
          }
        }
      ]
    }
  ]
};

const response = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(imageRequest)
  }
);
```

### Video Input
```javascript
const videoRequest = {
  contents: [
    {
      parts: [
        {
          text: 'Summarize this video'
        },
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: 'gs://bucket-name/video.mp4'
          }
        }
      ]
    }
  ]
};
```

### Audio Input
```javascript
const audioRequest = {
  contents: [
    {
      parts: [
        {
          text: 'Transcribe this audio'
        },
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: base64AudioData
          }
        }
      ]
    }
  ]
};

// Audio pricing: $1.00 per 1M tokens
```

### Image Generation

Gemini supports native image generation through specific image-generation models. Use `responseModalities` to request image output along with text.

```javascript
// Image generation with Gemini
const imageGenRequest = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + process.env.GEMINI_API_KEY,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: 'A futuristic city at sunset with flying cars' }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: '16:9'  // Options: '1:1', '16:9', '9:16', '4:3', '3:4'
        }
      }
    })
  }
);

const result = await imageGenRequest.json();

// Response structure:
// {
//   "candidates": [{
//     "content": {
//       "parts": [
//         { "text": "Here's the image..." },
//         {
//           "inlineData": {
//             "data": "base64-encoded-image...",
//             "mimeType": "image/png"
//           }
//         }
//       ]
//     }
//   }]
// }
```

**Available Image Generation Models:**
- `gemini-2.5-flash-image` - Production-ready, fast image generation
- `gemini-3-pro-image-preview` - Higher quality, preview availability

**Aspect Ratio Options:**
- `1:1` - Square (default)
- `16:9` - Landscape (widescreen)
- `9:16` - Portrait (mobile/stories)
- `4:3` - Standard landscape
- `3:4` - Standard portrait

**Note**: Unlike OpenAI's DALL-E, Gemini uses aspect ratios instead of pixel dimensions.

## Live API (Real-Time Multimodal)

### WebSocket Connection
```javascript
// Live API uses WebSockets for low-latency interactions
const ws = new WebSocket('wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:live');

ws.on('open', () => {
  // Send authentication
  ws.send(JSON.stringify({
    setup: {
      apiKey: process.env.GEMINI_API_KEY
    }
  }));
  
  // Configure session
  ws.send(JSON.stringify({
    setup: {
      model: 'gemini-2.0-flash',
      config: {
        responseModalities: ['AUDIO', 'TEXT'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Aoede'  // One of 30+ available voices
            }
          }
        }
      }
    }
  }));
});

// Send real-time audio/video
ws.on('message', (data) => {
  const response = JSON.parse(data);
  // Handle real-time responses
});
```

### Voice Activity Detection
```javascript
const liveConfig = {
  config: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceActivityDetection: {
        enabled: true,
        silenceThreshold: 0.5
      }
    }
  }
};
```

## Function Calling / Tools

### Define Functions
```javascript
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit']
            }
          },
          required: ['location']
        }
      }
    ]
  }
];

const response = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: 'What\'s the weather in San Francisco?' }
          ]
        }
      ],
      tools: tools
    })
  }
);

// Check for function calls in response
const result = await response.json();
const functionCall = result.candidates[0].content.parts.find(
  part => part.functionCall
);

if (functionCall) {
  // Execute the function
  const functionResult = await executeFunction(
    functionCall.functionCall.name,
    functionCall.functionCall.args
  );
  
  // Send result back to Gemini
  const followUp = await fetch(/* ... */, {
    body: JSON.stringify({
      contents: [
        // Original message
        { role: 'user', parts: [{ text: 'What\'s the weather in San Francisco?' }] },
        // Model's function call
        { role: 'model', parts: [functionCall] },
        // Function result
        {
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: functionCall.functionCall.name,
                response: functionResult
              }
            }
          ]
        }
      ]
    })
  });
}
```

### Compositional Function Calling (Gemini 2.0+)
```javascript
// Gemini can automatically chain multiple functions
const tools = [
  {
    functionDeclarations: [
      { name: 'search_web', /* ... */ },
      { name: 'summarize_text', /* ... */ },
      { name: 'translate', /* ... */ }
    ]
  }
];

// Gemini will automatically call multiple functions as needed
const request = {
  contents: [
    {
      parts: [
        { text: 'Search for recent AI news and translate the summary to Spanish' }
      ]
    }
  ],
  tools: tools,
  toolConfig: {
    functionCallingConfig: {
      mode: 'AUTO'  // Let Gemini decide which functions to call
    }
  }
};
```

## Code Execution

### Enable Code Execution
```javascript
const codeExecutionRequest = {
  contents: [
    {
      parts: [
        { text: 'Calculate the factorial of 10' }
      ]
    }
  ],
  tools: [
    {
      codeExecution: {}  // Enable code execution
    }
  ]
};

// Gemini will write and execute Python code
// Response will include both code and execution results
```

## Google Search Grounding

### Enable Search Integration
```javascript
const searchGroundedRequest = {
  contents: [
    {
      parts: [
        { text: 'What are the latest developments in quantum computing?' }
      ]
    }
  ],
  tools: [
    {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC',
          dynamicThreshold: 0.3  // Confidence threshold
        }
      }
    }
  ]
};

// Response will include sources and citations
```

## Thinking Mode (Gemini 2.5)

### Configure Thinking Budget
```javascript
const thinkingRequest = {
  contents: [
    {
      parts: [
        { text: 'Solve this complex logic puzzle...' }
      ]
    }
  ],
  generationConfig: {
    thinkingConfig: {
      thinkingBudget: 'medium'  // Options: off, low, medium, high
    }
  }
};

// Thinking tokens cost $3.50 per 1M for Flash
```

### Dynamic Thinking Control
```javascript
// Gemini 2.5 Flash-Lite has thinking off by default
const liteThinkingRequest = {
  model: 'gemini-2.5-flash-lite',
  generationConfig: {
    thinkingConfig: {
      enabled: true,  // Turn on thinking
      budget: 5000    // Set token budget for thinking
    }
  }
};
```

## Structured Output

### JSON Mode
```javascript
const jsonRequest = {
  contents: [
    {
      parts: [
        { text: 'List 3 debate topics in JSON format' }
      ]
    }
  ],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              category: { type: 'string' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }
            },
            required: ['title', 'category', 'difficulty']
          }
        }
      },
      required: ['topics']
    }
  }
};
```

## Context Caching

### Cache Long Contexts
```javascript
// First request - cache the context
const cacheRequest = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/cachedContents',
  {
    method: 'POST',
    headers: {
      'x-goog-api-key': process.env.GEMINI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'models/gemini-2.5-flash',
      contents: [
        {
          parts: [
            { text: 'Very long document or context...' }  // Up to 1M tokens
          ]
        }
      ],
      ttl: '3600s'  // Cache for 1 hour
    })
  }
);

const cacheData = await cacheRequest.json();
const cacheId = cacheData.name;

// Use cached context in subsequent requests
const cachedContentRequest = {
  cachedContent: cacheId,
  contents: [
    {
      parts: [
        { text: 'Question about the cached document' }
      ]
    }
  ]
};
```

## Safety Settings

### Configure Content Filtering
```javascript
const safetySettings = [
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_LOW_AND_ABOVE'
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_MEDIUM_AND_ABOVE'
  }
];

const request = {
  contents: [/* ... */],
  safetySettings: safetySettings
};
```

## Native Audio (Live API)

### 30+ Voice Options
```javascript
const voiceConfig = {
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: 'Aoede'  // Female voice
        // Other options: Charon, Fenrir, Kore, Puck, etc.
      }
    }
  }
};
```

### Proactive Audio Responses
```javascript
// Enable proactive responses
const proactiveConfig = {
  config: {
    responseModalities: ['AUDIO', 'TEXT'],
    speechConfig: {
      proactiveAudio: {
        enabled: true,
        emotionalTone: true  // Respond to emotional cues
      }
    }
  }
};
```

## Performance Optimizations

### 1. Token-Efficient Requests
```javascript
class GeminiOptimizer {
  optimizeRequest(content, maxTokens = 100000) {
    // Estimate tokens (roughly 1 token per 4 characters)
    const estimatedTokens = content.length / 4;
    
    if (estimatedTokens > maxTokens) {
      // Truncate or summarize content
      return this.truncateContent(content, maxTokens);
    }
    
    return content;
  }
  
  selectOptimalModel(task) {
    if (task.requiresThinking) {
      return 'gemini-2.5-pro';  // Best reasoning
    }
    
    if (task.volume > 1000 && task.simple) {
      return 'gemini-2.5-flash-lite';  // $0.10/$0.40
    }
    
    return 'gemini-2.5-flash';  // Balanced at $0.15/$0.60
  }
}
```

### 2. Batch Processing
```javascript
// Process multiple requests efficiently
async function batchProcess(requests) {
  const promises = requests.map(req => 
    fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req)
      }
    )
  );
  
  // Be mindful of rate limits
  const results = [];
  for (let i = 0; i < promises.length; i += 5) {
    const batch = promises.slice(i, i + 5);
    const batchResults = await Promise.allSettled(batch);
    results.push(...batchResults);
    
    // Wait between batches to avoid rate limits
    if (i + 5 < promises.length) {
      await new Promise(resolve => setTimeout(resolve, 12000)); // Free tier: 5 RPM
    }
  }
  
  return results;
}
```

## Integration Tips for Debates

### 1. Multimodal Debates
```javascript
// Enable debates about images or videos
const visualDebate = {
  contents: [
    {
      parts: [
        { text: 'Debate the artistic merit of this painting' },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: paintingBase64
          }
        }
      ]
    }
  ]
};
```

### 2. Real-Time Voice Debates (Live API)
```javascript
// Use Live API for voice-based debates
const voiceDebateConfig = {
  model: 'gemini-2.0-flash',
  config: {
    responseModalities: ['AUDIO', 'TEXT'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Charon'  // Choose appropriate voice
        }
      }
    }
  }
};
```

### 3. Fact-Checked Debates
```javascript
// Use Google Search grounding for fact-checking
const factCheckedDebate = {
  contents: [/* debate content */],
  tools: [
    {
      googleSearchRetrieval: {
        dynamicRetrievalConfig: {
          mode: 'MODE_DYNAMIC'
        }
      }
    }
  ]
};
```

### 4. Structured Debate Scoring
```javascript
// Get structured JSON output for scoring
const scoringRequest = {
  contents: [/* debate transcript */],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        scores: {
          type: 'object',
          properties: {
            team1: { type: 'number', minimum: 0, maximum: 100 },
            team2: { type: 'number', minimum: 0, maximum: 100 }
          }
        },
        winner: { type: 'string' },
        keyPoints: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  }
};
```

## Unique Gemini Features

1. **1M Token Context**: Process entire books or long documents
2. **Native Multimodal**: Text, image, audio, video in single request
3. **Live API**: Real-time voice and video interactions via WebSocket
4. **30+ Voices**: Multiple languages and emotional tones
5. **Google Search**: Built-in web search grounding
6. **Code Execution**: Run Python code within responses
7. **Thinking Mode**: Configurable reasoning with budget control
8. **Compositional Functions**: Automatic function chaining