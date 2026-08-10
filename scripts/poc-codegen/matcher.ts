/**
 * Core structural matcher: walks the CFn registry schema property tree and
 * the Smithy operation-input shape tree in parallel, producing StructMapping
 * records (see types.ts).
 *
 * Matching tiers per member name: exact -> case-insensitive -> normalized
 * substring containment (rename candidate). Transform selection is driven by
 * the (cfnKind, sdkKind) pair, with the two wrapper idioms (CloudFront
 * `{Quantity, Items}`, S3 single-list-member) detected structurally.
 */
import {
  type CfnNode,
  type CfnSchema,
  cfnItems,
  cfnKindOf,
  cfnProperties,
  resolveCfnNode,
} from './cfn-schema.ts';
import {
  type SmithyMember,
  type SmithyModel,
  isRequired,
  listElementTarget,
  mapValueTarget,
  shortName,
  smithyKindOf,
  structureMembers,
} from './smithy-model.ts';
import type {
  MemberMapping,
  SpecStats,
  StructMapping,
  Transform,
  TypeKind,
} from './types.ts';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Transforms a fuzzy rename-candidate may carry. Candidates are never
 * emitted, so this gate bounds REVIEW NOISE, not runtime risk: scalar
 * coercions and json-string on a fuzzy name share a spelling by accident,
 * not a meaning (`GenerateSecretString -> SecretString` — VERIFICATION.md
 * C2), while the wrap shapes stay allowed because real historical renames
 * carry them (`OriginCustomHeaders -> CustomHeaders` is a
 * wrap-quantity-items).
 */
const CANDIDATE_SAFE_TRANSFORMS: ReadonlySet<string> = new Set([
  'direct',
  'structure',
  'list',
  'map',
  'document',
  'wrap-quantity-items',
  'wrap-single-list-member',
]);

interface TransformResult {
  transform: Transform;
  childId?: string;
  wrapper?: { itemsMember: string; quantityMember: string | null };
  notes: string[];
}

export class Matcher {
  readonly structs: Record<string, StructMapping> = {};
  private memo = new Map<string, string>();
  private readonly schema: CfnSchema;
  private readonly model: SmithyModel;

  // Plain field assignment (not TS parameter properties): Node's strip-only
  // TS mode cannot run parameter properties.
  constructor(schema: CfnSchema, model: SmithyModel) {
    this.schema = schema;
    this.model = model;
  }

  /**
   * Match the resource's top-level writable properties onto an operation
   * input structure. Returns the root StructMapping id.
   */
  matchOperationInput(inputTarget: string, opName: string, onlyProps?: string[]): string {
    // Only a FULLY read-only top-level property is excluded. A nested
    // readOnly path (`KubernetesNetworkConfig/ServiceIpv6Cidr`) must NOT
    // exclude its writable parent — truncating to the first segment silently
    // dropped whole top-level properties on 84 types (VERIFICATION.md C1).
    const readOnly = new Set(this.schema.readOnlyProperties.filter((p) => !p.includes('/')));
    const props: Record<string, unknown> = {};
    for (const [name, node] of Object.entries(this.schema.properties)) {
      if (readOnly.has(name)) continue;
      if (onlyProps !== undefined && !onlyProps.includes(name)) continue;
      props[name] = node;
    }
    const pseudo: CfnNode = { node: { type: 'object', properties: props }, defName: null };
    return this.matchStructure(pseudo, `#top(${opName})`, inputTarget);
  }

