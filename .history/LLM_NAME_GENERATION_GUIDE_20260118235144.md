# LLM Name Generation - Complete Integration Guide

## System Architecture

```
Game Startup
    ↓
initializeLLM() ──→ Check LLM server health
    ↓
llmAvailable = true/false
    ↓
createDwarf(x, y)
    ├─ generateNameBioSync() ──→ Immediate fallback (sync)
    │   ├─ Extract traits
    │   ├─ Pick from name pools
    │   ├─ Select bio template
    │   └─ Return { name, bio }
    │
    └─ requestNameBio(dwarf) ──→ Background LLM request (async)
        ├─ IF llmAvailable:
        │   ├─ Format prompt
        │   ├─ Queue through queueGeneration()
        │   ├─ Parse JSON response
        │   ├─ Update entity properties
        │   └─ Emit DWARF_NAME_GENERATED
        │
        └─ ELSE: Use sync fallback
```

## Files & Responsibilities

### Core Generation Pipeline

#### [src/llm/nameGenerator.js](nameGenerator.js)
**Main async orchestrator**
- `initializeLLM()` - Startup health check
- `requestNameBio(entity, worldSnapshot, options)` - Main API
- `generateNameBioSync(entity)` - Sync fallback
- `setLLMAvailable(bool)` / `isLLMAvailable()` - Control flag
- Event emission: `DWARF_NAME_PENDING`, `DWARF_NAME_GENERATED`

#### [src/llm/fallbacks.js](../fallbacks.js)
**Deterministic local generation**
- `generateNameBioLocal(entity)` - Seed-based generation
- Uses entity.id for reproducible randomness
- 10+ traits mapped to epithets and bios
- Archaic, wry tone consistent with LLM output

#### [src/llm/prompts/dwarf.js](../prompts/dwarf.js)
**Prompt engineering & response parsing**
- `SYSTEM_DWARF_NAME_BIO` - System instructions
- `formatDwarfNameBioPrompt(entity, options)` - User prompt with traits
- `parseNameBioResponse(response)` - Robust JSON extraction
  - Direct JSON parse
  - Markdown code block extraction
  - Raw object search
  - Sanitization (length limits, quote removal)

### LLM Integration

#### [src/ai/llmClient.js](../../ai/llmClient.js)
**Ollama API client**
- `queueGeneration(prompt, options)` - Rate-limited queue
- `checkLLMHealth()` - Server availability check
- `getQueueSize()` / `getActiveRequests()` - Monitoring
- Max 2 concurrent requests to prevent overload

### UI Integration

#### [src/ui/dwarfBioDisplay.js](dwarfBioDisplay.js) *(NEW)*
**Display components for generated names/bios**
- `createDwarfBioDisplay(dwarf, options)` - Full card
- `createDwarfNameCard(dwarf)` - Compact card
- `createDwarfBadge(dwarf)` - Tooltip badge
- `createExtendedLore(dwarf)` - "More Lore" expansion
- Generation status indicators

#### [src/llm/nameGenerationEvents.js](nameGenerationEvents.js) *(NEW)*
**Event system & formatters**
- `initializeNameGenerationEvents()` - Setup listeners
- `watchDwarfNameGeneration(dwarf)` - Wait for completion
- `DwarfDisplayFormatters` - Various display formats
- `waitForMultipleDwarfNames(dwarves)` - Batch wait

### State & Events

#### [src/state/store.js](../../state/store.js)
**World state includes entities with LLM metadata**
- Dwarves store: `generatedName`, `generatedBio`, `llm.nameBio`

#### [src/events/eventBus.js](../../events/eventBus.js)
**Event types**
- `DWARF_NAME_PENDING` - Name generation started
- `DWARF_NAME_GENERATED` - Name generation complete
  - Payload: `{ entity, name, bio, source }`

#### [src/main.js](../../main.js) *(UPDATED)*
**Game initialization**
- Calls `initializeLLM()` on startup
- Event system ready for hook-ins

