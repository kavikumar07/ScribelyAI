from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import os
from models import StatusResponse
from session.store import get_session, delete_session

router = APIRouter()

OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), "..", "outputs")


# ── GET /sessions ──────────────────────────────────────────────
@router.get("/sessions")
async def list_sessions():
    """
    Returns a summary list of all active sessions in memory.
    Used for the Home screen history list.
    """
    from session.store import sessions
    import time
    history = []
    for sid, data in sessions.items():
        ncg = data.get("ncg_json") or {}
        # Try to get a real timestamp if we added one, else use session ID part
        try:
            ts = float(sid.split("-")[-1]) / 1000  # Extract from sid e.g. session-1777...
        except:
            ts = time.time()

        history.append({
            "id": sid,
            "title": ncg.get("session_title") or data.get("title") or "New Recording",
            "date": ncg.get("date") or "Just now",
            "timestamp": ts,
            "status": data.get("status", "processing")
        })
    return sorted(history, key=lambda x: x["id"], reverse=True)
def _format_content(notes: dict) -> str:
    if not notes: return ""
    
    # If the user has edited the notes, return the edited version
    if notes.get("full_content_edited"):
        return notes["full_content_edited"]

    from services.export import _has_content
    lines = []
    title = notes.get("session_title") or notes.get("title") or "Class Session Notes"
    lines.append(f"=== {title.upper()} ===")
    lines.append("")
    
    metadata_keys = {"session_title", "title", "prepared_by", "status", "session_id"}
    for key, value in notes.items():
        if key in metadata_keys or not _has_content(value): continue
        lines.append(f"[{key.replace('_', ' ').upper()}]")
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    lines.append(f"• {item}")
                elif isinstance(item, dict):
                    for sub_k, sub_v in item.items():
                        if _has_content(sub_v): lines.append(f"  {sub_k.title()}: {sub_v}")
                    lines.append("")
        elif isinstance(value, dict):
            for sub_k, sub_v in value.items():
                if _has_content(sub_v): lines.append(f"  {sub_k.title()}: {sub_v}")
        else:
            if isinstance(value, str):
                lines.append(value)
            else:
                lines.append(str(value))
        lines.append("")
    return "\n".join(lines).strip()

@router.get("/status", response_model=StatusResponse)
async def get_status(session_id: str):
    """
    Called by popup.js every 2 seconds after End Meeting.
    Returns current pipeline status and download URLs when ready.
    """
    session = get_session(session_id, fetch_if_missing=True)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    content_str = None
    if session.get("ncg_json"):
        content_str = _format_content(session.get("ncg_json"))

    return StatusResponse(
        session_id = session_id,
        status     = session.get("status", "processing"),
        pdf_url    = session.get("pdf_url"),
        docx_url   = session.get("docx_url"),
        content    = content_str,
        ncg_json   = session.get("ncg_json"),
    )


# ── GET /outputs/{filename:path} ────────────────────────────────────
@router.get("/outputs/{filename:path}")
async def download_file(filename: str):
    """
    Serves the generated PDF or DOCX file for download.
    Deletes the file AFTER it is fully sent to the user.
    """
    # Normalize filename (remove leading slashes if any)
    clean_filename = filename.lstrip("/")
    
    file_path = os.path.abspath(
        os.path.join(OUTPUTS_DIR, clean_filename)
    )

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Extract session_id from filename (e.g. "test-001.pdf" -> "test-001")
    # This is a bit loose but works for cleanup
    session_id_part = os.path.basename(clean_filename).rsplit("_", 1)[-1].split(".")[0]

    # Determine media type
    if clean_filename.endswith(".pdf"):
        media_type = "application/pdf"
    elif clean_filename.endswith(".docx"):
        media_type = (
            "application/vnd.openxmlformats-officedocument"
            ".wordprocessingml.document"
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid file type")

    return FileResponse(
        path        = file_path,
        filename    = os.path.basename(clean_filename),
        media_type  = media_type,
    )


# ── DELETE /session/{session_id} ──────────────────────────────
@router.delete("/session/{session_id}")
async def remove_session(session_id: str):
    """
    Deletes a session from the in-memory store.
    """
    from session.store import delete_session
    delete_session(session_id)
    return {"status": "success", "message": "Session deleted"}