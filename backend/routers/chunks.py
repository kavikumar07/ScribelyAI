import json
import asyncio
import os
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from session.store import save_chunk, get_session, create_session, get_chunk
from services.sarvam_stt import transcribe_chunk
from services.sarvam_llm import clean_transcript, summarise_chunk
from routers.finalize import run_pipeline

router = APIRouter()

# ── POST /upload-chunk ─────────────────────────────────────────
@router.post("/upload-chunk")
async def upload_chunk(
    session_id: str             = Form(...),
    user_id:    str             = Form(default=""),
    audio:      UploadFile      = File(...),
    chunk_index:     int        = Form(...),
    speaker_timeline: str       = Form(default="[]"),
    participants:    str        = Form(default="[]"),
    background_tasks: BackgroundTasks = None,
):
    """
    Receives one 3-min audio chunk from the extension.
    Immediately starts STT + cleaning + summary in background.
    Returns instantly so the extension is not blocked.
    """
    print(f"\n[RECEIVE] >>> Session: {session_id} | Chunk: {chunk_index} | Size: {audio.size} bytes")

    # ── Validate ───────────────────────────────────────────────
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    # ── Parse JSON strings from form fields ───────────────────
    try:
        timeline     = json.loads(speaker_timeline)
        participants_list = json.loads(participants)
    except json.JSONDecodeError:
        timeline          = []
        participants_list = []

    # ── Create session if first chunk ─────────────────────────
    session = get_session(session_id)
    if not session:
        create_session(session_id, participants_list, timeline, user_id)

    # ── Read audio bytes ───────────────────────────────────────
    audio_bytes = await audio.read()

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file received")

    # ── Save chunk as pending immediately ─────────────────────
    save_chunk(session_id, chunk_index, {
        "chunk_index": chunk_index,
        "raw":         "",
        "clean":       "",
        "summary":     "",
        "words":       [],
        "status":      "pending",
    })
    print(f"[STORE]   >>> Chunk {chunk_index} saved as PENDING in memory.")

    # ── Process chunk in background ───────────────────────────
    if background_tasks:
        background_tasks.add_task(
            process_chunk, session_id, chunk_index, audio_bytes
        )
    else:
        asyncio.create_task(
            process_chunk(session_id, chunk_index, audio_bytes)
        )

    return {
        "message":     "Chunk received",
        "session_id":  session_id,
        "chunk_index": chunk_index,
    }


# ── Background task: STT → clean → summarise ──────────────────
async def process_chunk(session_id: str, chunk_index: int, audio_bytes: bytes):
    """
    Runs in the background while the meeting continues.
    """
    try:
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: Starting STT...")
        stt_result = await transcribe_chunk(audio_bytes, chunk_index, session_id)
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: STT finished.")

        if stt_result["status"] == "failed":
            print(f"[ERROR] Session {session_id} | Chunk {chunk_index}: STT failed.")
            save_chunk(session_id, chunk_index, {
                "chunk_index": chunk_index,
                "raw":         "",
                "clean":       "",
                "summary":     "",
                "words":       [],
                "status":      "failed",
            })
            return

        raw_transcript = stt_result["transcript"]
        words          = stt_result["words"]

        # ── Step 2: Clean transcript ───────────────────────────
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: Starting Cleaning...")
        cleaned = await clean_transcript(raw_transcript)
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: Cleaning finished.")

        # ── Step 3: Get previous chunk summary for context ─────
        prev_summary = _get_prev_summary(session_id, chunk_index)

        # ── Step 4: Summarise this chunk ───────────────────────
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: Starting Summary...")
        summary = await summarise_chunk(
            clean_transcript=cleaned,
            prev_summary=prev_summary,
            chunk_index=chunk_index,
        )
        print(f"[DEBUG] Session {session_id} | Chunk {chunk_index}: Summary finished.")

        # ── Save all results ───────────────────────────────────
        save_chunk(session_id, chunk_index, {
            "chunk_index": chunk_index,
            "raw":         raw_transcript,
            "clean":       cleaned,
            "summary":     summary,
            "words":       words,
            "status":      "ok",
        })

        print(f"[SUCCESS] Chunk {chunk_index} processed fully for {session_id}.")

    except Exception as e:
        print(f"Chunk {chunk_index} processing error: {e}")
        save_chunk(session_id, chunk_index, {
            "chunk_index": chunk_index,
            "raw":         "",
            "clean":       "",
            "summary":     "",
            "words":       [],
            "status":      "failed",
        })


# ── Get previous chunk summary for context carryover ──────────
def _get_prev_summary(session_id: str, chunk_index: int) -> str:
    if chunk_index == 0:
        return ""
    prev_chunk = get_chunk(session_id, chunk_index - 1)
    if prev_chunk:
        return prev_chunk.get("summary", "")
    return ""