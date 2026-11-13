/** Directions an arrow overlay can point. "turn-*" is a bent arrow; "none" shows no arrow. */
export type ArrowDirection = 'left' | 'right' | 'straight' | 'up' | 'down' | 'turn-left' | 'turn-right' | 'none';

/** Where on the photo the arrow sits. */
export type ArrowPosition = 'center' | 'left' | 'right' | 'bottom';

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
  /** Or specific room numbers, when they aren't a continuous range (e.g. 44 and 51). */
  roomNumbers?: number[];
  /** Still using placeholder photography. */
  placeholder?: boolean;
}

/** One walk between two adjacent anchors, authored once and reused by every route through it. */
export interface BuildingStep {
  from: string;
  to: string;
  photo: string;
  arrow: ArrowDirection;
  /** Optional: move the arrow (default depends on the direction). */
  arrowAt?: ArrowPosition;
  /** Optional: tilt the arrow this many degrees clockwise. */
  arrowTilt?: number;
  /** Optional: the instruction when a route only passes through here instead of ending here. */
  throughText?: string;
  /** Optional: how long this step counts as when choosing a route (default 1). */
  cost?: number;
  text: string;
}

/**
 * A different instruction for one photo in a particular situation — for when the same
 * spot needs other words or another arrow depending on the walk. It applies when every
 * condition given matches: the whole route (from/to), the photo shown next (before),
 * or the photo shown just before it (after).
 */
export interface RouteOverride {
  photo: string;
  from?: string;
  to?: string;
  /** Applies when this photo is followed by that photo. */
  before?: string;
  /** Applies when this photo comes right after that photo. */
  after?: string;
  text?: string;
  arrow?: ArrowDirection;
  arrowAt?: ArrowPosition;
  arrowTilt?: number;
}

export interface Building {
  building: string;
  /** Old anchor ids that still resolve, so QR codes printed before a rename keep working. */
  aliases?: Record<string, string>;
  nodes: Record<string, BuildingNode>;
  steps: BuildingStep[];
  /** Route-specific versions of a step's instruction (see RouteOverride). */
  overrides?: RouteOverride[];
}

/** A node id paired with its data, for iterating in templates. */
export interface NodeEntry extends BuildingNode {
  id: string;
}
