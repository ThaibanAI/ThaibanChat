# ThaibanChat 🚀

**A multi-provider AI chat PWA — talk to Claude, GPT, and DeepSeek simultaneously in one unified interface.**

Send one prompt to multiple LLM providers and compare their responses side by side. Fully client-side — no backend. Works offline. Installable as a PWA.

![Icon](./icons/icon-192.png)

---

## ✨ Features

### 🔌 Multi-Provider Support
- **Anthropic Claude** — via Messages API (streaming)
- **OpenAI** — via Chat Completions API (streaming)
- **DeepSeek** — via Chat API (streaming)
- Select any combination of providers per message
- Configure API keys and models in Settings

### 💬 Rich Chat Interface
- Parallel streaming responses — see responses arrive in real-time from all selected providers
- Markdown rendering with syntax-highlighted code blocks, tables, lists, and more
- Copy, Delete, and Re-send per message
- Multiple conversation threads with auto-naming

### 📎 File Attachments
- **Images** — sent as base64 to vision-capable providers (Claude, GPT-4o)
- **Documents** — TXT files extracted and sent as context

### 📱 Progressive Web App
- **Installable** — Add to Home Screen on mobile/desktop
- **Offline-ready** — Service worker caches the app shell
- **Responsive** — Works on phones, tablets, and desktops
- **Landscape-optimized** — Wider bubbles, compact UI in landscape mode
- **Keyboard-aware** — `visualViewport` API keeps the input visible above the keyboard

### 🎨 Design
- Dark-first with purple/pink gradient brand identity
- Light mode available
- Clean, glassmorphism-inspired UI
- Provider color coding (Claude ✅ amber, OpenAI ✅ green, DeepSeek ✅ indigo)

### 🔒 Privacy
- **No backend** — API calls go directly from your browser to the LLM providers
- API keys stored in **localStorage** — never sent anywhere except to the provider
- No analytics, no tracking, no telemetry

---

## 🚀 Quick Start

### Try it Online
Open the app directly in your browser at:
**[https://thaibanai.github.io/ThaibanChat](https://thaibanai.github.io/ThaibanChat)**

### Run Locally
```bash
git clone https://github.com/ThaibanAI/ThaibanChat.git
cd ThaibanChat
# Serve with any static HTTP server
python3 -m http.server 8080
# Or: npx serve .
```

Then open `http://localhost:8080` in your browser.

### Install as PWA
1. Open the app in Chrome/Edge/Brave
2. Tap the Install icon in the address bar (or menu → "Add to Home Screen")
3. Launch from your home screen like a native app

---

## 🔑 API Key Setup

1. Open ThaibanChat
2. Click the **Settings** gear icon
3. Enter your API keys for the providers you want to use:

| Provider | Get API Key |
|----------|------------|
| **Claude** | [console.anthropic.com](https://console.anthropic.com/) |
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com/) |

4. Toggle each provider on/off as desired
5. Select which models to use — or enter a custom model name

---

## 📁 Project Structure

```
ThaibanChat/
├── index.html        # Main SPA - chat, sidebar, settings modal
├── style.css         # Full stylesheet (dark/light, responsive)
├── app.js            # Application logic (state, API streaming, rendering)
├── sw.js             # Service worker (offline caching)
├── manifest.json     # PWA manifest
├── icons/
│   ├── icon.svg      # Source SVG
│   ├── icon-192.png  # PWA icon (192x192)
│   └── icon-512.png  # PWA icon (512x512)
└── README.md
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| UI | Vanilla HTML + CSS (no frameworks) |
| JavaScript | Vanilla ES6+ |
| API | Fetch + ReadableStream (SSE streaming) |
| Storage | localStorage |
| Markdown | Custom renderer (no dependencies) |
| PWA | Service Worker + Web Manifest |
| Icons | SVG + ImageMagick |

Zero external dependencies. Everything is self-contained in a single directory.

---

## 📋 Roadmap

- [ ] Multi-turn conversation context (auto-include history)
- [ ] Document attachments (PDF/DOCX text extraction)
- [ ] Custom provider base URL (self-hosted models)
- [ ] Export conversations
- [ ] Message search
- [ ] Dark/light system auto-switching

---

## 🤝 Contributing

Open an issue or PR! This is a small project — ideas and improvements welcome.

---

## 📄 License

MIT — do whatever you want with it.

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ThaibanAI">ThaibanAI</a>
</p>
