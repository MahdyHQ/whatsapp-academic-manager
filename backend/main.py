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
