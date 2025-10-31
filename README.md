# 🎓 WhatsApp Academic Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![React 18.3](https://img.shields.io/badge/react-18.3-61dafb.svg)](https://reactjs.org/)
[![Next.js 15](https://img.shields.io/badge/next.js-15-black.svg)](https://nextjs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/MahdyHQ/whatsapp-academic-manager)](https://github.com/MahdyHQ/whatsapp-academic-manager/issues)
[![GitHub Stars](https://img.shields.io/github/stars/MahdyHQ/whatsapp-academic-manager)](https://github.com/MahdyHQ/whatsapp-academic-manager/stargazers)

> **AI-Powered Academic Calendar & Task Manager** - Transform your WhatsApp academic chats into an intelligent, color-coded priority system with multi-AI analysis, smart notifications, and real-time tracking.

---

## 🌟 Overview

The **WhatsApp Academic Management System** is a cutting-edge, fully automated solution that monitors your academic WhatsApp groups and transforms chaotic messages into an organized, intelligent calendar system. Using 5 state-of-the-art AI providers (all with **free tiers**), it automatically detects deadlines, prioritizes tasks, and keeps you on track with smart notifications.

### ✨ Key Highlights

- 🤖 **Multi-AI Intelligence** - 5 AI providers with automatic fallback (Gemini 2.0, GPT-4o-mini, Claude 3.5, Llama 3.2, Mistral Large 2)
- 🎨 **8-Tier Color Priority System** - From 🔴 CRITICAL to 🟣 OPTIONAL
- 📱 **Real-Time WhatsApp Integration** - Monitors groups 24/7
- 📅 **Interactive Calendar Dashboard** - Beautiful, responsive UI with FullCalendar
- 🔔 **Smart Notifications** - Priority-based alerts across multiple channels
- 🌐 **100% Free to Deploy** - Uses only free-tier services (Render, Vercel, Supabase)
- 🚀 **GitHub Codespaces Ready** - Develop entirely in the browser

---

## 🎯 Features

### 🤖 AI-Powered Analysis
- **5 AI Providers** with automatic selection based on workload and accuracy needs
- **Confidence Scoring** (⚡⚡⚡ 90-100%, ⚡⚡ 70-89%, ⚡ 50-69%)
- **Context-Aware Understanding** - Detects deadline changes, corrections, and urgency
- **Multi-Language Support** - Works in 10+ languages
- **Entity Extraction** - Course names, deadlines, locations, professor names, grades

### 🎨 8-Tier Priority System

| Priority | Color | Use Case | Notification Schedule |
|----------|-------|----------|----------------------|
| 🔴 CRITICAL | Red | Exams <24h, urgent changes | 4 alerts (24h, 6h, 3h, 1h) |
| 🟠 HIGH | Orange | Major assignments 48h-1 week | 3 alerts (48h, 12h, 2h) |
| 🟡 MEDIUM | Yellow | Regular assignments, lectures | 2 alerts (24h, 3h) |
| 🟢 LOW | Green | General announcements | 1 alert (24h) |
| 🔵 INFO | Blue | Schedule changes, updates | Email digest only |
| 🟣 OPTIONAL | Purple | Extra credit, supplementary | No auto-alerts |
| ⚫ ARCHIVED | Gray | Past events, completed tasks | No alerts |
| ⚪ UNPROCESSED | White | Pending AI analysis | Processing queue |

### 📊 Smart Features

```
┌─────────────────────────────────────────────────────┐
│  🎯 PRIORITY OVERVIEW                               │
│  🔴 2 Critical  🟠 5 High  🟡 8 Medium             │
│  🟢 12 Low      🔵 4 Info  🟣 3 Optional           │
├─────────────────────────────────────────────────────┤
│  ��� NEXT 48 HOURS                                    │
│  🔴 Math Final Exam - Tomorrow 9:00 AM              │
│     📍 Hall B  📚 Ch. 5-10  ⚡⚡⚡ 98% confidence  │
│                                                      │
│  🟠 Physics Quiz - Nov 2, 2:00 PM                   │
│     📍 Lab 301  🔬 Mechanics  ⚡⚡ 95% confidence   │
└─────────────────────────────────────────────────────┘
```

---

## 🏗️ Technology Stack (October 2025)

### Backend
```python
Python 3.12
├── FastAPI 0.115+          # Modern async web framework
├── LangChain 0.3+          # AI orchestration
├── transformers 4.45+      # NLP & entity extraction
├── spaCy 3.8               # Advanced linguistics
├── Redis 7.4+              # Job queue & caching
├── PostgreSQL 17           # Primary database
└── Supabase                # Real-time subscriptions
```

### Frontend
```javascript
React 18.3
├── Next.js 15              # Server-side rendering
├── Tailwind CSS 4          # Utility-first styling
├── FullCalendar 7+         # Interactive calendar
└── Framer Motion           # Smooth animations
```

### AI Providers (All Free Tiers)
```
🤖 Gemini 2.0 Flash      → 1,500 requests/day (Primary)
🤖 GPT-4o-mini           → $5 free credit (Accuracy)
🤖 Claude 3.5 Haiku      → Free tier (Reasoning)
🤖 Llama 3.2 (Ollama)    → Unlimited (Local fallback)
🤖 Mistral Large 2       → Free tier (Batch processing)
```

---

## 🚀 Quick Start

### Option 1: GitHub Codespaces (Recommended - No Local Setup)

1. **Fork this repository**
2. **Open in Codespaces**:
   ```bash
   # Click: Code → Codespaces → Create codespace on main
   ```
3. **Install dependencies** (automatic):
   ```bash
   pip install -r requirements.txt
   npm install
   ```
4. **Configure environment**:
   ```bash
   cp .env.example .env
   # Add your free API keys (see API Setup below)
   ```
5. **Run the bot**:
   ```bash
   python bot.py
   ```

### Option 2: Local Development

#### Prerequisites
- Python 3.12+
- Node.js 18+
- PostgreSQL 17 or Supabase account
- Redis (or Upstash free tier)

#### Installation

```bash
# Clone the repository
git clone https://github.com/MahdyHQ/whatsapp-academic-manager.git
cd whatsapp-academic-manager

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys
```

---

## 🔑 API Keys Setup (All Free!)

### 1. Google Gemini 2.0 Flash (Primary AI - 1,500 req/day)
```bash
# Get your key: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. OpenAI GPT-4o-mini ($5 Free Credit)
```bash
# Sign up: https://platform.openai.com/signup
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Anthropic Claude 3.5 Haiku (Free Tier)
```bash
# Get key: https://console.anthropic.com/
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 4. Mistral Large 2 (Free Tier)
```bash
# Sign up: https://console.mistral.ai/
MISTRAL_API_KEY=your_mistral_api_key_here
```

### 5. Llama 3.2 (Local - No API Key Needed)
```bash
# Install Ollama: https://ollama.ai/
ollama pull llama3.2
# Runs locally, 100% free, no internet required!
```

---

## 🌐 Free Cloud Deployment (24/7 Running)

### Backend: Render.com (Free - 750 hours/month)

1. **Sign up**: https://render.com/ (use GitHub login)
2. **Create Web Service**:
   - Repository: `MahdyHQ/whatsapp-academic-manager`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `python bot.py`
3. **Add environment variables** (all API keys)
4. **Deploy** - Auto-runs 24/7! ✅

### Frontend: Vercel (Free - Unlimited)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from frontend folder
cd frontend
vercel --prod
```

### Database: Supabase (Free - 500MB)

1. **Sign up**: https://supabase.com/
2. **Create new project**
3. **Get connection string** from Settings → Database
4. **Add to .env**: `DATABASE_URL=your_supabase_url`

### Redis: Upstash (Free - 10,000 commands/day)

1. **Sign up**: https://upstash.com/
2. **Create Redis database**
3. **Copy connection URL**
4. **Add to .env**: `REDIS_URL=your_upstash_url`

---

## 📁 Project Structure

```
whatsapp-academic-manager/
├── backend/
│   ├── api/
│   │   ├── routes/          # FastAPI endpoints
│   │   └── middleware/      # Auth, CORS, rate limiting
│   ├── ai_providers/
│   │   ├── gemini.py        # Gemini 2.0 integration
│   │   ├── openai.py        # GPT-4o-mini
│   │   ├── claude.py        # Claude 3.5 Haiku
│   │   ├── ollama.py        # Llama 3.2 (local)
│   │   └── mistral.py       # Mistral Large 2
│   ├── services/
│   │   ├── whatsapp.py      # WhatsApp Web integration
│   │   ├── parser.py        # Multi-format chat parser
│   │   ├── classifier.py    # AI-powered classification
│   │   └── notifications.py # Smart alert system
│   ├── models/
│   │   ├── message.py       # Message schema
│   │   ├── event.py         # Calendar event schema
│   │   └── priority.py      # Priority system
│   ├── utils/
│   │   ├── nlp.py           # NLP entity extraction
│   │   └── priority.py      # Priority assignment logic
│   └── bot.py               # Main entry point
├── frontend/
│   ├── app/
│   │   ├── dashboard/       # Main dashboard
│   │   ├── calendar/        # Interactive calendar
│   │   └── settings/        # User preferences
│   ├── components/
│   │   ├── PriorityBadge.tsx
│   │   ├── EventCard.tsx
│   │   └── AIConfidence.tsx
│   └── lib/
│       └── api.ts           # API client
├── docker-compose.yml       # Local development
├── .env.example             # Environment template
└── README.md                # This file!
```

---

## 🎨 Usage Examples

### 1. WhatsApp Message → AI Analysis

**Input Message:**
```
Professor Ahmed: "URGENT! Math final exam moved to tomorrow 9 AM in Hall B. 
Covers chapters 5-10. Don't be late!"
```

**AI Output:**
```json
{
  "priority": "CRITICAL",
  "confidence": 0.98,
  "reason": "Keyword 'URGENT', exam <24h, deadline change detected",
  "event": {
    "title": "Math Final Exam",
    "date": "2025-11-01T09:00:00Z",
    "location": "Hall B",
    "course": "Mathematics",
    "chapters": "5-10",
    "type": "exam"
  },
  "notifications": [
    "2025-10-31T18:00:00Z",  // 15h before
    "2025-11-01T03:00:00Z",  // 6h before
    "2025-11-01T06:00:00Z",  // 3h before
    "2025-11-01T08:00:00Z"   // 1h before
  ]
}
```

### 2. Priority Escalation

```python
# Day 7: Assignment posted
Priority: 🟡 MEDIUM (1 week away)

# Day 4: Automatic escalation
Priority: 🟠 HIGH (3 days away)

# Day 0 (12h before): Critical escalation
Priority: 🔴 CRITICAL (<24h remaining)
```

### 3. Context-Aware Updates

```
Message 1: "CS assignment due next Friday"
→ Creates event for Nov 8

Message 2: "Wait, correction - due this Friday!"
→ AI detects correction, updates to Nov 1
→ Priority automatically upgraded to 🔴 CRITICAL
→ Sends change notification
```

---

## 🔔 Notification System

### Multi-Channel Alerts

| Channel | Critical | High | Medium | Low | Info |
|---------|----------|------|--------|-----|------|
| 📱 Push | ✅ | ✅ | ✅ | ❌ | ❌ |
| 📧 Email | ✅ | ✅ | ✅ | ✅ | ✅ |
| 💬 In-App | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📞 SMS | ⭐ Optional | ❌ | ❌ | ❌ | ❌ |

### Custom Rules Example

```python
# Create custom priority rules
rules = {
    "keywords": {
        "exam": "CRITICAL",
        "quiz": "HIGH",
        "homework": "MEDIUM"
    },
    "senders": {
        "Professor": "HIGH",  # All professor messages = HIGH
        "TA": "MEDIUM"
    },
    "courses": {
        "Mathematics": "HIGH",  # Prioritize math course
        "Elective": "LOW"
    }
}
```

---

## 🧪 Testing

```bash
# Run backend tests
cd backend
pytest tests/ -v

# Run frontend tests
cd frontend
npm test

# Test AI providers
python -m tests.test_ai_providers

# Test WhatsApp integration (requires QR scan)
python -m tests.test_whatsapp
```

---

## 📊 Monitoring & Analytics

### AI Usage Dashboard
```
┌─────────────────────────────────────────┐
│  AI Provider Usage (Today)              │
├─────────────────────────────────────────┤
│  Gemini 2.0:    1,245 / 1,500  (83%)   │
│  GPT-4o-mini:      45 / ∞       ($1.2)  │
│  Claude 3.5:      120 / ∞               │
│  Llama 3.2:       350 (Local - Free)    │
│  Mistral:          89 / ∞               │
├─────────────────────────────────────────┤
│  Total Analyzed: 1,849 messages         │
│  Avg Confidence: 89.3%                  │
│  Cost Today:     $1.20                  │
└─────────────────────────────────────────┘
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit changes**: `git commit -m 'Add amazing feature'`
4. **Push to branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/MahdyHQ/whatsapp-academic-manager/issues/new)! 

---

## 📖 Documentation

- **[Setup Guide](docs/SETUP.md)** - Detailed installation instructions
- **[API Documentation](docs/API.md)** - Backend API reference
- **[AI Integration Guide](docs/AI_SETUP.md)** - Configure all AI providers
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment steps
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

---

## 🛡️ Security & Privacy

- ✅ **End-to-End Encryption** - WhatsApp messages remain encrypted
- ✅ **Local Processing Option** - Use Llama 3.2 for offline analysis
- ✅ **No Message Storage** - Only extracted metadata is stored
- ✅ **GDPR Compliant** - User data deletion available
- ✅ **Open Source** - Audit the code yourself!

---

## 📜 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Google Gemini Team** - For the amazing Gemini 2.0 Flash API
- **OpenAI** - For GPT-4o-mini's accuracy
- **Anthropic** - For Claude 3.5 Haiku's reasoning
- **Meta AI** - For open-sourcing Llama 3.2
- **Mistral AI** - For Mistral Large 2's efficiency
- **WhatsApp Web.js** - For the excellent WhatsApp integration library
- **All Contributors** - Thank you for making this project better!

---

## 🎓 Use Cases

### For Students
- 📚 Never miss an assignment deadline
- 📅 Automatic calendar sync from group chats
- 🎯 Priority-based study planning
- 🔔 Smart exam reminders

### For Professors
- 📢 Track announcement delivery
- 📊 Monitor student engagement
- 🕒 Schedule management
- 📝 Assignment tracking

### For Study Groups
- 🤝 Coordinate meeting times
- 📖 Share resources automatically
- 🎯 Track group project deadlines
- 💬 Centralized communication hub

---

## 📈 Roadmap

- [ ] **v1.0** - Core functionality (In Progress)
  - [x] WhatsApp integration
  - [x] Multi-AI analysis
  - [x] Priority system
  - [ ] Interactive dashboard
  - [ ] Notification system

- [ ] **v1.5** - Enhanced Features
  - [ ] Mobile app (React Native)
  - [ ] Voice message analysis
  - [ ] Image text extraction (OCR)
  - [ ] Calendar export (Google, Outlook, Apple)

- [ ] **v2.0** - Advanced AI
  - [ ] Predictive deadline suggestions
  - [ ] Study pattern analysis
  - [ ] Personalized recommendations
  - [ ] Grade prediction based on workload

---

## 💬 Support & Community

- 💡 **Questions?** [Open a Discussion](https://github.com/MahdyHQ/whatsapp-academic-manager/discussions)
- 🐛 **Found a Bug?** [Report an Issue](https://github.com/MahdyHQ/whatsapp-academic-manager/issues)
- 📧 **Email**: support@whatsapp-academic-manager.dev
- 🌐 **Website**: Coming soon!

---

## ⭐ Star History

If you find this project helpful, please consider giving it a ⭐ star on GitHub!

[![Star History Chart](https://api.star-history.com/svg?repos=MahdyHQ/whatsapp-academic-manager&type=Date)](https://star-history.com/#MahdyHQ/whatsapp-academic-manager&Date)

---

<div align="center">

**Made with ❤️ by [MahdyHQ](https://github.com/MahdyHQ)**

**Powered by AI • Built for Students • Open Source Forever**

[🌟 Star](https://github.com/MahdyHQ/whatsapp-academic-manager) • [🐛 Report Bug](https://github.com/MahdyHQ/whatsapp-academic-manager/issues) • [✨ Request Feature](https://github.com/MahdyHQ/whatsapp-academic-manager/issues)

</div>
