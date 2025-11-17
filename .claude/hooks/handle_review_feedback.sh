#!/bin/bash

input=$(cat)
subagent_name=$(echo "$input" | jq -r '.subagent_name // empty')

if [ "$subagent_name" = "react-native-code-reviewer" ]; then
    cat << 'EOF'

🔍 CODE REVIEW WORKFLOW ACTIVATED
══════════════════════════════════════════════════

Step 1: CATEGORIZE FINDINGS
----------------------------
Classify each finding as HIGH or LOW priority.

Step 2: EXECUTE WORKFLOW
----------------------------------
IF high-priority issues exist:

   1. State: "Found [N] high-priority issues requiring immediate fixes."
   
   2. Invoke mobile-developer subagent to fix high-priority issues
   
   3. Present low-priority findings to user
   
   4. **STOP HERE** - Wait for user to review and approve low-priority items
   
   (After mobile-developer completes and automatic re-review happens):
   5. Present re-review results
   6. **STOP AGAIN** - Wait for user to confirm which low-priority items to implement
   7. Implement approved items

ELSE (only low-priority issues):

   1. Present all findings to user
   2. **STOP** - Wait for user to select items to address
   3. After user responds, implement approved changes

══════════════════════════════════════════════════
EOF
    exit 0
fi

exit 0
