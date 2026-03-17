# 1Context

**Write once. Think everywhere.**

A Chrome extension that sends your prompts to ChatGPT, Claude, and Gemini simultaneously — with intelligent memory that learns your context.

## Features

- **One prompt, three models**: Type once, broadcast to ChatGPT, Claude, and Gemini
- **Split window view**: Opens all three AI chats side-by-side for easy comparison
- **AI-powered prompt improvement**: Uses GPT-4o-mini to enhance your prompts
- **Local memory system**: Tracks all your conversations using IndexedDB
- **Memory distillation**: Automatically summarizes patterns from your history
- **Own your context**: Export, import, and control your AI memory
- **Privacy first**: All data stays in your browser

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/video-db/1context.git
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the `1context` folder

5. Click the extension icon to open the side panel

6. Go to Settings (gear icon) and enter your OpenAI API key

## Usage

### Method 1: Side Panel (Recommended)

1. Click the extension icon or press `Cmd+Shift+P` (Mac) / `Ctrl+Shift+P` (Windows)
2. Type your prompt in the side panel
3. Click "Broadcast to All"
4. Three windows open side-by-side with ChatGPT, Claude, and Gemini
5. Your improved prompt is automatically submitted to each

### Method 2: ChatGPT Interception

1. Go to [ChatGPT](https://chatgpt.com)
2. Type your prompt as usual
3. When you submit, the extension:
   - Improves your prompt using GPT-4o-mini
   - Opens new tabs for Gemini and Claude
   - Submits the improved prompt to all three

## Window Layouts

Choose your preferred layout in Settings:

- **Horizontal**: Three windows side-by-side (default)
- **Vertical**: Three windows stacked vertically
- **Grid**: 2x2 grid layout

## Keyboard Shortcuts

- `Cmd+Shift+P` / `Ctrl+Shift+P`: Open side panel
- `Cmd+Enter` / `Ctrl+Enter`: Broadcast prompt (when in side panel)

## Configuration

Click the gear icon in the side panel:

- **API Key**: Enter your OpenAI API key (required for prompt improvement)
- **Window Layout**: Choose horizontal, vertical, or grid
- **Export/Import**: Backup or restore your memory as JSON
- **Clear All**: Reset all stored data

## How It Works

1. **Input**: Enter prompt in side panel or ChatGPT
2. **Memory Context**: Retrieves relevant memories from your history
3. **Enhancement**: OpenAI improves the prompt with context
4. **Broadcast**: Opens split windows for all three AI platforms
5. **Injection**: Content scripts inject the prompt into each UI
6. **Storage**: Saves your prompt to local memory (IndexedDB)
7. **Distillation**: Periodically summarizes patterns into memory chunks

## Privacy

- All data stored locally in your browser (IndexedDB)
- API calls go directly from your browser to OpenAI
- No data sent to third-party servers
- Export and delete your data anytime

## Requirements

- Chrome browser (v114+ for side panel support)
- OpenAI API key (for prompt improvement)

## License

MIT
