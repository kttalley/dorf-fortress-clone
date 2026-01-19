/**
 * World State Compressor for Post-Run Analysis
 * Agent A: Simulation Architect
 *
 * Compresses world state into a structured summary suitable for LLM analysis.
 * Target: ~1000-1500 tokens max for the complete summary.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MAX_EVENTS: 50,           // Max events to include
  MAX_RESOURCE_SAMPLES: 10, // Resource timeline samples
  CRITICAL_EVENT_TYPES: [   // Always included even if old
    'death', 'starvation', 'first_food', 'population_change',
    'critical_hunger', 'conversation', 'discovery'
  ],
  STARVATION_THRESHOLD: 60, // Hunger level considered "critical"
};

// ============================================================
// MAIN COMPRESSOR
// ============================================================

/**
 * Compress world state into analysis-ready summary
 * @param {object} world - World state object
 * @param {object} options - Compression options
 * @returns {object} Compressed summary
 */
export function compressWorldForAnalysis(world, options = {}) {
  const {
    includeRelationships = false,
    maxEvents = CONFIG.MAX_EVENTS,
  } = options;

  // Determine outcome
  const outcome = determineOutcome(world);

  // Build summary
  const summary = {
    // Run metadata
    duration: world.tick || 0,
    outcome,
    finalPopulation: world.dwarves?.length || 0,
    peakPopulation: world.peakPopulation || world.dwarves?.length || 0,

    // Entity data
    dwarves: compressDwarves(world.dwarves || [], world.deadDwarves || []),
    deaths: extractDeaths(world.deadDwarves || [], world.log || []),

    // Resource tracking
    resources: sampleResourceTimeline(world.resourceHistory || [], CONFIG.MAX_RESOURCE_SAMPLES),

    // Event log
    events: compactEventLog(world.log || [], maxEvents),

    // Starvation tracking
    starvation: extractStarvationTimeline(world.starvationHistory || [], world.log || []),

    // Optional relationship data
    ...(includeRelationships && {
      relationships: compressRelationships(world.dwarves || [])
    }),

    // Timestamp
    analyzedAt: Date.now(),
    runId: world.runId || generateRunId(),
  };

  return summary;
}

/**
 * Determine the outcome of the run
 * @param {object} world
 * @returns {string}
 */
function determineOutcome(world) {
  const alive = world.dwarves?.length || 0;
  const dead = world.deadDwarves?.length || 0;

  if (alive === 0 && dead > 0) {
    return 'COLONY_COLLAPSED';
  }
  if (alive > 0 && dead === 0) {
    return 'THRIVING';
  }
  if (alive > 0 && dead > 0) {
    const survivalRate = alive / (alive + dead);
    if (survivalRate > 0.7) return 'SURVIVED_WITH_LOSSES';
    if (survivalRate > 0.3) return 'STRUGGLING';
    return 'NEAR_COLLAPSE';
  }
  return 'UNKNOWN';
}

/**
 * Compress dwarf data for analysis
 * @param {Array} aliveDwarves
 * @param {Array} deadDwarves
 * @returns {Array}
 */
function compressDwarves(aliveDwarves, deadDwarves) {
  const result = [];

  // Process alive dwarves
  for (const d of aliveDwarves) {
    result.push({
      name: d.name,
      alive: true,
      traits: extractDominantTraits(d.personality),
      finalMood: d.mood,
      finalHunger: d.hunger,
      relationships: Object.keys(d.relationships || {}).length,
      spawnTick: d.spawnTick || 0,
    });
  }

  // Process dead dwarves
  for (const d of deadDwarves) {
    result.push({
      name: d.name,
      alive: false,
      deathTick: d.deathTick,
      deathCause: d.deathCause || 'unknown',
      traits: extractDominantTraits(d.personality),
      finalMood: d.moodAtDeath,
      finalHunger: d.hungerAtDeath,
      spawnTick: d.spawnTick || 0,
    });
  }

  return result;
}

/**
 * Extract dominant personality traits
 * @param {object} personality
 * @returns {Array<string>}
 */
function extractDominantTraits(personality) {
  if (!personality) return [];

  return Object.entries(personality)
    .filter(([trait, value]) => value > 0.65)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([trait]) => trait);
}

/**
 * Extract death records from dead dwarves and log
 * @param {Array} deadDwarves
 * @param {Array} log
 * @returns {Array}
 */
