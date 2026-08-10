# Evaluation: hand-written + critics vs schema-driven codegen vs hybrid

Question: now that the PoC exists, should cdkd keep the current mechanism
(hand-written conversion + the static-analysis critic family), switch to
schema-driven generation, or adopt a hybrid — and where exactly should the
boundary run?

**Verdict up front: hybrid, with a precise boundary.** Generate the
CREATE-side input-builder layer from the spec (constructive prevention);
keep orchestration — update semantics, waiters, physicalId, multi-op
sequencing, read paths — hand-written (that is the part codegen cannot
derive AND the part that has never been the recurring bug class). Neither
pure option survives contact with the evidence below.

All numbers in this document are measured, either from the committed
critic matrix (`docs/_generated/nested-key-coverage.{json,md}`), the
critic's own file-header measurements, or this PoC's runs.

## 1. What each mechanism is, in one sentence each

- **Current**: humans write the CFn->SDK conversion; a family of
  AST-analysis critics (`gen-nested-key-coverage` et al.) reverse-engineers
  the hand code after the fact and flags divergences against fixtures +
  SDK typings. DETECTIVE.
- **PoC codegen**: the conversion is derived from the CFn registry schema +
  Smithy models; unmatched/ambiguous paths surface as an explicit review
  report; generated code writes every matched member by construction.
  CONSTRUCTIVE.

## 2. Head-to-head by the bug classes this repo has actually shipped

