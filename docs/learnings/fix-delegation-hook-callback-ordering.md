# Learnings: Fix Delegation Hook onSuccess/invalidateQueries Ordering

## Patterns

### [code-quality] Consolidate duplicate logic into base class methods
When multiple subclass methods duplicate the same sequence (e.g., storage delete + event emit), refactor into a single base class method. This ensures all callers get consistent behavior including side effects like cache clearing that are easy to miss in duplicated code.
Example: revokeByKey moved storage delete + event emit into base class path, which also picked up clearCaches() automatically.
Frequency: recurring

### [code-quality] Remove dead code paths proactively
Null checks guarding code that can never be null (due to upstream guarantees) are dead code. Removing them reduces cognitive load and prevents future developers from assuming the null case is possible.
Example: Null-check simplification where the guarded value was always present by construction.
Frequency: recurring

### [testing] Test observable behavior, not implementation details
Tests should verify real user-observable outcomes (e.g., cache state during a callback, lifecycle event side effects) rather than internal method calls. This makes tests resilient to refactoring while still catching regressions.
Example: Tests verified cache state during onSuccess callback and clearCaches invocation through lifecycle events, not internal method call counts.
Frequency: recurring

### [architecture] Keep callback ordering fixes minimal and surgical
When fixing ordering issues between hooks/callbacks (like onSuccess running before invalidateQueries), prefer the smallest possible change that reorders the operations. Minimal diffs reduce review burden and risk of introducing new bugs.
Example: The onSuccess ordering fix was described as "minimal and correct" with no issues found on first review.
Frequency: recurring
