/**
 * CFn registry schema loader for the PoC generator.
 *
 * Reads the FULL CloudFormation registry schema (the public
 * `CloudformationSchema.zip` layout: one `aws-<service>-<resource>.json` per
 * type) — NOT the derived fixtures under tests/fixtures/cfn-schemas/, which
 * deliberately drop `definitions` / `handlers` / per-property types.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TypeKind } from './types.ts';

export interface CfnSchema {
  typeName: string;
  properties: Record<string, unknown>;
  definitions: Record<string, unknown>;
  readOnlyProperties: string[];
  createOnlyProperties: string[];
  writeOnlyProperties: string[];
  primaryIdentifier: string[];
  handlers: Record<string, { permissions?: string[] }>;
  raw: Record<string, unknown>;
}

export function cfnSchemaFilename(resourceType: string): string {
  return resourceType.toLowerCase().replace(/::/g, '-') + '.json';
}

export function loadCfnSchema(schemaDir: string, resourceType: string): CfnSchema {
  const path = join(schemaDir, cfnSchemaFilename(resourceType));
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const stripPointer = (p: unknown): string => String(p).replace(/^\/properties\//, '');
  return {
    typeName: String(raw['typeName']),
    properties: (raw['properties'] as Record<string, unknown>) ?? {},
    definitions: (raw['definitions'] as Record<string, unknown>) ?? {},
    readOnlyProperties: ((raw['readOnlyProperties'] as unknown[]) ?? []).map(stripPointer),
    createOnlyProperties: ((raw['createOnlyProperties'] as unknown[]) ?? []).map(stripPointer),
    writeOnlyProperties: ((raw['writeOnlyProperties'] as unknown[]) ?? []).map(stripPointer),
    primaryIdentifier: ((raw['primaryIdentifier'] as unknown[]) ?? []).map(stripPointer),
    handlers: (raw['handlers'] as CfnSchema['handlers']) ?? {},
    raw,
  };
}

export interface CfnNode {
  /** Resolved schema node (after following $ref). */
  node: Record<string, unknown>;
  /** Definition name when the node came from `#/definitions/<name>`. */
  defName: string | null;
}

/** Follow `$ref` chains into `definitions` (registry schemas only use local refs). */
export function resolveCfnNode(schema: CfnSchema, node: unknown): CfnNode {
  let current = node as Record<string, unknown>;
  let defName: string | null = null;
  const seen = new Set<string>();
  while (current !== null && typeof current === 'object' && typeof current['$ref'] === 'string') {
    const ref = current['$ref'] as string;
    if (seen.has(ref)) break;
    seen.add(ref);
    const m = /^#\/definitions\/([^/]+)$/.exec(ref);
    if (!m) break;
    defName = m[1] as string;
    const target = schema.definitions[defName];
    if (target === undefined) break;
    current = target as Record<string, unknown>;
  }
  return { node: current ?? {}, defName };
}

/**
 * Classify a resolved CFn schema node into a terminal kind.
 *
 * Registry schemas model maps as `type: object` with `patternProperties` /
 * free-form `additionalProperties` and no `properties`; `oneOf`/`anyOf`
 * variants are reported ambiguous so the matcher can flag them instead of
 * guessing.
 */
export function cfnKindOf(schema: CfnSchema, resolved: CfnNode): TypeKind {
  const node = resolved.node;
  const type = node['type'];
  if (type === 'string') return 'string';
  if (type === 'integer' || type === 'number') return 'number';
  if (type === 'boolean') return 'boolean';
  if (type === 'array') return 'list';
  if (type === 'object' || type === undefined) {
    if (node['properties'] !== undefined) return 'structure';
    if (node['patternProperties'] !== undefined) return 'map';
    if (node['additionalProperties'] !== undefined && node['properties'] === undefined) {
      return 'map';
    }
    if (node['oneOf'] !== undefined || node['anyOf'] !== undefined) return 'ambiguous';
    // Bare `{}` / `{type: object}` with no member info: free-form JSON.
    return 'document';
  }
  if (Array.isArray(type)) return 'ambiguous';
  return 'ambiguous';
}

/** Child properties of a structure-kind node (empty for other kinds). */
export function cfnProperties(resolved: CfnNode): Record<string, unknown> {
  return (resolved.node['properties'] as Record<string, unknown>) ?? {};
}

/** Items schema node of a list-kind node. */
export function cfnItems(resolved: CfnNode): unknown {
  return resolved.node['items'] ?? {};
}
