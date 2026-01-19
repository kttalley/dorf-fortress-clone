# Name & Bio Generator Integration Guide

## Overview

The name generator creates flavorful dwarven names and personality bios using LLM, with deterministic local fallbacks.

**Files:**
- `src/llm/nameGenerator.js` - Main API
- `src/llm/prompts/dwarf.js` - Prompt templates
- `src/llm/fallbacks.js` - Local generation

---

## Integration Checklist

### 1. Call `requestNameBio()` on Dwarf Creation

**Location:** `src/sim/entities.js` in `createDwarf()`

```javascript
import { requestNameBio, generateNameBioSync } from '../llm/nameGenerator.js';

export function createDwarf(x, y, name = null) {
  const dwarf = {
    // ... existing creation code ...
  };

  // Option A: Async (preferred) - fires in background
  requestNameBio(dwarf).catch(err => {
    console.warn('Name generation failed:', err);
  });

  // Option B: Sync fallback - immediate, no LLM
  // generateNameBioSync(dwarf);

  return dwarf;
}
```

### 2. Set LLM Availability on Init

**Location:** `src/main.js` in `init()`

```javascript
import { setLLMAvailable } from './llm/nameGenerator.js';
import { checkConnection } from './ai/llmClient.js';

async function init() {
  const connected = await checkConnection();
  setLLMAvailable(connected);

  // ... rest of init
}
```

### 3. Listen for Name Generation Events

**Location:** Where you need UI updates

```javascript
import { on, EVENTS } from './events/eventBus.js';

// Show loading indicator
on(EVENTS.DWARF_NAME_PENDING, ({ entity }) => {
  console.log(`Generating name for dwarf ${entity.id}...`);
  // Show spinner in UI
});

// Update display with generated name
on(EVENTS.DWARF_NAME_GENERATED, ({ entity, name, bio, source }) => {
  console.log(`${name}: "${bio}" (via ${source})`);
  // Update UI with new name/bio
  // source is 'llm' or 'local'
});
```

---

## Entity Schema

After generation, dwarf entities have:

```javascript
dwarf.generatedName  // "Urist the Brave" (display name)
dwarf.generatedBio   // "Rushes toward danger..." (personality summary)

dwarf.llm.nameBio = {
  status: 'complete',        // 'pending' | 'complete'
  source: 'llm',             // 'llm' | 'local' | 'local_sync'
  model: 'gemma3:latest',    // LLM model used (if source='llm')
  name: 'Urist the Brave',
  bio: 'Rushes toward danger with enthusiasm.',
  requestedAt: 1704067200000,
  completedAt: 1704067201234,
  prompt: '...',             // Debug: actual prompt sent
  fallbackReason: null,      // 'llm_unavailable' | 'llm_error' (if fallback)
}
```

---

## UI State Handling

```javascript
import { isNamePending, hasGeneratedName, getNameSource } from './llm/nameGenerator.js';

function renderDwarfName(dwarf) {
  if (isNamePending(dwarf)) {
    return `${dwarf.name} (...)`;  // Show original + loading
  }

  if (hasGeneratedName(dwarf)) {
    const source = getNameSource(dwarf);
    const badge = source === 'llm' ? '' : '*';  // Mark fallbacks
    return `${dwarf.generatedName}${badge}`;
  }

  return dwarf.name;  // Original name
}

function renderDwarfBio(dwarf) {
  return dwarf.generatedBio || 'A dwarf of unknown temperament.';
}
```

---

## Prompt Design

**System prompt** (43 tokens):
```
You are a dwarven chronicler recording names and brief histories.
Write in terse, archaic style. Be wry, not whimsical.
Output valid JSON only: {"name":"...","bio":"..."}
Name: 1-3 words. Bio: 1-2 sentences max.
```

**User prompt** (~60 tokens):
```
Record this dwarf:
Type: dwarf
Traits: curious, bold, dour
Aspiration: seeks mastery of craft

Respond with JSON only.
```

**Expected output**:
```json
{"name":"Bomrek the Seeker","bio":"Peers into shadows others avoid, seeking answers to questions unasked."}
```

---

## Fallback Behavior

When LLM is unavailable or fails:

1. **Name**: Picked from pool of 40 traditional names + trait-based epithet
2. **Bio**: Selected from 45 archaic templates keyed to dominant trait
3. **Seeding**: Uses `entity.id` for deterministic reproducibility

Example fallback output:
```javascript
{
  name: "Kadol the Wanderer",
  bio: "Forever poking about in places best left undisturbed."
}
```

---

## Testing

```javascript
// Test local fallback directly
import { generateNameBioLocal } from './llm/fallbacks.js';

const mockDwarf = {
  id: 42,
  personality: { curiosity: 0.8, bravery: 0.7, humor: 0.2 }
};

const result = generateNameBioLocal(mockDwarf);
console.log(result);
// { name: "Fikod the Seeker", bio: "Peers into every shadow..." }

// Same ID = same result (deterministic)
const result2 = generateNameBioLocal(mockDwarf);
console.assert(result.name === result2.name);
```

---

## Error Handling

The generator never throws to callers. Errors result in fallback:

| Scenario | Behavior |
|----------|----------|
| LLM unavailable | Immediate local fallback |
| LLM timeout (5s) | Local fallback, logs warning |
| Parse failure | Local fallback, logs warning |
| Invalid entity | Throws (caller error) |

---

## Performance Notes

- **No tick-loop impact**: Generation is fire-and-forget async
- **Batching**: Use `requestNameBioBatch()` for multiple dwarves
- **Deduplication**: Concurrent requests for same entity are merged
- **Token budget**: ~100 tokens system + 60 user + 50 response = 210 total
