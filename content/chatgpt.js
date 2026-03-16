// ChatGPT content script - intercepts submissions and broadcasts to other models

(function() {
  'use strict';

  console.log('Prompt Broadcaster: ChatGPT content script loaded');

  let isProcessing = false;

  function getTextarea() {
    // ChatGPT uses a contenteditable div with id="prompt-textarea"
    // Try multiple selectors as UI may change
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
      'button:has(svg[viewBox="0 0 32 32"])'  // Arrow icon button
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el;
      } catch (e) {
        // :has() might not be supported everywhere
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
    // Handle both textarea and contenteditable
    const text = element.value || element.innerText || element.textContent || '';
    return text.trim();
  }

  function setPromptText(element, text) {
    if (!element) return false;

    console.log('Prompt Broadcaster: Setting prompt text');

    if (element.tagName === 'TEXTAREA') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Contenteditable div - need to simulate proper input
      element.focus();

      // Clear existing content
      element.innerHTML = '';

      // Insert text as paragraph (ChatGPT expects this structure)
      const p = document.createElement('p');
      p.textContent = text;
      element.appendChild(p);

      // Dispatch events to trigger React state updates
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }

    return true;
  }

  async function handleSubmit(event) {
    console.log('Prompt Broadcaster: handleSubmit called, isProcessing:', isProcessing);

    if (isProcessing) {
      console.log('Prompt Broadcaster: Already processing, skipping');
      return;
    }

    const textarea = getTextarea();
    if (!textarea) {
      console.log('Prompt Broadcaster: No textarea found');
      return;
    }

    const originalPrompt = getPromptText(textarea);
    console.log('Prompt Broadcaster: Original prompt:', originalPrompt.substring(0, 50));

    if (!originalPrompt) {
      console.log('Prompt Broadcaster: Empty prompt, skipping');
      return;
    }

    // Prevent default submission
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    isProcessing = true;

    try {
      console.log('Prompt Broadcaster: Sending to background...');

      // Send to background script for improvement and broadcasting
      const response = await chrome.runtime.sendMessage({
        type: 'BROADCAST_PROMPT',
        prompt: originalPrompt
      });

      console.log('Prompt Broadcaster: Got response', response);

      if (response && response.improved) {
        // Replace with improved prompt
        setPromptText(textarea, response.improved);

        // Wait for UI to update
        await new Promise(resolve => setTimeout(resolve, 200));

        // Now submit the improved prompt
        const sendButton = getSendButton();
        console.log('Prompt Broadcaster: Send button found:', !!sendButton);

        if (sendButton && !sendButton.disabled) {
          // Remove our listener temporarily to avoid recursion
          isProcessing = true;
          sendButton.click();
          console.log('Prompt Broadcaster: Clicked send button');
        }
      } else if (response && response.error) {
        console.error('Prompt Broadcaster: Error from background', response.error);
        // Submit original on error
        const sendButton = getSendButton();
        if (sendButton) sendButton.click();
      }
    } catch (error) {
      console.error('Prompt Broadcaster error:', error);
      // On error, let original submission happen
      const sendButton = getSendButton();
      if (sendButton) sendButton.click();
    } finally {
      // Reset after a delay to allow the click to process
      setTimeout(() => {
        isProcessing = false;
      }, 500);
    }
  }

  function setupInterception() {
    console.log('Prompt Broadcaster: Setting up interception');

    // Watch for send button clicks - use capture phase
    document.addEventListener('click', (event) => {
      if (isProcessing) return;

      const sendButton = getSendButton();
      if (!sendButton) return;

      // Check if click is on send button or its children
      if (event.target === sendButton || sendButton.contains(event.target)) {
        console.log('Prompt Broadcaster: Send button clicked');
        handleSubmit(event);
      }
    }, true);

    // Watch for Enter key (without Shift) in the textarea
    document.addEventListener('keydown', (event) => {
      if (isProcessing) return;
      if (event.key !== 'Enter' || event.shiftKey) return;

      const textarea = getTextarea();
      if (!textarea) return;

      // Check if we're typing in the textarea (or its children)
      if (textarea.contains(document.activeElement) || document.activeElement === textarea) {
        console.log('Prompt Broadcaster: Enter pressed in textarea');
        handleSubmit(event);
      }
    }, true);

    console.log('Prompt Broadcaster: Interception setup complete');
  }

  // Initialize when DOM is ready
  function init() {
    console.log('Prompt Broadcaster: Initializing...');

    // Wait for ChatGPT UI to load
    const observer = new MutationObserver((mutations, obs) => {
      const textarea = getTextarea();
      if (textarea) {
        obs.disconnect();
        setupInterception();
        console.log('Prompt Broadcaster: ChatGPT interception active');
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also check immediately
    const textarea = getTextarea();
    if (textarea) {
      observer.disconnect();
      setupInterception();
      console.log('Prompt Broadcaster: ChatGPT interception active (immediate)');
    } else {
      console.log('Prompt Broadcaster: Waiting for textarea to appear...');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
