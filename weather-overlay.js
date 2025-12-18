// Weather Overlay for Home Assistant
// Fullscreen canvas weather animations based on weather entity state
(function() {
  'use strict';
  
  // Configuration
  const WEATHER_ENTITY = 'weather.pirateweather'; // Change this to your weather entity
  const TOGGLE_ENTITY = 'input_boolean.weather_overlay'; // Toggle to enable/disable overlay
  const TEST_ENTITY = 'input_select.weather_overlay_test'; // Test selector for different weather states
  const UPDATE_INTERVAL = 5000; // Check weather every 5 seconds
  
  // Dashboard filtering - specify which dashboards should show the overlay
  // Options:
  //   [] (empty array) = Show on ALL dashboards (default)
  //   ['lovelace', 'dashboard-name'] = Show only on these specific dashboards
  // Dashboard names can be found in the URL: /lovelace/dashboard-name
  const ENABLED_DASHBOARDS = ['home']; // Only show on /dashboard-test/home
  // Examples:
  //   ['lovelace'] = Only default dashboard
  //   ['lovelace', 'mobile'] = Only on default and mobile dashboards
  //   ['home', 'weather'] = Only on custom 'home' and 'weather' dashboards
  
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animationId = null;
  let currentWeather = null;
  let lastUpdateTime = 0;
  let lightningTimer = 0;
  let lightningInterval = 1500 + Math.random() * 2500;
  let showLightning = false;
  let lightningDuration = 0;
  let lightningBrightness = 0;
  let lightningFadeSpeed = 0;
  
  // Weather particle configurations
  const weatherConfigs = {
    'rainy': {
      maxParticles: 50,  // Reduced from 100 (was 150)
      color: 'rgba(174, 194, 224, 0.35)',  // Reduced from 0.5 (was 0.7)
      speedMin: 15,
      speedMax: 25,
      sizeMin: 1,
      sizeMax: 2,
      swayAmount: 0.5,
      type: 'rain'
    },
    'pouring': {
      maxParticles: 50,  // Same as rain
      color: 'rgba(174, 194, 224, 0.35)',  // Same as rain
      speedMin: 10.5,  // 30% slower than rain (15 * 0.7 = 10.5)
      speedMax: 17.5,  // 30% slower than rain (25 * 0.7 = 17.5)
      sizeMin: 1,  // Same width as rain
      sizeMax: 2,  // Same width as rain
      swayAmount: 0.5,
      type: 'rain',
      lengthMultiplier: 4  // 4x longer drops
    },
    'cloudy': {
      maxParticles: 10,
      color: 'rgba(180, 180, 180, 0.10)',  // Double from 0.05
      speedMin: 0.3,
      speedMax: 0.8,
      sizeMin: 80,
      sizeMax: 150,
      swayAmount: 0.5,
      type: 'clouds'
    },
    'partlycloudy': {
      maxParticles: 6,
      color: 'rgba(200, 200, 200, 0.08)',  // Double from 0.04
      speedMin: 0.4,
      speedMax: 1,
      sizeMin: 70,
      sizeMax: 130,
      swayAmount: 0.6,
      type: 'clouds'
    },
    'fog': {
      maxParticles: 16,
      color: 'rgba(220, 220, 220, 0.10)',  // Double from 0.05
      speedMin: 0.15,
      speedMax: 0.4,
      sizeMin: 100,
      sizeMax: 200,
      swayAmount: 0.2,
      type: 'clouds'
    },
    'snowy': {
      maxParticles: 40,  // Reduced from 70 (was 100)
      color: 'rgba(255, 255, 255, 0.4)',  // Reduced from 0.6 (was 0.8)
      speedMin: 2,
      speedMax: 5,
      sizeMin: 2,
      sizeMax: 5,
      swayAmount: 1.5,
      type: 'snow'
    },
    'snowy-rainy': {
      maxParticles: 50,  // Reduced from 100 (was 150)
      color: 'rgba(200, 210, 230, 0.35)',  // Reduced from 0.5 (was 0.7)
      speedMin: 8,
      speedMax: 15,
      sizeMin: 1.5,
      sizeMax: 4,
      swayAmount: 1,
      type: 'mixed'
    },
    'lightning': {
      maxParticles: 0,
      type: 'lightning'
    },
    'lightning-rainy': {
      maxParticles: 50,  // Match rainy
      color: 'rgba(174, 194, 224, 0.35)',  // Match rainy
      speedMin: 15,
      speedMax: 25,
      sizeMin: 1,
      sizeMax: 2,
      swayAmount: 0.5,
      type: 'rain',
      hasLightning: true
    },
    'clear-night': {
      maxParticles: 36,  // 200% more stars
      type: 'stars'
    },
    'sunny': {
      maxParticles: 0,
      type: 'sunny'
    }
  };
  
  // Particle class
  class Particle {
    constructor(config) {
      this.reset(config);
      // Stars start at random positions, others start above screen
      if (config.type === 'stars') {
        this.y = Math.random() * (window.innerHeight * 0.5); // Upper half only
        this.twinkleSpeed = 0.02 + Math.random() * 0.03;
        this.twinklePhase = Math.random() * Math.PI * 2;
      } else {
        this.y = Math.random() * window.innerHeight;
      }
    }
    
    reset(config) {
      this.x = Math.random() * window.innerWidth;
      
      if (config.type === 'stars') {
        // Each particle represents one star pattern (position)
        // Stars will fade in, shine, fade out, then reappear elsewhere
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * (window.innerHeight * 0.3);  // Upper 30% only
        this.size = 1 + Math.random() * 1.5;  // Smaller, softer
        
        // Lifecycle: fade in (0-1s), shine bright (1-3s), fade out (3-4s), wait (4-6s), repeat
        this.phase = Math.random() * 6;  // Start at random point in cycle
        this.cycleLength = 6;  // 6 second cycle
        this.opacity = 0;
        
      } else {
        // Clouds start spread across screen and stay in upper 30%
        if (config.type === 'clouds') {
          this.x = Math.random() * window.innerWidth;  // Random position across screen
          this.y = Math.random() * (window.innerHeight * 0.3);  // Upper 30% only
        } else {
          this.y = -10;
        }
        
        this.speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
        this.size = config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin);
        this.sway = (Math.random() - 0.5) * config.swayAmount;
        this.opacity = 0.5 + Math.random() * 0.5;
        
        // Pre-generate cloud puff configuration to prevent flickering
        if (config.type === 'clouds') {
          this.puffCount = 5 + Math.floor(Math.random() * 3);
          this.puffSizes = [];
          for (let i = 0; i < this.puffCount; i++) {
            this.puffSizes.push(0.4 + Math.random() * 0.3);
          }
        }
      }
      
      this.type = config.type;
    }
    
    update(config) {
      if (this.type === 'stars') {
        // Advance through the cycle: fade in → shine → fade out → disappear → repeat
        this.phase += 0.016;  // ~60fps = 0.016 seconds per frame
        
        if (this.phase >= this.cycleLength) {
          // Cycle complete - pick new random position in upper 30%
          this.phase = 0;
          this.x = Math.random() * window.innerWidth;
          this.y = Math.random() * (window.innerHeight * 0.3);
        }
        
        // Calculate opacity based on phase
        if (this.phase < 1) {
          // Fade in (0-1s)
          this.opacity = this.phase;
        } else if (this.phase < 3) {
          // Shine bright (1-3s)
          this.opacity = 0.8 + Math.sin((this.phase - 1) * Math.PI) * 0.2;  // Gentle twinkle
        } else if (this.phase < 4) {
          // Fade out (3-4s)
          this.opacity = 1 - (this.phase - 3);
        } else {
          // Disappeared (4-6s)
          this.opacity = 0;
        }
        
        return;
      }
      
      if (this.type === 'clouds') {
        // Clouds drift horizontally from left to right
        this.x += this.speed;
        
        // Slight vertical drift for natural movement
        this.y += Math.sin(this.x * 0.01) * 0.2;
        
        // When cloud goes off right edge, reset to left
        if (this.x > window.innerWidth + this.size) {
          this.x = -this.size;
          this.y = Math.random() * window.innerHeight;
        }
        return;
      }
      
      // Rain, snow, etc. fall down
      this.y += this.speed;
      this.x += this.sway;
      
      if (this.y > window.innerHeight) {
        this.reset(config);
      }
      
      if (this.x < 0 || this.x > window.innerWidth) {
        this.x = Math.random() * window.innerWidth;
      }
    }
    
    draw() {
      ctx.globalAlpha = this.opacity;
      
      if (this.type === 'stars') {
        // Soft natural stars with diffuse glow
        if (this.opacity > 0) {
          ctx.globalAlpha = this.opacity * 0.7;  // Softer overall
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.shadowColor = 'rgba(200, 220, 255, 0.6)';
          ctx.shadowBlur = 4 + this.opacity * 3;  // More blur for softer look
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size * 0.8, 0, Math.PI * 2);  // Slightly smaller
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        
      } else if (this.type === 'clouds') {
        // Fluffy cotton-like clouds with multiple overlapping circles
        const baseOpacity = this.opacity * 0.6;
        const baseColor = weatherConfigs[currentWeather].color;
        
        // Use pre-generated puff configuration (prevents flickering)
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
          gradient.addColorStop(0.6, baseColor.replace(/[\d.]+\)$/g, '0.02)'));
          gradient.addColorStop(1, 'rgba(180, 180, 180, 0)');
          
          ctx.globalAlpha = baseOpacity;
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(this.x + offsetX, this.y + offsetY, puffSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        
      } else if (this.type === 'snow') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = weatherConfigs[currentWeather].color;
        ctx.fill();
      } else if (this.type === 'mixed') {
        // Mixed snow/rain - alternate between drawing styles
        const isMixed = Math.random() > 0.5;
        if (isMixed) {
          // Snow
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.fillStyle = weatherConfigs[currentWeather].color;
          ctx.fill();
        } else {
          // Rain
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x + this.sway, this.y + this.size * 4);
          ctx.strokeStyle = weatherConfigs[currentWeather].color;
          ctx.lineWidth = this.size * 0.7;
          ctx.stroke();
        }
      } else if (this.type === 'rain') {
        const config = weatherConfigs[currentWeather];
        const lengthMult = config.lengthMultiplier || 1;  // Default 1, pouring uses 3
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.sway, this.y + this.size * 4 * lengthMult);
        ctx.strokeStyle = config.color;
        ctx.lineWidth = this.size;
        ctx.stroke();
      }
      
      ctx.globalAlpha = 1;
    }
  }
  
  // Initialize canvas
  function initCanvas() {
    if (canvas) return;
    
    canvas = document.createElement('canvas');
    canvas.id = 'weather-overlay-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    
    // Set actual canvas size (important for iPad/mobile)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    
    // Scale context to match device pixel ratio (for sharp rendering on retina)
    ctx.scale(dpr, dpr);
    
    console.log('[Weather Overlay] Canvas initialized', {
      width: canvas.width,
      height: canvas.height,
      dpr: dpr,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
  }
  
  // Initialize particles
  function initParticles(weather) {
    particles = [];
    const config = weatherConfigs[weather];
    if (config && config.maxParticles > 0) {
      for (let i = 0; i < config.maxParticles; i++) {
        particles.push(new Particle(config));
      }
    }
  }
  
  // Draw sunny ambient glow effect
  function drawSunnyGlow() {
    // Warm glow - 500px radius
    const sunGradient = ctx.createRadialGradient(
      window.innerWidth * 0.90, window.innerHeight * 0.10, 0,
      window.innerWidth * 0.90, window.innerHeight * 0.10, 500
    );
    sunGradient.addColorStop(0, 'rgba(255, 200, 80, 0.25)');  // Bright center
    sunGradient.addColorStop(0.2, 'rgba(255, 180, 60, 0.15)');
    sunGradient.addColorStop(0.5, 'rgba(255, 160, 40, 0.08)');
    sunGradient.addColorStop(0.8, 'rgba(255, 140, 20, 0.03)');
    sunGradient.addColorStop(1, 'rgba(255, 120, 10, 0)');
    
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(window.innerWidth * 0.90, window.innerHeight * 0.10, 500, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw lightning effect
  function drawLightning() {
    const lightX = Math.random() * canvas.width;
    const lightY = Math.random() * (canvas.height * 0.3);
    
    const gradient = ctx.createRadialGradient(
      lightX, lightY, 0,
      lightX, lightY, canvas.width * 0.8
    );
    
    const colorVariation = Math.random() * 30;
    const blue = 220 + colorVariation;
    const green = 230 + colorVariation;
    
    gradient.addColorStop(0, `rgba(255, ${green}, ${blue}, ${lightningBrightness * 0.4})`);
    gradient.addColorStop(0.3, `rgba(240, ${green - 20}, ${blue - 20}, ${lightningBrightness * 0.25})`);
    gradient.addColorStop(0.7, `rgba(200, ${green - 40}, ${blue - 40}, ${lightningBrightness * 0.1})`);
    gradient.addColorStop(1, 'rgba(180, 190, 210, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = `rgba(255, 255, 255, ${lightningBrightness * 0.15})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  
  // Animation loop
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const config = weatherConfigs[currentWeather];
    if (config) {
      // Draw sunny ambient glow
      if (config.type === 'sunny') {
        drawSunnyGlow();
      }
      
      // Draw particles (if any)
      if (particles.length > 0) {
        particles.forEach(particle => {
          particle.update(config);
          particle.draw();
        });
      }
    }
    
    // Handle lightning effects
    if (config && (config.type === 'lightning' || config.hasLightning)) {
      lightningTimer += 16;
      
      if (showLightning) {
        lightningDuration -= 16;
        
        if (lightningDuration <= 0) {
          showLightning = false;
          lightningTimer = 0;
          lightningInterval = 1500 + Math.random() * 2500;
        } else {
          lightningBrightness = Math.max(0, lightningBrightness - lightningFadeSpeed);
          drawLightning();
        }
      } else if (lightningTimer >= lightningInterval) {
        showLightning = true;
        
        const flashType = Math.random();
        
        if (flashType < 0.3) {
          lightningDuration = 150 + Math.random() * 100;
          lightningBrightness = 0.7 + Math.random() * 0.3;
        } else if (flashType < 0.6) {
          lightningDuration = 600 + Math.random() * 400;
          lightningBrightness = 0.5 + Math.random() * 0.2;
        } else {
          lightningDuration = 300 + Math.random() * 200;
          lightningBrightness = 0.6 + Math.random() * 0.3;
        }
        
        lightningFadeSpeed = lightningBrightness / (lightningDuration / 16);
      }
    }
    
    animationId = requestAnimationFrame(animate);
  }
  
  // Get weather state from Home Assistant
  function getWeatherState() {
    try {
      const homeAssistant = document.querySelector('home-assistant');
      if (!homeAssistant || !homeAssistant.hass) {
        return null;
      }
      
      // Check if test mode is active
      const testEntity = homeAssistant.hass.states[TEST_ENTITY];
      if (testEntity && testEntity.state !== 'Use Real Weather') {
        console.log(`[Weather Overlay] Using test weather: ${testEntity.state}`);
        return testEntity.state;
      }
      
      // Use real weather entity
      const weatherEntity = homeAssistant.hass.states[WEATHER_ENTITY];
      if (!weatherEntity) {
        console.warn(`[Weather Overlay] Entity ${WEATHER_ENTITY} not found`);
        return null;
      }
      
      return weatherEntity.state;
    } catch (error) {
      console.error('[Weather Overlay] Error getting weather state:', error);
      return null;
    }
  }
  
  // Check if overlay is enabled
  function isOverlayEnabled() {
    try {
      const homeAssistant = document.querySelector('home-assistant');
      if (!homeAssistant || !homeAssistant.hass) {
        return true; // Default to enabled if can't check
      }
      
      const toggleEntity = homeAssistant.hass.states[TOGGLE_ENTITY];
      if (!toggleEntity) {
        console.warn(`[Weather Overlay] Toggle entity ${TOGGLE_ENTITY} not found, overlay enabled by default`);
        return true; // Default to enabled if toggle doesn't exist
      }
      
      return toggleEntity.state === 'on';
    } catch (error) {
      console.error('[Weather Overlay] Error checking toggle state:', error);
      return true; // Default to enabled on error
    }
  }
  
  // Check if current dashboard is in the enabled list
  function isOnEnabledDashboard() {
    // If ENABLED_DASHBOARDS is empty, show on all dashboards
    if (ENABLED_DASHBOARDS.length === 0) {
      return true;
    }
    
    // Get current dashboard from URL
    // URL formats: 
    //   /lovelace/dashboard-name
    //   /dashboard-name/view-name
    const path = window.location.pathname;
    const pathParts = path.split('/').filter(p => p);
    
    if (pathParts.length === 0) {
      return false;
    }
    
    // Check for standard lovelace URLs: /lovelace or /lovelace/dashboard
    if (pathParts[0] === 'lovelace') {
      const dashboardName = pathParts.length === 1 ? 'lovelace' : pathParts[1];
      const enabled = ENABLED_DASHBOARDS.includes(dashboardName);
      console.log(`[Weather Overlay] Dashboard: ${dashboardName}, Enabled: ${enabled}`);
      return enabled;
    }
    
    // Check for custom dashboard URLs: /dashboard-test/home
    // The last part is the view name
    const dashboardName = pathParts[pathParts.length - 1];
    const enabled = ENABLED_DASHBOARDS.includes(dashboardName);
    console.log(`[Weather Overlay] Dashboard: ${dashboardName}, Enabled: ${enabled}`);
    return enabled;
  }
  
  // Update weather
  function updateWeather() {
    const now = Date.now();
    if (now - lastUpdateTime < UPDATE_INTERVAL) {
      return;
    }
    
    lastUpdateTime = now;
    
    // Check if overlay is enabled
    const enabled = isOverlayEnabled();
    
    // Check if we're on an enabled dashboard
    const onEnabledDashboard = isOnEnabledDashboard();
    
    if (!enabled || !onEnabledDashboard) {
      // Hide canvas if disabled or wrong dashboard
      if (canvas) {
        canvas.style.display = 'none';
      }
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      return;
    }
    
    // Show canvas if enabled and on correct dashboard
    if (canvas) {
      canvas.style.display = 'block';
    }
    
    const newWeather = getWeatherState();
    
    if (newWeather && newWeather !== currentWeather) {
      console.log(`[Weather Overlay] Weather changed: ${currentWeather} -> ${newWeather}`);
      currentWeather = newWeather;
      
      // Reset lightning timers
      lightningTimer = 0;
      showLightning = false;
      lightningDuration = 0;
      lightningBrightness = 0;
      lightningInterval = 1500 + Math.random() * 2500;
      
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      
      if (weatherConfigs[newWeather]) {
        console.log(`[Weather Overlay] Initializing particles for ${newWeather}, config:`, weatherConfigs[newWeather]);
        initParticles(newWeather);
        console.log(`[Weather Overlay] Created ${particles.length} particles`);
        animate();
      } else {
        particles = [];
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    } else if (newWeather && !animationId && weatherConfigs[newWeather]) {
      // Restart animation if it was stopped (including 0-particle effects like sunny, lightning, stars)
      initParticles(newWeather);
      animate();
    }
  }
  
  // Handle window resize
  function handleResize() {
    if (canvas && ctx) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      console.log('[Weather Overlay] Canvas resized', {
        width: canvas.width,
        height: canvas.height,
        dpr: dpr
      });
    }
  }
  
  // Wait for Home Assistant to load
  function waitForHomeAssistant() {
    const checkHA = setInterval(() => {
      const homeAssistant = document.querySelector('home-assistant');
      if (homeAssistant && homeAssistant.hass) {
        clearInterval(checkHA);
        console.log('[Weather Overlay] Home Assistant ready, initializing...');
        init();
      }
    }, 500);
  }
  
  // Initialize
  function init() {
    initCanvas();
    
    // Check if overlay is enabled
    if (!isOverlayEnabled()) {
      console.log('[Weather Overlay] Overlay is disabled via toggle');
      if (canvas) {
        canvas.style.display = 'none';
      }
      // Still setup periodic checks in case it gets enabled later
      setInterval(updateWeather, 1000);
      window.addEventListener('resize', handleResize);
      return;
    }
    
    // Initial weather check
    const weather = getWeatherState();
    if (weather) {
      currentWeather = weather;
      initParticles(weather);
      animate();
      console.log(`[Weather Overlay] Started with weather: ${weather}`);
    }
    
    // Setup periodic weather checks
    setInterval(updateWeather, 1000);
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    // Listen for URL changes (dashboard navigation)
    let lastPath = window.location.pathname;
    setInterval(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        console.log('[Weather Overlay] Dashboard changed, checking if enabled');
        updateWeather(); // Check immediately on dashboard change
      }
    }, 500);
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHomeAssistant);
  } else {
    waitForHomeAssistant();
  }
  
  console.log('[Weather Overlay] Module loaded');
})();
