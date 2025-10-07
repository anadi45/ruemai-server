# 🧠 AI-Powered Product Demo Generator (Architecture Overview)

## 🚀 Overview

This system automatically generates **interactive product demos** and **guided tours** for any web application.  
Users simply provide:

- Website URL  
- Login credentials  

The system logs in, explores the web app, identifies features, and automatically creates **Web Interaction Scripts (WIS)** — which define each guided tour.

---

## 🧩 1. User Input Layer

### Input
- **Website URL**
- **Login credentials** (secured via encryption/vault)

### Purpose
Provides access for the AI agent to explore the target web app and record its structure.

---

## 🤖 2. Browser Automation + AI Agent Layer

**Tech:** Playwright / Puppeteer / Selenium  

### Responsibilities
- Log into the user's web app.
- Record DOM structure, visible elements, and user actions.
- Identify buttons, menus, inputs, and tooltips.
- Capture screenshots and element metadata.

### AI Agent Tasks
- Understand UI semantics (via a vision-language model).
- Identify feature flows like "Create Project," "Invite User," etc.
- Generate abstract interaction plans for each flow.

---

## 🧱 3. Web Interaction Script (WIS)

### What is WIS?
**Web Interaction Script** is a declarative, JSON-based script that defines how to reproduce and guide a product flow.

Each WIS contains:
- UI element selectors
- Actions to perform (click, type, hover, etc.)
- Tooltip content and positioning
- Step order and flow metadata

### Example WIS JSON
```json
{
  "name": "Create Project Flow",
  "steps": [
    {
      "selector": "#new-project-button",
      "action": "click",
      "tooltip": {
        "text": "Click here to start creating a new project",
        "position": "right"
      }
    },
    {
      "selector": "#project-name-input",
      "action": "type",
      "value": "My First Project",
      "tooltip": {
        "text": "Enter a name for your project",
        "position": "bottom"
      }
    },
    {
      "selector": "#save-button",
      "action": "click",
      "tooltip": {
        "text": "Save and continue",
        "position": "left"
      }
    }
  ]
}
```

### How WIS is Generated

1. AI parses DOM and screenshots.
2. Classifies key UI actions and intended flows.
3. Generates a WIS JSON per flow.
4. Scripts are stored for later playback or editing.

---

## 🧩 4. Playback Layer (Chrome Extension)

### Role

Executes WIS on top of the website to create an **interactive demo** or **onboarding experience**.

### Mechanism

- Content script injects tooltips, highlights, and overlays.
- Executes defined WIS actions step by step.
- Allows **manual (Next/Previous)** or **auto-play** modes.

### UI Overlay

- Visually highlights the active UI element.
- Shows tooltips and instructions from WIS.
- Provides navigation controls to move through the flow.

---

## 🧠 5. AI Model Layer

### Input

- DOM structure
- Screenshot embeddings
- Page text and attributes

### Output

- Structured **WIS JSON**
- Step labels and tooltips
- Categorized feature flows

### Enhancements

- Vision + language models (GPT-4o, Claude 3.5, Gemini 1.5 Pro)
- Semantic UI understanding (detects icons like "+" as "Add User")
- Optional reinforcement from analytics on user engagement

---

## 🧰 6. Storage & Management Layer

**Tech:** MongoDB / DynamoDB / PostgreSQL

Stores:

- Website metadata
- Generated WIS scripts
- Feature categories and flow mappings
- Version history for updates or replays

Supports editing and re-generating flows from dashboard.

---

## 🔒 7. Security Layer

- Credentials encrypted in vault (AWS Secrets Manager / HashiCorp Vault).
- Browser sessions sandboxed via Playwright contexts.
- No raw credentials or session data persisted.

---

## 🔄 8. End-to-End Flow

1. User submits URL and credentials.
2. AI agent logs in using Playwright.
3. System scans and maps UI components.
4. AI generates **Web Interaction Scripts (WIS)** per feature.
5. WIS are stored and shown on a dashboard.
6. Chrome Extension injects WIS for interactive playback.
7. Users can view, share, or edit generated demos.

---

## 🧭 9. Future Extensions

- Multi-page flow detection and linking between WIS files.
- Automatic narration (text-to-speech for demos).
- Analytics dashboard (track user progress through tours).
- Integration with onboarding tools (Intercom, Appcues, Userflow).
- Collaborative editing of WIS scripts in real time.

---

## 📊 10. Summary

| Layer         | Role                             | Key Tech                  |
| ------------- | -------------------------------- | ------------------------- |
| User Input    | Collects URL + credentials       | Frontend UI               |
| Automation    | Explores web app                 | Playwright / Puppeteer    |
| WIS Generator | Generates guided flow script     | AI + JSON DSL             |
| Playback      | Renders demo                     | Chrome Extension          |
| Storage       | Persists scripts + metadata      | MongoDB / DynamoDB        |
| Security      | Protects data and sessions       | Vault / Encrypted Storage |
| AI Layer      | Understands UI + creates scripts | GPT-4o / Claude / Gemini  |

---

## 🧩 Conceptual Diagram (Textual)

```
User → [Frontend UI] 
      → [Automation Agent (Playwright)]
      → [AI Model] → [Web Interaction Script (WIS)]
      → [Database]
      → [Chrome Extension Playback]
      → [Interactive Guided Demo]
```

---

**Web Interaction Script (WIS)** becomes the core abstraction layer that bridges AI understanding with human-facing interactive demos — a universal way to describe and replay any UI flow.