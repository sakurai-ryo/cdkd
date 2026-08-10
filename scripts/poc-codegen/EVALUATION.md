# Evaluation: hand-written + critics vs schema-driven codegen vs hybrid

> Revised after adversarial verification ([VERIFICATION.md](VERIFICATION.md)):
> several numbers and two load-bearing safety claims in the original
> version were refuted or corrected; the generator was hardened in
> response (installed-SDK reconciliation, candidates never emitted,
> collision detection). §7 adds the Cloud Control auto-route comparison
> the original omitted.

Question: now that the PoC exists, should cdkd keep the current mechanism
(hand-written conversion + the static-analysis critic family), switch to
schema-driven generation, or adopt a hybrid — and where exactly should the
boundary run?

**Verdict up front: hybrid — but the durable artifact is the SPEC, not
the generated runtime code.** The machine-derived mapping spec has three
consumption modes with very different risk profiles (§6): a repair /
drift-radar oracle, a differential-test oracle against the hand-written
mappers, and generated runtime builders. The first two capture most of
the prevention value at near-zero runtime risk; generated runtime
builders are worth it unconditionally only for NEW providers, and for
existing proven providers only if differential testing proves
insufficient. Orchestration — update semantics, waiters, physicalId,
multi-op sequencing, read paths — stays hand-written regardless (that is
the part schemas cannot derive AND the part that has never been the
recurring bug class). Neither pure option survives contact with the
evidence below.

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
| Case divergence (`MetricTimeZone`, 4 of the 5 CloudFront keys — #1304, #1370/#1372) | Detected by critic — AFTER 4 live recurrences forced the tooling; each fix by hand | **Prevented** (case tier, auto). The 5th CloudFront key (`IPV6Enabled`) is a rename candidate, next row |
| Rename, no same-spelled member (`IsIPV6Enabled`, `OriginCustomHeaders`, `Redirect`, `placementStrategy`) | Critic flags `no-sdk-member`; human finds the target member by hand | **Candidate auto-proposed** (every historical rename found — alongside wrong proposals; measured S3 fuzzy precision is poor, which is WHY candidates are report-only and never emitted); human confirms once into an override table |
| Wrapper shapes (`{Quantity, Items}`, `Tagging.TagSet`) | Shape pass detects; hand-maintained conversion (`QUANTITY_ITEM_FIELDS`) | **Generated** (structural + `smithy.api#required` empty defaults; wrappers with additional required members like `TrustedSigners.Enabled` surface a TODO instead — VERIFICATION.md M1) |
| Fresh-object member drop (`BatchReportMode` #1432, `ContainerPortRange` #1472, `AdvancedConfiguration` #1473) | Write-evidence pass: opt-in per target (9 of 11), 8 documented bounds, **260 residual unmeasurable paths** (S3 98, CloudFront 162 — #1475 still open) | **Closed for matched members** — the generator writes every matched member, PROVIDED the installed-SDK reconciliation runs (without it, model-newer-than-runtime members are silently dropped by the serializer — the claim "structurally impossible" was refuted on exactly that, VERIFICATION.md C3). Unmatched members remain visible gaps, same epistemic status as a critic finding |
| AWS adds a nested member to an existing type | Invisible until fixture refresh, and only on the **11** onboarded targets (top-level additions are fenced tree-wide by `gen-property-coverage`) | Regen produces a reviewable diff, **any type** — equally refresh-gated (schema zip + models pin), plus a skew flag when the member is ahead of the pinned SDK |
| Value-semantics divergence (`EventBridgeEnabled` bool vs empty struct — #1430) | Critic flags it | Flags it (type-incompatible) — **parity**, human resolves either way |
| Removed-property-on-update semantics (CFn "absent -> reset to default") | Hand-written per type, live-verified (e.g. AnomalyDetector "Put REPLACES stored Configuration", live-verified 2026-07-31) | **Not derivable** — API behavior, not schema |
| Multi-op update orchestration (Lambda `UpdateFunctionConfiguration` + `UpdateFunctionCode` + `waitUntilFunctionUpdatedV2`; S3 per-blob puts) | Hand-written | Derives the op **inventory** (S3: 19 sub-ops, covering all 17 hand-written config Put-family calls — the original "16/16" undercounted the hand side and missed `PutBucketEncryption`, VERIFICATION.md) but not sequencing/conditions; the PoC picked only `UpdateFunctionCode` for Lambda update |
| Synthesized required fields (`CallerReference`, `TrustedSigners.Enabled: false`) | Hand-written with live-verified values | **Flagged** as required-unfed; values stay hand-written |

Reading of the table: the top five rows — the entire recurring,
repo-history-documented silent-drop problem — flip from "detect + hand-fix,
with measured residuals" to "prevented or candidate-proposed". The bottom
four rows do not flip, and two of them cannot flip even in principle.

## 3. Cost curves (the part the bug table doesn't show)

**Current mechanism's marginal costs, measured:**

- One critic (`gen-nested-key-coverage`) is ~4.5k lines (~520 of them the
  documentation header) + 216 tests, built over 8 critic-machinery
  iterations (#1373 → #1378 → #1430 → #1432 → #1445 → #1448 → #1464 →
  #1474; #1475 open — the commit chain also contains provider BUG-FIX
  commits for drops the critic itself found, which are its payoff, not its
  cost), reaching 11 audited targets. The iterations track provider
  IDIOMS (a bounded set), not targets — #1445 alone opted in five
  forwarder-shaped targets — so the cost curve is steep per idiom rather
  than per target. Each new target requires measuring finding counts and
  calibrating four kinds of parser floors; each genuine rename requires a
  hand-declared, staleness-fenced `segmentRenames` / allow-list entry.
- The two biggest targets structurally cannot finish: S3 (98 unmeasurable
  paths, 20 of which are confirmed-LOOKING drops filed as #1495, still
  unfixed) and CloudFront (162 unmeasurable, spread-and-patch recognizer
  deliberately not built — #1475 calls it the shape most likely to become
  a rubber stamp).
- Detection is not prevention: every flagged divergence still becomes a
  hand-written fix PR.

**Codegen's marginal costs, measured in the PoC:**

- 22 resource types processed with committed evidence (6 deep-dive + 16
  breadth; 5 more ApiGatewayV2 types ran in-session uncommitted) with zero
  per-type code; per-type onboarding is "run the tool, review the report".
- The PoC (loader + matcher + operations + emitter + installed-SDK check +
  report) is ~1.7k lines — but that is EXPLORATION-grade code with no
  tests, no CI wiring, no parser floors and no override-table machinery,
  vs a hardened critic whose 4.5k lines come WITH 216 tests and all of
  those. Production-izing the generator inherits the same hardening mass;
  the honest comparison is of problem SHAPE (constructive derivation vs
  AST reverse-engineering of hand code), not of line counts.
- New ongoing costs it introduces: input currency (schema zip snapshot +
  api-models-aws pin + the pinned @aws-sdk clients must be refreshed and
  reconciled TOGETHER — three inputs, not two; VERIFICATION.md C3),
  override-table review (fuzzy candidates are sometimes WRONG — observed
  live: `BucketName -> BucketNamespace`, correct answer `Bucket`; measured
  S3 fuzzy precision was poor before the kind gate), and regen-diff review
  discipline.

## 4. Risk comparison

| Risk | Current | Codegen |
|---|---|---|
| Runtime regression on adoption | None (critics never touch runtime) | Real: swapping a battle-tested provider's builder can regress tolerances the hand code had (string coercions, permissive shapes). Mitigated per type by the integ gates, but integ coverage is not exhaustive |
| Silent wrong mapping | The measured residuals (260 paths) + non-target types | A WRONG fuzzy candidate that executes would be a new bug source — the PoC originally emitted them and adversarial review reproduced AWS-ACCEPTED wrong writes (VERIFICATION.md C2); candidates are now report-only, applied ONLY via a human-confirmed override table. A wrong override that survives review still propagates with no post-confirmation correction mechanism — an accepted open risk of the plan |
| Upstream input error / version skew | CFn fixture wrong -> critic noise (safe); the critic reads the INSTALLED SDK typings, so it is immune to model-vs-runtime skew by construction | THREE inputs can disagree (CFn snapshot, Smithy HEAD, pinned @aws-sdk). Model-newer-than-runtime IS a silent-drop direction (the serializer drops unknown members — live: CodeBuild `hostKernel`); the original "no silent-drop direction" claim was refuted on this. Now handled by the mandatory installed-SDK reconciliation: skew members are flagged and never emitted |
| Behavioral semantics loss | N/A (hand code carries them) | Real if the boundary is drawn wrong — removal semantics, full-vs-partial update payloads, live-verified default values are NOT schema-derivable and must stay in glue |

## 5. Why each pure option loses

**Pure current** keeps paying the detective tax — steep per provider
IDIOM (eight machinery iterations, two targets that cannot complete) even
though cheap per additional same-idiom target — while the actual fix for
every finding remains manual. The 20 confirmed-looking S3 drops sitting in
#1495 are the steady state of this model: known, filed, unfixed.

**Pure codegen** is not achievable: update/removal semantics, waiters,
physicalId derivation, import/read paths and data-safety gates are
API-behavioral knowledge the schemas do not carry — and a big-bang swap of
proven providers maximizes the one risk class codegen adds.

**And even scoped runtime codegen has a weaker case than it first
appears, for three measured reasons:**

- The semantic bug class (`EventBridgeEnabled` bool-vs-struct #1430,
  malformed-container defaults #1471, removal-on-update semantics) is
  untouched by generation — flagged at best, fixed by hand + live
  verification either way — and the integ burden does not shrink.
- On the hardest target the generated cover is uneven (S3: Website 100%,
  Replication 94%, but Lifecycle 61%, Tags/Logging 0%), so a migrated
  provider would carry generated AND hand-written members for the same
  API call — a new boundary-management complexity inside one provider.
- The critic already keeps the spelling class non-regressing for its 11
  targets and the write-drop class for the 9 write-evidence opt-ins, so
  runtime generation's marginal value concentrates on the un-onboarded
  remainder of the ~80 provider files (many of which are flat-property
  types where the nested-blob class barely exists — top-level drops are
  fenced tree-wide by `gen-property-coverage`), the 260 unmeasurable
  paths, and new types — not on the already-guarded center.

What runtime generation uniquely solved was the write-evidence PROOF
problem (static analysis cannot prove a fresh-object mapper writes what
it should — the 260 unmeasurable paths are that limit). §6's differential
mode solves the same proof problem dynamically, without touching the
deploy path — which is why runtime migration of existing providers is
demoted to a contingency below.

## 6. The spec's three consumption modes, and the recommended plan

The PoC's durable artifact is the machine-derived mapping spec. It can be
consumed three ways:

| Mode | Solves | Runtime risk |
|---|---|---|
| (i) **Oracle**: fix known drops by hand against the spec; commit specs for ALL types as a CI drift radar | #1495 immediately; new-member visibility across the whole tree (the critic covers 11 targets) | zero |
| (ii) **Differential test (shadow mapper)**: generate a synthetic input populating every schema path, run the HAND-WRITTEN provider against a mocked SDK client, capture the command input it actually built, and diff its member-path set against the generated mapper's output | the write-evidence proof problem — but ONLY for spec-MATCHED paths (see the blind spot below); a dropped matched member surfaces as a diff | zero (test-only), plus diff-noise triage |
| (iii) **Generated runtime builders** | same class as (ii), constructively | real: behavior regression on proven providers + generated/hand boundary inside one provider |

Mode (ii) replaces what the write-evidence pass proves statically (a
~4.5k-line AST analysis with eight documented bounds) with a direct
measurement, using the same SDK-client mocking the unit tests already
use. **Its structural blind spot must be stated up front** (adversarial
finding): the diff proves hand-vs-SPEC agreement, never spec-vs-truth — a
member that is spec-unmatched AND hand-dropped produces NO diff, so the
harness is blind exactly where the spec's match rate is worst (on S3
today: Logging, Tagging, the BucketEncryption blob member). "The 260
unmeasurable paths become measured" holds only for the spec-matched
subset; unmatched paths stay the override table's job. Two further cost
items the original underestimated: hand code legitimately injects members
the spec cannot know (idempotency tokens, `CallerReference`, empirically
probed update fill-sets, `Bucket` on every call), so the diff needs a
per-type ignore direction — a new allow-list-like mechanism; and
read-modify-write UPDATE paths (CloudFront) require synthesizing SDK
RESPONSE shapes the spec does not model, so mode (ii) measures create
well and update poorly.

Boundary rule if/when (iii) applies: **generated code owns "which member,
what spelling, what shape"; hand code owns "which call, when, and what
the API means by it".**

Recommended order:

- **Phase 0 — decide the #1495 remedy per drop family FIRST (§7):** for
  each family, compare a hand fix (spec as oracle — it names the correct
  member for 13 of the 20; the Logging / Lifecycle-request-level /
  Encryption families need hand analysis) against the EXISTING Cloud
  Control auto-route (declare the top-level `unhandledByDesign`, ~dozens
  of lines, AWS's own handler becomes the mapper). §7 concludes the
  auto-route fits the rarely-used families and is a poor fit for
  ubiquitous ones — but the comparison must be made explicitly before any
  new machinery is built.
- **Phase 0b — drift radar (no runtime change):** add a
  `vp run gen:sdk-mapping` task committing specs under
  `docs/_generated/sdk-mapping/` for ALL SDK-provider types, CI-checked
  for drift. Pin ALL THREE inputs (schema-zip date, api-models-aws
  commit, and the @aws-sdk client versions the skew check ran against) in
  the spec header for reproducibility.
- **Phase 1 — differential harness (test-only):** shadow-mapper diff for
  the fresh-object-mapper types, starting with the two the static pass
  cannot finish (S3, CloudFront). Success criterion (re-scoped after the
  blind-spot finding): the diff reproduces every #1495 drop whose path
  the spec MATCHES on the pre-fix tree (the Replication +
  SourceSelectionCriteria families), and reports clean after Phase 0's
  fixes; spec-unmatched paths are explicitly out of the harness's reach
  and stay on the override-table worklist. As types come under
  differential coverage, the write-evidence pass (and its floors/bounds
  machinery) retires for them; the key/shape passes can also consume the
  spec instead of re-deriving from fixtures + SDK typings.
- **Phase 2 — generation for NEW providers only:** `/new-provider`
  scaffolds input builders from the spec. New types start prevented;
  no existing behavior at risk.
- **Phase 3 — contingent runtime migration:** only if differential
  coverage proves insufficient in practice (e.g. a drop class the diff
  cannot express, or harness glue that rivals the migration cost), and
  then only per-type, behind feature + broad integs, never big-bang.
- **Permanent hand-written territory:** update orchestration + removal
  semantics, waiters/stabilization, physicalId + delete/update addressing,
  import & `readCurrentState` (until a read-path generator is proven the
  same way), data-safety gates, synthesized required values.

## 7. The Cloud Control auto-route alternative (added after verification)

The original evaluation never weighed the repo's EXISTING remedy for the
silent-drop class: the #614 auto-route. Declaring a top-level property
`unhandledByDesign` on the SDK provider converts an invisible drop into a
per-resource re-route — any template carrying that property sends the
WHOLE resource through Cloud Control, where AWS's own registry handler
(the one CloudFormation uses) applies every nested key. No mapper exists,
so no write-side drop is possible; the mapping is maintained by AWS. The
costs: the CC path is async-polling slow, the routing is STICKY
(`provisionedBy: 'cc-api'` stays after adoption), and the granularity is
top-level-property PRESENCE — every bucket that uses the property at all
takes the slow path, not just the ones using the droppy nested key.

Per #1495 drop family, judged on that granularity:

| Family (top-level that would be declared) | Property usage | Verdict |
|---|---|---|
| `ReplicationConfiguration` (Destination blocks + `SourceSelectionCriteria`, 13 of the 20 keys) | uncommon | **Auto-route fits** — but the spec maps this family at the exact tier, so a hand fix is equally cheap; either closes it |
| `LoggingConfiguration` (`TargetObjectKeyFormat` family) | moderately common (prod buckets) | Borderline — routing ALL access-logged buckets to CC for one rare sub-key is a wide blast radius; hand fix preferred |
| `LifecycleConfiguration` (`TransitionDefaultMinimumObjectSize` — a REQUEST-level member, not inside the blob) | very common | **Auto-route does not fit** (near-every managed bucket would go slow-path); needs a hand fix with request-level glue |
| `BucketEncryption` (`BlockedEncryptionTypes`) | common | **Auto-route does not fit**; hand fix (the spec derives the PutBucketEncryption OP but not the blob member — override entry) |

So the auto-route is the right tool for the RARE-property families and the
wrong tool for ubiquitous ones — it should be the default remedy whenever
a droppy property is rare enough that the speed cost is negligible, BEFORE
any generator machinery is considered. A finer variant worth noting for
the future: cdkd's pre-flight already carries `nestedPropertyPaths`
captures, so silent-drop declarations COULD be extended to nested paths
(route to CC only when the droppy nested key is actually present),
shrinking the blast radius to exactly the templates that need it — that
would make the auto-route fit ALL #1495 families and is a far smaller
mechanism than any codegen pipeline. Neither exists today; the comparison
belongs in Phase 0 (§6).
