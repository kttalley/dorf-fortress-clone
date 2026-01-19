# LLM Name Generation - Quick Reference

## One-Minute Summary

When you create a dwarf, it gets:
1. **Instant fallback name** from personality traits
2. **LLM request** sent in background
3. **Auto-update** when LLM completes (if available)

Everything works even without LLM—just less emergent.

## Key API

```javascript
// These are already called when you create a dwarf:
createDwarf(x, y)
  ├─ generateNameBioSync(dwarf)      // Instant: name + bio
  └─ requestNameBio(dwarf)           // Async: LLM upgrade

// Display name
dwarf.generatedName       // "Urist the Wanderer"
dwarf.generatedBio        // "Bends like granite..."

// Check status
isNamePending(dwarf)      // true while generating
hasGeneratedName(dwarf)   // true when complete
getNameSource(dwarf)      // 'llm' or 'local'

// Listen for updates
on(EVENTS.DWARF_NAME_GENERATED, ({ entity, name, bio }) => {
  // Update UI here
});
```

## Files You Need to Know

| File | Purpose |
|------|---------|
| `src/llm/nameGenerator.js` | Main async pipeline |
| `src/llm/fallbacks.js` | Local generation (always works) |
| `src/llm/prompts/dwarf.js` | Prompt templates |
| `src/ai/llmClient.js` | LLM server integration |
| `src/ui/dwarfBioDisplay.js` | UI components |
| `src/llm/nameGenerationEvents.js` | Event listeners & formatters |

## Display Options

```javascript
import { createDwarfBioDisplay } from './ui/dwarfBioDisplay.js';

// Full card
createDwarfBioDisplay(dwarf, { showTraits: true, expandable: true })

// Compact
createDwarfBioDisplay(dwarf, { compact: true })

// Status badge
createDwarfBadge(dwarf)

// Extended lore (for "More Lore" button)
await createExtendedLore(dwarf)
```

## Event Types

```javascript
// When name generation starts
EVENTS.DWARF_NAME_PENDING   // { entity }

// When name generation completes
EVENTS.DWARF_NAME_GENERATED // { entity, name, bio, source }
                              // source: 'llm' or 'local'
```

## Settings to Tweak

```javascript
// src/ai/llmClient.js
const MAX_CONCURRENT = 2;      // Concurrent LLM requests
const REQUEST_TIMEOUT = 5000;  // ms before timeout

// src/llm/nameGenerator.js
const TEMPERATURE = 0.85;      // Creativity (higher = more varied)
const MAX_TOKENS = 100;        // Length of response
```

## Testing

```javascript
// Force fallback (disable LLM)
import { setLLMAvailable } from './llm/nameGenerator.js';
setLLMAvailable(false);
const dwarf = createDwarf(x, y);  // Gets instant fallback name

// Force LLM (if available)
import { initializeLLM } from './llm/nameGenerator.js';
await initializeLLM();  // Checks server health

// Check what's available
import { isLLMAvailable } from './llm/nameGenerator.js';
console.log(isLLMAvailable());  // true/false
```

## How It Works

### With LLM Available ✓
```
createDwarf(x, y)
  ├─ Instant: local fallback name
  ├─ Background: send traits to LLM
  ├─ LLM returns: {"name": "...", "bio": "..."}
  ├─ Update: dwarf.generatedName = "..."
  └─ Event: DWARF_NAME_GENERATED fires
  
Result: Better names reflecting personality + world
```

### Without LLM ✓
```
createDwarf(x, y)
  ├─ Instant: local fallback name
  ├─ Background: try LLM, timeout or unavailable
  └─ Stays with: initial local name
  
Result: Deterministic but less emergent
```

## Common Patterns

### Show dwarf with pending indicator
```javascript
const name = dwarf.generatedName || dwarf.name;
const status = isNamePending(dwarf) ? ' ⧖' : '';
console.log(`${name}${status}`);
```

### Wait for LLM to finish
```javascript
import { watchDwarfNameGeneration } from './llm/nameGenerationEvents.js';
const result = await watchDwarfNameGeneration(dwarf);
// { name, bio, source }
```

### Batch wait for multiple dwarves
```javascript
import { waitForMultipleDwarfNames } from './llm/nameGenerationEvents.js';
const names = await waitForMultipleDwarfNames(dwarves, 10000);
// Map of dwarf.id -> { name, bio, source }
```

### Display in inspection panel
```javascript
import { createDwarfBioDisplay } from './ui/dwarfBioDisplay.js';
panel.innerHTML = createDwarfBioDisplay(dwarf, {
  showSource: true,
  showStatus: true,
  expandable: true
});
```

## Personality → Names (Fallback)

High trait = epithet selection:
- **Curious** → "the Wanderer", "Far-Seer"
- **Bold** → "the Brave", "Iron-Heart"
- **Gregarious** → "the Beloved", "Friend-Maker"
- **Creative** → "the Maker", "Clever-Hands"
- **Stubborn** → "the Unyielding", "Stone-Head"

Bios are trait-keyed templates with archaic tone.

## Prompt Going to LLM

```
System: "You are a dwarven chronicler... JSON only"
User: "Record this dwarf:
Type: dwarf
Traits: curious, gregarious, bold
Aspiration: seeks mastery of craft
Note: [optional world context]"
```

LLM returns: `{"name":"Mazarbul the Seeker","bio":"..."}`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Names all local, never from LLM | Check `isLLMAvailable()`, LLM server running? |
| Slow name generation | Check queue size: `getQueueSize()` |
| Names look same every time | Random seed from entity.id (deterministic fallback) |
| Want different names next run | Disable LLM for fallback demo, or cycle entity IDs |

## Performance

- **Fallback generation**: <1ms (instant)
- **LLM request**: ~500ms average per dwarf
- **Queue**: Max 2 concurrent (prevents overload)
- **Timeout**: 5 seconds → fallback to local

## Next Steps

1. ✅ Integration is complete
2. Test with `setLLMAvailable(false)` (local fallback)
3. Test with `await initializeLLM()` (LLM enabled)
4. Hook up UI updates to `DWARF_NAME_GENERATED` events
5. Add "More Lore" button using `createExtendedLore(dwarf)`

---

**Remember**: Dwarves get instant names, then better ones from LLM in background. No waiting, no UX hiccups. Emergent and smooth.
