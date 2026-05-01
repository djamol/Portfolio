import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type PortfolioValueSeriesPoint = { change_date: string; total_value: number | string };
export type AllocationLatestRow = { investment_type: string; value: number | string };
export type DeltaRow = {
  investment_id: number;
  website_app_name: string;
  investment_type: string;
  sub_type_name: string | null;
  sub_type_category: string | null;
  amount_to: number | string;
  amount_from: number | string;
  delta: number | string;
};
export type CashflowByMonthRow = { month: string; net_cashflow: number | string; outflow: number | string; inflow: number | string };

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private getApiUrl(): string {
    const apiDomain = localStorage.getItem('apiDomain') || 'http://localhost:3000';
    return `${apiDomain}/api`;
  }
  
  constructor(private http: HttpClient) {}

  getTotal(): Observable<{ success: boolean; data: { total_amount: number; total_investments: number } }> {
    return this.http.get<{ success: boolean; data: { total_amount: number; total_investments: number } }>(`${this.getApiUrl()}/analytics/total`);
  }

  getByType(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-type`);
  }

  getByMonth(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-month`);
  }

  getByYear(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-year`);
  }

  getMonthlyChanges(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/monthly-changes`);
  }

  getYearlyChanges(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/yearly-changes`);
  }

  getByPlatform(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-platform`);
  }

  getGrowth(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/growth`);
  }

  getBySubTypeName(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-sub-type-name`);
  }

  getBySubTypeCategory(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/by-sub-type-category`);
  }

  getSummaryTable(): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/summary-table`);
  }

  getInvestmentHistory(id: number): Observable<{ success: boolean; data: any[] }> {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.getApiUrl()}/analytics/investment-history/${id}`);
  }

  getValueSeries(): Observable<{ success: boolean; data: PortfolioValueSeriesPoint[] }> {
    return this.http.get<{ success: boolean; data: PortfolioValueSeriesPoint[] }>(`${this.getApiUrl()}/analytics/value-series`);
  }

  getAllocationLatest(): Observable<{ success: boolean; data: AllocationLatestRow[] }> {
    return this.http.get<{ success: boolean; data: AllocationLatestRow[] }>(`${this.getApiUrl()}/analytics/allocation-latest`);
  }

  getDelta(from: string, to: string): Observable<{ success: boolean; meta: { from: string; to: string }; data: DeltaRow[] }> {
    const params = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return this.http.get<{ success: boolean; meta: { from: string; to: string }; data: DeltaRow[] }>(`${this.getApiUrl()}/analytics/delta?${params}`);
  }

  getCashflowsByMonth(): Observable<{ success: boolean; data: CashflowByMonthRow[] }> {
    return this.http.get<{ success: boolean; data: CashflowByMonthRow[] }>(`${this.getApiUrl()}/analytics/cashflows-by-month`);
  }
}