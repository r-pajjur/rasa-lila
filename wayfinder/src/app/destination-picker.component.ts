import { Component, HostListener, Input, Output, EventEmitter, signal, ChangeDetectionStrategy } from '@angular/core';
import { NodeEntry } from './building.model';

/**
 * The place picker (used for both "where are you starting from?" and "where to?"):
 * a list of places, plus one "A room" entry where any room number can be typed.
 */
@Component({
  selector: 'app-destination-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (roomOpen()) {
      <div class="rooms">
        <button class="ghost" type="button" (click)="closeRooms()">&larr; Back</button>
        <h2>Which room?</h2>
        <p class="hint">{{ roomHint() }}</p>
        <form (submit)="submitRoom($event)">
          <input
            #roomField
            class="room-field"
            type="number"
            inputmode="numeric"
            placeholder="e.g. 44"
            [value]="roomText()"
            (input)="roomText.set($any($event.target).value)"
            aria-label="Room number"
          />
          @if (roomError()) {
            <p class="error">{{ roomError() }}</p>
          }
          <button class="btn" type="submit">Take me there</button>
        </form>
      </div>
    } @else {
      <h2>{{ heading }}</h2>
      <ul class="list">
        @if (showRoomItem()) {
          <li>
            <button type="button" (click)="openRooms()">
              <span class="name">A room</span>
              <span class="sub">Type the room number</span>
              <span class="chev" aria-hidden="true">&rarr;</span>
            </button>
          </li>
        }
        @for (item of visible(); track item.id) {
          <li>
            <button type="button" (click)="choose(item)">
              <span class="name">{{ item.label }}</span>
              @if (item.placeholder && askRoom) {
                <span class="sub">Photos not taken yet</span>
              }
              <span class="chev" aria-hidden="true">&rarr;</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './destination-picker.component.css',
})
export class DestinationPickerComponent {
  @Input({ required: true }) destinations!: NodeEntry[];
  /** Resolves a typed room number to an anchor id, or null if unknown. */
  @Input({ required: true }) resolveRoom!: (room: number) => NodeEntry | null;
  @Output() picked = new EventEmitter<{ node: NodeEntry; room?: number }>();
  @Input() heading = 'Where do you wish to go?';
  /** Show "Photos not taken yet" notes (only useful when choosing where to go). */
  @Input() askRoom = true;
  /** Every room on the map in words, e.g. "44, 51 and 200–220"; empty hides the room entry. */
  @Input() roomSummary = '';

  readonly roomOpen = signal(false);
  readonly roomText = signal('');
  readonly roomError = signal('');

  visible(): NodeEntry[] {
    return this.destinations;
  }

  /** "A room" shows whenever the map has numbered rooms. */
  showRoomItem(): boolean {
    return Boolean(this.roomSummary);
  }

  roomHint(): string {
    return `Rooms ${this.roomSummary}.`;
  }

  openRooms(): void {
    this.roomOpen.set(true);
    this.roomText.set('');
    this.roomError.set('');
    history.pushState({ screen: 'room' }, '');
  }

  choose(item: NodeEntry): void {
    this.picked.emit({ node: item });
  }

  closeRooms(): void {
    if (history.state?.screen === 'room') {
      history.back();
      return;
    }
    this.roomOpen.set(false);
    this.roomError.set('');
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (history.state?.screen !== 'room') {
      this.roomOpen.set(false);
      this.roomError.set('');
    }
  }

  submitRoom(event: Event): void {
    event.preventDefault();
    const room = Number(this.roomText());
    if (!this.roomText().trim() || Number.isNaN(room)) {
      this.roomError.set('Type a room number.');
      return;
    }
    const node = this.resolveRoom(room);
    if (!node) {
      this.roomError.set(`Room ${room} is not on the map yet.`);
      return;
    }
    this.roomError.set('');
    this.picked.emit({ node, room });
  }
}
