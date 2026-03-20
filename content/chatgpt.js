// ChatGPT content script - intercepts submissions and receives pending prompts

(function() {
  'use strict';

  console.log('1Context: ChatGPT content script loaded');

  let isProcessing = false;
  let hasbroadcastedFirst = false; // Track if first message was already broadcast

  function getTextarea() {
    // ChatGPT uses a contenteditable div with id="prompt-textarea"
    const selectors = [
      '#prompt-textarea',
      'div[contenteditable="true"][id="prompt-textarea"]',
      'div[contenteditable="true"].ProseMirror',
      '[contenteditable="true"][data-id="root"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
    }
    return null;
  }

  function getSendButton() {
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'form button[type="submit"]',
      'button:has(svg[viewBox="0 0 32 32"])'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (e) {
        continue;
      }
    }

    // Fallback: find button near the textarea
    const textarea = getTextarea();
    if (textarea) {
      const form = textarea.closest('form');
      if (form) {
        const buttons = form.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.querySelector('svg') && !btn.disabled) {
            return btn;
          }
        }
      }
    }

    return null;
  }

  function getPromptText(element) {
    if (!element) return '';
    const text = element.value || element.innerText || element.textContent || '';
    return text.trim();
  }

  function setPromptText(element, text) {
    if (!element) return false;

    console.log('1Context: Setting prompt text');

    if (element.tagName === 'TEXTAREA') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Contenteditable div
      element.focus();
      element.innerHTML = '';

      const p = document.createElement('p');
      p.textContent = text;
      element.appendChild(p);

      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }

    return true;
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Element not found: ' + selector));
      }, timeout);
    });
  }

  // Check for pending prompt from side panel broadcast
  async function checkForPendingPrompt() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_PROMPT' });

      if (response && response.prompt) {
        console.log('1Context: Found pending prompt for ChatGPT');

        // Wait for ChatGPT UI to be ready
        await waitForElement('#prompt-textarea, div[contenteditable="true"]', 10000);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const textarea = getTextarea();
        if (textarea) {
          const success = setPromptText(textarea, response.prompt);

          if (success) {
            await new Promise(resolve => setTimeout(resolve, 500));

            const sendButton = getSendButton();
            if (sendButton && !sendButton.disabled) {
              isProcessing = true; // Prevent interception
              sendButton.click();
              console.log('1Context: ChatGPT prompt submitted');
              setTimeout(() => { isProcessing = false; }, 1000);
            } else {
              console.log('1Context: ChatGPT send button not ready, trying Enter key');
              textarea.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true
              }));
            }
          }
        }

        // Clear the pending prompt and mark first message as done
        await chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_PROMPT' });
        hasbroadcastedFirst = true;
      }
    } catch (error) {
      console.error('1Context: ChatGPT pending prompt error', error);
    }
  }

  async function handleSubmit(event) {
    console.log('1Context: handleSubmit called, isProcessing:', isProcessing, 'hasbroadcastedFirst:', hasbroadcastedFirst);

    // Skip if already processing or first message was already broadcast
    if (isProcessing || hasbroadcastedFirst) {
      console.log('1Context: Skipping - already processed or first message sent');
      return;
    }

    const textarea = getTextarea();
    if (!textarea) {
      console.log('1Context: No textarea found');
      return;
    }

    const originalPrompt = getPromptText(textarea);
    console.log('1Context: Original prompt:', originalPrompt.substring(0, 50));

    if (!originalPrompt) {
      console.log('1Context: Empty prompt, skipping');
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    isProcessing = true;

    try {
      console.log('1Context: Broadcasting first message to all platforms...');

      // Get system prompt from storage
      const storage = await chrome.storage.local.get(['systemPrompt']);
      const systemPrompt = storage.systemPrompt || '';

      const response = await chrome.runtime.sendMessage({
        type: 'BROADCAST_PROMPT',
        prompt: originalPrompt,
        systemPrompt: systemPrompt
      });

      console.log('1Context: Got response', response);

      // Mark first message as broadcast - subsequent messages won't be intercepted
      hasbroadcastedFirst = true;

      if (response && response.broadcasted) {
        // Submit original prompt to ChatGPT (not enhanced)
        await new Promise(resolve => setTimeout(resolve, 200));

        const sendButton = getSendButton();
        if (sendButton && !sendButton.disabled) {
          sendButton.click();
          console.log('1Context: ChatGPT prompt submitted, Claude/Gemini windows opened');
        }
      } else if (response && response.error) {
        console.error('1Context: Error from background', response.error);
        const sendButton = getSendButton();
        if (sendButton) sendButton.click();
      }
    } catch (error) {
      console.error('1Context error:', error);
      hasbroadcastedFirst = true; // Still mark as done to avoid repeated attempts
      const sendButton = getSendButton();
      if (sendButton) sendButton.click();
    } finally {
      setTimeout(() => {
        isProcessing = false;
      }, 500);
    }
  }

  function setupInterception() {
    console.log('1Context: Setting up interception');

    document.addEventListener('click', (event) => {
      if (isProcessing) return;

      const sendButton = getSendButton();
      if (!sendButton) return;

      if (event.target === sendButton || sendButton.contains(event.target)) {
        console.log('1Context: Send button clicked');
        handleSubmit(event);
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (isProcessing) return;
      if (event.key !== 'Enter' || event.shiftKey) return;

      const textarea = getTextarea();
      if (!textarea) return;

      if (textarea.contains(document.activeElement) || document.activeElement === textarea) {
        console.log('1Context: Enter pressed in textarea');
        handleSubmit(event);
      }
    }, true);

    console.log('1Context: Interception setup complete');
  }

  function init() {
    console.log('1Context: Initializing...');

    // Check for pending prompt first (from side panel broadcast)
    setTimeout(checkForPendingPrompt, 2000);

    // Set up interception for first message typed directly on ChatGPT
    // Only the first message is broadcast to Claude/Gemini
    // Subsequent messages go only to ChatGPT
    setupInterception();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
