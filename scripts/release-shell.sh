# GitHub Actions passes the temporary script for each run step as $1.
# Restore the selected Node before starting that step, including its children.
set -euo pipefail
expected=$(tr -d '\r\n' < .nvmrc)
: "${RELEASE_NODE_BIN:?Missing the Node directory captured after setup-node}"
export PATH="$RELEASE_NODE_BIN:$PATH"
actual=$("$RELEASE_NODE_BIN/node" --version)
if [[ $actual != "v$expected" ]]; then
  echo "Release requires Node v$expected; $RELEASE_NODE_BIN/node is $actual" >&2
  exit 1
fi
exec bash --noprofile --norc -eo pipefail "$1"
