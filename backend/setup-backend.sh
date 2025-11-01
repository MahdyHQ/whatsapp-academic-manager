#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  📱 Academic Manager - Backend API Setup${NC}"
echo -e "${BLUE}  Date: 2025-11-01 12:23:23 UTC${NC}"
echo -e "${BLUE}  User: MahdyHQ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Step 1: Create main.py
echo -e "${YELLOW}📝 Creating main.py...${NC}"
cat > main.py << 'EOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(
    title="Academic Manager API",
    description="WhatsApp Academic Management System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WHATSAPP_SERVICE_URL = os.getenv(
    "WHATSAPP_SERVICE_URL",
    "https://pleasant-eagerness-production-6be8.up.railway.app"
)
WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")

headers = {
    "Content-Type": "application/json",
}
if WHATSAPP_API_KEY:
    headers["x-api-key"] = WHATSAPP_API_KEY

class WhatsAppStatus(BaseModel):
    success: bool
    status: str
    phone: Optional[str] = None
    timestamp: str

class WhatsAppGroup(BaseModel):
    id: str
    name: str
    participants: int

class Message(BaseModel):
    id: str
    from_user: str
    content: str
    timestamp: int
    date: Optional[str] = None

class GroupsResponse(BaseModel):
    success: bool
    count: int
    groups: List[WhatsAppGroup]

class MessagesResponse(BaseModel):
    success: bool
    count: int
    group_name: Optional[str] = None
    messages: List[Message]

@app.get("/")
async def root():
    return {
        "message": "🎓 Academic Manager API - Running!",
        "status": "✅ Active",
        "version": "1.0.0",
        "whatsapp": {
            "connected": True,
            "phone": "+201155547529"
        },
        "endpoints": {
            "status": "/api/whatsapp/status",
            "groups": "/api/whatsapp/groups",
            "messages": "/api/whatsapp/messages/{group_id}",
            "docs": "/docs"
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Academic Manager API",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/whatsapp/status", response_model=WhatsAppStatus)
async def get_whatsapp_status():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/status",
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            return WhatsAppStatus(
                success=data.get("success", True),
                status=data.get("status", "unknown"),
                phone=data.get("phone"),
                timestamp=data.get("timestamp", datetime.utcnow().isoformat())
            )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"WhatsApp service unavailable: {str(e)}")

@app.get("/api/whatsapp/groups", response_model=GroupsResponse)
async def get_whatsapp_groups():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/groups",
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            groups = [
                WhatsAppGroup(
                    id=group["id"],
                    name=group["name"],
                    participants=group["participants"]
                )
                for group in data.get("groups", [])
            ]
            
            return GroupsResponse(
                success=data.get("success", True),
                count=len(groups),
                groups=groups
            )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"WhatsApp service unavailable: {str(e)}")

@app.get("/api/whatsapp/messages/{group_id}", response_model=MessagesResponse)
async def get_group_messages(group_id: str, limit: int = 50):
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/messages/{group_id}?limit={limit}",
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            
            groups_response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/groups",
                headers=headers
            )
            groups_data = groups_response.json()
            
            group_name = None
            for group in groups_data.get("groups", []):
                if group["id"] == group_id:
                    group_name = group["name"]
                    break
            
            messages = []
            for msg in data.get("messages", []):
                try:
                    if msg.get("timestamp"):
                        dt = datetime.fromtimestamp(int(msg["timestamp"]))
                        date_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                    else:
                        date_str = "Unknown"
                    
                    messages.append(Message(
                        id=msg.get("id", ""),
                        from_user=msg.get("from", "Unknown"),
                        content=msg.get("content", ""),
                        timestamp=msg.get("timestamp", 0),
                        date=date_str
                    ))
                except Exception:
                    continue
            
            return MessagesResponse(
                success=data.get("success", True),
                count=len(messages),
                group_name=group_name,
                messages=messages
            )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"WhatsApp service unavailable: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

echo -e "${GREEN}✅ main.py created${NC}\n"

# Step 2: Create/update requirements.txt
echo -e "${YELLOW}📦 Creating requirements.txt...${NC}"
cat > requirements.txt << 'EOF'
fastapi==0.109.0
uvicorn[standard]==0.27.0
httpx==0.26.0
pydantic==2.5.3
python-dotenv==1.0.0
EOF

echo -e "${GREEN}✅ requirements.txt created${NC}\n"

# Step 3: Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
pip install -q -r requirements.txt

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed${NC}\n"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}\n"
    exit 1
fi

