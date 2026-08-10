# PoC: generating the CFn -> SDK conversion from schemas

> This PoC was adversarially verified by three independent review agents;
> several of its original claims were refuted or corrected, and the
> generator was hardened in response. [VERIFICATION.md](VERIFICATION.md)
> is the record; this README reflects the post-verification state.

**Verdict: the mechanism works; the safety story requires three inputs,
not two.** The CFn-property -> SDK-input conversion that every SDK
provider hand-writes today — and that the `gen-nested-key-coverage` critic
family audits after the fact — can be derived mechanically from the CFn
registry schema plus the Smithy models, RECONCILED against the installed
@aws-sdk clients (without that third input the pipeline re-creates the
silent-drop class it exists to eliminate — see VERIFICATION.md C3). Run
against six types with a rich known-defect history, the generator
auto-resolves (or surfaces as an explicit review candidate) **every
nested-key silent-drop bug those six types shipped**, including four of
the five CloudFront keys (#1370/#1372) with the fifth as a candidate,
`MetricTimeZone -> MetricTimezone` (#1304), the ECS blue/green
`AdvancedConfiguration` block (#1473), `ContainerPortRange` (#1472),
`BatchReportMode` (#1432), the irregular `s3filesVolumeConfiguration`
casing, and 13 of the 20 confirmed-looking S3 drops filed as #1495. Two
shipped drops in OTHER services (ECR #920, Glue #918) were outside the
validated set — the claim is scoped to what was run. A 25-check runtime
smoke suite over the committed mappers passes
(`node scripts/poc-codegen/validate-mappers.ts`).

## Inputs

| Source | What it provides | Where |
|--------|------------------|-------|
| CFn registry schema (public `CloudformationSchema.zip`, one JSON per type) | `properties` + `definitions` (full JSON Schema per property), `handlers.<op>.permissions` (IAM actions -> operation names), `createOnlyProperties` / `readOnlyProperties` / `writeOnlyProperties` / `primaryIdentifier` | `https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip` (no auth; the fixtures under `tests/fixtures/cfn-schemas/` are derived captures and deliberately drop these fields) |
| Smithy models (JSON AST) | operations + input shapes, exact wire member spellings, `smithy.api#required`, timestamps/numbers/booleans, list/map/structure shapes | local clone of `github.com/aws/api-models-aws` |

Two trait fields make the join mechanical:

- `aws.api#service.cloudFormationName` links `AWS::<Service>::<Resource>`
  to the one Smithy model the provider's SDK client uses.
- `handlers.create.permissions` (e.g. `ecs:CreateService`) names the exact
  operations the CFn handler itself calls.

## Pipeline (implemented here)

1. **Service resolution** — grep the models tree for the type's
   `cloudFormationName`. Ambiguity (e.g. `lambda` vs `lambda-core`, both
   "Lambda") is resolved by scoring models on handler-action overlap
   (37 : 0 for `AWS::Lambda::Function`).
2. **Operation resolution** — handler permissions filtered to the service
   prefix, ranked by verb priority (`Create/Put/Register/...`,
   `Update/Modify/Put/Set`, `Delete/Deregister/.../Schedule`) with
   resource-name containment preferred across all verbs. Legacy types with
   empty handlers (CodeBuild, CloudWatch AnomalyDetector) fall back to a
   verb + resource-name heuristic over the full operation set. Every
   candidate set is preserved in the report for an override table.
3. **Per-property sub-operations** — a top-level property the create input
   does not carry (or only fuzzy-matches) is resolved to its own
   Put/Update operation (the S3 idiom), with an anchored name match
   (VERIFICATION.md M4). 19 S3 sub-operations derive (`PutBucketCors`,
   `PutBucketLogging`, `PutObjectLockConfiguration`,
   `PutBucketEncryption`, ...) — covering all 17 config Put-family calls
   the hand-written `s3-bucket-provider` issues, plus the two Metadata
   create ops. Deriving the OPERATION does not guarantee the inner blob
   member matches (`BucketEncryption` vs the request's
   `ServerSideEncryptionConfiguration` needs an override entry).
4. **Structural matching** — parallel walk of the CFn property tree
   (`$ref`-resolved) and the Smithy input shape. Name tiers: exact ->
   case-insensitive -> fuzzy (normalized containment / common-prefix
   ratio, type-compatibility gated, always flagged for human confirm).
   Transforms detected from the (cfnKind, sdkKind) pair: structure/list
   recursion, `{Quantity, Items}` wrapper, single-list-member wrapper
   (`Tagging.TagSet`), ISO-string -> `Date`, string<->number/boolean
   coercion, object -> JSON-string, plus required-member detection
   (`smithy.api#required`).
5. **Installed-SDK reconciliation** (added after adversarial verification —
   VERIFICATION.md C3) — every generated SDK member name is checked against
   the pinned `@aws-sdk/client-*` typings under `node_modules`; a member
   the installed serializer does not know is flagged `version-skew` and
   never emitted (live catches: CodeBuild `hostKernel`, S3
   `AnnotationTableConfiguration`, Lambda `S3ObjectStorageMode`).
6. **Emission** — per type: a mapping-spec JSON (the auditable artifact),
   a readable dependency-free TS mapper (`buildCreateInput` /
   `buildUpdateInput` / `buildDeleteInput`), and a divergence report
   listing everything below the high-confidence bar. **Only exact / case
   tier mappings with supported transforms are emitted as code** — fuzzy
   rename candidates, collision losers and skew members are report-only
   (an unconfirmed guess that executes is worse than a visible gap).

## Results

### Deep dive (six types with known-defect history)

Coverage is the HONEST split (post-verification): `auto` counts only
members the generated code actually writes; candidates / skew /
type-incompatible members are visible buckets, never lumped into
"matched".

| Type | create-input coverage (auto-emitted) | Notes |
|------|--------------------------------------|-------|
| AWS::CloudWatch::AnomalyDetector | 35/35 | ops resolved with EMPTY handlers; `Date` coercion derived |
| AWS::ECS::TaskDefinition | 157/158 + 1 candidate | camelCase + irregular casings auto; `ProxyConfigurationProperties` is the candidate |
| AWS::ECS::Service | 135/137 + 1 candidate | `ForceNewDeployment` type-divergence flagged; `PlacementStrategies` is the candidate |
| AWS::CodeBuild::Project | 95/99 + 1 version-skew | skew = `HostKernel` (absent from the pinned SDK — correctly NOT emitted); `Triggers`/`Visibility`/`ResourceAccessRole` unmatched (separate APIs; `Visibility` sub-op auto-found) |
| AWS::CloudFront::Distribution | 145/154 + 2 candidates | unmatched = legacy pre-2012 members (`S3Origin`, `CNAMEs`, ...) + `CachedMethods` nesting + `GeoRestriction.Locations` |
| AWS::S3::Bucket | CreateBucket 1/25 + 19 auto-derived sub-ops | ObjectLock/PublicAccessBlock/Ownership/Versioning 100%; Replication 33/35; Lifecycle 15/28; Website 12/16; several sub-op blob members still need override entries (PutBucketEncryption 0/1, Logging 0/1, Tagging 0/1) |

The hand-written `s3-bucket-provider` issues 17 config Put-family calls;
the derivation now finds all of them plus the two Metadata create ops (19
total). The blob-MEMBER match inside a derived sub-op is a separate step
and still misses where CFn and SDK names are unrelated
(`BucketEncryption` vs `ServerSideEncryptionConfiguration`) — override
territory, reported as such.

### Every known shipped silent-drop, re-derived from schemas

| Known defect | How it was found originally | Generator outcome |
|---|---|---|
| `MetricTimeZone -> MetricTimezone` (#1304) | live failure | **auto** (case tier) |
| CloudFront `AcmCertificateArn -> ACMCertificateArn`, `IamCertificateId -> IAMCertificateId`, `SslSupportMethod -> SSLSupportMethod`, `OriginSSLProtocols -> OriginSslProtocols` (#1370/#1372) | live template read, 2 invisible to review | **auto** (case tier) |
| CloudFront `IPV6Enabled -> IsIPV6Enabled` | critic `no-sdk-member` bucket | **rename candidate** (0.85) |
| CloudFront `OriginCustomHeaders -> CustomHeaders` + wrapper (#1373 first run) | critic first run (live drop + update wipe) | **rename candidate** (0.68) + wrapper auto |
| CloudFront `{Quantity, Items}` wrappers + required empty defaults | hand-maintained `QUANTITY_ITEM_FIELDS` | **auto** (structural + `smithy.api#required`) |
| CloudFront `CallerReference` | hand-synthesized | **flagged** as required-with-no-CFn-source |
| ECS `S3FilesVolumeConfiguration -> s3filesVolumeConfiguration` (#1373 first run) | critic (unreachable by first-letter flip) | **auto** (case tier) |
| ECS `LoadBalancers.AdvancedConfiguration` blue/green block (#1473) | write-evidence walk | **auto**, runtime-verified |
| ECS `PortMappings.ContainerPortRange` (#1472) | write-evidence walk | **auto** (case tier) |
| ECS `PlacementStrategies -> placementStrategy` | hand-written | **rename candidate** (prefix ratio) |
| ECS `ProxyConfigurationProperties -> properties` (#1464 `segmentRenames`) | false positive during critic deepening | **rename candidate** (0.36) |
| CodeBuild `BuildBatchConfig.BatchReportMode` (#1432) | proved the `no-write-evidence` class | **auto** — generated code writes every matched member. (This closes the forgot-to-write class ONLY under the installed-SDK reconciliation: without it, model-newer-than-runtime members are silently dropped by the serializer — VERIFICATION.md C3) |
| S3 `ReplicationConfiguration.Rules.Destination.{AccessControlTranslation, EncryptionConfiguration, Metrics, ReplicationTime}` + `SourceSelectionCriteria` (#1495, unfixed) | write-evidence walk, filed | **auto** (exact tier, via the derived `PutBucketReplication` sub-op) |
| S3 `RoutingRules.RedirectRule -> Redirect`, `RoutingRuleCondition -> Condition` (#1448-noted renames) | hand analysis | **rename candidates** (0.67 / 0.45) |
| S3 `EventBridgeEnabled` boolean vs SDK empty-struct (#1430) | critic first run on S3 | **flagged** (unmatched inside `EventBridgeConfiguration` — cannot be auto-mapped, correctly) |

Runtime checks: [validate-mappers.ts](validate-mappers.ts) (committed)
feeds sample CFn property bags through the committed mappers — 25/25
assertions pass, pinning both directions: auto-tier mappings ARE emitted
with their transforms, and candidates / collisions / skew members are NOT
(e.g. `HostKernel` must be absent from the CodeBuild input). It is a smoke
test with hand-picked expectations, not a differential equivalence suite
against the hand-written providers.

### Breadth (16 more types, one run, no per-type work)

IAM Role, Lambda Function, DynamoDB Table, SQS Queue, SNS Topic, EC2
SecurityGroup, Logs LogGroup, KMS Key, ELBv2 LoadBalancer, ApiGatewayV2
Api, Kinesis Stream, ECR Repository, EFS FileSystem, Events Rule, Glue
Job, Route53 HostedZone: service + create/delete operation resolution
correct on all 16 (`PutRule`, `ScheduleKeyDeletion`, `SetQueueAttributes`
included); single-op updates resolve correctly, multi-op updates surface
their candidate sets honestly.

## What derives automatically vs what stays human

**Auto (high confidence):** member spellings including the whole
case-divergence class; Pascal->camel styles; structure/list/map recursion;
`{Quantity, Items}` and single-list-member wrappers; `Date` / number /
boolean coercions; required-wrapper empty defaults; per-property
sub-operation plans; readOnly exclusion.

**Candidate (generated, human-confirmed once, then pinned in an override
table):** fuzzy renames. The fuzzy tier proposes the right member for
every historical rename in this repo, but it can also propose a wrong one
— observed live: `BucketName -> BucketNamespace` (correct: `Bucket`) —
which is exactly why candidates must be reviewed, not trusted.

**Not derivable (stays as per-resource glue, exactly the code that is
NOT the recurring bug class):** synthesized fields (`CallerReference`,
client tokens); physicalId derivation and delete/update addressing
(identifier from state, not properties); waiters / stabilization
semantics; multi-op sequencing policy; eventual-consistency retries;
data-safety gates (`forceDataDelete` etc.); attribute-map idiom
(SQS/SNS `Attributes` maps — a tractable future recognizer); per-item
plural PUT loops (S3 `AnalyticsConfigurations` -> one
`PutBucketAnalyticsConfiguration` per element — recognizable:
CFn list + sub-op input carrying the singular structure); request-level
members nested differently in CFn (`TransitionDefaultMinimumObjectSize`).

## Proposed production shape (not built here)

> Assessed adoption plan: see [EVALUATION.md](EVALUATION.md). It weighs
> this section's runtime-generation shape against the current critic
> mechanism and concludes the spec's low-risk consumption modes come
> first — oracle-driven hand fixes + a drift radar, then a differential
> shadow-mapper test harness; runtime builders unconditionally only for
> NEW providers, and for existing ones only as a contingency. The points
> below stand as the description of what full runtime generation WOULD
> look like.

1. **Commit the mapping spec** (`docs/_generated/sdk-mapping/<type>.json`)
   as the reviewed artifact, generated by a `vp run gen:sdk-mapping` task;
   CI fails on drift — the same pattern as the existing codegen critics.
2. **Generate the input-builder layer** of each provider from the spec
   (`buildCreateInput` etc.); the hand-written provider keeps
   orchestration (waiters, physicalId, multi-op sequencing, retries) and
   calls the generated builders. New-provider scaffolding
   (`/new-provider`) starts from a generated builder instead of a blank
   `mapProperties`.
3. **Per-type override table** for confirmed renames and the non-derivable
   glue points, staleness-fenced like `segmentRenames` (an entry whose
   un-renamed chain starts resolving must be removed).
4. **The critic inverts**: `gen-nested-key-coverage`'s job today is
   reverse-engineering hand-written conversions with a ~4.5k-line static
   analysis whose file header is mostly documented BOUNDS (what the
   AST walk cannot see). Against generated builders, the audit becomes
   trivial: the unmatched/candidate buckets of the spec ARE the audit
   surface, and the write-evidence problem disappears because the
   generator writes every matched member by construction.
5. Migration is incremental per resource type — a provider switches its
   input-building to the generated layer type by type, verified by the
   existing integ suite (`/run-integ` per migrated type).

## Running the PoC

```bash
# one-time inputs
curl -sSL -o /tmp/CloudformationSchema.zip \
  https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip
mkdir -p /tmp/cfn-schemas && unzip -oq /tmp/CloudformationSchema.zip -d /tmp/cfn-schemas
ghq get aws/api-models-aws   # or git clone

node scripts/poc-codegen/main.ts \
  --cfn-schema-dir=/tmp/cfn-schemas \
  --models-dir="$(ghq root)/github.com/aws/api-models-aws/models" \
  --out=/tmp/poc-out \
  AWS::ECS::Service AWS::CloudFront::Distribution
```

Outputs per type: `<type>.mapping.json` (spec), `<type>.mapper.ts`
(generated code), plus a combined `report.md`. Committed example outputs
for the six deep-dive types live in [examples/](examples/).

## PoC boundaries

- Read paths (`readCurrentState` reverse mapping, GetAtt attributes) are
  not generated yet; the same spec supports inverting each member mapping,
  but that is unimplemented.
- `oneOf`/`anyOf` CFn variants and SDK unions are flagged, not resolved.
- The grep-based model discovery is a PoC shortcut; production would keep
  a committed `cloudFormationName -> model` index.
- Both skew directions are handled but asymmetrically: a CFn property the
  current API dropped surfaces as unmatched (safe); a model member newer
  than the pinned SDK is caught by the installed-SDK reconciliation —
  at member-NAME-set granularity, not per-shape (VERIFICATION.md C3).
- Single-op UPDATE resolution stays heuristic (`LogGroup update =
  PutLogGroupDeletionProtection`-style wrong-but-plausible picks are
  possible — VERIFICATION.md M3); candidate sets are preserved in the
  spec for an override table.
- CFn number -> SDK timestamp would treat epoch-seconds as milliseconds;
  no such pair exists in the probed corpus (latent, noted in code).
