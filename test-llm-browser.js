// Browser-compatible test
async function testLLMFromBrowser() {
  const OLLAMA_URL = 'https://llm.kristiantalley.com';
  
  try {
    console.log('[Test] Starting LLM connection check...');
    console.log('[Test] URL:', OLLAMA_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[Test] Request timeout, aborting...');
      controller.abort();
    }, 5000);
    
    try {
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('[Test] Response received!');
      console.log('[Test] Status:', response.status);
      console.log('[Test] OK:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Test] ✓ LLM IS CONNECTED');
        console.log('[Test] Models:', data.models?.length);
        return true;
      }
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.log('[Test] ✗ Error:', error.message);
    console.log('[Test] Error type:', error.constructor.name);
    return false;
  }
}

// Run it
testLLMFromBrowser().then(connected => {
  console.log('[Test] Final: LLM', connected ? 'CONNECTED ✓' : 'NOT CONNECTED ✗');
  window.llmTestResult = connected;
});
