FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget libgomp1 && \
    rm -rf /var/lib/apt/lists/*

# Download Piper pre-built binary (includes espeak-ng-data for phonemization)
RUN wget -q "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" \
    -O /tmp/piper.tar.gz && \
    tar -xzf /tmp/piper.tar.gz -C /opt/ && \
    rm /tmp/piper.tar.gz

ENV PATH="/opt/piper:$PATH"

RUN pip install --no-cache-dir flask

COPY server.py /app/server.py
VOLUME ["/models"]
EXPOSE 8881
HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
    CMD wget -qO- http://localhost:8881/health || exit 1
CMD ["python3", "/app/server.py"]
