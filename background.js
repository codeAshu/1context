// Background service worker for Prompt Broadcaster

import { MemorySystem } from './lib/memory.js';
import { OpenAIClient } from './lib/openai.js';

class PromptBroadcaster {
  constructor() {
    this.memorySystem = null;
    this.openaiClient = null;
    this.isEnabled = true;
    this.isInitialized = false;
    this.initPromise = this.initialize();
  }

  async initialize() {
    try {
      console.log('PromptBroadcaster: Initializing...');

      this.memorySystem = new MemorySystem();
      await this.memorySystem.init();

      const stored = await chrome.storage.local.get(['openaiApiKey', 'isEnabled']);
      this.openaiClient = new OpenAIClient(stored.openaiApiKey || '');
      this.isEnabled = stored.isEnabled !== false;
      this.isInitialized = true;

      console.log('PromptBroadcaster: Ready', {
        hasApiKey: !!stored.openaiApiKey,
        isEnabled: this.isEnabled
      });
    } catch (error) {
      console.error('PromptBroadcaster: Init failed', error);
      this.openaiClient = new OpenAIClient('');
    }
  }

  async ensureReady() {
    await this.initPromise;
    return this.isInitialized;
  }

  async handleMessage(message, sender) {
    await this.ensureReady();

    const handlers = {
      'BROADCAST_PROMPT': () => this.broadcast(message.prompt, message.systemPrompt),
      'BROADCAST_SPLIT': () => this.broadcastSplit(message.prompt, message.layout, message.systemPrompt, message.enhanceAll),
      'GET_PENDING_PROMPT': () => this.getPendingPrompt(sender),
      'CLEAR_PENDING_PROMPT': () => this.clearPendingPrompt(sender),
      'SET_API_KEY': () => this.setApiKey(message.apiKey),
      'SET_ENABLED': () => this.setEnabled(message.enabled),
      'GET_STATUS': () => this.getStatus(),
      'GET_MEMORIES': () => this.getMemories(),
      'GET_CONVERSATIONS': () => this.getConversations(),
      'CLEAR_MEMORY': () => this.clearMemory(),
      'IMPORT_MEMORY': () => this.importMemory(message.data),
      'UPDATE_MEMORY': () => this.updateMemory(message.id, message.summary),
      'DELETE_MEMORY': () => this.deleteMemory(message.id)
    };

    const handler = handlers[message.type];
    if (!handler) {
      console.warn('Unknown message:', message.type);
      return { error: 'Unknown message type' };
    }

    return handler();
  }

  async broadcast(originalPrompt, systemPrompt = '') {
    if (!this.isEnabled) {
      return { improved: originalPrompt, broadcasted: false };
    }

    try {
      const enhancedPrompt = await this.improveAndSave(originalPrompt, systemPrompt);

      // Store both original and enhanced prompts
      await chrome.storage.local.set({
        pendingPromptOriginal: originalPrompt,
        pendingPromptEnhanced: enhancedPrompt
      });

      await Promise.all([
        chrome.tabs.create({ url: 'https://gemini.google.com/app', active: false }),
        chrome.tabs.create({ url: 'https://claude.ai/new', active: false })
      ]);

      return { improved: enhancedPrompt, broadcasted: true };
    } catch (error) {
      console.error('Broadcast error:', error);
      return { improved: originalPrompt, broadcasted: false, error: error.message };
    }
  }

  async broadcastSplit(originalPrompt, layout = 'grid', systemPrompt = '', enhanceAll = false) {
    try {
      // Enhance prompt
      const enhancedPrompt = await this.improveAndSave(originalPrompt, systemPrompt);

      // Store prompts based on enhanceAll flag
      // If enhanceAll is true (from sidepanel), ALL platforms get enhanced prompt
      // If false (from ChatGPT interception), ChatGPT gets original, others get enhanced
      await chrome.storage.local.set({
        pendingPromptOriginal: enhanceAll ? enhancedPrompt : originalPrompt,
        pendingPromptEnhanced: enhancedPrompt
      });

      // Get screen dimensions for proper grid layout
      const screen = await this.getScreenDimensions();
      const positions = this.calculatePositions(layout, screen.width, screen.height);

      const urls = [
        'https://chatgpt.com/',
        'https://claude.ai/new',
        'https://gemini.google.com/app'
      ];

      await Promise.all(urls.map((url, i) =>
        chrome.windows.create({
          url,
          type: 'normal',
          ...positions[i],
          focused: i === 0
        })
      ));

      return { improved: enhancedPrompt, broadcasted: true };
    } catch (error) {
      console.error('BroadcastSplit error:', error);
      return { improved: originalPrompt, broadcasted: false, error: error.message };
    }
  }

  async getScreenDimensions() {
    try {
      // Try to get display info
      const displays = await chrome.system.display.getInfo();
      if (displays && displays.length > 0) {
        const primary = displays.find(d => d.isPrimary) || displays[0];
        return {
          width: primary.workArea.width,
          height: primary.workArea.height,
          left: primary.workArea.left,
          top: primary.workArea.top
        };
      }
    } catch (e) {
      console.log('Could not get display info, using defaults');
    }
    // Fallback to reasonable defaults
    return { width: 1920, height: 1080, left: 0, top: 0 };
  }

