#!/bin/bash

input=$(cat)
subagent_name=$(echo "$input" | jq -r '.subagent_name // empty')

if [ "$subagent_name" = "mobile-developer" ]; then
    cat << 'EOF'

🎯 AUTOMATED WORKFLOW TRIGGER
──────────────────────────────
Mobile development phase complete.

ACTION REQUIRED: Invoke the react-native-code-reviewer subagent now to review the changes that the mobile-developer just completed.

Use: react-native-code-reviewer subagent
EOF
    exit 0
fi

exit 0
