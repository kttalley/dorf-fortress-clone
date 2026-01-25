# Game Assistant Improvements

## Overview

The "Chat with Game Engine" feature has been significantly enhanced to provide a richer, more context-aware conversational experience. Users can now ask about colony state, world context, AND the project's technical architecture.

---

## Key Improvements

### 1. **Enhanced System Prompt with Project Context**

**File:** [src/llm/prompts/gameAssistant.js](src/llm/prompts/gameAssistant.js)

The system prompt now includes two major sections:

#### Core System Rules
- Maintained strict read-only analyst role
- Refined capabilities to include "spatial relationships and world geography"
- Clear restrictions on game commands and state mutation

#### Project Context Section
A new `PROJECT_CONTEXT` constant provides the LLM with knowledge of:

- **Design Philosophy:**
  - Simulation-first approach (LLMs provide cognition only)
  - Agents vs. chatbots (sense→evaluate→select→execute→reflect loops)
  - Emergence over authoring (stories from mechanics)
  - Local, self-hosted AI with Ollama

- **Key Architecture Components:**
  - Simulation Loop (11-step tick system)
  - World State (single source of truth)
  - Rendering (CSS Grid ASCII, dirty-checked)
  - AI/Cognition (event-driven thought system)
  - Pathfinding (scent-based algorithm)
  - Generation (noise, cellular automata, biomes)

- **World Systems:**
  - Multiple races (dwarf, human, goblin, elf) with distinct behaviors
  - Food production and hunger mechanics
  - Social systems (relationships, affinity, fulfillment)
  - External visitors (traders, raiders)
  - World history generation
  - Combat and resource management

- **Tech Stack:**
  - JavaScript (ES Modules), Vite, HTML/CSS Grid, Ollama

### 2. **World Context Integration**

**Files:** 
- [src/llm/prompts/gameAssistant.js](src/llm/prompts/gameAssistant.js#L83-L146)
- [src/llm/gameAssistant.js](src/llm/gameAssistant.js#L23-L50)

The `buildUserPrompt` function now accepts a `worldContext` parameter with:

#### Biome Information
```javascript
{
  name: "Biome name (e.g., 'The Golden Thickets')",
  description: "Biome description/characteristics"
}
```

#### World History
```javascript
{
  events: [/* array of historical events */],
  raceRelations: {
    dwarf_human: number,
    dwarf_goblin: number,
    dwarf_elf: number
  }
}
```

#### External Entities
```javascript
visitors: [
  { race: "human", group: "merchants", purpose: "trade" },
  // ... up to 5 visitors
]
```

#### Context Sections Added to Prompt
- `## WORLD CONTEXT` - Biome name and description
- `## WORLD HISTORY` - Recent historical events (last 3)
- `## RACE RELATIONS` - Diplomatic standing with other races
- `## EXTERNAL ENTITIES` - Current visitors and their purposes

### 3. **Updated Example Questions**

**File:** [src/llm/prompts/gameAssistant.js](src/llm/prompts/gameAssistant.js#L148-L159)

New examples showcase expanded capabilities:

```javascript
// Colony analysis
"Who has the lowest mood and why?"
"What's the food situation?"

// World context
"Tell me about the current biome"
"What's the history of this world?"
"What's the relationship with humans?"

// Architecture/design
"How does the simulation work?"
"What races exist and how do they behave?"
"Can you explain the world generation?"
```

### 4. **Enhanced Info Modal**

**File:** [src/ui/gameAssistantPanel.js](src/ui/gameAssistantPanel.js#L183-L235)

The info panel now clearly describes three major capability areas:

#### 📊 Colony Analysis
- Analyzes fortress state and dwarf dynamics
- Identifies trends and issues

#### 🌍 World Context
- Understands biomes, world history, and historical events
- Aware of inter-racial relations (dwarves, humans, goblins, elves)

#### 🏗️ Architecture & Design
- Explains simulation mechanics and design philosophy
- Discusses tech stack and implementation
- Describes world generation systems

Also updated footer text to include project inspirations and approach.

---

## Usage Examples

### User Questions Now Supported

**Before:**
- "Who has the lowest mood?"
- "What's the food situation?"

**After (all of the above PLUS):**
- "Tell me about this biome" → Gets biome name and characteristics
- "What's our history with goblins?" → Gets race relations from world history
- "How does the simulation work?" → Gets detailed architecture explanation
- "What races exist?" → Gets complete race system explanation
- "Can you explain the procedural generation?" → Gets generation system details

### World Context Flow

```
askGame(question, world)
  ↓
Extract worldContext:
  - world.map.biome → biome info
  - world.history → historical events & race relations
  - world.visitors → current external entities
  ↓
buildUserPrompt(summary, question, history, worldContext)
  ↓
Includes all context sections in LLM prompt
  ↓
LLM responds with enhanced understanding
```

---

## Implementation Details

### Changes to `askGame()` [src/llm/gameAssistant.js]

```javascript
// NEW: Extract world context
const worldContext = {
  biome: world.map?.biome ? { name, description } : null,
  history: world.history ? { events, raceRelations } : null,
  visitors: world.visitors?.map(v => ({ race, group, purpose })).slice(0, 5) || [],
};

// UPDATED: Pass context to buildUserPrompt
const userPrompt = buildUserPrompt(
  worldSummary, 
  question, 
  activeHistory, 
  worldContext  // NEW parameter
);
```

### Backward Compatibility

- `buildUserPrompt` signature is backward compatible (worldContext defaults to `{}`)
- Prompt gracefully handles missing context sections
- Existing fallback responses unchanged
- All changes are additive (no breaking modifications)

---

## What Users Can Now Ask

### Colony & Dwarf Analysis
✓ Mood trends and fulfillment analysis
✓ Food resource planning
✓ Relationship dynamics
✓ Individual dwarf behavior explanation

### World & Lore
✓ Biome characteristics and generation
✓ World history and significant events
✓ Diplomatic relations with races
✓ External visitor motivations

### Technical & Design
✓ How the simulation engine works
✓ Design philosophy and inspirations
✓ Race systems and behaviors
✓ World generation algorithms
✓ Tech stack and architecture
✓ Emergent gameplay mechanics

---

## What Remains Restricted

✗ Game commands ("move dwarf", "assign job")
✗ State modification suggestions
✗ Gameplay advice beyond analysis
✗ Authoring game narratives

The LLM remains a read-only analyst focused on explanation and analysis.
