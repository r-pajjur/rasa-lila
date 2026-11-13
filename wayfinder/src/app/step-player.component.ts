import { Component, Input, Output, EventEmitter, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { BuildingStep } from './building.model';
import { ArrowOverlayComponent } from './arrow-overlay.component';

/**
 * Plays a route one leg at a time: photo, arrow, instruction, Next.
 * It is handed a finished route and reports nothing back but "done".
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

      <figure class="shot">
        <img [src]="photoBase + current().photo" [alt]="current().text" />
        <app-arrow-overlay [direction]="current().arrow" />
      </figure>

      <p class="instruction">{{ current().text }}</p>

      @if (arrived()) {
        <p class="arrived">You have arrived at {{ destinationLabel }}.</p>
      }

      <div class="controls">
        <button class="btn quiet" type="button" [disabled]="index() === 0" (click)="back()">Previous step</button>
        @if (arrived()) {
          <button class="btn" type="button" (click)="quit.emit()">Done</button>
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
  @Output() quit = new EventEmitter<void>();

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
