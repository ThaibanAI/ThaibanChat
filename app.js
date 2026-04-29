/* ============================================================
   ThaibanChat - Application Logic
   Progressive Web App - Multi-Provider LLM Chat
   ============================================================ */

// --- Configuration ---
const APP_VERSION = '1.0.0';
const STORAGE_KEYS = {
  THEME: 'thaibanchat-theme',
  CONVERSATIONS: 'thaibanchat-convs',
  MESSAGES: 'thaibanchat-msgs',
  PROVIDERS: 'thaibanchat-providers',
};
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const AUTO_SCROLL_THROTTLE = 100;

// --- Provider Definitions ---
const PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://api.anthropic.com/v1/messages',
    color: '#d97706',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-sonnet-4-20250514'],
    apiKeyHeader: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    color: '#10a37f',
    defaultModel: 'gpt-4o',
    models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    color: '#4f46e5',
    defaultModel: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
  },
];

// --- State ---
let state = {
  conversations: [],       // [{ id, title, updatedAt, createdAt }]
  messages: {},            // { [convId]: [{ id, role, provider, model, content, attachments, isStreaming, isLoading, error, timestamp }] }
  providers: {},           // { [id]: { apiKey, model, enabled } }
  currentConversationId: null,
  selectedProviders: new Set(),
  inputText: '',
  pendingAttachments: [],
  isLoading: false,
  activeStreams: {},       // { [messageId]: AbortController }
};

// --- UI Refs ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {};

function initRefs() {
  els.sidebar = $('#sidebar');
  els.sidebarOverlay = document.createElement('div');
  els.sidebarOverlay.className = 'sidebar-overlay';
  document.body.appendChild(els.sidebarOverlay);
  els.conversationsList = $('#conversationsList');
  els.newChatBtnSidebar = $('#newChatBtnSidebar');
  els.settingsBtnSidebar = $('#settingsBtnSidebar');
  els.chatTitle = $('#chatTitle');
  els.chatSubtitle = $('#chatSubtitle');
  els.messagesList = $('#messagesList');
  els.emptyState = $('#emptyState');
  els.messageInput = $('#messageInput');
  els.sendBtn = $('#sendBtn');
  els.attachBtn = $('#attachBtn');
  els.providerBar = $('#providerBar');
  els.attachmentBar = $('#attachmentBar');
  els.menuToggle = $('#menuToggle');
  els.settingsBtn = $('#settingsBtn');
  els.settingsModal = $('#settingsModal');
  els.settingsClose = $('#settingsClose');
  els.clearAllDataBtn = $('#clearAllDataBtn');
  els.messagesContainer = $('#messagesContainer');
}

// --- Storage ---
function loadState() {
  try {
    const convs = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (convs) state.conversations = JSON.parse(convs);
    const msgs = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (msgs) state.messages = JSON.parse(msgs);
    const provs = localStorage.getItem(STORAGE_KEYS.PROVIDERS);
    if (provs) {
      state.providers = JSON.parse(provs);
    } else {
      // Default provider configs
      PROVIDERS.forEach(p => {
        state.providers[p.id] = { apiKey: '', model: p.defaultModel, enabled: true };
      });
    }
    const theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    console.warn('Failed to load state:', e);
  }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(state.conversations));
}

function saveMessages() {
  localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(state.messages));
}

function saveProviders() {
  localStorage.setItem(STORAGE_KEYS.PROVIDERS, JSON.stringify(state.providers));
}

// --- Conversations ---
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createConversation() {
  const id = generateId();
  const now = Date.now();
  const conv = { id, title: 'New Chat', createdAt: now, updatedAt: now };
  state.conversations.unshift(conv);
  state.messages[id] = [];
  saveConversations();
  saveMessages();
  return conv;
}

function renameConversation(id, title) {
  const conv = state.conversations.find(c => c.id === id);
  if (conv) {
    conv.title = title;
    conv.updatedAt = Date.now();
    saveConversations();
  }
}

function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  delete state.messages[id];
  saveConversations();
  saveMessages();
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Provider Config ---
function getProviderConfig(id) {
  return state.providers[id] || { apiKey: '', model: '', enabled: true };
}

function isProviderReady(id) {
  const cfg = getProviderConfig(id);
  return cfg.enabled && cfg.apiKey.trim().length > 0;
}