  private matchStructure(cfnNode: CfnNode, cfnKey: string, sdkTarget: string): string {
    const id = `${cfnKey}|${shortName(sdkTarget)}`;
    const memoized = this.memo.get(id);
    if (memoized !== undefined) return memoized;
    this.memo.set(id, id);

    const struct: StructMapping = {
      id,
      cfnDef: cfnKey,
      sdkShape: shortName(sdkTarget),
      members: [],
      unmatchedCfn: [],
      sdkRequiredUnfed: [],
    };
    this.structs[id] = struct;

    const sdkMembers = structureMembers(this.model, sdkTarget);
    const props = cfnProperties(cfnNode);

    for (const cfnName of Object.keys(props).sort()) {
      const propResolved = resolveCfnNode(this.schema, props[cfnName]);
      const mapping = this.matchMember(cfnName, propResolved, sdkMembers, cfnKey);
      struct.members.push(mapping);
    }

    // Collision resolution (VERIFICATION.md C2): two CFn properties resolving
    // to the SAME SDK member would be emitted as two writes with
    // alphabetically-last-wins (`SourceDBInstanceIdentifier` overwriting the
    // exact-tier `DBInstanceIdentifier` on the RDS delete input). Keep the
    // best tier per SDK member; demote every loser to `collision`.
    const TIER_RANK: Record<string, number> = { exact: 0, case: 1, 'rename-candidate': 2 };
    const bySdk = new Map<string, MemberMapping[]>();
    for (const m of struct.members) {
      if (m.sdk === null) continue;
      const list = bySdk.get(m.sdk) ?? [];
      list.push(m);
      bySdk.set(m.sdk, list);
    }
    for (const [sdkName, list] of bySdk) {
      if (list.length < 2) continue;
      list.sort(
        (a, b) => (TIER_RANK[a.match] ?? 9) - (TIER_RANK[b.match] ?? 9) || a.cfn.localeCompare(b.cfn)
      );
      const winner = list[0] as MemberMapping;
      for (const loser of list.slice(1)) {
        loser.match = 'collision';
        loser.transform = 'unsupported';
        loser.notes.push(
          `collides with '${winner.cfn}' on SDK member '${sdkName}' — NOT emitted; needs an override-table decision`
        );
      }
    }

    const matchedSdk = new Set<string>();
    for (const m of struct.members) {
      if (m.sdk !== null && m.match !== 'collision') matchedSdk.add(m.sdk);
      if (m.sdk === null) struct.unmatchedCfn.push(m.cfn);
    }
    for (const [sdkName, member] of Object.entries(sdkMembers)) {
      if (isRequired(member) && !matchedSdk.has(sdkName)) {
        struct.sdkRequiredUnfed.push(sdkName);
      }
    }
    return id;
  }

  private matchMember(
    cfnName: string,
    cfnResolved: CfnNode,
    sdkMembers: Record<string, SmithyMember>,
    parentKey: string
  ): MemberMapping {
    const cfnKind = cfnKindOf(this.schema, cfnResolved);
    const childKey = cfnResolved.defName ?? `${parentKey}.${cfnName}`;

    const tryMember = (
      sdkName: string,
      tier: MemberMapping['match']
    ): MemberMapping | null => {
      const member = sdkMembers[sdkName] as SmithyMember;
      const sdkKind = smithyKindOf(this.model, member.target);
      const result = this.transformFor(cfnResolved, cfnKind, childKey, member.target, sdkKind);
      if (result === null) return null;
      return {
        cfn: cfnName,
        sdk: sdkName,
        match: tier,
        transform: result.transform,
        cfnKind,
        sdkKind,
        sdkRequired: isRequired(member),
        childId: result.childId,
        wrapper: result.wrapper,
        notes: result.notes,
      };
    };

    // Tier 1: exact spelling.
    if (sdkMembers[cfnName] !== undefined) {
      const m = tryMember(cfnName, 'exact');
      if (m !== null) return m;
    }
    // Tier 2: case-insensitive.
    const lower = cfnName.toLowerCase();
    for (const sdkName of Object.keys(sdkMembers)) {
      if (sdkName.toLowerCase() === lower && sdkName !== cfnName) {
        const m = tryMember(sdkName, 'case');
        if (m !== null) return m;
      }
    }
    // Tier 3: normalized substring containment OR common-prefix ratio
    // (catches plural/singular renames like PlacementStrategies ->
    // placementStrategy). Candidates are REPORT-ONLY (never emitted), and
    // two gates bound the noise (VERIFICATION.md C2): a containment score
    // floor (0.22-0.26 junk like `Mode -> endpointAccessMode` observed
    // without it), and a KIND-PRESERVATION gate — a fuzzy name hit that also
    // needs a kind-changing transform (json-string, to-string, wrap-*) is
    // near-certainly wrong (`GenerateSecretString -> SecretString` would
    // have stored the generator CONFIG as the secret's value).
    const norm = normalize(cfnName);
    let best: { name: string; score: number } | null = null;
    for (const sdkName of Object.keys(sdkMembers)) {
      const sn = normalize(sdkName);
      if (Math.min(sn.length, norm.length) < 4) continue;
      let score = 0;
      if (sn.includes(norm) || norm.includes(sn)) {
        const ratio = Math.min(sn.length, norm.length) / Math.max(sn.length, norm.length);
        if (ratio >= 0.3) score = ratio;
      }
      let prefix = 0;
      const cap = Math.min(sn.length, norm.length);
      while (prefix < cap && sn.charAt(prefix) === norm.charAt(prefix)) prefix += 1;
      const prefixRatio = prefix / Math.max(sn.length, norm.length);
      if (prefix >= 6 && prefixRatio >= 0.72) score = Math.max(score, prefixRatio);
      if (score === 0) continue;
      if (best === null || score > best.score) best = { name: sdkName, score };
    }
    if (best !== null) {
      const m = tryMember(best.name, 'rename-candidate');
      if (m !== null && CANDIDATE_SAFE_TRANSFORMS.has(m.transform)) {
        m.notes.push(`fuzzy-matched to "${best.name}" (overlap ${best.score.toFixed(2)})`);
        return m;
      }
    }
    // Exact/case name hit with incompatible types is itself a finding — retry
    // exact/case WITHOUT the compatibility gate so it stays visible as
    // `unsupported` rather than dissolving into `unmatched`.
    for (const sdkName of Object.keys(sdkMembers)) {
      if (sdkName.toLowerCase() === lower) {
        const member = sdkMembers[sdkName] as SmithyMember;
        const sdkKind = smithyKindOf(this.model, member.target);
        return {
          cfn: cfnName,
          sdk: sdkName,
          match: sdkName === cfnName ? 'exact' : 'case',
          transform: 'unsupported',
          cfnKind,
          sdkKind,
          sdkRequired: isRequired(member),
          notes: [`type-incompatible: CFn ${cfnKind} vs SDK ${sdkKind}`],
        };
      }
    }
    return {
      cfn: cfnName,
      sdk: null,
      match: 'unmatched',
      transform: 'unsupported',
      cfnKind,
      sdkKind: null,
      sdkRequired: false,
      notes: [],
    };
  }

