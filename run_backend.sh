#!/bin/bash
# Run backend with proper environment

cd "$(dirname "$0")"

# Load environment variables
if [ -f "server/.env" ]; then
    export $(cat server/.env | grep -v '^#' | xargs)
fi

echo "Starting Backend Server..."
echo "BACKEND_URL: ${BACKEND_URL}"
echo "BACKEND_HOST: ${BACKEND_HOST}"
echo "BACKEND_PORT: ${BACKEND_PORT}"

python -m uvicorn server.main:app \
  --host "${BACKEND_HOST:-localhost}" \
  --port "${BACKEND_PORT:-8000}" \
  --reload
