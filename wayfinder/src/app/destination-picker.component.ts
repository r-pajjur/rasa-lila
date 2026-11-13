import { Component, HostListener, Input, Output, EventEmitter, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { NodeEntry, RoomRange } from './building.model';

/**
 * The "Where to?" screen: a searchable list of destinations, plus a
 * number pad path for the ranged rooms.
 */
@Component({
  selector: 'app-destination-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (roomEntry()) {
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
            placeholder="214"
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
      <input
        class="search"
        type="search"
        placeholder="Search places"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
        aria-label="Search places"
      />
      <ul class="list">
        @for (item of visible(); track item.id) {
          <li>
            <button type="button" (click)="choose(item)">
              <span class="name">{{ item.label }}</span>
              @if (item.rooms && askRoom) {
                <span class="sub">Enter a room number</span>
              } @else if (item.placeholder && askRoom) {
                <span class="sub">Photos not taken yet</span>
              }
              <span class="chev" aria-hidden="true">&rarr;</span>
            </button>
          </li>
        } @empty {
          <li class="none">Nothing matches "{{ query() }}".</li>
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
  /** Ask for a room number when a room range is picked (off when choosing where you are). */
  @Input() askRoom = true;

  readonly query = signal('');
  readonly roomEntry = signal<NodeEntry | null>(null);
  readonly roomText = signal('');
  readonly roomError = signal('');

  readonly visible = computed(() => {
    const needle = this.query().trim().toLowerCase();
    if (!needle) {
      return this.destinations;
    }
    return this.destinations.filter(item => item.label.toLowerCase().includes(needle));
  });

  roomHint(): string {
    const range: RoomRange | undefined = this.roomEntry()?.rooms;
    return range ? `Rooms ${range.from} to ${range.to}.` : '';
  }

  choose(item: NodeEntry): void {
    if (item.rooms && this.askRoom) {
      this.roomEntry.set(item);
      this.roomText.set('');
      this.roomError.set('');
      history.pushState({ screen: 'room' }, '');
      return;
    }
    this.picked.emit({ node: item });
  }

  closeRooms(): void {
    if (history.state?.screen === 'room') {
      history.back();
      return;
    }
    this.roomEntry.set(null);
    this.roomError.set('');
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (history.state?.screen !== 'room') {
      this.roomEntry.set(null);
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
