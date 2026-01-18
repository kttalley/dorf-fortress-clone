// Cellular Automata Map Generator

function initializeMap(width, height) {
  const map = [];
  for (let y = 0; y < height; y++) {
    map.push([]);
    for (let x = 0; x < width; x++) {
      map[y].push(Math.random() > 0.45 ? 1 : 0); // 55% chance of being a wall
    }
  }
  return map;
}

function applyCellularAutomata(map, iterations) {
  for (let i = 0; i < iterations; i++) {
    const newMap = [];
    for (let y = 0; y < map.length; y++) {
      newMap.push([]);
      for (let x = 0; x < map[y].length; x++) {
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < map.length && nx >= 0 && nx < map[y].length) {
              neighbors += map[ny][nx];
            }
          }
        }
        newMap[y][x] = neighbors > 4 ? 1 : 0;
      }
    }
    map = newMap;
  }
  return map;
}

export { initializeMap, applyCellularAutomata };