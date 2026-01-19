// ... existing code ...

/**
 * Show a speech bubble for dwarf conversation
 * @param {object} speaker - Speaking dwarf
 * @param {object} listener - Listening dwarf
 * @param {string} text - Speech text
 */
export function showSpeech(speaker, listener, text) {
  if (!containerEl) return;
  
  const id = `speech-${speaker.id}-${Date.now()}`;
  const bubble = createBubble(speaker, text, 'speech', listener);
  
  activeBubbles.set(id, {
    element: bubble,
    dwarf: speaker,
    type: 'speech',
    expiry: Date.now() + SPEECH_DURATION,
  });
  
  containerEl.appendChild(bubble);
  positionBubble(bubble, speaker, 'speech');
  
  // Add to conversation toast
  addSpeechMessage(speaker, listener, text);
  
  // Auto-remove after duration
  setTimeout(() => removeBubble(id), SPEECH_DURATION);
}

// ... existing code ...

/**
 * Show a thought bubble for dwarf thinking
 * @param {object} dwarf - Thinking dwarf
 * @param {string} text - Thought text
 */
export function showThought(dwarf, text) {
  if (!containerEl) return;
  
  const id = `thought-${dwarf.id}-${Date.now()}`;
  const bubble = createBubble(dwarf, text, 'thought');
  
  activeBubbles.set(id, {
    element: bubble,
    dwarf: dwarf,
    type: 'thought',
    expiry: Date.now() + THOUGHT_DURATION,
  });
  
  containerEl.appendChild(bubble);
  positionBubble(bubble, dwarf, 'thought');
  
  // Add to conversation toast
  addThoughtMessage(dwarf, text);
  
  // Auto-remove after duration
  setTimeout(() => removeBubble(id), THOUGHT_DURATION);
}