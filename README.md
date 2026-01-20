
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

They cannot:

* spawn resources
* override rules
* teleport agents
* resolve conflicts magically

If the LLM fails or is disabled, the simulation still runs.

---

### 2. Agents, Not Chatbots

Dwarves are **agents**, not conversational NPCs.

Each agent operates in a loose cognitive loop:

```
sense → interpret → decide → act → reflect
```

* *Sense*: observe local world state
* *Interpret*: form subjective understanding (LLM-assisted)
* *Decide*: choose goals or priorities
* *Act*: perform allowed actions
* *Reflect*: update internal state and memory

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

* 🧠 **LLM-assisted cognition** (thoughts, speech, interpretation)
* ⛏️ **Autonomous dwarf agents** with traits, skills, and needs
* 🍖 **Hunger and survival systems** driven by world state
* 🗺️ **Procedurally generated maps and biomes**
* 🧱 **Deterministic simulation loop**
* 💬 **Social interactions and conversations**
* 🧪 **Experimental / research-friendly architecture**
* 🖥️ **Runs entirely in the browser**

---

## Tech Stack

* **JavaScript (ES Modules)**
* **Vite** for development and bundling
* **HTML / CSS** for rendering
* **Ollama** for local LLM inference
* No frameworks, no engines, minimal abstraction

---

## Project Structure

```
src/
  ai/              # Thought systems, cognition, LLM hooks
  map/             # World and biome generation
  sim/             # Simulation loop, entities, rules
  ui/              # Renderer, UI panels, logs, cursor
  state/           # World state management
styles/            # CSS
index.html         # Entry point

AGENTS.md          # Agent system notes
CLAUDE.md          # LLM experimentation notes
LLM_*              # LLM usage guides and references
```

The structure intentionally mirrors a **simulation engine**, not a typical web app.

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

Or update the relevant config file in the codebase to match your setup
(e.g. `http://llm.yourdomain.com:11434`).

### Tested models

* Devstral / Mistral variants
* Qwen coder models
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


