
# Dorf Fortress Clone

**An emergent, agent-based simulation inspired by Dwarf Fortress, powered by deterministic systems and self-hosted LLM cognition**

---

## Overview

This project is a **browser-based, agent-driven simulation** inspired by *Dwarf Fortress* and *RimWorld*, built as an experiment in **emergent behavior, social simulation, and LLM-assisted cognition**.

Rather than using large language models to *replace* game logic or narrate outcomes, this project treats LLMs as **bounded cognitive layers** inside a deterministic world:

> The simulation is authoritative.
> The agents reason about it.

Each dwarf exists as an autonomous entity with:

* needs (hunger, fulfillment, survival)
* traits and skills
* internal thoughts
* social interactions
* imperfect, local knowledge of the world

The result is a system where **stories emerge from mechanics**, not scripts.

---

## Design Philosophy

### 1. Simulation First, LLM Second

The world runs independently of any language model.

* Movement, hunger, resources, time, and physics are **fully deterministic**
* The simulation advances on discrete ticks
* Agents must obey world constraints

LLMs are used **only** for:

* internal thought generation
* subjective interpretation
* social expression (speech, opinions, reactions)
* name and biography generation
* biome naming and color theming

They cannot:

* spawn resources
* override rules
* teleport agents
* resolve conflicts magically

If the LLM fails or is disabled, the simulation still runs with local fallbacks.

---

### 2. Agents, Not Chatbots

Dwarves are **agents**, not conversational NPCs.

Each agent operates in a task-driven cognitive loop:

```
sense → evaluate priorities → select task → execute → reflect
```

* *Sense*: observe local world state (nearby entities, food, threats)
* *Evaluate*: score candidate tasks by priority (hunger, social needs, work)
* *Select*: pick highest-priority task
* *Execute*: perform allowed actions (move, eat, work, socialize)
* *Reflect*: update internal state and relationships

This loop is intentionally imperfect and lossy—agents misunderstand, forget, and behave inconsistently.

---

### 3. Emergence Over Authoring

No stories are written in advance.

* There are no scripted quests
* No predefined personalities
* No forced narrative arcs

Instead:

* small rules interact
* agents collide socially
* meaning emerges from constraint

This mirrors the design ethos of classic simulation games and agent-based modeling.

---

### 4. Local, Self-Hosted AI

All LLM functionality runs through a **self-hosted Ollama server**.

There are:

* no cloud dependencies
* no required third-party APIs
* no external data sharing

This keeps the system:

* fast
* private
* hackable
* deterministic at the simulation layer

LLMs are treated as **replaceable components**, not hard dependencies.

---

## Features

* **LLM-assisted cognition** (thoughts, speech, interpretation)
* **Autonomous dwarf agents** with traits, skills, and needs
* **Hunger and survival systems** driven by world state
* **Procedurally generated maps and biomes** (noise-based terrain, cellular automata caves)
* **Deterministic simulation loop**
* **Social interactions and conversations**
* **External visitors** (humans, goblins, elves with trade/raid behaviors)
* **World history generation** with race relations
* **Experimental / research-friendly architecture**
* **Runs entirely in the browser**

---

## Tech Stack

* **JavaScript (ES Modules)**
* **Vite** for development and bundling
* **HTML / CSS Grid** for ASCII rendering
* **Ollama** for local LLM inference
* No frameworks, no engines, minimal abstraction

---

