# World Context Improvements — Game Assistant & Entity Awareness

## Overview
Enhanced the "Chat with Game Engine" feature (Game Assistant) and broader entity awareness to reference the specific world, scenario, biome, climate, and history that generated them. This creates richer contextual understanding across all LLM interactions.

## Key Changes

### 1. **Enriched Biome Context Storage** (`src/map/map.js`)
- **Climate Data Now Persistent**: The `map.biome` object now stores detailed climate characteristics:
  - `avgTemperature` (0–1 scale: cold → temperate → hot)
  - `avgMoisture` (0–1 scale: arid → moderate → humid)
  - `avgElevation` (0–1 scale: lowland → mid → highland)
- **Inferred Native Resources**: New `inferBiomeResources()` function generates thematic resource lists based on climate:
  - Cold regions: permafrost, ice
  - Hot regions: volcanic minerals, sulfur
  - Wet regions: aquatic life, fish, reeds
  - Dry regions: sand, stone
  - High elevation: mountain stone, gems, ore veins
  - Low elevation: fertile soil, clay
- **Cave Biome Resources**: Underground presets now include default resources and climate data

### 2. **Enhanced Game Assistant System Prompt** (`src/llm/prompts/gameAssistant.js`)
**New System Instructions**:
- Analysts now understand they have "deep awareness of this specific world's scenario, biome, climate, history, and inter-race relations"
- Extended instructions to reference:
  - Specific scenario (name, victory conditions, difficulty)
  - Biome characteristics (climate, resources, elevation)
  - Historical events and race relations
  - External threats within world context
- Added new response prefixes:
  - `"CONTEXT:"` for explaining world/scenario factors
  - `"SUGGESTION:"` refined for non-command insights

### 3. **Richer User Prompt with World Context** (`src/llm/prompts/gameAssistant.js`)
**Enhanced `buildUserPrompt()` now includes**:

**Scenario Context Section**:
- Scenario title and description
- Victory conditions (player-facing goals)
- Difficulty level and terrain type
- Biome emphasis (mountain, forest, marsh, desert, etc.)

**Expanded World Context Section**:
- Biome name and description
- Climate breakdown (temperature, moisture, elevation with percentages)
- Native resources list

**Comprehensive History Section**:
- World history summary (if available)
- Recent historical events (up to 5 most recent)
- Inter-race relations with directional labels:
  - `Ally` (>10), `Friendly` (>0), `Neutral` (=0), `Hostile` (<0), `Enemy` (<-10)

**Enhanced External Entities**:
- Visitor state information
- Better formatting for readability

### 4. **Scenario Context Flow** (`src/llm/gameAssistant.js`)
**Updated `askGame()` function**:
- Now accepts `scenarioContext` parameter (new 4th parameter)
- Builds rich `worldContext` object including:
  ```javascript
  {
    biome: { name, description, climate, resources },
    history: { summary, events, raceRelations },
    visitors: [{ race, group, purpose, state }],
    scenario: { title, description, parameters, victoryConditions }
  }
  ```
- Passes all context to `buildUserPrompt()`

### 5. **UI Integration** (`src/ui/gameAssistantPanel.js`)
**Updated `initGameAssistant()` function**:
- Now accepts `scenarioContext` parameter
- Stores and passes scenario to every `askGame()` call
- Full scenario data flows through to LLM prompts

### 6. **Main Loop Integration** (`src/main.js`)
**Scenario context passed to Game Assistant**:
```javascript
gameAssistant = initGameAssistant(mapContainer, () => state, currentScenario);
```
- Ensures every player question includes scenario/world/history context
- LLM aware of unique run characteristics from generation

## Expected Behavior Changes

### Before
- Game Assistant knew colony state but not world context
- Responses referenced generic "colony" without grounding in specific scenario
- Biome was just a name without climate/resource context
- History/race relations were available but never referenced

### After
- **Contextual Responses**: "In this harsh mountain scenario with scarce food, Urist's mood decline reflects the region's natural hardships"
- **World-Aware Analysis**: References specific biome (e.g., "Mistywater Lowlands are humid and low-elevation, supporting aquatic resources")
- **Historical Grounding**: "Given recent goblin attacks (based on race relations), the colony's caution is justified"
- **Scenario-Aligned Goals**: "Your victory condition is reaching 15 dwarves; current population is 8, so recruitment is critical"
- **Resource Context**: "The frozen region typically yields ice and permafrost resources, not traditional farmland"

## Example Questions Now Better Handled

1. **"Tell me about this world's biome"**
   - Returns: Name, climate characteristics, native resources, elevation/temperature/moisture breakdown

2. **"How do the local races view us?"**
   - Returns: Specific race relations with directional labels, historical context

3. **"What's this scenario about?"**
   - Returns: Title, description, victory conditions, difficulty, terrain type

4. **"Why are dwarves struggling?"**
   - Returns: Analysis grounded in specific scenario hardship, biome resources, and world history

5. **"What external threats should I expect?"**
   - Returns: Nearby races based on world history and current relations, potential visitor patterns

## Technical Details

### Data Flow
```
generateScenario() → currentScenario
           ↓
    initGameAssistant(..., currentScenario)
           ↓
      askGame(..., scenarioContext)
           ↓
  buildUserPrompt(..., worldContext)
           ↓
  SYSTEM_PROMPT + enriched prompt → LLM
```

### Climate Calculations
Climate data calculated once during map generation:
- Uses `calculateMapClimate()` from `src/map/biomes.js`
- Stored in `map.biome.climate`
- Passed through world state to Game Assistant

### Resource Inference
Resources inferred deterministically from climate values:
- Same biome always yields same resource list (deterministic)
- Thematic and ecologically consistent
- Used only for context (no game mechanics impact)

## Files Modified

1. **src/llm/prompts/gameAssistant.js**
   - Enhanced system prompt with contextual awareness instructions
   - Completely redesigned `buildUserPrompt()` with 6 major sections
   - Updated example questions to reflect new capabilities

2. **src/llm/gameAssistant.js**
   - Updated `askGame()` signature to accept `scenarioContext`
   - Enhanced world context collection with climate, resources, and scenario data

3. **src/ui/gameAssistantPanel.js**
   - Updated `initGameAssistant()` to accept and store `scenarioContext`
   - Passes scenario to every `askGame()` call

4. **src/main.js**
   - Passes `currentScenario` to `initGameAssistant()`
   - Scenario flows through entire LLM chain

5. **src/map/map.js**
   - Added `inferBiomeResources()` helper function
   - Enhanced `addBiomeToMap()` to store climate and resources
   - Updated cave biome presets with climate defaults and resources

## Next Steps for Further Enhancement

1. **Dwarf AI Context**: Pass scenario and world context to `dwarfAI.js` for more contextual thoughts
2. **Visitor AI Context**: Make visitors aware of race relations and scenario parameters
3. **Name Generation**: Pass scenario/world context to dwarf name generator for thematic naming
4. **History Narrative**: Generate more detailed world history narratives tied to biome/scenario
5. **Event Log**: Update event log to reference biome/scenario context
6. **Analysis Autopsy**: Pass full world context to post-run analysis for better insights

## Design Philosophy

- **Simulation First**: Climate data comes from actual terrain, not authored
- **Emergence Over Scripts**: Resources and world personality emerge from generation, not hardcoded
- **LLM as Analyst**: LLM contextualizes rather than generates world facts
- **Read-Only**: Game Assistant remains non-prescriptive and analytical
- **Graceful Fallback**: Works with or without LLM (fallback heuristics unchanged)
