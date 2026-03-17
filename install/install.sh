#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.locohost.agent"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
LOG_DIR="$HOME/mac-health-watch/logs"

echo "Installing Locohost..."

# Create log directory
mkdir -p "$LOG_DIR"
echo "  Created $LOG_DIR"

# Install npm dependencies if needed
if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "  Installing dependencies..."
  cd "$PROJECT_DIR" && npm install
fi

# Generate plist with correct paths
NODE_PATH=$(which node)
sed "s|__NODE_PATH__|$NODE_PATH|g; s|__PROJECT_DIR__|$PROJECT_DIR|g; s|__HOME__|$HOME|g" "$PLIST_SRC" > "$PLIST_DST"
echo "  Installed launchd agent to $PLIST_DST"

# Load the agent
launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
echo "  Started Locohost agent"

echo ""
echo "Done! Locohost will now start automatically on login."
echo "  Dashboard: http://localhost:${PORT:-3847}"
echo "  Logs: $LOG_DIR"
echo ""
echo "To uninstall: npm run uninstall-agent"
