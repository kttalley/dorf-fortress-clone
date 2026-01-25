/**
 * Weather Particle System
 * Dynamic particle fields with organic undulating motion
 * 
 * Each weather type (rain, fog, miasma, etc.) is composed of particles that:
 * - Move through space with velocity
 * - Respond to flow fields (Perlin noise-based forces)
 * - Interact with environment (wind, gravity, terrain)
 * - Group into visible cloud formations
 * - Disperse and reform organically
 * 
 * Rendering converts particle density into visible tiles
 */

// ============================================================
// PARTICLE SYSTEM FOR WEATHER
// ============================================================

/**
 * Particle represents a single weather element
 */
class Particle {
  constructor(x, y, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;      // Velocity X
    this.vy = vy;      // Velocity Y
    this.ax = 0;       // Acceleration X
    this.ay = 0;       // Acceleration Y
    this.life = 1.0;   // 0-1, fades with age
    this.age = 0;
    this.maxAge = 60 + Math.random() * 60;
  }

  update() {
    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Apply gravity/drift damping
    this.vx *= 0.95;
    this.vy *= 0.95;

    // Age and fade
    this.age++;
    this.life = Math.max(0, 1 - (this.age / this.maxAge));
  }

  isAlive() {
    return this.life > 0.01;
  }
}

/**
 * ParticleField manages particles for a single weather type
 */
export class ParticleField {
  constructor(type, width, height, seed) {
    this.type = type;           // Weather type object
    this.width = width;
    this.height = height;
    this.particles = [];
    this.seed = seed;

    // Density field (for rendering)
    this.densityField = new Float32Array(width * height);

    // Flow field (Perlin noise-based forces)
    this.flowFieldScale = type.flowScale || 0.03;
    this.flowFieldStrength = type.flowStrength || 0.5;
    this.flowFieldPhase = 0; // Animates over time

    // Gravity and wind influence
    this.gravity = type.gravity || 0.02;
    this.windInfluence = type.windInfluence || 0.3;

    // Particle pool (for efficiency)
    this.maxParticles = type.maxParticles || 150;
  }

