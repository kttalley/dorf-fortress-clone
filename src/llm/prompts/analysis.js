/**
 * LLM Prompt Templates for Post-Run Analysis
 * Agent A: Simulation Architect - System Understanding
 *
 * These prompts guide the LLM to produce factual, grounded analysis
 * citing specific events and metrics from the run.
 */

/**
 * System message establishing the analyst role
 * Enforces JSON-only output and factual grounding
 */
export const SYSTEM_ANALYST = `You are an objective post-run analyst for a dwarf colony simulation. Your role is to analyze completed simulation runs and identify patterns that led to success or failure.

CRITICAL RULES:
1. Output ONLY valid JSON - no markdown, no explanations outside JSON
2. ALWAYS cite specific tick numbers, event times, or metrics when making claims
3. Be factual and grounded - only reference events that appear in the provided data
4. Focus on causality: what led to what, and why
5. Suggestions must be concrete and actionable, not vague

Your analysis helps players understand emergent system behavior and improve future runs.`;

/**
 * Main analysis prompt template
 * @param {object} summary - Compressed world summary
 * @returns {string} Formatted prompt
 */
export function buildAnalysisPrompt(summary) {
  return `Analyze this completed dwarf colony simulation run and provide structured insights.

## SIMULATION DATA

### Run Overview
- Duration: ${summary.duration} ticks
- Final Population: ${summary.finalPopulation} dwarves
- Peak Population: ${summary.peakPopulation} dwarves
- Outcome: ${summary.outcome}

### Dwarf Registry
${formatDwarfRegistry(summary.dwarves)}

### Resource Timeline
${formatResourceTimeline(summary.resources)}

### Critical Events (chronological)
${formatEventLog(summary.events)}

### Death Record
${formatDeathRecord(summary.deaths)}

### Starvation Timeline
${formatStarvationTimeline(summary.starvation)}

## OUTPUT FORMAT

Respond with ONLY this JSON structure:
{
  "turning_points": [
    "Tick X: Description of significant moment and its impact",
    "Tick Y: Another turning point with cited evidence"
  ],
  "root_cause": "1-2 sentence explanation of primary failure/success factor, citing specific events or metrics",
  "suggested_next_runs": [
    "Specific actionable suggestion based on analysis",
    "Another concrete recommendation"
  ]
}

Provide 3-5 turning points, exactly 1 root cause, and 3-5 suggestions. Cite tick numbers.`;
}

/**
 * Lightweight analysis prompt for shorter runs or constrained contexts
 */
export function buildQuickAnalysisPrompt(summary) {
  return `Quick analysis of dwarf colony run.

Duration: ${summary.duration} ticks | Population: ${summary.peakPopulation}→${summary.finalPopulation} | Outcome: ${summary.outcome}

Deaths: ${summary.deaths.map(d => `${d.name}@tick${d.tick}`).join(', ') || 'none'}
Key events: ${summary.events.slice(0, 15).map(e => `[${e.tick}]${e.type}`).join(', ')}

JSON only - turning_points (3-5), root_cause (1 sentence), suggested_next_runs (3-5):`;
}

// ============================================================
// FORMATTING HELPERS
// ============================================================

function formatDwarfRegistry(dwarves) {
  if (!dwarves || dwarves.length === 0) return 'No dwarves recorded';

  return dwarves.map(d => {
    const status = d.alive ? 'ALIVE' : `DIED@${d.deathTick}`;
    const traits = d.traits?.slice(0, 2).join(',') || 'unknown';
    return `- ${d.name} [${status}] traits:${traits} mood:${d.finalMood || '?'}`;
  }).join('\n');
}

function formatResourceTimeline(resources) {
  if (!resources || resources.length === 0) return 'No resource data';

  // Sample at key intervals
  const samples = resources.slice(0, 10);
  return samples.map(r =>
    `Tick ${r.tick}: food_sources=${r.foodSources}, total_food=${r.totalFood}`
  ).join('\n');
}

function formatEventLog(events) {
  if (!events || events.length === 0) return 'No events recorded';

  return events.slice(0, 40).map(e => {
    const details = e.details ? ` (${e.details})` : '';
    return `[Tick ${e.tick}] ${e.type}: ${e.description}${details}`;
  }).join('\n');
}

function formatDeathRecord(deaths) {
  if (!deaths || deaths.length === 0) return 'No deaths recorded';

  return deaths.map(d =>
    `- ${d.name} died at tick ${d.tick}: ${d.cause}${d.hunger ? ` (hunger: ${d.hunger})` : ''}`
  ).join('\n');
}

function formatStarvationTimeline(starvation) {
  if (!starvation || starvation.length === 0) return 'No starvation events';

  return starvation.map(s =>
    `Tick ${s.tick}: ${s.count} dwarf(es) at critical hunger (${s.names?.join(', ') || 'unknown'})`
  ).join('\n');
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate autopsy response structure
 * @param {object} response - Parsed JSON from LLM
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAutopsyResponse(response) {
  const errors = [];

  if (!response || typeof response !== 'object') {
    return { valid: false, errors: ['Response is not an object'] };
  }

  // Check turning_points
  if (!Array.isArray(response.turning_points)) {
    errors.push('turning_points must be an array');
  } else if (response.turning_points.length < 1 || response.turning_points.length > 7) {
    errors.push('turning_points should have 1-7 entries');
  }

  // Check root_cause
  if (typeof response.root_cause !== 'string') {
    errors.push('root_cause must be a string');
  } else if (response.root_cause.length < 10) {
    errors.push('root_cause too short');
  }

  // Check suggested_next_runs
  if (!Array.isArray(response.suggested_next_runs)) {
    errors.push('suggested_next_runs must be an array');
  } else if (response.suggested_next_runs.length < 1 || response.suggested_next_runs.length > 7) {
    errors.push('suggested_next_runs should have 1-7 entries');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract JSON from potentially messy LLM response
 * @param {string} text - Raw LLM response
 * @returns {object|null} Parsed JSON or null
 */
export function extractJSON(text) {
  if (!text) return null;

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    // Continue to extraction
  }

  // Try to find JSON object in response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Continue
    }
  }

  // Try to find JSON with code block markers
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {
      // Continue
    }
  }

  return null;
}
