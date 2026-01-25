import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
}