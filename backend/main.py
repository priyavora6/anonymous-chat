"""
Top-level backend runner.
Wraps the FastAPI app under app.main so you can run `python -m backend.main`.
"""
import uvicorn


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
