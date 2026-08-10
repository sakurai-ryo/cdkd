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
  // Coverage is split HONESTLY (VERIFICATION.md): `auto` counts only members
  // the generated code actually writes; candidates / collisions / skew /
  // type-incompatible are visible, never lumped into "matched".
  interface Tagged extends Finding {
    ops: Set<string>;
  }
  const caseDivergences = new Map<string, Tagged>();
  const renames = new Map<string, Tagged>();
  const unmatched = new Map<string, Tagged>();
  const incompatible = new Map<string, Tagged>();
  const collisions = new Map<string, Tagged>();
  const skews = new Map<string, Tagged>();
  const requiredUnfed = new Map<string, Set<string>>();

  const tag = (map: Map<string, Tagged>, path: string, m: Finding['member'], op: string): void => {
    const existing = map.get(path);
    if (existing !== undefined) existing.ops.add(op);
    else map.set(path, { path, member: m, ops: new Set([op]) });
  };

  interface WalkCounts {
    total: number;
    auto: number;
    candidates: number;
    collisionsN: number;
    skewN: number;
    unsupportedN: number;
    unmatchedN: number;
  }
  const walkOp = (rootId: string, opTag: string, pathPrefix: string): WalkCounts => {
    const visited = new Set<string>();
    const c: WalkCounts = {
      total: 0,
      auto: 0,
      candidates: 0,
      collisionsN: 0,
      skewN: 0,
      unsupportedN: 0,
      unmatchedN: 0,
    };
    const walk = (structId: string, path: string): void => {
      if (visited.has(structId)) return;
      visited.add(structId);
      const struct = spec.structs[structId] as StructMapping;
      for (const req of struct.sdkRequiredUnfed) {
        const key = `${path}${path === '' ? '' : '.'}<${struct.sdkShape}>.${req}`;
        const ops = requiredUnfed.get(key) ?? new Set<string>();
        ops.add(opTag);
        requiredUnfed.set(key, ops);
      }
      for (const m of struct.members) {
        const mPath = path === '' ? m.cfn : `${path}.${m.cfn}`;
        c.total += 1;
        if (m.sdk === null) {
          c.unmatchedN += 1;
          tag(unmatched, mPath, m, opTag);
        } else if (m.skew === true) {
          c.skewN += 1;
          tag(skews, mPath, m, opTag);
        } else if (m.match === 'collision') {
          c.collisionsN += 1;
          tag(collisions, mPath, m, opTag);
        } else if (m.match === 'rename-candidate') {
          c.candidates += 1;
          tag(renames, mPath, m, opTag);
        } else if (m.transform === 'unsupported') {
          c.unsupportedN += 1;
          if (m.notes.some((n) => n.startsWith('type-incompatible'))) {
            tag(incompatible, mPath, m, opTag);
          }
        } else {
          c.auto += 1;
          if (m.match === 'case' && !isStyleFlip(m.cfn, m.sdk as string)) {
            tag(caseDivergences, mPath, m, opTag);
          }
        }
        if (m.childId !== undefined) walk(m.childId, mPath);
      }
    };
    walk(rootId, pathPrefix);
    return c;
  };

  const coverageLine = (c: WalkCounts): string => {
    const parts = [`${c.auto}/${c.total} auto-emitted`];
    if (c.candidates > 0) parts.push(`${c.candidates} candidate(s) (report-only)`);
    if (c.collisionsN > 0) parts.push(`${c.collisionsN} collision(s)`);
    if (c.skewN > 0) parts.push(`${c.skewN} version-skew (not emitted)`);
    if (c.unsupportedN > 0) parts.push(`${c.unsupportedN} unsupported`);
    if (c.unmatchedN > 0) parts.push(`${c.unmatchedN} unmatched`);
    return parts.join(', ');
  };

  for (const kind of ['create', 'update', 'delete'] as const) {
    const op = spec.operations[kind];
    if (op === undefined) continue;
    const c = walkOp(op.rootId, kind, '');
    lines.push(`**${kind} coverage** (${op.operationName}): ${coverageLine(c)}.`);
  }
  lines.push('');

  const renderOps = (ops: Set<string>): string => {
    const all = ['create', 'update', 'delete'].filter((k) => spec.operations[k as 'create'] !== undefined);
    if (ops.size === all.length) return '';
    return ` [${Array.from(ops).join(', ')}]`;
  };

  // Sub-operation trees feed the SAME findings sections as the main ops —
  // they were previously excluded from every findings list, which hid
  // defect-table items in the JSON only (VERIFICATION.md report blind spot).
  const subOps = Object.entries(spec.subOperations);
  if (subOps.length > 0) {
    lines.push('### Per-property sub-operations (multi-op resource idiom)');
    lines.push('');
    lines.push('| CFn property | operation | inner coverage |');
    lines.push('|--------------|-----------|----------------|');
    for (const [prop, op] of subOps) {
      const c = walkOp(op.rootId, `sub-op:${op.operationName}`, '');
      lines.push(`| ${prop} | ${op.operationName} | ${coverageLine(c)} |`);
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
    'Rename candidates (NOT emitted — need human confirmation via override table)',
    Array.from(renames.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\` (${f.member.notes.join('; ')})${renderOps(f.ops)}`
    )
  );
  section(
    'Collisions: two CFn properties on one SDK member (losers NOT emitted)',
    Array.from(collisions.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\`: ${f.member.notes.join('; ')}${renderOps(f.ops)}`
    )
  );
  section(
    'Members absent from the installed SDK (version skew — NOT emitted)',
    Array.from(skews.values()).map(
      (f) => `\`${f.path}\` -> \`${f.member.sdk}\`${renderOps(f.ops)}`
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
