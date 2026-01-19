# LLM Name Generation Integration

## Overview

The LLM name generation system provides emergent personality for dwarves through:

1. **Async LLM Pipeline** - Names and bios generated on entity creation (not per-tick)
2. **Deterministic Fallback** - Local generation if LLM unavailable
3. **Event System** - UI can hook into generation events
4. **LLM Architecture** - Rate-limited queue with concurrent request handling

## Flow

### Dwarf Creation

```
createDwarf() 
  ├─ generateNameBioSync() → immediate local generation (fallback)
  └─ requestNameBio() → async LLM request (updates entity when complete)
```

### LLM Request Pipeline

```
requestNameBio(entity)
  ├─ Check if already pending
  ├─ Initialize entity.llm storage
  ├─ Emit DWARF_NAME_PENDING event
  ├─ If LLM available:
  │   ├─ Format prompt with traits
  │   ├─ Queue through queueGeneration()
  │   ├─ Parse JSON response
  │   ├─ Update entity.generatedName/Bio
  │   └─ Emit DWARF_NAME_GENERATED event
  └─ Else:
      ├─ Use generateNameBioLocal()
      └─ Store as local source
```

## Files

### Core Components

- **[src/llm/nameGenerator.js](../nameGenerator.js)** - Main async pipeline
  - `requestNameBio(entity)` - Request name/bio for entity
  - `generateNameBioSync(entity)` - Immediate fallback generation
  - `setLLMAvailable(bool)` - Enable/disable LLM

- **[src/llm/fallbacks.js](../fallbacks.js)** - Deterministic local generation
  - `generateNameBioLocal(entity)` - Generate from personality
  - Seeded random based on entity ID (reproducible)

- **[src/llm/prompts/dwarf.js](../prompts/dwarf.js)** - Prompt templates
  - `SYSTEM_DWARF_NAME_BIO` - System instructions
  - `formatDwarfNameBioPrompt(entity)` - User prompt formatting
  - `parseNameBioResponse(response)` - JSON parsing with fallbacks

- **[src/ai/llmClient.js](../../ai/llmClient.js)** - Ollama integration
  - `generate(prompt, options)` - Raw LLM call
  - `queueGeneration(prompt, options)` - Rate-limited queuing

### UI Integration

- **[src/ui/inspection.js](../../ui/inspection.js)** - Dwarf display
  - Shows `generatedName` and `generatedBio`
  - Can hook into `DWARF_NAME_GENERATED` event

- **[src/events/eventBus.js](../../events/eventBus.js)** - Event system
  - `DWARF_NAME_PENDING` - Generation started
  - `DWARF_NAME_GENERATED` - Generation complete (name, bio, source)

## Configuration

### Personality Traits → Name Generators

Fallback generation uses entity personality to generate names:

- **Curious**: "Wanderer", "Far-Seer"
- **Bold**: "Brave", "Iron-Heart"
- **Gregarious**: "Beloved", "Friend-Maker"
- **Creative**: "Maker", "Clever-Hands"
- etc.

Bios are trait-keyed templates with archaic, wry tone.

### LLM Prompt

```
System: "You are a dwarven chronicler... Output valid JSON only"
User: "Record this dwarf:
Type: {{entityType}}
Traits: {{traits}}
Aspiration: {{aspiration}}
Note: {{worldContext}}"
```

Response format: `{"name":"...", "bio":"..."}`

### Generation Settings

- **Timeout**: 5000ms
- **Temperature**: 0.85 (creative but coherent)
- **Max tokens**: 100
- **Max concurrent**: 2 requests

## Usage in Game

### Creating a Dwarf

```javascript
import { createDwarf } from './sim/entities.js';

const dwarf = createDwarf(x, y);
// Immediately has fallback name/bio
// LLM generation happens async in background
```

### Listening for Generation

```javascript
import { on } from './events/eventBus.js';

on('dwarf:name_generated', ({ entity, name, bio, source }) => {
  console.log(`${name}: ${bio} (from ${source})`);
  // Update UI with new name/bio
});
```

### Checking Generation Status

```javascript
import { isNamePending, hasGeneratedName } from './llm/nameGenerator.js';

if (isNamePending(dwarf)) {
  // Show "generating..." indicator
}

if (hasGeneratedName(dwarf)) {
  // Show generated bio in inspection panel
}
```

## Emergent Features

### 1. Personality-Based Names
- Dwarves get names that reflect their actual personality traits
- "Urist the Wanderer" for curious dwarves
- "Kadol the Grim" for dour dwarves

### 2. Wry, Archaic Tone
- Bios use dwarven chronicler voice
- "Bends like granite, which is to say: not at all" (stubborn)
- "Expects disappointment and is rarely disappointed" (cynical)

### 3. World Awareness
- LLM prompt includes worldContext if available
- Potential for names/bios to reference colony events
- Example: "Recent arrival from deeper caverns"

### 4. Graceful Degradation
- If LLM unavailable: fallback to deterministic local generation
- Same personality traits used
- No visible gap - UX is seamless

## Performance

### Request Queuing

- Max 2 concurrent LLM requests
- Queue prevents server overload
- Typical response: ~500ms per dwarf

### Timing

- Created at dwarf spawn (background task)
- Never blocks main simulation loop
- UI updates when generation complete (events)

### Fallback Speed

- Sync fallback: <1ms
- Always immediate (no wait)
- Personality-based seeding ensures consistency

## Testing

### Check LLM Status

```javascript
import { isLLMAvailable, setLLMAvailable } from './llm/nameGenerator.js';

console.log(isLLMAvailable()); // true/false
setLLMAvailable(false); // Disable LLM, use fallback only
```

### Manual Generation

```javascript
import { requestNameBio, generateNameBioSync } from './llm/nameGenerator.js';

const dwarf = { id: 1, personality: { curiosity: 0.9, ... } };

// Sync fallback
const sync = generateNameBioSync(dwarf);
console.log(sync); // { name: "Urist the Wanderer", bio: "..." }

// Async LLM
const async = await requestNameBio(dwarf);
console.log(async); // { name: "...", bio: "..." }
```

## Future Enhancements

1. **Extended LLM Bios** - "More lore" button fetches longer write-up
2. **Item Naming** - Extend system to legendary items, buildings
3. **Place Naming** - Caverns, halls, dangerous zones get names
4. **Dynamic Bios** - Update bios when dwarves achieve milestones
5. **Relationship Narratives** - LLM generates how dwarves relate to each other
