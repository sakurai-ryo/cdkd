/**
 * PoC: CFn-schema + Smithy-model driven mapping generator — shared types.
 *
 * The mapping SPEC is the central artifact: a machine-derived, auditable
 * description of how each CloudFormation property path maps onto an AWS SDK
 * (Smithy) input member, including the transform the value needs on the way.
 * Everything else (generated TS mapper code, coverage report, a future
 * runtime interpreter or critic input) is a projection of this spec.
 */

/** Terminal type kind after resolving refs / target chains on either side. */
export type TypeKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'blob'
  | 'structure'
  | 'list'
  | 'map'
  | 'union'
  | 'document'
  | 'ambiguous';

/** How the CFn property name was matched to the SDK member name. */
export type MatchTier =
  | 'exact' // identical spelling
  | 'case' // case-insensitive match (covers Pascal->camel style flips AND same-style
  // case divergences like MetricTimeZone -> MetricTimezone)
  | 'rename-candidate' // normalized-substring containment (IPV6Enabled -> IsIPV6Enabled);
  // needs human confirmation
  | 'unmatched'; // no SDK member found — the silent-drop class

/** Value transform the generated mapper applies for this member. */
export type Transform =
  | 'direct' // pass through as-is
  | 'structure' // recurse into child structure mapping
  | 'list' // map each element (scalar or structure per `children`)
  | 'map' // pass through map values (recurse when value is a structure)
  | 'wrap-quantity-items' // CFn bare array -> SDK { Quantity, Items } wrapper
  | 'wrap-single-list-member' // CFn bare array -> SDK structure with one list member (S3 SSE idiom)
  | 'to-date' // CFn ISO-8601 string -> SDK Date
  | 'coerce-number' // CFn string/number -> SDK number
  | 'coerce-boolean' // CFn string/boolean -> SDK boolean
  | 'to-string' // CFn number/boolean -> SDK string
  | 'json-string' // CFn object -> SDK string (policy documents idiom)
  | 'document' // SDK document type: pass through
  | 'unsupported'; // union / blob / ambiguous — flagged for manual work

export interface MemberMapping {
  /** CFn property name at this level. */
  cfn: string;
  /** SDK member name, or null when unmatched. */
  sdk: string | null;
  match: MatchTier;
  transform: Transform;
  /** CFn-side terminal kind (for the report). */
  cfnKind: TypeKind;
  /** SDK-side terminal kind (for the report). */
  sdkKind: TypeKind | null;
  /** SDK member carries smithy.api#required. */
  sdkRequired: boolean;
  /**
   * For structure / list-of-structure / wrapper transforms: id of the child
   * StructMapping in the spec's `structs` table.
   */
  childId?: string;
  /** For wrap-quantity-items: the SDK wrapper's Items member name + shapes. */
  wrapper?: { itemsMember: string; quantityMember: string | null };
  notes: string[];
}

export interface StructMapping {
  /** Stable id: `<cfnDef>|<sdkShape>` (short names). */
  id: string;
  /** CFn definition name ('#top' for the resource root). */
  cfnDef: string;
  /** Smithy shape id (short name) this maps onto. */
  sdkShape: string;
  members: MemberMapping[];
  /** CFn properties with NO matched SDK member (potential silent drops). */
  unmatchedCfn: string[];
  /** SDK required members no CFn property feeds (need synthesized values). */
  sdkRequiredUnfed: string[];
}

export type OperationSource = 'handlers' | 'verb-heuristic' | 'override';

export interface OperationMapping {
  operationName: string;
  inputShape: string;
  source: OperationSource;
  /** Root StructMapping id. */
  rootId: string;
  /** Other operations considered (for the report / an override table). */
  candidates?: string[];
}

export interface ResourceMappingSpec {
  resourceType: string;
  service: {
    modelPath: string;
    sdkId: string;
    cloudFormationName: string;
    arnNamespace: string | null;
    /** Namespace prefix of the model's shapes, e.g. `com.amazonaws.ecs`. */
    namespace: string;
  };
  operations: {
    create?: OperationMapping;
    update?: OperationMapping;
    delete?: OperationMapping;
  };
  /**
   * Multi-op resources (the S3 idiom): per-top-level-property sub-operation
   * mapping for properties the create input does not carry. Keyed by CFn
   * property name.
   */
  subOperations: Record<string, OperationMapping>;
  /** All struct mappings reachable from the operations, keyed by id. */
  structs: Record<string, StructMapping>;
  /** CFn top-level properties that are readOnly (never inputs). */
  readOnlyProperties: string[];
  createOnlyProperties: string[];
  /** Aggregate counts for the coverage report. */
  stats: SpecStats;
}

export interface SpecStats {
  totalCfnPaths: number;
  matchedExact: number;
  matchedCase: number;
  renameCandidates: number;
  unmatched: number;
  nonDirectTransforms: number;
}
