import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-multi-select-filter',
  templateUrl: './multi-select-filter.component.html',
  styleUrls: ['./multi-select-filter.component.css'],
  standalone: false
})
export class MultiSelectFilterComponent {
  @Input() label = '';
  @Input() options: string[] = [];
  @Input() allLabel = 'All';
  @Input() placeholder = 'Select...';
  @Input() selected: string[] = [];
  @Output() selectedChange = new EventEmitter<string[]>();

  isOpen = false;

  constructor(private elementRef: ElementRef) {}

  get displayText(): string {
    if (!this.selected.length) {
      return this.placeholder;
    }
    if (this.options.length > 0 && this.selected.length === this.options.length) {
      return `${this.allLabel} (${this.options.length})`;
    }
    if (this.selected.length === 1) {
      return this.selected[0];
    }
    return `${this.selected.length} selected`;
  }

  isSelected(option: string): boolean {
    return this.selected.includes(option);
  }

  isAllSelected(): boolean {
    return this.options.length > 0 && this.selected.length === this.options.length;
  }

  isIndeterminate(): boolean {
    return this.selected.length > 0 && this.selected.length < this.options.length;
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.emitChange(checked ? [...this.options] : []);
  }

  toggleOption(option: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = checked
      ? [...this.selected, option]
      : this.selected.filter(value => value !== option);
    this.emitChange(next);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  private emitChange(values: string[]): void {
    this.selectedChange.emit(values);
  }
}
