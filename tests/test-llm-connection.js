const OLLAMA_URL = 'https://llm.kristiantalley.com';

async function testConnection() {
  try {
    console.log('Testing connection to:', OLLAMA_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      console.log('Sending request...');
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✓ LLM SERVER IS CONNECTED!');
        console.log('Models available:', data.models?.length || 0);
        if (data.models) {
          data.models.slice(0, 3).forEach(m => console.log('  -', m.name));
        }
        return true;
      } else {
        console.log('✗ Server returned error status');
        return false;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.log('✗ Connection failed:', error.message);
    return false;
  }
}

testConnection().then(result => {
  console.log('\nFinal result:', result ? 'CONNECTED ✓' : 'NOT CONNECTED ✗');
  process.exit(result ? 0 : 1);
});
