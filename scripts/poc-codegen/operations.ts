/**
 * Operation resolution: which Smithy operation implements the CFn handler's
 * create / update / delete semantics.
 *
 * Primary source: the registry schema's `handlers.<kind>.permissions` —
 * IAM actions scoped to the service prefix name real operations. Fallback
 * (legacy types with empty handlers, e.g. AWS::CodeBuild::Project): a verb +
 * resource-name heuristic over the model's full operation set. Either way
 * the ambiguity set is preserved for the report so a human (or an override
 * table) can pin the choice.
 */
import type { CfnSchema } from './cfn-schema.ts';
import type { SmithyModel } from './smithy-model.ts';
import type { OperationSource } from './types.ts';

export type OpKind = 'create' | 'update' | 'delete';

const VERB_PRIORITY: Record<OpKind, string[]> = {
  create: ['Create', 'Put', 'Register', 'Run', 'Start', 'Allocate', 'Provision'],
  update: ['Update', 'Modify', 'Put', 'Set'],
  // 'Schedule' covers KMS ScheduleKeyDeletion (keys are never hard-deleted).
  delete: ['Delete', 'Deregister', 'Terminate', 'Release', 'Remove', 'Cancel', 'Schedule'],
};

export interface ResolvedOperation {
  kind: OpKind;
  operationName: string;
  inputShape: string;
  source: OperationSource;
  /** Every candidate considered, for the report / a future override table. */
  candidates: string[];
}

export function resolveOperation(
  schema: CfnSchema,
  model: SmithyModel,
  kind: OpKind,
  resourceName: string
): ResolvedOperation | null {
  const prefixes = new Set(
    [
      model.serviceTrait.arnNamespace,
      model.sigv4Name,
      model.serviceTrait.endpointPrefix,
    ].filter((p): p is string => p !== null)
  );

  const perms = schema.handlers[kind]?.permissions ?? [];
  const handlerOps: string[] = [];
  for (const perm of perms) {
    const [svc, action] = perm.split(':');
    if (svc !== undefined && action !== undefined && prefixes.has(svc)) {
      if (model.operations.has(action)) handlerOps.push(action);
    }
  }
  // Some services' IAM action prefix matches NONE of the service-trait names
  // (CloudWatch schemas use `cloudwatch:` while arnNamespace / sigv4 /
  // endpointPrefix are all `monitoring`), which silently discarded the whole
  // permission signal (VERIFICATION.md M5). Retry ignoring the prefix; an
  // action still only counts when it exists as an operation of THIS model,
  // so cross-service actions (iam:PassRole, s3:GetObject) cannot leak in.
  if (handlerOps.length === 0 && perms.length > 0) {
    for (const perm of perms) {
      const action = perm.split(':')[1];
      if (action !== undefined && model.operations.has(action)) handlerOps.push(action);
    }
  }

  const lowerResource = resourceName.toLowerCase();
  const pick = (cands: string[], requireResourceName: boolean): string | null => {
    // Pass 1: an operation NAMING the resource wins across all verbs
    // (SetTopicAttributes beats PutDataProtectionPolicy for AWS::SNS::Topic).
    for (const verb of VERB_PRIORITY[kind]) {
      const pool = cands.filter(
        (c) => c.startsWith(verb) && c.toLowerCase().includes(lowerResource)
      );
      if (pool.length === 0) continue;
      pool.sort((a, b) => a.length - b.length || a.localeCompare(b));
      return pool[0] as string;
    }
    if (requireResourceName) return null;
    // Pass 2 (handler-scoped candidates only): verb priority alone.
    for (const verb of VERB_PRIORITY[kind]) {
      const pool = cands.filter((c) => c.startsWith(verb));
      if (pool.length === 0) continue;
      pool.sort((a, b) => a.length - b.length || a.localeCompare(b));
      return pool[0] as string;
    }
    return null;
  };

  let source: OperationSource = 'handlers';
  let chosen = pick(handlerOps, false);
  let candidates = handlerOps;
  if (chosen === null) {
    // Fallback over the full operation set: the resource name must appear in
    // the operation name, otherwise any CreateFoo of the service would match.
    source = 'verb-heuristic';
    const all = Array.from(model.operations.keys());
    chosen = pick(all, true);
    candidates = all.filter(
      (c) =>
        c.toLowerCase().includes(lowerResource) &&
        VERB_PRIORITY[kind].some((v) => c.startsWith(v))
    );
  }
  if (chosen === null) return null;

  const opShape = model.shapes[model.operations.get(chosen) as string];
  const inputShape = opShape?.input?.target ?? 'smithy.api#Unit';
  return { kind, operationName: chosen, inputShape, source, candidates };
}

const SUB_OP_VERBS = ['Put', 'Update', 'Modify', 'Create', 'Tag'];
const SUB_OP_STRIP_SUFFIXES = ['configurations', 'configuration', 's'];

/**
 * Multi-op resources (the S3 idiom): a top-level CFn property the create
 * input does not carry usually maps onto its OWN Put- / Update-verb
 * operation (`CorsConfiguration` -> PutBucketCors). Resolved by verb +
 * normalized
 * name containment after stripping the `Configuration(s)` suffix.
 */
export function resolveSubOperation(
  model: SmithyModel,
  propName: string,
  resourceName: string
): { operationName: string; inputShape: string; candidates: string[] } | null {
  let needle = propName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const suffix of SUB_OP_STRIP_SUFFIXES) {
    if (needle.endsWith(suffix) && needle.length - suffix.length >= 3) {
      needle = needle.slice(0, needle.length - suffix.length);
      break;
    }
  }
  const resLower = resourceName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates: string[] = [];
  for (const opName of model.operations.keys()) {
    const verb = SUB_OP_VERBS.find((v) => opName.startsWith(v));
    if (verb === undefined) continue;
    const rest = opName.slice(verb.length).toLowerCase().replace(/[^a-z0-9]/g, '');
    // Anchored match only (VERIFICATION.md M4): bare `includes` matched
    // Athena `State` -> Create**PreparedSTATEment**. The needle must be the
    // op's object (optionally behind the resource name: PutBucketCors,
    // PutBucketTagging), not an arbitrary substring.
    if (rest.startsWith(needle) || rest.startsWith(resLower + needle)) {
      candidates.push(opName);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
  const chosen = candidates[0] as string;
  const opShape = model.shapes[model.operations.get(chosen) as string];
  const inputShape = opShape?.input?.target ?? 'smithy.api#Unit';
  return { operationName: chosen, inputShape, candidates };
}
