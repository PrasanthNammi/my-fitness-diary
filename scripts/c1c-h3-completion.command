#!/bin/zsh
umask 077
ulimit -c 0 || exit 1
cd "$(dirname "$0")/.." || exit 1
task_node=/Users/prasanthnammi/.npm/_npx/6437e47ea30ab26b/node_modules/node/bin/node
"$task_node" scripts/c1c-h3-completion.cjs --execute-approved
