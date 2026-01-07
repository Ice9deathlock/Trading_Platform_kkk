#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Set default values if not set in .env
HOST_IP=${HOST_IP:-$(hostname -I | awk '{print $1}')}
REACT_APP_WS_URL=${REACT_APP_WS_URL:-$HOST_IP}

echo "🚀 Starting deployment..."
echo "📡 Host IP: $HOST_IP"
echo "🔌 WebSocket URL: $REACT_APP_WS_URL"

# Build the frontend
echo "🔨 Building frontend..."
cd frontend
REACT_APP_API_URL=/api REACT_APP_WS_URL=$REACT_APP_WS_URL npm run build
cd ..

# Build and start the services
echo "🐳 Starting Docker containers..."
docker-compose down
docker-compose up --build -d

echo "✅ Deployment complete!"
echo "🌐 Access the application at: http://$HOST_IP"
echo "📊 API is available at: http://$HOST_IP/api"

echo "\n📝 To view logs, run: docker-compose logs -f"
echo "🛑 To stop the services, run: docker-compose down"
