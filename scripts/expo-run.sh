#!/bin/bash
VARIANT="${APP_VARIANT:-production}"
PLATFORM="$1"
shift

CURRENT_VARIANT=$(cat "$PLATFORM/.app-variant" 2>/dev/null)
if [ "$CURRENT_VARIANT" != "$VARIANT" ]; then
  echo "Variant changed ($CURRENT_VARIANT -> $VARIANT), running prebuild..."
  npx expo prebuild --clean -p "$PLATFORM"
  echo "$VARIANT" > "$PLATFORM/.app-variant"
fi

npx expo run:"$PLATFORM" "$@"
