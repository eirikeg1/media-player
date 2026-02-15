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

# Auto-detect LAN IP for dev server (workaround for broken lanNetworkSync)
if [ -z "$REACT_NATIVE_PACKAGER_HOSTNAME" ]; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -n "$LAN_IP" ]; then
    export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
  fi
fi

npx expo run:"$PLATFORM" "$@"
