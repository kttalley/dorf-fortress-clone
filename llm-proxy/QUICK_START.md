# LLM Proxy - Quick Start

## 🚀 Fast Setup (5 minutes)

### 1. Install Dependencies
```bash
cd llm-proxy
npm install
```

### 2. Configure
```bash
cp .env.example .env
nano .env
```

Add your OpenAI key:
```
OPENAI_API_KEY=sk-your-actual-key-here
```

### 3. Test Locally
```bash
npm start
```

In another terminal:
```bash
curl http://localhost:3001/health
```

Should see: `{"status":"ok","hasApiKey":true,...}`

### 4. Deploy on Server

**Install PM2:**
```bash
sudo npm install -g pm2
```

**Start the service:**
```bash
pm2 start server.js --name llm-proxy
pm2 save
pm2 startup  # Run the command it outputs
```

**Verify:**
```bash
pm2 status
pm2 logs llm-proxy
```

### 5. Configure Nginx

Add to your nginx config:
```nginx
location /api/llm-proxy/ {
    proxy_pass http://localhost:3001/api/;
    proxy_read_timeout 30s;
}
```

Reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 6. Test Through Nginx

```bash
curl https://yourdomain.com/api/llm-proxy/health
```

## ✅ Done!

Your game now has secure OpenAI fallback. The proxy:
- Runs on localhost:3001 (not exposed to internet)
- Keeps API key server-side
- Automatically starts on boot (via PM2)
- Logs all requests for monitoring

## 📊 Monitoring

```bash
pm2 logs llm-proxy          # View logs
pm2 monit                   # Resource usage
pm2 restart llm-proxy       # Restart service
```

## 💰 Cost

- gpt-4o-mini: ~$0.15 per 1M tokens
- Typical game: < $0.01 per session
- Set limits at: https://platform.openai.com/account/billing/limits

## 🔒 Security

✅ API key is server-side only
✅ Not in git (`.env` is gitignored)
✅ Not exposed to users
✅ CORS restricted to your domain

## Need Help?

See the full [README.md](./README.md) for detailed docs.
