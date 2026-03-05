/**
 * LLM Proxy Server
 * Securely proxies OpenAI API requests, keeping the API key server-side
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Middleware
app.use(express.json());

// CORS - allow requests from your game
// Since both services are on the same server, we can be restrictive
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:4173'], // Vite dev/preview
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!OPENAI_API_KEY,
    model: OPENAI_MODEL
  });
});

/**
 * Main proxy endpoint for text generation
 * POST /api/generate
 * Body: { prompt, maxTokens, temperature, stop }
 */
app.post('/api/generate', async (req, res) => {
  try {
    // Validate API key is configured
    if (!OPENAI_API_KEY) {
      console.error('[Proxy] No OpenAI API key configured');
      return res.status(500).json({
        error: 'OpenAI API key not configured on server'
      });
    }

    const {
      prompt,
      maxTokens = 100,
      temperature = 0.8,
      stop = ['\n\n', 'Human:', 'User:']
    } = req.body;

    // Validate request
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Log request (without full prompt to keep logs clean)
    console.log(`[Proxy] Request: ${prompt.substring(0, 50)}... (${prompt.length} chars)`);

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: maxTokens,
        temperature,
        stop,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Proxy] OpenAI error ${response.status}:`, errorText);
      return res.status(response.status).json({
        error: `OpenAI API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || '';

    console.log(`[Proxy] Success: ${result.length} chars returned`);

    // Return the generated text
    res.json({
      response: result,
      model: OPENAI_MODEL,
      usage: data.usage // Include token usage for monitoring
    });

  } catch (error) {
    console.error('[Proxy] Error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Proxy] LLM Proxy server running on port ${PORT}`);
  console.log(`[Proxy] OpenAI API key: ${OPENAI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
  console.log(`[Proxy] Model: ${OPENAI_MODEL}`);
  console.log(`[Proxy] Health check: http://localhost:${PORT}/health`);
});
