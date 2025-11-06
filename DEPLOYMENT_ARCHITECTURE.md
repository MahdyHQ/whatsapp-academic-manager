# 🚀 Deployment Architecture

## Overview

This project uses a **multi-platform deployment strategy** with three independent services:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1️⃣  NETLIFY → Frontend (Next.js 16)                           │
│     📁 whatsapp-service/frontend/                               │
│     🔗 https://ai-app-control.netlify.app/                      │
│                                                                 │
│  2️⃣  RAILWAY → Backend API (Python FastAPI)                    │
│     📁 backend/                                                 │
│     🔗 https://wam-api-production.up.railway.app/              │
│                                                                 │
│  3️⃣  RAILWAY → WhatsApp Service (Node.js/TypeScript)           │
│     📁 ../whatsapp-service-standalone/                          │
│     🔗 https://whatsapp-standalone-production.up.railway.app/  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ Frontend - Netlify

### Location
```
C:\Users\asd\Documents\GitHub\whatsapp-academic-manager\whatsapp-service\frontend\
```

### Configuration File
`netlify.toml` (in repository root)

```toml
[build]
  base = "whatsapp-service/frontend"
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "22"
```

### Watch Pattern
- **Watches**: `whatsapp-service/frontend/**`
- **Triggers on**: Any changes in the frontend directory

### Technology
- Framework: Next.js 16
- Runtime: Node.js 22.x
- Plugin: @netlify/plugin-nextjs

### Auto-Deploy
✅ **Enabled**: Pushes to main branch → Auto-deploys frontend

### URL
- Production: https://ai-app-control.netlify.app/

---

## 2️⃣ Backend API - Railway (Main Repo)

### Location
```
C:\Users\asd\Documents\GitHub\whatsapp-academic-manager\backend\
```

### Configuration File
`railway.toml` (in repository root)

```toml
[build]
builder = "NIXPACKS"
buildCommand = "cd backend && pip install -r requirements.txt"
watchPatterns = ["backend/**"]

[deploy]
startCommand = "cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT"
restartPolicyType = "ON_FAILURE"
```

### Watch Pattern
- **Watches**: `backend/**` ✅ (Correctly configured)
- **Triggers on**: Changes in backend directory ONLY
- **Does NOT trigger on**: 
  - ❌ Changes in `whatsapp-service/`
  - ❌ Changes in `whatsapp-service/frontend/`
  - ❌ Changes in `whatsapp-service-standalone/`

### Technology
- Framework: Python FastAPI
- Runtime: Python 3.12+
- Dependencies: requirements.txt

### Auto-Deploy
✅ **Enabled**: Pushes to main branch with backend changes → Auto-deploys

### URL
- Production: https://wam-api-production.up.railway.app/
- API Docs: https://wam-api-production.up.railway.app/docs

---

## 3️⃣ WhatsApp Service - Railway (Standalone Repo)

### Location
```
C:\Users\asd\Documents\GitHub\whatsapp-service-standalone\
```

### Configuration File
`railway.json` (in standalone repository)

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Watch Pattern
- **Watches**: Entire standalone repository
- **Triggers on**: Changes in standalone repo ONLY
- **Completely independent from main repo**

### Technology
- Framework: Node.js/TypeScript
- Runtime: Node.js >= 24.11.0
- Library: @whiskeysockets/baileys 7.0.0-rc.6

### Auto-Deploy
✅ **Enabled**: Pushes to standalone repo → Auto-deploys (independent)

### URL
- Production: (Will be assigned when you create Railway project)

---

## 🔒 Deployment Isolation Matrix

| Change Location | Netlify Deploys? | Railway Backend Deploys? | Railway Standalone Deploys? |
|----------------|------------------|--------------------------|----------------------------|
| `whatsapp-service/frontend/**` | ✅ YES | ❌ NO | ❌ NO |
| `backend/**` | ❌ NO | ✅ YES | ❌ NO |
| `whatsapp-service/**` (not frontend) | ❌ NO | ❌ NO | ❌ NO |
| `whatsapp-service-standalone/**` | ❌ NO | ❌ NO | ✅ YES |
| Root files (README, etc.) | ❌ NO | ❌ NO | ❌ NO |

---

## 📋 Deployment Checklist

### Initial Setup