// --- Rendering ---
function renderSidebar() {
  els.conversationsList.innerHTML = '';

  if (state.conversations.length === 0) {
    els.conversationsList.innerHTML = '<div class="empty-state-small"><p>No conversations yet</p></div>';
    return;
  }

  state.conversations.forEach(conv => {
    const item = document.createElement('div');
    item.className = `conv-item ${conv.id === state.currentConversationId ? 'active' : ''}`;
    item.dataset.id = conv.id;
    item.innerHTML = `
      <div class="conv-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="conv-item-text">
        <div class="conv-item-title">${escHtml(conv.title)}</div>
        <div class="conv-item-date">${formatTime(conv.updatedAt)}</div>
      </div>
      <button class="btn btn-icon conv-item-delete" data-action="delete" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.conv-item-delete')) return;
      openConversation(conv.id);
      closeSidebar();
    });

    const deleteBtn = item.querySelector('.conv-item-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${conv.title}"?`)) {
        if (state.currentConversationId === conv.id) {
          state.currentConversationId = null;
        }
        deleteConversation(conv.id);
        renderSidebar();
        if (state.currentConversationId) {
          renderMessages();
        } else {
          showEmptyState();
          updateHeader(null);
        }
      }
    });

    els.conversationsList.appendChild(item);
  });
}

function renderProviderBar() {
  els.providerBar.innerHTML = '';
  PROVIDERS.forEach(p => {
    const cfg = getProviderConfig(p.id);
    const ready = cfg.enabled && cfg.apiKey.trim().length > 0;
    const selected = state.selectedProviders.has(p.id);
    const chip = document.createElement('div');
    chip.className = `provider-chip ${selected ? 'selected ' + p.id : ''} ${!ready ? 'disabled' : ''}`;
    chip.innerHTML = `
      <span class="chip-check">✓</span>
      <span>${p.name}</span>
    `;
    chip.title = ready ? `Click to ${selected ? 'deselect' : 'select'}` : 'Configure API key in Settings';
    chip.addEventListener('click', () => {
      if (!ready) return;
      if (selected) {
        state.selectedProviders.delete(p.id);
      } else {
        state.selectedProviders.add(p.id);
      }
      renderProviderBar();
    });
    els.providerBar.appendChild(chip);
  });
}

