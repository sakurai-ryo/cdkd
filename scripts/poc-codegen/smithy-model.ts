/**
 * Smithy model loader for the PoC generator.
 *
 * Works against a local clone of https://github.com/aws/api-models-aws
 * (`models/<service>/service/<version>/<service>-<version>.json`, Smithy
 * JSON-AST). The load-bearing discovery key is the `aws.api#service` trait's
 * `cloudFormationName`: it links `AWS::<Service>::<Resource>` to the one
 * Smithy model whose SDK client the provider would use.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { TypeKind } from './types.ts';

export interface SmithyShape {
  type: string;
  members?: Record<string, SmithyMember>;
  member?: SmithyMember; // list/set element
  key?: SmithyMember;
  value?: SmithyMember;
  input?: { target: string };
  output?: { target: string };
  traits?: Record<string, unknown>;
}

export interface SmithyMember {
  target: string;
  traits?: Record<string, unknown>;
}

export interface SmithyModel {
  path: string;
  shapes: Record<string, SmithyShape>;
  namespace: string;
  serviceShapeId: string;
  serviceTrait: {
    sdkId: string;
    cloudFormationName: string | null;
    arnNamespace: string | null;
    endpointPrefix: string | null;
  };
  sigv4Name: string | null;
  /** Operation short name -> shape id. */
  operations: Map<string, string>;
}

/**
 * Locate the model file whose service trait carries the given
 * cloudFormationName. Shells out to grep for the scan (the models tree is
 * hundreds of MB; grep is orders of magnitude faster than a Node walk and
 * this is a PoC — a production generator would keep a committed index).
 */
export function findModelsByCloudFormationName(modelsDir: string, cfnName: string): string[] {
  const pattern = `"cloudFormationName"\\s*:\\s*"${cfnName}"`;
  let out = '';
  try {
    out = execFileSync(
      'grep',
      ['-rlE', '--include=*.json', pattern, modelsDir],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 1) out = '';
    else throw err;
  }
  const files = out.split('\n').filter((f) => f.trim().length > 0);
  if (files.length === 0) {
    throw new Error(`No Smithy model with cloudFormationName "${cfnName}" under ${modelsDir}`);
  }
  return files.sort();
}

/**
 * Disambiguate multiple models sharing one cloudFormationName (e.g. `lambda`
 * vs `lambda-core` both carry "Lambda"): score each model by how many of the
 * schema's handler-permission ACTION names it declares as operations — the
 * model that implements the CFn handlers is the one the provider needs.
 */
