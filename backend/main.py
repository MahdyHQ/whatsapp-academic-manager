from dotenv import load_dotenv

# Load .env file FIRST
load_dotenv()

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timezone

app = FastAPI(
    title="Academic Manager API",
    description="WhatsApp Academic Management System - Enhanced with Full Baileys API",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://urban-rotary-phone-69wxvpwgr6wg24v7r-3000.app.github.dev",
        "https://*.app.github.dev",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WHATSAPP_SERVICE_URL = os.getenv(
    "WHATSAPP_SERVICE_URL",
    "https://whatsapp-academic-manager-production.up.railway.app"
)
WHATSAPP_API_KEY = os.getenv("WHATSAPP_API_KEY", "")

# Debug output
print("="*70)
print("🔐 WhatsApp Service Configuration:")
print(f"   URL: {WHATSAPP_SERVICE_URL}")
print(f"   API Key: {'✅ Loaded (' + WHATSAPP_API_KEY[:10] + '...)' if WHATSAPP_API_KEY else '❌ NOT FOUND'}")
print("="*70)

# Models
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

# Helper function to build headers with authentication
def get_headers(authorization_header: Optional[str] = None) -> dict:
    """
    Build headers with proper authentication
    - If authorization_header is provided (full "Bearer xxx"), forward it as-is
    - Otherwise, use API key for admin access
    """
    headers = {
        "Content-Type": "application/json",
    }
    
    if authorization_header:
        # Forward the entire Authorization header as-is
        headers["Authorization"] = authorization_header
        print(f"   🔑 Forwarding user token: {authorization_header[:30]}...")
    elif WHATSAPP_API_KEY:
        # Admin authentication (API key)
        headers["x-api-key"] = WHATSAPP_API_KEY
        print(f"   🔑 Using API key: {WHATSAPP_API_KEY[:10]}...")
    else:
        print(f"   ⚠️  No authentication available!")
    
    return headers

@app.get("/")
async def root():
    return {
        "message": "🎓 Academic Manager API - Running!",
        "status": "✅ Active",
        "version": "2.0.0",
        "features": {
            "messaging": "✅ All message types (text, media, location, contact, poll)",
            "message_actions": "✅ Reply, react, edit, delete",
            "groups": "✅ Complete group management",
            "chats": "✅ Archive, pin, mute, delete",
            "profile": "✅ Profile operations",
            "presence": "✅ Typing indicators, online status",
            "utilities": "✅ Media download, business profiles"
        },
        "whatsapp": {
            "service_url": WHATSAPP_SERVICE_URL,
            "api_key_configured": bool(WHATSAPP_API_KEY)
        },
        "endpoints": {
            "status": "/api/whatsapp/status",
            "groups": "/api/whatsapp/groups",
            "messages": "/api/whatsapp/messages/{group_id}",
            "send": "/api/send",
            "send_media": "/api/send-media",
            "send_location": "/api/send-location",
            "send_contact": "/api/send-contact",
            "send_poll": "/api/send-poll",
            "reply": "/api/reply",
            "react": "/api/react",
            "edit_message": "/api/edit-message",
            "delete_message": "/api/delete-message",
            "group_operations": "/api/group/*",
            "chat_operations": "/api/chat/*",
            "profile_operations": "/api/profile/*",
            "presence_operations": "/api/presence/*",
            "docs": "/docs"
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Academic Manager API",
        "whatsapp_service": WHATSAPP_SERVICE_URL,
        "api_key_present": bool(WHATSAPP_API_KEY),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/whatsapp/status", response_model=WhatsAppStatus)
async def get_whatsapp_status(authorization: Optional[str] = Header(None)):
    """
    Get WhatsApp connection status
    Can be called with or without authentication
    """
    try:
        print(f"\n📡 GET /api/whatsapp/status")
        print(f"   Authorization header: {authorization[:40] if authorization else 'None'}...")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = get_headers(authorization)
            print(f"   Calling: {WHATSAPP_SERVICE_URL}/api/status")
            
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/status",
                headers=headers
            )
            
            print(f"   ✅ Response: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            
            return WhatsAppStatus(
                success=data.get("success", True),
                status=data.get("status", "unknown"),
                phone=data.get("phone"),
                timestamp=data.get("timestamp", datetime.now(timezone.utc).isoformat())
            )
    except httpx.HTTPStatusError as e:
        print(f"   ❌ HTTP Error: {e.response.status_code}")
        print(f"   Response: {e.response.text[:200]}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"WhatsApp service error: {e.response.text}"
        )
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"WhatsApp service unavailable: {str(e)}"
        )

@app.get("/api/whatsapp/groups", response_model=GroupsResponse)
async def get_whatsapp_groups(authorization: Optional[str] = Header(None)):
    """
    Get WhatsApp groups
    Requires authentication (user token or API key)
    """
    try:
        print(f"\n📡 GET /api/whatsapp/groups")
        print(f"   Authorization header: {authorization[:40] if authorization else 'None'}...")
        
        # Check if we have any authentication
        if not authorization and not WHATSAPP_API_KEY:
            print(f"   ❌ No authentication provided!")
            raise HTTPException(
                status_code=401,
                detail="Authentication required. Please login first."
            )
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            headers = get_headers(authorization)
            print(f"   Calling: {WHATSAPP_SERVICE_URL}/api/groups")
            print(f"   Headers: {list(headers.keys())}")
            
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/groups",
                headers=headers
            )
            
            print(f"   Response status: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text
                print(f"   ❌ Error response: {error_text[:200]}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"WhatsApp service error: {error_text}"
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
            
            print(f"   ✅ Successfully fetched {len(groups)} groups")
            
            return GroupsResponse(
                success=data.get("success", True),
                count=len(groups),
                groups=groups
            )
    except httpx.HTTPStatusError as e:
        print(f"   ❌ HTTP Error: {e.response.status_code}")
        print(f"   Response: {e.response.text[:200]}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"WhatsApp service error: {e.response.text}"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"WhatsApp service unavailable: {str(e)}"
        )

@app.get("/api/whatsapp/messages/{group_id}", response_model=MessagesResponse)
async def get_group_messages(
    group_id: str, 
    limit: int = 50,
    authorization: Optional[str] = Header(None)
):
    """
    Get messages from a WhatsApp group
    Requires authentication (user token or API key)
    """
    try:
        print(f"\n📡 GET /api/whatsapp/messages/{group_id}")
        print(f"   Authorization header: {authorization[:40] if authorization else 'None'}...")
        
        # Check if we have any authentication
        if not authorization and not WHATSAPP_API_KEY:
            print(f"   ❌ No authentication provided!")
            raise HTTPException(
                status_code=401,
                detail="Authentication required. Please login first."
            )
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            
            # Get messages
            print(f"   Calling: {WHATSAPP_SERVICE_URL}/api/messages/{group_id}")
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/messages/{group_id}?limit={limit}",
                headers=headers
            )
            
            print(f"   Messages response: {response.status_code}")
            
            if response.status_code != 200:
                error_text = response.text
                print(f"   ❌ Error response: {error_text[:200]}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"WhatsApp service error: {error_text}"
                )
            
            response.raise_for_status()
            data = response.json()
            
            # Get group name
            print(f"   Fetching group name...")
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
                        from_user=msg.get("from_user", msg.get("from", "Unknown")),
                        content=msg.get("content", ""),
                        timestamp=msg.get("timestamp", 0),
                        date=date_str
                    ))
                except Exception as e:
                    print(f"   ⚠️  Skipping message: {e}")
                    continue
            
            print(f"   ✅ Successfully fetched {len(messages)} messages from {group_name}")
            
            return MessagesResponse(
                success=data.get("success", True),
                count=len(messages),
                group_name=group_name,
                messages=messages
            )
    except httpx.HTTPStatusError as e:
        print(f"   ❌ HTTP Error: {e.response.status_code}")
        print(f"   Response: {e.response.text[:200]}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"WhatsApp service error: {e.response.text}"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"   ❌ Exception: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"WhatsApp service unavailable: {str(e)}"
        )

