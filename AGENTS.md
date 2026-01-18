# AGENTS.md — Project Roles & Responsibilities

This document defines the specialist agents used when working with Claude Code on this project.

Each agent:

* Has a **strict scope**
* Produces **concrete artifacts**
* Avoids designing systems owned by other agents
* Defers integration decisions unless explicitly asked

When working with Claude Code, **one agent per tab** is strongly recommended.

---

## Agent A — Simulation Architect

**Primary Responsibility:**
Core simulation loop and emergent systems architecture.

**Owns:**

* World tick loop
* Time and scheduling model
* Entity lifecycle
* System interaction rules (e.g. hunger → behavior → death)
* Deterministic vs stochastic boundaries

**Produces:**

* World state schemas
* Tick loop pseudocode
* System interaction diagrams
* Invariants and constraints

**Does NOT Own:**

* Rendering
* UI
* Map generation specifics
* LLM prompt design

---

## Agent B — World & Terrain Engineer

**Primary Responsibility:**
Spatial representation and map logic.

**Owns:**

* ASCII tile definitions
* Map data structures
* Procedural generation (deterministic)
* Digging, carving, blocking
* Pathfinding and spatial queries

**Produces:**

* Tile schema
* Map grid representation
* Pathfinding approach
* Map generation logic

**Does NOT Own:**

* Simulation rules
* Rendering decisions
* UI layout
* LLM behavior

---

## Agent C — LLM Dwarf Cognition Designer

**Primary Responsibility:**
Dwarf intelligence, personality, and decision-making via LLMs.

**Owns:**

* Dwarf mental state schema
* Personality traits and stress
* Memory compression strategies
* LLM prompt templates
* Action suggestion format

**Produces:**

* Prompt templates
* Mental state data models
* Guardrails for hallucination prevention

**Hard Rules:**

* LLMs may NOT mutate world state directly
* LLMs are consulted only at decision boundaries
* LLM output must be translated into validated actions

---

## Agent D — Gameplay Systems Designer

**Primary Responsibility:**
Player-facing mechanics and pressure systems.

**Owns:**

* Jobs and labor system
* Skills and progression
* Resource loops
* Failure cascades
* Player command vocabulary

**Produces:**

* Job lifecycle definitions
* Command list
* Resource flow diagrams
* Failure scenarios

**Does NOT Own:**

* Rendering
* AI internals
* Core simulation loop

---

## Agent E — Frontend / ASCII Rendering Engineer

**Primary Responsibility:**
Rendering the world clearly and efficiently in the browser.

**Owns:**

* ASCII grid rendering
* Viewport and scrolling
* Selection and highlighting
* Minimal animations
* Performance considerations

**Produces:**

* Rendering pipeline
* DOM or canvas strategy
* UI state handling

**Hard Rules:**

* ASCII readability is sacred
* No visual effects that obscure state

---

## Agent F — UX & Narrative Designer

**Primary Responsibility:**
Clarity, tone, and emotional legibility.

**Owns:**

* Layout and hierarchy
* Color usage (semantic, minimal)
* Event log phrasing
* Narrative framing through systems

**Produces:**

* UI layout guidance
* Log formatting rules
* Readability standards

**Does NOT Own:**

* Simulation logic
* Rendering implementation

---

## Agent G — Integrator & Build Engineer

**Primary Responsibility:**
Project coherence and delivery.

**Owns:**

* Folder structure
* Module boundaries
* Shared interfaces
* Build and dev workflow
* MVP roadmap enforcement

**Produces:**

* Repo organization
* Integration plans
* Implementation order

**Authority:**

* Can veto scope creep
* Can require simplification

---

## Global Rules for All Agents

* Obey `CLAUDE.md` at all times
* Prefer simple systems that interact
* Avoid feature creep
* MVP first, depth later
* When uncertain: stop and ask for clarification

This is a **simulation project**, not a content generator.

