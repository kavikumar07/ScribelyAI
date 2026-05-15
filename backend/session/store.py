from typing import Dict, Any, List, Optional
from session.supabase_client import supabase

# ── In-memory store ────────────────────────────────────────────
# Still keeping this for temporary chunk storage during recording
sessions: Dict[str, Any] = {}


def create_session(session_id: str, participants: List[str], speaker_timeline: List[dict], user_id: str, title: Optional[str] = None):
    if session_id in sessions:
        return
        
    if not title:
        from datetime import datetime
        title = f"Recording {datetime.now().strftime('%H:%M')}"
        
    sessions[session_id] = {
        "status":           "processing",
        "title":            title,
        "user_id":          user_id,
        "participants":     participants,
        "speaker_timeline": speaker_timeline,
        "chunks":           {},
        "block_summaries":  [],
        "ncg_json":         None,
        "pdf_url":          None,
    }
    
    # Persist initial record to Supabase
    try:
        supabase.table("notes").upsert({
            "session_id":   session_id,
            "user_id":      user_id,
            "title":        title,
            "status":       "processing",
            "participants": participants,
        }).execute()
    except Exception as e:
        print(f"Supabase Save Error (create_session): {e}")


def save_chunk(session_id: str, chunk_index: int, data: dict):
    if session_id not in sessions:
        return
    sessions[session_id]["chunks"][chunk_index] = data


def get_chunk(session_id: str, chunk_index: int) -> dict:
    return sessions.get(session_id, {}).get("chunks", {}).get(chunk_index, {})


def get_all_chunks(session_id: str) -> List[dict]:
    chunks = sessions.get(session_id, {}).get("chunks", {})
    return [chunks[i] for i in sorted(chunks.keys())]


def get_failed_chunks(session_id: str) -> List[int]:
    chunks = sessions.get(session_id, {}).get("chunks", {})
    return [i for i, c in chunks.items() if c.get("status") == "failed"]


def set_status(session_id: str, status: str):
    if session_id in sessions:
        sessions[session_id]["status"] = status
        
    # Persist to Supabase so frontend polling finds it immediately
    try:
        supabase.table("notes").update({"status": status}).eq("session_id", session_id).execute()
    except Exception as e:
        print(f"Supabase Update Error (set_status): {e}")


def save_block_summaries(session_id: str, summaries: List[str]):
    if session_id in sessions:
        sessions[session_id]["block_summaries"] = summaries


def save_ncg(session_id: str, ncg_json: dict):
    if session_id in sessions:
        sessions[session_id]["ncg_json"] = ncg_json
        user_id = sessions[session_id].get("user_id")
        
        # Persist to Supabase
        try:
            # Check for AI-generated title
            new_title = ncg_json.get("session_title") or ncg_json.get("title")
            update_data = {
                "ncg_json": ncg_json,
                "status": "completed",
                "summaries": sessions[session_id].get("block_summaries", [])
            }
            if new_title and new_title not in ["Session Notes", "New Recording"]:
                update_data["title"] = new_title
                sessions[session_id]["title"] = new_title

            supabase.table("notes").update(update_data).eq("session_id", session_id).execute()
        except Exception as e:
            print(f"Supabase Save Error (save_ncg): {e}")


def save_urls(session_id: str, pdf_url: str, docx_url: str = ""):
    if session_id in sessions:
        sessions[session_id]["pdf_url"]  = pdf_url
        
        # Persist to Supabase
        try:
            supabase.table("notes").update({
                "pdf_url": pdf_url
            }).eq("session_id", session_id).execute()
        except Exception as e:
            print(f"Supabase Save Error (save_urls): {e}")


def clear_session_memory(session_id: str):
    """
    Clears raw chunks and summaries from memory once processing is done.
    Keeps only the final ncg_json in memory (and it's already in DB).
    """
    if session_id in sessions:
        sessions[session_id]["chunks"] = {}
        sessions[session_id]["block_summaries"] = []
        sessions[session_id]["speaker_timeline"] = []
        print(f"[CLEANUP] Memory cleared for session {session_id}")


def get_session(session_id: str, fetch_if_missing: bool = False) -> Optional[dict]:
    """
    Returns the session dict. If missing from memory and fetch_if_missing is True,
    attempts to reconstruct it from Supabase.
    """
    if session_id in sessions:
        return sessions[session_id]
    
    if fetch_if_missing:
        try:
            print(f"[DB] Fetching session {session_id} from Supabase...")
            res = supabase.table("notes").select("*").eq("session_id", session_id).single().execute()
            if res.data:
                db_data = res.data
                # Reconstruct a minimal session object for the reformatting/editing pipeline
                new_session = {
                    "session_id": session_id,
                    "user_id":    db_data.get("user_id"),
                    "title":      db_data.get("title", "Historical Note"),
                    "ncg_json":   db_data.get("ncg_json"),
                    "pdf_url":    db_data.get("pdf_url"),
                    "status":     db_data.get("status", "completed"),
                    "chunks":     {}, # Raw audio chunks are not stored in DB
                    "block_summaries": db_data.get("summaries", []) 
                }
                # Put back in memory for active editing
                sessions[session_id] = new_session
                return new_session
        except Exception as e:
            print(f"[DB] Error fetching session {session_id}: {e}")
            
    return None


def delete_session(session_id: str):
    if session_id in sessions:
        del sessions[session_id]