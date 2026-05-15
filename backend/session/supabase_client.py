import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Reads from HF Secrets (env vars) in production, falls back to .env locally
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xhcnwwfjdxfkgjsoqwin.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoY253d2ZqZHhma2dqc29xd2luIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzM4NTcyOCwiZXhwIjoyMDkyOTYxNzI4fQ.aMmNYbILOEzknUIt4PIbTHdIPUZqD7KhBHY5ojPs6sU")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