# ==================== ENHANCED MESSAGE ENDPOINTS ====================

@app.post("/api/send")
async def send_message(request: Request, authorization: Optional[str] = Header(None)):
    """Send a text message to a WhatsApp group or contact"""
    try:
        print(f"\n📤 POST /api/send")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/send",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/send-media")
async def send_media(request: Request, authorization: Optional[str] = Header(None)):
    """Send media (image, video, audio, document) to a WhatsApp group or contact"""
    try:
        print(f"\n📤 POST /api/send-media")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/send-media",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/send-location")
async def send_location(request: Request, authorization: Optional[str] = Header(None)):
    """Send a location to a WhatsApp group or contact"""
    try:
        print(f"\n📍 POST /api/send-location")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/send-location",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/send-contact")
async def send_contact(request: Request, authorization: Optional[str] = Header(None)):
    """Send a contact to a WhatsApp group or contact"""
    try:
        print(f"\n👤 POST /api/send-contact")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/send-contact",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/send-poll")
async def send_poll(request: Request, authorization: Optional[str] = Header(None)):
    """Send a poll to a WhatsApp group or contact"""
    try:
        print(f"\n📊 POST /api/send-poll")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/send-poll",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/reply")
async def reply_message(request: Request, authorization: Optional[str] = Header(None)):
    """Reply to a message"""
    try:
        print(f"\n💬 POST /api/reply")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/reply",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/react")
