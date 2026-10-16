# UNLIMITED AUTO FLOW ⚡

> **Chrome Extension (Manifest V3) for automated bulk image and video generation on Google Flow (`flow.google.com`), featuring batch prompt queuing, automatic downloads, and watermark cleanup.**

---

## 🌟 Overview

**UNLIMITED AUTO FLOW** is a browser extension built on Chrome's Manifest V3 architecture. Designed for creators, artists, and power users of Google Flow, it streamlines repetitive generation workflows by allowing you to queue hundreds of prompts, customize generation parameters, and automatically download the resulting high-resolution media directly to your drive.

---

## ✨ Features

### 🚀 Bulk Generation & Queue Management
- **Large Batch Support:** Queue up to 1,000 prompts at once.
- **Flexible Input:** Upload `.txt` files (prompts separated by blank lines) or paste directly into the panel.
- **Smart Referencing:** 
  - Use `@name` tags in prompts to reference previously generated or uploaded images.
  - Use `#name` tags to name generated outputs for seamless chaining across steps.
- **Queue History & Resumption:** Reopen previous generation batches, retry failed prompts, or edit prompts mid-queue.

### 🎨 Image & Video Generation Support
- **AI Image Models:** Compatible with Google Flow's image generation pipelines (Nano Banana 2 / Beluga, Nano Banana Pro, Lite).
- **Aspect Ratios:** Supports `16:9`, `4:3`, `1:1`, `3:4`, and `9:16`.
- **AI Video Models (Veo & Omni Flash):**
  - Veo 3.1 (Lite, Fast, Quality, Relaxed) and Omni Flash (Abra).
  - Multiple video generation modes: Text-to-Video, Start Frame (`@start:name`), Start + End Frame (`@start:name @end:name`), and Multi-Reference video.
- **Reference Image System:** Attach up to 100 reference images categorized by Subject, Scene, and Style.

### 💧 Watermark Detection & Removal
- **Lossless Reverse Blending:** Employs Normalized Cross-Correlation (NCC) pattern matching and inverse alpha-blending directly on an HTML5 canvas to restore original pixels without recompression artifacts.
- **In-Page "Clean" Pill:** Injects an interactive review pill on Google Flow media tiles to preview before/after comparisons and adjust removal strength.

### ⚡ Intelligent Concurrency & Auto-Download
- **Adaptive Pacing:** Choose between **Fast** (multi-threaded concurrent generation), **Balanced**, **Slow**, or **Custom** delay intervals to prevent server throttling.
- **Auto-Download:** Automatically saves generated media with customizable folder destinations and sequential naming formats.
- **Keep-Awake Engine:** Runs an unobtrusive background audio-context heartbeat to prevent browser tabs from sleeping during overnight or long-running batches.

---

## 📁 Project Structure

```text
├── manifest.json        # Extension Manifest V3 configuration & permissions
├── background.js       # Background service worker (downloads & panel trigger)
├── sidepanel.html      # Main Side Panel UI layout
├── sidepanel.css       # Styling for the Side Panel
├── sidepanel.js        # Core controller logic (queue, auth, API & RPC dispatch)
├── inject.js           # Main-world script helpers for Google Flow integration
├── recap-capture.js    # Content script for enterprise reCAPTCHA handling
├── flow-inject.js      # In-page UI overlay script for Flow media tiles
├── flow-inject.css     # Styling for in-page overlays and clean modals
├── wm.js               # Watermark identification and canvas-cleaning engine
├── icons/              # Extension icons (16px, 32px, 48px, 128px, 512px)
└── vendor/             # Bundled third-party libraries (MP4 muxer, detection utils)
```

---

## 🛠️ Installation & Setup

1. **Clone or Download the Repository:**
   ```bash
   git clone https://github.com/<your-username>/unlimited-auto-flow.git
   ```
2. **Open Chrome Extensions Page:**
   - Navigate to `chrome://extensions/` in Google Chrome or any Chromium-based browser (Brave, Edge, etc.).
3. **Enable Developer Mode:**
   - Toggle the **Developer mode** switch in the top right corner.
4. **Load the Extension:**
   - Click **Load unpacked**.
   - Select the directory containing `manifest.json`.
5. **Pin & Launch:**
   - Pin the extension to your toolbar and click its icon to open the side panel while navigating to [Google Flow](https://flow.google.com).

---

## 🔒 Permissions & Security

- **`sidePanel`**: Provides an integrated workflow alongside the active Google Flow webpage.
- **`storage`**: Persists local preferences, presets, and queue progress.
- **`downloads`**: Saves generated images and videos directly to your designated downloads folder.
- **`scripting` & `tabs`**: Facilitates interaction and communication between the extension and the Google Flow web app.

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
