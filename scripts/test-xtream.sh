#!/usr/bin/env bash
# Test Xtream Codes server to discover which URL formats are supported.
# Usage: ./scripts/test-xtream.sh http://host:port/username/password/stream_id

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <xtream-url>"
  echo "  e.g. $0 http://195.128.27.253:2095/zFRu5MXf/cMWPwAR/331444"
  exit 1
fi

RAW_URL="$1"

# Parse the Xtream URL
PROTO=$(echo "$RAW_URL" | grep -oP '^https?')
HOST_PORT=$(echo "$RAW_URL" | sed -E 's|^https?://||; s|/.*||')
PATH_PART=$(echo "$RAW_URL" | sed -E 's|^https?://[^/]+||')
IFS='/' read -ra SEGMENTS <<< "${PATH_PART#/}"

if [[ ${#SEGMENTS[@]} -ne 3 ]]; then
  echo "ERROR: Expected URL format http://host:port/username/password/stream_id"
  echo "       Got ${#SEGMENTS[@]} path segments: ${SEGMENTS[*]}"
  exit 1
fi

USERNAME="${SEGMENTS[0]}"
PASSWORD="${SEGMENTS[1]}"
STREAM_ID="${SEGMENTS[2]}"
SERVER="${PROTO}://${HOST_PORT}"

echo "============================================"
echo "  Xtream URL Probe"
echo "============================================"
echo "Server:    $SERVER"
echo "Username:  $USERNAME"
echo "Password:  $PASSWORD"
echo "Stream ID: $STREAM_ID"
echo ""

# ── 1. Query the Xtream API ──────────────────────────────────────────
echo "── Xtream API (player_api.php) ──"
API_URL="${SERVER}/player_api.php?username=${USERNAME}&password=${PASSWORD}"
echo "URL: $API_URL"
echo ""

API_RESPONSE=$(curl -s --max-time 10 "$API_URL" 2>&1) || true

if [[ -n "$API_RESPONSE" ]]; then
  echo "user_info.allowed_output_extensions:"
  echo "$API_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ui = data.get('user_info', {})
    print('  ', json.dumps(ui.get('allowed_output_extensions', 'NOT PRESENT'), indent=2))
    print()
    print('Full user_info:')
    print(json.dumps(ui, indent=2))
except Exception as e:
    print('  Parse error:', e)
" 2>&1 || echo "  (could not parse JSON)"
else
  echo "  No response from API"
fi

echo ""

# ── 2. Probe URL patterns ────────────────────────────────────────────
echo "── Probing URL patterns ──"
echo "(Using curl HEAD with 5s timeout, following redirects)"
echo ""

# All known Xtream URL patterns
declare -A URLS
URLS["Raw (no ext)"]="${SERVER}/${USERNAME}/${PASSWORD}/${STREAM_ID}"
URLS["Raw .ts"]="${SERVER}/${USERNAME}/${PASSWORD}/${STREAM_ID}.ts"
URLS["Raw .m3u8"]="${SERVER}/${USERNAME}/${PASSWORD}/${STREAM_ID}.m3u8"
URLS["Raw .mp4"]="${SERVER}/${USERNAME}/${PASSWORD}/${STREAM_ID}.mp4"
URLS["/live/ (no ext)"]="${SERVER}/live/${USERNAME}/${PASSWORD}/${STREAM_ID}"
URLS["/live/ .ts"]="${SERVER}/live/${USERNAME}/${PASSWORD}/${STREAM_ID}.ts"
URLS["/live/ .m3u8"]="${SERVER}/live/${USERNAME}/${PASSWORD}/${STREAM_ID}.m3u8"
URLS["/live/ .mp4"]="${SERVER}/live/${USERNAME}/${PASSWORD}/${STREAM_ID}.mp4"

# Ordered keys for consistent output
ORDERED_KEYS=(
  "Raw (no ext)"
  "Raw .ts"
  "Raw .m3u8"
  "Raw .mp4"
  "/live/ (no ext)"
  "/live/ .ts"
  "/live/ .m3u8"
  "/live/ .mp4"
)

for key in "${ORDERED_KEYS[@]}"; do
  url="${URLS[$key]}"
  printf "%-20s %s\n" "$key" "$url"

  # HEAD request with redirect following
  RESULT=$(curl -s -o /dev/null -w "HTTP %{http_code} | Content-Type: %{content_type} | Size: %{size_download} | Redirect: %{redirect_url}" \
    --head --max-time 5 -L "$url" 2>&1) || RESULT="FAILED (curl error)"
  echo "  → $RESULT"

  # If HEAD fails or returns weird results, also try a short GET (first 512 bytes)
  if echo "$RESULT" | grep -qE "FAILED|HTTP 000|HTTP 4[0-9]{2}|HTTP 5[0-9]{2}"; then
    echo "  → (HEAD failed, skipping GET)"
  else
    # GET first 512 bytes to check actual content
    BODY_SAMPLE=$(curl -s --max-time 5 -r 0-511 "$url" 2>&1 | head -c 512)
    if echo "$BODY_SAMPLE" | grep -q "#EXTM3U\|#EXT-X-"; then
      echo "  → ✓ Body looks like HLS playlist!"
    elif echo "$BODY_SAMPLE" | file - | grep -qi "mpeg\|transport"; then
      echo "  → Body looks like MPEG-TS data"
    elif [[ ${#BODY_SAMPLE} -gt 0 ]]; then
      # Show first 200 chars of body for inspection
      PREVIEW=$(echo "$BODY_SAMPLE" | head -c 200 | tr '\n' ' ' | tr -cd '[:print:]')
      if [[ ${#PREVIEW} -gt 0 ]]; then
        echo "  → Body preview: ${PREVIEW:0:200}"
      else
        echo "  → Body: (binary data, ${#BODY_SAMPLE} bytes)"
      fi
    fi
  fi
  echo ""
done

# ── 3. Try the xmltv.php API for stream info ─────────────────────────
echo "── Stream info via get_live_streams API ──"
STREAMS_URL="${SERVER}/player_api.php?username=${USERNAME}&password=${PASSWORD}&action=get_live_streams&stream_id=${STREAM_ID}"
echo "URL: $STREAMS_URL"
STREAM_INFO=$(curl -s --max-time 10 "$STREAMS_URL" 2>&1) || true
if [[ -n "$STREAM_INFO" ]]; then
  echo "$STREAM_INFO" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list) and len(data) > 0:
        item = data[0]
        print(json.dumps(item, indent=2))
    else:
        print('No stream data found for this ID')
except Exception as e:
    print('Parse error:', e)
" 2>&1 || echo "(could not parse)"
else
  echo "  No response"
fi

echo ""
echo "============================================"
echo "  Done"
echo "============================================"
