import asyncio
import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models import FinalizeRequest, ReformatRequest, UpdateNotesRequest
from session.store import (
    get_session,
    get_all_chunks,
    create_session,
    get_failed_chunks,
    save_chunk,
    save_block_summaries,
    save_ncg,
    save_urls,
    set_status,
)
from services.sarvam_stt import transcribe_chunk
from services.sarvam_llm import (
    clean_transcript,
    summarise_chunk,
    aggregate_block,
    generate_ncg,
    refine_ncg,
    reformat_notes,
)
from services.speaker_map import assign_speakers
from services.export import export_documents

router = APIRouter()

CHUNK_GROUP_SIZE = 5  # number of chunk summaries per block


@router.post("/update-notes")
async def update_notes(request: UpdateNotesRequest, session_id: Optional[str] = None):
    """
    Saves updated notes back to the session store.
    Handles both full JSON updates and manual 'custom_notes' edits.
    Supports session_id in body or as query param for robustness.
    """
    # Robustly find session_id
    sid = request.session_id or session_id
    if not sid:
        # Fallback: check if it's inside the data dict (common mismatch)
        sid = request.data.get("session_id") or request.data.get("sessionId")
        
    if not sid:
        raise HTTPException(status_code=422, detail="session_id is required")

    session = get_session(sid, fetch_if_missing=True)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    old_ncg = session.get("ncg_json", {})
    new_data = request.data
    
    # If the incoming data is a full notes object (contains session_overview or similar)
    if any(k in new_data for k in ["session_overview", "topics_covered", "session_title"]):
        # It's a full replacement (likely from AI reformat)
        # Ensure we keep the session_id inside the data for storage consistency
        if "session_id" not in new_data:
            new_data["session_id"] = sid
        
        session["ncg_json"] = new_data
        save_ncg(sid, new_data)
    else:
        # It's likely a manual edit of the 'custom_notes' field
        new_content = new_data.get("custom_notes")
        if old_ncg and new_content:
            old_ncg["full_content_edited"] = new_content
            session["ncg_json"] = old_ncg
            save_ncg(sid, old_ncg)
        
    return {"message": "Notes updated successfully"}


# ── POST /reformat-notes ───────────────────────────────────────
@router.post("/reformat-notes")
async def handle_reformat(request: ReformatRequest):
    """
    Uses LLM to re-organize or simplify notes based on instructions.
    Only uses the information already present in the notes.
    """
    session = get_session(request.session_id, fetch_if_missing=True)
    if not session or not session.get("ncg_json"):
        raise HTTPException(status_code=404, detail="No notes found to reformat")

    # Get re-organized version from LLM
    old_notes = session["ncg_json"]
    block_summaries = session.get("block_summaries", [])
    new_notes = await reformat_notes(old_notes, request.instruction, block_summaries)
    
    if not new_notes:
        raise HTTPException(status_code=500, detail="Failed to reformat notes")

    # RESTORE TITLE: Ensure we don't lose the name of the file
    if not new_notes.get("session_title"):
        new_notes["session_title"] = old_notes.get("session_title") or old_notes.get("title") or "Session Notes"
    
    # Save the updated version
    # Do NOT save automatically anymore. Return to user for preview.
    # save_ncg(request.session_id, new_notes)
    
    return new_notes


# ── POST /finalize ─────────────────────────────────────────────
@router.post("/finalize")
async def finalize(request: FinalizeRequest):
    """
    Triggered when user clicks End Meeting.
    Runs full pipeline in background and returns immediately.
    """
    session_id = request.session_id
    session    = get_session(session_id)

    # ── Auto-create session if it doesn't exist ────────────────
    # This handles direct API testing without prior chunk uploads
    if not session:
        create_session(session_id, request.participants, [
            e.dict() for e in request.speaker_timeline
        ], request.user_id, title=request.title or "New Recording")
        session = get_session(session_id)

    # ── Update speaker timeline and participants ────────────────
    if request.speaker_timeline:
        session["speaker_timeline"] = [
            e.dict() for e in request.speaker_timeline
        ]
    if request.participants:
        session["participants"] = request.participants
    if request.title:
        session["title"] = request.title

    # Set status to processing and run pipeline in background
    set_status(session_id, "processing")
    asyncio.create_task(run_pipeline(session_id))

    return {"message": "Finalization started", "session_id": session_id}


