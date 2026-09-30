import type {
  GeodeticLocation,
} from "../evidence/types.js";

export type VerticalDatumKind =
  | "ellipsoidal"
  | "geoid"
  | "mean-sea-level"
  | "planetary-radius"
  | "other";

export interface VerticalDatum {
  readonly id: string;
  readonly kind:
    VerticalDatumKind;
  readonly bodyId: number;
  readonly source: string;
}

export const EARTH_PCK00011_ELLIPSOIDAL_DATUM:
  VerticalDatum =
  Object.freeze({
    id:
      "EARTH_PCK00011_ELLIPSOIDAL",
    kind: "ellipsoidal",
    bodyId: 399,
    source:
      "NASA/JPL NAIF pck00011.tpc BODY399_RADII",
  });

export interface VerticalDatumTransform {
  readonly from: string;
  readonly to: string;
  readonly bodyId: number;
  offsetMetersAt(
    location:
      GeodeticLocation,
  ): number | Promise<number>;
  offsetsMetersAt?(
    locations:
      readonly GeodeticLocation[],
  ):
    | readonly number[]
    | Promise<readonly number[]>;
}

export interface HeightAtLocation {
  readonly heightMeters: number;
  readonly location:
    GeodeticLocation;
}

export class VerticalDatumTransformUnavailableError
  extends Error
{
  readonly from: string;
  readonly to: string;

  constructor(
    from: string,
    to: string,
  ) {
    super(
      `No vertical datum transform is registered from ${from} to ${to}.`,
    );
    this.name =
      "VerticalDatumTransformUnavailableError";
    this.from = from;
    this.to = to;
  }
}

export class VerticalDatumTransformRegistry {
  private readonly transforms =
    new Map<
      string,
      VerticalDatumTransform
    >();

  register(
    transform:
      VerticalDatumTransform,
  ): void {
    if (
      !transform.from.trim() ||
      !transform.to.trim()
    ) {
      throw new Error(
        "Vertical datum transform IDs must not be empty.",
      );
    }

    const key =
      this.key(
        transform.bodyId,
        transform.from,
        transform.to,
      );

    if (
      this.transforms.has(key)
    ) {
      throw new Error(
        `Vertical datum transform already registered: ${transform.from} -> ${transform.to} for body ${transform.bodyId}.`,
      );
    }

    this.transforms.set(
      key,
      transform,
    );
  }

  async transformHeight(
    bodyId: number,
    heightMeters: number,
    location:
      GeodeticLocation,
    from: string,
    to: string,
  ): Promise<number> {
    const transformed =
      await this.transformHeights(
        bodyId,
        [
          {
            heightMeters,
            location,
          },
        ],
        from,
        to,
      );

    const value =
      transformed[0];
    if (value === undefined) {
      throw new Error(
        "Vertical datum transform returned no result.",
      );
    }
    return value;
  }

  async transformHeights(
    bodyId: number,
    samples:
      readonly HeightAtLocation[],
    from: string,
    to: string,
  ): Promise<readonly number[]> {
    for (const sample of samples) {
      if (
        !Number.isFinite(
          sample.heightMeters,
        )
      ) {
        throw new RangeError(
          "Height must be finite.",
        );
      }
      if (
        sample.location.bodyId !==
        bodyId
      ) {
        throw new Error(
          `Vertical datum location body ${sample.location.bodyId} does not match requested body ${bodyId}.`,
        );
      }
    }

    if (from === to) {
      return Object.freeze(
        samples.map(
          (sample) =>
            sample.heightMeters,
        ),
      );
    }

    const transform =
      this.transforms.get(
        this.key(
          bodyId,
          from,
          to,
        ),
      );

    if (!transform) {
      throw new VerticalDatumTransformUnavailableError(
        from,
        to,
      );
    }

    const locations =
      samples.map(
        (sample) =>
          sample.location,
      );

    const offsets =
      transform.offsetsMetersAt
        ? await transform.offsetsMetersAt(
            locations,
          )
        : await Promise.all(
            locations.map(
              (location) =>
                transform.offsetMetersAt(
                  location,
                ),
            ),
          );

    if (
      offsets.length !==
      samples.length
    ) {
      throw new Error(
        `Vertical datum transform ${from} -> ${to} returned ${offsets.length} offsets for ${samples.length} samples.`,
      );
    }

    return Object.freeze(
      samples.map(
        (sample, index) => {
          const offset =
            offsets[index];
          if (
            offset === undefined ||
            !Number.isFinite(offset)
          ) {
            throw new Error(
              `Vertical datum transform ${from} -> ${to} returned a non-finite offset at sample ${index}.`,
            );
          }
          return (
            sample.heightMeters +
            offset
          );
        },
      ),
    );
  }

  private key(
    bodyId: number,
    from: string,
    to: string,
  ): string {
    return `${bodyId}:${from}->${to}`;
  }
}
