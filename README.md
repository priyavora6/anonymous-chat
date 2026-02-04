# Anonymous Chat - Controlled Anonymity Platform

A full-stack web application implementing **Controlled Anonymity** with React frontend and FastAPI backend. Features anonymous, gender-filtered matchmaking with ephemeral WebSocket chat and delete-after-verify image handling.

## Features

🎭 **Controlled Anonymity** - Pseudonymous profiles, no real identity  
📸 **Camera Verification** - Delete-after-verify (no image persistence)  
🎯 **Smart Matching** - Gender-filtered queues with daily fairness limits (5/day)  
🔐 **Privacy First** - Ephemeral messages, no chat history preserved  
📱 **Real-time Chat** - WebSocket-based instant messaging  

## Quick Start

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m backend.main               # Runs at http://localhost:8000
```

### Frontend (React)

```bash
cd frontend
npm install
npm start                            # Runs at http://localhost:3000
```

Open browser to http://localhost:3000

## Architecture

```
Frontend (React)                    Backend (FastAPI)
├── App.jsx                         ├── /verify (POST) - Camera verification
├── CameraCapture.jsx               ├── /ws (WebSocket) - Chat & matching
├── Chat.jsx                        ├── /admin/reports (GET) - Admin API
└── Utils (WebSocket, fingerprint)  └── In-memory state + optional PostgreSQL
```

## API Reference

### REST Endpoints

#### POST `/verify`
Camera verification endpoint.

**Request:**
```
POST http://localhost:8000/verify?device_id=uuid-here
Content-Type: multipart/form-data

file: (binary image blob)
```

**Response:**
```json
{
   "device_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
   "gender": "male" | "female" | "prefer-not-to-say"
}
```

**Process:**
1. Client captures selfie → converts to JPEG blob → uploads as FormData
2. Server receives image bytes
3. Classify gender (demo: hash parity; production: ML model)
4. **Delete image immediately** (no file saved, no persistence)
5. Update device record in DB (best-effort)
6. Return classification result

---

#### GET `/admin/reports`
List abuse reports (admin endpoint).

**Request:**
```
GET http://localhost:8000/admin/reports?limit=50
```

**Response:**
```json
[
  {
    "id": 1,
    "reporter": "device-id-1",
    "reported": "device-id-2",
    "reason": "Inappropriate behavior",
    "created_at": "2026-02-03T12:34:56"
  }
]
```

---

### WebSocket Endpoint

#### WS `/ws?device_id={deviceId}`
Main chat and matching WebSocket.

**Connection:**
```javascript
const ws = new WebSocket('ws://localhost:8000/ws?device_id=YOUR-DEVICE-ID');
```

**Client → Server Messages:**

1. **Join Queue**
   ```json
   {
     "action": "join",
     "filter": "any" | "male" | "female" | "prefer-not-to-say",
     "nickname": "AnonymousUser"
   }
   ```

2. **Send Message**
   ```json
   {
     "action": "msg",
     "text": "Hello!"
   }
   ```

3. **Next Match (leave current, rejoin)**
   ```json
   {
     "action": "next"
   }
   ```

4. **Leave Queue**
   ```json
   {
     "action": "leave"
   }
   ```

5. **Report User**
   ```json
   {
     "action": "report",
     "reported": "peer-device-id",
     "reason": "Inappropriate behavior"
   }
   ```

---

**Server → Client Messages:**

1. **Queued** (waiting for match)
   ```json
   {
     "type": "queued",
     "filter": "any"
   }
   ```

2. **Matched** (paired with peer)
   ```json
   {
     "type": "matched",
     "peer": "peer-device-id",
     "peer_profile": {
       "nickname": "Stranger",
       "gender": "female"
     },
     "peer_gender": "female" | "prefer-not-to-say"
   }
   ```

3. **Message from Peer**
   ```json
   {
     "type": "msg",
     "from": "peer-device-id",
     "text": "Hi there!"
   }
   ```

4. **Peer Left**
   ```json
   {
     "type": "peer_left",
     "peer": "peer-device-id"
   }
   ```

5. **Error**
   ```json
   {
     "type": "error",
     "message": "Daily limit reached for this filter"
   }
   ```

6. **Report Confirmed**
   ```json
   {
     "type": "reported",
     "target": "peer-device-id"
   }
   ```

---

## Frontend Flow

1. **App.jsx** - Main container
   - Generates/retrieves device ID from localStorage
   - Shows verification or chat based on state

2. **CameraCapture.jsx** - Verification step
   - Requests camera permission
   - Captures live selfie from video stream
   - Collects nickname and bio
   - POSTs to `/verify` endpoint
   - On success, passes profile to parent

3. **Chat.jsx** - Chat interface
   - Opens WebSocket connection to `/ws?device_id=...`
   - Displays profile sidebar (your info + peer info)
   - Shows queue filter buttons
   - Displays messages with timestamps
   - Sends/receives messages via WebSocket

4. **Utilities**
   - `fingerprint.js` - Generate/retrieve device ID
   - `socket.js` - Create WebSocket with proper handling

---

## Backend Architecture

### In-Memory State

```python
devices = {
    "device-id": {
        "gender": "male",
        "nickname": "Anon123",
        "last_join": 1234567890.0,
      "daily_counts": {"date": "2026-02-03", "male": 2, "female": 1, "prefer-not-to-say": 0},
    }
}

