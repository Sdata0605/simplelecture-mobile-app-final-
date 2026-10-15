#!/bin/bash
# Start Expo with Cloudflare tunnel
# Note: --protocol http2 is intentionally omitted — HTTP/2 blocks the WebSocket
# upgrade that Metro needs for fast refresh. Default protocol handles WS correctly.
set -e

CLOUDFLARED=/tmp/cloudflared
PORT=8081

# Download cloudflared if not present
if [ ! -f "$CLOUDFLARED" ]; then
  echo "Downloading cloudflared..."
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o "$CLOUDFLARED"
  chmod +x "$CLOUDFLARED"
fi

echo "Starting Cloudflare tunnel on port $PORT..."

# Start cloudflared in background, capture tunnel URL
# Use h2mux protocol which supports WebSocket upgrades (unlike http2)
TUNNEL_LOG=/tmp/cf-tunnel.log
$CLOUDFLARED tunnel --url http://localhost:$PORT --no-autoupdate --protocol h2mux 2>"$TUNNEL_LOG" &
CF_PID=$!

# Wait for tunnel URL to appear
echo "Waiting for tunnel URL..."
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "Failed to get tunnel URL. Check $TUNNEL_LOG"
  cat "$TUNNEL_LOG"
  kill $CF_PID 2>/dev/null
  exit 1
fi

echo ""
echo "=============================="
echo "Cloudflare tunnel: $TUNNEL_URL"
echo "=============================="
echo ""

# EXPO_PACKAGER_PROXY_URL tells Expo to use the full URL for the QR code
# without appending :8081 — Cloudflare handles port 443→8081 internally
export EXPO_PACKAGER_PROXY_URL="$TUNNEL_URL"
export EXPO_TOKEN="$EXPO_TOKEN"

# Offline mode: local Expo Go dev needs no Expo account. Without this, expo start
# blocks on an interactive "An Expo user account is required to proceed" login
# prompt (it tries to resolve the EAS project id in app.json). The Cloudflare
# tunnel + EXPO_PACKAGER_PROXY_URL still drive the QR connection.
export EXPO_OFFLINE=1

cd /home/runner/workspace/mobile

# Install deps if node_modules is missing (first run after clone)
if [ ! -d node_modules ]; then
  echo "Installing mobile dependencies..."
  npm install --prefer-offline
fi

# Use the local expo binary to avoid npx's interactive "Ok to proceed?" prompt
./node_modules/.bin/expo start --lan --port $PORT --clear

# Cleanup
kill $CF_PID 2>/dev/null
