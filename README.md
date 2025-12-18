# Weather Overlay (Home Assistant)

Fullscreen animated weather effects for Home Assistant dashboards.

## Features
- Rain, snow, clouds, fog, lightning, stars, sunny glow
- Reads from Home Assistant weather entities
- Toggleable via `input_boolean`
- Dashboard-aware (can limit which dashboards show effects)
- Pure frontend (no backend or Python required)

## Installation (HACS)

1. HACS → Frontend
2. Custom repositories
3. Add:
   - Repository: https://github.com/YOUR_USERNAME/weather-overlay
   - Category: Lovelace
4. Install
5. Add as a Lovelace resource

## Manual Installation

Place `weather-overlay.js` in:
