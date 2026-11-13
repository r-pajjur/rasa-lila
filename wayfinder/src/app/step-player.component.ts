import { Component, Input, Output, EventEmitter, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { BuildingStep } from './building.model';
import { ArrowOverlayComponent } from './arrow-overlay.component';

/**
 * Plays a route one leg at a time: instruction, photo with its arrow, Next.
 * Laid out to fit one phone screen, so nobody scrolls mid-walk.
 */
@Component({
  selector: 'app-step-player',
  standalone: true,
  imports: [ArrowOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="player">
      <div class="head">
        <button class="ghost" type="button" (click)="quit.emit()">&larr; Back</button>
        <span class="counter">Step {{ index() + 1 }} of {{ steps.length }}</span>
      </div>

      <div class="instruction" aria-live="polite">
        <span class="num" aria-hidden="true">{{ index() + 1 }}</span>
        <div class="words">
          <p>{{ current().text }}</p>
          @if (arrived()) {
            <p class="arrived">You have arrived at {{ destinationLabel }}.</p>
          }
        </div>
      </div>

      <figure class="shot">
        <div class="frame">
          <img [src]="photoBase + current().photo" [alt]="current().text" />
          <app-arrow-overlay [direction]="current().arrow" [at]="current().arrowAt" [tilt]="current().arrowTilt ?? 0" />
        </div>
      </figure>

      <div class="controls">
        <button class="btn quiet" type="button" [disabled]="index() === 0" (click)="back()">Previous</button>
        @if (arrived()) {
          <button class="btn" type="button" (click)="done.emit()">Done</button>
        } @else {
          <button class="btn" type="button" (click)="next()">Next &rarr;</button>
        }
      </div>

      <ol class="dots" aria-hidden="true">
        @for (step of steps; track step.photo + $index) {
          <li [class.done]="$index <= index()"></li>
        }
      </ol>
    </div>
  `,
  styleUrl: './step-player.component.css',
})
export class StepPlayerComponent {
  @Input({ required: true }) steps!: BuildingStep[];
  @Input({ required: true }) destinationLabel!: string;
  @Input() photoBase = 'photos/';
  /** Back to the destination list. */
  @Output() quit = new EventEmitter<void>();
  /** Finished the route: start over from "Where are you starting from?". */
  @Output() done = new EventEmitter<void>();

  readonly index = signal(0);
  readonly current = computed(() => this.steps[this.index()]);
  readonly arrived = computed(() => this.index() === this.steps.length - 1);

  next(): void {
    if (this.index() < this.steps.length - 1) {
      this.index.set(this.index() + 1);
    }
  }

  back(): void {
    if (this.index() > 0) {
      this.index.set(this.index() - 1);
    }
  }
}
