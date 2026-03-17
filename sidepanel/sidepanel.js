// Side Panel UI logic

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
  const memoryList = document.getElementById('memoryList');

  // Settings elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettings = document.getElementById('closeSettings');
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const windowLayout = document.getElementById('windowLayout');
  const exportMemoryBtn = document.getElementById('exportMemory');
  const importMemoryBtn = document.getElementById('importMemory');
  const importFile = document.getElementById('importFile');
  const clearMemoryBtn = document.getElementById('clearMemory');

  // Track memories for editing
  let currentMemories = [];

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

  async function loadMemories() {
    try {
      const memories = await chrome.runtime.sendMessage({ type: 'GET_MEMORIES' });
      currentMemories = memories || [];

      if (currentMemories.length > 0) {
        memoryList.innerHTML = currentMemories.map((m, index) => `
          <div class="memory-item" data-id="${m.id}" data-index="${index}">
            <div class="memory-item-content">${escapeHtml(m.summary)}</div>
            <div class="memory-item-actions">
              <button class="btn-edit" data-action="edit">Edit</button>
              <button class="btn-save-memory hidden" data-action="save">Save</button>
              <button class="btn-delete" data-action="delete">Delete</button>
            </div>
          </div>
        `).join('');

        // Add event listeners for memory actions
        memoryList.querySelectorAll('.memory-item').forEach(item => {
          const contentEl = item.querySelector('.memory-item-content');
          const editBtn = item.querySelector('[data-action="edit"]');
          const saveBtn = item.querySelector('[data-action="save"]');
          const deleteBtn = item.querySelector('[data-action="delete"]');

          editBtn.addEventListener('click', () => {
            item.classList.add('editing');
            contentEl.contentEditable = true;
            contentEl.focus();
            editBtn.classList.add('hidden');
            saveBtn.classList.remove('hidden');
          });

          saveBtn.addEventListener('click', async () => {
            const memoryId = item.dataset.id;
            const newSummary = contentEl.textContent.trim();

            if (newSummary) {
              await chrome.runtime.sendMessage({
                type: 'UPDATE_MEMORY',
                id: memoryId,
                summary: newSummary
              });
            }

            item.classList.remove('editing');
            contentEl.contentEditable = false;
            editBtn.classList.remove('hidden');
            saveBtn.classList.add('hidden');
            loadMemories();
          });

          deleteBtn.addEventListener('click', async () => {
            const memoryId = item.dataset.id;
            await chrome.runtime.sendMessage({
              type: 'DELETE_MEMORY',
              id: memoryId
            });
            loadStatus();
            loadMemories();
          });

          // Save on Enter, cancel on Escape
          contentEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveBtn.click();
            } else if (e.key === 'Escape') {
              item.classList.remove('editing');
              contentEl.contentEditable = false;
              editBtn.classList.remove('hidden');
              saveBtn.classList.add('hidden');
              loadMemories(); // Reset content
            }
          });
        });
      } else {
        memoryList.innerHTML = '<p class="empty">No memories yet. Start chatting to build context.</p>';
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    }
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
      // Get layout preference
      const layout = windowLayout.value;

      // Send broadcast request
      const response = await chrome.runtime.sendMessage({
        type: 'BROADCAST_SPLIT',
        prompt: prompt,
        layout: layout
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
        loadMemories();
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

  // Load API key on settings open
  settingsBtn.addEventListener('click', async () => {
    const result = await chrome.storage.local.get(['openaiApiKey', 'windowLayout']);
    if (result.openaiApiKey) {
      apiKeyInput.value = '••••••••••••••••';
    }
    if (result.windowLayout) {
      windowLayout.value = result.windowLayout;
    }
  });

  // Save layout preference
  windowLayout.addEventListener('change', async () => {
    await chrome.storage.local.set({ windowLayout: windowLayout.value });
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
      loadMemories();

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
      loadMemories();
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  loadStatus();
  loadMemories();
});
