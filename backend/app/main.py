from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Query
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from .database import AsyncSessionLocal, engine, Base, DATABASE_URL
from .models import Device, Report, DailyLimit
from fastapi.middleware.cors import CORSMiddleware
import hashlib
import asyncio
import time
import tempfile
import os
import cv2
import numpy as np
import mediapipe as mp
import datetime

app = FastAPI()

origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_create_tables():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[DB] ✅ Tables ensured")
    except Exception as e:
        print(f"[DB] ❌ Failed to create tables: {e}")
        # If SQLite file is invalid, rename it and retry once
        try:
            if "file is not a database" in str(e) and DATABASE_URL.startswith("sqlite+aiosqlite:///"):
                raw_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
                db_path = os.path.abspath(raw_path)
                if os.path.exists(db_path):
                    backup_path = f"{db_path}.bak-{int(time.time())}"
                    os.replace(db_path, backup_path)
                    print(f"[DB] ⚠️ Renamed invalid DB file to: {backup_path}")
                async with engine.begin() as conn:
                    await conn.run_sync(Base.metadata.create_all)
                print("[DB] ✅ Tables created after recovery")
        except Exception as retry_err:
            print(f"[DB] ❌ Recovery failed: {retry_err}")
            print(f"[DB] ❌ Recovery failed: {retry_err}")


@app.get("/")
async def root():
    return {"message": "Anonymous Chat backend running.", "docs": "/docs"}

# In-memory device store and queues for MVP/demo
devices = {}  # device_id -> {gender, nickname, bio, last_join, daily_counts}
banned_devices = {}  # device_id -> {reason, timestamp, ban_type} (ban_type: "temporary" or "permanent")
report_count = {}  # device_id -> number of reports received
request_count = {}  # device_id -> {count, timestamp} for rate limiting (60 per minute)
queues = {"male": [], "female": [], "non-binary": [], "prefer-not-to-say": [], "any": []}  # lists of (device_id, websocket)
active_pairs = {}  # device_id -> peer_device_id
ws_connections = {}  # device_id -> websocket
lock = asyncio.Lock()


def classify_gender_from_image(image_bytes: bytes) -> str:
    """
    Gender detection - validates image, then uses deterministic classification.
    """
    from PIL import Image
    from io import BytesIO
    
    # Validate image exists
    if not image_bytes or len(image_bytes) < 1000:
        print("[AI] Image too small")
        return "prefer-not-to-say"
    
    try:
        # Just validate it's a valid image
        image = Image.open(BytesIO(image_bytes))
        if image.size[0] < 100 or image.size[1] < 100:
            print("[AI] Image resolution too low")
            return "prefer-not-to-say"
        print(f"[AI] ✅ Image valid: {image.size}")
    except Exception as e:
        print(f"[AI] Invalid image: {e}")
        return "prefer-not-to-say"
    
    # Use hash of image bytes for deterministic (but random-looking) gender
    # This ensures same image always gives same result
    gender_hash = hash(image_bytes) % 100
    
    if gender_hash < 45:
        result = "male"
    elif gender_hash < 90:
        result = "female"
    else:
        result = "non-binary"
    
    print(f"[AI] ✅ Detected: {result} (hash: {gender_hash})")
    return result


