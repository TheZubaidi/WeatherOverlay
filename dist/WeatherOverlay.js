/* WeatherOverlay.js
 * HACS Dashboard/Plugin: fullscreen weather overlay driven by HA weather entity
 * Place this card on any Lovelace view to enable the overlay on that view.
 */

const DEFAULT_CONFIG = {
  weather_entity: null,               // REQUIRED (e.g. "weather.pirateweather")
  toggle_entity: null,                // optional (e.g. "input_boolean.weather_overlay")
  test_entity: null,                  // optional (e.g. "input_select.weather_overlay_test")
  test_entity_passthrough_state: "Use Real Weather",
  update_interval_ms: 2000,
  z_index: 9999,
  pointer_events: "none",
  state_map: {
    "clear": "sunny",
    "clear-night": "clear-night",
    "sunny": "sunny",
    "partlycloudy": "partlycloudy",
    "partly-cloudy-day": "partlycloudy",
    "partly-cloudy-night": "partlycloudy",
    "cloudy": "cloudy",
    "overcast": "cloudy",
    "fog": "fog",
    "hazy": "fog",
    "mist": "fog",
    "rainy": "rainy",
    "rain": "rainy",
    "pouring": "pouring",
    "heavy-rain": "pouring",
    "lightning": "lightning",
    "thunderstorm": "lightning-rainy",
    "lightning-rainy": "lightning-rainy",
    "snowy": "snowy",
    "snow": "snowy",
    "snowy-rainy": "snowy-rainy",
    "sleet": "snowy-rainy",
    "windy": "cloudy",
    "windy-variant": "partlycloudy",
    "exceptional": "cloudy",
  },
};

const EFFECTS = {
  rainy: {
    maxParticles: 70,
    color: "rgba(174, 194, 224, 0.35)",
    speedMin: 15,
    speedMax: 25,
    sizeMin: 1,
    sizeMax: 2,
    swayAmount: 0.6,
    type: "rain",
  },
  pouring: {
    maxParticles: 70,
    color: "rgba(174, 194, 224, 0.35)",
    speedMin: 11,
    speedMax: 18,
    sizeMin: 1,
    sizeMax: 2,
    swayAmount: 0.6,
    type: "rain",
    lengthMultiplier: 4,
  },
  cloudy: {
    maxParticles: 10,
    color: "rgba(180, 180, 180, 0.10)",
    speedMin: 0.25,
    speedMax: 0.75,
    sizeMin: 80,
    sizeMax: 150,
    swayAmount: 0.5,
    type: "clouds",
  },
  partlycloudy: {
    maxParticles: 7,
    color: "rgba(200, 200, 200, 0.08)",
    speedMin: 0.3,
    speedMax: 0.9,
    sizeMin: 70,
    sizeMax: 130,
    swayAmount: 0.6,
    type: "clouds",
  },
  fog: {
    maxParticles: 14,
    color: "rgba(220, 220, 220, 0.10)",
    speedMin: 0.12,
    speedMax: 0.35,
    sizeMin: 120,
    sizeMax: 240,
    swayAmount: 0.2,
    type: "clouds",
  },
  snowy: {
    maxParticles: 55,
    color: "rgba(255, 255, 255, 0.40)",
    speedMin: 2,
    speedMax: 5,
    sizeMin: 2,
    sizeMax: 5,
    swayAmount: 1.7,
    type: "snow",
  },
  "snowy-rainy": {
    maxParticles: 70,
    color: "rgba(200, 210, 230, 0.35)",
    speedMin: 8,
    speedMax: 15,
    sizeMin: 1.5,
    sizeMax: 4,
    swayAmount: 1.0,
    type: "mixed",
  },
  lightning: { maxParticles: 0, type: "lightning" },
  "lightning-rainy": {
    maxParticles: 70,
    color: "rgba(174, 194, 224, 0.35)",
    speedMin: 15,
    speedMax: 25,
    sizeMin: 1,
    sizeMax: 2,
    swayAmount: 0.6,
    type: "rain",
    hasLightning: true,
  },
  "clear-night": { maxParticles: 50, type: "stars" },
  sunny: { maxParticles: 0, type: "sunny" },
};

class WeatherOverlayManager {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.particles = [];
    this.animationId = null;

    this.currentEffectKey = null;

    this.lightningTimer = 0;
    this.lightningInterval = 1500 + Math.random() * 2500;
    this.showLightning = false;
    this.lightningDuration = 0;
    this.lightningBrightness = 0;
    this.lightningFadeSpeed = 0;