async def react_message(request: Request, authorization: Optional[str] = Header(None)):
    """React to a message with an emoji"""
    try:
        print(f"\n😀 POST /api/react")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/react",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/edit-message")
async def edit_message(request: Request, authorization: Optional[str] = Header(None)):
    """Edit a sent message"""
    try:
        print(f"\n✏️ POST /api/edit-message")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/edit-message",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/delete-message")
async def delete_message(request: Request, authorization: Optional[str] = Header(None)):
    """Delete a message for everyone"""
    try:
        print(f"\n🗑️ POST /api/delete-message")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/delete-message",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== GROUP MANAGEMENT ENDPOINTS ====================

@app.post("/api/group/create")
async def create_group(request: Request, authorization: Optional[str] = Header(None)):
    """Create a new WhatsApp group"""
    try:
        print(f"\n👥 POST /api/group/create")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/create",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/update-subject")
async def update_group_subject(request: Request, authorization: Optional[str] = Header(None)):
    """Update group name/subject"""
    try:
        print(f"\n📝 POST /api/group/update-subject")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/update-subject",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/update-description")
async def update_group_description(request: Request, authorization: Optional[str] = Header(None)):
    """Update group description"""
    try:
        print(f"\n📄 POST /api/group/update-description")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/update-description",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/add-participants")
async def add_group_participants(request: Request, authorization: Optional[str] = Header(None)):
    """Add participants to a group"""
    try:
        print(f"\n➕ POST /api/group/add-participants")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/add-participants",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/remove-participants")
async def remove_group_participants(request: Request, authorization: Optional[str] = Header(None)):
    """Remove participants from a group"""
    try:
        print(f"\n➖ POST /api/group/remove-participants")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/remove-participants",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/promote")
async def promote_group_participants(request: Request, authorization: Optional[str] = Header(None)):
    """Promote participants to admin"""
    try:
        print(f"\n⭐ POST /api/group/promote")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/promote",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/demote")
async def demote_group_participants(request: Request, authorization: Optional[str] = Header(None)):
    """Demote participants from admin"""
    try:
        print(f"\n⬇️ POST /api/group/demote")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/demote",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/update-settings")
async def update_group_settings(request: Request, authorization: Optional[str] = Header(None)):
    """Update group settings (announce, locked)"""
    try:
        print(f"\n⚙️ POST /api/group/update-settings")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/update-settings",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/leave")
async def leave_group(request: Request, authorization: Optional[str] = Header(None)):
    """Leave a group"""
    try:
        print(f"\n🚪 POST /api/group/leave")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/leave",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/group/{group_id}/invite-code")
async def get_group_invite_code(group_id: str, authorization: Optional[str] = Header(None)):
    """Get group invite code"""
    try:
        print(f"\n🔗 GET /api/group/{group_id}/invite-code")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/group/{group_id}/invite-code",
                headers=headers
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/revoke-invite")
async def revoke_group_invite(request: Request, authorization: Optional[str] = Header(None)):
    """Revoke group invite code"""
    try:
        print(f"\n🔄 POST /api/group/revoke-invite")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/revoke-invite",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/group/accept-invite")
async def accept_group_invite(request: Request, authorization: Optional[str] = Header(None)):
    """Accept group invite"""
    try:
        print(f"\n✅ POST /api/group/accept-invite")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/group/accept-invite",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== CHAT MANAGEMENT ENDPOINTS ====================

