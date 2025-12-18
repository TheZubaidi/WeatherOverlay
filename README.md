# WeatherOverlay (Home Assistant)

WeatherOverlay is a **frontend (Lovelace / Dashboard) plugin** for Home Assistant that renders **fullscreen animated weather effects** such as rain, snow, clouds, fog, lightning, stars, and a sunny glow based on a Home Assistant **weather entity**.

This integration is **UI-only**. It does not install any Python code and does not require a Home Assistant restart.

---

## What this integration does

- Displays fullscreen animated weather overlays
- Uses a Home Assistant `weather.*` entity
- Fully configurable via Lovelace YAML
- Optional enable/disable helper
- Automatically updated via HACS

## What this integration does NOT do

- It does **not** automatically register Lovelace resources
- It does **not** install backend (Python) components
- It does **not** modify dashboards automatically

---

## Installation (HACS)

### 1. Add the custom repository

1. Open **HACS**
2. Click the menu (⋮) → **Custom repositories**
3. Add:
   - **Repository**
     ```
     https://github.com/YOUR_GITHUB_USERNAME/WeatherOverlay
     ```
   - **Category**
     ```
     Dashboard
     ```
4. Click **Add**
5. Install **WeatherOverlay**

---

## ⚠️ Required one-time manual step

Because this is a **frontend plugin**, Home Assistant requires explicit approval to load JavaScript.

### 2. Register the Lovelace resource (ONE TIME ONLY)

Go to:

**Settings → Dashboards → Resources → Add Resource**

- **URL**