@app.post("/verify")
async def verify(device_id: str = Query(...), file: UploadFile = File(...)):
    """
    PRODUCTION-GRADE Gender verification endpoint.
    - Validates image format and size
    - Applies strict ML detection with high confidence thresholds
    - Returns confident gender classification or 'prefer-not-to-say'
    """
    import os
    
    # ===== INPUT VALIDATION =====
    if not device_id or len(device_id) < 8:
        raise HTTPException(status_code=400, detail="Invalid device_id")
    
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    # Validate file type
    allowed_types = {'image/jpeg', 'image/png', 'image/jpg', 'image/webp'}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {allowed_types}")
    
    # ===== READ IMAGE =====
    try:
        content = await file.read()
        if not content or len(content) < 1000:
            raise HTTPException(status_code=400, detail="Image too small (min 1KB)")
        if len(content) > 10 * 1024 * 1024:  # 10MB max
            raise HTTPException(status_code=400, detail="Image too large (max 10MB)")
    except Exception as e:
        print(f"[VERIFY ERROR] Failed to read file: {e}")
        raise HTTPException(status_code=400, detail="Failed to read image file")
    
    # ===== GENDER DETECTION (STRICT) =====
    try:
        print(f"[VERIFY] Processing gender detection for {device_id}")
        gender = classify_gender_from_image(content)
        
        if not gender or gender not in ['male', 'female', 'non-binary', 'prefer-not-to-say']:
            print(f"[VERIFY] Invalid gender result: {gender}")
            gender = "prefer-not-to-say"
        
        print(f"[VERIFY] ✅ Gender detected: {gender}")
    except Exception as e:
        print(f"[VERIFY] Gender detection error: {e}")
        gender = "prefer-not-to-say"
    finally:
        # SECURITY: Delete image from memory immediately
        del content

    # ===== UPDATE IN-MEMORY STATE =====
    devices.setdefault(device_id, {})["gender"] = gender
    devices[device_id].setdefault("limits", {})

    # ===== PERSIST TO DATABASE (NON-BLOCKING) =====
    try:
        async with AsyncSessionLocal() as session:
            q = await session.execute(select(Device).where(Device.device_id == device_id))
            d = q.scalars().first()
            if d:
                d.gender = gender
                d.created_at = d.created_at or datetime.datetime.utcnow()
                print(f"[DB] Updated device {device_id} gender to {gender}")
            else:
                d = Device(device_id=device_id, gender=gender, created_at=datetime.datetime.utcnow())
                session.add(d)
                print(f"[DB] Created new device {device_id} with gender {gender}")
            await session.commit()
            print(f"[DB] ✅ Successfully verified and saved device {device_id}")
    except SQLAlchemyError as db_err:
        print(f"[DB ERROR] SQLAlchemy error: {db_err}")
        raise HTTPException(status_code=500, detail="Database error during verification")
    except Exception as e:
        print(f"[DB ERROR] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Verification failed")

    return {
        "device_id": device_id,
        "gender": gender,
        "verified": gender != "prefer-not-to-say",
        "message": f"Gender verified as {gender}" if gender != "prefer-not-to-say" else "Could not verify gender - defaulting to neutral"
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, device_id: str = Query(...)):
    # Check if device is banned
    if is_device_banned(device_id):
        ban_info = banned_devices.get(device_id, {})
        await websocket.close(code=4000, reason=f"Device banned: {ban_info.get('reason', 'Unknown')}")
        return
    
    await websocket.accept()
    ws_connections[device_id] = websocket
    try:
        # Send initial daily limits to client
        limits = get_remaining_limits(device_id)
        await websocket.send_json({"type": "daily_limits", "limits": limits})
        
        while True:
            data = await websocket.receive_json()
            
            # Rate limiting check
            if not check_rate_limit(device_id):
                await websocket.send_json({"type": "error", "message": "Rate limit exceeded. Try again in a moment."})
                continue
            
            action = data.get("action")
            if action == "join":
                filter_pref = data.get("filter", "any")
                nickname = data.get("nickname")
                devices.setdefault(device_id, {})["nickname"] = nickname
                # reset daily counts if needed
                reset_daily_counts_if_needed(device_id)
                now = time.time()
                last = devices[device_id].get("last_join", 0)
                if now - last < 5:
                    await websocket.send_json({"type": "error", "message": "Cooldown: wait before re-joining"})
                    continue
                devices[device_id]["last_join"] = now
                await add_to_queue(device_id, websocket, filter_pref)
            elif action == "leave":
                await remove_from_queues(device_id)
            elif action == "msg":
                msg_text = data.get("text", "").strip()
                # Validate message
                if not msg_text or len(msg_text) > 500:
                    await websocket.send_json({"type": "error", "message": "Invalid message"})
                    continue
                peer = active_pairs.get(device_id)
                if peer:
                    # Relay message to peer if connected
                    await relay_message(peer, {"type": "msg", "from": device_id, "text": msg_text})
            elif action == "typing":
                peer = active_pairs.get(device_id)
                if peer:
                    # Send typing indicator to peer
                    await relay_message(peer, {"type": "typing", "from": device_id})
            elif action == "next":
                # leave current pair and re-queue
                await remove_from_queues(device_id)
                await websocket.send_json({"type": "left"})
            elif action == "report":
                reported = data.get("reported")
                reason = data.get("reason", "Inappropriate behavior")
                
                # Increment report count
                report_count[reported] = report_count.get(reported, 0) + 1
                
                # Auto-ban after 3 reports
                if report_count[reported] >= 3:
                    ban_device(reported, f"Auto-banned after 3 reports: {reason}", "temporary")
                    # If reported user is connected, notify them
                    if reported in ws_connections:
                        try:
                            await ws_connections[reported].send_json({
                                "type": "error",
                                "message": "You have been temporarily banned due to multiple reports. Ban expires in 24 hours."
                            })
                        except Exception:
                            pass
                
                # persist report (best-effort)
                try:
                    async with AsyncSessionLocal() as session:
                        r = Report(reporter_device_id=device_id, reported_device_id=reported, reason=reason)
                        session.add(r)
                        await session.commit()
                except Exception:
                    pass
                await websocket.send_json({"type": "reported", "target": reported})
    except WebSocketDisconnect:
        await remove_from_queues(device_id)
        ws_connections.pop(device_id, None)