active_pairs = {
    "device-id-1": "device-id-2",  # bidirectional pairing
    "device-id-2": "device-id-1"
}

queues = {
   "any": [("device-id-3", websocket), ...],
   "male": [...],
   "female": [...],
   "prefer-not-to-say": [...]
}
```

### Matching Algorithm

1. New client joins queue with `filter` preference (any/male/female/prefer-not-to-say)
2. Server locks state and searches existing queues for compatible match
3. Compatibility check:
   - If filter="male", peer must be male
   - If filter="female", peer must be female
   - If filter="prefer-not-to-say", peer must be prefer-not-to-say
   - If filter="any", any gender matches
4. If match found:
   - Remove peer from queue
   - Create bidirectional active_pair entry
   - Increment daily counters
   - Send "matched" to both clients with peer profile
5. If no match:
   - Add to appropriate queue
   - Send "queued" confirmation

### Message Relay

1. Client A sends `{"action": "msg", "text": "..."}`
2. Server looks up peer ID in `active_pairs[device_a]`
3. Finds peer's WebSocket in `ws_connections[peer_id]`
4. Sends `{"type": "msg", "from": device_a, "text": ...}`
5. Silently handles peer disconnection

---

## Fairness & Limits

- **Daily Match Limit:** 6 matches per gender preference per day
- **Cooldown:** 5 seconds between join attempts per user
- **Filter Rules:**
   - `filter="any"` - matches any gender
   - `filter="male"` - matches only males
   - `filter="female"` - matches only females
   - `filter="prefer-not-to-say"` - matches only prefer-not-to-say

---

## Delete-After-Verify

**Core Privacy Principle:** Images are never persisted.

```python
@app.post("/verify")
async def verify(device_id: str = Query(...), file: UploadFile = File(...)):
    content = await file.read()              # Read image bytes
    gender = classify_gender_from_bytes(content)  # Classify
    del content                              # Delete immediately
    # Store only the classification result (gender), not the image
    return {"device_id": device_id, "gender": gender}
```

- Image uploaded from client
- Bytes read into memory
- Gender classification performed
- **Image deleted (never written to disk)**
- Only gender classification result returned
- Database stores only gender + device_id (no image)

---

## Data Models

### Device (Database)
```python
class Device:
    id: int                    # Primary key
    device_id: str            # Unique identifier
   gender: str | None        # "male", "female", or "prefer-not-to-say"
    created_at: float         # Unix timestamp
    updated_at: float         # Unix timestamp
```

### Report (Database)
```python
class Report:
    id: int                        # Primary key
    reporter_device_id: str        # Who reported
    reported_device_id: str        # Who was reported
    reason: str                    # Report reason
    created_at: datetime           # Timestamp
```

---

## Configuration

### Environment Variables

```bash
# Optional: PostgreSQL connection
export DATABASE_URL="postgresql+asyncpg://user:password@localhost/anonymous_chat"

