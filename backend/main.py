from dotenv import load_dotenv

# Load .env file FIRST
load_dotenv()

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timezone

app = FastAPI(
    title="Academic Manager API",
    description="WhatsApp Academic Management System",
    version="1.0.1"
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
    "https://pleasant-eagerness-production-6be8.up.railway.app"
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
        "version": "1.0.1",
        "whatsapp": {
            "service_url": WHATSAPP_SERVICE_URL,
            "api_key_configured": bool(WHATSAPP_API_KEY)
        },
        "endpoints": {
            "status": "/api/whatsapp/status",
            "groups": "/api/whatsapp/groups",
            "messages": "/api/whatsapp/messages/{group_id}",
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

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*70)
    print("🚀 Starting Academic Manager API")
    print("="*70 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)