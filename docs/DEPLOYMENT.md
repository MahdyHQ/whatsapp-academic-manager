# 🚀 Production Deployment Guide

## Overview

This guide covers deploying the WhatsApp Academic Manager to production using **100% free services** that run 24/7.

---

## 🌐 Free Hosting Architecture

```
┌─────────────────────────────────────────────────────┐
│  PRODUCTION ARCHITECTURE (All Free!)                │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐         ┌──────────────┐         │
│  │   Vercel     │         │  Render.com  │         │
│  │  (Frontend)  │ ◄─────► │  (Backend)   │         │
│  │   Next.js    │   API   │   FastAPI    │         │
│  └──────────────┘         └──────────────┘         │
│         │                         │                 │
│         │                         │                 │
│         ▼                         ▼                 │
│  ┌──────────────┐         ┌──────────────┐         │
│  │   Supabase   │         │   Upstash    │         │
│  │ (PostgreSQL) │         │   (Redis)    │         │
│  │   500MB Free │         │  10K req/day │         │
│  └──────────────┘         └──────────────┘         │
│                                                      │
│  ┌─────────────────────────────────────────┐       │
│  │  AI Providers (All Free Tiers)          │       │
│  │  • Gemini 2.0: 1,500 req/day           │       │
│  │  • GPT-4o-mini: $5 credit              │       │
│  │  • Claude 3.5: Free tier               │       │
│  │  • Llama 3.2: Local (unlimited)        │       │
│  │  • Mistral: Free tier                  │       │
│  └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## 1️⃣ Backend Deployment (Render.com)

### Step 1: Create Render Account

1. Go to https://render.com/
2. Click **"Get Started for Free"**
3. Sign up with your **GitHub account**

### Step 2: Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository: `MahdyHQ/whatsapp-academic-manager`
3. Configure the service:

```yaml
Name: whatsapp-academic-backend
Region: Oregon (US West) or closest to you
Branch: main
Root Directory: backend
Runtime: Python 3.12
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
Instance Type: Free (512 MB RAM, 0.1 CPU)
```

### Step 3: Add Environment Variables

In the Render dashboard, go to **Environment** and add:

```bash
# Database
DATABASE_URL=your_supabase_connection_string

# Redis
REDIS_URL=your_upstash_redis_url

# AI Providers
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
MISTRAL_API_KEY=your_mistral_api_key

# WhatsApp
WHATSAPP_SESSION_PATH=/opt/render/.wwebjs_auth

# Security
SECRET_KEY=your_generated_secret_key_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# CORS (add your frontend URL)
ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:3000
```

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Start your FastAPI server
3. Your backend will be live at: `https://whatsapp-academic-backend.onrender.com`

### Important Notes:

⚠️ **Free Tier Limitations:**
- Service spins down after 15 minutes of inactivity
- Cold starts take ~30 seconds
- 750 hours/month free (enough for 24/7 with one service)

💡 **Keep Service Active:**
Create a cron job to ping your service every 10 minutes:

```bash
# Use cron-job.org (free service)
URL: https://whatsapp-academic-backend.onrender.com/health
Interval: Every 10 minutes
```

---

## 2️⃣ Frontend Deployment (Vercel)

### Step 1: Create Vercel Account

1. Go to https://vercel.com/
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"**

### Step 2: Import Project

1. Click **"Add New..."** → **"Project"**
2. Import `MahdyHQ/whatsapp-academic-manager`
3. Configure the project:

```yaml
Framework Preset: Next.js
Root Directory: frontend
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Node Version: 18.x
```

### Step 3: Add Environment Variables

```bash
NEXT_PUBLIC_API_URL=https://whatsapp-academic-backend.onrender.com/v1
NEXT_PUBLIC_APP_NAME=WhatsApp Academic Manager
NEXT_PUBLIC_ENV=production
```

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel will:
   - Build your Next.js app
   - Deploy to global CDN
   - Provide HTTPS automatically
3. Your frontend will be live at: `https://whatsapp-academic-manager.vercel.app`

### Custom Domain (Optional - Free):

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Update DNS records as instructed
4. SSL certificate is automatically provisioned

---

## 3️⃣ Database Setup (Supabase)

### Step 1: Create Supabase Project

