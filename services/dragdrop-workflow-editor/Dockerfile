FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir psycopg2-binary

# Copy application files
COPY server.py .
COPY index.html .
COPY favicon.ico .

# Create health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Expose port
EXPOSE 3004

# Run server
CMD ["python", "server.py"]