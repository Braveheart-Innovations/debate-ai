# Known Issues

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