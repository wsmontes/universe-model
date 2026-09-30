export type HierarchicalTileState =
  | "ready"
  | "loading"
  | "unavailable";

export interface HierarchicalTile {
  readonly id: string;
  readonly state:
    HierarchicalTileState;
  readonly children?:
    readonly HierarchicalTile[];
}

export interface TileCoverageSelection {
  readonly complete: boolean;
  readonly tiles:
    readonly HierarchicalTile[];
}

export type TileRefinementPredicate =
  (
    tile: HierarchicalTile,
  ) => boolean;

export function selectTileCoverage(
  tile: HierarchicalTile,
  shouldRefine:
    TileRefinementPredicate,
): TileCoverageSelection {
  const children =
    tile.children ?? [];

  if (
    children.length > 0 &&
    shouldRefine(tile)
  ) {
    const childSelections =
      children.map((child) =>
        selectTileCoverage(
          child,
          shouldRefine,
        ),
      );

    if (
      childSelections.every(
        (selection) =>
          selection.complete,
      )
    ) {
      return Object.freeze({
        complete: true,
        tiles: Object.freeze(
          childSelections.flatMap(
            (selection) =>
              selection.tiles,
          ),
        ),
      });
    }
  }

  if (tile.state === "ready") {
    return Object.freeze({
      complete: true,
      tiles: Object.freeze([
        tile,
      ]),
    });
  }

  return Object.freeze({
    complete: false,
    tiles: Object.freeze([]),
  });
}