#### Netlify (Frontend)
- [x] Repository connected to Netlify
- [x] Base directory: `whatsapp-service/frontend`
- [x] Build command: `npm run build`
- [x] Publish directory: `.next`
- [x] Node version: 22.x
- [x] Plugin: @netlify/plugin-nextjs
- [ ] Environment variables set in Netlify dashboard:
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_BACKEND_URL`
  - `NEXT_PUBLIC_API_KEY`

#### Railway (Backend)
- [ ] Railway project created for main repository
- [x] `railway.toml` configured with `backend/**` watch pattern
- [ ] Environment variables set in Railway dashboard:
  - `DATABASE_URL`
  - `WHATSAPP_SERVICE_URL`
  - `WHATSAPP_API_KEY`
  - `SECRET_KEY`
  - `JWT_SECRET_KEY`
  - All AI provider keys

#### Railway (Standalone WhatsApp Service)
- [ ] Create NEW GitHub repository: `whatsapp-service-standalone`
- [ ] Push standalone code to new repository
- [ ] Create NEW Railway project (separate from main)
- [ ] Connect to standalone GitHub repository
- [ ] Railway auto-detects Node.js via `railway.json`
- [ ] Environment variables set in Railway dashboard:
  - `API_KEY`
  - `AUTHORIZED_PHONES`
  - `NODE_ENV=production`
  - `AUTH_DIR=/tmp/auth_info`

---

## 🔄 Git Workflow for Deployments

### Deploying Frontend Changes
```bash
# Make changes in frontend
cd whatsapp-service/frontend
# Edit files...

# Commit and push
cd ../..  # Back to repo root
git add whatsapp-service/frontend/
git commit -m "feat: Update frontend UI"
git push origin main

# Result: ✅ Netlify auto-deploys frontend
#         ❌ Railway backend does NOT deploy
#         ❌ Railway standalone does NOT deploy
```

### Deploying Backend Changes
```bash
# Make changes in backend
cd backend
# Edit files...

# Commit and push
cd ..  # Back to repo root
git add backend/
git commit -m "feat: Add new API endpoint"
git push origin main

# Result: ❌ Netlify does NOT deploy
#         ✅ Railway backend auto-deploys
#         ❌ Railway standalone does NOT deploy
```

### Deploying Standalone WhatsApp Service
```bash
# Make changes in standalone repo
cd C:\Users\asd\Documents\GitHub\whatsapp-service-standalone
# Edit files...

# Commit and push to standalone repo
git add .
git commit -m "feat: Improve WhatsApp connection handling"
git push origin main

# Result: ❌ Netlify does NOT deploy
#         ❌ Railway backend does NOT deploy
#         ✅ Railway standalone auto-deploys
```

---

## 🎯 Communication Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ↓ HTTPS
┌─────────────────────────┐
│  NETLIFY (Frontend)     │
│  Next.js 16 App         │
│  https://ai-app-        │
│  control.netlify.app    │
└───────┬─────────────────┘
        │
        ├──→ API Calls ──→ ┌────────────────────────┐
        │                  │  RAILWAY (Backend)     │
        │                  │  FastAPI Service       │
        │                  │  https://wam-api-      │
        │                  │  production.up.        │
        │                  │  railway.app           │
        │                  └──────────┬─────────────┘
        │                             │
        └──→ Direct API ──→           ↓ Forwards requests
                           ┌────────────────────────┐
                           │  RAILWAY (WhatsApp)    │
                           │  Node.js/TypeScript    │
                           │  Baileys Library       │
                           │  https://whatsapp-     │
                           │  standalone-production │
                           │  .up.railway.app       │
                           └────────────────────────┘
```

---

## 🚨 Important Notes

### ✅ DO:
- Push frontend changes to main repo → Netlify deploys
- Push backend changes to main repo → Railway backend deploys
- Push standalone changes to standalone repo → Railway standalone deploys
- Keep environment variables separate for each platform

### ❌ DON'T:
- Don't expect Railway to deploy when you change frontend (it watches backend only)
- Don't expect Netlify to deploy when you change backend
- Don't push standalone changes to main repo (it won't deploy standalone)
- Don't mix deployment configurations

---

## 🔧 Troubleshooting

### Frontend Not Deploying on Netlify
1. Check Netlify dashboard → Deploys
2. Verify changes are in `whatsapp-service/frontend/`
3. Check build logs for errors
4. Verify Node version is 22.x

### Backend Not Deploying on Railway
1. Check Railway dashboard → Deployments
2. Verify changes are in `backend/` directory
3. Check `railway.toml` has correct watch pattern: `["backend/**"]`
4. Review build logs

### Standalone Not Deploying
1. Verify you pushed to the **standalone repository** (not main repo)
2. Check Railway project is connected to **standalone repo**
3. Verify `railway.json` exists in standalone repo
4. Check Railway build logs

### Wrong Service Deploying
- If changing frontend triggers backend deploy: Check `railway.toml` watch pattern
- If changing backend triggers frontend deploy: Check Netlify base directory
- Solution: Verify configuration files match this document

---

## 📚 Configuration Files Reference

### Main Repository Files
```
whatsapp-academic-manager/
├── railway.toml          ← Backend deployment config
├── netlify.toml          ← Frontend deployment config
├── backend/
│   └── requirements.txt  ← Python dependencies
└── whatsapp-service/
    └── frontend/
        └── package.json  ← Frontend dependencies
```

### Standalone Repository Files
```
whatsapp-service-standalone/
├── railway.json          ← Standalone deployment config
├── package.json          ← Node.js dependencies
├── server.ts             ← Main service
└── config.mjs            ← Configuration
```

---

## ✅ Verification Commands

### Verify Main Repo Configuration
```bash
cd C:\Users\asd\Documents\GitHub\whatsapp-academic-manager

# Check Railway config
cat railway.toml
# Should show: watchPatterns = ["backend/**"]

# Check Netlify config
cat netlify.toml
# Should show: base = "whatsapp-service/frontend"

# Check git remote
git remote -v
# Should show: MahdyHQ/whatsapp-academic-manager
```

### Verify Standalone Configuration
```bash
cd C:\Users\asd\Documents\GitHub\whatsapp-service-standalone

# Check Railway config
cat railway.json
# Should exist and have buildCommand/startCommand

# Check git remote (after setup)
git remote -v
# Should show: MahdyHQ/whatsapp-service-standalone (once created)
```

---

**Last Updated:** November 6, 2025

**Status:** ✅ Configurations verified and documented
