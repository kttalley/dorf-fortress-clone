# Testing Guide — World Context Enhancements

## Quick Validation Checklist

### 1. **Biome Context Awareness**
**Test**: Ask the Game Assistant "Tell me about the current biome"
**Expected Response**:
- Includes biome name and description
- Shows climate breakdown (temperature %, moisture %, elevation %)
- Lists native resources (e.g., "permafrost, ice" for cold regions)
- References specific terrain characteristics

**Example**:
```
CONTEXT: The Mistywater Lowlands are a humid lowland region 
(45% temperature, 78% moisture, 22% elevation) known for 
aquatic life, fish, and reeds. This climate supports fishing 
and wetland harvesting but presents challenges for traditional farming.
```

### 2. **Scenario Awareness**
**Test**: Ask "What scenario am I playing?" or "What are my victory conditions?"
**Expected Response**:
- Scenario title
- Scenario description
- Specific victory conditions (1-5 goals)
- Difficulty level
- Terrain type

**Example**:
```
ANALYSIS: You're playing "Highland Settlement" (Harsh difficulty).
Your terrain is mountainous biome, and your victory conditions are:
1. Survive 100 days
2. Reach 10 dwarves
3. Construct a defensive wall
```

### 3. **Historical Context**
**Test**: Ask "What's the history of this world?" or "How do races relate to each other?"
**Expected Response**:
- World history summary (if available)
- Recent historical events (up to 5)
- Specific race relations (Allied, Friendly, Neutral, Hostile, Enemy)
- Directional affinity values

**Example**:
```
CONTEXT: In this world, Dwarves maintain Friendly relations with 
Humans (+8 affinity), neutral ties with Elves (0), and historical 
hostility with Goblins (-15). Recent events include the goblin 
ambush at tick 42 and human traders arrival at tick 67.
```

### 4. **Resource-Based Analysis**
**Test**: Ask "What resources are available in this region?" or "Why is food scarce?"
**Expected Response**:
- Native resources based on biome climate
- Resource scarcity explanations grounded in terrain
- Connections between climate and survival challenges

**Example**:
```
ANALYSIS: The arid plateau biome yields sand and stone but minimal 
organic resources. Native game is scarce (arid-dry climate), and 
fishing is impossible without proximity to rivers. This explains the 
severe food constraints in your colony.
```

### 5. **Scenario-Aware Advice**
**Test**: Ask "How is the colony doing?" or "What should I focus on?"
**Expected Response**:
- Analysis grounded in specific scenario parameters
- Consideration of victory conditions
- References to biome/climate challenges
- World history context (if applicable)

**Example**:
```
ANALYSIS: CONTEXT: Given your harsh-difficulty mountain scenario 
with victory condition "reach 15 dwarves", you're at 7/15 (47%). 
The thin air and cold climate limit natural food production. SUGGESTION: 
Prioritize farming infrastructure or establish trade with nearby humans 
to supplement the scant local resources.
```

## Data Flow Validation

### Check 1: Climate Data Storage
Open browser DevTools → Console
```javascript
// After game loads, check that biome has climate data:
// (This would require exposing state to console, but conceptually:)
state.map.biome.climate
// Should output: { avgTemperature: 0.45, avgMoisture: 0.72, avgElevation: 0.28 }
```

### Check 2: Resources Inference
```javascript
state.map.biome.resources
// Should output array like: ['aquatic life', 'fish', 'reeds', 'fertile soil', 'clay']
```

### Check 3: Scenario Context Flow
```javascript
currentScenario
// Should output: { title: "...", description: "...", parameters: {...}, victoryConditions: [...] }
```

## What Changed vs. What Stayed the Same

### Changed (✓ Enhanced)
- Game Assistant system prompt now references world-specific context
- `buildUserPrompt()` includes 6+ context sections (was 3)
- Biome object now stores climate and resources (was just name + description)
- `askGame()` accepts scenario context parameter (new)
- `initGameAssistant()` accepts scenario context parameter (new)

### Stayed the Same (✓ Preserved)
- Fallback responses (no LLM) work identically
- Colony state compression and rendering unaffected
- Dwarf/visitor behaviors unchanged
- Combat, hunger, movement systems unaffected
- Map generation logic unchanged (only metadata storage added)
- UI layout and styling preserved

## Performance Impact

- **Negligible**: Climate and resource data computed once at map generation
- **No runtime cost**: Context passed as parameters, not computed per-tick
- **Prompt size increase**: ~200-400 additional tokens per query (acceptable)
- **LLM latency**: Unaffected (same generation parameters)

## Known Limitations & Future Work

### Current Limitations
1. **Dwarf AI Unaware**: Dwarves don't reference world context in their thoughts (yet)
2. **Visitor AI Unaware**: Visitors don't consider race relations or scenario (yet)
3. **Name Generation Unaware**: Dwarf names aren't themed to scenario/biome (yet)
4. **Static Resources**: Resource list inferred once at biome creation (not dynamic)
5. **No Deep History**: World history is shallow unless LLM generates detailed events

### Planned Enhancements
- [ ] Pass world context to `dwarfAI.js` for scenario-aware thoughts
- [ ] Pass race relations to `visitorAI.js` for historically-grounded behaviors
- [ ] Integrate biome/scenario into dwarf name generation
- [ ] Generate richer world history narratives
- [ ] Update event log to reference biome/scenario context
- [ ] Create post-run analysis that contextualizes entire run within scenario

## Testing Recommendations

1. **Generate multiple worlds** with different terrains/difficulties
2. **Ask overlapping questions** ("Tell me about the biome" then "What resources...?")
3. **Check consistency** — same question should reference same facts
4. **Compare with fallback** — ask questions when LLM is unavailable (should still work)
5. **Inspect prompts** — enable debug logging to see full context sent to LLM

## Debug Logging

To see full prompts being sent to LLM:
1. Open `src/llm/gameAssistant.js`
2. Before `queueGeneration()`, add: `console.log('[GameAssistant] Full prompt:', fullPrompt);`
3. Open DevTools → Console
4. Ask a question and inspect the logged prompt

Example output will show complete scenario + world + history context.
