"""AI verification scaffold.
This module provides a stateless interface for gender classification.
The current implementation is a deterministic mock (hash-based). Replace with a model or API.
IMPORTANT: Do not persist images. This module should only return a classification string.
"""
import hashlib


def classify_image_bytes(content: bytes) -> str:
    h = hashlib.sha256(content).hexdigest()
    return "male" if int(h, 16) % 2 == 0 else "female"
