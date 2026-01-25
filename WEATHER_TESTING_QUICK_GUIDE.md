# Quick Weather Testing Guide

## Verify Integration is Working

### 1. **Run Tests**
```bash
cd /Users/ktt/Documents/programming-projects-2026/test/dorf-fortress-clone
node test-weather.mjs
```

Expected output: All 5 tests pass ✓

### 2. **Start Dev Server**
```bash
npm run dev
```

Visit: http://localhost:5175/projects/llm-fortress/

### 3. **Check Browser Console**
Open DevTools (F12) → Console tab

Look for:
- No `getTileDef` errors ✓
- No import errors ✓
- World loading message ✓

### 4. **Visual Verification**
- Watch the ASCII map for animated weather
- Look for rain (|, /, \) or other weather characters
- Dwarves should appear on the map
- Stat panel should show dwarf mood values

---

## Debug Commands

In browser console:
```javascript
// Access game state
window.gameState

// Check weather simulator
window.gameState.weather

// Get weather at specific position
window.gameState.weather.getWeatherAt(70, 20)

// Add rain at coordinates
window.gameState.weather.addSource(70, 20, 'RAIN', 0.8, 100)

// Check dwarf mood
window.gameState.dwarves[0].mood

// Force a tick
window.gameState.tick++
```

---

## Expected Behavior

### On Game Start:
1. World generates with weather simulator
2. 7 dwarves spawn at random locations
3. Initial render shows ASCII map with tiles
4. Game loop begins ticking

### Over Time:
1. Weather spreads across the map via diffusion
2. Dwarves wander and make decisions
3. Weather overlay visible on tiles
4. Dwarves' mood values change based on weather

### Weather Effects Visible:
- Rain: Dwarves seek shelter indoors
- Miasma: Dwarves avoid toxic areas
- Fog: Reduced visibility effects
- Snow: Accumulation on landscape

---

## Common Issues & Fixes

### "getRenderingAt is not a function"
- Check: `weather.js` imported correctly in main.js
- Fix: Restart dev server (`Ctrl+C`, then `npm run dev`)

### Weather not appearing on map
- Check: Browser console for errors
- Fix: Clear browser cache (Ctrl+Shift+Delete)
- Verify: `renderFrame()` is passing weather to renderer

### Dwarves not responding to weather
- Check: `dwarfAI.js` has weather cognition imports
- Verify: `decide()` function includes weather mood application
- Debug: Check `window.gameState.dwarves[0].mood` in console

### Performance issues
- Reduce number of dwarves (line 26 in main.js: `INITIAL_DWARVES = 3`)
- Disable animations (weatherRenderer.js line ~150)
- Check: Browser's FPS counter (usually 60 target)

---

## Testing Checklist

- [ ] Integration tests pass: `node test-weather.mjs` ✓
- [ ] Dev server starts: `npm run dev` ✓
- [ ] Game loads in browser without errors ✓
- [ ] Weather simulator initializes ✓
- [ ] Dwarves appear on map ✓
- [ ] Weather overlay visible (animated characters) ✓
- [ ] Dwarf mood values visible in stat panel ✓
- [ ] No console errors ✓
- [ ] No rendering glitches ✓
- [ ] Game runs at 60 FPS ✓

---

## Files to Monitor

### Core Integration Files:
- `src/main.js` - Weather initialization ⭐
- `src/sim/world.js` - Weather tick in loop ⭐
- `src/ai/dwarfAI.js` - Dwarf weather effects ⭐
- `src/ui/renderer.js` - Weather rendering ⭐

### Weather System Files:
- `src/sim/weather.js` - Core simulator
- `src/sim/weatherCognition.js` - Dwarf effects
- `src/ui/weatherRenderer.js` - Rendering pipeline
- `src/sim/weatherScenarios.js` - Event triggers

---

## Browser Testing Workflow

1. Open DevTools (F12)
2. Go to Console tab
3. Paste these commands to test:

```javascript
// Check weather exists
console.log('Weather simulator:', window.gameState.weather ? '✓' : '✗');

// Check weather is ticking
console.log('Weather tick:', window.gameState.weather.tick ? '✓' : '✗');

// Sample weather at center
const w = window.gameState.weather.getWeatherAt(71, 20);
console.log('Weather at center:', w);

// Check dwarves
console.log('Dwarves count:', window.gameState.dwarves.length);
console.log('First dwarf mood:', window.gameState.dwarves[0].mood);
```

---

## Success Criteria

✅ Weather system is considered successfully integrated when:
1. No JavaScript errors in console
2. Weather simulator ticks each game tick
3. Weather effects visible on map (animated overlays)
4. Dwarf mood changes based on weather
5. Test suite passes (5/5 tests)
6. Game runs at target FPS (60+)

---

*Last Updated: January 24, 2026*  
*Status: Integration Complete - Phases 1-3 Active*
