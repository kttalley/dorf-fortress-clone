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

    // Multiple sine waves create organic undulation
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
    bgColor: '#0055AA',         // Stronger blue background
    decay: 0.05,
    gravity: 0.08,              // Falls down
    windInfluence: 0.4,         // Pushed by wind
    flowScale: 0.04,            // Fine waves
    flowStrength: 0.15,         // Subtle undulation
    maxParticles: 350,          // Increased for denser rain clouds
  },
  SNOW: {
    id: 'snow',
    realm: 'surface',
    char: '*',
    chars: ['*', '+', '*', '.'],
    color: '#FFFFFF',           // Bright white
    bgColor: '#2266FF',         // Stronger blue background
    decay: 0.03,
    gravity: 0.02,              // Drifts slowly
    windInfluence: 0.6,         // Very affected by wind
    flowScale: 0.025,           // Slow waves
    flowStrength: 0.25,         // More undulation
    maxParticles: 300,          // Increased for fuller snow drifts
  },
  FOG: {
    id: 'fog',
    realm: 'surface',
    char: '~',
    chars: ['~', '≈', '~', '-'],
    color: '#CCDDFF',           // Bright light blue
    bgColor: '#1a3366',         // Stronger blue background
    decay: 0.02,
    gravity: 0.005,             // Barely falls
    windInfluence: 0.3,         // Moderate wind response
    flowScale: 0.015,           // Large organic waves
    flowStrength: 0.3,          // Strong undulation
    maxParticles: 400,          // Increased for fuller, swirling fog
  },
  CLOUDS: {
    id: 'clouds',
    realm: 'surface',
    char: '^',
    chars: ['^', 'v', '^', 'o'],
    color: '#FFFF99',           // Bright yellow (like the image)
    bgColor: '#996600',         // Warm tan/brown background
    decay: 0.01,
    gravity: 0.0,               // Floats
    windInfluence: 0.8,         // Driven by wind
    flowScale: 0.02,            // Medium waves
    flowStrength: 0.2,          // Gentle movement
    maxParticles: 350,          // Increased for fuller clouds
  },
  MIST: {
    id: 'mist',
    realm: 'underground',
    char: '≈',
    chars: ['≈', '~', 'ˉ', '≈'],
    color: '#AADDFF',           // Bright light blue
    bgColor: '#003366',         // Darker blue background
    decay: 0.02,
    gravity: 0.01,              // Very slight drift down
    windInfluence: 0.2,         // Cave winds weak
    flowScale: 0.03,            // Medium waves
    flowStrength: 0.25,         // Swirly motion
    maxParticles: 180,
  },
  MIASMA: {
    id: 'miasma',
    realm: 'underground',
    char: '☁',
    chars: ['☁', '≈', '~', '∿'],
    color: '#FFAA00',           // Bright orange
    bgColor: '#663300',         // Darker orange-brown background
    decay: 0.01,
    gravity: 0.005,             // Sinks slowly
    windInfluence: 0.15,        // Thick, resistant to wind
    flowScale: 0.025,           // Languid waves
    flowStrength: 0.15,         // Slow undulation
    maxParticles: 320,          // Increased for thicker miasma clouds
  },
  SMOKE: {
    id: 'smoke',
    realm: 'underground',
    char: '∿',
    chars: ['∿', '~', '≈', '~'],
    color: '#666666',
    bgColor: '#1a1a1a',
    decay: 0.08,                // Fades quickly
    gravity: -0.05,             // Rises
    windInfluence: 0.5,         // Moderately pushed
    flowScale: 0.04,            // Fine waves
    flowStrength: 0.3,          // Turbulent
    maxParticles: 160,
  },
  SPORES: {
    id: 'spores',
    realm: 'underground',
    char: '·',
    chars: ['·', '°', '·', 'o'],
    color: '#FF88FF',           // Bright magenta
    bgColor: '#663366',         // Darker purple background
    decay: 0.04,
    gravity: 0.01,              // Light drift
    windInfluence: 0.25,        // Particles are small
    flowScale: 0.035,           // Organic waves
    flowStrength: 0.2,          // Dispersing motion
    maxParticles: 200,
  },
};
