// Background service worker for Prompt Broadcaster

// Import dependencies
importScripts('lib/memory.js', 'lib/openai.js');

let memorySystem = null;
let openaiClient = null;
let isEnabled = true;
let isInitialized = false;

// Initialize systems
async function initialize() {
  try {
    console.log('Prompt Broadcaster: Initializing...');

    memorySystem = new MemorySystem();
    await memorySystem.init();
    console.log('Prompt Broadcaster: IndexedDB initialized');

    // Load API key from storage
    const result = await chrome.storage.local.get(['openaiApiKey', 'isEnabled']);
    openaiClient = new OpenAIClient(result.openaiApiKey || '');
    isEnabled = result.isEnabled !== false; // Default to true
    isInitialized = true;

    console.log('Prompt Broadcaster: Fully initialized', {
      hasApiKey: !!result.openaiApiKey,
      isEnabled
    });
  } catch (error) {
    console.error('Prompt Broadcaster: Initialization failed', error);
    // Create fallback client even if DB fails
    openaiClient = new OpenAIClient('');
    isInitialized = false;
  }
}

// Wait for initialization
const initPromise = initialize();

// Helper to ensure initialization before handling messages
async function ensureInitialized() {
  await initPromise;
  return isInitialized;
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Prompt Broadcaster: Received message', message.type);

  // Handle each message type with proper async handling
  (async () => {
    try {
      await ensureInitialized();

      switch (message.type) {
        case 'BROADCAST_PROMPT': {
          const result = await handleBroadcast(message.prompt, sender.tab);
          sendResponse(result);
          break;
        }

        case 'GET_PENDING_PROMPT': {
          const result = await chrome.storage.local.get(['pendingPrompt']);
          sendResponse({ prompt: result.pendingPrompt || null });
          break;
        }

        case 'CLEAR_PENDING_PROMPT': {
          await chrome.storage.local.remove(['pendingPrompt']);
          sendResponse({ success: true });
          break;
        }

        case 'SET_API_KEY': {
          console.log('Prompt Broadcaster: Saving API key');
          await chrome.storage.local.set({ openaiApiKey: message.apiKey });
          if (openaiClient) {
            openaiClient.setApiKey(message.apiKey);
          }
          sendResponse({ success: true });
          break;
        }

        case 'SET_ENABLED': {
          isEnabled = message.enabled;
          await chrome.storage.local.set({ isEnabled: message.enabled });
          sendResponse({ success: true });
          break;
        }

        case 'GET_STATUS': {
          const stored = await chrome.storage.local.get(['openaiApiKey', 'isEnabled']);
          let convCount = 0;
          let memCount = 0;

          if (memorySystem && isInitialized) {
            try {
              convCount = await memorySystem.getConversationCount();
              const memories = await memorySystem.getMemories(10);
              memCount = memories.length;
            } catch (e) {
              console.error('Error getting counts:', e);
            }
          }

          sendResponse({
            hasApiKey: !!stored.openaiApiKey,
            isEnabled: stored.isEnabled !== false,
            conversationCount: convCount,
            memoryCount: memCount,
            initialized: isInitialized
          });
          break;
        }

        case 'GET_MEMORIES': {
          if (memorySystem && isInitialized) {
            const memories = await memorySystem.getMemories(20);
            sendResponse(memories);
          } else {
            sendResponse([]);
          }
          break;
        }

        case 'GET_CONVERSATIONS': {
          if (memorySystem && isInitialized) {
            const convs = await memorySystem.getRecentConversations(50);
            sendResponse(convs);
          } else {
            sendResponse([]);
          }
          break;
        }

        case 'CLEAR_MEMORY': {
          if (memorySystem && isInitialized) {
            await memorySystem.clearAll();
          }
          sendResponse({ success: true });
          break;
        }

        case 'IMPORT_MEMORY': {
          if (memorySystem && isInitialized) {
            await memorySystem.importData(message.data);
          }
          sendResponse({ success: true });
          break;
        }

        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Prompt Broadcaster: Message handler error', error);
      sendResponse({ error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

async function handleBroadcast(originalPrompt, sourceTab) {
  console.log('Prompt Broadcaster: Broadcasting prompt', originalPrompt.substring(0, 50) + '...');

  if (!isEnabled) {
    console.log('Prompt Broadcaster: Disabled, skipping');
    return { improved: originalPrompt, broadcasted: false };
  }

  try {
    let improvedPrompt = originalPrompt;

    // Get memory context and improve prompt if possible
    if (memorySystem && isInitialized && openaiClient) {
      const memoryContext = await memorySystem.getMemoryContext();
      improvedPrompt = await openaiClient.improvePrompt(originalPrompt, memoryContext);

      // Save conversation
      await memorySystem.saveConversation(originalPrompt);

      // Check if we need to distill memories
      if (await memorySystem.needsDistillation()) {
        distillMemoriesInBackground();
      }
    }

    // Store the improved prompt for Gemini/Claude tabs
    await chrome.storage.local.set({ pendingPrompt: improvedPrompt });

    // Open Gemini and Claude tabs
    console.log('Prompt Broadcaster: Opening Gemini and Claude tabs');
    await Promise.all([
      chrome.tabs.create({
        url: 'https://gemini.google.com/app',
        active: false
      }),
      chrome.tabs.create({
        url: 'https://claude.ai/new',
        active: false
      })
    ]);

    console.log('Prompt Broadcaster: Broadcast complete');
    return { improved: improvedPrompt, broadcasted: true };
  } catch (error) {
    console.error('Broadcast error:', error);
    return { improved: originalPrompt, broadcasted: false, error: error.message };
  }
}

async function distillMemoriesInBackground() {
  try {
    const conversations = await memorySystem.getRecentConversations(20);
    const summary = await openaiClient.distillMemories(conversations);

    if (summary) {
      await memorySystem.saveMemory(summary);
      await memorySystem.clearOldConversations(50);
      console.log('Memory distillation complete');
    }
  } catch (error) {
    console.error('Memory distillation failed:', error);
  }
}

// Re-initialize when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.openaiApiKey && openaiClient) {
      openaiClient.setApiKey(changes.openaiApiKey.newValue || '');
    }
    if (changes.isEnabled !== undefined) {
      isEnabled = changes.isEnabled.newValue;
    }
  }
});
