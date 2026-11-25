# SHODI engineering instructions

## Scope and release criteria
- Work on android-v2 only for the Android project. Do not change main, signing secrets, production ad IDs or RuStore publishing without explicit instruction.
- Current user priority: substantive Russian descriptions for all 55,716 catalog places. Missing photos/logos do NOT block release. Preserve legal images already verified. Never invent history, opening hours, amenities or reviews; distinguish place-specific facts, brand history, historical observations and basic catalog/location summaries.
- A passing build does not prove complete content. Check coverage separately. Do not describe intermediate APKs as final.
- Read docs/android-engineering-runbook.md before each engineering iteration. Update that file when an actual new failure or lesson is found. Read current files and actual logs, not stale summaries.
- Batch independent research and extraction; single coordinated integration of finished results; one final full verification. Avoid starting redundant builds or interrupting useful running jobs.
- Before changing code, inspect exact HEAD, relevant files, current jobs, and existing artifacts. Before push, check syntax, relative imports, data schema, workflow YAML and shell; run targeted and full regression tests where executable. If local execution is unavailable, use an isolated CI preflight and explicitly state that limitation. Never claim unexecuted checks passed.
- Preserve prior verified data, coverage, licenses and tests. All changes must have a reason tied to user requirements; fix root causes, not just rerun the same failing job.
- Publish normal non-force updates with expected HEAD. Check the exact final revision's tests, Gradle build/lint, APK integrity/signature, mobile UI, offline restart and emulator. Give the user the actual artifact only when verified.
