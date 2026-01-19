// mapConfig.js
export function getInitialMapConfig() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouch =
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window;

  // Desktop / large screens
  if (width >= 1200) {
    return {
      MAP_WIDTH: 128,
      MAP_HEIGHT: 48,
      INITIAL_DWARVES: 7,
      INITIAL_FOOD_SOURCES: 15,
      SPEED_LEVELS: [250, 150, 80, 40],
      defaultSpeedIndex: 0,
    };
  }

  // Tablet / small laptop
  if (width >= 768) {
    return {
      MAP_WIDTH: 96,
      MAP_HEIGHT: 40,
      INITIAL_DWARVES: 6,
      INITIAL_FOOD_SOURCES: 12,
      SPEED_LEVELS: [300, 180, 100],
      defaultSpeedIndex: 0,
    };
  }

  // Mobile
  return {
    MAP_WIDTH: 64,
    MAP_HEIGHT: 32,
    INITIAL_DWARVES: 4,
    INITIAL_FOOD_SOURCES: 8,
    SPEED_LEVELS: isTouch
      ? [400, 250, 150] // slower by default for touch
      : [300, 180, 100],
    defaultSpeedIndex: 0,
  };
}
