# Android engineering runbook / failure ledger

Recorded 2026-11-25. These are actual prior incidents, not a checklist of hypothetical bugs. Append confirmed new incidents with cause, fix, preventive check and evidence.

| Incident | Root cause | Prevention |
| --- | --- | --- |
| Mobile smoke failure, run 45484239544 | Contradictory hero visibility assertions after replacing mobile SVG with actual photo | Review all related assertions after UI changes; test one visible hero, image decoding and dimensions. Do not remove meaningful checks. |
| Wikipedia coverage regression | Cache key included importer script hash; changed importer started without previous articles | Separate source snapshot/schema identity from implementation version; recover valid existing rows and compare coverage. |
| Wikivoyage run 45555573296 | Full-dump SHA1 manifest used dated filename, not latest alias | Parse exactly one dated/latest full-dump entry; verify SHA1 and source license. Retain checks. Corrected run 45555726895 extracted 250 records, 45/45 tests passed. |
| Runs 45555254985 and 45555726895 | Competing writes to android-v2 rejected normal push; rerun alone did not solve race | Extraction can be parallel. Integrate validated artifacts in one writing job. Shared integration concurrency and bounded non-force push/rebase retry, rerun tests after rebase; don't use blind reruns. |
| Recovery run 45557724863 | Code moved from root stdin module to scripts file retained root-relative imports | Resolve imports relative to module location, verify every imported path against tree and run syntax/import checks before publication. Fixed 3b2fb90. |
| Excessive pending/cancelled Android builds | Multiple commits/reusable verification jobs compete for the same concurrency group | Prefer one integrated revision and one full APK verification; do not push intermediate code while final integration runs. Keep source branch and final artifact revision explicit. |
| Incomplete descriptions despite green CI | Tests establish software correctness, not availability of place-specific facts | Report independently grounded place facts, brand facts, dated archival summaries and basic catalog summaries separately. Never count generic or location text as verified history. |
| Unproductive scheduled runs | Previous connector used PR-only workflow listing, returned no relevant runs | Use GitHub REST fetch for branches/android-v2, actions/runs?branch=android-v2, actions/runs/{id}/jobs, then fetch_workflow_job_logs and fetch_workflow_run_artifacts. |

## Latest verified data integration
- HEAD at recording: 94bb37b658da8d499049070e0e5316b4a75fa943.
- Recovery run 45557762959 integration job 139013855810 succeeded and pushed 94bb37b. 46/46 tests passed, build succeeded. Consolidated records: Wikivoyage 250, historical archive 66, photos 500, OSM matches 3604. These counts are source records, not disjoint card coverage.
- Android verification for this revision is still running (job 139014257954); do not claim APK success before actual result.
- Prior fully green APK: run 45551541614, revision 899e6e2271c02bac72e65601c2a5d8cccec274b7; artifact 14995885142 (outdated).

## Iteration gate
1. Read HEAD and this ledger, fetch current workflow jobs and failed logs. Determine whether the same failure has already been solved on newer revision.
2. Reuse successful artifacts and source checksums. Do not redo completed scans unless input or matching policy changes. Validate schema, source, identity, coordinates and attribution before merging.
3. Inspect the whole change, including import paths, script invocation directory, shell quoting, YAML paths, manifest filenames, input data shape, and regression expectations. Run node --check, Python compile and focused tests before full build where runtime permits.
4. Consolidate, run all tests and build, check no loss of records. Use one normal push with expected SHA, never force. Revalidate after rebasing if HEAD changed; do not override conflicting catalog snapshots.
5. Verify APK for actual final data revision: catalog quality report, browser/mobile tests, Gradle assembleDebug and lintDebug, dependency audit, APK contents/signature/permissions, all raster decode, emulator offline and consent restart. Preserve prior passing behaviors.
6. If a check fails: retain artifacts, inspect exact error and update ledger; correct cause then retest. No false success declarations. Report only substantive progress and verified remaining blockers.

## Current user requirement
Descriptions are the release priority; image coverage is optional. Focus on meaningful, sourced Russian text and actual individual details. No fabricated facts or artificially inflated coverage. Use independently verifiable sources, not invented copy or scraped restricted data. The user wants a completed product rather than a report after every small change.

## Latest scope clarification (supersedes earlier all-place description target)
The user permits ordinary obscure places without descriptions or pictures. Retain name, location, category, map details and route actions; hide unsourced filler and empty image covers. Prioritize recognized chains (one sourced description per chain), major landmarks and cultural destinations. Preserve already verified source-backed descriptions and photos. Category-based cultural priority is a conservative starting point, not a claim that every park or monument is famous. Use the generated priority-content-backlog.json to select important unresolved places, not a requirement to research all 55,716. Last full APK verification succeeded for 94bb37b (run 45557762959, artifact 14996984722); 46/46 tests, Gradle and emulator passed.

## Parallel execution policy
Mandatory: run independent catalog enrichment jobs simultaneously after shared validated inputs, with separate artifacts and caches. The APK verification consumes the combined artifact set. Description searches sharing Wikipedia remain in a single rate-limited job; photo and logo jobs have their own bounded budgets and respect provider errors. Never re-download unchanged sources unnecessarily or defer independent work. Existing verified photos are retained; the offline byte cap remains 24 MB. All 55,716 catalog places must remain, but obscure places need only map access.

## Final content pass
Previous fully green build: 2eb44c0c735b8e4301aea6ca57d64bd64acd3aa4, run 45563033109 artifact 14999814775. 48/48 tests, emulator success, 6687 useful descriptions, 650 photos, 13 logos. Actual backlog was inspected from artifact 14999492848: leading gaps are chains with regional/marketing name variants. New source-backed texts for 13 brands, 3 existing brand alias expansions, 7 matched major sites; direct licensed photographs from existing verified Wikivoyage listing filenames (121 references), capped by remaining combined 24 MB photo budget. No broad new corpus extraction required. Retain the last successful APK; do not claim final coverage or compilation before new CI completes.