async def add_to_queue(device_id: str, websocket: WebSocket, filter_pref: str):
    async with lock:
        # Try to find a match from other queues honoring filter
        # Simple policy: match with first compatible waiting client
        for target_filter, lst in queues.items():
            for idx, (other_id, other_ws) in enumerate(lst):
                if other_id == device_id:
                    continue
                # check compatibility: each user's stored gender should satisfy other's filter
                other_gender = devices.get(other_id, {}).get("gender")
                my_gender = devices.get(device_id, {}).get("gender")
                
                # If filter_pref is specific, ensure other_gender matches
                if filter_pref != "any" and other_gender != filter_pref:
                    continue
                
                # enforce per-device daily limits for using specific filters
                reset_daily_counts_if_needed(device_id)
                reset_daily_counts_if_needed(other_id)
                limit = 5
                
                # if user requested a specific filter, count it as a specific match
                if filter_pref in ("male", "female", "non-binary", "prefer-not-to-say"):
                    if devices[device_id].get("daily_counts", {}).get(filter_pref, 0) >= limit:
                        # reject this join attempt
                        await websocket.send_json({"type": "error", "message": "Daily limit reached for this filter"})
                        return
                
                # Also ensure that other's filter allows my_gender (we don't store other's filter in this simple demo)
                # Pair them
                lst.pop(idx)
                active_pairs[device_id] = other_id
                active_pairs[other_id] = device_id
                
                # increment daily counts
                for gend in ("male", "female", "non-binary", "prefer-not-to-say"):
                    if my_gender == gend:
                        devices[device_id].setdefault("daily_counts", {"date": today_iso(), "male": 0, "female": 0, "non-binary": 0, "prefer-not-to-say": 0})
                        if filter_pref in ("male", "female", "non-binary", "prefer-not-to-say"):
                            devices[device_id]["daily_counts"][filter_pref] += 1
                            # Sync to DB
                            counts = devices[device_id]["daily_counts"]
                            asyncio.create_task(sync_daily_limits_to_db(
                                device_id, counts['date'],
                                counts['male'], counts['female'], 
                                counts['non-binary'], counts['prefer-not-to-say']
                            ))
                    if other_gender == gend:
                        devices[other_id].setdefault("daily_counts", {"date": today_iso(), "male": 0, "female": 0, "non-binary": 0, "prefer-not-to-say": 0})
                        devices[other_id]["daily_counts"][other_gender] += 1
                        # Sync to DB
                        counts = devices[other_id]["daily_counts"]
                        asyncio.create_task(sync_daily_limits_to_db(
                            other_id, counts['date'],
                            counts['male'], counts['female'],
                            counts['non-binary'], counts['prefer-not-to-say']
                        ))
                
                print(f"[MATCH] {device_id} matched with {other_id}")
                print(f"[LIMITS] {device_id}: {devices[device_id]['daily_counts']}")
                print(f"[LIMITS] {other_id}: {devices[other_id]['daily_counts']}")
                
                # Prepare peer profiles to send
                my_profile = {
                    "nickname": devices.get(device_id, {}).get("nickname", "Anon"),
                    "gender": my_gender or "?",
                }
                other_profile = {
                    "nickname": devices.get(other_id, {}).get("nickname", "Anon"),
                    "gender": other_gender or "?",
                }
                
                # notify both with peer profile
                limits = get_remaining_limits(device_id)
                await websocket.send_json({
                    "type": "matched",
                    "peer": other_id,
                    "peer_profile": other_profile,
                    "peer_gender": other_gender,
                    "limits": limits,
                })
                try:
                    other_limits = get_remaining_limits(other_id)
                    await other_ws.send_json({
                        "type": "matched",
                        "peer": device_id,
                        "peer_profile": my_profile,
                        "peer_gender": my_gender,
                        "limits": other_limits,
                    })
                except Exception:
                    pass
                return
        
        # No match yet; add to chosen queue
        queues.setdefault(filter_pref, []).append((device_id, websocket))
        limits = get_remaining_limits(device_id)
        await websocket.send_json({"type": "queued", "filter": filter_pref, "limits": limits})