## Usage Examples

### 1. Basic Usage (Automatic)

```javascript
import { createDwarf } from './sim/entities.js';
import { on, EVENTS } from './events/eventBus.js';

// Create dwarf - immediately has fallback name/bio
const dwarf = createDwarf(x, y);
console.log(dwarf.generatedName);  // "Urist the Wanderer" (sync)
console.log(dwarf.generatedBio);   // Bio from local fallback

// LLM generation happens in background
on(EVENTS.DWARF_NAME_GENERATED, ({ entity, name, bio, source }) => {
  if (entity.id === dwarf.id) {
    console.log(`🎲 LLM generated: ${name}`);
    // Update UI with new name/bio
  }
});
```

### 2. Display Name in UI

```javascript
import { createDwarfBioDisplay } from './ui/dwarfBioDisplay.js';

// Create display element
const bioHtml = createDwarfBioDisplay(dwarf, {
  showSource: true,    // Show [llm] or [local]
  showStatus: true,    // Show ⧖ if generating
  showTraits: true,    // Show dominant traits
  expandable: true,    // Add "More Lore" button
  compact: false,      // Full display
});

// Insert into DOM
document.getElementById('dwarf-panel').innerHTML = bioHtml;
```

### 3. Wait for LLM Generation

```javascript
import { watchDwarfNameGeneration } from './llm/nameGenerationEvents.js';

const dwarf = createDwarf(x, y);

// Wait for LLM to complete
const generated = await watchDwarfNameGeneration(dwarf);
if (generated) {
  console.log(`✨ ${generated.name} from ${generated.source}`);
}
```

### 4. Batch Creation with Names

```javascript
import { waitForMultipleDwarfNames } from './llm/nameGenerationEvents.js';

// Create multiple dwarves
const dwarves = [];
for (let i = 0; i < 5; i++) {
  dwarves.push(createDwarf(x + i, y));
}

// Wait for all names to generate (max 10 seconds)
const names = await waitForMultipleDwarfNames(dwarves, 10000);
for (const [dwarfId, { name, bio, source }] of names) {
  console.log(`${name}: ${bio} (${source})`);
}
```

### 5. Custom Formatting

```javascript
import { DwarfDisplayFormatters } from './llm/nameGenerationEvents.js';

const dwarf = createDwarf(x, y);

// Different formats for different contexts
console.log(DwarfDisplayFormatters.inline(dwarf));      // "Urist"
console.log(DwarfDisplayFormatters.shortCard(dwarf));   // "Urist" or "Urist ⧖"
console.log(DwarfDisplayFormatters.fullCard(dwarf));    // Multi-line
console.log(DwarfDisplayFormatters.verbose(dwarf));     // With metadata
```

### 6. Check Generation Status

```javascript
import { 
  isNamePending, 
  hasGeneratedName, 
  getNameSource 
} from './llm/nameGenerator.js';

const dwarf = createDwarf(x, y);

if (isNamePending(dwarf)) {
  console.log('Name generation in progress...');
  // Show loading spinner
}

if (hasGeneratedName(dwarf)) {
  const source = getNameSource(dwarf);
  console.log(`Generated from ${source}`);
}
```

## Configuration

### LLM Settings

In `src/ai/llmClient.js`:
```javascript
const OLLAMA_URL = 'https://llm.kristiantalley.com';
const MODEL = 'incept5/llama3.1-claude:latest';
const REQUEST_TIMEOUT = 5000;
const MAX_CONCURRENT = 2;  // Concurrent requests
```

### Name Generation Settings

In `src/llm/nameGenerator.js`:
```javascript
const CONFIG = {
  TIMEOUT_MS: 5000,         // LLM request timeout
  MAX_RETRIES: 1,           // Retry attempts
  MODEL: 'gemma3:latest',   // Fallback model
  MAX_TOKENS: 100,          // Response token limit
  TEMPERATURE: 0.85,        // Creativity (0-1)
};
```

### Prompt Template

