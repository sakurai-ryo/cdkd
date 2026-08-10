/**
 * Markdown coverage / divergence report over a ResourceMappingSpec.
 *
 * The report is the human-review artifact: everything the matcher could not
 * decide with high confidence (rename candidates, unmatched CFn paths,
 * type-incompatible same-name members, unfed required SDK members) surfaces
 * here as an explicit list a reviewer works through — the generator's
 * equivalent of the nested-key critic's flagged buckets.
 */
import type { MemberMapping, ResourceMappingSpec, StructMapping } from './types.ts';

interface Finding {
  path: string;
  member: MemberMapping;
}

function isStyleFlip(cfn: string, sdk: string): boolean {
  return cfn.length > 0 && cfn.charAt(0).toLowerCase() + cfn.slice(1) === sdk;
}

export function renderReport(spec: ResourceMappingSpec): string {
  const lines: string[] = [];
  lines.push(`## ${spec.resourceType}`);
  lines.push('');
  lines.push(
    `Smithy model: \`${spec.service.modelPath.split('/').slice(-1)[0]}\` ` +
      `(sdkId: ${spec.service.sdkId}, cloudFormationName: ${spec.service.cloudFormationName})`
  );
  lines.push('');

  lines.push('| op | operation | source | other candidates |');
  lines.push('|----|-----------|--------|------------------|');
  for (const kind of ['create', 'update', 'delete'] as const) {
    const op = spec.operations[kind];
    if (op === undefined) {
      lines.push(`| ${kind} | (unresolved) | — | — |`);
      continue;
    }
    const others = spec.structs[op.rootId] !== undefined ? opCandidates(spec, kind) : [];
    lines.push(`| ${kind} | ${op.operationName} | ${op.source} | ${others.join(', ') || '—'} |`);
  }
  lines.push('');

  // Per-op walks: a CFn property unmatched under delete (identifier-only
  // input) is expected, not a finding — so coverage and findings are
  // collected per op and findings are tagged with the ops they appear in.
  interface Tagged extends Finding {
    ops: Set<string>;
  }
  const caseDivergences = new Map<string, Tagged>();
  const renames = new Map<string, Tagged>();
  const unmatched = new Map<string, Tagged>();
  const incompatible = new Map<string, Tagged>();
  const requiredUnfed = new Map<string, Set<string>>();

  const tag = (map: Map<string, Tagged>, path: string, m: Finding['member'], op: string): void => {
    const existing = map.get(path);
    if (existing !== undefined) existing.ops.add(op);
    else map.set(path, { path, member: m, ops: new Set([op]) });
  };

  for (const kind of ['create', 'update', 'delete'] as const) {
    const op = spec.operations[kind];
    if (op === undefined) continue;
    const visited = new Set<string>();
    let total = 0;
    let matchedCount = 0;
    const walk = (structId: string, path: string): void => {
      if (visited.has(structId)) return;
      visited.add(structId);
      const struct = spec.structs[structId] as StructMapping;
      for (const req of struct.sdkRequiredUnfed) {
        const key = `${path}${path === '' ? '' : '.'}<${struct.sdkShape}>.${req}`;
        const ops = requiredUnfed.get(key) ?? new Set<string>();
        ops.add(kind);
        requiredUnfed.set(key, ops);
      }
      for (const m of struct.members) {
        const mPath = path === '' ? m.cfn : `${path}.${m.cfn}`;
        total += 1;
        if (m.sdk !== null) matchedCount += 1;
        if (m.sdk === null) tag(unmatched, mPath, m, kind);
        else if (
          m.transform === 'unsupported' &&
          m.notes.some((n) => n.startsWith('type-incompatible'))
        ) {
          tag(incompatible, mPath, m, kind);
        } else if (m.match === 'case' && !isStyleFlip(m.cfn, m.sdk)) {
          tag(caseDivergences, mPath, m, kind);
        } else if (m.match === 'rename-candidate') {
          tag(renames, mPath, m, kind);
        }
        if (m.childId !== undefined) walk(m.childId, mPath);
      }
    };
    walk(op.rootId, '');
    lines.push(
      `**${kind} coverage** (${op.operationName}): ${matchedCount}/${total} CFn paths matched ` +
        `(${((matchedCount / Math.max(1, total)) * 100).toFixed(1)}%).`
    );
  }
  lines.push('');

  const renderOps = (ops: Set<string>): string => {
    const all = ['create', 'update', 'delete'].filter((k) => spec.operations[k as 'create'] !== undefined);
    if (ops.size === all.length) return '';
    return ` [${Array.from(ops).join(', ')}]`;
  };

  const subOps = Object.entries(spec.subOperations);
  if (subOps.length > 0) {
    lines.push('### Per-property sub-operations (multi-op resource idiom)');
    lines.push('');
    lines.push('| CFn property | operation | inner coverage |');
    lines.push('|--------------|-----------|----------------|');
    for (const [prop, op] of subOps) {
      let total = 0;
      let matchedCount = 0;
      const seen = new Set<string>();
      const count = (structId: string): void => {
        if (seen.has(structId)) return;
        seen.add(structId);
        const struct = spec.structs[structId] as StructMapping;
        for (const m of struct.members) {
          total += 1;
          if (m.sdk !== null) matchedCount += 1;
          if (m.childId !== undefined) count(m.childId);
        }
      };
      count(op.rootId);
      lines.push(
        `| ${prop} | ${op.operationName} | ${matchedCount}/${total} ` +
          `(${((matchedCount / Math.max(1, total)) * 100).toFixed(0)}%) |`
      );
    }
    lines.push('');
  }

  const createOnly = new Set(spec.createOnlyProperties.map((p) => p.split('/')[0] as string));

  const section = (title: string, rows: string[]): void => {
    if (rows.length === 0) return;
    lines.push(`### ${title} (${rows.length})`);
    lines.push('');
    for (const row of rows) lines.push(`- ${row}`);
    lines.push('');
  };

  section(
    'Case divergences auto-resolved (beyond Pascal->camel style flip)',
    Array.from(caseDivergences.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\`${renderOps(f.ops)}`
    )
  );
  section(
    'Rename candidates (need human confirmation)',
    Array.from(renames.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\` (${f.member.notes.join('; ')})${renderOps(f.ops)}`
    )
  );
  section(
    'Type-incompatible same-name members (manual mapping)',
    Array.from(incompatible.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\`: ${f.member.notes.join('; ')}${renderOps(f.ops)}`
    )
  );
  section(
    'Unmatched CFn paths (CFn-only field, wrong op, or silent-drop risk)',
    Array.from(unmatched.values()).map(
      (f) =>
        `\`${f.path}\` (${f.member.cfnKind})` +
        (createOnly.has(f.path) ? ' [createOnly]' : '') +
        renderOps(f.ops)
    )
  );
  section(
    'SDK required members with no CFn source (synthesize in glue code)',
    Array.from(requiredUnfed.entries()).map(
      ([key, ops]) => `\`${key}\`${renderOps(ops)}`
    )
  );

  return lines.join('\n');
}

function opCandidates(spec: ResourceMappingSpec, kind: 'create' | 'update' | 'delete'): string[] {
  const op = spec.operations[kind];
  if (op === undefined) return [];
  const meta = (op as unknown as { candidates?: string[] }).candidates ?? [];
  return meta.filter((c) => c !== op.operationName).slice(0, 6);
}
