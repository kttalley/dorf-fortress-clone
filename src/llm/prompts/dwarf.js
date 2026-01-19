/**
 * Dwarf Name & Bio Prompt Templates
 * Generates flavorful names and personality summaries for dwarf entities
 *
 * Design constraints:
 * - Total prompt < 500 tokens
 * - Output: JSON { name, bio }
 * - Name: 1-3 words (given name, optional epithet)
 * - Bio: 1-2 sentences, wry archaic tone
 */

// === SYSTEM PROMPT ===
export const SYSTEM_DWARF_NAME_BIO = `You are a dwarven chronicler recording names and brief histories.
Write in terse, archaic style. Be wry, not whimsical.
Output valid JSON only: {"name":"...","bio":"..."}
Name: 1-3 words. Bio: 1-2 sentences max.`;

// === USER PROMPT TEMPLATE ===
export const USER_DWARF_NAME_BIO = `Record this dwarf:
Type: {{entityType}}
Traits: {{traits}}
Aspiration: {{aspiration}}
{{#if context}}Note: {{context}}{{/if}}

Respond with JSON only.`;

/**
 * Format the user prompt with entity data
 * @param {object} entity - Dwarf entity
 * @param {object} options - Additional context
 * @returns {string} Formatted prompt
 */
export function formatDwarfNameBioPrompt(entity, options = {}) {
  const traits = extractTraitDescriptors(entity);
  const aspiration = formatAspiration(entity.aspiration);
  const entityType = entity.type || 'dwarf';
  const context = options.worldContext || '';

  let prompt = USER_DWARF_NAME_BIO
    .replace('{{entityType}}', entityType)
    .replace('{{traits}}', traits)
    .replace('{{aspiration}}', aspiration);

  // Handle conditional context block
  if (context) {
    prompt = prompt.replace('{{#if context}}Note: {{context}}{{/if}}', `Note: ${context}`);
  } else {
    prompt = prompt.replace('{{#if context}}Note: {{context}}{{/if}}', '');
  }

  return prompt.trim();
}

/**
 * Extract personality traits as comma-separated descriptors
 * @param {object} entity
 * @returns {string}
 */
function extractTraitDescriptors(entity) {
  if (!entity.personality) {
    return 'unremarkable';
  }

  const descriptors = [];
  const p = entity.personality;

  // Map trait values to adjectives (threshold-based)
  if (p.curiosity > 0.7) descriptors.push('curious');
  else if (p.curiosity < 0.3) descriptors.push('incurious');

  if (p.friendliness > 0.7) descriptors.push('gregarious');
  else if (p.friendliness < 0.3) descriptors.push('solitary');

  if (p.bravery > 0.7) descriptors.push('bold');
  else if (p.bravery < 0.3) descriptors.push('cautious');

  if (p.humor > 0.7) descriptors.push('mirthful');
  else if (p.humor < 0.3) descriptors.push('dour');

  if (p.melancholy > 0.7) descriptors.push('melancholic');

  if (p.patience > 0.7) descriptors.push('patient');
  else if (p.patience < 0.3) descriptors.push('restless');

  if (p.creativity > 0.7) descriptors.push('inventive');

  if (p.loyalty > 0.7) descriptors.push('steadfast');
  else if (p.loyalty < 0.3) descriptors.push('fickle');

  if (p.stubbornness > 0.7) descriptors.push('stubborn');

  if (p.optimism > 0.7) descriptors.push('hopeful');
  else if (p.optimism < 0.3) descriptors.push('cynical');

  // Return at least something
  if (descriptors.length === 0) {
    return 'unremarkable';
  }

  // Limit to top 4 traits for token efficiency
  return descriptors.slice(0, 4).join(', ');
}

/**
 * Format aspiration for prompt
 * @param {string} aspiration
 * @returns {string}
 */
function formatAspiration(aspiration) {
  const aspirationMap = {
    master_craftsman: 'seeks mastery of craft',
    architect: 'dreams of grand constructions',
    explorer: 'yearns to map the unknown',
    social_butterfly: 'craves companionship',
    hermit: 'desires solitude',
    leader: 'aspires to lead',
  };

  return aspirationMap[aspiration] || 'seeks purpose';
}

/**
 * Parse LLM response into structured data
 * @param {string} response - Raw LLM output
 * @returns {object|null} Parsed { name, bio } or null on failure
 */
export function parseNameBioResponse(response) {
  if (!response || typeof response !== 'string') {
    return null;
  }

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(response.trim());

    if (typeof parsed.name === 'string' && typeof parsed.bio === 'string') {
      return {
        name: sanitizeName(parsed.name),
        bio: sanitizeBio(parsed.bio),
      };
    }
  } catch (e) {
    // Try to extract JSON from markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (typeof parsed.name === 'string' && typeof parsed.bio === 'string') {
          return {
            name: sanitizeName(parsed.name),
            bio: sanitizeBio(parsed.bio),
          };
        }
      } catch (e2) {
        // Fall through
      }
    }

    // Try to find raw JSON object
    const rawMatch = response.match(/\{[^}]*"name"[^}]*"bio"[^}]*\}/);
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]);
        return {
          name: sanitizeName(parsed.name),
          bio: sanitizeBio(parsed.bio),
        };
      } catch (e3) {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Sanitize name (trim, limit length)
 */
function sanitizeName(name) {
  const cleaned = name.trim().substring(0, 40);
  // Remove quotes if present
  return cleaned.replace(/^["']|["']$/g, '');
}

/**
 * Sanitize bio (trim, limit to ~2 sentences)
 */
function sanitizeBio(bio) {
  const cleaned = bio.trim();
  // Limit to roughly 2 sentences (find 2nd period)
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 2).join(' ').substring(0, 200);
}

// === RESPONSE SCHEMA (for documentation) ===
export const RESPONSE_SCHEMA = {
  name: 'string (1-3 words, dwarven name with optional epithet)',
  bio: 'string (1-2 sentences, personality summary)',
};