function extractDeaths(deadDwarves, log) {
  const deaths = [];

  // From dead dwarf records
  for (const d of deadDwarves) {
    deaths.push({
      name: d.name,
      tick: d.deathTick || 0,
      cause: d.deathCause || 'starvation',
      hunger: d.hungerAtDeath,
      mood: d.moodAtDeath,
    });
  }

  // Supplement from log if needed
  const deathLogs = log.filter(e =>
    e.message?.toLowerCase().includes('died') ||
    e.message?.toLowerCase().includes('perished') ||
    e.message?.toLowerCase().includes('starved')
  );

  for (const entry of deathLogs) {
    const nameMatch = entry.message.match(/^(\w+)\s+(has\s+)?(died|perished|starved)/i);
    if (nameMatch && !deaths.find(d => d.name === nameMatch[1])) {
      deaths.push({
        name: nameMatch[1],
        tick: entry.tick,
        cause: entry.message.includes('starved') ? 'starvation' : 'unknown',
      });
    }
  }

  return deaths.sort((a, b) => a.tick - b.tick);
}

// ============================================================
// EVENT LOG COMPRESSION
// ============================================================

/**
 * Compact event log to most significant events
 * @param {Array} log - Full event log
 * @param {number} maxEvents - Maximum events to keep
 * @returns {Array} Compacted event list
 */
export function compactEventLog(log, maxEvents = CONFIG.MAX_EVENTS) {
  if (!log || log.length === 0) return [];

  // Categorize events
  const categorized = categorizeEvents(log);

  // Priority selection
  const selected = [];

  // 1. Always include deaths and critical events
  selected.push(...categorized.critical);

  // 2. Include population milestones
  selected.push(...categorized.milestones.slice(0, 5));

  // 3. Include starvation warnings
  selected.push(...categorized.starvation.slice(0, 10));

  // 4. Include social interactions (sample)
  const socialSample = sampleArray(categorized.social, 8);
  selected.push(...socialSample);

  // 5. Fill remaining with recent general events
  const remaining = maxEvents - selected.length;
  if (remaining > 0) {
    const recentGeneral = categorized.general
      .slice(-remaining);
    selected.push(...recentGeneral);
  }

  // Deduplicate and sort by tick
  const unique = deduplicateEvents(selected);
  return unique.sort((a, b) => a.tick - b.tick).slice(0, maxEvents);
}

/**
 * Categorize events by type and importance
 * @param {Array} log
 * @returns {object}
 */
function categorizeEvents(log) {
  const categories = {
    critical: [],    // Deaths, collapses
    milestones: [],  // Population changes, discoveries
    starvation: [],  // Hunger warnings
    social: [],      // Conversations, relationships
    general: [],     // Everything else
  };

  for (const entry of log) {
    const event = normalizeLogEntry(entry);

    // Categorize
    if (event.type === 'death' || event.type === 'collapse') {
      categories.critical.push(event);
    } else if (event.type === 'milestone' || event.type === 'arrival' || event.type === 'discovery') {
      categories.milestones.push(event);
    } else if (event.type === 'starvation' || event.type === 'hunger') {
      categories.starvation.push(event);
    } else if (event.type === 'conversation' || event.type === 'social') {
      categories.social.push(event);
    } else {
      categories.general.push(event);
    }
  }

  return categories;
}

/**
 * Normalize log entry to standard event format
 * @param {object} entry
 * @returns {object}
 */
function normalizeLogEntry(entry) {
  const message = entry.message || '';
  const tick = entry.tick || 0;

  // Detect event type from message
  let type = 'general';
  let description = message;

  if (/died|perished|starved to death/i.test(message)) {
    type = 'death';
  } else if (/arrived|has arrived/i.test(message)) {
    type = 'arrival';
  } else if (/starv|critical.+hunger|desperately hungry/i.test(message)) {
    type = 'starvation';
  } else if (/eats|eating|found food/i.test(message)) {
    type = 'food';
  } else if (/to\s+\w+:|says|conversation/i.test(message)) {
    type = 'conversation';
  } else if (/discovered|new cavern|wilderness/i.test(message)) {
    type = 'discovery';
  } else if (/ponders|thinks/i.test(message)) {
    type = 'thought';
  }

  return {
    tick,
    type,
    description: truncateString(description, 100),
    raw: entry,
  };
}

/**
 * Deduplicate similar events
 * @param {Array} events
 * @returns {Array}
 */
