/** Directions an arrow overlay can point. */
export type ArrowDirection = 'left' | 'right' | 'straight' | 'up' | 'down';

/** A range of room numbers that all sit behind one anchor. */
export interface RoomRange {
  from: number;
  to: number;
}

/** A QR anchor point: somewhere a code is posted on a wall. */
export interface BuildingNode {
  label: string;
  /** Offer this node in the "Where to?" list. */
  destination?: boolean;
  /** Numbered rooms reached from this anchor, e.g. 200-220. */
  rooms?: RoomRange;
  /** Still using placeholder photography. */
  placeholder?: boolean;
}

/** One walk between two adjacent anchors, authored once and reused by every route through it. */
export interface BuildingStep {
  from: string;
  to: string;
  photo: string;
  arrow: ArrowDirection;
  text: string;
}

export interface Building {
  building: string;
  /** Old anchor ids that still resolve, so QR codes printed before a rename keep working. */
  aliases?: Record<string, string>;
  nodes: Record<string, BuildingNode>;
  steps: BuildingStep[];
}

/** A node id paired with its data, for iterating in templates. */
export interface NodeEntry extends BuildingNode {
  id: string;
}