    this._resizeHandler = () => this.resize();
    this._visible = true;

    this._refCount = 0;
    this._lastFrameTs = 0;
  }

  attach(config) {
    this._refCount++;
    if (this.canvas) return;

    this.canvas = document.createElement("canvas");
    this.canvas.id = "weather-overlay-canvas";
    Object.assign(this.canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: config.pointer_events || "none",
      zIndex: String(config.z_index ?? 9999),
      display: "block",
    });

    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d", { alpha: true });

    window.addEventListener("resize", this._resizeHandler, { passive: true });
    this.resize();
  }

  detach() {
    this._refCount = Math.max(0, this._refCount - 1);
    if (this._refCount > 0) return;

    this.stop();
    window.removeEventListener("resize", this._resizeHandler);

    if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.currentEffectKey = null;
  }

  setVisible(visible) {
    this._visible = !!visible;
    if (!this.canvas) return;
    this.canvas.style.display = this._visible ? "block" : "none";
    if (!this._visible) this.stop();
  }

  resize() {
    if (!this.canvas || !this.ctx) return;

    this.dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);

    // IMPORTANT: reset transform so scale doesn't compound on every resize
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setEffect(effectKey) {
    if (!effectKey || !EFFECTS[effectKey]) {
      this.currentEffectKey = null;
      this.particles = [];
      this.stop();
      this.clear();
      return;
    }

    if (effectKey === this.currentEffectKey) return;

    this.currentEffectKey = effectKey;
    this.resetLightning();
    this.initParticles(effectKey);

    if (this._visible) this.start();
  }

  clear() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  initParticles(effectKey) {
    const effect = EFFECTS[effectKey];
    this.particles = [];
    if (!effect || effect.maxParticles <= 0) return;
    for (let i = 0; i < effect.maxParticles; i++) this.particles.push(new Particle(effect));
  }

  resetLightning() {
    this.lightningTimer = 0;
    this.showLightning = false;
    this.lightningDuration = 0;
    this.lightningBrightness = 0;
    this.lightningInterval = 1500 + Math.random() * 2500;
    this.lightningFadeSpeed = 0;
  }

  start() {
    if (this.animationId || !this.canvas || !this.ctx) return;
    this._lastFrameTs = performance.now();
    this.animationId = requestAnimationFrame((ts) => this.animate(ts));
  }

  stop() {
    if (!this.animationId) return;
    cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  animate(ts) {
    if (!this.canvas || !this.ctx || !this._visible) {
      this.animationId = null;
      return;
    }

    const dtMs = Math.min(50, Math.max(0, ts - this._lastFrameTs));
    this._lastFrameTs = ts;

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    const effect = this.currentEffectKey ? EFFECTS[this.currentEffectKey] : null;

    if (effect) {
      if (effect.type === "sunny") this.drawSunnyGlow();

      for (const p of this.particles) {
        p.update(effect, dtMs);
        p.draw(this.ctx, this.currentEffectKey);
      }

      if (effect.type === "lightning" || effect.hasLightning) this.updateLightning(dtMs);
    }

    this.animationId = requestAnimationFrame((t) => this.animate(t));
  }

  drawSunnyGlow() {
    const ctx = this.ctx;
    const x = window.innerWidth * 0.9;
    const y = window.innerHeight * 0.1;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, 500);
    grad.addColorStop(0, "rgba(255, 200, 80, 0.25)");
    grad.addColorStop(0.2, "rgba(255, 180, 60, 0.15)");
    grad.addColorStop(0.5, "rgba(255, 160, 40, 0.08)");
    grad.addColorStop(0.8, "rgba(255, 140, 20, 0.03)");
    grad.addColorStop(1, "rgba(255, 120, 10, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 500, 0, Math.PI * 2);
    ctx.fill();
  }

  updateLightning(dtMs) {
    this.lightningTimer += dtMs;

    if (this.showLightning) {
      this.lightningDuration -= dtMs;

      if (this.lightningDuration <= 0) {
        this.showLightning = false;
        this.lightningTimer = 0;
        this.lightningInterval = 1500 + Math.random() * 2500;
        return;
      }

      this.lightningBrightness = Math.max(
        0,
        this.lightningBrightness - this.lightningFadeSpeed * (dtMs / 16)
      );
      this.drawLightning(this.lightningBrightness);
      return;
    }

    if (this.lightningTimer >= this.lightningInterval) {
      this.showLightning = true;

      const flashType = Math.random();
      if (flashType < 0.3) {
        this.lightningDuration = 150 + Math.random() * 100;
        this.lightningBrightness = 0.7 + Math.random() * 0.3;
      } else if (flashType < 0.6) {
        this.lightningDuration = 600 + Math.random() * 400;
        this.lightningBrightness = 0.5 + Math.random() * 0.2;
      } else {
        this.lightningDuration = 300 + Math.random() * 200;
        this.lightningBrightness = 0.6 + Math.random() * 0.3;
      }

      this.lightningFadeSpeed = this.lightningBrightness / Math.max(1, (this.lightningDuration / 16));
    }
  }

  drawLightning(brightness) {
    const ctx = this.ctx;

    const lightX = Math.random() * window.innerWidth;
    const lightY = Math.random() * (window.innerHeight * 0.3);

    const gradient = ctx.createRadialGradient(
      lightX, lightY, 0,
      lightX, lightY, window.innerWidth * 0.8
    );

    const v = Math.random() * 30;
    const blue = 220 + v;
    const green = 230 + v;

    gradient.addColorStop(0, `rgba(255, ${green}, ${blue}, ${brightness * 0.4})`);
    gradient.addColorStop(0.3, `rgba(240, ${green - 20}, ${blue - 20}, ${brightness * 0.25})`);
    gradient.addColorStop(0.7, `rgba(200, ${green - 40}, ${blue - 40}, ${brightness * 0.1})`);
    gradient.addColorStop(1, "rgba(180, 190, 210, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.15})`;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

class Particle {
  constructor(effect) {
    this.type = effect.type;
    this.reset(effect, true);
  }

  reset(effect, initial = false) {
    this.type = effect.type;

    if (this.type === "stars") {
      this.x = Math.random() * window.innerWidth;
      this.y = Math.random() * (window.innerHeight * 0.3);
      this.size = 1 + Math.random() * 1.5;
      this.phase = Math.random() * 6;
      this.cycleLength = 6;
      this.opacity = 0;
      return;
    }

    if (this.type === "clouds") {
      this.x = initial ? Math.random() * window.innerWidth : -effect.sizeMax;
      this.y = Math.random() * (window.innerHeight * 0.3);
      this.speed = effect.speedMin + Math.random() * (effect.speedMax - effect.speedMin);
      this.size = effect.sizeMin + Math.random() * (effect.sizeMax - effect.sizeMin);
      this.sway = (Math.random() - 0.5) * (effect.swayAmount ?? 0.5);
      this.opacity = 0.5 + Math.random() * 0.5;

      this.puffCount = 5 + Math.floor(Math.random() * 3);
      this.puffSizes = Array.from({ length: this.puffCount }, () => 0.4 + Math.random() * 0.3);
      return;
    }

    this.x = Math.random() * window.innerWidth;
    this.y = initial ? Math.random() * window.innerHeight : -10;
    this.speed = effect.speedMin + Math.random() * (effect.speedMax - effect.speedMin);
    this.size = effect.sizeMin + Math.random() * (effect.sizeMax - effect.sizeMin);
    this.sway = (Math.random() - 0.5) * (effect.swayAmount ?? 0.5);
    this.opacity = 0.5 + Math.random() * 0.5;
  }

  update(effect, dtMs) {
    const dt = dtMs / 16;

    if (this.type === "stars") {
      this.phase += 0.016 * dt;
      if (this.phase >= this.cycleLength) {
        this.phase = 0;
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * (window.innerHeight * 0.3);
      }

      if (this.phase < 1) this.opacity = this.phase;
      else if (this.phase < 3) this.opacity = 0.8 + Math.sin((this.phase - 1) * Math.PI) * 0.2;
      else if (this.phase < 4) this.opacity = 1 - (this.phase - 3);
      else this.opacity = 0;

      return;
    }

    if (this.type === "clouds") {
      this.x += this.speed * dt;
      this.y += Math.sin(this.x * 0.01) * 0.2 * dt;

      if (this.x > window.innerWidth + this.size) {
        this.x = -this.size;
        this.y = Math.random() * (window.innerHeight * 0.3);
      }
      return;
    }

    this.y += this.speed * dt;
    this.x += this.sway * dt;

    if (this.y > window.innerHeight + 20) this.reset(effect, false);
    if (this.x < -20 || this.x > window.innerWidth + 20) this.x = Math.random() * window.innerWidth;
  }

  draw(ctx, effectKey) {
    const effect = EFFECTS[effectKey];
    if (!effect) return;

    ctx.globalAlpha = this.opacity;

    if (this.type === "stars") {
      if (this.opacity > 0) {
        ctx.globalAlpha = this.opacity * 0.7;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.shadowColor = "rgba(200, 220, 255, 0.6)";
        ctx.shadowBlur = 4 + this.opacity * 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.type === "clouds") {
      const baseOpacity = this.opacity * 0.6;
      const baseColor = effect.color;

      for (let i = 0; i < this.puffCount; i++) {
        const angle = (i / this.puffCount) * Math.PI * 2;
        const puffSize = this.size * this.puffSizes[i];
        const offsetX = Math.cos(angle) * this.size * 0.4;
        const offsetY = Math.sin(angle) * this.size * 0.25;

        const gradient = ctx.createRadialGradient(
          this.x + offsetX, this.y + offsetY, 0,
          this.x + offsetX, this.y + offsetY, puffSize
        );
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(0.6, baseColor.replace(/[\d.]+\)$/g, "0.02)"));
        gradient.addColorStop(1, "rgba(180, 180, 180, 0)");

        ctx.globalAlpha = baseOpacity;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x + offsetX, this.y + offsetY, puffSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      return;
    }

    if (this.type === "snow") {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = effect.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    if (this.type === "mixed") {
      const isSnow = Math.random() > 0.5;
      if (isSnow) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = effect.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.sway, this.y + this.size * 4);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = this.size * 0.7;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }

    if (this.type === "rain") {
      const lengthMult = effect.lengthMultiplier || 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + this.sway, this.y + this.size * 4 * lengthMult);
      ctx.strokeStyle = effect.color;
      ctx.lineWidth = this.size;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    ctx.globalAlpha = 1;
  }
}

const OVERLAY = new WeatherOverlayManager();

class WeatherOverlayCard extends HTMLElement {
  static getStubConfig() {
    return {
      weather_entity: "weather.home",
      toggle_entity: "input_boolean.weather_overlay",
    };
  }

  setConfig(config) {
    this._config = {
      ...DEFAULT_CONFIG,
      ...(config || {}),
      state_map: {
        ...DEFAULT_CONFIG.state_map,
        ...((config && config.state_map) || {}),
      },
    };

    if (!this._config.weather_entity) {
      throw new Error("weather_entity is required (e.g. weather.pirateweather)");
    }

    // This is an “invisible” card; overlay is fullscreen
    this.style.display = "none";
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._attached) {
      this._attached = true;
      OVERLAY.attach(this._config);
      this._startPolling();
    }
  }

  connectedCallback() {
    this._connected = true;
  }

  disconnectedCallback() {
    this._connected = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    OVERLAY.detach();
  }

  getCardSize() {
    return 0;
  }

  _startPolling() {
    if (this._pollTimer) return;

    const interval = Math.max(500, Number(this._config.update_interval_ms || 2000));
    this._pollTimer = setInterval(() => this._tick(), interval);
    this._tick();
  }

  _tick() {
    if (!this._connected || !this._hass || !this._config) return;

    const enabled = this._isEnabled();
    OVERLAY.setVisible(enabled);
    if (!enabled) return;

    const raw = this._getWeatherState();
    const mapped = this._mapState(raw);
    OVERLAY.setEffect(mapped);
  }

  _isEnabled() {
    const t = this._config.toggle_entity;
    if (!t) return true;

    const st = this._hass.states[t];
    if (!st) return true; // fail-open
    return st.state === "on";
  }

  _getWeatherState() {
    if (this._config.test_entity) {
      const test = this._hass.states[this._config.test_entity];
      if (test && test.state && test.state !== this._config.test_entity_passthrough_state) {
        return test.state;
      }
    }

    const w = this._hass.states[this._config.weather_entity];
    return w ? w.state : null;
  }

  _mapState(raw) {
    if (!raw) return null;
    const key = String(raw).toLowerCase();
    return this._config.state_map[key] || key;
  }
}

customElements.define("weather-overlay-card", WeatherOverlayCard);

// Card picker metadata
window.customCards = window.customCards || [];
window.customCards.push({
  type: "weather-overlay-card",
  name: "Weather Overlay (Fullscreen)",
  description: "Fullscreen animated weather overlay driven by a weather entity.",
});