  /**
   * Spawn particles from a source
   */
  addParticles(x, y, count, velocitySpread = 0.5) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * velocitySpread;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      this.particles.push(new Particle(x + Math.random() - 0.5, y + Math.random() - 0.5, vx, vy));
    }
  }

  /**
   * Update particle positions with physics
   * @param {number} tick - Current simulation tick
   * @param {number} windAngle - Global wind direction
   * @param {number} windStrength - Global wind magnitude
   */
  update(tick, windAngle, windStrength) {
    // Update flow field phase for undulation
    this.flowFieldPhase = (tick * 0.02) % (Math.PI * 2);

    // Clear density field
    this.densityField.fill(0);

    // Update each particle
    const aliveParticles = [];
    for (const particle of this.particles) {
      // Apply wind force
      const windForceX = Math.cos(windAngle) * windStrength * this.windInfluence;
      const windForceY = Math.sin(windAngle) * windStrength * this.windInfluence;
      particle.ax += windForceX;
      particle.ay += windForceY + this.gravity;

      // Apply flow field force (Perlin noise-based)
      const flowForce = this.getFlowForce(particle.x, particle.y, tick);
      particle.ax += flowForce.x;
      particle.ay += flowForce.y;

      // Update velocity and position
      particle.vx += particle.ax;
      particle.vy += particle.ay;
      particle.update();

      // Reset acceleration
      particle.ax = 0;
      particle.ay = 0;

      // Wrap around map edges
      if (particle.x < 0) particle.x += this.width;
      if (particle.x >= this.width) particle.x -= this.width;
      if (particle.y < 0) particle.y += this.height;
      if (particle.y >= this.height) particle.y -= this.height;

      // Add to density field (increased contribution for denser clouds)
      const gridX = Math.floor(particle.x);
      const gridY = Math.floor(particle.y);
      if (gridX >= 0 && gridX < this.width && gridY >= 0 && gridY < this.height) {
        const idx = gridY * this.width + gridX;
        this.densityField[idx] += particle.life * 0.2;  // Doubled for denser clusters
      }

      // Keep alive particles
      if (particle.isAlive()) {
        aliveParticles.push(particle);
      }
    }

    this.particles = aliveParticles;

    // Clamp density field to 0-1
    for (let i = 0; i < this.densityField.length; i++) {
      this.densityField[i] = Math.min(1, this.densityField[i]);
    }

    // Apply diffusion multiple times for smooth, fluffy clouds
    this.diffuseDensity();
    this.diffuseDensity();  // Second pass for extra smoothing
  }

  /**
   * Get flow field force at position using Perlin-like noise
   */
  getFlowForce(x, y, tick) {
    // Simplified perlin-like flow using sin/cos waves
    const scale = this.flowFieldScale;
    const phase = this.flowFieldPhase;

    // Check if this weather type has a dedicated drift pattern
    if (this.type.driftPattern === 'vertical') {
      // RAIN: Strong downward flow with slight side-to-side drift
      const verticalDrift = Math.sin(x * scale * 0.5 + phase * 2) * 0.3;
      return {
        x: verticalDrift * this.flowFieldStrength,
        y: this.flowFieldStrength * 0.9,  // Strong downward component
      };
    } else if (this.type.driftPattern === 'swirl') {
      // SNOW: Swirling downward with organic spiraling motion
      const swirl = Math.sin(x * scale + phase) * Math.cos(y * scale + phase * 0.7);
      const downwardSwirl = Math.cos(x * scale * 0.5 - phase * 0.5) * 0.5;
      return {
        x: swirl * this.flowFieldStrength * 0.7,
        y: (downwardSwirl + 0.5) * this.flowFieldStrength * 0.8,
      };
    }

    // Standard organic undulation for other weather types
    // For clouds specifically: very gentle, large-scale drifting
    if (this.type.id === 'clouds') {
      // Large, slow, calm waves - minimal complexity
      const drift = Math.sin(x * scale * 0.5 + phase * 0.5) * 0.4;
      const vertical = Math.sin(y * scale * 0.3 + phase * 0.3) * 0.2;
      return {
        x: drift * this.flowFieldStrength,
        y: vertical * this.flowFieldStrength,
      };
    }

    // Other weather types: standard organic undulation
    const noiseX = Math.sin(x * scale + phase) * Math.cos(y * scale * 0.7 + phase * 0.5);
    const noiseY = Math.cos(x * scale * 0.7 + phase * 0.3) * Math.sin(y * scale + phase * 0.8);

    return {
      x: noiseX * this.flowFieldStrength,
      y: noiseY * this.flowFieldStrength,
    };
  }

  /**
   * Smooth diffusion on density field
   */
  diffuseDensity() {
    const temp = new Float32Array(this.densityField);
    const width = this.width;
    const height = this.height;
    const diffusionRate = 0.15;  // Increased for smoother, fluffier clouds

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const neighbors = [
          this.densityField[(y - 1) * width + x],
          this.densityField[(y + 1) * width + x],
          this.densityField[y * width + (x - 1)],
          this.densityField[y * width + (x + 1)],
        ];

        const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / 4;
        temp[idx] = this.densityField[idx] * (1 - diffusionRate) + avgNeighbor * diffusionRate;
      }
    }

    // Copy back
    for (let i = 0; i < this.densityField.length; i++) {
      this.densityField[i] = temp[i];
    }

    // Decay density over time (reduced to maintain cohesive groupings longer)
    for (let i = 0; i < this.densityField.length; i++) {
      this.densityField[i] *= (1 - this.type.decay * 0.25);  // Slower decay for persistent clouds
    }
  }

  /**
   * Get density at a grid position
   */
  getDensityAt(x, y) {
    const gridX = Math.floor(x);
    const gridY = Math.floor(y);
    if (gridX < 0 || gridX >= this.width || gridY < 0 || gridY >= this.height) return 0;
    return this.densityField[gridY * this.width + gridX];
  }

  /**
   * Get particle count (for debugging)
   */
  getParticleCount() {
    return this.particles.length;
  }
}

// ============================================================
// PARTICLE WEATHER TYPE CONFIGS
// ============================================================

