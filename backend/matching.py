"""Matching queue scaffold.
This module exposes a simple in-memory queue and a Redis-backed option if `aioredis` is available.
For production use replace with Redis-based implementation.
"""
import asyncio
from typing import Dict, List, Tuple

# queue: filter -> list of device ids
queues: Dict[str, List[str]] = {"male": [], "female": [], "any": []}
lock = asyncio.Lock()


async def enqueue(device_id: str, filter_pref: str = "any"):
    async with lock:
        queues.setdefault(filter_pref, []).append(device_id)


async def dequeue(device_id: str):
    async with lock:
        for k in list(queues.keys()):
            queues[k] = [d for d in queues[k] if d != device_id]


async def find_match(device_id: str, filter_pref: str = "any") -> Tuple[str, str]:
    async with lock:
        # naive matching: return first other device in same filter or any
        for other in queues.get(filter_pref, []):
            if other != device_id:
                queues[filter_pref].remove(other)
                return device_id, other
        # check any
        for other in queues.get("any", []):
            if other != device_id:
                queues["any"].remove(other)
                return device_id, other
    return (device_id, None)
