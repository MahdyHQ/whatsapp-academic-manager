# WhatsApp Service - Complete API Documentation

## 🔐 Authentication

All endpoints (except `/health`, `/qr`, `/login`) require authentication via one of:

1. **Bearer Token** (User Authentication):
   ```
   Authorization: Bearer <token>
   ```

2. **API Key** (Admin/Server Authentication):
   ```
   x-api-key: <your-api-key>
   ```

---

## 📨 Message Endpoints

### 1. Send Text Message
**POST** `/api/send`
```json
{
  "groupId": "120363...@g.us",
  "message": "Hello World!"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Sent successfully"
}
```

### 2. Send Media Message
**POST** `/api/send-media`
```json
{
  "groupId": "120363...@g.us",
  "mediaUrl": "https://example.com/image.jpg",
  "mediaType": "image",
  "caption": "Check this out!",
  "fileName": "photo.jpg",
  "mimetype": "image/jpeg"
}
```
**Media Types:** `image`, `video`, `audio`, `document`

### 3. Send Location
**POST** `/api/send-location`
```json
{
  "groupId": "120363...@g.us",
  "latitude": 37.7749,
  "longitude": -122.4194,
  "name": "San Francisco",
  "address": "California, USA"
}
```

### 4. Send Contact
**POST** `/api/send-contact`
```json
{
  "groupId": "120363...@g.us",
  "displayName": "John Doe",
  "vcard": "BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nTEL:+1234567890\nEND:VCARD"
}
```

### 5. Send Poll
**POST** `/api/send-poll`
```json
{
  "groupId": "120363...@g.us",
  "question": "What's your favorite color?",
  "options": ["Red", "Blue", "Green", "Yellow"],
  "selectableCount": 1
}
```

### 6. Reply to Message
**POST** `/api/reply`
```json
{
  "groupId": "120363...@g.us",
  "messageId": "3EB0...",
  "replyText": "Thanks for sharing!"
}
```

### 7. React to Message
**POST** `/api/react`
```json
{
  "groupId": "120363...@g.us",
  "messageId": "3EB0...",
  "emoji": "👍"
}
```

### 8. Edit Message
**POST** `/api/edit-message`
```json
{
  "groupId": "120363...@g.us",
  "messageId": "3EB0...",
  "newText": "Updated message text"
}
```

### 9. Delete Message
**POST** `/api/delete-message`
```json
{
  "groupId": "120363...@g.us",
  "messageId": "3EB0..."
}
```

### 10. Get Messages
**GET** `/api/whatsapp/messages/:groupId?limit=50`

**Response:**
```json
{
  "success": true,
  "count": 25,
  "group_name": "Study Group",
  "group_id": "120363...@g.us",
  "messages": [
    {
      "id": "3EB0...",
      "from_user": "+1234567890",
      "fromMe": false,
      "messageType": "text",
      "content": "Hello!",
      "timestamp": 1699123456,
      "date": "11/5/2025, 10:30:56 AM",
      "quotedMessage": null,
      "mentionedJids": [],
      "isForwarded": false,
      "isDeleted": false,
      "mediaInfo": null
    }
  ]
}
```

---

## 👥 Group Management Endpoints

### 1. Create Group
**POST** `/api/group/create`
```json
{
  "name": "My New Group",
  "participants": ["+1234567890@s.whatsapp.net", "+0987654321@s.whatsapp.net"]
}
```

### 2. Update Group Name
**POST** `/api/group/update-subject`
```json
{
  "groupId": "120363...@g.us",
  "subject": "New Group Name"
}
```

### 3. Update Group Description
**POST** `/api/group/update-description`
```json
{
  "groupId": "120363...@g.us",
  "description": "This is our study group for Computer Science"
}
```

### 4. Add Participants
**POST** `/api/group/add-participants`
```json
{
  "groupId": "120363...@g.us",
  "participants": ["+1234567890@s.whatsapp.net"]
}
```

### 5. Remove Participants
**POST** `/api/group/remove-participants`
```json
{
  "groupId": "120363...@g.us",
  "participants": ["+1234567890@s.whatsapp.net"]
}
```

### 6. Promote to Admin
**POST** `/api/group/promote`
```json
{
  "groupId": "120363...@g.us",
  "participants": ["+1234567890@s.whatsapp.net"]
}
```

### 7. Demote from Admin
**POST** `/api/group/demote`
```json
{
  "groupId": "120363...@g.us",
  "participants": ["+1234567890@s.whatsapp.net"]
}
```

### 8. Update Group Settings
**POST** `/api/group/update-settings`
```json
{
  "groupId": "120363...@g.us",
  "announce": true,
  "locked": false
}
```
- `announce: true` = Only admins can send messages
- `locked: true` = Only admins can edit group info

### 9. Leave Group
**POST** `/api/group/leave`
```json
{
  "groupId": "120363...@g.us"
}
```

### 10. Get Invite Code
**GET** `/api/group/:groupId/invite-code`

**Response:**
```json
{
  "success": true,
  "inviteCode": "ABC123DEF456",
  "inviteLink": "https://chat.whatsapp.com/ABC123DEF456"
}
```

