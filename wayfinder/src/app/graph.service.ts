import { Injectable, signal, computed } from '@angular/core';
import { Building, BuildingStep, NodeEntry } from './building.model';

/**
 * Holds the building graph and answers route questions about it.
 * Knows nothing about how a route is displayed.
 */
@Injectable({ providedIn: 'root' })
export class GraphService {
  private readonly data = signal<Building | null>(null);

  readonly loaded = computed(() => this.data() !== null);
  readonly buildingName = computed(() => this.data()?.building ?? '');

  /** Adjacency built once per load: from -> steps leaving that node. */
  private readonly adjacency = computed(() => {
    const map = new Map<string, BuildingStep[]>();
    for (const step of this.data()?.steps ?? []) {
      const list = map.get(step.from);
      if (list) {
        list.push(step);
      } else {
        map.set(step.from, [step]);
      }
    }
    return map;
  });

  /** Nodes offered in the "Where to?" list, in authoring order. */
  readonly destinations = computed<NodeEntry[]>(() => {
    const nodes = this.data()?.nodes ?? {};
    return Object.entries(nodes)
      .filter(([, node]) => node.destination)
      .map(([id, node]) => ({ id, ...node }));
  });

  async load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load the building map (${response.status}).`);
    }
    this.data.set(await response.json());
  }

  /** The current id for an anchor, following a rename if the QR code uses an old one. */
  canonical(id: string): string {
    return this.data()?.aliases?.[id] ?? id;
  }

  node(id: string) {
    return this.data()?.nodes[id];
  }

  label(id: string): string {
    return this.node(id)?.label ?? id;
  }

  exists(id: string): boolean {
    return Boolean(this.node(id));
  }

  /** The anchor whose room range covers this number, if any. */
  anchorForRoom(room: number): NodeEntry | null {
    const nodes = this.data()?.nodes ?? {};
    for (const [id, node] of Object.entries(nodes)) {
      if (node.rooms && room >= node.rooms.from && room <= node.rooms.to) {
        return { id, ...node };
      }
    }
    return null;
  }

  /** Every room number the map can route to, low to high. */
  readonly roomRanges = computed(() =>
    Object.values(this.data()?.nodes ?? {})
      .map(node => node.rooms)
      .filter((range): range is NonNullable<typeof range> => Boolean(range))
      .sort((a, b) => a.from - b.from)
  );

  /**
   * Shortest walk from one anchor to another, as an ordered list of steps.
   * Breadth-first, so the first route found is the one with fewest legs.
   * Returns null when the graph has no path.
   */
  route(from: string, to: string): BuildingStep[] | null {
    if (!this.exists(from) || !this.exists(to)) {
      return null;
    }
    if (from === to) {
      return [];
    }
    const adjacency = this.adjacency();
    const cameBy = new Map<string, BuildingStep>();
    const seen = new Set<string>([from]);
    const queue: string[] = [from];
    while (queue.length) {
      const current = queue.shift()!;
      for (const step of adjacency.get(current) ?? []) {
        if (seen.has(step.to)) {
          continue;
        }
        seen.add(step.to);
        cameBy.set(step.to, step);
        if (step.to === to) {
          return this.unwind(cameBy, from, to);
        }
        queue.push(step.to);
      }
    }
    return null;
  }

  private unwind(cameBy: Map<string, BuildingStep>, from: string, to: string): BuildingStep[] {
    const path: BuildingStep[] = [];
    let cursor = to;
    while (cursor !== from) {
      const step = cameBy.get(cursor);
      if (!step) {
        return [];
      }
      path.unshift(step);
      cursor = step.from;
    }
    return path;
  }
}