function deduplicateEvents(events) {
  const seen = new Set();
  const unique = [];

  for (const event of events) {
    // Create fingerprint
    const fingerprint = `${event.tick}-${event.type}-${event.description.slice(0, 30)}`;

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      unique.push(event);
    }
  }

  return unique;
}

// ============================================================
// RESOURCE & STARVATION TRACKING
// ============================================================

/**
 * Sample resource timeline at key intervals
 * @param {Array} history
 * @param {number} maxSamples
 * @returns {Array}
 */
function sampleResourceTimeline(history, maxSamples) {
  if (!history || history.length === 0) return [];

  if (history.length <= maxSamples) {
    return history;
  }

  // Sample at regular intervals + include first and last
  const result = [history[0]];
  const step = Math.floor(history.length / (maxSamples - 2));

  for (let i = step; i < history.length - 1; i += step) {
    result.push(history[i]);
    if (result.length >= maxSamples - 1) break;
  }

  result.push(history[history.length - 1]);
  return result;
}

/**
 * Extract starvation events from history and log
 * @param {Array} history
 * @param {Array} log
 * @returns {Array}
 */
function extractStarvationTimeline(history, log) {
  const timeline = [];

  // From explicit starvation history
  for (const entry of history) {
    timeline.push({
      tick: entry.tick,
      count: entry.count || 1,
      names: entry.dwarves || [],
      severity: entry.severity || 'critical',
    });
  }

  // Extract from log messages
  const starvationLogs = log.filter(e =>
    /starv|critical.+hunger|desperately/i.test(e.message || '')
  );

  for (const entry of starvationLogs) {
    const nameMatch = entry.message.match(/^(\w+)/);
    if (nameMatch && !timeline.find(t => t.tick === entry.tick && t.names?.includes(nameMatch[1]))) {
      const existing = timeline.find(t => t.tick === entry.tick);
      if (existing) {
        existing.count++;
        existing.names = existing.names || [];
        existing.names.push(nameMatch[1]);
      } else {
        timeline.push({
          tick: entry.tick,
          count: 1,
          names: [nameMatch[1]],
          severity: entry.message.includes('died') ? 'fatal' : 'critical',
        });
      }
    }
  }

  return timeline.sort((a, b) => a.tick - b.tick);
}

/**
 * Compress relationship data
 * @param {Array} dwarves
 * @returns {Array}
 */
function compressRelationships(dwarves) {
  const relationships = [];

  for (const dwarf of dwarves) {
    if (!dwarf.relationships) continue;

    for (const [otherId, rel] of Object.entries(dwarf.relationships)) {
      // Only include significant relationships
      if (rel.interactions > 2 || Math.abs(rel.affinity || 0) > 20) {
        relationships.push({
          from: dwarf.name,
          toId: otherId,
          affinity: rel.affinity || 0,
          interactions: rel.interactions || 0,
        });
      }
    }
  }

  return relationships;
}

// ============================================================
// UTILITIES
// ============================================================

function sampleArray(arr, count) {
  if (!arr || arr.length <= count) return arr || [];

  const result = [];
  const step = Math.floor(arr.length / count);

  for (let i = 0; i < arr.length && result.length < count; i += step) {
    result.push(arr[i]);
  }

  return result;
}

function truncateString(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function generateRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// ESTIMATION
// ============================================================

/**
 * Estimate token count for summary (rough approximation)
 * @param {object} summary
 * @returns {number}
 */
export function estimateTokenCount(summary) {
  const json = JSON.stringify(summary);
  // Rough estimate: ~4 characters per token
  return Math.ceil(json.length / 4);
}

/**
 * Trim summary to fit token budget
 * @param {object} summary
 * @param {number} maxTokens
 * @returns {object}
 */
export function trimToTokenBudget(summary, maxTokens = 1500) {
  let current = { ...summary };
  let tokens = estimateTokenCount(current);

  // Reduce events first
  while (tokens > maxTokens && current.events?.length > 20) {
    current.events = current.events.slice(0, Math.floor(current.events.length * 0.8));
    tokens = estimateTokenCount(current);
  }

  // Reduce resource samples
  while (tokens > maxTokens && current.resources?.length > 5) {
    current.resources = current.resources.slice(0, Math.floor(current.resources.length * 0.7));
    tokens = estimateTokenCount(current);
  }

  // Truncate descriptions
  if (tokens > maxTokens) {
    current.events = current.events?.map(e => ({
      ...e,
      description: truncateString(e.description, 50),
    }));
  }

  return current;
}
