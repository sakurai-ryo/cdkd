# Adversarial verification record

Three independent-context adversarial review agents were run against this
PoC, each instructed to REFUTE rather than confirm: (1) claims verification
— re-run the generator from scratch and re-derive every README number;
(2) implementation review — hunt for silently-wrong mappings by executing
the generator against the six committed types plus 25 more; (3) evaluation
audit — re-derive every EVALUATION.md number from primary sources and
stress-test the recommended plan. This file records what survived, what
was refuted, and which defects were fixed in response. README.md and
EVALUATION.md have been corrected accordingly; where a number below
disagrees with an older commit's text, this file and the current documents
are the accurate ones.

## What survived (independently reproduced)

- **Byte-identical reproducibility**: regenerating the six deep-dive types
  reproduces the committed examples exactly.
- **The 15-row known-defect table**: every row reproduces with the claimed
  tier and score in an independent re-run.
- **The case tier**: the entire case-divergence class (#1304, 4 of the 5
  CloudFront #1370 keys, `s3filesVolumeConfiguration`, `fileSystemId`,
  `batchReportMode`, `containerPortRange`) genuinely auto-derives.
- **Breadth operation resolution**: 16 additional services resolve
  create/delete correctly (incl. `PutRule`, `ScheduleKeyDeletion`,
  `SetQueueAttributes`); the Lambda vs lambda-core model disambiguation is
  a clean 37:0.
- **The runtime harness passes** against independently regenerated mappers
  (now committed as `validate-mappers.ts`, re-scoped to 25 checks pinning
  the post-fix semantics; it is a smoke test, not an equivalence suite).
- **EVALUATION.md's structural conclusions**: demoting runtime migration of
  proven providers to a contingency, generation-as-scaffold for NEW
  providers, and the spec-as-drift-radar all survived — strengthened, since
  the spec proved less trustworthy than first framed.

## Refuted or corrected claims

| Claim (as originally written) | Verdict | Correction |
|---|---|---|
| "auto-resolves every nested-key silent-drop bug this repo has ever shipped" | REFUTED | ECR #920 (`imageScanOnPush`) and Glue #918 (`S3Encryptions` plural) shipped outside the six validated types. README now scopes the claim to the validated set |
| "the fresh-object-mapper drop class is structurally impossible" | REFUTED | Version skew reintroduced it: the HEAD Smithy model maps CodeBuild `HostKernel -> hostKernel`, absent from the pinned `@aws-sdk/client-codebuild` — the serializer drops it silently. Fixed: installed-SDK reconciliation (C3 below) |
| "no silent-drop direction" (EVALUATION risk table) | REFUTED | Same three-way skew (CFn snapshot x Smithy HEAD x pinned SDK). Live instances: CodeBuild `hostKernel`, Lambda `S3ObjectStorageMode`, S3 `AnnotationTableConfiguration`, DynamoDB `VectorIndexes` family |
| CloudFront "5 keys prevented (case tier, auto)" | CORRECTED | 4 auto + `IPV6Enabled -> IsIPV6Enabled` is a rename candidate needing confirmation |
| "All 16 of S3's config-blob operations derived ... recovers the hand-written orchestration plan" | REFUTED | The hand-written provider issues 17 Put-family calls; `PutBucketEncryption` was missed because `BucketEncryption` fuzzy-matched to `Bucket` (json-string) and so never reached the sub-op search. Fixed: candidates/collisions now feed the sub-op lookup; 19 sub-ops derive (the blob-member match for PutBucketEncryption still needs an override entry — reported honestly as 0/1) |
| Coverage "100%" cells / "N/N matched" | CORRECTED | "Matched" counted unconfirmed fuzzy candidates AND type-incompatible members the emitted code never writes. Coverage is now split: auto-emitted / candidates (report-only) / collisions / version-skew / unsupported / unmatched |
| "21/21 runtime equivalence checks" | CORRECTED | It was a 3-type smoke test with hand-picked expectations, not an equivalence suite; now committed, 25 checks, labeled a smoke test |
| "Committed example outputs for the six deep-dive types live in examples/" | CORRECTED | Only 3 of 6 mappers and zero spec JSONs were committed; all 6 mappers + all 6 spec JSONs + report now are |
| EVALUATION "27 types processed" | CORRECTED | 6 + 16 + 5 were processed in-session but only 22 were committed as evidence; the text now says what is reproducible from the repo |
| EVALUATION "20 confirmed S3 drops" | CORRECTED | The critic's own header says "confirmed-LOOKING"; the hedge is restored, and the 20 are a subset of the 98 unmeasurable, not additive |
| "1.5k lines — a third of the one critic it would largely retire" | CORRECTED | Exploration-grade code (no tests, floors, CI wiring, override machinery) vs hardened tooling; the comparison is now framed as such |
| Shadow-mapper mode "the 260 unmeasurable paths become measured, S3 and CloudFront included" | REFUTED | Differential testing proves hand-vs-SPEC agreement only; a member both sides drop produces no diff. On S3 the spec's own match rate is the worst in the corpus, so the harness is structurally blind exactly where it was sold. §6 now states the blind spot and scopes the success criterion to spec-matched paths |
| (omission) Cloud Control auto-route as a rival remedy for #1495 | ADDED | EVALUATION §7 now compares the existing #614 auto-route per drop family before any new machinery |

