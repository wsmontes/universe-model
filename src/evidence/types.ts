export type EvidenceKind =
  | "measurement"
  | "observation"
  | "reconstruction"
  | "model"
  | "catalog";

export type EvidencePayloadKind =
  | "terrain-source"
  | "terrain-tile"
  | "raster-tile"
  | "vector-tile"
  | "point-cloud-tile"
  | "mesh-tile"
  | "catalog-tile";

export type EvidenceSelectionCriterion =
  | "spatial-resolution"
  | "temporal-distance"
  | "uncertainty"
  | "source-authority";

export type SourceAuthority =
  | "primary"
  | "official"
  | "scientific-derived"
  | "community"
  | "unknown";

export interface EvidenceInstant {
  readonly utcIso: string;
  /**
   * Optional monotonic coordinate used only for ordering/distance.
   * The resolver never derives this with JavaScript Date. Callers and
   * providers must use the same declared timeline (for example TAI Unix
   * seconds) when temporal comparison is required.
   */
  readonly timelineSeconds?: number;
  readonly timeline?: string;
}

export interface SourceIdentity {
  readonly id: string;
  readonly name: string;
  readonly authority: SourceAuthority;
  readonly product?: string;
  readonly version?: string;
}

export interface TemporalExtent {
  readonly start?: EvidenceInstant;
  readonly end?: EvidenceInstant;
}

export interface BodyLocation {
  readonly kind: "body";
  readonly bodyId: number;
}

export interface GeodeticLocation {
  readonly kind: "geodetic";
  readonly bodyId: number;
  readonly latitudeDegrees: number;
  readonly longitudeDegrees: number;
  readonly heightMeters?: number;
  readonly referenceFrame: string;
  readonly verticalDatum?: string;
}

export type SpatialLocation =
  | BodyLocation
  | GeodeticLocation;

export interface GlobalBodyExtent {
  readonly kind: "global-body";
  readonly bodyId: number;
}

export interface GeodeticBoundsExtent {
  readonly kind: "geodetic-bounds";
  readonly bodyId: number;
  readonly southLatitudeDegrees: number;
  readonly northLatitudeDegrees: number;
  readonly westLongitudeDegrees: number;
  readonly eastLongitudeDegrees: number;
  readonly referenceFrame: string;
  readonly verticalDatum?: string;
}

export type SpatialExtent =
  | GlobalBodyExtent
  | GeodeticBoundsExtent;

export interface Resolution {
  readonly spatialMeters?: number;
  readonly angularArcSeconds?: number;
  readonly temporalSeconds?: number;
}

export interface Uncertainty {
  readonly horizontalMeters?: number;
  readonly verticalMeters?: number;
  readonly temporalSeconds?: number;
  readonly description?: string;
}

export interface License {
  readonly name: string;
  readonly url?: string;
}

export interface Attribution {
  readonly text: string;
  readonly url?: string;
}

export interface IntegrityMetadata {
  readonly verified: boolean;
  readonly algorithm?: string;
  readonly digest?: string;
  readonly immutableId?: string;
}

export interface EvidencePayload {
  readonly kind: EvidencePayloadKind;
  readonly uri?: string;
  readonly data?: unknown;
}

export interface Evidence {
  readonly source: SourceIdentity;
  readonly spatialExtent?: SpatialExtent;
  readonly temporalExtent?: TemporalExtent;
  readonly observationEpoch?: EvidenceInstant;
  readonly resolution: Resolution;
  readonly referenceFrame: string;
  readonly verticalDatum?: string;
  readonly kind: EvidenceKind;
  readonly uncertainty?: Uncertainty;
  readonly license: License;
  readonly attribution: Attribution;
  readonly integrity: IntegrityMetadata;
  readonly payload: EvidencePayload;
}

export interface EvidenceQuery {
  readonly payloadKind: EvidencePayloadKind;
  readonly bodyId?: number;
  readonly epoch?: EvidenceInstant;
  readonly location?: SpatialLocation;
  readonly requiredReferenceFrame?: string;
  readonly requiredVerticalDatum?: string;
  readonly acceptableEvidenceKinds?: readonly EvidenceKind[];
  readonly selectionCriteria?: readonly EvidenceSelectionCriterion[];
}

export type CoverageStatus =
  | "available"
  | "partial"
  | "unavailable";

export interface Coverage {
  readonly status: CoverageStatus;
  readonly reason?: string;
}

export interface EvidenceResolution {
  readonly evidence: Evidence | null;
  readonly consideredProviders: readonly string[];
  readonly unavailableProviders: readonly {
    readonly providerId: string;
    readonly reason: string;
  }[];
}
