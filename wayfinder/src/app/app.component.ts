import { Component, HostListener, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { GraphService } from './graph.service';
import { BuildingStep, NodeEntry } from './building.model';
import { DestinationPickerComponent } from './destination-picker.component';
import { StepPlayerComponent } from './step-player.component';

interface Trip {
  steps: BuildingStep[];
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DestinationPickerComponent, StepPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly at = signal('');
  readonly trip = signal<Trip | null>(null);
  readonly noRouteTo = signal('');
  /** True when the visitor picked their spot by hand, so Back can take them to choose again. */
  readonly pickedByHand = signal(false);
  readonly error = signal('');

  readonly ready = computed(() => this.graph.loaded());
  readonly here = computed(() => this.graph.label(this.at()));
  readonly knownAnchor = computed(() => this.graph.exists(this.at()));

  /** Everywhere worth offering, minus wherever the visitor already is. */
  readonly choices = computed(() => this.graph.destinations().filter(node => node.id !== this.at()));

  readonly resolveRoom = (room: number): NodeEntry | null => this.graph.anchorForRoom(room);

  constructor(private readonly graph: GraphService) {
    const at = new URLSearchParams(location.search).get('at') ?? '';
    this.at.set(at.trim());
    this.graph
      .load('building.json')
      .then(() => this.at.set(this.graph.canonical(this.at())))
      .catch((err: unknown) => this.error.set(err instanceof Error ? err.message : String(err)));
  }

  /** Anchors that could be used when the QR sent us somewhere unknown. */
  anchors(): NodeEntry[] {
    return this.graph.destinations();
  }

  useAnchor(id: string): void {
    this.at.set(id);
    this.pickedByHand.set(true);
    this.noRouteTo.set('');
    history.pushState({ screen: 'destinations' }, '');
  }

  /** Back from the destination list to "Which sign are you standing at?". */
  changeAnchor(): void {
    if (history.state?.screen === 'destinations') {
      history.back();
    } else {
      this.at.set('');
      this.pickedByHand.set(false);
    }
  }

  go(choice: { node: NodeEntry; room?: number }): void {
    const steps = this.graph.route(this.at(), choice.node.id);
    if (!steps || !steps.length) {
      this.noRouteTo.set(choice.node.label);
      this.trip.set(null);
      return;
    }
    this.noRouteTo.set('');
    this.trip.set({
      steps,
      label: choice.room ? `room ${choice.room}` : choice.node.label,
    });
    // from the room-number screen, Back should land on the destination list, not the number pad
    if (history.state?.screen === 'room') {
      history.replaceState({ screen: 'trip' }, '');
    } else {
      history.pushState({ screen: 'trip' }, '');
    }
  }

  /** Back (or Done) from a route to the destination list. */
  restart(): void {
    if (history.state?.screen === 'trip') {
      history.back();
      return;
    }
    this.trip.set(null);
    this.noRouteTo.set('');
  }

  /** The phone's back gesture and the browser's back button move between screens, not out of the app. */
  @HostListener('window:popstate')
  onPopState(): void {
    const screen = history.state?.screen;
    if (screen !== 'trip') {
      this.trip.set(null);
      this.noRouteTo.set('');
    }
    if (!screen && this.pickedByHand()) {
      this.at.set('');
      this.pickedByHand.set(false);
    }
  }
}
