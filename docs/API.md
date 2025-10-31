# 📡 API Documentation

## Overview

The WhatsApp Academic Manager API is built with **FastAPI 0.115+** and provides RESTful endpoints for managing academic events, messages, priorities, and notifications.

**Base URL**: `https://api.whatsapp-academic-manager.dev/v1`  
**Local Development**: `http://localhost:8000/v1`

---

## 🔐 Authentication

All API endpoints require authentication using JWT tokens.

### Get Access Token

```http
POST /auth/token
Content-Type: application/json

{
  "username": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### Using Authentication

Include the token in the `Authorization` header for all requests:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📋 Endpoints

### 1. Messages

#### Get All Messages

```http
GET /messages
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (integer, default: 50) - Number of messages to return
- `offset` (integer, default: 0) - Pagination offset
- `priority` (string) - Filter by priority (CRITICAL, HIGH, MEDIUM, LOW, INFO, OPTIONAL)
- `date_from` (string, ISO 8601) - Filter messages from this date
- `date_to` (string, ISO 8601) - Filter messages until this date

**Response:**
```json
{
  "total": 1245,
  "messages": [
    {
      "id": "msg_123456",
      "content": "Math final exam tomorrow at 9 AM in Hall B",
      "sender": "Professor Ahmed",
      "sender_phone": "+1234567890",
      "group_name": "CS-2024 Mathematics",
      "timestamp": "2025-10-31T15:30:00Z",
      "priority": "CRITICAL",
      "confidence": 0.98,
      "processed": true,
      "event_id": "evt_789012"
    }
  ]
}
```

---

### 2. Events

#### Get All Events

```http
GET /events
Authorization: Bearer {token}
```

**Query Parameters:**
- `limit` (integer, default: 50)
- `offset` (integer, default: 0)
- `priority` (string) - Filter by priority
- `status` (string) - upcoming, past, archived
- `course` (string) - Filter by course name
- `type` (string) - exam, quiz, assignment, lecture, meeting

**Response:**
```json
{
  "total": 87,
  "events": [
    {
      "id": "evt_789012",
      "title": "Math Final Exam",
      "description": "Covers chapters 5-10",
      "date": "2025-11-01T09:00:00Z",
      "end_date": "2025-11-01T11:00:00Z",
      "location": "Hall B",
      "course": "Mathematics",
      "type": "exam",
      "priority": "CRITICAL",
      "status": "upcoming"
    }
  ]
}
```

---

## ⚠️ Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid priority value"
  },
  "timestamp": "2025-10-31T17:19:44Z"
}
```

**Last Updated**: October 31, 2025  
**API Version**: v1.0.0