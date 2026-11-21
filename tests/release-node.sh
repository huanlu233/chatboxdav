# Reproduce an intervening action shadowing the release Node for the next step.
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf '#!/bin/sh\necho v24.0.0\n' > "$tmp/node"
chmod +x "$tmp/node"
export PATH="$tmp:$PATH"
[[ $(node --version) == v24.0.0 ]]
cat > "$tmp/step" <<'STEP'
expected="v$(tr -d '\r\n' < .nvmrc)"
[[ $(node --version) == "$expected" ]]
[[ $(node -p "require('node:child_process').execFileSync('node', ['--version'], {encoding:'utf8'}).trim()") == "$expected" ]]
[[ $(pnpm exec node --version) == "$expected" ]]
STEP
bash scripts/release-shell.sh "$tmp/step"
if RELEASE_NODE_BIN="$tmp" bash scripts/release-shell.sh /dev/null; then
  echo 'A wrong captured Node must stop the step.' >&2
  exit 1
fi
echo 'Node PATH drift regression passed.'
