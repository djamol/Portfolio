import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvestmentSummaryComponent } from './investment-summary.component';

describe('InvestmentSummaryComponent', () => {
  let component: InvestmentSummaryComponent;
  let fixture: ComponentFixture<InvestmentSummaryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvestmentSummaryComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InvestmentSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