# ── Full pipeline ──────────────────────────────────────────────
async def run_pipeline(session_id: str, participants: list = None, timeline: list = None):
    """
    Runs the complete pipeline after End Meeting:
        1. Retry failed chunks
        2. Speaker mapping
        3. MAP-REDUCE aggregation
        4. Final Notes generation
        5. Refinement pass
        6. Export PDF + DOCX
    """
    try:
        session = get_session(session_id)
        if not session:
            return

        # ── Update session data if provided ─────────────────────
        if participants:
            session["participants"] = participants
        if timeline:
            session["speaker_timeline"] = timeline

        # ── Wait for pending chunks to finish ──────────────────
        print("Waiting for pending chunks to finish processing...")
        for _ in range(5): # Wait up to 10 seconds for at least one chunk to appear
            chunks = get_all_chunks(session_id)
            if chunks:
                break
            await asyncio.sleep(2)

        while True:
            chunks = get_all_chunks(session_id)
            if chunks and all(c.get("status") != "pending" for c in chunks):
                break
            # If there are no chunks at all after waiting, we stop
            if not chunks:
                break
            await asyncio.sleep(2)
        print("All chunks finished.")

        # ── Step 1: Retry failed chunks ────────────────────────
        failed = get_failed_chunks(session_id)
        if failed:
            print(f"Retrying {len(failed)} failed chunks...")
            await _retry_failed_chunks(session_id, failed)

        # ── Step 2: Speaker mapping ────────────────────────────
        speaker_timeline = session.get("speaker_timeline", [])
        if speaker_timeline:
            print(f"[HEARTBEAT] Session {session_id}: Running speaker mapping...")
            chunks = get_all_chunks(session_id)
            tagged_transcript = assign_speakers(chunks, speaker_timeline)
        else:
            print(f"[HEARTBEAT] Session {session_id}: Skipping speaker mapping.")

        # ── Step 3: MAP-REDUCE — group chunks into blocks ──────
        chunks = get_all_chunks(session_id)
        if len(chunks) == 1:
            # FAST PATH: Single chunk doesn't need aggregation
            print(f"[HEARTBEAT] Session {session_id}: Fast Path - Single chunk detected.")
            first_chunk = chunks[0]
            if isinstance(first_chunk, dict):
                block_summaries = [first_chunk.get("summary", "")]
            else:
                block_summaries = [str(first_chunk)]
        else:
            print(f"[HEARTBEAT] Session {session_id}: Aggregating {len(chunks)} chunk summaries...")
            block_summaries = await _aggregate_blocks(session_id, chunks)
        
        save_block_summaries(session_id, block_summaries)

        # ── Step 4: Generate final MoM JSON ───────────────────
        print(f"[HEARTBEAT] Session {session_id}: Generating final structured notes...")
        participants = session.get("participants", [])
        meeting_date = datetime.now().strftime("%Y-%m-%d")

        ncg_json = await generate_ncg(
            block_summaries=block_summaries,
            participants=participants,
            meeting_date=meeting_date,
        )

        # Update session title and category from AI notes
        ai_title = ncg_json.get("session_title")
        if ai_title and ai_title not in ["Session Notes", "New Recording"]:
            session["title"] = ai_title
        
        print(f"[HEARTBEAT] Session {session_id}: Saving results to Database...")
        save_ncg(session_id, ncg_json)

        # ── Done ───────────────────────────────────────────────
        set_status(session_id, "completed")
        
        # ── Auto-Wipe Memory ──────────────────────────────────
        from session.store import clear_session_memory
        clear_session_memory(session_id)
        
        print(f"[FINISHED] Pipeline complete for session {session_id}. Status: COMPLETED.")

    except Exception as e:
        import traceback
        set_status(session_id, "failed")
        print(f"Pipeline error for session {session_id}: {e}")
        traceback.print_exc()
        set_status(session_id, "failed")


# ── Retry failed chunks ────────────────────────────────────────
async def _retry_failed_chunks(session_id: str, failed_indexes: list):
    """
    Re-processes only the chunks that failed during the meeting.
    Runs them sequentially to avoid hammering the Sarvam API.
    """
    session = get_session(session_id)

    for chunk_index in sorted(failed_indexes):
        print(f"Retrying chunk {chunk_index}...")
        try:
            # We don't have the original audio bytes anymore
            # so we mark them as skipped with empty content
            # In production you'd store audio bytes in session too
            save_chunk(session_id, chunk_index, {
                "chunk_index": chunk_index,
                "raw":         "[chunk unavailable — retry failed]",
                "clean":       "[chunk unavailable]",
                "summary":     "[this segment could not be recovered]",
                "words":       [],
                "status":      "ok",  # mark ok so pipeline continues
            })
        except Exception as e:
            print(f"Retry failed for chunk {chunk_index}: {e}")


# ── MAP-REDUCE: group chunk summaries into block summaries ─────
async def _aggregate_blocks(session_id: str, chunks: list) -> list:
    """
    Groups every CHUNK_GROUP_SIZE chunk summaries into one
    block summary using Sarvam-M.

    Example: 40 chunks / 5 per group = 8 block summaries
    """
    # Collect all chunk summaries in order
    summaries = [
        c.get("summary", "") for c in chunks
        if c.get("status") == "ok" and c.get("summary")
    ]

    if not summaries:
        return []

    # Split into groups of CHUNK_GROUP_SIZE
    groups = [
        summaries[i : i + CHUNK_GROUP_SIZE]
        for i in range(0, len(summaries), CHUNK_GROUP_SIZE)
    ]

    # Aggregate each group into one block summary
    block_summaries = []
    for block_index, group in enumerate(groups):
        print(f"Aggregating block {block_index + 1} of {len(groups)}...")
        block_summary = await aggregate_block(group, block_index)
        block_summaries.append(block_summary)

    return block_summaries


async def delete_temp_file(path: str, delay: int = 300):
    await asyncio.sleep(delay)
    try:
        if os.path.exists(path):
            os.remove(path)
            print(f"[CLEANUP] Deleted temp file: {path}")
    except Exception as e:
        print(f"[CLEANUP] Error deleting {path}: {e}")


# ── POST /export-pdf ───────────────────────────────────────────
@router.post("/export-pdf")
async def export_pdf_endpoint(session_id: str, background_tasks: BackgroundTasks):
    """
    Generates PDF on-demand and returns the download link.
    Automatically deletes the file from disk after 5 minutes.
    """
    session = get_session(session_id, fetch_if_missing=True)
    if not session or not session.get("ncg_json"):
        raise HTTPException(status_code=404, detail="Notes not found")

    from services.export import export_documents
    from session.store import save_urls
    
    pdf_url = export_documents(session["ncg_json"], session_id)
    save_urls(session_id, pdf_url, "") # No DOCX

    # Schedule deletion of the local file
    abs_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", pdf_url.lstrip("/")))
    background_tasks.add_task(delete_temp_file, abs_path)
    
    return {"pdf_url": pdf_url}