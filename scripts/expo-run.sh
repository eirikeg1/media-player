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

# Network mode for the Metro dev server.
if [ "$CABLE" = "1" ]; then
  # Cable mode: tunnel Metro over USB and point the app at localhost instead of the LAN IP.
  export REACT_NATIVE_PACKAGER_HOSTNAME="localhost"
  [ "$PLATFORM" = "android" ] && adb reverse tcp:8081 tcp:8081
elif [ -z "$REACT_NATIVE_PACKAGER_HOSTNAME" ]; then
  # Auto-detect LAN IP for dev server (workaround for broken lanNetworkSync)
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -n "$LAN_IP" ]; then
    export REACT_NATIVE_PACKAGER_HOSTNAME="$LAN_IP"
  fi
fi

npx expo run:"$PLATFORM" "$@"
