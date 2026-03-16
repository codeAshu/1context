# Prompt Broadcaster - Test Plan

## Pre-requisites
- [ ] Chrome browser
- [ ] OpenAI API key ready
- [ ] Extension loaded in chrome://extensions

---

## Phase 1: Extension Loading

### Test 1.1: Extension Loads Without Errors
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select `prompt-broadcaster` folder
4. **Expected**: Extension appears with icon, no red "Errors" button
5. **If errors**: Click "Errors" button, note the messages

### Test 1.2: Service Worker Running
1. On `chrome://extensions`, find Prompt Broadcaster
2. Click "Service Worker" link (should say "service worker")
3. **Expected**: DevTools opens showing background.js console
4. **Check**: Should see "Prompt Broadcaster initialized" in console
5. **If not visible**: Service worker crashed on startup

---

## Phase 2: Popup & Storage

### Test 2.1: Popup Opens
1. Click the extension icon in toolbar
2. **Expected**: Popup window opens with settings UI
3. **If blank**: Check popup/popup.html exists

### Test 2.2: API Key Saves
1. Open popup
2. Enter API key: `sk-test123`
3. Click "Save"
4. Close popup, reopen it
5. Open DevTools on popup (right-click → Inspect)
6. In console, run: `chrome.storage.local.get(['openaiApiKey'], console.log)`
7. **Expected**: `{openaiApiKey: "sk-test123"}`
8. **If empty**: Storage not working

### Test 2.3: Toggle Works
1. Toggle the switch off
2. Close and reopen popup
3. **Expected**: Toggle remains off
4. Check console: `chrome.storage.local.get(['isEnabled'], console.log)`

---

## Phase 3: Content Script Injection

### Test 3.1: ChatGPT Content Script Loads
1. Go to https://chatgpt.com
2. Open DevTools (F12) → Console tab
3. **Expected**: See "Prompt Broadcaster: ChatGPT interception active"
4. **If not**: Content script not injecting

### Test 3.2: Verify Script is Registered
1. In DevTools Console on ChatGPT, type:
   ```javascript
   chrome.runtime.id
   ```
2. **Expected**: Returns extension ID (same as in chrome://extensions)
3. **If undefined**: Content script not from our extension

---

## Phase 4: Message Passing

### Test 4.1: Background Receives Messages
1. Open Service Worker DevTools (from chrome://extensions)
2. Go to ChatGPT
3. In ChatGPT's DevTools console, run:
   ```javascript
   chrome.runtime.sendMessage({type: 'GET_STATUS'}, console.log)
   ```
4. **Expected**: Returns object with `hasApiKey`, `isEnabled`, etc.
5. **If undefined/error**: Message passing broken

### Test 4.2: Test Broadcast Message
1. In ChatGPT console:
   ```javascript
   chrome.runtime.sendMessage({type: 'BROADCAST_PROMPT', prompt: 'test'}, console.log)
   ```
2. **Expected**: Returns `{improved: '...', broadcasted: true}` and opens 2 tabs
3. **If error**: Check Service Worker console for errors

---

## Phase 5: UI Element Detection

### Test 5.1: ChatGPT Selectors Work
1. On ChatGPT, open DevTools Console
2. Run:
   ```javascript
   document.querySelector('#prompt-textarea')
   ```
3. **Expected**: Returns the textarea element
4. **If null**: Selector outdated, ChatGPT changed their UI

### Test 5.2: Send Button Selector
1. Run:
   ```javascript
   document.querySelector('button[data-testid="send-button"]')
   ```
2. **Expected**: Returns the send button
3. **If null**: Selector outdated

---

## Phase 6: End-to-End Test

### Test 6.1: Full Flow
1. Ensure API key is set and extension is enabled
2. Go to ChatGPT
3. Type "Hello world" in the prompt
4. Click send (or press Enter)
5. **Expected**:
   - Prompt may be modified (improved)
   - Two new tabs open (Gemini, Claude)
   - All three should have the prompt submitted

---

## Debugging Commands Reference

**Check storage:**
```javascript
chrome.storage.local.get(null, console.log)
```

**Check if content script is active:**
```javascript
// In page console
typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id
```

**Manual message test:**
```javascript
chrome.runtime.sendMessage({type: 'GET_STATUS'}, r => console.log(r))
```

**Check for errors in Service Worker:**
- Go to chrome://extensions → Click "Service Worker" → Check Console tab