## Architecture Overview

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER CLIENT                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Renderer   │    │   Widgets    │    │    Event Bus         │  │
│  │  (ASCII Grid)│    │ (UI Panels)  │    │  (Pub/Sub System)    │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │               │
│         └───────────────────┼───────────────────────┘               │
│                             │                                        │
│                    ┌────────▼────────┐                              │
│                    │   World State   │                              │
│                    │  (Single Source │                              │
│                    │   of Truth)     │                              │
│                    └────────┬────────┘                              │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         │                   │                   │                   │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐            │
│  │  Simulation │    │   AI/Agent  │    │   Thought   │            │
│  │    Loop     │    │   Decision  │    │   System    │            │
│  │  (tick.js)  │    │  (dwarfAI)  │    │ (thoughts)  │            │
│  └──────┬──────┘    └─────────────┘    └──────┬──────┘            │
│         │                                      │                    │
│         │                              ┌───────▼───────┐           │
│         │                              │  LLM Client   │───────────┼──► Ollama Server
│         │                              │  (Async Queue)│           │
│         │                              └───────────────┘           │
│         │                                                           │
│  ┌──────▼──────────────────────────────────────────────────┐       │
│  │                    Map Generation                        │       │
│  │  (Noise, Cellular Automata, Biome Classification)       │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
src/
├── ai/                    # Agent cognition and LLM integration
│   ├── dwarfAI.js         # Decision-making, task selection
│   ├── thoughts.js        # Event-driven thought generation
│   ├── llmClient.js       # Ollama API, request queue
│   └── visitorAI.js       # External visitor behaviors
│
├── llm/                   # LLM-specific generators
│   ├── nameGenerator.js   # Dwarf names and biographies
│   ├── biomeGenerator.js  # Biome names and color modifiers
│   ├── entityChat.js      # Player-to-entity conversations
│   ├── gameAssistant.js   # "Ask the Game" feature
│   └── prompts/           # LLM prompt templates
│
├── sim/                   # Core simulation systems
│   ├── world.js           # Main tick loop, system orchestration
│   ├── entities.js        # Dwarf/food/visitor creation
│   ├── movement.js        # Pathfinding, scent-following
│   ├── combat.js          # Combat resolution
│   ├── tasks.js           # Task types and management
│   ├── construction.js    # Building and digging
│   └── visitorSpawner.js  # External force generation
│
├── map/                   # Procedural generation
│   ├── map.js             # Map creation, tile management
│   ├── noise.js           # Simplex, FBM, ridged noise
│   ├── biomes.js          # Biome classification
│   └── tiles.js           # Tile definitions, colors
│
├── ui/                    # Rendering and interface
│   ├── renderer.js        # CSS Grid ASCII renderer
│   ├── statPanel.js       # Entity inspection panel
│   ├── speechBubble.js    # Floating thoughts/speech
│   ├── biomeWidgets.js    # Title and event log
│   ├── controlsWidget.js  # Play/pause/speed controls
│   └── gameAssistantPanel.js # Chat interface
│
├── state/                 # State management
│   └── store.js           # World state schema
│
└── events/                # Communication
    └── eventBus.js        # Pub/sub event system

styles/                    # CSS
index.html                 # Entry point
main.js                    # Initialization and game loop
```

---

## Simulation Flow

### Main Tick Loop

The simulation advances through discrete ticks, with each tick executing systems in a deterministic order:

```
┌─────────────────────────────────────────────────────────┐
│                    TICK EXECUTION                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. SCENT UPDATE                                         │
│     └─ Decay existing scents, emit food scents           │
│                                                          │
│  2. HUNGER PROCESSING                                    │
│     └─ Increase hunger, emit threshold events            │
│                                                          │
│  3. DECISION PHASE (per dwarf)                          │
│     ├─ Check combat threats → respond if needed          │
│     ├─ Check critical hunger → seek food                 │
│     ├─ Evaluate task priorities                          │
│     └─ Select highest-priority task                      │
│                                                          │
│  4. ACTION PHASE (per dwarf)                            │
│     └─ Execute movement, eating, working, socializing    │
│                                                          │
│  5. VISITOR PROCESSING                                   │
│     └─ Update trader/raider behaviors                    │
│                                                          │
│  6. COMBAT RESOLUTION                                    │
│     └─ Resolve attacks, apply damage                     │
│                                                          │
│  7. DEATH PROCESSING                                     │
│     └─ Remove dead entities, emit events                 │
│                                                          │
│  8. RESOURCE UPDATES                                     │
│     ├─ Food production at farms                          │
│     └─ Random food spawning                              │
│                                                          │
│  9. VISITOR SPAWNING                                     │
│     └─ Maybe spawn traders/raiders based on relations    │
│                                                          │
│  10. MOOD DETECTION                                      │
│      └─ Emit events for significant mood changes         │
│                                                          │
│  11. EMIT TICK EVENT                                     │
│      └─ Notify all subscribers                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation**: `src/sim/world.js` → `tick()` function

---

## Agent Architecture

### Dwarf Decision System

Dwarves use a **priority-based task selection** system, not a behavior tree or state machine:

