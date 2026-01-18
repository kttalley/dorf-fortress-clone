/**
 * Simplex noise implementation for terrain generation
 * Based on Stefan Gustavson's implementation
 */

// Permutation table
const perm = new Uint8Array(512);
const gradP = new Array(512);

// Gradient vectors for 2D
const grad3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

/**
 * Seed the noise generator
 * @param {number} seed - Seed value
 */
export function seed(seed) {
  if (seed > 0 && seed < 1) seed *= 65536;
  seed = Math.floor(seed);
  if (seed < 256) seed |= seed << 8;

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let v;
    if (i & 1) {
      v = p[i] ^ (seed & 255);
    } else {
      v = p[i] ^ ((seed >> 8) & 255);
    }
    // Simple LCG for permutation
    v = (v * 1664525 + 1013904223) & 255;
    p[i] = v;
  }

  for (let i = 0; i < 256; i++) {
    p[i] = (p[i] + i * 31) & 255;
  }

  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    gradP[i] = grad3[perm[i] % 12];
  }
}

// Initialize with random seed
seed(Math.random() * 65536);

// Skewing factors for 2D simplex
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/**
 * 2D Simplex noise
 * @param {number} x
 * @param {number} y
 * @returns {number} Noise value in range [-1, 1]
 */
export function simplex2(x, y) {
  let n0, n1, n2;

  // Skew input space
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);

  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  // Determine simplex
  let i1, j1;
  if (x0 > y0) {
    i1 = 1; j1 = 0;
  } else {
    i1 = 0; j1 = 1;
  }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  // Hash coordinates
  const ii = i & 255;
  const jj = j & 255;

  // Calculate contributions
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 < 0) {
    n0 = 0;
  } else {
    const gi0 = gradP[ii + perm[jj]];
    t0 *= t0;
    n0 = t0 * t0 * (gi0[0] * x0 + gi0[1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 < 0) {
    n1 = 0;
  } else {
    const gi1 = gradP[ii + i1 + perm[jj + j1]];
    t1 *= t1;
    n1 = t1 * t1 * (gi1[0] * x1 + gi1[1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 < 0) {
    n2 = 0;
  } else {
    const gi2 = gradP[ii + 1 + perm[jj + 1]];
    t2 *= t2;
    n2 = t2 * t2 * (gi2[0] * x2 + gi2[1] * y2);
  }

  // Scale to [-1, 1]
  return 70 * (n0 + n1 + n2);
}

/**
 * Fractal Brownian Motion (octaved noise)
 * @param {number} x
 * @param {number} y
 * @param {number} octaves - Number of octaves
 * @param {number} lacunarity - Frequency multiplier per octave
 * @param {number} persistence - Amplitude multiplier per octave
 * @returns {number} Noise value in range [-1, 1]
 */
export function fbm(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += simplex2(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total / maxValue;
}

/**
 * Ridged noise (good for mountains)
 * @param {number} x
 * @param {number} y
 * @param {number} octaves
 * @returns {number} Noise value in range [0, 1]
 */
export function ridged(x, y, octaves = 4) {
  let total = 0;
  let frequency = 1;
  let amplitude = 1;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(simplex2(x * frequency, y * frequency));
    total += n * n * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total / 2;
}

/**
 * Generate a normalized noise value [0, 1]
 * @param {number} x
 * @param {number} y
 * @param {number} scale - Noise scale (larger = more zoomed out)
 * @returns {number} Value in range [0, 1]
 */
export function noise2D(x, y, scale = 0.05) {
  return (fbm(x * scale, y * scale) + 1) / 2;
}

/**
 * Domain-warped noise - creates organic, swirling patterns.
 * Great for natural-looking terrain boundaries.
 * @param {number} x
 * @param {number} y
 * @param {number} scale
 * @param {number} warpStrength - How much warping (default 4)
 * @returns {number} Value in range [0, 1]
 */
export function warped(x, y, scale = 0.03, warpStrength = 4) {
  const nx = x * scale;
  const ny = y * scale;
  const warpX = fbm(nx, ny, 3) * warpStrength;
  const warpY = fbm(nx + 5.2, ny + 1.3, 3) * warpStrength;
  return (fbm(nx + warpX, ny + warpY, 4) + 1) / 2;
}

/**
 * Create a noise map (flat array of noise values).
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @param {function} noiseFn - Function(x, y, scale) returning [0,1]
 * @returns {Float32Array}
 */
export function createNoiseMap(width, height, scale = 0.05, noiseFn = noise2D) {
  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      map[y * width + x] = noiseFn(x, y, scale);
    }
  }
  return map;
}

/**
 * Create multiple noise layers for biome determination.
 * Returns elevation, moisture, temperature maps.
 * @param {number} width
 * @param {number} height
 * @param {number} mapSeed - Optional seed for reproducibility
 * @returns {{elevation: Float32Array, moisture: Float32Array, temperature: Float32Array}}
 */
export function createBiomeMaps(width, height, mapSeed = null) {
  if (mapSeed !== null) seed(mapSeed);

  // Different scales and offsets for variety
  const elevation = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const temperature = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Elevation: ridged for mountains, fbm for base
      const baseElevation = noise2D(x, y, 0.02);
      const ridgeNoise = ridged(x * 0.015, y * 0.015, 5);
      elevation[idx] = baseElevation * 0.6 + ridgeNoise * 0.4;

      // Moisture: warped for organic rivers/lakes
      moisture[idx] = warped(x + 1000, y + 1000, 0.025, 3);

      // Temperature: latitude-like gradient + noise
      const latitudeFactor = 1 - Math.abs(y / height - 0.5) * 1.2;
      const tempNoise = noise2D(x + 2000, y + 2000, 0.04);
      temperature[idx] = latitudeFactor * 0.7 + tempNoise * 0.3;
    }
  }

  return { elevation, moisture, temperature };
}