### 11. Revoke Invite Code
**POST** `/api/group/revoke-invite`
```json
{
  "groupId": "120363...@g.us"
}
```

### 12. Accept Group Invite
**POST** `/api/group/accept-invite`
```json
{
  "inviteCode": "ABC123DEF456"
}
```

### 13. Get Groups List
**GET** `/api/whatsapp/groups`

**Response:**
```json
{
  "success": true,
  "count": 5,
  "groups": [
    {
      "id": "120363...@g.us",
      "name": "Study Group",
      "participants": 25,
      "admins": 3,
      "unread_count": 5
    }
  ]
}
```

---

## 💬 Chat Management Endpoints

### 1. Mark Messages as Read
**POST** `/api/chat/read`
```json
{
  "groupId": "120363...@g.us",
  "messageIds": ["3EB0...", "4FC1..."]
}
```

### 2. Archive Chat
**POST** `/api/chat/archive`
```json
{
  "groupId": "120363...@g.us",
  "archive": true
}
```

### 3. Pin Chat
**POST** `/api/chat/pin`
```json
{
  "groupId": "120363...@g.us",
  "pin": true
}
```

### 4. Mute Chat
**POST** `/api/chat/mute`
```json
{
  "groupId": "120363...@g.us",
  "mute": true,
  "duration": 28800
}
```
Duration in seconds (default: 8 hours = 28800)

### 5. Delete Chat
**POST** `/api/chat/delete`
```json
{
  "groupId": "120363...@g.us"
}
```

---

## 👤 User/Profile Endpoints

### 1. Get Profile Picture
**GET** `/api/profile-picture/:jid`

Example: `/api/profile-picture/1234567890@s.whatsapp.net`

**Response:**
```json
{
  "success": true,
  "profilePictureUrl": "https://..."
}
```

### 2. Update Profile Name
**POST** `/api/profile/update-name`
```json
{
  "name": "John Doe"
}
```

### 3. Update Profile Status
**POST** `/api/profile/update-status`
```json
{
  "status": "Busy working on projects"
}
```

### 4. Get User Status
**GET** `/api/user/:jid/status`

Example: `/api/user/1234567890@s.whatsapp.net/status`

**Response:**
```json
{
  "success": true,
  "status": "Available",
  "setAt": 1699123456
}
```

### 5. Check if User Exists
**GET** `/api/user/:jid/exists`

Example: `/api/user/1234567890/exists`

**Response:**
```json
{
  "success": true,
  "exists": true,
  "jid": "1234567890@s.whatsapp.net"
}
```

### 6. Block/Unblock User
**POST** `/api/user/block`
```json
{
  "jid": "1234567890@s.whatsapp.net",
  "block": true
}
```

---

## 👁️ Presence Endpoints

### 1. Update Presence
**POST** `/api/presence/update`
```json
{
  "groupId": "120363...@g.us",
  "type": "composing"
}
```
**Types:** `available`, `unavailable`, `composing`, `recording`, `paused`

### 2. Subscribe to Presence Updates
**POST** `/api/presence/subscribe`
```json
{
  "groupId": "120363...@g.us"
}
```

---

## 🔧 Utility Endpoints

### 1. Get Business Profile
**GET** `/api/business/:jid/profile`

Example: `/api/business/1234567890@s.whatsapp.net/profile`

### 2. Download Media
**POST** `/api/download-media`
```json
{
  "messageKey": {
    "remoteJid": "120363...@g.us",
    "id": "3EB0..."
  }
}
```

---

## 🔐 Authentication Endpoints

### 1. Request OTP
**POST** `/api/auth/request-otp`
```json
{
  "phone": "+1234567890"
}
```

### 2. Verify OTP
**POST** `/api/auth/verify-otp`
```json
{
  "phone": "+1234567890",
  "code": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJ...",
  "phone": "+1234567890",
  "role": "admin"
}
```

### 3. Get Current User
**GET** `/api/auth/me`

**Response:**
```json
{
  "success": true,
  "phone": "+1234567890",
  "role": "admin"
}
```

### 4. Logout
**POST** `/api/auth/logout`

---

## 📊 Status & Health Endpoints

### 1. WhatsApp Status
**GET** `/api/whatsapp/status`

**Response:**
```json
{
  "success": true,
  "status": "connected",
  "phone": "+1234567890"
}
```

### 2. Health Check
**GET** `/health`

**Response:**
```json
{
  "status": "healthy",
  "whatsapp_status": "connected",
  "connected": true,
  "session_saved": true,
  "backup_available": true,
  "active_user_sessions": 5,
  "uptime_seconds": 3600
}
```

### 3. Session Info
**GET** `/api/session-info`

### 4. Get QR Code
**GET** `/qr` or `/api/qr`

Returns HTML page with QR code for linking WhatsApp

### 5. Get Pairing Code
**GET** `/api/pairing-code`

**Response:**
```json
{
  "success": true,
  "code": "ABCD-EFGH"
}
```

### 6. Reset Session
**POST** `/api/session/reset`

