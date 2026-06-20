FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends wget libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz" \
    -O /tmp/piper.tar.gz \
    && tar -xzf /tmp/piper.tar.gz -C /opt/ \
    && rm /tmp/piper.tar.gz

ENV PATH="/opt/piper:$PATH"

RUN pip install --no-cache-dir flask

COPY server.py /app/server.py
VOLUME ["/models"]
EXPOSE 8881
CMD ["python3", "/app/server.py"]
