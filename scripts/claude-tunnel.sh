#!/usr/bin/env bash
# claude-tunnel.sh
#
# Starts (or restarts) the Expo/Metro dev server for the "mobile" app with a
# public tunnel, running fully in the background and non-interactively, then
# prints the exp:// connection URL to stdout as a single grep-able line:
#
#   TUNNEL_URL:exp://xxxxx.exp.direct
#
# Written for Claude's device_bash tool: one call runs this whole script,
# the server keeps running in the background after the call returns (via
# nohup + disown), and Claude reads the printed URL to generate a QR code
# to show in chat -- no terminal window needed on this machine.
#
# Safe to re-run any time: it kills any server it previously started before
# starting a fresh one.

set -uo pipefail

cd "$(dirname "$0")/.."   # -> mobile/

LOG="/tmp/claude-expo-tunnel.log"
PIDFILE="/tmp/claude-expo-tunnel.pid"
URLFILE="/tmp/claude-expo-tunnel-url.txt"

echo "== Checking for node/npm =="
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found in this shell's PATH."
  exit 1
fi
node -v
npm -v

echo "== Cleaning up any previous run =="
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
fi
pkill -f "expo start" 2>/dev/null || true
sleep 1
: > "$LOG"
rm -f "$URLFILE"

if [ ! -d node_modules/expo ]; then
  echo "== Installing dependencies (first run) =="
  npm install --prefer-offline --legacy-peer-deps
fi

echo "== Starting Expo tunnel in the background =="
# CI=1 and EXPO_OFFLINE=1 stop Expo CLI from blocking on an interactive
# "login to Expo required" prompt when it resolves the EAS project id in
# app.json -- essential since nothing can answer a prompt in a background,
# non-interactive process.
export CI=1
export EXPO_OFFLINE=1
export EXPO_NO_TELEMETRY=1
nohup npx expo start --tunnel --clear > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
disown

echo "== Waiting for the tunnel URL (up to ~100s) =="
URL=""
for i in $(seq 1 50); do
  URL=$(grep -oE 'exp://[A-Za-z0-9.-]+\.exp\.direct(:[0-9]+)?' "$LOG" | tail -1)
  if [ -n "$URL" ]; then
    echo "$URL" > "$URLFILE"
    echo "TUNNEL_URL:$URL"
    break
  fi
  sleep 2
done

if [ -z "$URL" ]; then
  echo "== No tunnel URL yet. Last 50 log lines: =="
  tail -n 50 "$LOG"
  exit 1
fi

echo "== Server is running in the background (PID $(cat "$PIDFILE")) =="
echo "== Full log: $LOG =="