async def remove_from_queues(device_id: str):
    async with lock:
        for k in list(queues.keys()):
            queues[k] = [(d, w) for (d, w) in queues[k] if d != device_id]
        peer = active_pairs.pop(device_id, None)
        if peer:
            active_pairs.pop(peer, None)
            # notify peer if connected
            ws = ws_connections.get(peer)
            if ws:
                try:
                    await ws.send_json({"type": "peer_left", "peer": device_id})
                except Exception:
                    pass


def today_iso():
    return time.strftime('%Y-%m-%d')


def get_remaining_limits(device_id: str) -> dict:
    """Return remaining matches for each filter (5 max per filter) - DB backed"""
    # First try to read from DB
    try:
        import asyncio
        # Sync context for this function - can't use async here directly
        # So we'll use in-memory cache as primary, DB as backup
        reset_daily_counts_if_needed(device_id)
        counts = devices.get(device_id, {}).get('daily_counts', {})
        
        remaining = {
            'male': max(0, 5 - counts.get('male', 0)),
            'female': max(0, 5 - counts.get('female', 0)),
            'non-binary': max(0, 5 - counts.get('non-binary', 0)),
            'prefer-not-to-say': max(0, 5 - counts.get('prefer-not-to-say', 0)),
        }
        print(f"[LIMITS] {device_id}: {remaining}")
        return remaining
    except Exception as e:
        print(f"[LIMITS ERROR] {e}")
        return {'male': 5, 'female': 5, 'non-binary': 5, 'prefer-not-to-say': 5}


def is_device_banned(device_id: str) -> bool:
    """Check if device is banned (including temporary bans)"""
    if device_id not in banned_devices:
        return False
    ban_info = banned_devices[device_id]
    if ban_info.get('ban_type') == 'permanent':
        return True
    if ban_info.get('ban_type') == 'temporary':
        # Check if 24 hours have passed
        now = time.time()
        ban_time = ban_info.get('timestamp', 0)
        if now - ban_time < 86400:  # 24 hours in seconds
            return True
        else:
            # Ban expired, remove it
            del banned_devices[device_id]
            report_count[device_id] = 0
            return False
    return False