function renderMessages() {
  const convMessages = state.messages[state.currentConversationId] || [];
  els.messagesList.innerHTML = '';

  if (convMessages.length === 0) {
    els.emptyState.classList.remove('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');

  convMessages.forEach(msg => {
    const el = createMessageElement(msg);
    els.messagesList.appendChild(el);
  });

  scrollToBottom();
}

function createMessageElement(msg) {
  const div = document.createElement('div');
  div.className = `message ${msg.role}`;
  div.id = `msg-${msg.id}`;

  if (msg.role === 'user') {
    div.innerHTML = `
      <div class="message-bubble">${escHtml(msg.content)}</div>
    `;
  } else {
    const provCfg = PROVIDERS.find(p => p.id === msg.provider);
    const color = provCfg ? provCfg.color : '#a855f7';
    const provName = provCfg ? provCfg.name : 'Assistant';

    if (msg.isLoading) {
      div.innerHTML = `
        <div class="provider-label">
          <span class="provider-dot" style="background:${color}"></span>
          <span class="provider-name" style="color:${color}">${provName}</span>
          ${msg.model ? `<span class="provider-model">· ${msg.model}</span>` : ''}
        </div>
        <div class="message-bubble">
          <div class="thinking-indicator">
            <div class="spinner"></div>
            <span class="thinking-text">thinking…</span>
          </div>
        </div>
      `;
    } else if (msg.error) {
      div.innerHTML = `
        <div class="provider-label">
          <span class="provider-dot" style="background:${color}"></span>
          <span class="provider-name" style="color:${color}">${provName}</span>
          ${msg.model ? `<span class="provider-model">· ${msg.model}</span>` : ''}
        </div>
        <div class="message-bubble">
          <div class="error-message">
            <span class="error-icon">⚠️</span>
            <span>${escHtml(msg.error)}</span>
          </div>
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="provider-label">
          <span class="provider-dot" style="background:${color}"></span>
          <span class="provider-name" style="color:${color}">${provName}</span>
          ${msg.model ? `<span class="provider-model">· ${msg.model}</span>` : ''}
        </div>
        <div class="message-bubble">
          <div class="markdown-body">${renderMarkdown(msg.content)}</div>
        </div>
        <div class="assistant-actions">
          <button class="btn btn-icon" title="Copy" data-action="copy" data-text="${escHtml(msg.content)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="btn btn-icon" title="Delete" data-action="delete-msg" data-id="${msg.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button class="btn btn-icon" title="Re-send" data-action="resend" data-id="${msg.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>
      `;
    }
  }

  return div;
}

function updateHeader(conv) {
  if (conv) {
    els.chatTitle.textContent = conv.title;
    els.chatSubtitle.textContent = `${(state.messages[conv.id] || []).length} messages`;
  } else {
    els.chatTitle.textContent = 'ThaibanChat';
    els.chatSubtitle.textContent = 'Select a conversation or start a new one';
  }
}

function showEmptyState() {
  els.emptyState.classList.remove('hidden');
  els.messagesList.innerHTML = '';
}

// --- Navigation ---
function openConversation(id) {
  state.currentConversationId = id;
  const conv = state.conversations.find(c => c.id === id);
  if (conv) {
    updateHeader(conv);
    renderMessages();
    renderSidebar();
    els.messageInput.focus();
  }
}

function closeSidebar() {
  els.sidebar.classList.remove('open');
  els.sidebarOverlay.classList.remove('show');
}

function openSidebar() {
  els.sidebar.classList.add('open');
  els.sidebarOverlay.classList.add('show');
  renderSidebar();
}

// --- Messages ---
function addUserMessage(convId, content, attachments) {
  const msg = {
    id: generateId(),
    role: 'user',
    content,
    attachments: attachments || [],
    timestamp: Date.now(),
  };
  if (!state.messages[convId]) state.messages[convId] = [];
  state.messages[convId].push(msg);
  saveMessages();
  return msg;
}

function addAssistantMessage(convId, provider, model) {
  const msg = {
    id: generateId(),
    role: 'assistant',
    provider,
    model,
    content: '',
    isStreaming: false,
    isLoading: true,
    error: null,
    timestamp: Date.now(),
  };
  state.messages[convId].push(msg);
  saveMessages();
  return msg;
}

function updateAssistantMessage(msgId, content, opts = {}) {
  for (const convId of Object.keys(state.messages)) {
    const msgs = state.messages[convId];
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      msgs[idx].content = content;
      if (opts.isLoading !== undefined) msgs[idx].isLoading = opts.isLoading;
      if (opts.isStreaming !== undefined) msgs[idx].isStreaming = opts.isStreaming;
      if (opts.error !== undefined) msgs[idx].error = opts.error;
      saveMessages();
      return msgs[idx];
    }
  }
  return null;
}

function deleteMessage(msgId) {
  for (const convId of Object.keys(state.messages)) {
    const msgs = state.messages[convId];
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx !== -1) {
      msgs.splice(idx, 1);
      saveMessages();
      return;
    }
  }
}

