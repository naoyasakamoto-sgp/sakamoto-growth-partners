FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-jpn libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-v2.txt .
RUN pip install --no-cache-dir -r requirements-v2.txt
COPY main.py .
COPY ticket_pipeline.py .
COPY start_v2.py .
EXPOSE 8000
CMD ["python","start_v2.py"]
