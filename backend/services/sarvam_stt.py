import os
import tempfile
import subprocess
import asyncio
from dotenv import load_dotenv
from sarvamai import SarvamAI

load_dotenv()

# ── CONFIG ────────────────────────────────────────────────────
SARVAM_API_KEY   = os.getenv("SARVAM_API_KEY", "")
SARVAM_STT_MODEL = "saaras:v3"
SARVAM_LIMIT_SEC = 28  # Stay slightly under the 30s limit for safety

# Initialize Sarvam client
sarvam_client = SarvamAI(api_subscription_key=SARVAM_API_KEY)
print(f"Using Sarvam AI STT (Model: {SARVAM_STT_MODEL}) | Key: {SARVAM_API_KEY[:7]}***")


# ── Transcribe one audio chunk ─────────────────────────────────
async def transcribe_chunk(audio_bytes: bytes, chunk_index: int, session_id: str = "default") -> dict:
    if len(audio_bytes) < 1000:
        print(f"STT chunk {chunk_index}: too small ({len(audio_bytes)} bytes), skipping")
        return _failed_result()

    # Convert to WAV first
    wav_path = _convert_to_wav_file(audio_bytes, chunk_index, session_id)
    if not wav_path:
        print(f"STT chunk {chunk_index}: conversion to WAV failed")
        return _failed_result()

    try:
        # ── Route to Sarvam Cloud ─────────────────────────────
        if sarvam_client:
            print(f"[CLOUD]   >>> STT chunk {chunk_index}: Checking length and splitting if needed...")
            
            # Split into segments to stay under Sarvam's 30s limit
            segments = _split_audio(wav_path, chunk_index, session_id)
            full_transcript = []

            print(f"[CLOUD]   >>> STT chunk {chunk_index}: Split into {len(segments)} segments")

            for i, segment_path in enumerate(segments):
                print(f"       >>> Segment {i+1}/{len(segments)} ({os.path.getsize(segment_path)} bytes)...")
                
                text = ""
                for attempt in range(3):
                    try:
                        with open(segment_path, "rb") as f:
                            response = sarvam_client.speech_to_text.transcribe(
                                file=f,
                                model=SARVAM_STT_MODEL,
                                mode="transcribe"
                            )
                        
                        # Extract text
                        text = getattr(response, "transcript", "").strip()
                        if not text and hasattr(response, "__str__"):
                            import json
                            try:
                                resp_dict = json.loads(str(response))
                                text = resp_dict.get("transcript", "").strip()
                            except:
                                text = str(response).strip()
                        
                        if text:
                            break # Success
                    except Exception as e:
                        print(f"       >>> Segment {i+1} attempt {attempt+1} failed: {e}")
                        if attempt < 2:
                            import time
                            time.sleep(3)
                        else:
                            text = "" # Failed all attempts
                
                print(f"       >>> Segment {i+1} result: \"{text[:50]}...\"")
                if text:
                    full_transcript.append(text)
                
                # Cleanup segment
                if os.path.exists(segment_path):
                    os.remove(segment_path)

            final_text = " ".join(full_transcript).strip()
            print(f"[CLOUD]   >>> STT chunk {chunk_index} complete. Final length: {len(final_text)} chars")
            
            return {
                "transcript": final_text,
                "words":      [], 
                "status":     "ok",
            }

        # Sarvam is the only STT provider
        print(f"STT chunk {chunk_index}: Sarvam client not initialized.")
        return _failed_result()

    except Exception as e:
        print(f"STT error chunk {chunk_index}: {e}")
        return _failed_result()
    finally:
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)

# ── Split audio into 30s segments ──────────────────────────────
def _split_audio(input_path: str, chunk_index: int, session_id: str) -> list:
    """Uses ffmpeg to split long audio into <30s segments for Sarvam API."""
    temp_dir = tempfile.gettempdir()
    # Use session_id in the pattern to avoid collisions
    short_sid = session_id[:8]
    output_pattern = os.path.join(temp_dir, f"sess_{short_sid}_chunk_{chunk_index}_seg_%03d.wav")
    
    try:
        # -f segment: use the segment muxer
        # -segment_time: length of segments
        # -reset_timestamps: start each segment at 0 time
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-f", "segment", "-segment_time", str(SARVAM_LIMIT_SEC), "-c", "copy", output_pattern],
            capture_output=True, timeout=120, check=True
        )
        
        # Collect all generated files
        segments = []
        for f in os.listdir(temp_dir):
            if f.startswith(f"sess_{short_sid}_chunk_{chunk_index}_seg_") and f.endswith(".wav"):
                segments.append(os.path.join(temp_dir, f))
        
        return sorted(segments)

    except Exception as e:
        print(f"Split error: {e}")
        return [input_path] # Fallback to original (will likely fail at API)

# ── Convert audio bytes to temporary WAV file ──────────────────
def _convert_to_wav_file(audio_bytes: bytes, chunk_index: int, session_id: str) -> str:
    tmp_in = tmp_out = None
    try:
        # Expo AV records in .m4a format on mobile
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as f:
            f.write(audio_bytes)
            tmp_in = f.name

        short_sid = session_id[:8]
        tmp_out = os.path.join(tempfile.gettempdir(), f"sess_{short_sid}_chunk_{chunk_index}.wav")

        result = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in, "-ar", "16000", "-ac", "1", "-f", "wav", tmp_out],
            capture_output=True, timeout=60,
        )

        if result.returncode != 0:
            print(f"ffmpeg conversion error: {result.stderr.decode()}")
            return None

        return tmp_out
    except Exception:
        return None
    finally:
        if tmp_in and os.path.exists(tmp_in):
            os.remove(tmp_in)

def _failed_result() -> dict:
    return {"transcript": "", "words": [], "status": "failed"}