// --- API Streaming ---
async function streamFromProvider(provider, prompt, conversationHistory, attachments, signal) {
  const cfg = getProviderConfig(provider.id);
  const apiKey = cfg.apiKey.trim();
  const model = cfg.model || provider.defaultModel;

  const headers = {
    'Content-Type': 'application/json',
    ...provider.extraHeaders,
  };

  const authValue = (provider.apiKeyPrefix || '') + apiKey;
  headers[provider.apiKeyHeader] = authValue;

  let body;

  if (provider.id === 'claude') {
    const messages = [];

    // History
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        const content = [{ type: 'text', text: msg.content }];
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.type === 'image' && att.base64) {
              content.push({
                type: 'image',
                source: { type: 'base64', media_type: att.mimeType || 'image/jpeg', data: att.base64 },
              });
            }
          }
        }
        messages.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: [{ type: 'text', text: msg.content }] });
      }
    }

    // Current prompt with attachments
    const currentContent = [{ type: 'text', text: prompt }];
    for (const att of (attachments || [])) {
      if (att.type === 'image' && att.base64) {
        currentContent.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mimeType || 'image/jpeg', data: att.base64 },
        });
      }
    }
    messages.push({ role: 'user', content: currentContent });

    body = JSON.stringify({
      model,
      max_tokens: 4096,
      messages,
      stream: true,
    });
  } else if (provider.id === 'openai') {
    const messages = [];
    for (const msg of conversationHistory) {
      if (msg.role === 'user') {
        const content = [{ type: 'text', text: msg.content }];
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.type === 'image' && att.base64) {
              content.push({
                type: 'image_url',
                image_url: { url: `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}`, detail: 'high' },
              });
            }
          }
        }
        messages.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: [{ type: 'text', text: msg.content }] });
      }
    }

    // Current prompt
    const currentContent = [{ type: 'text', text: prompt }];
    for (const att of (attachments || [])) {
      if (att.type === 'image' && att.base64) {
        currentContent.push({
          type: 'image_url',
          image_url: { url: `data:${att.mimeType || 'image/jpeg'};base64,${att.base64}`, detail: 'high' },
        });
      }
    }
    messages.push({ role: 'user', content: currentContent });

    const isReasoning = model.startsWith('gpt-5');
    const requestBody = {
      model,
      messages,
      stream: true,
    };
    if (isReasoning) {
      requestBody.max_completion_tokens = 4096;
      requestBody.reasoning_effort = 'medium';
    } else {
      requestBody.max_tokens = 4096;
      requestBody.temperature = 0.7;
    }

    body = JSON.stringify(requestBody);
  } else {
    // DeepSeek - text only
    const messages = [];
    for (const msg of conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: prompt });

    body = JSON.stringify({
      model,
      messages,
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    });
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      errorMsg = errBody.error?.message || errBody.error?.type || errorMsg;
    } catch (e) {
      errorMsg = response.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }

  return response;
}

function parseSSE(line) {
  if (!line || !line.startsWith('data: ')) return null;
  const data = line.slice(6).trim();
  if (data === '[DONE]') return { done: true };
  try { return JSON.parse(data); } catch (e) { return null; }
}

async function processProviderStream(provider, prompt, history, attachments, msgId) {
  const abortController = new AbortController();
  state.activeStreams[msgId] = abortController;

  try {
    const response = await streamFromProvider(provider, prompt, history, attachments, abortController.signal);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const fullTextBuf = [];
    let buffer = '';

    // Mark loading done
    updateAssistantMessage(msgId, '', { isLoading: false, isStreaming: true });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const parsed = parseSSE(line);
        if (!parsed) continue;
        if (parsed.done) break;

        let delta = '';

        if (provider.id === 'claude') {
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            delta = parsed.delta.text;
          }
          if (parsed.type === 'error') {
            throw new Error(parsed.error?.message || 'Claude API error');
          }
        } else if (provider.id === 'openai') {
          if (parsed.error) throw new Error(parsed.error.message || 'OpenAI API error');
          delta = parsed.choices?.[0]?.delta?.content || '';
        } else if (provider.id === 'deepseek') {
          if (parsed.error) throw new Error(parsed.error.message || 'DeepSeek API error');
          delta = parsed.choices?.[0]?.delta?.content || '';
        }

        if (delta) {
          fullTextBuf.push(delta);
          const currentText = fullTextBuf.join('');
          updateAssistantMessage(msgId, currentText, { isLoading: false, isStreaming: true });
          updateMessageElement(msgId, currentText);
        }
      }
    }

    const finalText = fullTextBuf.join('');
    updateAssistantMessage(msgId, finalText, { isLoading: false, isStreaming: false });
    updateMessageElement(msgId, finalText);
    scrollToBottom();

  } catch (err) {
    if (err.name === 'AbortError') return;
    updateAssistantMessage(msgId, '', { isLoading: false, isStreaming: false, error: err.message });
    updateMessageElement(msgId, null, err.message);
  } finally {
    delete state.activeStreams[msgId];
  }
}

function updateMessageElement(msgId, content, error) {
  const el = document.getElementById(`msg-${msgId}`);
  if (!el) {
    renderMessages();
    return;
  }

  const convMsgs = state.messages[state.currentConversationId];
  if (!convMsgs) return;
  const idx = convMsgs.findIndex(m => m.id === msgId);
  if (idx === -1) return;
  const msg = convMsgs[idx];
  const newEl = createMessageElement(msg);
  el.replaceWith(newEl);

  // Attach action listeners
  attachMessageActions(newEl, msg);
}

