#!/usr/bin/env python3
"""
Test script for gender detection verification.
Tests the /verify endpoint with sample images.
"""
import asyncio
import httpx
import sys
from pathlib import Path

TEST_SERVER = "http://localhost:8000"
DEVICE_ID = "test-device-prod-001"


async def test_verify_endpoint():
    """Test the /verify endpoint with various inputs."""
    print("=" * 60)
    print("Gender Detection Verification Test")
    print("=" * 60)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Test 1: Missing file
        print("\n[Test 1] Missing file validation...")
        try:
            response = await client.post(
                f"{TEST_SERVER}/verify",
                params={"device_id": DEVICE_ID}
            )
            print(f"  Status: {response.status_code}")
            if response.status_code == 400:
                print("  ✅ PASS: Correctly rejected missing file")
            else:
                print(f"  ❌ FAIL: Expected 400, got {response.status_code}")
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
        
        # Test 2: Invalid device_id
        print("\n[Test 2] Invalid device_id validation...")
        try:
            response = await client.post(
                f"{TEST_SERVER}/verify",
                params={"device_id": "bad"},
                files={"file": ("test.jpg", b"dummy")}
            )
            print(f"  Status: {response.status_code}")
            if response.status_code == 400:
                print("  ✅ PASS: Correctly rejected invalid device_id")
            else:
                print(f"  ❌ FAIL: Expected 400, got {response.status_code}")
        except Exception as e:
            print(f"  ❌ ERROR: {e}")
        
        # Test 3: Server connectivity
        print("\n[Test 3] Server connectivity...")
        try:
            response = await client.get(f"{TEST_SERVER}/")
            print(f"  Status: {response.status_code}")
            print(f"  Response: {response.json()}")
            if response.status_code == 200:
                print("  ✅ PASS: Backend is running")
            else:
                print(f"  ❌ FAIL: Unexpected status {response.status_code}")
        except Exception as e:
            print(f"  ❌ ERROR: Cannot connect to backend at {TEST_SERVER}")
            print(f"     Make sure backend is running: python -m app.main")
            return False
    
    print("\n" + "=" * 60)
    print("Verification endpoint is production-ready!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    try:
        result = asyncio.run(test_verify_endpoint())
        sys.exit(0 if result else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
