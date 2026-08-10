# Smithy `aws.cloudformation` traits — lead assessment

AWS maintains an official, machine-readable member-level correspondence
between Smithy API models and CloudFormation resource schemas: the
[`aws.cloudformation` trait namespace](https://smithy.io/2.0/aws/aws-cloudformation.html),
consumed by the `cloudformation` build plugin in
[`software.amazon.smithy:smithy-aws-cloudformation`](https://smithy.io/2.0/guides/model-translations/generating-cloudformation-resources.html)
to generate CFn Registry resource schemas FROM Smithy models — the exact
reverse of this PoC's CFn -> SDK direction. In principle, reading these
traits backwards would replace the matcher's name heuristics with
authoritative data.

**Verdict after measuring the published corpus: the traits are real but
cannot carry the pipeline.** They cover ~10% of services — all newer ones,
with ZERO overlap with the 22 types this PoC validated — and the one trait
that would solve the rename problem (`@cfnName`) appears exactly once in
the entire corpus. Where present they are authoritative and worth
consuming as a trust tier and cross-check; they are not a foundation.

## The traits

| Trait | Meaning (schema-generation direction) | Reverse (PoC) reading |
|-------|----------------------------------------|-----------------------|
| `@cfnResource` | marks a Smithy resource shape as a CFn resource type (optional name / additionalSchemas) | anchors the type -> shape join without the `cloudFormationName` grep |
| `@cfnMutability` | `full` / `create` / `create-and-read` / `read` / `write` — emitted into createOnly/readOnly/writeOnly lists | SDK-side cross-check of the registry schema's semantic property lists |
| `@cfnName` | renames a member in the generated schema | authoritative CFn-property <-> SDK-member rename |
| `@cfnExcludeProperty` | member omitted from the generated schema | authoritative "this SDK member has no CFn counterpart" |
| `@cfnDefaultValue` | default in the generated schema | default-value provenance |
| `@cfnAdditionalIdentifier` | extra identifier in the generated schema | identifier hints beyond `primaryIdentifier` |

The traits package also ships a
[`CfnResource` Java class](https://smithy.io/javadoc/1.50.0/software/amazon/smithy/aws/cloudformation/traits/CfnResource.html)
that resolves shape members -> CFn properties programmatically, i.e. the
mapping logic itself is implemented and open-source (JVM-side).

## Measured coverage (aws/api-models-aws @ 1336553, 2026-08-07; measured 2026-08-11)

| Measurement | Value |
|-------------|-------|
| Service models in corpus | 429 |
| Models carrying any `aws.cloudformation#cfn*` trait | 44 (the `cloudformation` service model matches on its own shape namespace only — 0 traits) |
| `@cfnExcludeProperty` instances | 342 |
| `@cfnMutability` instances | 300 (`full` 140, `read` 99, `create-and-read` 47, `write` 11, `create` 3) |
| `@cfnResource` instances | 160 |
| `@cfnAdditionalIdentifier` instances | 4 (transfer, pipes, observabilityadmin) |
| `@cfnName` instances | **1** (bcm-data-exports `Tags`) |

The 44 trait-bearing services are uniformly newer ones — scheduler, pipes,
transfer, verifiedpermissions, bedrock, bedrock-agent, mediapackagev2,
opensearchserverless, rolesanywhere, omics, qbusiness, controltower, and
similar. **None of the 22 PoC-validated types is covered**: not s3, ecs,
cloudfront, codebuild, cloudwatch (six deep-dive), and none of the 16
breadth types (iam, lambda, dynamodb, sqs, sns, ec2, logs, kms, elbv2,
apigatewayv2, kinesis, ecr, efs, events, glue, route53).

Likely explanation (inference, not confirmed): the traits exist so a
service team can generate its CFn resource schema from its Smithy model.
Only newer resource providers were built model-first; legacy handlers are
hand-written, so their models never carried traits and there is no reason
for AWS to backfill them. Expect coverage to grow with new services, not
toward the legacy set where this repo's silent-drop history lives.

Reproduce:

```bash
cd "$(ghq root)/github.com/aws/api-models-aws"
grep -rl 'aws\.cloudformation#cfn' models | wc -l
grep -rho 'aws\.cloudformation#cfn[A-Za-z]*' models | sort | uniq -c
grep -rho '"aws\.cloudformation#cfnMutability": "[a-z-]*"' models | sort | uniq -c
```

## Consequences for the pipeline

1. **The structural matcher stays.** The bug-history services the PoC
   exists for have no traits, and `@cfnName` (one instance corpus-wide)
   cannot replace the fuzzy tier + override table for renames.
2. **Add a trait tier above `exact` when traits are present.** For the 44
   covered services, `@cfnResource` beats the `cloudFormationName` grep
   for service/shape resolution, and a member-level trait is authoritative
   over any name-similarity score.
3. **Use `@cfnExcludeProperty` to close review buckets.** An unmatched SDK
   member carrying the trait is CONFIRMED to have no CFn counterpart —
   that divergence-report entry needs no human review.
4. **Use `@cfnMutability` as a second oracle for the semantic lists.** A
   disagreement between a model's mutability trait and the registry
   schema's createOnly/readOnly/writeOnly lists is a signal one side is
   wrong — cheap cross-check, registry schema remains primary.
5. **Do not make traits a dependency.** Consume opportunistically;
   membership in the trait-bearing set should be detected per model, not
   assumed.

## Verification status

The existence/purpose claims come from primary sources (smithy.io docs and
javadoc, aws/api-models-aws README) collected in the 2026-08-10 prior-art
research sweep, where they did NOT go through that sweep's adversarial
verification step. The coverage numbers above are direct measurements
against the local corpus clone and supersede that gap for the questions
that matter here.
