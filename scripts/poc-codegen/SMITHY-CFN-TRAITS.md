# Smithy `aws.cloudformation` traits — lead assessment

> Adversarially verified 2026-08-11 by two independent review agents
> (corpus re-measurement; primary-source + logic audit). This revision
> corrects three measured numbers, replaces the token-grep counting
> methodology with an AST-based one, RETRACTS the original "where present
> they are authoritative" framing, and inverts/demotes two of the five
> consequences. The refuted originals are noted inline.

AWS maintains an official, machine-readable member-level correspondence
between Smithy API models and CloudFormation resource schemas: the
[`aws.cloudformation` trait namespace](https://smithy.io/2.0/aws/aws-cloudformation.html),
consumed by the `cloudformation` build plugin in
[`software.amazon.smithy:smithy-aws-cloudformation`](https://smithy.io/2.0/guides/model-translations/generating-cloudformation-resources.html)
to generate CFn Registry resource schemas FROM Smithy models — the exact
reverse of this PoC's CFn -> SDK direction. In principle, reading these
traits backwards could replace parts of the matcher's name heuristics.

**Verdict after measurement and adversarial verification: the traits are
real but cannot carry the pipeline, and they are NOT a trust tier
either.** They cover 43 of 429 services — with ZERO overlap with the 22
types this PoC validated; the one trait that would solve the rename
problem (`@cfnName`) appears exactly once in the corpus, and the
default-value trait zero times. Where present they are a SPARSE OVERLAY
on the build plugin's own derivation (absence of a trait carries no
signal), and the corpus contains live members whose traits, read
backwards, assert the OPPOSITE of the published registry schema. The
only safe consumptions are within-model resource-shape anchoring and a
low-confidence provenance-mismatch signal.

## The traits

| Trait | Meaning (schema-generation direction) | Reverse (PoC) reading — post-verification |
|-------|----------------------------------------|-------------------------------------------|
| `@cfnResource` | marks a Smithy resource shape as a CFn resource type; optional `name` / `additionalSchemas` | `name` carries only the RESOURCE segment (`"Flow"`, `"Domain"` — never `AWS::X::Y`; 0 of 154 applications carry a full type name); the SERVICE segment still resolves via `aws.api#service.cloudFormationName`. Anchors resource shapes WITHIN an already-resolved model; does not replace the `cloudFormationName` join |
| `@cfnMutability` | `full` / `create` / `create-and-read` / `read` / `write` — OVERRIDES the plugin's mutability derivation (lifecycle-operation membership + identifiers) | a sparse override, not a copy of the registry lists: absence of the trait does NOT mean `full` (scheduler carries zero mutability traits yet its published schema has createOnly/readOnly lists), and `create` maps to createOnly AND writeOnly while `create-and-read` maps to createOnly only |
| `@cfnName` | renames a member in the generated schema | authoritative CFn-property <-> SDK-member rename where present — one instance corpus-wide |
| `@cfnExcludeProperty` | member omitted from the GENERATED schema | **NOT** "this SDK member has no CFn counterpart". The trait's job is making generation succeed (multiply-derived members must resolve to one target), so teams exclude update-side twins, response envelopes, and members whose CFn shape arrives via `additionalSchemas` — and the published schema may carry the property anyway (counterexamples below) |
| `@cfnDefaultValue` | ANNOTATION trait: marks that the generated property has a default — it carries no value | cannot supply a default; **zero instances in the corpus** |
| `@cfnAdditionalIdentifier` | extra identifier in the generated schema | identifier HINT only — the registry may invert the roles (transfer marks `Arn` additional; the published schemas have `Arn` as PRIMARY identifier) |

The traits package also ships a
[`CfnResource` Java class](https://smithy.io/javadoc/1.50.0/software/amazon/smithy/aws/cloudformation/traits/CfnResource.html)
(`getProperties()` / `getCreateOnlyProperties()` / `getExcludedProperties()`
etc.) — the shape-member -> CFn-property resolution logic is implemented
and open-source (JVM-side).

## Measured coverage (aws/api-models-aws @ 1336553, 2026-08-07; re-measured 2026-08-11)

Counting rule: trait APPLICATIONS are keys inside `traits` objects in the
JSON AST. Raw token greps overcount two traits, because
`"smithy.api#suppress": ["UnstableTrait.aws.cloudformation#cfnResource"]`
validation-suppression strings contain the trait names.

| Measurement | Value |
|-------------|-------|
| Service models in corpus | 429 |
| Models carrying >= 1 trait application | **43** |
| `@cfnExcludeProperty` applications | **326** (342 raw tokens; 16 are suppress strings) |
| `@cfnMutability` applications | 300 (`full` 140, `read` 99, `create-and-read` 47, `write` 11, `create` 3) |
| `@cfnResource` applications | **154** (160 raw tokens; 6 are suppress strings), 22 of them using `additionalSchemas` |
| `@cfnAdditionalIdentifier` applications | 4 (transfer x2, pipes, observabilityadmin) |
| `@cfnName` applications | **1** (bcm-data-exports `CreateExportRequest.ResourceTags` -> CFn `Tags`) |
| `@cfnDefaultValue` applications | **0** |

Two greppable red herrings, for anyone re-measuring: the `cloudformation`
service model matches only CASE-INSENSITIVE greps (via the shape name
`com.amazonaws.cloudformation#CFNRegistryException` — a substring
coincidence, zero traits), and `deadline` defines a shape IN the
`aws.cloudformation` namespace (`aws.cloudformation#StructureIdList`,
also zero traits).

The 43 trait-bearing services skew heavily to 2021+ (scheduler, pipes,
verifiedpermissions, bedrock, bedrock-agent, mediapackagev2,
opensearchserverless, rolesanywhere, omics, qbusiness, controltower, ...)
but NOT uniformly: mediatailor (2017), transfer and mediaconnect (2018)
are in the set. The accurate generalization is about model-first RESOURCE
PROVIDERS, not young services — mediaconnect's annotated shapes back CFn
types published 2020+. **None of the 22 PoC-validated types is covered**:
not s3, ecs, cloudfront, codebuild, cloudwatch (six deep-dive), and none
of the 16 breadth types (iam, lambda, dynamodb, sqs, sns, ec2, logs, kms,
elbv2, apigatewayv2, kinesis, ecr, efs, events, glue, route53).

Likely explanation (inference, not confirmed): the traits exist so a
service team can generate its CFn resource schema from its Smithy model.
Most registry-era providers are schema-first (the CloudFormation
CLI / RPDK workflow hand-authors the schema), legacy handlers are
hand-written, and there is no reason for AWS to backfill traits. Expect
coverage to grow with new services, not toward the legacy set where this
repo's silent-drop history lives.

## Trait data vs published registry schemas (why "authoritative" was retracted)

Spot-audited scheduler, pipes, transfer, mediaconnect against the
published `CloudformationSchema.zip`:

- Matches exist (pipes `Source` create-and-read = createOnly; transfer
  `Domain` create-and-read = createOnly; scheduler's two excludes are
  genuinely absent from the schema).
- **Contradictions exist too**: transfer `DescribedServer.State` and
  `DescribedUser.SshPublicKeys` carry `@cfnExcludeProperty`, yet
  `AWS::Transfer::Server.State` and `AWS::Transfer::User.SshPublicKeys`
  are published registry properties (the latter re-enters via
  `additionalSchemas` pointing at a leaked internal namespace,
  `com.amazonaws.necco.coral#CfnUserProperties`). mediaconnect
  `UpdateFlowRequest.SourceFailoverConfig` / `.Maintenance` are excluded
  yet published on `AWS::MediaConnect::Flow` — and `SourceFailoverConfig`
  is an EXACT-name match the PoC's matcher maps correctly today; obeying
  the trait would delete a correct update-path mapping, i.e. MANUFACTURE
  the silent-drop class this PoC exists to eliminate.
- pipes' registry `writeOnlyProperties` have zero trait support;
  transfer's identifier roles are inverted vs the registry.

So even on trait-bearing services the published schema is not reliably
generated from these models; a trait/registry disagreement localizes
nothing (version lag, provenance mismatch, or a derivation bug —
indistinguishable), and the registry schema remains the behavioral
contract for cdkd regardless.

Reproduce:

```bash
cd "$(ghq root)/github.com/aws/api-models-aws"
grep -rl 'aws\.cloudformation#cfn' models | wc -l   # -> 43 (case-sensitive)
# True applications (AST walk; token greps overcount via suppress strings):
python3 - <<'EOF'
import json, glob, collections
counts = collections.Counter()
for path in glob.glob('models/*/service/*/*.json'):
    def walk(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if key == 'traits' and isinstance(value, dict):
                    for trait in value:
                        if trait.startswith('aws.cloudformation#'):
                            counts[trait] += 1
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)
    walk(json.load(open(path)))
print(counts)
EOF
```

## Consequences for the pipeline (post-verification)

1. **The structural matcher stays.** The bug-history services the PoC
   exists for have no traits, `@cfnName` (one instance corpus-wide)
   cannot replace the fuzzy tier + override table for renames, and
   `@cfnDefaultValue` (zero instances) provides nothing.
2. **Within-model anchoring only.** For the 43 covered services,
   `@cfnResource` can anchor which resource shape / lifecycle operations
   belong to a CFn type AFTER the `cloudFormationName` join resolves the
   model (its `name` never carries the service segment). The traits are
   readable with zero loader work (they sit in the member `traits`
   objects the loader already preserves) — but the matching payload is
   nearly empty, and none of it touches cdkd's target set.
3. **WARNING (inverted from the original): do NOT auto-trust
   `@cfnExcludeProperty`.** Read backwards it can assert the opposite of
   the published schema (`SourceFailoverConfig` class), and the report
   bucket the original consequence proposed to close does not exist in
   this PoC's report (its `unmatched` bucket is CFn-side; the only
   SDK-side bucket is required-unfed, whose question — what value to
   synthesize — a trait cannot answer). At most an informational
   annotation on review items; never an auto-close.
4. **No mutability oracle.** Comparing `@cfnMutability` against the
   registry's createOnly/readOnly/writeOnly lists would require
   reimplementing the plugin's full derivation (lifecycle membership +
   identifiers + `additionalSchemas` + the `create` -> createOnly+writeOnly
   mapping) just to reach a signal that cannot distinguish "one side is
   wrong" from "different provenance" — and the registry stays primary
   either way. Dropped. (Original consequence 4 claimed a cheap
   cross-check; refuted.)
5. **Do not make traits a dependency.** Consume opportunistically;
   membership in the trait-bearing set should be detected per model, not
   assumed.

## Verification status

This document HAS now been adversarially verified (2026-08-11): two
independent agents re-derived every number (AST-based, at the pinned
corpus commit) and audited the primary sources (smithy.io trait spec +
build-plugin guide + javadoc) and the consequences against the actual PoC
implementation. The original revision's coverage count (44), two trait
counts (342 / 160), the "uniformly newer" characterization, the
"where present they are authoritative" framing, and consequences 3-4
were refuted and are corrected above. Confirmed intact: the trait set
and generation direction, corpus size, the mutability breakdown, the
`@cfnName` singleton, and the zero-overlap-with-validated-types result.
