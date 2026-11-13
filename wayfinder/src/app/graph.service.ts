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
      const inRange = node.rooms && room >= node.rooms.from && room <= node.rooms.to;
      if (inRange || node.roomNumbers?.includes(room)) {
        return { id, ...node };
      }
    }
    return null;
  }

  /** Every room the map knows, in words, low to high: "44, 51 and 200–220". Empty if none. */
  readonly roomSummary = computed(() => {
    const parts: { at: number; text: string }[] = [];
    for (const node of Object.values(this.data()?.nodes ?? {})) {
      if (node.rooms) parts.push({ at: node.rooms.from, text: `${node.rooms.from}–${node.rooms.to}` });
      for (const n of node.roomNumbers ?? []) parts.push({ at: n, text: String(n) });
    }
    const texts = parts.sort((a, b) => a.at - b.at).map(p => p.text);
    return texts.length > 1 ? `${texts.slice(0, -1).join(', ')} and ${texts[texts.length - 1]}` : texts.join('');
  });

  /** True for anchors that stand for numbered rooms; they're reached by typing a number. */
  isRoomAnchor(node: { rooms?: unknown; roomNumbers?: unknown[] }): boolean {
    return Boolean(node.rooms || node.roomNumbers?.length);
  }

  /**
   * Shortest walk from one anchor to another, as an ordered list of steps.
   * Each step counts as 1 unless the map gives it a cost (walking into the dining
   * hall counts as longer, so routes only cut through it when there is no good way round).
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
    const distance = new Map<string, number>([[from, 0]]);
    const cameBy = new Map<string, BuildingStep>();
    const done = new Set<string>();
    for (;;) {
      // the closest anchor not yet settled (the map is small, so a plain scan is plenty)
      let current: string | null = null;
      for (const [id, d] of distance) {
        if (!done.has(id) && (current === null || d < distance.get(current)!)) {
          current = id;
        }
      }
      if (current === null) {
        return null;
      }
      if (current === to) {
        return this.unwind(cameBy, from, to);
      }
      done.add(current);
      for (const step of adjacency.get(current) ?? []) {
        const d = distance.get(current)! + (step.cost ?? 1);
        if (d < (distance.get(step.to) ?? Infinity)) {
          distance.set(step.to, d);
          cameBy.set(step.to, step);
        }
      }
    }
  }

  /** The route from one anchor to another, with any route-specific instructions applied. */
  directions(from: string, to: string): BuildingStep[] | null {
    const steps = this.route(from, to);
    if (!steps) {
      return null;
    }
    const overrides = this.data()?.overrides ?? [];
    return steps.map((step, i) => {
      const last = i === steps.length - 1;
      let result = !last && step.throughText ? { ...step, text: step.throughText } : step;
      const o = overrides.find(x =>
        x.photo === step.photo &&
        (x.from === undefined || x.from === from) &&
        (x.to === undefined || x.to === to) &&
        (x.before === undefined || x.before === steps[i + 1]?.photo) &&
        (x.after === undefined || x.after === steps[i - 1]?.photo)
      );
      if (o) {
        const { from: _f, to: _t, photo: _p, before: _b, after: _a, ...changes } = o;
        result = { ...result, ...changes };
      }
      return result;
    });
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