| Bug class (history) | Current mechanism | Codegen |
|---|---|---|
| Case divergence (`MetricTimeZone`, the 5 CloudFront keys — #1304, #1370/#1372) | Detected by critic — AFTER 4 live recurrences forced the tooling; each fix by hand | **Prevented** (case tier, auto) |
| Rename, no same-spelled member (`IsIPV6Enabled`, `OriginCustomHeaders`, `Redirect`, `placementStrategy`) | Critic flags `no-sdk-member`; human finds the target member by hand | **Candidate auto-proposed** (every historical rename found); human confirms once into an override table |
| Wrapper shapes (`{Quantity, Items}`, `Tagging.TagSet`) | Shape pass detects; hand-maintained conversion (`QUANTITY_ITEM_FIELDS`) | **Generated** (structural + `smithy.api#required` empty defaults) |
| Fresh-object member drop (`BatchReportMode` #1432, `ContainerPortRange` #1472, `AdvancedConfiguration` #1473) | Write-evidence pass: opt-in per target, 8 documented bounds, **260 residual unmeasurable paths** (S3 98, CloudFront 162 — #1475 still open) | **Structurally impossible** — the generator writes every matched member |
| AWS adds a nested member to an existing type | Invisible until fixture refresh, and only on the **11** onboarded targets | Regen produces a reviewable diff, **any type** |
| Value-semantics divergence (`EventBridgeEnabled` bool vs empty struct — #1430) | Critic flags it | Flags it (type-incompatible) — **parity**, human resolves either way |
| Removed-property-on-update semantics (CFn "absent -> reset to default") | Hand-written per type, live-verified (e.g. AnomalyDetector "Put REPLACES stored Configuration", live-verified 2026-07-31) | **Not derivable** — API behavior, not schema |
| Multi-op update orchestration (Lambda `UpdateFunctionConfiguration` + `UpdateFunctionCode` + `waitUntilFunctionUpdatedV2`; S3 per-blob puts) | Hand-written | Derives the op **inventory** (S3: 16/16 sub-ops correct) but not sequencing/conditions; the PoC picked only `UpdateFunctionCode` for Lambda update |
| Synthesized required fields (`CallerReference`, `TrustedSigners.Enabled: false`) | Hand-written with live-verified values | **Flagged** as required-unfed; values stay hand-written |

Reading of the table: the top five rows — the entire recurring,
repo-history-documented silent-drop problem — flip from "detect + hand-fix,
with measured residuals" to "prevented or candidate-proposed". The bottom
four rows do not flip, and two of them cannot flip even in principle.

## 3. Cost curves (the part the bug table doesn't show)

**Current mechanism's marginal costs, measured:**

- One critic (`gen-nested-key-coverage`) is ~4.5k lines + 216 tests and
  took ~10 substantial iterations (#1373 → #1378 → #1430 → #1432 → #1445 →
  #1448 → #1464 → #1472/#1473/#1474 → #1475 open) to reach 11 audited
  targets out of ~80 provider files. Each new target requires measuring
  finding counts and calibrating four kinds of parser floors; each genuine
  rename requires a hand-declared, staleness-fenced `segmentRenames` /
  allow-list entry.
- The two biggest targets structurally cannot finish: S3 (98 unmeasurable
  paths + 20 confirmed drops filed as #1495, still unfixed) and CloudFront
  (162 unmeasurable, spread-and-patch recognizer deliberately not built —
  #1475 calls it the shape most likely to become a rubber stamp).
- Detection is not prevention: every flagged divergence still becomes a
  hand-written fix PR.

**Codegen's marginal costs, measured in the PoC:**

- 27 resource types processed in one session with zero per-type code;
  per-type onboarding is "run the tool, review the report".
- The whole PoC (loader + matcher + operations + emitter + report) is
  ~1.5k lines — a third of the ONE critic it would largely retire, and it
  replaces generation AND the audit for migrated types (the spec's
  unmatched/candidate buckets ARE the audit; no AST reverse-engineering).
- New ongoing costs it introduces: input currency (schema zip snapshot +
  api-models-aws pin must be refreshed deliberately), override-table
  review (fuzzy candidates are sometimes WRONG — observed live:
  `BucketName -> BucketNamespace`, correct answer `Bucket`), and regen-diff
  review discipline.

## 4. Risk comparison

| Risk | Current | Codegen |
|---|---|---|
| Runtime regression on adoption | None (critics never touch runtime) | Real: swapping a battle-tested provider's builder can regress tolerances the hand code had (string coercions, permissive shapes). Mitigated per type by the integ gates, but integ coverage is not exhaustive |
| Silent wrong mapping | The measured residuals (260 paths) + non-target types | A WRONG auto-applied fuzzy candidate would be a new bug source — which is why candidates must land in a human-confirmed override table, never auto-applied |
| Upstream input error | CFn fixture wrong -> critic noise (safe) | Schema/model wrong -> generated member AWS rejects at deploy (loud) or unmatched flag (safe). No silent-drop direction: the serializer-drop failure mode requires a MISSING write, and generation never omits a matched member |
| Behavioral semantics loss | N/A (hand code carries them) | Real if the boundary is drawn wrong — removal semantics, full-vs-partial update payloads, live-verified default values are NOT schema-derivable and must stay in glue |

## 5. Why each pure option loses

**Pure current** keeps paying the detective tax on a cost curve that is
demonstrably super-linear (ten iterations for eleven targets, two of which
cannot complete), while the actual fix for every finding remains manual.
The 20 confirmed S3 drops sitting in #1495 are the steady state of this
model: known, filed, unfixed.

**Pure codegen** is not achievable: update/removal semantics, waiters,
physicalId derivation, import/read paths and data-safety gates are
API-behavioral knowledge the schemas do not carry — and a big-bang swap of
proven providers maximizes the one risk class codegen adds.

## 6. Recommended hybrid, with staging and exit criteria

Boundary rule: **generated code owns "which member, what spelling, what
shape"; hand code owns "which call, when, and what the API means by it".**

- **Phase 0 — no runtime change (immediate):**
  (a) Fix #1495's remaining S3 drops BY HAND now, using the PoC report as
  the mapping oracle (it already names every target member).
  (b) Add a `vp run gen:sdk-mapping` task committing specs under
  `docs/_generated/sdk-mapping/` for ALL SDK-provider types, CI-checked
  for drift — this is a schema-drift radar with full-tree breadth the
  critic never had, and it costs nothing at runtime.
  Pin inputs (schema-zip date + api-models-aws commit) in the spec header
  for reproducibility.
- **Phase 1 — constructive for NEW code (low risk):** `/new-provider`
  scaffolds its input builders from the spec. New types start prevented,
  not detected; no existing behavior at risk.
- **Phase 2 — migrate the two types the critic structurally cannot audit:**
  CloudFront Distribution and S3 Bucket create-path builders switch to
  generated, each behind its feature integ + a broad integ
  (`/run-integ`). Exit criteria for the phase: zero integ/live
  regressions attributable to generated builders; regen diffs stayed
  review-sized; override-table churn acceptable. If any criterion fails,
  stop at Phase 1 — the radar and scaffolding already paid for the work.
- **Phase 3 — opportunistic:** migrate other types only when they are
  being touched anyway (bug fix / new property). Never big-bang.
- **Permanent hand-written territory:** update orchestration + removal
  semantics, waiters/stabilization, physicalId + delete/update addressing,
  import & `readCurrentState` (until a read-path generator is proven the
  same way), data-safety gates, synthesized required values.

Per migrated type, the critic's key/shape/write-evidence entries retire
(the spec supersedes them); the critic remains for un-migrated targets
until Phase 3 exhausts them.
