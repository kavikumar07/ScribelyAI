# Scribely AI 🎙️✨

Scribely AI is an intelligent note-taking assistant that transforms your recordings into professional, structured notes.

### 🚀 What it does & How
1. **Record**: Capture audio live during meetings or lectures.
2. **Process**: The app sends audio chunks to the backend, where **Sarvam AI** transcribes it instantly.
3. **Summarize**: A reasoning AI (`sarvam-m`) cleans the text and creates structured notes with key takeaways.
4. **Smart Memory**: The app saves "mini-summaries" so you can ask the AI to expand or edit your notes even weeks later, without needing the original audio.
5. **Export**: Share your notes as professional PDFs or save them securely in the cloud via Supabase.

---

### 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Mobile App** | React Native (Expo) |
| **Backend** | Python (FastAPI) |
| **Database** | Supabase (Auth & Database) |
| **AI (Voice)** | Sarvam AI (STT) |
| **AI (Notes)** | Sarvam AI (Reasoning LLM) |

---

### 🏃 How to Run the Project

#### 1. Database Setup
Ensure your **Supabase** `notes` table has a `summaries` column (`text[]`) and a `status` column.

#### 2. Backend Setup
1. Open the `backend` folder.
2. Install dependencies: `pip install -r requirements.txt`.
3. Add your **Sarvam API Key** and **Supabase Keys** to the `.env` file.
4. Start the server:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8001
   ```

#### 3. Frontend Setup
1. Open the `frontend` folder.
2. Install dependencies: `npm install`.
3. Update your computer's **IP Address** in `src/config/api.ts`.
4. Start the app:
   ```bash
   npm start
   ```
5. Scan the QR code with the **Expo Go** app on your phone.