# PoC: generating the CFn -> SDK conversion from schemas

**Verdict: feasible and strongly positive.** The CFn-property -> SDK-input
conversion that every SDK provider hand-writes today — and that the
`gen-nested-key-coverage` critic family audits after the fact — can be
derived mechanically from two authoritative, machine-readable sources. Run
against the six types with the richest known-defect history, the generator
auto-resolves (or surfaces as an explicit review candidate) **every
nested-key silent-drop bug this repo has ever shipped**, including the five
CloudFront keys (#1370/#1372), `MetricTimeZone -> MetricTimezone` (#1304),
the ECS blue/green `AdvancedConfiguration` block (#1473),
`ContainerPortRange` (#1472), `BatchReportMode` (#1432), the irregular
`s3filesVolumeConfiguration` casing, and most of the 20 confirmed S3 drops
filed as #1495. A 21-check runtime equivalence suite over the generated
mappers passes 21/21.

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
   does not carry is resolved to its own Put/Update operation (the S3
   idiom). All 16 of S3's config-blob operations (`PutBucketCors`,
   `PutBucketLogging`, `PutObjectLockConfiguration`, ...) were derived
   automatically — i.e. the generator recovers the hand-written
   `s3-bucket-provider`'s orchestration plan from the schemas.
4. **Structural matching** — parallel walk of the CFn property tree
   (`$ref`-resolved) and the Smithy input shape. Name tiers: exact ->
   case-insensitive -> fuzzy (normalized containment / common-prefix
   ratio, type-compatibility gated, always flagged for human confirm).
   Transforms detected from the (cfnKind, sdkKind) pair: structure/list
   recursion, `{Quantity, Items}` wrapper, single-list-member wrapper
   (`Tagging.TagSet`), ISO-string -> `Date`, string<->number/boolean
   coercion, object -> JSON-string, plus required-member detection
   (`smithy.api#required`).
5. **Emission** — per type: a mapping-spec JSON (the auditable artifact),
   a readable dependency-free TS mapper (`buildCreateInput` /
   `buildUpdateInput` / `buildDeleteInput`), and a divergence report
   listing everything below the high-confidence bar.

## Results

### Deep dive (the six types with known-defect history)

| Type | create-input coverage | Notes |
|------|----------------------|-------|
| AWS::CloudWatch::AnomalyDetector | 35/35 (100%) | ops resolved with EMPTY handlers; `Date` coercion derived |
| AWS::ECS::TaskDefinition | 158/158 (100%) | all camelCase + irregular casings auto |
| AWS::ECS::Service | 136/137 (99.3%) | miss = `ForceNewDeployment` (CFn structure vs SDK boolean — real type divergence, flagged) |
| AWS::CodeBuild::Project | 96/99 (97.0%) | misses = `Triggers`/`Visibility`/`ResourceAccessRole` (separate webhook / visibility APIs — flagged, `Visibility` sub-op auto-found) |
| AWS::CloudFront::Distribution | 147/154 (95.5%) | misses = legacy pre-2012 members (`S3Origin`, `CNAMEs`, ...) + `CachedMethods` nesting + `GeoRestriction.Locations` — exactly today's allow-list entries |
| AWS::S3::Bucket | CreateBucket 5/23 + 16 auto-derived sub-ops | Website 100%, ObjectLock/PublicAccessBlock/Ownership/Versioning/Accelerate 100%, Replication 94%, Lifecycle 61% |

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
| CodeBuild `BuildBatchConfig.BatchReportMode` (#1432) | proved the `no-write-evidence` class | **auto** — generated code writes every matched member, so the fresh-object-mapper drop class is structurally impossible |
| S3 `ReplicationConfiguration.Rules.Destination.{AccessControlTranslation, EncryptionConfiguration, Metrics, ReplicationTime}` + `SourceSelectionCriteria` (#1495, unfixed) | write-evidence walk, filed | **auto** (exact tier, via the derived `PutBucketReplication` sub-op) |
| S3 `RoutingRules.RedirectRule -> Redirect`, `RoutingRuleCondition -> Condition` (#1448-noted renames) | hand analysis | **rename candidates** (0.67 / 0.45) |
| S3 `EventBridgeEnabled` boolean vs SDK empty-struct (#1430) | critic first run on S3 | **flagged** (unmatched inside `EventBridgeConfiguration` — cannot be auto-mapped, correctly) |

Runtime equivalence: `validate-mappers.ts` (scratch harness) feeds sample
CFn property bags through the generated AnomalyDetector / ECS Service /
CloudFront mappers — 21/21 assertions pass, including
Date-coercion, wrapper shapes, and every rename above.

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
- Smithy models describe the CURRENT API; a CFn property AWS still accepts
  but the current API dropped would surface as unmatched (safe direction).