## Implementation defects (found by executing the generator)

| ID | Defect | Status |
|---|---|---|
| C1 | Nested readOnly paths (`KubernetesNetworkConfig/ServiceIpv6Cidr`) truncated to their first segment excluded the whole WRITABLE property from every operation input — invisible in mapper and report; 84 types affected | **Fixed**: only fully-readOnly top-level names are excluded |
| C2 | Fuzzy candidates emitted as live code, with no containment-score floor (hits at 0.22) and no duplicate-target detection — producing AWS-accepted wrong writes (`GenerateSecretString -> SecretString` storing the generator config as the secret value; RDS delete targeting the SOURCE instance via `SourceDBInstanceIdentifier -> DBInstanceIdentifier`; SNS `DisplayName -> Name`; StepFunctions `Definition*` x4 colliding on `definition`) | **Fixed**: candidates are never emitted (report-only); containment floor 0.3; kind-preservation gate (scalar coercions / json-string rejected for candidates); collision resolution demotes lower-tier duplicates to a non-emitted `collision` bucket |
| C3 | No reconciliation against the INSTALLED @aws-sdk clients: members newer than the pinned SDK were emitted and silently dropped by the serializer | **Fixed**: installed client typings are a required third input (default `node_modules`, `--node-modules=` to override); absent members are flagged `version-skew`, never emitted, and reported. Granularity is a package-wide member-name set (per-shape membership not checked) |
| M1 | `{Quantity, Items}` wrapper synthesis omitted the wrapper's OTHER required members (CloudFront `TrustedSigners.Enabled`) and bypassed required-member reporting; the required-empty default was invalid for such wrappers | **Fixed**: other-required members detected, surfaced as TODO(required-wrapper), invalid empty defaults suppressed |
| M2 | `wrap-single-list-member` semantic false positives (S3 `InventoryConfigurations` folded into ONE config's `OptionalFields`; CodeDeploy resource `Tags` rewriting the EC2 targeting filter set) reported as 100% coverage | **Fixed** via C2's changes: such members are candidates at best (never emitted) and coverage no longer counts them as matched |
| M4 | Sub-operation resolver matched needles anywhere in the op name (Athena `State -> CreatePreparedStatement` at "100%") | **Fixed**: anchored match only (`rest.startsWith(needle)` or resource-prefixed); inner coverage now uses the honest split |
| M5 | Handler permissions silently discarded when the IAM action prefix matches none of the service-trait names (CloudWatch `cloudwatch:` vs `monitoring`) | **Fixed**: prefix-less retry, still restricted to actions that exist as operations of the model |
| M7 | Model-discovery score ties broken alphabetically (`Events` tie 18:18 picked legacy `cloudwatch-events`, whose client is not a dependency) | **Fixed**: ties prefer the model whose derived client package is installed |
| — | Report blind spots: sub-operation trees excluded from every findings section; no buckets for collisions / skew | **Fixed**: sub-op trees feed the same sections; new sections added |
| — | `toBool` rejected `'True'`/`'False'` | **Fixed** |
| M3 | Verb-priority update-op picks that look right and are wrong (`LogGroup update = PutLogGroupDeletionProtection`, `EC2 SecurityGroup update = UpdateSecurityGroupRuleDescriptionsEgress`) | **Open** — candidate sets are preserved in the spec/report for an override table; single-op update resolution remains heuristic |
| — | CFn number -> SDK timestamp would use `new Date(n)` on epoch-SECONDS (1000x off); no such pair occurs in the probed corpus | **Open** (latent; noted in code) |
| — | Cross-file `$ref`s (`#/properties/Arn`) unresolvable, degrade to free-form | **Open** (2 occurrences in corpus) |
| — | Installed-SDK check is name-set granularity, not per-shape | **Open** (sufficient for the model-newer-than-runtime class) |

## Net effect on the PoC's standing

The mechanism (schema-derived mapping, case tier, structural wrappers,
handler-driven op resolution, sub-op derivation) survived adversarial
re-execution intact. The safety story did not survive in its original form
and was rebuilt: nothing unconfirmed or skew-affected is emitted anymore,
the report now shows every non-auto bucket, and the pinned SDK is a
required input. The evaluation's ordering (oracle -> differential harness
-> scaffold-only generation -> contingent migration) stands, with the
differential mode's blind spot now stated and a Cloud Control auto-route
comparison added ahead of any new machinery (EVALUATION.md §6-§7).
