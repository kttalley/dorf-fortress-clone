import { create2DArray } from './utils';
import { generateMap } from './map_generators/cellular_automata';

const WIDTH = 8;
const HEIGHT = 4;

let map = generateMap();

const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

// ASCII cell sizing (logical units)
const CELL_WIDTH = 1;
const CELL_HEIGHT = 1;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const { innerWidth, innerHeight } = window;

  // Determine scale that fits grid on screen
  const scale = Math.min(
    innerWidth / WIDTH,
    innerHeight / HEIGHT
  );

  // Physical canvas size
  canvas.width = Math.floor(WIDTH * scale * dpr);
  canvas.height = Math.floor(HEIGHT * scale * dpr);

  // CSS size
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;

  // Reset transform before scaling
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.scale(scale * dpr, scale * dpr);

  // Font setup — CRITICAL for mobile
  context.font = `1px monospace`;
  context.textBaseline = 'top';
  context.textAlign = 'left';
}

function renderMap(map) {
  context.clearRect(0, 0, WIDTH, HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const glyph = map[y][x] === '#' ? '#' : '.';
      context.fillStyle = map[y][x] === '#' ? '#000' : '#fff';
      context.fillText(glyph, x, y);
    }
  }
}

function render() {
//   resizeCanvas();
  renderMap(map);
}

// Initial render
render();

// Re-render on resize / orientation change
window.addEventListener('resize', render);