In `src/llm/prompts/dwarf.js`:
```javascript
export const SYSTEM_DWARF_NAME_BIO = `You are a dwarven chronicler...
Output valid JSON only: {"name":"...","bio":"..."}`;

export const USER_DWARF_NAME_BIO = `Record this dwarf:
Type: {{entityType}}
Traits: {{traits}}
Aspiration: {{aspiration}}`;
```

## Performance Considerations

### Request Queuing
- **Max concurrent**: 2 (prevents server overload)
- **Per-dwarf**: ~500ms average
- **Timeout**: 5 seconds → fallback to local
- **Fallback speed**: <1ms (sync, instant)

### Example Timeline
```
Tick 0: createDwarf() → sync generation instant
Tick 1: requestNameBio() queued
Tick ~200: LLM response received
  → Update entity.generatedName/Bio
  → Emit DWARF_NAME_GENERATED event
  → UI can update immediately
```

### Memory Usage
- Per dwarf: ~200 bytes (name + bio strings)
- Per entity: 1 pending request promise or cached result

## Testing

### Disable LLM (Force Fallback)
```javascript
import { setLLMAvailable } from './llm/nameGenerator.js';

setLLMAvailable(false);  // Use local generation only

// All dwarves will get deterministic fallback names
const dwarf = createDwarf(x, y);
// Instant: generatedName = "Urist the Wanderer"
```

### Enable LLM
```javascript
import { initializeLLM } from './llm/nameGenerator.js';

await initializeLLM();  // Check health, set availability
```

### Manual Generation
```javascript
import { requestNameBio, generateNameBioSync } from './llm/nameGenerator.js';

const dwarf = { 
  id: 123,
  personality: { curiosity: 0.9, friendliness: 0.6, ... }
};

// Sync fallback
const sync = generateNameBioSync(dwarf);
console.log(sync); // { name, bio }

// Async LLM
const async = await requestNameBio(dwarf);
console.log(async); // { name, bio }
```

## Emergent Features

### 1. Personality-Driven Names
Dwarves with high creativity get creative names:
- LLM: "Mazarbul the Artificer" (from traits)
- Fallback: "Thikut the Maker" (from creativity pool)

### 2. Wry, Archaic Tone
Consistent voice across local + LLM:
- "Bends like granite, which is to say: not at all"
- "Knows every dwarf by name and most by their secrets"

### 3. Graceful Degradation
- LLM unavailable → fallback instant
- LLM timeout → local generation
- No visible gap in UX

### 4. World-Aware Names
LLM gets world context if provided:
```javascript
const context = { recentEvent: 'Goblin invasion repelled' };
await requestNameBio(dwarf, { recentEvent: 'Goblin invasion' });
```

## Future Enhancements

1. **Extended Lore** - "More Lore" button fetches longer bio
2. **Item Naming** - Apply same system to legendary items
3. **Place Naming** - Caverns, halls, dangerous zones
4. **Dynamic Updates** - Update bios on achievements
5. **Relationships** - LLM generates how dwarves relate

## Troubleshooting

### Names Not Generating
```javascript
import { isLLMAvailable } from './llm/nameGenerator.js';
console.log(isLLMAvailable()); // Should be true

// If false, check:
// 1. LLM server running?
// 2. Network connection?
// 3. Check browser console for errors
```

### Slow Generation
```javascript
import { getQueueSize, getActiveRequests } from './ai/llmClient.js';
console.log(`Queue: ${getQueueSize()}, Active: ${getActiveRequests()}`);

// If queue > 10, LLM might be overloaded
```

### Parsing Errors
LLM response parsing has multiple fallbacks:
1. Direct JSON parse
2. Markdown code block extraction
3. Raw object search
4. If all fail → use sync fallback

Check console for warnings: `[LLM] Generation failed`

---

**Summary**: LLM name generation is fully integrated with graceful fallback, event system, and UI components. Dwarves get personalized names and bios automatically on creation, making the world feel emergent and alive.