function attachMessageActions(el, msg) {
  el.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content).catch(() => {});
    });
  });
  el.querySelectorAll('[data-action="delete-msg"]').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteMessage(msg.id);
      renderMessages();
    });
  });
  el.querySelectorAll('[data-action="resend"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const providers = PROVIDERS.filter(p => state.selectedProviders.has(p.id));
      if (providers.length === 0) return;
      sendPrompt(msg.content, providers);
    });
  });
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
  });
}

// --- Send ---
function sendPrompt(prompt, providers) {
  const convId = state.currentConversationId;
  if (!convId) return;
  if (!prompt.trim() && state.pendingAttachments.length === 0) return;

  const attachments = [...state.pendingAttachments];
  state.pendingAttachments = [];
  renderAttachments();

  // Add user message
  const userMsg = addUserMessage(convId, prompt, attachments);
  const userEl = createMessageElement(userMsg);
  els.messagesList.appendChild(userEl);
  els.emptyState.classList.add('hidden');
  scrollToBottom();

  // Generate responses for each provider
  const convMessages = state.messages[convId];
  const history = convMessages.slice(0, -1); // exclude the just-added user message

  for (const provider of providers) {
    const cfg = getProviderConfig(provider.id);
    const model = cfg.model || provider.defaultModel;
    const assistantMsg = addAssistantMessage(convId, provider.id, model);

    const el = createMessageElement(assistantMsg);
    els.messagesList.appendChild(el);
    scrollToBottom();

    // Stream
    processProviderStream(provider, prompt, history, attachments, assistantMsg.id);
  }

  // Update sidebar title from first message
  const conv = state.conversations.find(c => c.id === convId);
  if (conv && prompt.trim()) {
    const title = prompt.trim().length > 50 ? prompt.trim().slice(0, 50) + '…' : prompt.trim();
    renameConversation(convId, title);
    updateHeader(conv);
    renderSidebar();
  }

  scrollToBottom();
}

// --- Attachments ---
function renderAttachments() {
  els.attachmentBar.innerHTML = '';
  if (state.pendingAttachments.length === 0) return;

  state.pendingAttachments.forEach(att => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    const icon = att.type === 'image' ? '📷' : '📄';
    chip.innerHTML = `
      <span>${icon}</span>
      <span>${escHtml(att.fileName || 'file')}</span>
      <span class="remove-attachment" data-att-id="${att.id}">✕</span>
    `;
    chip.querySelector('.remove-attachment').addEventListener('click', () => {
      state.pendingAttachments = state.pendingAttachments.filter(a => a.id !== att.id);
      renderAttachments();
    });
    els.attachmentBar.appendChild(chip);
  });
}

// --- Input ---
function handleInput() {
  const text = els.messageInput.value;
  state.inputText = text;

  // Auto-resize
  els.messageInput.style.height = 'auto';
  els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 120) + 'px';

  const hasContent = text.trim().length > 0 || state.pendingAttachments.length > 0;
  const hasProviders = state.selectedProviders.size > 0;
  els.sendBtn.disabled = !(hasContent && hasProviders);
}

function handleSend() {
  const text = els.messageInput.value.trim();
  if (!text && state.pendingAttachments.length === 0) return;

  const providers = PROVIDERS.filter(p => state.selectedProviders.has(p.id));
  if (providers.length === 0) return;

  els.messageInput.value = '';
  els.messageInput.style.height = 'auto';
  state.inputText = '';
  els.sendBtn.disabled = true;

  sendPrompt(text, providers);
}

// --- Keyboard Handling (visualViewport API) ---
function setupKeyboardHandling() {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const vv = window.visualViewport;
      const keyboardHeight = window.screen.height - vv.height;
      if (keyboardHeight > 150) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
      }
    });
  }

  els.messageInput.addEventListener('focus', () => {
    scrollToBottom();
  });
}

