/**
 * PoC entry point: CFn registry schema + Smithy model -> mapping spec +
 * generated TS mapper + divergence report, per resource type.
 *
 * Usage:
 *   node scripts/poc-codegen/main.ts \
 *     --cfn-schema-dir=<dir with aws-<svc>-<res>.json registry schemas> \
 *     --models-dir=<api-models-aws clone>/models \
 *     --out=<output dir> \
 *     AWS::ECS::Service AWS::CloudFront::Distribution ...
 *
 * The CFn schema dir is the unpacked public CloudformationSchema.zip
 * (https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip)
 * — the FULL schemas with `definitions` + `handlers`, not the derived
 * fixtures under tests/fixtures/cfn-schemas/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCfnSchema } from './cfn-schema.ts';
import { emitMapper } from './emit-ts.ts';
import { clientPackageInstalled, loadInstalledSdkIndex } from './installed-sdk.ts';
import { Matcher, computeStats } from './matcher.ts';
import { type OpKind, resolveOperation, resolveSubOperation } from './operations.ts';
import { renderReport } from './report.ts';
import { findModelsByCloudFormationName, pickModelByHandlerActions } from './smithy-model.ts';
import type { OperationMapping, ResourceMappingSpec } from './types.ts';

function parseArgs(argv: string[]): {
  cfnSchemaDir: string;
  modelsDir: string;
  out: string;
  nodeModules: string;
  types: string[];
} {
  let cfnSchemaDir: string | null = null;
  let modelsDir: string | null = null;
  let out: string | null = null;
  // The repo's own node_modules is the default third input (VERIFICATION.md
  // C3): the pinned @aws-sdk clients there are what the runtime serializes
  // with, so they — not the HEAD Smithy models — decide what is writable.
  let nodeModules = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules');
  const types: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith('--cfn-schema-dir=')) cfnSchemaDir = arg.slice('--cfn-schema-dir='.length);
    else if (arg.startsWith('--models-dir=')) modelsDir = arg.slice('--models-dir='.length);
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    else if (arg.startsWith('--node-modules=')) nodeModules = arg.slice('--node-modules='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    else types.push(arg);
  }
  if (cfnSchemaDir === null || modelsDir === null || out === null || types.length === 0) {
    throw new Error(
      'Usage: node scripts/poc-codegen/main.ts --cfn-schema-dir=<dir> --models-dir=<dir> --out=<dir> [--node-modules=<dir>] <ResourceType>...'
    );
  }
  return { cfnSchemaDir, modelsDir, out, nodeModules, types };
}

function sanitize(resourceType: string): string {
  return resourceType.replace(/::/g, '-');
}

function main(): void {
  const { cfnSchemaDir, modelsDir, out, nodeModules, types } = parseArgs(process.argv.slice(2));
  mkdirSync(out, { recursive: true });
  const reportSections: string[] = [
    '# PoC codegen report: CFn registry schema + Smithy model -> SDK input mappers',
    '',
    `Generated over ${types.length} resource type(s).`,
    '',
  ];

  for (const resourceType of types) {
    console.log(`\n=== ${resourceType} ===`);
    const schema = loadCfnSchema(cfnSchemaDir, resourceType);
    const [, cfnService, cfnResource] = resourceType.split('::') as [string, string, string];
    const modelPaths = findModelsByCloudFormationName(modelsDir, cfnService);
    const handlerActions = Object.values(schema.handlers)
      .flatMap((h) => h.permissions ?? [])
      .map((p) => p.split(':')[1] as string)
      .filter((a) => a !== undefined);
    const { model, scored } = pickModelByHandlerActions(modelPaths, handlerActions, (m) =>
      clientPackageInstalled(nodeModules, m.serviceTrait.sdkId)
    );
    const modelPath = model.path;
    console.log(`model: ${modelPath.split('/').slice(-1)[0]} (sdkId: ${model.serviceTrait.sdkId})`);
    if (scored.length > 1) {
      console.log(
        `  (disambiguated ${scored.length} models by handler-action overlap: ` +
          scored.map((s) => `${s.path.split('/').slice(-1)[0]}=${s.score}`).join(', ') +
          ')'
      );
    }

    const matcher = new Matcher(schema, model);
    const operations: ResourceMappingSpec['operations'] = {};
    for (const kind of ['create', 'update', 'delete'] as OpKind[]) {
      const resolved = resolveOperation(schema, model, kind, cfnResource);
      if (resolved === null) {
        console.log(`  ${kind}: UNRESOLVED`);
        continue;
      }
      const rootId =
        resolved.inputShape === 'smithy.api#Unit'
          ? null
          : matcher.matchOperationInput(resolved.inputShape, resolved.operationName);
      console.log(
        `  ${kind}: ${resolved.operationName} (${resolved.source}, ` +
          `${resolved.candidates.length} candidate(s))`
      );
      if (rootId === null) continue;
      const op: OperationMapping & { candidates: string[] } = {
        operationName: resolved.operationName,
        inputShape: resolved.inputShape,
        source: resolved.source,
        rootId,
        candidates: resolved.candidates,
      };
      operations[kind] = op;
    }

    // Multi-op resources: any top-level property the CREATE input does not
    // carry gets a per-property sub-operation lookup (the S3 Put* idiom).
    // Unconfirmed rename-candidates are included too: `BucketEncryption`'s
    // false fuzzy hit previously masked the existence of PutBucketEncryption
    // entirely (VERIFICATION.md, S3 16-of-17 finding).
    const subOperations: ResourceMappingSpec['subOperations'] = {};
    const createOp = operations.create;
    if (createOp !== undefined) {
      const createRoot = matcher.structs[createOp.rootId];
      const subOpProps = new Set(createRoot?.unmatchedCfn ?? []);
      for (const m of createRoot?.members ?? []) {
        if (m.match === 'rename-candidate' || m.match === 'collision') subOpProps.add(m.cfn);
      }
      for (const prop of subOpProps) {
        const sub = resolveSubOperation(model, prop, cfnResource);
        if (sub === null || sub.inputShape === 'smithy.api#Unit') continue;
        const rootId = matcher.matchOperationInput(sub.inputShape, sub.operationName, [prop]);
        subOperations[prop] = {
          operationName: sub.operationName,
          inputShape: sub.inputShape,
          source: 'verb-heuristic',
          rootId,
          candidates: sub.candidates,
        };
        console.log(`  sub-op: ${prop} -> ${sub.operationName}`);
      }
    }

    // Installed-SDK reconciliation (VERIFICATION.md C3): flag every
    // would-be-emitted member whose SDK spelling the pinned client does not
    // declare — the serializer would silently drop it at runtime.
    const sdkIndex = loadInstalledSdkIndex(nodeModules, model.serviceTrait.sdkId);
    let skewCount = 0;
    if (sdkIndex.members === null) {
      console.log(`  WARNING: @aws-sdk/${sdkIndex.pkg} not installed — version-skew check SKIPPED`);
    } else {
      for (const struct of Object.values(matcher.structs)) {
        for (const m of struct.members) {
          if (
            m.sdk !== null &&
            (m.match === 'exact' || m.match === 'case') &&
            m.transform !== 'unsupported' &&
            !sdkIndex.members.has(m.sdk)
          ) {
            m.skew = true;
            m.notes.push(`absent from installed @aws-sdk/${sdkIndex.pkg}`);
            skewCount += 1;
          }
        }
      }
      if (skewCount > 0) {
        console.log(`  version-skew: ${skewCount} member(s) absent from installed @aws-sdk/${sdkIndex.pkg}`);
      }
    }

    const spec: ResourceMappingSpec = {
      resourceType,
      subOperations,
      installedSdk: { pkg: sdkIndex.pkg, checked: sdkIndex.members !== null },
      service: {
        modelPath,
        sdkId: model.serviceTrait.sdkId,
        cloudFormationName: model.serviceTrait.cloudFormationName ?? cfnService,
        arnNamespace: model.serviceTrait.arnNamespace,
        namespace: model.namespace,
      },
      operations,
      structs: matcher.structs,
      readOnlyProperties: schema.readOnlyProperties,
      createOnlyProperties: schema.createOnlyProperties,
      stats: computeStats(matcher.structs),
    };

    const base = join(out, sanitize(resourceType));
    writeFileSync(`${base}.mapping.json`, JSON.stringify(spec, null, 2));
    const mapper = emitMapper(spec, {
      create: 'buildCreateInput',
      update: 'buildUpdateInput',
      delete: 'buildDeleteInput',
    });
    writeFileSync(`${base}.mapper.ts`, mapper);
    reportSections.push(renderReport(spec));
    reportSections.push('');

    const s = spec.stats;
    console.log(
      `  paths: ${s.totalCfnPaths}, exact: ${s.matchedExact}, case: ${s.matchedCase}, ` +
        `rename-cand: ${s.renameCandidates}, unmatched: ${s.unmatched}`
    );
  }

  writeFileSync(join(out, 'report.md'), reportSections.join('\n'));
  console.log(`\nWrote ${join(out, 'report.md')}`);
}

main();
