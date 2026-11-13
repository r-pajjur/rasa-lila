import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ArrowDirection, ArrowPosition } from './building.model';

/**
 * The directional arrow, drawn as SVG on top of the photo — never baked
 * into the image file, so one photo can be re-labelled at any time.
 * Slightly see-through so it never fully hides what it points at.
 */
@Component({
  selector: 'app-arrow-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (direction !== 'none') {
      <svg
        class="arrow"
        [class]="'at-' + placement()"
        viewBox="0 0 120 120"
        role="img"
        [attr.aria-label]="describe()"
      >
        <defs>
          <filter id="arrow-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0C2430" flood-opacity="0.55" />
          </filter>
        </defs>
        @if (isTurn()) {
          <!-- a bent arrow: up, then round the corner; mirrored for a left turn -->
          <g filter="url(#arrow-shadow)" [attr.transform]="direction === 'turn-left' ? 'translate(120 0) scale(-1 1)' : ''">
            <path d="M38 108 V66 Q38 42 62 42 H78" fill="none" stroke="#FDF8EE" stroke-width="31" stroke-linejoin="round" />
            <path d="M76 12 L110 42 L76 72 Z" fill="#FDF8EE" stroke="#FDF8EE" stroke-width="9" stroke-linejoin="round" />
            <path d="M38 108 V66 Q38 42 62 42 H80" fill="none" stroke="#D9741A" stroke-width="21" stroke-linejoin="round" />
            <path d="M76 12 L110 42 L76 72 Z" fill="#D9741A" />
          </g>
        } @else {
          <g [attr.transform]="'rotate(' + rotation() + ' 60 60)'" filter="url(#arrow-shadow)">
            <path
              d="M60 14 L94 58 H76 V104 H44 V58 H26 Z"
              fill="#D9741A"
              stroke="#FDF8EE"
              stroke-width="5"
              stroke-linejoin="round"
            />
          </g>
        }
      </svg>
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
      }

      .arrow {
        position: absolute;
        width: clamp(78px, 24%, 132px);
        height: auto;
        opacity: 0.72;
      }

      /* the arrow sits where the walk continues, not always dead centre */
      .at-center {
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
      }

      .at-bottom {
        left: 50%;
        bottom: 6%;
        transform: translateX(-50%);
      }

      .at-left {
        left: 7%;
        top: 50%;
        transform: translateY(-50%);
      }

      .at-right {
        right: 7%;
        top: 50%;
        transform: translateY(-50%);
      }
    `,
  ],
})
export class ArrowOverlayComponent {
  @Input({ required: true }) direction!: ArrowDirection;
  /** Overrides where the arrow sits; by default it follows the direction. */
  @Input() at?: ArrowPosition;
  /** Extra tilt in degrees, clockwise (e.g. 30 to lean an "up" arrow to the right). */
  @Input() tilt = 0;

  isTurn(): boolean {
    return this.direction === 'turn-left' || this.direction === 'turn-right';
  }

  placement(): ArrowPosition {
    if (this.at) return this.at;
    switch (this.direction) {
      case 'left':
        return 'left';
      case 'right':
        return 'right';
      case 'down':
        return 'bottom';
      default:
        return 'center';
    }
  }

  /** Degrees to rotate the base arrow, which points up. */
  rotation(): number {
    const base = { left: -90, right: 90, down: 180 }[this.direction as 'left' | 'right' | 'down'] ?? 0;
    return base + (this.tilt || 0);
  }

  describe(): string {
    switch (this.direction) {
      case 'left':
        return 'Go left';
      case 'right':
        return 'Go right';
      case 'turn-left':
        return 'Turn left';
      case 'turn-right':
        return 'Turn right';
      case 'up':
        return 'Go up';
      case 'down':
        return 'Go down';
      default:
        return 'Go straight ahead';
    }
  }
}
