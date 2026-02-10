#!/usr/bin/env bash
# Diagnose series metadata matching issues.
# Compares stripped M3U channel names against Xtream API series names.
#
# Usage: ./scripts/diagnose-series-metadata.sh <m3u-url>
# Example: ./scripts/diagnose-series-metadata.sh "http://host:port/get.php?username=X&password=Y&type=m3u_plus&output=ts"

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <m3u-url>"
  echo '  e.g. $0 "http://host:port/get.php?username=X&password=Y&type=m3u_plus&output=ts"'
  exit 1
fi

M3U_URL="$1"

# Extract Xtream credentials from M3U URL
PROTO=$(echo "$M3U_URL" | grep -oP '^https?')
HOST_PORT=$(echo "$M3U_URL" | sed -E 's|^https?://||; s|/.*||')
USERNAME=$(echo "$M3U_URL" | grep -oP 'username=\K[^&]+')
PASSWORD=$(echo "$M3U_URL" | grep -oP 'password=\K[^&]+')
SERVER="${PROTO}://${HOST_PORT}"
API_URL="${SERVER}/player_api.php?username=${USERNAME}&password=${PASSWORD}"

echo "============================================"
echo "  Series Metadata Diagnosis"
echo "============================================"
echo "Server:   $SERVER"
echo "Username: $USERNAME"
echo ""

# Temp files
API_FILE=$(mktemp)
M3U_FILE=$(mktemp)
trap "rm -f $API_FILE $M3U_FILE" EXIT

echo "Fetching Xtream API series list..."
curl -s "${API_URL}&action=get_series" > "$API_FILE"
API_COUNT=$(python3 -c "import json; print(len(json.load(open('$API_FILE'))))")
echo "  -> $API_COUNT series from API"
echo ""

echo "Fetching M3U playlist (series channels only)..."
curl -s "$M3U_URL" | grep -E 'tvg-name=.*S[0-9]+E[0-9]+' > "$M3U_FILE" || true
M3U_LINES=$(wc -l < "$M3U_FILE")
echo "  -> $M3U_LINES series episode lines in M3U"
echo ""

echo "============================================"
echo "  Comparing stripped M3U names vs API names"
echo "============================================"
echo ""

python3 - "$API_FILE" "$M3U_FILE" << 'PYTHON_SCRIPT'
import json, sys, re

api_file = sys.argv[1]
m3u_file = sys.argv[2]

# Load API series names
with open(api_file) as f:
    api_data = json.load(f)

api_names = {}
for s in api_data:
    name = s.get('name')
    if name:
        api_names[name] = s

api_names_lower = {n.lower(): n for n in api_names}

# Simulate strip_episode_info (matches the Rust SQLite function)
def strip_episode_info(name):
    patterns = [
        r'(?i)S(\d+)\s*E(\d+)',
        r'(?i)(\d+)x(\d+)',
        r'(?i)Season\s*(\d+).*?Episode\s*(\d+)',
        r'\s+-\s+-\s+.*',
    ]
    result = name
    for p in patterns:
        result = re.sub(p, '', result)
    result = result.strip()
    result = result.rstrip('-:|').rstrip()
    return result if result else 'Untitled'

# Extract unique stripped series names from M3U
m3u_series = set()
with open(m3u_file) as f:
    for line in f:
        m = re.search(r'tvg-name="([^"]+)"', line)
        if m:
            stripped = strip_episode_info(m.group(1))
            m3u_series.add(stripped)

print("Unique series from M3U (stripped): %d" % len(m3u_series))
print("Unique series from API: %d" % len(api_names))
print()

# Categorize matches
exact = []
case_match = []
no_match = []

for m3u_name in sorted(m3u_series):
    if m3u_name in api_names:
        exact.append(m3u_name)
    elif m3u_name.lower() in api_names_lower:
        api_name = api_names_lower[m3u_name.lower()]
        case_match.append((m3u_name, api_name))
    else:
        no_match.append(m3u_name)

print("--- EXACT MATCHES: %d ---" % len(exact))
for name in exact[:10]:
    series = api_names[name]
    has_plot = bool(series.get('plot'))
    has_genre = bool(series.get('genre'))
    has_rating = bool(series.get('rating'))
    print("  OK  %r  (plot=%s genre=%s rating=%s)" % (name, has_plot, has_genre, has_rating))
if len(exact) > 10:
    print("  ... and %d more" % (len(exact) - 10))
print()

print("--- CASE-INSENSITIVE MATCHES (fixed by COLLATE NOCASE): %d ---" % len(case_match))
for m3u_name, api_name in case_match[:10]:
    print("  M3U: %r  ->  API: %r" % (m3u_name, api_name))
if len(case_match) > 10:
    print("  ... and %d more" % (len(case_match) - 10))
print()

print("--- NO MATCH (metadata will NOT display): %d ---" % len(no_match))
for m3u_name in no_match[:20]:
    # Try to find close matches
    close = []
    for api_name in api_names:
        # Check if one contains the other (after stripping punctuation)
        m3u_clean = re.sub(r'[^a-zA-Z0-9 ]', '', m3u_name).lower()
        api_clean = re.sub(r'[^a-zA-Z0-9 ]', '', api_name).lower()
        if m3u_clean and api_clean and (m3u_clean in api_clean or api_clean in m3u_clean):
            close.append(api_name)
    if close:
        print("  MISS  M3U: %r" % m3u_name)
        for c in close[:3]:
            print("        API: %r  <-- likely intended match" % c)
    else:
        print("  MISS  M3U: %r  (no close API match)" % m3u_name)
if len(no_match) > 20:
    print("  ... and %d more" % (len(no_match) - 20))

print()
print("============================================")
print("  Summary")
print("============================================")
print("Total M3U series:          %d" % len(m3u_series))
print("Exact match:               %d (%.1f%%)" % (len(exact), 100*len(exact)/max(len(m3u_series),1)))
print("Case-insensitive match:    %d (fixed by COLLATE NOCASE)" % len(case_match))
print("No match:                  %d (metadata lost)" % len(no_match))
total_matched = len(exact) + len(case_match)
print("Total matchable:           %d (%.1f%%)" % (total_matched, 100*total_matched/max(len(m3u_series),1)))

# Check if API series have no M3U counterpart
api_only = set(api_names.keys()) - set(exact) - set(a for _, a in case_match)
print()
print("API series with no M3U episodes: %d" % len(api_only))
PYTHON_SCRIPT
