// ChatGPT content script - intercepts submissions and receives pending prompts

(function() {
  'use strict';

  console.log('1Context: ChatGPT content script loaded');

  let isProcessing = false;

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

        // Clear the pending prompt
        await chrome.runtime.sendMessage({ type: 'CLEAR_PENDING_PROMPT' });
      }
    } catch (error) {
      console.error('1Context: ChatGPT pending prompt error', error);
    }
  }

  async function handleSubmit(event) {
    console.log('1Context: handleSubmit called, isProcessing:', isProcessing);

    if (isProcessing) {
      console.log('1Context: Already processing, skipping');
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
      console.log('1Context: Sending to background...');

      const response = await chrome.runtime.sendMessage({
        type: 'BROADCAST_PROMPT',
        prompt: originalPrompt
      });

      console.log('1Context: Got response', response);

      if (response && response.improved) {
        setPromptText(textarea, response.improved);
        await new Promise(resolve => setTimeout(resolve, 200));

        const sendButton = getSendButton();
        console.log('1Context: Send button found:', !!sendButton);

        if (sendButton && !sendButton.disabled) {
          isProcessing = true;
          sendButton.click();
          console.log('1Context: Clicked send button');
        }
      } else if (response && response.error) {
        console.error('1Context: Error from background', response.error);
        const sendButton = getSendButton();
        if (sendButton) sendButton.click();
      }
    } catch (error) {
      console.error('1Context error:', error);
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

    // Set up interception for manual submissions
    const observer = new MutationObserver((mutations, obs) => {
      const textarea = getTextarea();
      if (textarea) {
        obs.disconnect();
        setupInterception();
        console.log('1Context: ChatGPT interception active');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    const textarea = getTextarea();
    if (textarea) {
      observer.disconnect();
      setupInterception();
      console.log('1Context: ChatGPT interception active (immediate)');
    } else {
      console.log('1Context: Waiting for textarea to appear...');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