Clears session and triggers new QR code generation

---

## 📝 Message Types Reference

### Text Message
```json
{
  "messageType": "text",
  "content": "Hello World",
  "mentionedJids": ["+1234567890@s.whatsapp.net"]
}
```

### Image Message
```json
{
  "messageType": "image",
  "content": "[Image]",
  "caption": "Check this out!",
  "mediaInfo": {
    "mimetype": "image/jpeg",
    "fileSize": 1048576,
    "width": 1920,
    "height": 1080,
    "url": "https://..."
  }
}
```

### Video Message
```json
{
  "messageType": "video",
  "content": "[Video]",
  "caption": "My video",
  "mediaInfo": {
    "mimetype": "video/mp4",
    "fileSize": 5242880,
    "duration": 60,
    "width": 1920,
    "height": 1080,
    "url": "https://..."
  }
}
```

### Audio/Voice Message
```json
{
  "messageType": "voice",
  "content": "[Voice Note]",
  "mediaInfo": {
    "mimetype": "audio/ogg; codecs=opus",
    "fileSize": 524288,
    "duration": 30,
    "url": "https://..."
  }
}
```

### Document Message
```json
{
  "messageType": "document",
  "content": "[Document: report.pdf]",
  "mediaInfo": {
    "mimetype": "application/pdf",
    "fileSize": 2097152,
    "fileName": "report.pdf",
    "url": "https://..."
  }
}
```

### Location Message
```json
{
  "messageType": "location",
  "content": "[Location: 37.7749, -122.4194]",
  "mediaInfo": {
    "latitude": 37.7749,
    "longitude": -122.4194,
    "name": "San Francisco",
    "address": "California, USA"
  }
}
```

### Contact Message
```json
{
  "messageType": "contact",
  "content": "[Contact: John Doe]",
  "mediaInfo": {
    "displayName": "John Doe",
    "vcard": "BEGIN:VCARD..."
  }
}
```

### Poll Message
```json
{
  "messageType": "poll",
  "content": "[Poll: What's your favorite?]",
  "mediaInfo": {
    "name": "What's your favorite?",
    "options": ["Option 1", "Option 2", "Option 3"],
    "selectableCount": 1
  }
}
```

---

## 🚀 Usage Examples

### cURL Examples

#### Send Text Message
```bash
curl -X POST https://your-service.railway.app/api/send \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "120363...@g.us",
    "message": "Hello from API!"
  }'
```

#### Get Groups
```bash
curl -X GET https://your-service.railway.app/api/whatsapp/groups \
  -H "x-api-key: YOUR_API_KEY"
```

#### Get Messages
```bash
curl -X GET "https://your-service.railway.app/api/whatsapp/messages/120363...@g.us?limit=20" \
  -H "x-api-key: YOUR_API_KEY"
```

### JavaScript Examples

```javascript
// Send message
const response = await fetch('https://your-service.railway.app/api/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    groupId: '120363...@g.us',
    message: 'Hello World!'
  })
});

const data = await response.json();
console.log(data);
```

### Python Examples

```python
import requests

# Send poll
response = requests.post(
    'https://your-service.railway.app/api/send-poll',
    headers={'x-api-key': 'YOUR_API_KEY'},
    json={
        'groupId': '120363...@g.us',
        'question': 'What time works best?',
        'options': ['9 AM', '2 PM', '5 PM'],
        'selectableCount': 1
    }
)

print(response.json())
```

---

## 🔒 Security Best Practices

1. **Protect your API Key**: Never commit it to version control
2. **Use HTTPS**: Always use secure connections
3. **Rate Limiting**: Implement rate limiting on your side if making many requests
4. **Validate Input**: Always validate and sanitize user inputs
5. **Monitor Logs**: Keep track of API usage and errors
6. **Rotate Keys**: Regularly rotate API keys
7. **Use Environment Variables**: Store sensitive data in env vars

---

## ⚠️ Error Codes

- **400** Bad Request - Missing or invalid parameters
- **401** Unauthorized - Invalid or missing authentication
- **403** Forbidden - Insufficient permissions
- **404** Not Found - Resource doesn't exist
- **503** Service Unavailable - WhatsApp not connected
- **500** Internal Server Error - Server-side error

---

## 📚 Additional Resources

- [Baileys Documentation](https://baileys.wiki)
- [WhatsApp Web Protocol](https://github.com/WhiskeySockets/Baileys)
- [API Support](https://github.com/MahdyHQ/whatsapp-academic-manager)

---

## 🎯 Feature Coverage

✅ Text messages with formatting
✅ Media messages (images, videos, audio, documents)
✅ Location sharing
✅ Contact sharing
✅ Polls
✅ Message replies
✅ Reactions
✅ Message editing
✅ Message deletion
✅ Group creation & management
✅ Participant management
✅ Admin controls
✅ Group settings
✅ Invite links
✅ Chat archiving/pinning/muting
✅ Read receipts
✅ Profile management
✅ Presence updates
✅ User verification
✅ Block/unblock users
✅ Business profiles

---

**Version:** 2.4.0
**Last Updated:** November 5, 2025