# Step 4: Kill any existing process on port 8000
echo -e "${YELLOW}🔍 Checking for existing processes on port 8000...${NC}"
PID=$(lsof -ti:8000)
if [ ! -z "$PID" ]; then
    echo -e "${YELLOW}⚠️  Killing existing process on port 8000 (PID: $PID)${NC}"
    kill -9 $PID
    sleep 2
fi
echo -e "${GREEN}✅ Port 8000 is clear${NC}\n"

# Step 5: Start the server
echo -e "${YELLOW}🚀 Starting FastAPI server...${NC}"
nohup python main.py > api.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
sleep 3

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo -e "${GREEN}✅ Server started successfully (PID: $SERVER_PID)${NC}\n"
else
    echo -e "${RED}❌ Server failed to start. Check api.log for errors${NC}\n"
    tail -20 api.log
    exit 1
fi

# Step 6: Get Codespaces URL
echo -e "${YELLOW}🔍 Detecting Codespaces environment...${NC}"

if [ ! -z "$CODESPACE_NAME" ]; then
    # We're in Codespaces
    CODESPACE_URL="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
    echo -e "${GREEN}✅ Codespaces detected${NC}\n"
else
    # Local environment
    CODESPACE_URL="http://localhost:8000"
    echo -e "${YELLOW}⚠️  Not in Codespaces, using localhost${NC}\n"
fi

# Step 7: Test the API
echo -e "${YELLOW}🧪 Testing API endpoints...${NC}"
sleep 2

# Test health endpoint
HEALTH_RESPONSE=$(curl -s http://localhost:8000/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test root endpoint
ROOT_RESPONSE=$(curl -s http://localhost:8000/)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Root endpoint working${NC}"
else
    echo -e "${RED}❌ Root endpoint failed${NC}"
fi

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Backend API is Ready!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}📍 Your API URLs:${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📊 Interactive API Documentation:${NC}"
echo -e "   ${CODESPACE_URL}/docs\n"

echo -e "${YELLOW}🏠 Root Endpoint:${NC}"
echo -e "   ${CODESPACE_URL}/\n"

echo -e "${YELLOW}❤️  Health Check:${NC}"
echo -e "   ${CODESPACE_URL}/health\n"

echo -e "${YELLOW}📱 WhatsApp Status:${NC}"
echo -e "   ${CODESPACE_URL}/api/whatsapp/status\n"

echo -e "${YELLOW}👥 WhatsApp Groups:${NC}"
echo -e "   ${CODESPACE_URL}/api/whatsapp/groups\n"

echo -e "${YELLOW}💬 Group Messages:${NC}"
echo -e "   ${CODESPACE_URL}/api/whatsapp/messages/{group_id}\n"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}🧪 Quick Test Commands:${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}# Test health:${NC}"
echo -e "curl ${CODESPACE_URL}/health\n"

echo -e "${YELLOW}# Get WhatsApp status:${NC}"
echo -e "curl ${CODESPACE_URL}/api/whatsapp/status\n"

echo -e "${YELLOW}# Get WhatsApp groups:${NC}"
echo -e "curl ${CODESPACE_URL}/api/whatsapp/groups\n"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "${BLUE}📝 Useful Commands:${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}# View logs:${NC}"
echo -e "tail -f api.log\n"

echo -e "${YELLOW}# Stop server:${NC}"
echo -e "kill $SERVER_PID\n"

echo -e "${YELLOW}# Restart server:${NC}"
echo -e "./setup-backend.sh\n"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Save URL to file for easy access
echo "$CODESPACE_URL" > .api_url
echo -e "${GREEN}💾 API URL saved to .api_url${NC}\n"

# Create a test script
cat > test-api.sh << TESTEOF
#!/bin/bash
API_URL=\$(cat .api_url)
echo "🧪 Testing API at: \$API_URL"
echo ""
echo "📊 Root:"
curl -s \$API_URL/ | jq .
echo ""
echo "📱 WhatsApp Status:"
curl -s \$API_URL/api/whatsapp/status | jq .
echo ""
echo "👥 WhatsApp Groups:"
curl -s \$API_URL/api/whatsapp/groups | jq .
TESTEOF

chmod +x test-api.sh

echo -e "${GREEN}✅ Created test-api.sh - Run ./test-api.sh to test all endpoints${NC}\n"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Setup Complete! Click the link above to test! 🚀${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
EOF

# Make it executable
chmod +x setup-backend.sh

echo -e "${GREEN}✅ Setup script created!${NC}\n"
echo -e "${YELLOW}Run it with: ./setup-backend.sh${NC}\n"