# LLM Proxy Server

Secure proxy service for OpenAI API requests from LLM Fortress game.

## Purpose

This proxy keeps your OpenAI API key server-side and secure, while allowing the game to use OpenAI as a fallback when the primary Ollama server is overloaded.

## Setup

### 1. Install Dependencies

```bash
cd llm-proxy
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env  # Add your OpenAI API key
```

Edit `.env`:
```
OPENAI_API_KEY=sk-your-actual-api-key-here
OPENAI_MODEL=gpt-4o-mini
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com
```

### 3. Run the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**Production (with PM2 - recommended):**
```bash
# Install PM2 globally if not already installed
sudo npm install -g pm2

# Start the service
pm2 start server.js --name llm-proxy

# Make it start on system boot
pm2 startup
pm2 save
```

## Testing

### Health Check
```bash
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "ok",
  "hasApiKey": true,
  "model": "gpt-4o-mini"
}
```

### Test Generation
```bash
curl -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "You are a dwarf. Express a brief thought.",
    "maxTokens": 50,
    "temperature": 0.8
  }'
```

## Nginx Configuration

Add this to your nginx config to proxy `/api/llm-proxy` to this service:

```nginx
location /api/llm-proxy/ {
    proxy_pass http://localhost:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Increase timeout for LLM responses
    proxy_read_timeout 30s;
    proxy_connect_timeout 10s;
}
```

Then reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Security

- ✅ API key is stored server-side only (in `.env`)
- ✅ Not exposed in client-side JavaScript
- ✅ Only accessible from your game's domain (CORS)
- ✅ Runs on localhost, not exposed to internet directly
- ✅ Nginx handles SSL/TLS termination

## Monitoring

### View Logs (PM2)
```bash
pm2 logs llm-proxy
```

### Check Status
```bash
pm2 status
```

### Monitor Resource Usage
```bash
pm2 monit
```

## Troubleshooting

### Port Already in Use
Change `PORT` in `.env` to a different port (e.g., 3002)

### CORS Errors
Add your production domain to `ALLOWED_ORIGINS` in `.env`

### OpenAI API Errors
- Check your API key is valid
- Ensure you have credits in your OpenAI account
- Check the logs: `pm2 logs llm-proxy`

## Cost Monitoring

The proxy logs token usage for each request. Monitor your OpenAI dashboard:
https://platform.openai.com/usage

Typical costs with gpt-4o-mini:
- ~$0.15 per 1M input tokens
- ~$0.60 per 1M output tokens
- Average game session: < $0.01