```
┌─────────────────────────────────────────────────────────┐
│                 DECISION FLOW                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐                                   │
│  │ Combat Threat?   │──YES──► decideCombatResponse()    │
│  └────────┬─────────┘                                   │
│           │ NO                                           │
│  ┌────────▼─────────┐                                   │
│  │ Hunger > 85?     │──YES──► decideCritical() [food]   │
│  └────────┬─────────┘                                   │
│           │ NO                                           │
│  ┌────────▼─────────┐                                   │
│  │ Has Active Task? │──YES──► Continue (if < 20 ticks)  │
│  └────────┬─────────┘                                   │
│           │ NO                                           │
│  ┌────────▼─────────┐                                   │
│  │  findNewTask()   │                                   │
│  │                  │                                   │
│  │  Evaluate:       │                                   │
│  │  - Hunger need   │ Priority 60+                      │
│  │  - Social need   │ Priority 50+                      │
│  │  - Aspiration    │ Priority 55+                      │
│  │  - Exploration   │ Priority 45+                      │
│  │  - Available work│ Priority 40-45                    │
│  │  - Idle fallback │ Priority 10                       │
│  │                  │                                   │
│  │  → Pick highest  │                                   │
│  └──────────────────┘                                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation**: `src/ai/dwarfAI.js` → `decide()` and `findNewTask()` functions

### Dwarf States

```
IDLE, WANDERING, SEEKING_FOOD, EATING,
SEEKING_SOCIAL, SOCIALIZING, EXPLORING,
WORKING_DIG, WORKING_BUILD, WORKING_CRAFT,
HAULING, FIGHTING, FLEEING_COMBAT
```

### Entity Schema

Each dwarf contains:

```javascript
{
  // Identity
  id, name, generatedName,

  // Position
  x, y, state, target,

  // Vitals
  hunger: 0-95,
  mood: 0-100,
  hp, maxHp,

  // Personality (0-1 traits)
  personality: {
    curiosity, friendliness, bravery, humor,
    melancholy, patience, creativity, loyalty,
    stubbornness, optimism
  },

  // Skills (0-1 proficiency)
  skills: { mining, masonry, crafting, cooking, combat, ... },

  // Psychology
  aspiration: enum,
  fulfillment: { social, exploration, creativity, tranquility },

  // Social
  relationships: {
    [dwarfId]: { affinity, interactions, conversationLog }
  },

  // Memory
  memory: { visitedAreas, events, conversations },

  // Current state
  currentTask, currentThought, lastThoughtTick
}
```

---

## LLM Integration

### Integration Points

The LLM is called in **5 specific places**, all outside the main tick loop:

```
┌─────────────────────────────────────────────────────────┐
│              LLM INTEGRATION POINTS                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. THOUGHT GENERATION (src/ai/thoughts.js)             │
│     ├─ Trigger: Meeting, food found, hunger, mood       │
│     ├─ Async, non-blocking                              │
│     └─ Fallback: Generic thought templates              │
│                                                          │
│  2. SPEECH GENERATION (src/ai/thoughts.js)              │
│     ├─ Trigger: Social interaction with another dwarf   │
│     ├─ Context: Relationship history, current thought   │
│     └─ Fallback: Scripted phrases                       │
│                                                          │
│  3. NAME/BIO GENERATION (src/llm/nameGenerator.js)      │
│     ├─ Trigger: World initialization                    │
│     ├─ Batch generation for all dwarves                 │
│     └─ Fallback: Local name pool                        │
│                                                          │
│  4. BIOME NAMING (src/llm/biomeGenerator.js)            │
│     ├─ Trigger: Map generation                          │
│     ├─ Input: Climate parameters                        │
│     └─ Fallback: 27 preset biome names                  │
│                                                          │
│  5. GAME ASSISTANT (src/llm/gameAssistant.js)           │
│     ├─ Trigger: Player query via UI                     │
│     └─ Optional feature, not part of simulation         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Hard Constraints

* **No LLM calls inside `tick()` loop**
* LLMs only suggest actions, never mutate state directly
* All systems degrade gracefully with local fallbacks
* Request queue limits concurrent calls (max 10)

### LLM Client Architecture

```
src/ai/llmClient.js
├─ Server: Ollama API (configurable endpoint)
├─ Model: llama3.1-claude or any Ollama-compatible
├─ Queue: Async, non-blocking, rate-limited
└─ Functions:
   ├─ queueGeneration(prompt, options)
   ├─ checkConnection()
   └─ checkLLMHealth()
```

---

## Event System

### Event-Driven Architecture

The simulation uses a **pub/sub event bus** for loose coupling between systems:

```javascript
// src/events/eventBus.js

// Subscribe
const unsubscribe = on(EVENTS.FOOD_FOUND, (payload) => { ... });

// Emit
emit(EVENTS.FOOD_FOUND, { dwarf, food });
```

