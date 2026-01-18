// Import necessary libraries
import { create2DArray } from './utils';

// Constants for map generation
const WIDTH = 8;
const HEIGHT = 4;
const WALL = '#';
const FLOOR = '.';

// Function to initialize the map with random values
function initializeMap(width, height) {
    let map = create2DArray(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (Math.random() < 0.45) {
                map[y][x] = WALL;
            } else {
                map[y][x] = FLOOR;
            }
        }
    }
  return map;
}

// Function to apply cellular automata rules
function applyCellularAutomata(map, iterations) {
    for (let i = 0; i < iterations; i++) {
        let newMap = create2DArray(WIDTH, HEIGHT);
        for (let y = 0; y < HEIGHT; y++) {
            for (let x = 0; x < WIDTH; x++) {
                let wallCount = countAdjacentWalls(map, x, y);
                if (wallCount >= 5) {
                    newMap[y][x] = WALL;
                } else {
                    newMap[y][x] = FLOOR;
                }
            }
        }
        map = newMap;
    }
  return map;
}

// Function to count adjacent walls
function countAdjacentWalls(map, x, y) {
    let wallCount = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = x + dx;
            let ny = y + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
                if (map[ny][nx] === WALL) wallCount++;
            }
        }
    }
    return wallCount;
}

// Function to generate the map
function generateMap() {
    let map = initializeMap(WIDTH, HEIGHT);
    map = applyCellularAutomata(map, 4); // Apply cellular automata for 4 iterations
    return map;
}

export { generateMap };
