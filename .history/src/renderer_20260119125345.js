import { create2DArray } from './utils';
import { generateMap } from './map_generators/cellular_automata';

const WIDTH = 16;
const HEIGHT = 8;

// Initialize the map
let map = generateMap();

// Set up the canvas
const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

// Function to resize the canvas
function resizeCanvas() {
    const { innerWidth, innerHeight } = window;
    const ratio = Math.min(innerWidth / WIDTH, innerHeight / HEIGHT);
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    context.scale(ratio, ratio);
}

// Function to render the map with specific glyphs and colors
function renderMap(map) {
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            if (map[y][x] === '#') {
                context.fillStyle = 'black';
                context.fillText('#', x, y + 1);
            } else {
                context.fillStyle = 'white';
                context.fillText('.', x, y + 1);
            }
        }
    }
}

// Render the map
renderMap(map);

// Add event listener to resize on window resize
window.addEventListener('resize', () => {
    resizeCanvas();
    renderMap(map);
});

// Initial resize
resizeCanvas();