### Event Types

**Social Events** (trigger LLM thoughts):
- `DWARF_MEETING` - Two dwarves within 4 tiles
- `DWARF_PARTING` - Dwarves move apart

**Discovery Events**:
- `FOOD_FOUND` - Dwarf finds food source
- `FOOD_DEPLETED` - Food source exhausted
- `NEW_TERRAIN` - Dwarf enters different biome

**State Change Events**:
- `HUNGER_THRESHOLD` - Hunger crosses 40/60/80
- `MOOD_SHIFT` - Mood changes > 15 points

**World Events**:
- `DWARF_DEATH`, `DWARF_SPAWN`
- `VISITOR_ARRIVED`, `VISITOR_LEAVING`
- `COMBAT_HIT`, `COMBAT_MISS`, `COMBAT_FLEE`
- `TICK` - Every simulation tick

---

## Map Generation

### Three Generation Modes

1. **Biome Map** (default)
   - Perlin/Simplex noise for elevation, moisture, temperature
   - River generation via pathfinding
   - Biome classification determines tile types

2. **Mixed Map**
   - Hybrid surface/underground
   - Cellular automata caves with surface skylights

3. **Cave Map**
   - Pure cellular automata (4-5 smoothing rule)
   - Mushroom groves and water pools

### Noise System

```
src/map/noise.js
├─ Simplex Noise    - Base terrain variation
├─ FBM              - Multi-octave detail
├─ Ridged Noise     - Mountain peaks
└─ Warped Noise     - Organic distortion
```

### Biome Color Modifiers

Each biome can shift tile colors via HSL adjustments:
- `hue`: -30 to +30 (blue shift for cold, orange for hot)
- `saturation`: -30 to +30 (desaturated for dry, vivid for wet)
- `brightness`: -30 to +30 (darker for forests, brighter for deserts)

---

## Rendering

### ASCII Renderer

The renderer uses **CSS Grid** with one `<span>` per map cell:

```
src/ui/renderer.js
├─ createRenderer(container, width, height)
├─ render(map, entities)        # Dirty-checked updates
├─ buildRenderEntities(state)   # Extract visible objects
└─ scrollToDwarves(dwarves)     # Center view on dwarves
```

### Entity Glyphs

| Entity | Glyph | Color |
|--------|-------|-------|
| Dwarf (healthy) | `🧌` | Yellow |
| Dwarf (hungry) | `🧌` | Orange |
| Dwarf (starving) | `🧌` | Red |
| Food | `%` | Green |
| Human | `🧙‍♂️` | Tan |
| Goblin | `👹` | Green |
| Elf | `🧝🏻‍♀️` | Blue |

### UI Widgets

- **Stat Panel** - Entity inspection on click
- **Speech Bubbles** - Floating above speaking dwarves
- **Thought Sidebar** - Recent dwarf thoughts
- **Event Log** - World events
- **Biome Title** - Map name with color theming
- **Controls** - Pause, speed, regenerate
- **Game Assistant** - "Ask the Game" chat panel

---

## LLM & Ollama Configuration

This project assumes a **locally running Ollama server**.

### Example setup

```bash
ollama serve
```

Configure the project to point at your server:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

Or update `src/ai/llmClient.js` to match your setup.

### Tested models

* Devstral / Mistral variants
* Qwen coder models
* Llama 3.1 variants
* Any Ollama-compatible text model should work

The system is model-agnostic by design.

---

## Running the Project

```bash
npm install
npm run dev
```

Then open the local Vite server in your browser.

---

## Non-Goals

This project is **not** trying to be:

* a complete Dwarf Fortress clone
* a production-ready game
* a monetized product
* an LLM demo app

It *is* trying to be:

* a serious simulation experiment
* a playground for agent cognition
* a foundation for emergent narrative systems

---

## Contributing

This is an experimental, exploratory project.

If you want to contribute:

* open issues with ideas or questions
* submit PRs that respect the simulation-first philosophy
* avoid adding features that turn LLMs into authority figures

Thoughtful chaos is welcome.

---

## License

No license specified.
All rights reserved by the author unless otherwise noted.

---

## Inspiration & Influences

* *Dwarf Fortress* — emergent narrative through constraint
* *RimWorld* — agent-driven storytelling
* *Conway's Game of Life*
* Artificial life simulations
* Systems-first game design

---

## Author

**Kristian Talley**
Built as an exploration of simulation, cognition, and emergent systems.