// --- Markdown Rendering ---
function renderMarkdown(text) {
  if (!text) return '';

  // Escape HTML first to prevent XSS
  let html = escHtml(text);

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const langClass = lang ? ` class="language-${escHtml(lang)}"` : '';
    return `<pre><code${langClass}>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    if (!match.includes('<ul>')) {
      return '<ol>' + match + '</ol>';
    }
    return match;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n+/g, '</p><p>');

  // Single newlines as <br>
  html = html.replace(/\n/g, '<br>');

  // Wrap in <p> tags if not already
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Settings ---
function openSettings() {
  els.settingsModal.classList.remove('hidden');
  renderSettings();
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

function renderSettings() {
  // Theme
  const currentTheme = document.documentElement.getAttribute('data-theme');
  $$('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });

  PROVIDERS.forEach(p => {
    const cfg = getProviderConfig(p.id);
    const section = els.settingsModal.querySelector(`.provider-config[data-provider="${p.id}"]`);
    if (!section) return;

    const keyInput = section.querySelector('.api-key-input');
    const modelSelect = section.querySelector('.model-select');
    const enabledCheck = section.querySelector('.provider-enabled');
    const saveBtn = section.querySelector('.save-provider-btn');

    keyInput.value = cfg.apiKey || '';
    enabledCheck.checked = cfg.enabled !== false;

    // Populate models
    modelSelect.innerHTML = '';
    p.models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === (cfg.model || p.defaultModel)) opt.selected = true;
      modelSelect.appendChild(opt);
    });

    // Allow custom model
    const currentModel = cfg.model || p.defaultModel;
    if (!p.models.includes(currentModel)) {
      const opt = document.createElement('option');
      opt.value = currentModel;
      opt.textContent = currentModel + ' (custom)';
      opt.selected = true;
      modelSelect.appendChild(opt);
    }

    // Re-bind save button via clone to remove old listeners
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
      const val = keyInput.value.trim();
      if (val) {
        state.providers[p.id] = {
          apiKey: val,
          model: modelSelect.value || p.defaultModel,
          enabled: enabledCheck.checked,
        };
        saveProviders();
        newSaveBtn.textContent = '✓ Saved';
        setTimeout(() => { newSaveBtn.textContent = 'Save'; }, 2000);
        renderProviderBar();
      }
    });
  });
}

// --- Event Listeners ---
function setupEventListeners() {
  // New chat
  els.newChatBtnSidebar.addEventListener('click', () => {
    const conv = createConversation();
    openConversation(conv.id);
    closeSidebar();
  });

  // Menu toggle (mobile)
  els.menuToggle.addEventListener('click', openSidebar);
  els.sidebarOverlay.addEventListener('click', closeSidebar);

  // Settings
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsBtnSidebar.addEventListener('click', () => {
    closeSidebar();
    openSettings();
  });
  els.settingsClose.addEventListener('click', closeSettings);
  els.settingsModal.addEventListener('click', (e) => {
    if (e.target === els.settingsModal) closeSettings();
  });

  // Theme buttons
  $$('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      $$('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Clear all data
  els.clearAllDataBtn.addEventListener('click', () => {
    if (confirm('Delete ALL conversations? This cannot be undone.')) {
      state.conversations = [];
      state.messages = {};
      state.currentConversationId = null;
      saveConversations();
      saveMessages();
      renderSidebar();
      showEmptyState();
      updateHeader(null);
    }
  });

  // Send button
  els.sendBtn.addEventListener('click', handleSend);

  // Input
  els.messageInput.addEventListener('input', handleInput);
  els.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Attach button
  els.attachBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.txt,.docx';
    input.multiple = false;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;

      const att = {
        id: generateId(),
        type: file.type.startsWith('image/') ? 'image' : 'document',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      };

      const reader = new FileReader();
      reader.onload = (e) => {
        if (file.type.startsWith('image/')) {
          att.base64 = e.target.result.split(',')[1];
        } else {
          att.extractedText = e.target.result;
        }
        state.pendingAttachments.push(att);
        renderAttachments();
        handleInput();
      };

      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });
    input.click();
  });

  // Keyboard handling
  setupKeyboardHandling();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// --- Init ---
function init() {
  initRefs();
  loadState();

  // Auto-create first conversation if none exist
  if (state.conversations.length === 0) {
    const conv = createConversation();
    openConversation(conv.id);
  } else {
    openConversation(state.conversations[0].id);
  }

  // Default selected providers = all enabled ones with API keys
  PROVIDERS.forEach(p => {
    const cfg = getProviderConfig(p.id);
    if (cfg.enabled && cfg.apiKey.trim()) {
      state.selectedProviders.add(p.id);
    }
  });

  renderProviderBar();
  setupEventListeners();

  // Handle system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME);
    if (stored === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });

  console.log('ThaibanChat v' + APP_VERSION + ' initialized');
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);