export function pickModelByHandlerActions(
  paths: string[],
  handlerActions: string[]
): { model: SmithyModel; scored: Array<{ path: string; score: number }> } {
  const scored: Array<{ path: string; model: SmithyModel; score: number }> = [];
  for (const path of paths) {
    const model = loadSmithyModel(path);
    let score = 0;
    for (const action of handlerActions) {
      if (model.operations.has(action)) score += 1;
    }
    scored.push({ path, model, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const best = scored[0] as (typeof scored)[number];
  return { model: best.model, scored: scored.map(({ path, score }) => ({ path, score })) };
}

export function loadSmithyModel(path: string): SmithyModel {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { shapes: Record<string, SmithyShape> };
  const shapes = raw.shapes;
  let serviceShapeId: string | null = null;
  for (const [id, shape] of Object.entries(shapes)) {
    if (shape.type === 'service') {
      serviceShapeId = id;
      break;
    }
  }
  if (serviceShapeId === null) throw new Error(`No service shape in ${path}`);
  const service = shapes[serviceShapeId] as SmithyShape;
  const traits = service.traits ?? {};
  const svcTrait = (traits['aws.api#service'] ?? {}) as Record<string, unknown>;
  const sigv4 = (traits['aws.auth#sigv4'] ?? {}) as Record<string, unknown>;
  const namespace = serviceShapeId.split('#')[0] as string;

  const operations = new Map<string, string>();
  for (const [id, shape] of Object.entries(shapes)) {
    if (shape.type === 'operation') {
      operations.set(shortName(id), id);
    }
  }

  return {
    path,
    shapes,
    namespace,
    serviceShapeId,
    serviceTrait: {
      sdkId: String(svcTrait['sdkId'] ?? ''),
      cloudFormationName: (svcTrait['cloudFormationName'] as string) ?? null,
      arnNamespace: (svcTrait['arnNamespace'] as string) ?? null,
      endpointPrefix: (svcTrait['endpointPrefix'] as string) ?? null,
    },
    sigv4Name: (sigv4['name'] as string) ?? null,
    operations,
  };
}

export function shortName(shapeId: string): string {
  const hash = shapeId.indexOf('#');
  return hash >= 0 ? shapeId.slice(hash + 1) : shapeId;
}

const PRELUDE_KINDS: Record<string, TypeKind> = {
  'smithy.api#String': 'string',
  'smithy.api#Byte': 'number',
  'smithy.api#Short': 'number',
  'smithy.api#Integer': 'number',
  'smithy.api#Long': 'number',
  'smithy.api#Float': 'number',
  'smithy.api#Double': 'number',
  'smithy.api#BigInteger': 'number',
  'smithy.api#BigDecimal': 'number',
  'smithy.api#PrimitiveInteger': 'number',
  'smithy.api#PrimitiveLong': 'number',
  'smithy.api#PrimitiveShort': 'number',
  'smithy.api#PrimitiveByte': 'number',
  'smithy.api#PrimitiveFloat': 'number',
  'smithy.api#PrimitiveDouble': 'number',
  'smithy.api#Boolean': 'boolean',
  'smithy.api#PrimitiveBoolean': 'boolean',
  'smithy.api#Timestamp': 'timestamp',
  'smithy.api#Blob': 'blob',
  'smithy.api#Document': 'document',
};

/** Resolve a member target to its defining shape (null for prelude targets). */
export function resolveShape(model: SmithyModel, target: string): SmithyShape | null {
  return model.shapes[target] ?? null;
}

/** Terminal kind of a member target. */
export function smithyKindOf(model: SmithyModel, target: string): TypeKind {
  const prelude = PRELUDE_KINDS[target];
  if (prelude !== undefined) return prelude;
  const shape = model.shapes[target];
  if (shape === undefined) return 'ambiguous';
  switch (shape.type) {
    case 'string':
    case 'enum':
      return 'string';
    case 'byte':
    case 'short':
    case 'integer':
    case 'long':
    case 'float':
    case 'double':
    case 'bigInteger':
    case 'bigDecimal':
    case 'intEnum':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'timestamp':
      return 'timestamp';
    case 'blob':
      return 'blob';
    case 'structure':
      return 'structure';
    case 'list':
    case 'set':
      return 'list';
    case 'map':
      return 'map';
    case 'union':
      return 'union';
    case 'document':
      return 'document';
    default:
      return 'ambiguous';
  }
}

export function structureMembers(model: SmithyModel, target: string): Record<string, SmithyMember> {
  const shape = model.shapes[target];
  if (shape === undefined || shape.type !== 'structure') return {};
  return shape.members ?? {};
}

export function isRequired(member: SmithyMember): boolean {
  return member.traits !== undefined && member.traits['smithy.api#required'] !== undefined;
}

/** Element target of a list/set shape. */
export function listElementTarget(model: SmithyModel, target: string): string | null {
  const shape = model.shapes[target];
  if (shape === undefined || (shape.type !== 'list' && shape.type !== 'set')) return null;
  return shape.member?.target ?? null;
}

/** Value target of a map shape. */
export function mapValueTarget(model: SmithyModel, target: string): string | null {
  const shape = model.shapes[target];
  if (shape === undefined || shape.type !== 'map') return null;
  return shape.value?.target ?? null;
}
