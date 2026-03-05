# Deployment Guide

Complete deployment guide for LLM Fortress with the LLM Proxy service.

## Architecture

```
Internet
    ↓
Nginx (Port 80/443)
    ├─→ /                    → Static files (dist/)
    └─→ /api/llm-proxy/*     → LLM Proxy (localhost:3001)
                                    ↓
                              OpenAI API
```

## Prerequisites

- Ubuntu server with nginx installed
- Node.js 18+ installed
- PM2 installed globally (`sudo npm install -g pm2`)
- OpenAI API key (for fallback)

## Step 1: Build the Game

On your local machine or server:

```bash
cd /path/to/dorf-fortress-clone
npm install
npm run build
```

This creates the `dist/` folder with static files.

## Step 2: Deploy Static Files

Copy the `dist` folder to your server:

```bash
# From your local machine
scp -r dist/* user@yourserver:/var/www/llm-fortress/dist/

# Or on the server
cp -r dist/* /var/www/llm-fortress/dist/
```

## Step 3: Set Up LLM Proxy

On your server:

```bash
# Navigate to the proxy directory
cd /path/to/dorf-fortress-clone/llm-proxy

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env
```

Edit `.env`:
```bash
OPENAI_API_KEY=sk-your-actual-key-here
OPENAI_MODEL=gpt-4o-mini
PORT=3001
ALLOWED_ORIGINS=https://yourdomain.com
```

Start the proxy with PM2:
```bash
pm2 start server.js --name llm-proxy
pm2 save
pm2 startup  # Follow the instructions to enable auto-start
```

Verify it's running:
```bash
pm2 status
curl http://localhost:3001/health
```

## Step 4: Configure Nginx

Copy the example nginx config:

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/llm-fortress
```

Edit the config:
```bash
sudo nano /etc/nginx/sites-available/llm-fortress
```

Update these lines:
- `server_name yourdomain.com;` → your actual domain
- `root /var/www/llm-fortress/dist;` → your dist path

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/llm-fortress /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Step 5: Test Everything

### Test the game
Visit `http://yourdomain.com` and verify it loads.

### Test the proxy
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

### Test through nginx
```bash
curl https://yourdomain.com/api/llm-proxy/health
```

### Test the fallback
1. Stop your Ollama server temporarily
2. Open the game in a browser
3. Check the browser console - should show "Connected to thought engine (OpenAI)"
4. Dwarves should still get LLM-generated thoughts via the proxy

## Updating the Game

When you make changes:

```bash
# 1. Build locally
npm run build

# 2. Copy to server
scp -r dist/* user@yourserver:/var/www/llm-fortress/dist/

# 3. No need to restart anything - static files updated!
```

## Updating the Proxy

When you update proxy code:

```bash
# On the server
cd /path/to/llm-proxy
git pull  # or copy updated files
pm2 restart llm-proxy
pm2 logs llm-proxy  # Check logs
```

## Monitoring

### Check proxy status
```bash
pm2 status
pm2 logs llm-proxy
pm2 monit  # Real-time monitoring
```

### Check nginx logs
```bash
sudo tail -f /var/log/nginx/llm-fortress-access.log
sudo tail -f /var/log/nginx/llm-fortress-error.log
```

### Monitor OpenAI usage
Visit: https://platform.openai.com/usage

## Troubleshooting

### Proxy not responding
```bash
pm2 logs llm-proxy  # Check for errors
pm2 restart llm-proxy
```

### 502 Bad Gateway
- Check if proxy is running: `pm2 status`
- Check nginx error log: `sudo tail -f /var/log/nginx/llm-fortress-error.log`
- Verify port 3001 is correct in nginx config

### CORS errors
- Add your domain to `ALLOWED_ORIGINS` in proxy's `.env`
- Restart proxy: `pm2 restart llm-proxy`

### OpenAI errors
- Check API key is valid
- Verify you have credits: https://platform.openai.com/usage
- Check proxy logs: `pm2 logs llm-proxy`

## Security Checklist

- ✅ OpenAI API key stored in proxy's `.env` only (not in git)
- ✅ Proxy runs on localhost only (not exposed to internet)
- ✅ Nginx proxies requests securely
- ✅ CORS configured to only allow your domain
- ✅ SSL/TLS enabled (recommended)
- ✅ `.env` files in `.gitignore`

## Cost Management

Monitor your OpenAI usage at: https://platform.openai.com/usage

Set up usage limits:
1. Go to https://platform.openai.com/account/billing/limits
2. Set a monthly budget (e.g., $10)
3. Enable email alerts

Average costs:
- gpt-4o-mini: ~$0.15 per 1M input tokens
- Typical game session: < $0.01
- Heavy usage (100 players): ~$1-2/day

## Backup

Important files to backup:
- `/var/www/llm-fortress/dist/` (or regenerate from source)
- `/path/to/llm-proxy/.env` (contains API key)
- `/etc/nginx/sites-available/llm-fortress` (nginx config)

## Performance

The proxy is lightweight and can handle:
- 100+ requests/second on a basic VPS
- Concurrent requests are queued
- OpenAI rate limits apply (check your tier)

Monitor with:
```bash
pm2 monit
```

## Next Steps

- Set up SSL/TLS with Let's Encrypt (recommended)
- Configure firewall (ufw) to only allow ports 80, 443, and SSH
- Set up automated backups
- Configure log rotation
- Set up monitoring/alerting (optional)
