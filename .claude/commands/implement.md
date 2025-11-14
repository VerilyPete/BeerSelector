# Implement with Code Review

Implement a task item using the mobile-developer and react-native-code-reviewer agents with automated review cycles.

## Usage

```
/implement MP-4
/implement HP-3
/implement "Create user settings screen"
```

## Process

This command coordinates the mobile-developer and react-native-code-reviewer agents to:

1. **Mobile-developer** implements the feature using TDD patterns when applicable
2. **React-native-code-reviewer** reviews the implementation
3. **Mobile-developer** fixes any issues found
4. **Code-reviewer** verifies fixes
5. Repeat steps 3-4 until approved
6. Move to next sub-step or phase

## Instructions

Read the task description from CODE_REVIEW.md (or the task provided as an argument).

Then coordinate the agents following this pattern:

### Step 1: Initial Implementation
- Launch mobile-developer agent with task description
- Specify to follow TDD (write tests first when applicable)
- Mobile-developer works until first reviewable checkpoint

### Step 2: Code Review
- Launch react-native-code-reviewer agent in parallel (don't block mobile-developer)
- Reviewer provides feedback with score and required/optional fixes

### Step 3: Fix Cycle (if needed)
- If reviewer requests changes:
  - Mobile-developer fixes issues
  - Code-reviewer re-reviews
  - Repeat until approved

### Step 4: Continue
- Once approved, move to next sub-step/phase
- Repeat process until entire task is complete

### Efficiency Rules
- **Run agents in parallel** when possible (review while implementing next step)
- **Don't block** - mobile-developer can move to next item while review happens
- **Batch fixes** - developer can fix review issues after completing current work item
- **Multiple agents** - can run 2+ mobile-developers on separate work items simultaneously

### TDD Pattern
When writing new features:
1. Write tests FIRST (before implementation)
2. See tests fail (red phase)
3. Implement code to make tests pass (green phase)
4. Refactor if needed

### Output
- Use TodoWrite to track progress
- Provide summaries after each major milestone
- Document all work in docs/ directory
