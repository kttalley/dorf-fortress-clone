# Visitor Inspector Integration - Quick Reference

## Files Modified

### 1. [src/ui/inspection.js](src/ui/inspection.js)
**Added visitor support to entity inspection system**
- `getEntitiesAt(state, x, y)`: Now scans for visitors in addition to dwarves and food
- `inspectPosition(state, x, y)`: Returns `hasVisitor` flag
- `getVisitorStats(visitor)` ✨ NEW: Formats visitor data with all display info
- `getTooltipLabel(inspection)`: Handles visitor tooltips with name fallback

### 2. [src/ui/statPanel.js](src/ui/statPanel.js)
**Added visitor rendering to stat panel**
- Import: Added `getVisitorStats` from inspection.js
- `renderVisitor(stats)` ✨ NEW: Generates HTML for visitor panel display
- `getRaceEmoji(race)` ✨ NEW: Maps races to Unicode characters
- `show(inspection)`: Updated priority to include visitors
- `update(state)`: Now tracks live visitor data (movement, state, health)

### 3. [src/main.js](src/main.js)
**Connected visitor inspection to cursor clicks**
- Updated cursor onClick callback to check `inspection.hasVisitor`
- Enables toggle behavior: click visitor → show panel → click again → hide panel

## Data Flow Diagram

```
User hovers over visitor
    ↓
cursor.js → inspectPosition()
    ↓
inspection.js → getEntitiesAt() finds visitor
    ↓
Tooltip shows visitor name
    ↓
User clicks visitor
    ↓
main.js onClick handler triggers
    ↓
statPanel.show(inspection)
    ↓
inspection.js → getVisitorStats(visitor)
    ↓
statPanel.renderVisitor(stats)
    ↓
Panel displays all visitor info
```

## What's Visible to Players

### Hover Tooltip
```
Marcus the Merchant
```

### Click Panel
```
┌─────────────────────────────────┐
│ 🧙‍♂️ Marcus the Merchant        │
│ Human Merchant #42              │
├─────────────────────────────────┤
│ A seasoned trader from distant  │
│ lands. Sharp wit, sharper deals. │
├─────────────────────────────────┤
│ State: Active                   │
│ Disposition: Friendly           │
├─────────────────────────────────┤
│ Combat                          │
│ HP: [████████████░░░░] 16/20   │
│ Damage: 3                       │
├─────────────────────────────────┤
│ Goal Progress                   │
│ Satisfaction: [██████░░░░] 50%  │
├─────────────────────────────────┤
│ Click elsewhere to close        │
└─────────────────────────────────┘
```

## Key Features

✅ **Works with all visitor types**: Humans, Goblins, Elves  
✅ **All visitor roles supported**: Merchants, Guards, Raiders, Scouts, Missionaries, Diplomats  
✅ **Live updates**: Panel refreshes as visitor state changes  
✅ **Smart positioning**: Panel avoids screen edges  
✅ **Color coding**: Visual indicators for disposition and state  
✅ **LLM integration ready**: Can display generated bios  
✅ **No breaking changes**: Fully backward compatible  

## Testing Quick Checklist

```javascript
// In browser console during game:
// Check visitor inspection works:
console.log('Visitors on map:', gameState.visitors.length);
console.log('First visitor:', gameState.visitors[0]);

// Manually test:
// 1. Wait for visitors to spawn
// 2. Hover over visitor → see name in tooltip
// 3. Click visitor → see full panel
// 4. Click again → panel closes
// 5. Move visitor to new position → panel follows
// 6. Check HP updates correctly
```

## Architecture Notes

### Entity Type Priority
When multiple entities at same position (shouldn't happen but handled):
```
Dwarves (type: 'dwarf') > Visitors (type: 'visitor') > Food (type: 'food') > Tile
```

### Visitor Data Structure
```javascript
{
  type: 'visitor',
  id: number,
  name: string,
  generatedName: string,  // If LLM-generated
  race: 'human' | 'goblin' | 'elf',
  role: 'merchant' | 'guard' | 'raider' | 'scout' | 'missionary' | 'diplomat',
  hp: number,
  maxHp: number,
  damage: number,
  state: string,
  disposition: number (-100 to 100),
  satisfactionThreshold: number | null,
  satisfaction: number,
  x: number,
  y: number,
  generatedBio: string  // If LLM-generated
}
```

### Color Scheme
- **Disposition**: 🟢 Friendly → 🟡 Neutral → 🔴 Hostile
- **State**: 🟢 Trading → 🔴 In Combat → 🟡 Fleeing
- **HP**: 🟢 >50% → 🟡 25-50% → 🔴 <25%

## Integration Checklist

- [x] Import getVisitorStats in statPanel.js
- [x] Add visitors to getEntitiesAt() detection
- [x] Create renderVisitor() function
- [x] Add getRaceEmoji() helper
- [x] Update show() handler for visitors
- [x] Update update() method for visitor tracking
- [x] Update onClick in main.js for hasVisitor check
- [x] Add hasVisitor to inspection results
- [x] Update getTooltipLabel() for visitors
- [x] No breaking changes to existing code
- [x] All files pass validation

## Future Enhancement Hooks

1. **Visitor Bio Generation**: Hook into LLM system to generate `generatedBio`
2. **Relationship Tracking**: Add dwarf-visitor relationship display
3. **Trade Log**: Show past trades for merchants
4. **Combat History**: Track battles with raiders
5. **Diplomacy Status**: Show stance changes for diplomatic visitors
6. **Group Display**: Show all group members when clicking leader

## Dependencies

✅ No new dependencies added  
✅ Uses existing stat bar components  
✅ Uses existing color system  
✅ Uses existing panel positioning logic  
✅ Uses existing entity system  

## Performance Impact

- **Minimal**: O(v) scan through visitors array on click
- **Cached**: Data only formatted when panel shown/updated
- **Efficient**: Live updates only while panel visible
- **No memory leaks**: Panel cleanup removes event listeners

---

**Status**: ✅ Ready for integration  
**Last Updated**: Jan 19, 2026  
**Coverage**: All visitor races and roles included
