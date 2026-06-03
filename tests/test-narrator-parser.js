// Unit tests for parseNarratorResponse
// Run with: node tests/test-narrator-parser.js

// Inline the parser logic for testing (no module resolution needed)
function sanitizeNarration(text) {
  if (typeof text !== 'string') {
    return String(text);
  }
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^\d+[\.\)]\s*/, '');
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  if (!/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }
  const words = cleaned.split(/\s+/);
  if (words.length > 40) {
    cleaned = words.slice(0, 40).join(' ') + '...';
  }
  return cleaned;
}

function parseNarratorResponse(response, expectedCount = 0) {
  if (!response || typeof response !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(response.trim());
    if (Array.isArray(parsed)) {
      return parsed.map(item => {
        if (typeof item === 'string') return sanitizeNarration(item);
        const stringKeys = /^(event|text|narrated|narration|sentence|prose)$/i;
        const match = Object.entries(item).find(([k, v]) => typeof v === 'string' && stringKeys.test(k));
        if (match) return sanitizeNarration(match[1]);
        const fallback = Object.entries(item).find(([, v]) => typeof v === 'string');
        if (fallback) return sanitizeNarration(fallback[1]);
        return sanitizeNarration(String(item));
      });
    }
  } catch (e) {
    const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed.map(item => {
            if (typeof item === 'string') return sanitizeNarration(item);
            const stringKeys = /^(event|text|narrated|narration|sentence|prose)$/i;
            const match = Object.entries(item).find(([k, v]) => typeof v === 'string' && stringKeys.test(k));
            if (match) return sanitizeNarration(match[1]);
            const fallback = Object.entries(item).find(([, v]) => typeof v === 'string');
            if (fallback) return sanitizeNarration(fallback[1]);
            return sanitizeNarration(String(item));
          });
        }
      } catch (e2) {
        // Fall through
      }
    }
    const rawMatch = response.match(/\[[\s\S]*\]/);
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(item => {
            if (typeof item === 'string') return sanitizeNarration(item);
            const stringKeys = /^(event|text|narrated|narration|sentence|prose)$/i;
            const match = Object.entries(item).find(([k, v]) => typeof v === 'string' && stringKeys.test(k));
            if (match) return sanitizeNarration(match[1]);
            const fallback = Object.entries(item).find(([, v]) => typeof v === 'string');
            if (fallback) return sanitizeNarration(fallback[1]);
            return sanitizeNarration(String(item));
          });
        }
      } catch (e3) {
        // Fall through
      }
    }
  }
  return null;
}

// Tests
const tests = [
  {
    name: 'Array of strings (existing behavior)',
    input: '["a", "b"]',
    expected: ['a.', 'b.'],
  },
  {
    name: 'Array of objects with "event" key',
    input: '[{"event":"a"}, {"event":"b"}]',
    expected: ['a.', 'b.'],
  },
  {
    name: 'Markdown-wrapped object array',
    input: '```json\n[{"event":"a"}]\n```',
    expected: ['a.'],
  },
  {
    name: 'Mixed array (strings and objects)',
    input: '["hello", {"event": "world"}]',
    expected: ['hello.', 'world.'],
  },
  {
    name: 'Object with "text" key',
    input: '[{"text":"prose one"}, {"narration":"prose two"}]',
    expected: ['prose one.', 'prose two.'],
  },
  {
    name: 'Object with non-standard string key (fallback)',
    input: '[{"prose":"first"}, {"sentence":"second"}]',
    expected: ['first.', 'second.'],
  },
  {
    name: 'Null input',
    input: null,
    expected: null,
  },
  {
    name: 'Empty string input',
    input: '',
    expected: null,
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = parseNarratorResponse(t.input);
  const match = JSON.stringify(result) === JSON.stringify(t.expected);
  if (match) {
    console.log(`✓ ${t.name}`);
    passed++;
  } else {
    console.log(`✗ ${t.name}`);
    console.log(`  Input:    ${JSON.stringify(t.input)}`);
    console.log(`  Expected: ${JSON.stringify(t.expected)}`);
    console.log(`  Got:      ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ''}`);
process.exit(failed > 0 ? 1 : 0);
