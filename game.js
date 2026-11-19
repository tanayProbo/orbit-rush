(() => {
  'use strict';

  // =========================================================================
  // CRAZYGAMES SDK v3 SAFE WRAPPER
  // =========================================================================
  const CG = {
    sdk: null,
    init() {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        this.sdk = window.CrazyGames.SDK;
        try {
          if (this.sdk.game && typeof this.sdk.game.sdkGameLoadingStop === 'function') {
            this.sdk.game.sdkGameLoadingStop();
          }
          if (this.sdk.game && this.sdk.game.settings) {
            AudioEngine.adMuted = !!this.sdk.game.settings.muteAudio;
            if (typeof this.sdk.game.addSettingsChangeListener === 'function') {
              this.sdk.game.addSettingsChangeListener((newSettings) => {
                AudioEngine.adMuted = !!newSettings.muteAudio;
                syncMuteUI();
              });
            }
          }
        } catch (_) {}
      }
    },
    gameplayStart() {
      try {
        if (this.sdk && this.sdk.game) this.sdk.game.gameplayStart();
      } catch (_) {}
    },
    gameplayStop() {
      try {
        if (this.sdk && this.sdk.game) this.sdk.game.gameplayStop();
      } catch (_) {}
    },
    requestAd(type, onStarted, onFinished) {
      if (!this.sdk || !this.sdk.ad) {
        onFinished(true);
        return;
      }
      try {
        this.sdk.ad.requestAd(type, {
          adStarted: () => {
            if (onStarted) onStarted();
          },
          adFinished: () => {
            if (onFinished) onFinished(true);
          },
          adError: () => {
            if (onFinished) onFinished(false);
          }
        });
      } catch (_) {
        if (onFinished) onFinished(false);
      }
    }
  };

  // =========================================================================
  // PROCEDURAL WEBAUDIO ENGINE (SFX + LOOPING SYNTHWAVE)
  // =========================================================================
  const AudioEngine = {
    ctx: null,
    muted: false,
    adMuted: false,
    musicInterval: null,
    step: 0,
    bassNotes: [55, 55, 65.41, 73.42, 55, 55, 82.41, 73.42], // A1, C2, D2, E2

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    },

    isMuted() {
      return this.muted || this.adMuted;
    },

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('orbitRushMuted', this.muted ? '1' : '0');
      return this.muted;
    },

    loadMutePref() {
      this.muted = localStorage.getItem('orbitRushMuted') === '1';
    },

    startMusic() {
      this.init();
      if (this.musicInterval) return;
      this.musicInterval = setInterval(() => {
        if (this.isMuted() || !this.ctx || gameState !== 'PLAYING') return;
        const now = this.ctx.currentTime;
        const freq = this.bassNotes[this.step % this.bassNotes.length];
        this.step++;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, now);
        filter.frequency.exponentialRampToValueAtTime(110, now + 0.16);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.18);
      }, 180);
    },

    playTone(freq, endFreq, duration, type = 'sine', vol = 0.15) {
      if (this.isMuted() || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }

      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    },

    playOrbitLock() {
      this.playTone(220, 440, 0.12, 'triangle', 0.14);
    },

    playFling() {
      this.playTone(480, 180, 0.14, 'sine', 0.14);
    },

    playCollect() {
      this.playTone(587.33, 880, 0.12, 'sine', 0.16);
    },

    playNearMiss() {
      this.playTone(740, 1174, 0.15, 'triangle', 0.15);
    },

    playNova() {
      this.playTone(220, 880, 0.45, 'sawtooth', 0.18);
      setTimeout(() => this.playTone(440, 1320, 0.4, 'sine', 0.14), 80);
    },

    playDeath() {
      this.playTone(180, 40, 0.5, 'sawtooth', 0.22);
    }
  };

  // =========================================================================
  // DOM ELEMENTS
  // =========================================================================
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  const hud = document.getElementById('hud');
  const scoreValueEl = document.getElementById('scoreValue');
  const levelBadgeEl = document.getElementById('levelBadge');
  const comboBadgeEl = document.getElementById('comboBadge');
  const novaBarFillEl = document.getElementById('novaBarFill');
  const muteBtn = document.getElementById('muteBtn');
  const pauseBtn = document.getElementById('pauseBtn');

  const menuOverlay = document.getElementById('menuOverlay');
  const menuBestScoreEl = document.getElementById('menuBestScore');
  const playBtn = document.getElementById('playBtn');
  const menuMuteBtn = document.getElementById('menuMuteBtn');
  const menuKeybindsBtn = document.getElementById('menuKeybindsBtn');

  const keybindsOverlay = document.getElementById('keybindsOverlay');
  const closeKeybindsBtn = document.getElementById('closeKeybindsBtn');

  const pauseOverlay = document.getElementById('pauseOverlay');
  const resumeBtn = document.getElementById('resumeBtn');
  const pauseRestartBtn = document.getElementById('pauseRestartBtn');
  const pauseKeybindsBtn = document.getElementById('pauseKeybindsBtn');

  const gameOverOverlay = document.getElementById('gameOverOverlay');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestScoreEl = document.getElementById('finalBestScore');
  const newBestBadgeEl = document.getElementById('newBestBadge');
  const reviveBtn = document.getElementById('reviveBtn');
  const restartBtn = document.getElementById('restartBtn');

  // =========================================================================
  // GAME STATE & CONSTANTS
  // =========================================================================
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  let gameState = 'MENU'; // MENU | PLAYING | PAUSED | GAMEOVER
  let bestScore = parseInt(localStorage.getItem('orbitRushBest') || '0', 10);
  let score = 0;
  let level = 1;
  let maxDistanceY = 0;
  let multiplier = 1;
  let novaCharge = 0; // 0 to 100
  let novaTimer = 0; // seconds remaining
  let slowMoTimer = 0;
  let shakeTimer = 0;
  let shakeIntensity = 0;
  let revivedThisRun = false;

  let isHolding = false;
  let steerLeft = false;
  let steerRight = false;
  let lastTime = 0;

  // Camera
  const cam = { x: 0, y: 0 };

  // Red Void
  const voidZone = {
    y: 350,
    baseSpeed: 75,
    speed: 75
  };

  // Player Ship
  const ship = {
    x: 0,
    y: 0,
    vx: 0,
    vy: -280,
    angle: -Math.PI / 2,
    radius: 10,
    orbitPlanet: null,
    orbitAngle: 0,
    orbitRadius: 70,
    orbitDir: 1,
    trail: [],
    invulnTimer: 0
  };

  // World Entities
  let planets = [];
  let orbs = [];
  let asteroids = [];
  let particles = [];
  let floatingTexts = [];
  let stars = [];
  let highestPlanetY = 0;

  // =========================================================================
  // RESIZE & DPR
  // =========================================================================
  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // =========================================================================
  // STARFIELD
  // =========================================================================
  function initStars() {
    stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({
        x: (Math.random() - 0.5) * 2000,
        y: (Math.random() - 0.5) * 2000,
        size: Math.random() * 2 + 0.5,
        depth: Math.random() * 0.6 + 0.15,
        alpha: Math.random() * 0.6 + 0.3
      });
    }
  }
  initStars();

  // =========================================================================
  // PROCEDURAL GENERATION
  // =========================================================================
  function spawnPlanet(y, prevX) {
    const difficulty = Math.min(1, Math.abs(y) / 12000);
    const roll = Math.random();
    let type = 'normal';
    if (y < -600) {
      if (roll < 0.14 + difficulty * 0.12) type = 'black-hole';
      else if (roll < 0.38) type = 'moving';
      else if (roll < 0.65) type = 'small-fast';
      else type = 'large-slow';
    }

    let radius = 26;
    let orbitSpeed = 2.4;
    let color = '#00f3ff';

    if (type === 'small-fast') {
      radius = 18;
      orbitSpeed = 3.5 + difficulty * 0.8;
      color = '#ff2a85';
    } else if (type === 'large-slow') {
      radius = 38;
      orbitSpeed = 1.7;
      color = '#38b6ff';
    } else if (type === 'moving') {
      radius = 24;
      orbitSpeed = 2.6;
      color = '#ffd166';
    } else if (type === 'black-hole') {
      radius = 22;
      orbitSpeed = 3.2;
      color = '#b5179e';
    }

    const maxOffset = Math.min(width * 0.32, 160);
    const x = Math.max(-maxOffset, Math.min(maxOffset, prevX + (Math.random() - 0.5) * 220));
    const captureRadius = radius * 2.5 + 35;

    const planet = {
      x,
      baseX: x,
      y,
      radius,
      captureRadius,
      orbitSpeed,
      color,
      type,
      movePhase: Math.random() * Math.PI * 2,
      moveAmp: type === 'moving' ? 55 + Math.random() * 35 : 0,
      nearMissAwarded: false
    };
    planets.push(planet);

    // Spawn energy orb near or between planets
    if (Math.random() < 0.75) {
      orbs.push({
        x: x + (Math.random() - 0.5) * 110,
        y: y + 70 + Math.random() * 60,
        radius: 9,
        collected: false,
        pulse: Math.random() * Math.PI * 2
      });
    }

    // Spawn asteroid hazard
    if (y < -500 && Math.random() < 0.35 + difficulty * 0.35) {
      const side = Math.random() < 0.5 ? -1 : 1;
      asteroids.push({
        x: x + side * (captureRadius + 35 + Math.random() * 40),
        y: y + 90 + (Math.random() - 0.5) * 50,
        radius: 14 + Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        nearMissAwarded: false
      });
    }

    return planet;
  }

  function ensureWorldAhead() {
    while (highestPlanetY > cam.y - height * 1.4) {
      const prev = planets[planets.length - 1];
      const spacing = 195 + Math.random() * 75;
      highestPlanetY -= spacing;
      spawnPlanet(highestPlanetY, prev ? prev.baseX : 0);
    }

    // Cleanup entities far below void
    const cutoff = voidZone.y + 400;
    planets = planets.filter(p => p.y < cutoff);
    orbs = orbs.filter(o => !o.collected && o.y < cutoff);
    asteroids = asteroids.filter(a => a.y < cutoff);
  }

  // =========================================================================
  // PARTICLES & FLOATING TEXT
  // =========================================================================
  function spawnParticles(x, y, color, count = 12, speed = 160) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * speed + 30;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.4 + Math.random() * 0.35,
        maxLife: 0.75,
        size: Math.random() * 3.5 + 1.5,
        color
      });
    }
  }

  function addFloatingText(x, y, text, color = '#ffd166') {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 0.9,
      maxLife: 0.9
    });
  }

  function triggerShake(intensity = 8, duration = 0.2) {
    shakeIntensity = Math.max(shakeIntensity, intensity);
    shakeTimer = Math.max(shakeTimer, duration);
  }

  // =========================================================================
  // GAME LIFECYCLE
  // =========================================================================
  function resetGame() {
    score = 0;
    level = 1;
    maxDistanceY = 0;
    multiplier = 1;
    novaCharge = 0;
    novaTimer = 0;
    slowMoTimer = 0;
    shakeTimer = 0;
    revivedThisRun = false;
    isHolding = false;

    planets = [];
    orbs = [];
    asteroids = [];
    particles = [];
    floatingTexts = [];

    ship.x = 0;
    ship.y = 0;
    ship.vx = 0;
    ship.vy = -300;
    ship.angle = -Math.PI / 2;
    ship.orbitPlanet = null;
    ship.trail = [];
    ship.invulnTimer = 1.0;

    cam.x = 0;
    cam.y = -height * 0.25;

    voidZone.y = 320;
    voidZone.speed = voidZone.baseSpeed;

    // Initial planets
    const first = spawnPlanet(-160, 0);
    first.x = 0;
    first.baseX = 0;
    highestPlanetY = -160;
    ensureWorldAhead();

    updateHUD();
  }

  function startGame() {
    AudioEngine.init();
    AudioEngine.startMusic();
    resetGame();
    gameState = 'PLAYING';
    menuOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    CG.gameplayStart();
  }

  function pauseGame() {
    if (gameState !== 'PLAYING') return;
    gameState = 'PAUSED';
    isHolding = false;
    pauseOverlay.classList.remove('hidden');
    CG.gameplayStop();
  }

  function resumeGame() {
    if (gameState !== 'PAUSED') return;
    gameState = 'PLAYING';
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    CG.gameplayStart();
  }

  function triggerGameOver() {
    if (gameState === 'GAMEOVER') return;
    gameState = 'GAMEOVER';
    isHolding = false;
    AudioEngine.playDeath();
    spawnParticles(ship.x, ship.y, '#ff2e4c', 30, 260);
    triggerShake(14, 0.35);
    CG.gameplayStop();

    const isNewBest = score > bestScore;
    if (isNewBest) {
      bestScore = score;
      localStorage.setItem('orbitRushBest', String(bestScore));
    }

    finalScoreEl.textContent = score;
    finalBestScoreEl.textContent = bestScore;
    menuBestScoreEl.textContent = bestScore;
    newBestBadgeEl.classList.toggle('hidden', !isNewBest);
    reviveBtn.classList.toggle('hidden', revivedThisRun);

    hud.classList.add('hidden');
    gameOverOverlay.classList.remove('hidden');

    // CrazyGames midgame ad
    CG.requestAd(
      'midgame',
      () => { AudioEngine.adMuted = true; },
      () => { AudioEngine.adMuted = false; }
    );
  }

  function revivePlayer() {
    if (revivedThisRun) return;
    CG.requestAd(
      'rewarded',
      () => { AudioEngine.adMuted = true; },
      (success) => {
        AudioEngine.adMuted = false;
        if (!success) return;
        revivedThisRun = true;
        gameState = 'PLAYING';
        gameOverOverlay.classList.add('hidden');
        hud.classList.remove('hidden');

        // Place ship safely ahead of void
        ship.y = Math.min(ship.y, voidZone.y - 260);
        ship.x = 0;
        ship.vx = 0;
        ship.vy = -320;
        ship.orbitPlanet = null;
        ship.invulnTimer = 2.5;
        voidZone.y = ship.y + 320;
        CG.gameplayStart();
      }
    );
  }

  // =========================================================================
  // INPUT HANDLING (ONE-BUTTON: MOUSE / TOUCH / SPACE)
  // =========================================================================
  function onHoldStart() {
    if (gameState !== 'PLAYING') return;
    AudioEngine.init();
    if (!isHolding) {
      isHolding = true;
      tryLockOrbit();
    }
  }

  function onHoldEnd() {
    if (gameState !== 'PLAYING') return;
    if (isHolding) {
      isHolding = false;
      releaseOrbit();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onHoldStart();
  });
  window.addEventListener('pointerup', onHoldEnd);
  window.addEventListener('pointercancel', onHoldEnd);

  function toggleKeybinds() {
    keybindsOverlay.classList.toggle('hidden');
  }

  function isKeybindsOpen() {
    return !keybindsOverlay.classList.contains('hidden');
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' || e.key === '?') {
      e.preventDefault();
      if (gameState === 'MENU' || gameState === 'PAUSED') {
        toggleKeybinds();
      }
      return;
    }

    if (isKeybindsOpen()) {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        keybindsOverlay.classList.add('hidden');
      }
      return;
    }

    if (e.code === 'KeyM') {
      e.preventDefault();
      AudioEngine.toggleMute();
      syncMuteUI();
      return;
    }

    if (gameState === 'MENU') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startGame();
      }
      return;
    }

    if (gameState === 'GAMEOVER') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        startGame();
      } else if (e.code === 'KeyV' && !revivedThisRun) {
        e.preventDefault();
        revivePlayer();
      }
      return;
    }

    if (gameState === 'PAUSED') {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        resumeGame();
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        startGame();
      }
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) onHoldStart();
    } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
      e.preventDefault();
      steerLeft = true;
    } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
      e.preventDefault();
      steerRight = true;
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      pauseGame();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      onHoldEnd();
    } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
      steerLeft = false;
    } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
      steerRight = false;
    }
  });

  window.addEventListener('blur', () => {
    if (gameState === 'PLAYING') pauseGame();
  });

  // =========================================================================
  // ORBIT & FLING MECHANICS
  // =========================================================================
  function tryLockOrbit() {
    if (ship.orbitPlanet) return;
    let nearest = null;
    let bestDist = Infinity;

    for (const p of planets) {
      const dx = ship.x - p.x;
      const dy = ship.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= p.captureRadius && dist < bestDist) {
        bestDist = dist;
        nearest = p;
      }
    }

    if (nearest) {
      ship.orbitPlanet = nearest;
      ship.orbitRadius = Math.max(nearest.radius + 18, Math.min(bestDist, nearest.captureRadius));
      ship.orbitAngle = Math.atan2(ship.y - nearest.y, ship.x - nearest.x);

      // Determine orbit direction from cross product of radius vector & velocity
      const rx = ship.x - nearest.x;
      const ry = ship.y - nearest.y;
      const cross = rx * ship.vy - ry * ship.vx;
      ship.orbitDir = cross >= 0 ? 1 : -1;

      AudioEngine.playOrbitLock();
      spawnParticles(ship.x, ship.y, nearest.color, 8, 100);
    }
  }

  function releaseOrbit() {
    if (!ship.orbitPlanet) return;
    const p = ship.orbitPlanet;
    const tangentAngle = ship.orbitAngle + (Math.PI / 2) * ship.orbitDir;
    const speed = Math.max(330, Math.min(540, p.orbitSpeed * ship.orbitRadius * 1.45));

    ship.vx = Math.cos(tangentAngle) * speed;
    ship.vy = Math.sin(tangentAngle) * speed;
    ship.angle = tangentAngle;
    ship.orbitPlanet = null;

    // Check if aimed upward (good release)
    if (ship.vy < -220) {
      multiplier = Math.min(10, multiplier + 1);
      addFloatingText(ship.x, ship.y - 20, `PERFECT! x${multiplier}`, '#00f3ff');
      triggerShake(4, 0.1);
    }

    AudioEngine.playFling();
    spawnParticles(ship.x, ship.y, '#00f3ff', 10, 140);
  }

  // =========================================================================
  // UPDATE LOOP
  // =========================================================================
  function update(rawDt) {
    if (gameState !== 'PLAYING') return;

    const dt = slowMoTimer > 0 ? rawDt * 0.45 : rawDt;
    if (slowMoTimer > 0) slowMoTimer -= rawDt;
    if (shakeTimer > 0) shakeTimer -= rawDt;
    if (ship.invulnTimer > 0) ship.invulnTimer -= rawDt;

    // Nova mode
    if (novaTimer > 0) {
      novaTimer -= rawDt;
      ship.vy = Math.min(ship.vy, -620);
      if (novaTimer <= 0) {
        novaCharge = 0;
      }
    }

    // Update moving planets
    for (const p of planets) {
      if (p.type === 'moving') {
        p.movePhase += dt * 1.8;
        p.x = p.baseX + Math.sin(p.movePhase) * p.moveAmp;
      }
    }

    // Auto-lock if holding and entering a planet's capture radius
    if (isHolding && !ship.orbitPlanet) {
      tryLockOrbit();
    }

    // Ship movement
    if (ship.orbitPlanet) {
      if (steerLeft) ship.orbitDir = -1;
      else if (steerRight) ship.orbitDir = 1;

      const p = ship.orbitPlanet;
      ship.orbitAngle += p.orbitSpeed * ship.orbitDir * dt;
      ship.x = p.x + Math.cos(ship.orbitAngle) * ship.orbitRadius;
      ship.y = p.y + Math.sin(ship.orbitAngle) * ship.orbitRadius;
      ship.angle = ship.orbitAngle + (Math.PI / 2) * ship.orbitDir;
    } else {
      // A/D steering in free flight
      const steerDir = (steerRight ? 1 : 0) - (steerLeft ? 1 : 0);
      if (steerDir !== 0) {
        const speed = Math.hypot(ship.vx, ship.vy) || 300;
        const turnRate = 3.2 * dt;
        const newAngle = Math.atan2(ship.vy, ship.vx) + steerDir * turnRate;
        ship.vx = Math.cos(newAngle) * speed;
        ship.vy = Math.sin(newAngle) * speed;
      }
      // Black hole pull
      for (const p of planets) {
        if (p.type === 'black-hole') {
          const dx = p.x - ship.x;
          const dy = p.y - ship.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220 && dist > 10) {
            const pull = (1 - dist / 220) * 420;
            ship.vx += (dx / dist) * pull * dt;
            ship.vy += (dy / dist) * pull * dt;
          }
        }
      }

      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.angle = Math.atan2(ship.vy, ship.vx);

      // Soft horizontal screen bounce
      const halfW = width * 0.48;
      if (ship.x < -halfW) {
        ship.x = -halfW;
        ship.vx = Math.abs(ship.vx) * 0.8;
      } else if (ship.x > halfW) {
        ship.x = halfW;
        ship.vx = -Math.abs(ship.vx) * 0.8;
      }
    }

    // Ship trail
    ship.trail.push({ x: ship.x, y: ship.y, life: 0.35 });
    for (let i = ship.trail.length - 1; i >= 0; i--) {
      ship.trail[i].life -= dt;
      if (ship.trail[i].life <= 0) ship.trail.splice(i, 1);
    }

    // Score & Level by distance
    if (ship.y < maxDistanceY) {
      const gained = (maxDistanceY - ship.y) * 0.1 * multiplier;
      score += Math.floor(gained);
      maxDistanceY = ship.y;

      const newLevel = Math.floor(Math.abs(maxDistanceY) / 2500) + 1;
      if (newLevel > level) {
        level = newLevel;
        const levelNames = ['LOW ORBIT', 'ASTEROID BELT', 'GRAVITY WELL', 'EVENT HORIZON', 'DEEP VOID'];
        const label = levelNames[Math.min(level - 1, levelNames.length - 1)];
        addFloatingText(ship.x, ship.y - 45, `LEVEL ${level}: ${label}`, '#00f3ff');
        AudioEngine.playNearMiss();
        triggerShake(5, 0.15);
      }
    }

    // Camera smoothing
    const targetCamY = ship.y - height * 0.18;
    cam.y += (targetCamY - cam.y) * Math.min(1, dt * 6);
    cam.x += (ship.x * 0.25 - cam.x) * Math.min(1, dt * 4);

    // Void creeps up and accelerates with distance
    const distFactor = Math.min(220, Math.abs(maxDistanceY) * 0.015);
    voidZone.speed = voidZone.baseSpeed + distFactor;
    voidZone.y -= voidZone.speed * dt;
    // Keep void from falling too far behind
    if (voidZone.y > cam.y + height * 0.75) {
      voidZone.y = cam.y + height * 0.75;
    }

    // Collisions: Orbs
    for (const o of orbs) {
      if (o.collected) continue;
      o.pulse += dt * 4;
      const dist = Math.hypot(ship.x - o.x, ship.y - o.y);
      if (dist < ship.radius + o.radius + 8) {
        o.collected = true;
        AudioEngine.playCollect();
        spawnParticles(o.x, o.y, '#ffd166', 10, 130);
        score += 25 * multiplier;
        if (novaTimer <= 0) {
          novaCharge = Math.min(100, novaCharge + 25);
          if (novaCharge >= 100) {
            novaTimer = 4.0;
            AudioEngine.playNova();
            triggerShake(10, 0.3);
            addFloatingText(ship.x, ship.y - 30, 'NOVA OVERDRIVE!', '#ffd166');
          }
        }
      }
    }

    // Collisions: Planets (core crash vs near miss)
    for (const p of planets) {
      const dist = Math.hypot(ship.x - p.x, ship.y - p.y);
      if (dist < p.radius + ship.radius - 2) {
        if (novaTimer > 0 || ship.invulnTimer > 0) {
          // Bounce off safely
          const ang = Math.atan2(ship.y - p.y, ship.x - p.x);
          ship.vx = Math.cos(ang) * 350;
          ship.vy = Math.sin(ang) * 350;
          ship.orbitPlanet = null;
        } else {
          triggerGameOver();
          return;
        }
      } else if (!p.nearMissAwarded && !ship.orbitPlanet && dist < p.radius + ship.radius + 18) {
        p.nearMissAwarded = true;
        multiplier = Math.min(10, multiplier + 1);
        slowMoTimer = 0.18;
        AudioEngine.playNearMiss();
        addFloatingText(ship.x, ship.y - 25, `NEAR MISS! x${multiplier}`, '#ff2a85');
      }
    }

    // Collisions: Asteroids
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.rot += a.rotSpeed * dt;
      const dist = Math.hypot(ship.x - a.x, ship.y - a.y);
      if (dist < a.radius + ship.radius - 2) {
        if (novaTimer > 0 || ship.invulnTimer > 0) {
          spawnParticles(a.x, a.y, '#ffd166', 14, 180);
          asteroids.splice(i, 1);
          score += 50 * multiplier;
          triggerShake(6, 0.15);
        } else {
          triggerGameOver();
          return;
        }
      } else if (!a.nearMissAwarded && dist < a.radius + ship.radius + 20) {
        a.nearMissAwarded = true;
        multiplier = Math.min(10, multiplier + 1);
        slowMoTimer = 0.15;
        AudioEngine.playNearMiss();
        addFloatingText(ship.x, ship.y - 25, `CLOSE CALL! x${multiplier}`, '#ff2a85');
      }
    }

    // Void & Offscreen Death
    if (novaTimer <= 0 && ship.invulnTimer <= 0) {
      if (ship.y + ship.radius > voidZone.y) {
        triggerGameOver();
        return;
      }
    }

    // Particles & Floating Text
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y -= 40 * dt;
      ft.life -= dt;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    ensureWorldAhead();
    updateHUD();
  }

  function updateHUD() {
    scoreValueEl.textContent = score;
    levelBadgeEl.textContent = `LVL ${level}`;
    if (multiplier > 1) {
      comboBadgeEl.textContent = `x${multiplier}`;
      comboBadgeEl.classList.remove('hidden');
    } else {
      comboBadgeEl.classList.add('hidden');
    }
    const pct = novaTimer > 0 ? (novaTimer / 4.0) * 100 : novaCharge;
    novaBarFillEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  // =========================================================================
  // RENDER LOOP
  // =========================================================================
  function render() {
    ctx.fillStyle = '#050711';
    ctx.fillRect(0, 0, width, height);

    // Parallax Starfield
    ctx.save();
    for (const s of stars) {
      const sx = ((s.x - cam.x * s.depth) % width + width) % width;
      const sy = ((s.y - cam.y * s.depth) % height + height) % height;
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // World Space Transform
    ctx.save();
    let shakeX = 0;
    let shakeY = 0;
    if (shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
    }
    ctx.translate(width / 2 - cam.x + shakeX, height / 2 - cam.y + shakeY);

    // Additive Blending for Neon Glow
    ctx.globalCompositeOperation = 'lighter';

    // Planets
    for (const p of planets) {
      // Gravity / Capture Ring
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.captureRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Planet Core Glow
      ctx.globalAlpha = 0.85;
      const grad = ctx.createRadialGradient(p.x, p.y, p.radius * 0.2, p.x, p.y, p.radius * 1.4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, p.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      if (p.type === 'black-hole') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#050711';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
    }

    // Orbit Tether Beam
    if (ship.orbitPlanet) {
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = ship.orbitPlanet.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      ctx.lineTo(ship.orbitPlanet.x, ship.orbitPlanet.y);
      ctx.stroke();
    }

    // Energy Orbs
    for (const o of orbs) {
      if (o.collected) continue;
      const r = o.radius + Math.sin(o.pulse) * 2;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Asteroids
    ctx.globalCompositeOperation = 'source-over';
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      ctx.strokeStyle = '#ff6b6b';
      ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const rad = a.radius * (i % 2 === 0 ? 1 : 0.75);
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Ship Trail
    ctx.globalCompositeOperation = 'lighter';
    for (const t of ship.trail) {
      ctx.globalAlpha = Math.max(0, t.life * 2);
      ctx.fillStyle = novaTimer > 0 ? '#ffd166' : '#00f3ff';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 4 * (t.life / 0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    // Player Ship
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.globalAlpha = ship.invulnTimer > 0 && Math.floor(ship.invulnTimer * 12) % 2 === 0 ? 0.4 : 1;
    ctx.fillStyle = novaTimer > 0 ? '#ffd166' : '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Particles
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Floating Texts
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = 'bold 14px OrbitronLocal, sans-serif';
    ctx.textAlign = 'center';
    for (const ft of floatingTexts) {
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }

    // Red Void
    ctx.globalAlpha = 1;
    const voidGrad = ctx.createLinearGradient(0, voidZone.y - 60, 0, voidZone.y + 400);
    voidGrad.addColorStop(0, 'rgba(255, 46, 76, 0)');
    voidGrad.addColorStop(0.18, 'rgba(255, 46, 76, 0.85)');
    voidGrad.addColorStop(1, '#4a0010');
    ctx.fillStyle = voidGrad;
    ctx.fillRect(cam.x - width, voidZone.y - 60, width * 2, height * 2);

    ctx.restore();
  }

  function loop(now) {
    const rawDt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    update(rawDt);
    render();
    requestAnimationFrame(loop);
  }

  // =========================================================================
  // UI BUTTONS & INIT
  // =========================================================================
  function syncMuteUI() {
    muteBtn.textContent = AudioEngine.muted ? '🔇' : '🔊';
    menuMuteBtn.textContent = AudioEngine.muted ? '[M] SOUND: OFF' : '[M] SOUND: ON';
  }

  muteBtn.addEventListener('click', () => {
    AudioEngine.toggleMute();
    syncMuteUI();
  });

  menuMuteBtn.addEventListener('click', () => {
    AudioEngine.toggleMute();
    syncMuteUI();
  });

  playBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', pauseGame);
  resumeBtn.addEventListener('click', resumeGame);
  pauseRestartBtn.addEventListener('click', startGame);
  reviveBtn.addEventListener('click', revivePlayer);
  menuKeybindsBtn.addEventListener('click', toggleKeybinds);
  pauseKeybindsBtn.addEventListener('click', toggleKeybinds);
  closeKeybindsBtn.addEventListener('click', () => keybindsOverlay.classList.add('hidden'));

  CG.init();
  AudioEngine.loadMutePref();
  syncMuteUI();
  menuBestScoreEl.textContent = bestScore;
  resetGame();
  lastTime = performance.now();
  requestAnimationFrame(loop);
})();

