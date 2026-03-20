// Side Panel UI logic

// Default system prompt for enhancement
const DEFAULT_SYSTEM_PROMPT = `You are an expert prompt engineer. Improve the user's prompt to be clearer, more specific, and more likely to get a helpful response.

IMPORTANT: Return ONLY the improved prompt. No explanations, no quotes, no prefixes.`;

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const promptInput = document.getElementById('promptInput');
  const charCount = document.getElementById('charCount');
  const broadcastBtn = document.getElementById('broadcastBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const memoryCount = document.getElementById('memoryCount');
  const convCount = document.getElementById('convCount');
  const previewSection = document.getElementById('previewSection');
  const improvedPrompt = document.getElementById('improvedPrompt');
  const conversationList = document.getElementById('conversationList');

  // Settings elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettings = document.getElementById('closeSettings');
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const windowLayout = document.getElementById('windowLayout');
  const systemPromptInput = document.getElementById('systemPrompt');
  const resetSystemPromptBtn = document.getElementById('resetSystemPrompt');
  const exportMemoryBtn = document.getElementById('exportMemory');
  const importMemoryBtn = document.getElementById('importMemory');
  const importFile = document.getElementById('importFile');
  const clearMemoryBtn = document.getElementById('clearMemory');

  // Character count
  promptInput.addEventListener('input', () => {
    charCount.textContent = promptInput.value.length;
  });

  // Settings panel
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  closeSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  // Load status and memory
  async function loadStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      memoryCount.textContent = response.memoryCount || 0;
      convCount.textContent = response.conversationCount || 0;

      if (!response.hasApiKey) {
        statusText.textContent = 'No API Key';
        statusDot.classList.add('error');
      } else {
        statusText.textContent = 'Ready';
        statusDot.classList.remove('error');
      }
    } catch (error) {
      console.error('Failed to load status:', error);
    }
  }

  // Summarize text to max 2 lines (~100 chars)
  function summarize(text, maxLength = 100) {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.substring(0, maxLength - 3) + '...';
  }

  async function loadConversations() {
    try {
      const conversations = await chrome.runtime.sendMessage({ type: 'GET_CONVERSATIONS' });
      const convs = conversations || [];

      if (convs.length > 0) {
        conversationList.innerHTML = convs.slice(0, 10).map((c, index) => `
          <div class="conversation-item">
            <div class="conversation-summary">${escapeHtml(summarize(c.prompt))}</div>
            <div class="conversation-time">${formatTime(c.timestamp)}</div>
          </div>
        `).join('');
      } else {
        conversationList.innerHTML = '<p class="empty">No conversations yet. Start chatting to build context.</p>';
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
  }

  // Broadcast functionality
  broadcastBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;

    // Update UI
    broadcastBtn.disabled = true;
    statusText.textContent = 'Processing...';
    statusDot.classList.add('processing');

    try {
      // Get layout preference and system prompt from storage
      const storage = await chrome.storage.local.get(['windowLayout', 'systemPrompt']);
      const layout = storage.windowLayout || 'grid';
      const systemPrompt = storage.systemPrompt || DEFAULT_SYSTEM_PROMPT;

      // Send broadcast request - enhanced prompt goes to ALL platforms
      const response = await chrome.runtime.sendMessage({
        type: 'BROADCAST_SPLIT',
        prompt: prompt,
        layout: layout,
        systemPrompt: systemPrompt,
        enhanceAll: true  // Flag to enhance for all platforms
      });

      if (response && response.improved) {
        // Show improved prompt
        improvedPrompt.textContent = response.improved;
        previewSection.classList.remove('hidden');

        statusText.textContent = 'Broadcasted!';
        statusDot.classList.remove('processing');

        // Clear input after success
        promptInput.value = '';
        charCount.textContent = '0';

        // Refresh stats
        loadStatus();
        loadConversations();
      } else if (response && response.error) {
        statusText.textContent = 'Error: ' + response.error;
        statusDot.classList.add('error');
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      statusText.textContent = 'Error';
      statusDot.classList.add('error');
    } finally {
      broadcastBtn.disabled = false;
      setTimeout(() => {
        statusDot.classList.remove('processing');
      }, 500);
    }
  });

  // Keyboard shortcut: Ctrl/Cmd + Enter to broadcast
  promptInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      broadcastBtn.click();
    }
  });

  // Settings: Save API Key with state feedback
  saveApiKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (key && !key.includes('•')) {
      const originalText = saveApiKeyBtn.textContent;
      saveApiKeyBtn.disabled = true;

      await chrome.runtime.sendMessage({ type: 'SET_API_KEY', apiKey: key });

      // Show saved state
      saveApiKeyBtn.textContent = 'Saved!';
      saveApiKeyBtn.classList.add('saved');
      apiKeyInput.value = '••••••••••••••••';

      loadStatus();

      // Reset button after delay
      setTimeout(() => {
        saveApiKeyBtn.textContent = originalText;
        saveApiKeyBtn.classList.remove('saved');
        saveApiKeyBtn.disabled = false;
      }, 2000);
    }
  });

  // Load settings on settings open
  settingsBtn.addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['openaiApiKey', 'windowLayout', 'systemPrompt']);
    if (result.openaiApiKey) {
      apiKeyInput.value = '••••••••••••••••';
    }
    if (result.windowLayout) {
      windowLayout.value = result.windowLayout;
    }
    // Load system prompt or show default
    systemPromptInput.value = result.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  });

  // Save layout preference
  windowLayout.addEventListener('change', async () => {
    await chrome.storage.local.set({ windowLayout: windowLayout.value });
  });

  // Save system prompt when changed
  systemPromptInput.addEventListener('input', async () => {
    await chrome.storage.local.set({ systemPrompt: systemPromptInput.value });
  });

  // Reset system prompt to default
  resetSystemPromptBtn.addEventListener('click', async () => {
    systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
    await chrome.storage.local.set({ systemPrompt: DEFAULT_SYSTEM_PROMPT });
  });

  // Export memory
  exportMemoryBtn.addEventListener('click', async () => {
    const originalText = exportMemoryBtn.textContent;
    exportMemoryBtn.disabled = true;

    try {
      const [conversations, memories] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_CONVERSATIONS' }),
        chrome.runtime.sendMessage({ type: 'GET_MEMORIES' })
      ]);

      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        conversations: conversations || [],
        memories: memories || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `1context-memory-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Show success state
      exportMemoryBtn.textContent = 'Exported!';
      exportMemoryBtn.classList.add('saved');

      setTimeout(() => {
        exportMemoryBtn.textContent = originalText;
        exportMemoryBtn.classList.remove('saved');
        exportMemoryBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      exportMemoryBtn.disabled = false;
    }
  });

  // Import memory
  importMemoryBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const originalText = importMemoryBtn.textContent;
    importMemoryBtn.disabled = true;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.conversations || !data.memories) {
        throw new Error('Invalid file format');
      }

      await chrome.runtime.sendMessage({ type: 'IMPORT_MEMORY', data });

      // Show success state
      importMemoryBtn.textContent = 'Imported!';
      importMemoryBtn.classList.add('saved');

      loadStatus();
      loadConversations();

      setTimeout(() => {
        importMemoryBtn.textContent = originalText;
        importMemoryBtn.classList.remove('saved');
        importMemoryBtn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error('Import failed:', error);
      importMemoryBtn.disabled = false;
    }

    importFile.value = '';
  });

  // Clear memory
  clearMemoryBtn.addEventListener('click', async () => {
    if (confirm('Clear all memory and history?')) {
      await chrome.runtime.sendMessage({ type: 'CLEAR_MEMORY' });
      loadStatus();
      loadConversations();
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  loadStatus();
  loadConversations();
});