  /**
   * Decide the value transform for a (cfnKind, sdkKind) pair. Returns null
   * when the pair is fundamentally incompatible (used to reject fuzzy
   * rename candidates that merely share spelling).
   */
  private transformFor(
    cfnResolved: CfnNode,
    cfnKind: TypeKind,
    childKey: string,
    sdkTarget: string,
    sdkKind: TypeKind
  ): TransformResult | null {
    if (sdkKind === 'union') return { transform: 'unsupported', notes: ['SDK union member'] };
    if (sdkKind === 'document') return { transform: 'document', notes: [] };
    if (cfnKind === 'ambiguous' || sdkKind === 'ambiguous') {
      return { transform: 'unsupported', notes: ['ambiguous schema (oneOf/anyOf or unknown)'] };
    }

    if (cfnKind === 'structure' && sdkKind === 'structure') {
      const childId = this.matchStructure(cfnResolved, childKey, sdkTarget);
      return { transform: 'structure', childId, notes: [] };
    }

    if (cfnKind === 'list' && sdkKind === 'list') {
      const cfnElem = resolveCfnNode(this.schema, cfnItems(cfnResolved));
      const cfnElemKind = cfnKindOf(this.schema, cfnElem);
      const sdkElemTarget = listElementTarget(this.model, sdkTarget);
      if (sdkElemTarget === null) return { transform: 'list', notes: ['opaque SDK list'] };
      const sdkElemKind = smithyKindOf(this.model, sdkElemTarget);
      if (cfnElemKind === 'structure' && sdkElemKind === 'structure') {
        const childId = this.matchStructure(
          cfnElem,
          cfnElem.defName ?? `${childKey}[]`,
          sdkElemTarget
        );
        return { transform: 'list', childId, notes: [] };
      }
      const notes: string[] = [];
      if (cfnElemKind !== sdkElemKind) {
        notes.push(`element kinds differ: CFn ${cfnElemKind} vs SDK ${sdkElemKind}`);
      }
      return { transform: 'list', notes };
    }

    // CFn bare array vs SDK wrapper structure.
    if (cfnKind === 'list' && sdkKind === 'structure') {
      const members = structureMembers(this.model, sdkTarget);
      let itemsMember: string | null = null;
      let quantityMember: string | null = null;
      const listMembers: string[] = [];
      for (const [name, member] of Object.entries(members)) {
        const kind = smithyKindOf(this.model, member.target);
        if (kind === 'list') listMembers.push(name);
        if (name.toLowerCase() === 'items' && kind === 'list') itemsMember = name;
        if (name.toLowerCase() === 'quantity' && kind === 'number') quantityMember = name;
      }
      const chosen = itemsMember ?? (listMembers.length === 1 ? (listMembers[0] as string) : null);
      if (chosen === null) return null;
      const transform: Transform =
        itemsMember !== null && quantityMember !== null
          ? 'wrap-quantity-items'
          : 'wrap-single-list-member';
      const wrapMember = members[chosen] as SmithyMember;
      const sdkElemTarget = listElementTarget(this.model, wrapMember.target);
      let childId: string | undefined;
      if (sdkElemTarget !== null) {
        const cfnElem = resolveCfnNode(this.schema, cfnItems(cfnResolved));
        if (
          cfnKindOf(this.schema, cfnElem) === 'structure' &&
          smithyKindOf(this.model, sdkElemTarget) === 'structure'
        ) {
          childId = this.matchStructure(
            cfnElem,
            cfnElem.defName ?? `${childKey}[]`,
            sdkElemTarget
          );
        }
      }
      // Required wrapper members the CFn array cannot feed (CloudFront
      // TrustedSigners.Enabled): the emitter must NOT synthesize an empty
      // default missing them, and must surface a TODO (VERIFICATION.md M1).
      const otherRequired = Object.entries(members)
        .filter(
          ([name, member]) =>
            isRequired(member) && name !== chosen && name !== quantityMember
        )
        .map(([name]) => name);
      const notes = transform === 'wrap-single-list-member' ? [`wraps into .${chosen}`] : [];
      if (otherRequired.length > 0) {
        notes.push(
          `wrapper has additional required member(s) not derivable from the array: ${otherRequired.join(', ')}`
        );
      }
      return {
        transform,
        childId,
        wrapper: {
          itemsMember: chosen,
          quantityMember,
          otherRequired: otherRequired.length > 0 ? otherRequired : undefined,
        },
        notes,
      };
    }

    if (cfnKind === 'map' && sdkKind === 'map') {
      const sdkValueTarget = mapValueTarget(this.model, sdkTarget);
      const notes: string[] = [];
      let childId: string | undefined;
      if (sdkValueTarget !== null && smithyKindOf(this.model, sdkValueTarget) === 'structure') {
        notes.push('map values are structures; verify per-key mapping');
      }
      return { transform: 'map', childId, notes };
    }
    // CFn free-form object (no properties captured) onto SDK map/structure.
    if (cfnKind === 'document' && (sdkKind === 'map' || sdkKind === 'structure')) {
      return { transform: 'direct', notes: ['CFn side free-form; passed through'] };
    }
    if ((cfnKind === 'structure' || cfnKind === 'map' || cfnKind === 'document') && sdkKind === 'string') {
      return { transform: 'json-string', notes: ['object serialized to JSON string'] };
    }

    // Scalar table.
    if (cfnKind === 'string') {
      if (sdkKind === 'string') return { transform: 'direct', notes: [] };
      if (sdkKind === 'timestamp') return { transform: 'to-date', notes: [] };
      if (sdkKind === 'number') return { transform: 'coerce-number', notes: [] };
      if (sdkKind === 'boolean') return { transform: 'coerce-boolean', notes: [] };
      if (sdkKind === 'blob') return { transform: 'unsupported', notes: ['string -> blob'] };
    }
    if (cfnKind === 'number') {
      if (sdkKind === 'number') return { transform: 'direct', notes: [] };
      if (sdkKind === 'string') return { transform: 'to-string', notes: [] };
      if (sdkKind === 'timestamp') return { transform: 'to-date', notes: ['epoch number'] };
    }
    if (cfnKind === 'boolean') {
      if (sdkKind === 'boolean') return { transform: 'direct', notes: [] };
      if (sdkKind === 'string') return { transform: 'to-string', notes: [] };
    }
    return null;
  }
}

export function computeStats(structs: Record<string, StructMapping>): SpecStats {
  const stats: SpecStats = {
    totalCfnPaths: 0,
    matchedExact: 0,
    matchedCase: 0,
    renameCandidates: 0,
    unmatched: 0,
    nonDirectTransforms: 0,
  };
  for (const struct of Object.values(structs)) {
    for (const m of struct.members) {
      stats.totalCfnPaths += 1;
      if (m.match === 'exact') stats.matchedExact += 1;
      else if (m.match === 'case') stats.matchedCase += 1;
      else if (m.match === 'rename-candidate') stats.renameCandidates += 1;
      else stats.unmatched += 1;
      if (m.transform !== 'direct' && m.transform !== 'structure' && m.transform !== 'list') {
        stats.nonDirectTransforms += 1;
      }
    }
  }
  return stats;
}
