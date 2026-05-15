# Hugging Face Spaces — Docker SDK
# Port 7860 is REQUIRED by HF Spaces

FROM python:3.11-slim

# Install system dependencies (ffmpeg needed for audio processing)
RUN apt-get update && \
    apt-get install -y ffmpeg git && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies first (for Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend code
COPY . .

# Create outputs directory (for PDF generation)
RUN mkdir -p outputs

# HF Spaces requires port 7860
EXPOSE 7860

# Run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
