#!/bin/zsh
# Prepared only. Requires a fresh approved Safari baseline; no secret input/output.
umask 077
ulimit -c 0 || exit 1
cd "$(dirname "$0")/.." || exit 1
task_node=/Users/prasanthnammi/.npm/_npx/6437e47ea30ab26b/node_modules/node/bin/node
if [[ ! -x "$task_node" ]]; then
 print 'STOP: reviewed Node runtime unavailable.'
 exit 1
fi
"$task_node" scripts/c1c-google-h1-h3-safari.cjs --execute-approved-safari
task_result=$?
print "Safari acceptance exit status: $task_result. No automatic retry."
exit "$task_result"