export const PARTICLE_WEATHER_TYPES = {
  RAIN: {
    id: 'rain',
    realm: 'surface',
    char: '|',
    chars: ['|', '/', '\\', '|'],
    color: '#44DDFF',           // Bright cyan
    bgColor: '#444444',         // SOLID GREY - entire tile
    decay: 0.02,                // Much lower - rain stays organized
    gravity: 0.12,              // Falls down strongly
    windInfluence: 0.3,         // Some wind drift
    flowScale: 0.08,            // Vertical drift pattern
    flowStrength: 0.8,          // Strong downward flow
    maxParticles: 400,          // Denser rain
    driftPattern: 'vertical',   // Organic downward drift
  },
  SNOW: {
    id: 'snow',
    realm: 'surface',
    char: '*',
    chars: ['*', '+', '*', '.'],
    color: '#FFFFFF',           // Bright white
    bgColor: '#444444',         // SOLID GREY - entire tile
    decay: 0.01,                // Very low - snow stays fluffy
    gravity: 0.04,              // Drifts slowly down
    windInfluence: 0.7,         // Very affected by wind
    flowScale: 0.06,            // Swirling drift pattern
    flowStrength: 0.6,          // Organic sideways/downward motion
    maxParticles: 350,          // Fuller snow drifts
    driftPattern: 'swirl',      // Organic swirling drift
  },
  FOG: {
    id: 'fog',
    realm: 'surface',
    char: '~',
    chars: ['~', '≈', '~', '-'],
    color: '#CCDDFF',           // Bright light blue
    bgColor: '#444444',         // SOLID GREY - entire tile
    decay: 0.015,               // Low - fog stays cohesive
    gravity: 0.002,             // Barely falls
    windInfluence: 0.4,         // Moderate wind response
    flowScale: 0.02,            // Large organic waves
    flowStrength: 0.35,         // Strong undulation
    maxParticles: 450,          // Thicker fog
  },
  CLOUDS: {
    id: 'clouds',
    realm: 'surface',
    char: '^',
    chars: ['^', 'v', '^', 'o'],
    color: '#FFFF99',           // Bright yellow
    bgColor: '#E1E1E1',         // LIGHT GREY (225,225,225) - entire tile
    decay: 0.004,               // Ultra low - clouds stay intact
    gravity: 0.0,               // Floats
    windInfluence: 0.6,         // Gentler wind response
    flowScale: 0.012,           // Large, slow waves
    flowStrength: 0.12,         // Very gentle drifting
    maxParticles: 450,          // Fuller clouds
  },
  MIST: {
    id: 'mist',
    realm: 'underground',
    char: '≈',
    chars: ['≈', '~', 'ˉ', '≈'],
    color: '#AADDFF',           // Bright light blue
    bgColor: '#333333',         // Dark grey for underground
    decay: 0.012,               // Low decay
    gravity: 0.005,             // Very slight drift down
    windInfluence: 0.2,         // Cave winds weak
    flowScale: 0.04,            // Medium waves
    flowStrength: 0.3,          // Swirly motion
    maxParticles: 220,
  },
  MIASMA: {
    id: 'miasma',
    realm: 'underground',
    char: '☁',
    chars: ['☁', '≈', '~', '∿'],
    color: '#FFAA00',           // Bright orange
    bgColor: '#333333',         // Dark grey for underground
    decay: 0.008,               // Very low - miasma pools
    gravity: 0.008,             // Sinks slowly
    windInfluence: 0.1,         // Very resistant to wind
    flowScale: 0.025,           // Languid waves
    flowStrength: 0.12,         // Slow undulation
    maxParticles: 380,          // Thicker miasma
  },
  SMOKE: {
    id: 'smoke',
    realm: 'underground',
    char: '∿',
    chars: ['∿', '~', '≈', '~'],
    color: '#CCCCCC',           // Bright light gray
    bgColor: '#333333',         // Dark grey for underground
    decay: 0.06,                // Moderate fade
    gravity: -0.08,             // Rises
    windInfluence: 0.5,         // Moderately pushed
    flowScale: 0.05,            // Medium waves
    flowStrength: 0.35,         // Turbulent
    maxParticles: 200,
  },
  SPORES: {
    id: 'spores',
    realm: 'underground',
    char: '·',
    chars: ['·', '°', '·', 'o'],
    color: '#FF88FF',           // Bright magenta
    bgColor: '#333333',         // Dark grey for underground
    decay: 0.03,                // Moderate decay
    gravity: 0.02,              // Light drift
    windInfluence: 0.3,         // Particles are small
    flowScale: 0.045,           // Organic waves
    flowStrength: 0.25,         // Dispersing motion
    maxParticles: 250,
  },
};