  async improveAndSave(originalPrompt, customSystemPrompt = '') {
    let improved = originalPrompt;

    if (this.memorySystem && this.openaiClient && this.isInitialized) {
      const context = await this.memorySystem.getMemoryContext();
      improved = await this.openaiClient.improvePrompt(originalPrompt, context, customSystemPrompt);
      await this.memorySystem.saveConversation(originalPrompt);

      if (await this.memorySystem.needsDistillation()) {
        this.distillInBackground();
      }
    }

    return improved;
  }

  async distillInBackground() {
    try {
      const conversations = await this.memorySystem.getRecentConversations(20);
      const summary = await this.openaiClient.distillMemories(conversations);
      if (summary) {
        await this.memorySystem.saveMemory(summary);
        await this.memorySystem.clearOldConversations(50);
      }
    } catch (error) {
      console.error('Distillation error:', error);
    }
  }

  calculatePositions(layout, width, height, offsetLeft = 0, offsetTop = 0) {
    switch (layout) {
      case 'vertical': {
        // 3 windows stacked vertically
        const h = Math.floor(height / 3);
        return [
          { left: offsetLeft, top: offsetTop, width, height: h },
          { left: offsetLeft, top: offsetTop + h, width, height: h },
          { left: offsetLeft, top: offsetTop + h * 2, width, height: h }
        ];
      }
      case 'grid': {
        // 2x2 grid with 3 windows (top-left, top-right, bottom-left)
        const hw = Math.floor(width / 2);
        const hh = Math.floor(height / 2);
        return [
          { left: offsetLeft, top: offsetTop, width: hw, height: hh },           // ChatGPT: top-left
          { left: offsetLeft + hw, top: offsetTop, width: hw, height: hh },      // Claude: top-right
          { left: offsetLeft, top: offsetTop + hh, width: hw, height: hh }       // Gemini: bottom-left
        ];
      }
      default: { // horizontal - 3 windows side by side
        const w = Math.floor(width / 3);
        return [
          { left: offsetLeft, top: offsetTop, width: w, height },
          { left: offsetLeft + w, top: offsetTop, width: w, height },
          { left: offsetLeft + w * 2, top: offsetTop, width: w, height }
        ];
      }
    }
  }

  async getPendingPrompt(sender) {
    const result = await chrome.storage.local.get(['pendingPromptOriginal', 'pendingPromptEnhanced']);

    // Determine which prompt to return based on the sender's URL
    const url = sender?.tab?.url || '';
    const isChatGPT = url.includes('chatgpt.com') || url.includes('chat.openai.com');

    // ChatGPT gets original prompt, Claude/Gemini get enhanced
    const prompt = isChatGPT
      ? result.pendingPromptOriginal
      : result.pendingPromptEnhanced;

    return { prompt: prompt || null };
  }

  async clearPendingPrompt(sender) {
    const url = sender?.tab?.url || '';
    const isChatGPT = url.includes('chatgpt.com') || url.includes('chat.openai.com');

    // Clear only the prompt that was used
    if (isChatGPT) {
      await chrome.storage.local.remove(['pendingPromptOriginal']);
    } else {
      await chrome.storage.local.remove(['pendingPromptEnhanced']);
    }
    return { success: true };
  }

  async setApiKey(apiKey) {
    await chrome.storage.local.set({ openaiApiKey: apiKey });
    this.openaiClient?.setApiKey(apiKey);
    return { success: true };
  }

  async setEnabled(enabled) {
    this.isEnabled = enabled;
    await chrome.storage.local.set({ isEnabled: enabled });
    return { success: true };
  }

  async getStatus() {
    const stored = await chrome.storage.local.get(['openaiApiKey', 'isEnabled']);
    let convCount = 0, memCount = 0;

    if (this.memorySystem && this.isInitialized) {
      try {
        convCount = await this.memorySystem.getConversationCount();
        const memories = await this.memorySystem.getMemories(10);
        memCount = memories.length;
      } catch (e) {
        console.error('Status error:', e);
      }
    }

    return {
      hasApiKey: !!stored.openaiApiKey,
      isEnabled: stored.isEnabled !== false,
      conversationCount: convCount,
      memoryCount: memCount,
      initialized: this.isInitialized
    };
  }

  async getMemories() {
    if (!this.memorySystem || !this.isInitialized) return [];
    return this.memorySystem.getMemories(20);
  }

  async getConversations() {
    if (!this.memorySystem || !this.isInitialized) return [];
    return this.memorySystem.getRecentConversations(50);
  }

  async clearMemory() {
    if (this.memorySystem && this.isInitialized) {
      await this.memorySystem.clearAll();
    }
    return { success: true };
  }

  async importMemory(data) {
    if (this.memorySystem && this.isInitialized) {
      await this.memorySystem.importData(data);
    }
    return { success: true };
  }

  async updateMemory(id, summary) {
    if (this.memorySystem && this.isInitialized) {
      await this.memorySystem.updateMemory(id, summary);
    }
    return { success: true };
  }

  async deleteMemory(id) {
    if (this.memorySystem && this.isInitialized) {
      await this.memorySystem.deleteMemory(id);
    }
    return { success: true };
  }
}

// Initialize
const broadcaster = new PromptBroadcaster();

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  broadcaster.handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));
  return true;
});

// Commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open_side_panel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Action click opens side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Storage change listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.openaiApiKey) {
    broadcaster.openaiClient?.setApiKey(changes.openaiApiKey.newValue || '');
  }
  if (changes.isEnabled !== undefined) {
    broadcaster.isEnabled = changes.isEnabled.newValue;
  }
});
