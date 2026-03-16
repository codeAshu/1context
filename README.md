# Prompt Broadcaster

A Chrome extension that broadcasts your prompts to ChatGPT, Gemini, and Claude simultaneously with AI-powered prompt improvement and local memory.

## Features

- **One prompt, three models**: Type once in ChatGPT, automatically send to Gemini and Claude
- **AI-powered prompt improvement**: Uses GPT-4o-mini to enhance your prompts before sending
- **Local memory system**: Tracks all your conversations using IndexedDB
- **Memory distillation**: Automatically summarizes patterns from your conversation history
- **Export/Import**: Save and load your memory as JSON files

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/codeAshu/prompt-broadcaster.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the `prompt-broadcaster` folder

5. Click the extension icon and enter your OpenAI API key

## Usage

1. Go to [ChatGPT](https://chatgpt.com)
2. Type your prompt as usual
3. When you submit, the extension will:
   - Improve your prompt using GPT-4o-mini (with memory context)
   - Submit the improved prompt to ChatGPT
   - Open new tabs for Gemini and Claude with the same prompt auto-submitted

## Configuration

Click the extension icon to access settings:

- **Toggle on/off**: Enable or disable the broadcaster
- **API Key**: Enter your OpenAI API key (required for prompt improvement)
- **View History**: See your conversation history
- **Export/Import**: Backup or restore your memory as JSON
- **Clear All**: Reset all stored data

## File Structure

```
prompt-broadcaster/
├── manifest.json           # Extension configuration
├── background.js           # Service worker for API calls
├── content/
│   ├── chatgpt.js         # Intercepts ChatGPT submissions
│   ├── gemini.js          # Auto-submits to Gemini
│   └── claude.js          # Auto-submits to Claude
├── lib/
│   ├── memory.js          # IndexedDB memory system
│   └── openai.js          # OpenAI API client
├── popup/
│   ├── popup.html         # Settings UI
│   ├── popup.js           # Settings logic
│   └── popup.css          # Styles
└── icons/
    └── icon128.png        # Extension icon
```

## How It Works

1. **Interception**: Content script on ChatGPT detects when you submit a prompt
2. **Enhancement**: Background worker calls OpenAI API to improve the prompt using your memory context
3. **Broadcasting**: Opens Gemini and Claude tabs, injects the improved prompt
4. **Memory**: Stores your prompt in IndexedDB, periodically distills into summaries

## Privacy

- All data is stored locally in your browser (IndexedDB)
- API calls go directly to OpenAI from your browser
- No data is sent to any third-party servers
- You can export and delete your data anytime

## Requirements

- Chrome browser
- OpenAI API key (for prompt improvement feature)

## License

MIT