@app.post("/api/chat/read")
async def mark_chat_read(request: Request, authorization: Optional[str] = Header(None)):
    """Mark messages as read"""
    try:
        print(f"\n✔️ POST /api/chat/read")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/chat/read",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/chat/archive")
async def archive_chat(request: Request, authorization: Optional[str] = Header(None)):
    """Archive or unarchive a chat"""
    try:
        print(f"\n📦 POST /api/chat/archive")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/chat/archive",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/chat/pin")
async def pin_chat(request: Request, authorization: Optional[str] = Header(None)):
    """Pin or unpin a chat"""
    try:
        print(f"\n📌 POST /api/chat/pin")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/chat/pin",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/chat/mute")
async def mute_chat(request: Request, authorization: Optional[str] = Header(None)):
    """Mute or unmute a chat"""
    try:
        print(f"\n🔇 POST /api/chat/mute")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/chat/mute",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/chat/delete")
async def delete_chat(request: Request, authorization: Optional[str] = Header(None)):
    """Delete chat history"""
    try:
        print(f"\n🗑️ POST /api/chat/delete")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/chat/delete",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== USER/PROFILE ENDPOINTS ====================

@app.get("/api/profile-picture/{jid}")
async def get_profile_picture(jid: str, authorization: Optional[str] = Header(None)):
    """Get user profile picture"""
    try:
        print(f"\n🖼️ GET /api/profile-picture/{jid}")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/profile-picture/{jid}",
                headers=headers
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/profile/update-name")
async def update_profile_name(request: Request, authorization: Optional[str] = Header(None)):
    """Update profile name"""
    try:
        print(f"\n✏️ POST /api/profile/update-name")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/profile/update-name",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/profile/update-status")
async def update_profile_status(request: Request, authorization: Optional[str] = Header(None)):
    """Update profile status message"""
    try:
        print(f"\n💬 POST /api/profile/update-status")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/profile/update-status",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/user/{jid}/status")
async def get_user_status(jid: str, authorization: Optional[str] = Header(None)):
    """Get user status message"""
    try:
        print(f"\n💭 GET /api/user/{jid}/status")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/user/{jid}/status",
                headers=headers
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/user/{jid}/exists")
async def check_user_exists(jid: str, authorization: Optional[str] = Header(None)):
    """Check if JID exists on WhatsApp"""
    try:
        print(f"\n🔍 GET /api/user/{jid}/exists")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/user/{jid}/exists",
                headers=headers
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/user/block")
async def block_user(request: Request, authorization: Optional[str] = Header(None)):
    """Block or unblock a user"""
    try:
        print(f"\n🚫 POST /api/user/block")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/user/block",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== PRESENCE ENDPOINTS ====================

@app.post("/api/presence/update")
async def update_presence(request: Request, authorization: Optional[str] = Header(None)):
    """Update presence (typing, recording, etc.)"""
    try:
        print(f"\n👁️ POST /api/presence/update")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/presence/update",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.post("/api/presence/subscribe")
async def subscribe_presence(request: Request, authorization: Optional[str] = Header(None)):
    """Subscribe to presence updates"""
    try:
        print(f"\n🔔 POST /api/presence/subscribe")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/presence/subscribe",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== UTILITY ENDPOINTS ====================

@app.post("/api/download-media")
async def download_media(request: Request, authorization: Optional[str] = Header(None)):
    """Download media from a message"""
    try:
        print(f"\n⬇️ POST /api/download-media")
        body = await request.json()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = get_headers(authorization)
            response = await client.post(
                f"{WHATSAPP_SERVICE_URL}/api/download-media",
                headers=headers,
                json=body
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@app.get("/api/business/{jid}/profile")
async def get_business_profile(jid: str, authorization: Optional[str] = Header(None)):
    """Get business profile information"""
    try:
        print(f"\n💼 GET /api/business/{jid}/profile")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            headers = get_headers(authorization)
            response = await client.get(
                f"{WHATSAPP_SERVICE_URL}/api/business/{jid}/profile",
                headers=headers
            )
            
            print(f"   Response: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

# ==================== PRODUCTION READY ====================
# For Render/Railway/Cloud deployment
# ==================== PRODUCTION READY ====================
import os

# Get port from environment (Railway uses $PORT)
PORT = int(os.getenv("PORT", 8000))

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*70)
    print("🚀 Starting Academic Manager API")
    print("="*70 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT)