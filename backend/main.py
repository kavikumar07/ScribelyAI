from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routers import chunks, finalize, status, auth

app = FastAPI(title="Notes Generator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chunks.router,   tags=["Chunks"])
app.include_router(finalize.router, tags=["Finalize"])
app.include_router(status.router,   tags=["Status"])
app.include_router(auth.router,     tags=["Auth"])

OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUTPUTS_DIR, exist_ok=True)

# Serve generated files (PDF, DOCX, TXT) as static files
app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")


@app.get("/")
async def root():
    return {"status": "Notes Generator API is running"}