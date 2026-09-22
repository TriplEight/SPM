#!/usr/bin/env bash
# PostToolUse hook on Edit|Write: format and lint the edited file with Biome.
# Exit 2 sends the Biome errors back to the agent.
set -euo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[[ -n "$file" && -f "$file" ]] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.mts | *.cts | *.json | *.jsonc | *.css) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR"
export PATH="$HOME/.local/share/pnpm/bin:$PATH"
if ! out=$(pnpm exec biome check --write --no-errors-on-unmatched "$file" 2>&1); then
  printf 'biome check failed for %s:\n%s\n' "$file" "$out" >&2
  exit 2
fi