1. Go to https://supabase.com/
2. Click **"Start your project"**
3. Sign in with GitHub
4. Click **"New project"**

### Step 2: Configure Project

```yaml
Name: whatsapp-academic-db
Database Password: [Generate strong password]
Region: Choose closest to your Render region
Pricing Plan: Free (500 MB, 50k rows)
```

### Step 3: Get Connection String

1. Go to **Settings** → **Database**
2. Copy **Connection string** (URI format):

```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

3. Add this to Render environment variables as `DATABASE_URL`

### Step 4: Run Migrations

```bash
# From your local machine
export DATABASE_URL="your_supabase_connection_string"

# Run migrations
cd backend
alembic upgrade head
```

### Step 5: Enable Real-time (Optional)

1. Go to **Database** → **Replication**
2. Enable real-time for tables: `events`, `messages`, `notifications`

---

## 4️⃣ Redis Setup (Upstash)

### Step 1: Create Upstash Account

1. Go to https://upstash.com/
2. Click **"Get Started"**
3. Sign in with GitHub

### Step 2: Create Redis Database

1. Click **"Create Database"**
2. Configure:

```yaml
Name: whatsapp-academic-redis
Type: Regional
Region: Choose closest to Render region
Eviction: noeviction
TLS: Enabled
```

### Step 3: Get Connection URL

1. Click on your database
2. Copy **Redis URL** (TLS):

```
redis://default:[PASSWORD]@[HOST]:[PORT]
```

3. Add to Render as `REDIS_URL`

### Free Tier Limits:

- 10,000 commands per day
- 256 MB storage
- Perfect for job queues and caching

---

## 5️⃣ WhatsApp Web Integration

### Important: WhatsApp Session Persistence

Render's free tier has **ephemeral file system**, meaning WhatsApp sessions are lost on restart.

### Solution 1: Use Persistent Storage (Recommended)

```python
# backend/services/whatsapp.py
from wwebjs import Client, LocalAuth
import os

# Store session in database or external storage
client = Client(
    authStrategy=LocalAuth({
        'dataPath': os.getenv('WHATSAPP_SESSION_PATH', './.wwebjs_auth')
    })
)
```

### Solution 2: Manual Re-authentication

On first deployment:
1. Check Render logs for QR code
2. Scan with WhatsApp mobile app
3. Session will persist until service restarts

### Solution 3: Use External Storage (Advanced)

Store session files in Supabase Storage:

```python
# Backup session to Supabase after authentication
import supabase
client = supabase.create_client(url, key)
client.storage.from_('whatsapp-sessions').upload(
    'session.json',
    session_data
)
```

---

## 6️⃣ Environment Variables Summary

### Render (Backend)

```bash
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
REDIS_URL=redis://default:password@host.upstash.io:6379
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=...
SECRET_KEY=your-secret-key-min-32-chars
ALLOWED_ORIGINS=https://whatsapp-academic-manager.vercel.app
```

### Vercel (Frontend)

```bash
NEXT_PUBLIC_API_URL=https://whatsapp-academic-backend.onrender.com/v1
```

---

## 7️⃣ CI/CD Setup (Automatic Deployment)

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Render
        run: |
          curl -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        run: |
          npx vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Auto-Deploy (Default):

Both Render and Vercel automatically deploy when you push to `main` branch.

---

## 8️⃣ Monitoring & Logs

### Render Logs

1. Go to your service dashboard
2. Click **"Logs"** tab
3. View real-time logs

### Vercel Logs

1. Go to your project
2. Click **"Deployments"**
3. Click on a deployment → **"View Deployment Logs"**

### Supabase Logs

1. Go to **Logs** section
2. View database queries and errors

### Set Up Alerts (Optional - Free)

Use **UptimeRobot** (free):
1. Sign up at https://uptimerobot.com/
2. Add monitors for:
   - Backend: `https://whatsapp-academic-backend.onrender.com/health`
   - Frontend: `https://whatsapp-academic-manager.vercel.app`
3. Get email/SMS alerts if services go down

---

## 9️⃣ SSL/HTTPS

✅ **Automatically Enabled:**
- Vercel: Automatic HTTPS with Let's Encrypt
- Render: Automatic HTTPS with Let's Encrypt
- Supabase: TLS enabled by default
- Upstash: TLS enabled by default