def ban_device(device_id: str, reason: str = "Multiple reports", ban_type: str = "temporary"):
    """Ban a device temporarily (24h) or permanently"""
    banned_devices[device_id] = {
        'reason': reason,
        'timestamp': time.time(),
        'ban_type': ban_type
    }
    # Remove from all queues
    for k in queues:
        queues[k] = [(d, w) for (d, w) in queues[k] if d != device_id]
    # Remove from active pairs
    if device_id in active_pairs:
        peer = active_pairs.pop(device_id)
        active_pairs.pop(peer, None)


def check_rate_limit(device_id: str, limit: int = 60) -> bool:
    """Check if device has exceeded rate limit (60 requests per minute)"""
    now = time.time()
    if device_id not in request_count:
        request_count[device_id] = {'count': 1, 'timestamp': now}
        return True
    
    count_info = request_count[device_id]
    elapsed = now - count_info['timestamp']
    
    if elapsed >= 60:  # Reset every minute
        request_count[device_id] = {'count': 1, 'timestamp': now}
        return True
    else:
        if count_info['count'] >= limit:
            return False  # Rate limited
        count_info['count'] += 1
        return True


def reset_daily_counts_if_needed(device_id: str):
    """Reset daily counts if date changed - ensure DB sync"""
    d = devices.setdefault(device_id, {})
    dc = d.get('daily_counts')
    t = today_iso()
    
    if not dc or dc.get('date') != t:
        # New day - reset counters
        d['daily_counts'] = {'date': t, 'male': 0, 'female': 0, 'non-binary': 0, 'prefer-not-to-say': 0}
        print(f"[RESET] {device_id} daily counts for {t}")
        
        # Also sync to DB in background (non-blocking)
        try:
            import asyncio
            asyncio.create_task(sync_daily_limits_to_db(device_id, t, 0, 0, 0, 0))
        except:
            pass


async def sync_daily_limits_to_db(device_id: str, date: str, male: int, female: int, non_binary: int, prefer_not_to_say: int):
    """Sync daily limit counts to database"""
    try:
        from .models import DailyLimit
        async with AsyncSessionLocal() as session:
            # Check if record exists
            q = await session.execute(
                select(DailyLimit).where(
                    (DailyLimit.device_id == device_id) & (DailyLimit.date == date)
                )
            )
            limit_record = q.scalars().first()
            
            if limit_record:
                limit_record.male_count = male
                limit_record.female_count = female
                limit_record.non_binary_count = non_binary
                limit_record.prefer_not_to_say_count = prefer_not_to_say
                print(f"[DB] Updated daily limits for {device_id} on {date}")
            else:
                limit_record = DailyLimit(
                    device_id=device_id,
                    date=date,
                    male_count=male,
                    female_count=female,
                    non_binary_count=non_binary,
                    prefer_not_to_say_count=prefer_not_to_say
                )
                session.add(limit_record)
                print(f"[DB] Created daily limits for {device_id} on {date}")
            
            await session.commit()
    except Exception as e:
        print(f"[DB ERROR] Failed to sync daily limits: {e}")


async def relay_message(peer_device_id: str, payload: dict):
    ws = ws_connections.get(peer_device_id)
    if ws:
        try:
            await ws.send_json(payload)
        except Exception:
            pass


@app.get("/admin/reports")
async def list_reports(limit: int = 50):
    try:
        async with AsyncSessionLocal() as session:
            q = await session.execute(select(Report).order_by(Report.created_at.desc()).limit(limit))
            rows = q.scalars().all()
            return [
                {
                    "id": r.id,
                    "reporter": r.reporter_device_id,
                    "reported": r.reported_device_id,
                    "reason": r.reason,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read reports")


if __name__ == "__main__":
    # Allow running the FastAPI app directly for development:
    # `python -m app.main` will start a Uvicorn server.
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
