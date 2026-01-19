# Visitor Inspector Integration

## Overview
Successfully integrated external visitor forces (humans, goblins, elves) with the cursor and inspector panel system. Players can now click on visitors to inspect their detailed stats, including names, races, roles, bios, and combat information.

## Changes Made

### 1. **inspection.js** - Enhanced Entity Inspection
- **`getEntitiesAt()`**: Now includes visitors in entity detection at each grid position
  - Checks `state.visitors` array
  - Filters out dead visitors
- **`inspectPosition()`**: Added `hasVisitor` flag to inspection results
- **`getVisitorStats()`** (NEW): Formats visitor data for display panel
  - Returns: id, name, race, role, bio, hp/maxHp, damage, state, disposition, satisfaction
  - Includes color-coded labels for disposition (Friendly/Hostile) and state
  - Calculates HP percentage
- **`getTooltipLabel()`**: Updated to handle visitors with fallback to name or race

### 2. **statPanel.js** - Visitor Rendering
- **Import**: Added `getVisitorStats` to inspection imports
- **`renderVisitor()`** (NEW): Displays visitor information with:
  - Race emoji header (🧙‍♂️ Human, 👹 Goblin, 🧝🏻‍♀️ Elf)
  - Name, race, and role identification
  - LLM-generated bio (if available)
  - State and disposition with color coding:
    - Disposition: Very Friendly (green) → Friendly (cyan) → Neutral (yellow) → Hostile (orange) → Very Hostile (red)
    - State: Trading (green), In Combat (red), Fleeing (yellow), Arriving/Leaving (gray)
  - Combat stats: HP bar and damage value
  - Goal progress: Satisfaction tracking with threshold
- **`getRaceEmoji()`** (NEW): Maps race names to appropriate Unicode characters
- **`show()`**: Updated priority to: dwarf > visitor > food > tile
- **`update()`**: Added visitor tracking for live updates when visitors move or change state

### 3. **World State** (state/store.js)
- `visitors` array already initialized in `createWorldState()`
- Ready to accept visitor entities from spawner

## Features

### Player Interactions
1. **Hover**: Cursor shows visitor name in tooltip
2. **Click**: Opens detailed inspection panel with all stats
3. **Live Updates**: Panel refreshes each frame if visitor is tracked
4. **Positioning**: Panel auto-adjusts to avoid screen edges

### Displayed Information

#### Identity Section
- Name (with race-specific emoji)
- Race (Human/Goblin/Elf)
- Role (Merchant/Guard/Raider/Scout/Missionary/Diplomat)
- Entity ID

#### State Section
- Current state (Arriving/Active/Trading/Raiding/Preaching/Fighting/Fleeing/Leaving)
- Disposition toward dwarves (with narrative descriptor)
- Color-coded for quick assessment

#### Combat Stats
- HP bar (green/yellow/red based on health %)
- Damage value

#### Goal Progress (if applicable)
- Satisfaction meter showing progress toward role objectives
- Useful for merchants (trading satisfaction) and raiders (raiding satisfaction)

#### Bio Section
- LLM-generated character description (when available)
- Formatted in italics with earth-tone styling

## Technical Details

### Data Flow
1. Cursor moves → `inspectPosition()` called
2. `getEntitiesAt()` checks visitors array
3. If visitor found → `show(inspection)` in stat panel
4. `getVisitorStats()` formats data
5. `renderVisitor()` generates HTML
6. Each frame: `update()` keeps panel current with live data

### State Tracking
- Panel closes automatically if visitor dies or leaves map
- Panel repositions if visitor moves
- Live updates preserve all dynamic data (HP, satisfaction, state)

### Race & Role Mapping
```javascript
Races:      Human (🧙‍♂️) | Goblin (👹) | Elf (🧝🏻‍♀️)
Roles:      Merchant | Guard | Raider | Scout | Missionary | Diplomat
Dispositions: -100 (Very Hostile) to +100 (Very Friendly)
States:     Arriving → Active → [Trading/Raiding/Preaching] → Fleeing → Leaving
```

## Testing Checklist
- [ ] Hover over visitor shows name in tooltip
- [ ] Click visitor opens stat panel
- [ ] Panel displays correct race emoji
- [ ] Disposition color matches value
- [ ] HP bar updates as visitor takes damage
- [ ] Panel closes when visitor dies/leaves
- [ ] Panel repositions as visitor moves
- [ ] Human merchants show proper stats
- [ ] Goblin raiders show hostile disposition
- [ ] Elf missionaries show peaceful role
- [ ] LLM bios display when available

## Integration with Existing Systems
- ✅ Works with cursor system (no changes needed)
- ✅ Uses existing stat bar rendering
- ✅ Compatible with inspection tooltips
- ✅ Panel positioning already handles dynamic content
- ✅ Color scheme matches dwarf/food displays

## Future Enhancements
1. Visitor bio generation (needs LLM integration per visitor)
2. Relationship tracking between dwarves and visitors
3. Trade history display for merchants
4. Combat history for military visitors
5. Alliance/betrayal status for diplomatic visitors