No configuration needed!

---

## 🔟 Performance Optimization

### Backend (Render)

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Enable caching
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

@app.on_event("startup")
async def startup():
    redis = await aioredis.from_url(os.getenv("REDIS_URL"))
    FastAPICache.init(RedisBackend(redis), prefix="fastapi-cache")
```

### Frontend (Vercel)

```javascript
// next.config.js
module.exports = {
  images: {
    domains: ['avatars.githubusercontent.com'],
  },
  compress: true,
  swcMinify: true,
  experimental: {
    optimizeCss: true,
  },
}
```

---

## 1️⃣1️⃣ Backup Strategy

### Database Backups (Supabase)

Free tier includes:
- Daily automatic backups (7 days retention)
- Point-in-time recovery

Manual backup:
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Redis Backups (Upstash)

Upstash automatically backs up data.

### Code Backups

GitHub is your backup! All code is version controlled.

---

## 1️⃣2️⃣ Scaling (When You Outgrow Free Tier)

### When to Upgrade:

**Backend (Render):**
- Upgrade when: >750 hours/month needed
- Cost: $7/month for always-on service

**Frontend (Vercel):**
- Free tier is generous (unlimited bandwidth)
- Upgrade when: Need custom domains or team features

**Database (Supabase):**
- Upgrade when: >500 MB data or >50k rows
- Cost: $25/month for Pro tier (8 GB)

**Redis (Upstash):**
- Upgrade when: >10k commands/day
- Cost: $10/month for 100k commands/day

---

## 1️⃣3️⃣ Troubleshooting

### Backend Not Starting

```bash
# Check Render logs
# Common issues:
# 1. Missing environment variables
# 2. Python version mismatch
# 3. Dependency installation failed

# Fix: Ensure requirements.txt has all dependencies
pip freeze > requirements.txt
```

### Frontend Build Failed

```bash
# Check Vercel logs
# Common issues:
# 1. Missing environment variables
# 2. Build command incorrect
# 3. Node version mismatch

# Fix: Set correct Node version in Vercel settings
```

### Database Connection Failed

```bash
# Test connection locally
psql $DATABASE_URL

# Common issues:
# 1. Wrong password
# 2. IP not whitelisted (Supabase allows all by default)
# 3. Connection string format incorrect
```

### WhatsApp Session Lost

```bash
# Solution: Implement session backup to Supabase Storage
# Or: Re-scan QR code from Render logs
```

---

## 1️⃣4️⃣ Security Checklist

- ✅ All environment variables stored securely (not in code)
- ✅ HTTPS enabled on all services
- ✅ CORS configured to allow only your frontend
- ✅ Rate limiting enabled on API
- ✅ JWT tokens with expiration
- ✅ Database credentials rotated regularly
- ✅ API keys kept secret (never committed to Git)

---

## 1️⃣5️⃣ Cost Summary (Monthly)

```
┌─────────────────────────────────────────┐
│  FREE TIER COSTS                        │
├─────────────────────────────────────────┤
│  Render.com (Backend)        $0.00      │
│  Vercel (Frontend)           $0.00      │
│  Supabase (Database)         $0.00      │
│  Upstash (Redis)             $0.00      │
│  Gemini AI (1,500 req/day)   $0.00      │
│  Claude AI (Free tier)       $0.00      │
│  Mistral AI (Free tier)      $0.00      │
│  Llama 3.2 (Local)           $0.00      │
│  OpenAI (After $5 credit)    ~$5-10     │
├─────────────────────────────────────────┤
│  TOTAL:                      $0-10/mo   │
└─────────────────────────────────────────┘
```

---

## 1️⃣6️⃣ Next Steps

1. ✅ Deploy backend to Render
2. ✅ Deploy frontend to Vercel
3. ✅ Set up Supabase database
4. ✅ Configure Upstash Redis
5. ✅ Add all environment variables
6. ✅ Test WhatsApp connection
7. ✅ Monitor with UptimeRobot
8. ✅ Set up domain (optional)

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Upstash Documentation](https://docs.upstash.com/)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

---

**Last Updated**: October 31, 2025  
**Need Help?** [Open an issue](https://github.com/MahdyHQ/whatsapp-academic-manager/issues)