# LLM Fallback System Explained

## How the Three-Tier Fallback Works

The game uses a three-tier fallback system for generating text (dwarf thoughts, names, biome descriptions, etc.):

```
1. Primary: Ollama Server
         ↓ (if fails)
2. Fallback: OpenAI via Proxy
         ↓ (if fails)
3. Final: Local Deterministic Generation
```

---

## Tier 1: Primary Ollama Server

**URL**: Configured in `.env` as `VITE_OLLAMA_URL`
**Model**: Configured in `.env` as `VITE_OLLAMA_MODEL`

### When it's used:
- **Always attempted first** for all LLM requests
- Includes: dwarf thoughts, speech, names, biome names, scenarios

### When it fails:
The game falls back to Tier 2 if:
- ❌ **Network error** - Server unreachable or connection timeout
- ❌ **HTTP error** - Server returns 4xx or 5xx status
- ❌ **Request timeout** - Takes longer than 5 seconds
- ❌ **Invalid response** - Server returns malformed data
- ❌ **Server overload** - 503 Service Unavailable

**Example failure logs:**
```
[LLM/Ollama] Generation failed: Failed to fetch
[LLM/Ollama] Server error 503: Service Unavailable
```

---

## Tier 2: OpenAI Fallback (via Proxy)

**URL**: `/api/llm-proxy/generate` (relative, proxied by nginx)
**Proxy**: Runs on `localhost:3001` (server-side only)
**Model**: `gpt-4o-mini` (configured in proxy's `.env`)

### When it's used:
- **Only when Tier 1 (Ollama) fails**
- Automatically triggered by the game client
- Seamless to the user

### When it fails:
The game falls back to Tier 3 if:
- ❌ **Proxy not running** - PM2 service stopped
- ❌ **OpenAI API error** - Invalid key, rate limit, quota exceeded
- ❌ **Network error** - Can't reach proxy or OpenAI
- ❌ **Invalid response** - Proxy returns error

**Example failure logs:**
```
[LLM/OpenAI] Proxy error 500: Internal server error
[LLM/OpenAI] Generation via proxy failed: Proxy error: 401
```

### Cost tracking:
Each request logs token usage:
```
[LLM/OpenAI] ✓ Response (45 chars) - Tokens: 67
```

---

## Tier 3: Local Deterministic Generation

**Source**: `src/llm/fallbacks.js`
**Type**: Offline, no network required

### When it's used:
- **When both Tier 1 and Tier 2 fail**
- Also used during initial load before LLM health check completes

### What it generates:
- **Names**: Seeded random from dwarf name pools
  - Examples: "Urist the Wanderer", "Bomrek Stone-Face"
  - Based on personality traits
- **Thoughts**: Template-based fallback phrases
  - Examples: "I wonder what today will bring..."
- **Biomes**: "Mysterious Wilderness"
- **Scenarios**: Not generated (uses defaults)

### Advantages:
- ✅ **Always works** - No network required
- ✅ **Fast** - Instant generation
- ✅ **Consistent** - Same entity ID = same name
- ✅ **Free** - No API costs

### Limitations:
- ❌ Less creative than LLM
- ❌ Repetitive phrases
- ❌ No contextual awareness

---

## What's in the Build Bundle?

When you run `npm run build`, the `dist/` folder contains:

### ✅ **Included** (visible to users):
1. **Ollama URL** - From `VITE_OLLAMA_URL` in `.env`
   - Default: `http://localhost:11434`
   - Your production: `https://llm.kristiantalley.com`
2. **Ollama Model** - From `VITE_OLLAMA_MODEL` in `.env`
   - Your production: `incept5/llama3.1-claude:latest`
3. **Proxy URL** - Relative path `/api/llm-proxy/generate`
   - This is public but only works on your domain (nginx proxies it)

### ❌ **NOT Included** (secure):
1. **OpenAI API Key** - Stored only in `llm-proxy/.env` on server
2. **Proxy service code** - Not in the game bundle
3. **Server environment variables** - Stay on the server

### Security implications:
- ✅ Users can see your Ollama URL (but it's public anyway)
- ✅ Users can see the model name (public info)
- ✅ Users can see the proxy path (but need the API key to use OpenAI)
- ❌ Users **cannot** access your OpenAI API key
- ❌ Users **cannot** use your OpenAI account

---

## Configuration for Different Deployments

### **For Public Distribution**
If sharing your game with others, update `.env` before building:

```bash
# .env (for public builds)
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.1
```

Users will need to:
1. Run their own Ollama server locally
2. Or configure their own server URL

### **For Your Production Server**
Your current setup:

```bash
# .env (for your production)
VITE_OLLAMA_URL=https://llm.kristiantalley.com
VITE_OLLAMA_MODEL=incept5/llama3.1-claude:latest
```

This points to your server, which is fine for your own deployment.

### **For Development**
Create `.env.local` (not committed to git):

```bash
# .env.local (development only)
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.1
```

---

## Testing the Fallback Behavior

### **Test Tier 1 → Tier 2 fallback:**

1. Stop your Ollama server (or disconnect it)
2. Start the game
3. Check console logs:
   ```
   [LLM/Ollama] Generation failed: Failed to fetch
   [LLM] Attempting OpenAI fallback...
   [LLM/OpenAI] ✓ Response (52 chars) - Tokens: 73
   Connected to thought engine (OpenAI)
   ```

### **Test Tier 2 → Tier 3 fallback:**

1. Stop the proxy service: `pm2 stop llm-proxy`
2. Disconnect from Ollama
3. Start the game
4. Check console logs:
   ```
   [LLM/Ollama] Generation failed: Failed to fetch
   [LLM] Attempting OpenAI fallback...
   [LLM/OpenAI] Proxy error 502: Bad Gateway
   Thought engine offline - using fallback thoughts.
   ```

### **Test all tiers working:**

1. Ensure Ollama is running
2. Ensure proxy is running: `pm2 status`
3. Start the game
4. Check console logs:
   ```
   [LLM/Ollama] ✓ Received response (42 chars)
   Connected to thought engine (Ollama)
   ```

---

## Monitoring in Production

### **Check which tier is being used:**

Look at the loading screen status or console logs:
- `"Connected to thought engine (Ollama)"` → Tier 1 ✅
- `"Connected to thought engine (OpenAI)"` → Tier 2 ⚠️
- `"Thought engine offline - using fallback thoughts"` → Tier 3 ❌

### **Monitor OpenAI usage:**

```bash
pm2 logs llm-proxy | grep "Tokens:"
```

Shows token usage per request:
```
[Proxy] Success: 45 chars returned
Tokens: { prompt: 52, completion: 15, total: 67 }
```

Track costs at: https://platform.openai.com/usage

### **Typical scenarios:**

- **Normal operation**: Tier 1 (Ollama) handles 100% of requests
- **Ollama overload**: Tier 2 (OpenAI) kicks in temporarily
- **Both down**: Tier 3 (Local) ensures game still playable

---

## Summary

✅ **Three-tier fallback ensures game always works**
✅ **OpenAI key never exposed to users** (server-side only)
✅ **Ollama URL is configurable** (via `.env`)
✅ **Build bundle is safe to distribute** (no secrets)
✅ **Transparent monitoring** (console logs show which tier)

The fallback only activates when the primary Ollama server has issues - network errors, timeouts, overload, or unavailability. OpenAI is a safety net, not the primary path.
