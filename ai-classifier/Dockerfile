# PerAI View - activity classifier (FastAPI + scikit-learn)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Unprivileged runtime user; application files stay owned by root (read-only for the app).
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin classifier

COPY app/ ./app/

USER classifier

EXPOSE 8000

# The model trains at startup (~1-2 s), hence the start period.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
