# Dwarf Fortress–Inspired ASCII Simulation (Web)

This is a **browser-based, ASCII-rendered, emergent simulation game** inspired by *Dwarf Fortress*.

## Core Principles

* Emergent systems > scripted outcomes
* Deterministic simulation with stochastic pressure
* ASCII-first rendering (readability over flair)
* Systems should interact in surprising ways
* Failure is expected and interesting

## Tech Stack

* JavaScript (ES modules)
* Tailwind CSS
* No framework initially (vanilla JS + modules)
* HTML + CSS grid or canvas for ASCII rendering

## Hard Constraints

* No feature creep without explicit approval
* No LLM calls inside the main tick loop
* LLMs may only suggest actions, not mutate world state
* All systems must degrade gracefully
* ASCII must remain readable at all times

## MVP (v0.1) Scope

* One map (e.g. 40x20)
* Flat world (no z-levels yet)
* A few dwarves (3–5)
* One resource (food)
* One failure mode (starvation → bad decisions → death)
* Basic event log

## Explicitly Out of Scope (v0.1)

* Combat
* Enemies
* Fluids
* Weather
* Z-levels
* Save/load
* Multiplayer
* Modding

## Development Philosophy

Prefer:

* Clear data models
* Simple rules that interact
* Vertical slices over horizontal systems
  Avoid:
* Premature optimization
* Clever abstractions
* Over-engineering

When in doubt: **make it smaller, clearer, and alive**.

