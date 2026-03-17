#!/bin/bash
set -e

PLIST_NAME="com.locohost.agent"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "Uninstalling Locohost..."

# Unload the agent
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
echo "  Stopped Locohost agent"

# Remove plist
if [ -f "$PLIST_DST" ]; then
  rm "$PLIST_DST"
  echo "  Removed $PLIST_DST"
fi

echo ""
echo "Done! Locohost will no longer start automatically."
echo "Health logs are preserved at ~/mac-health-watch/logs/"
