import { Routes } from '@angular/router';
import { InvestmentListComponent } from './components/investment-list/investment-list.component';
import { AnalyticsComponent } from './components/analytics/analytics.component';
import { InvestmentSummaryComponent } from './components/investment-summary/investment-summary.component';

export const routes: Routes = [
  { path: '', redirectTo: '/investments', pathMatch: 'full' },
  { path: 'investments', component: InvestmentListComponent },
  { path: 'analytics', component: AnalyticsComponent },
  { path: 'investment-summary', component: InvestmentSummaryComponent }
];