/**
 * Capabilities System
 * Defines what each entity type can do
 * Used to determine available behaviors at runtime
 */

// === CAPABILITY DEFINITIONS ===
export const CAPABILITIES = {
  // Universal
  CAN_MOVE: 'can_move',
  CAN_PERCEIVE: 'can_perceive',
  CAN_HAVE_DRIVES: 'can_have_drives',

  // Biological
  CAN_EAT: 'can_eat',
  CAN_REPRODUCE: 'can_reproduce',
  CAN_HUNT: 'can_hunt',
  CAN_FISH: 'can_fish',
  CAN_TAKE_DAMAGE: 'can_take_damage',

  // Intelligent
  CAN_SPEAK: 'can_speak',        // Consultable with LLM
  CAN_CRAFT: 'can_craft',        // Use workshops
  CAN_BUILD: 'can_build',        // Construct structures
  CAN_USE_TOOLS: 'can_use_tools',
  CAN_CLAIM_TERRITORY: 'can_claim_territory',
  CAN_HAVE_SKILLS: 'can_have_skills',

  // Faction-specific
  CAN_TRADE: 'can_trade',
  CAN_RAID: 'can_raid',
  CAN_COMMUNICATE_FACTION: 'can_communicate_faction',
};

// === CAPABILITY MATRIX ===
const CAPABILITY_MAP = {
  dwarf: new Set([
    CAPABILITIES.CAN_MOVE,
    CAPABILITIES.CAN_PERCEIVE,
    CAPABILITIES.CAN_HAVE_DRIVES,
    CAPABILITIES.CAN_EAT,
    CAPABILITIES.CAN_SPEAK,
    CAPABILITIES.CAN_CRAFT,
    CAPABILITIES.CAN_BUILD,
    CAPABILITIES.CAN_USE_TOOLS,
    CAPABILITIES.CAN_HUNT,
    CAPABILITIES.CAN_FISH,
    CAPABILITIES.CAN_TAKE_DAMAGE,
    CAPABILITIES.CAN_HAVE_SKILLS,
  ]),

  animal: new Set([
    CAPABILITIES.CAN_MOVE,
    CAPABILITIES.CAN_PERCEIVE,
    CAPABILITIES.CAN_HAVE_DRIVES,
    CAPABILITIES.CAN_EAT,
    CAPABILITIES.CAN_REPRODUCE,
    CAPABILITIES.CAN_TAKE_DAMAGE,
    CAPABILITIES.CAN_HUNT,
    CAPABILITIES.CAN_CLAIM_TERRITORY,
  ]),

  human: new Set([
    CAPABILITIES.CAN_MOVE,
    CAPABILITIES.CAN_PERCEIVE,
    CAPABILITIES.CAN_HAVE_DRIVES,
    CAPABILITIES.CAN_EAT,
    CAPABILITIES.CAN_SPEAK,
    CAPABILITIES.CAN_USE_TOOLS,
    CAPABILITIES.CAN_TAKE_DAMAGE,
    CAPABILITIES.CAN_TRADE,
    CAPABILITIES.CAN_RAID,
    CAPABILITIES.CAN_COMMUNICATE_FACTION,
  ]),

  elf: new Set([
    CAPABILITIES.CAN_MOVE,
    CAPABILITIES.CAN_PERCEIVE,
    CAPABILITIES.CAN_HAVE_DRIVES,
    CAPABILITIES.CAN_EAT,
    CAPABILITIES.CAN_SPEAK,
    CAPABILITIES.CAN_USE_TOOLS,
    CAPABILITIES.CAN_TAKE_DAMAGE,
    CAPABILITIES.CAN_COMMUNICATE_FACTION,
  ]),

  goblin: new Set([
    CAPABILITIES.CAN_MOVE,
    CAPABILITIES.CAN_PERCEIVE,
    CAPABILITIES.CAN_HAVE_DRIVES,
    CAPABILITIES.CAN_EAT,
    CAPABILITIES.CAN_SPEAK,
    CAPABILITIES.CAN_USE_TOOLS,
    CAPABILITIES.CAN_TAKE_DAMAGE,
    CAPABILITIES.CAN_RAID,
    CAPABILITIES.CAN_HUNT,
    CAPABILITIES.CAN_COMMUNICATE_FACTION,
  ]),

  food: new Set([
    // Food sources have no capabilities
  ]),

  resource: new Set([
    // Resource objects have no capabilities
  ]),
};

/**
 * Check if entity has a capability
 */
export function hasCapability(entity, capability) {
  if (!entity || !entity.type) return false;

  const entityCaps = CAPABILITY_MAP[entity.type];
  if (!entityCaps) return false;

  return entityCaps.has(capability);
}

/**
 * Get all capabilities for an entity type
 */
export function getCapabilities(entityType) {
  return CAPABILITY_MAP[entityType] || new Set();
}

/**
 * Check if entity can perform an action
 */
export function canPerformAction(entity, actionType) {
  const actionCapabilities = {
    'move': CAPABILITIES.CAN_MOVE,
    'perceive': CAPABILITIES.CAN_PERCEIVE,
    'eat': CAPABILITIES.CAN_EAT,
    'speak': CAPABILITIES.CAN_SPEAK,
    'craft': CAPABILITIES.CAN_CRAFT,
    'build': CAPABILITIES.CAN_BUILD,
    'hunt': CAPABILITIES.CAN_HUNT,
    'fish': CAPABILITIES.CAN_FISH,
    'trade': CAPABILITIES.CAN_TRADE,
    'raid': CAPABILITIES.CAN_RAID,
    'reproduce': CAPABILITIES.CAN_REPRODUCE,
  };

  const requiredCap = actionCapabilities[actionType];
  if (!requiredCap) return false;

  return hasCapability(entity, requiredCap);
}
