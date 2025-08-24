# Known Issues

## GPT-5 Latency Issues (OpenAI API)

### Issue Description
GPT-5 models experience significant latency when generating responses, with delays ranging from 40 to 150 seconds before the first token is received. This is a known issue with OpenAI's API affecting all GPT-5 users globally as of August 2025.

### Affected Models
- `gpt-5`
- `gpt-5-mini` 
- `gpt-5-nano`

### Symptoms
- 40-150 second delay before streaming starts
- Initial connection succeeds but no data flows for extended periods
- Once streaming begins, it may complete quickly or arrive all at once
- Non-streaming requests also experience similar delays

### Root Cause
This is an OpenAI API infrastructure issue, not a problem with our implementation. Multiple sources confirm:
- Developer community reports show GPT-5 takes ~40 seconds for basic queries while GPT-4.1 takes ~2 seconds
- Reddit threads with thousands of users reporting similar issues
- OpenAI's "unified system" routing may be causing unpredictable performance

### Our Implementation
We've implemented the new Responses API required for GPT-5:
- `GPT5ResponsesAdapter` uses the new `/v1/responses` endpoint
- Supports semantic events (`response.created`, `response.output_text.delta`, etc.)
- Automatically routes GPT-5 models to the correct adapter

### Workarounds
1. **Use GPT-4o instead** - Significantly faster with comparable quality
2. **Expect delays** - The app displays a warning when GPT-5 is selected
3. **Non-streaming mode** - May be slightly more reliable but still slow

### User Experience Improvements
- Warning banner displayed when GPT-5 is selected
- Clear messaging about expected delays
- Option to switch to GPT-4o with one click
- Dismissible warning with "Don't show again" option

### References
- [GPT-5 is very slow compared to 4.1 (Responses API)](https://community.openai.com/t/gpt-5-is-very-slow-compared-to-4-1-responses-api/1337859)
- [GPT-5 + Responses API is extremely slow](https://community.openai.com/t/gpt-5-responses-api-is-extremely-slow/1338478)
- [Reddit: GPT-5 launch criticism](https://www.reddit.com/r/ChatGPT/comments/gpt5horrible)

### Status
Waiting for OpenAI to address the infrastructure issues. The implementation is correct and follows OpenAI's documentation for the new Responses API.

---

## Other Known Issues

### Claude Overload Errors
- Claude may return overload errors during high traffic periods
- The app automatically falls back to non-streaming mode when this occurs
- Error messages are displayed clearly in the UI

### Document Attachments with OpenAI
- OpenAI's Chat Completions API doesn't support document attachments
- Only images are supported for OpenAI models
- Claude supports both images and PDFs

### Streaming Verification Requirements
- Some OpenAI accounts require organization verification for streaming
- The app automatically falls back to non-streaming when verification is required
- A one-time verification may be needed through OpenAI's dashboard