# If not set, app runs in in-memory mode (data lost on restart)
```

### Backend Settings

Edit `backend/app/main.py`:
- `origins` - CORS allowed origins
- `limit` in `reset_daily_counts_if_needed()` - Daily match limit
- Cooldown timer in WebSocket handler

---

## Project Structure

```
anonymous-chat/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app + endpoints
│   │   ├── database.py             # SQLAlchemy async setup
│   │   ├── models.py               # DB models (Device, Report, DailyLimit)
│   │   └── init_db.py              # Create tables script
│   ├── main.py                     # Uvicorn runner
│   ├── ai_verification.py          # Placeholder for ML classifier
│   ├── matching.py                 # Matching logic (in-memory)
│   ├── websocket.py                # WebSocket helpers (optional)
│   ├── database.py                 # DB utilities (optional)
│   ├── models.py                   # DB models duplicate (optional)
│   ├── requirements.txt            # Python dependencies
│   ├── setup.bat                   # Windows setup helper
│   ├── setup.ps1                   # PowerShell setup helper
│   ├── GENDER_DETECTION_SETUP.md   # Gender detection notes
│   └── test_gender_detection.py    # Test script
│
├── frontend/
│   ├── public/
│   │   ├── index.html              # React mount point
│   │   └── manifest.json           # PWA manifest
│   ├── src/
│   │   ├── index.js                # Entry point
│   │   ├── main.jsx                # App bootstrap
│   │   ├── App.jsx                 # Main app component
│   │   ├── CameraVerify.jsx        # Verification page shell
│   │   ├── Chat.jsx                # Chat UI & WebSocket handler
│   │   ├── styles.css              # Global stylesheet
│   │   ├── components/
│   │   │   ├── CameraCapture.jsx   # Camera + profile form
│   │   │   ├── ChatInterface.jsx   # Chat UI skeleton
│   │   │   ├── MatchingQueue.jsx   # Queue UI skeleton
│   │   │   └── ProfileSetup.jsx    # Profile editor
│   │   └── utils/
│   │       ├── fingerprint.js      # Device ID management
│   │       └── socket.js           # WebSocket factory
│   ├── package.json                # npm dependencies
│   └── build/                       # Production build output
│
├── package-lock.json
└── README.md                        # This file
```

---

## Deployment Checklist

For production, complete these steps:

- [ ] Switch to PostgreSQL (set `DATABASE_URL`)
- [ ] Configure CORS origins (`allowed_origins` in backend)
- [ ] Replace hash-based gender classifier with real ML model
- [ ] Add rate limiting middleware
- [ ] Enable HTTPS / WebSocket Secure (WSS)
- [ ] Add Redis for queue persistence
- [ ] Deploy frontend to CDN (build: `npm run build`)
- [ ] Deploy backend with multiple workers (gunicorn + uvicorn)
- [ ] Add monitoring and logging
- [ ] Set up admin dashboard for report review

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "Cannot POST /verify" | Backend not running or CORS issue | Start backend: `python -m backend.main` |
| "WebSocket connection refused" | Backend WebSocket not responding | Check port 8000 is open and backend running |
| "Failed to load module script" | Stale service worker cached Vite entries | Clear cache: DevTools → Application → Clear storage |
| "Port 8000 already in use" | Another process using port | Kill process or change port in backend |
| "sqlalchemy.OperationalError" | Database not accessible | Set `DATABASE_URL` or run in-memory mode |

---

## Future Enhancements

- [ ] Redis-backed matching queue for horizontal scaling
- [ ] Real ML model for gender classification
- [ ] Admin dashboard for report management
- [ ] Advanced rate limiting & abuse prevention
- [ ] End-to-end encrypted messages
- [ ] Mobile app (React Native)
- [ ] Video chat support
- [ ] Reputation system

---

## Notes

- **In-Memory Mode:** No database required. All data lost on server restart. Perfect for demos.
- **Production:** Requires PostgreSQL, Redis, and proper deployment infrastructure.
- **Images:** Never written to disk. Deleted immediately after classification per delete-after-verify principle.
- **Performance:** FastAPI handles ~1000 concurrent WebSocket connections per server with async/await.

---

## License

MIT License - Use freely for educational and non-commercial purposes.

---

Built as a demo of **Controlled Anonymity** principles for privacy-preserving anonymous communication.
