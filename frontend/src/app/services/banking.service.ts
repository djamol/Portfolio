import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { getApiBaseUrl } from '../utils/api-url.util';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: any;
  message?: string;
  error?: string;
}

export interface BankAccount {
  id: number;
  bank_name: string;
  account_name: string;
  account_number?: string | null;
  ifsc?: string | null;
  account_type?: string;
  currency?: string;
  opening_balance?: number;
  notes?: string | null;
  is_active?: number | boolean;
  txn_count?: number;
  latest_balance?: number | null;
}

export interface BankTransaction {
  id: number;
  account_id: number;
  txn_date: string;
  value_date?: string;
  narration?: string;
  ref_no?: string | null;
  withdrawal: number;
  deposit: number;
  balance?: number | null;
  category?: string | null;
  txn_type?: string | null;
  tags?: string | null;
  notes?: string | null;
  bank_name?: string;
  account_name?: string;
  account_number?: string;
}

@Injectable({ providedIn: 'root' })
export class BankingService {
  private getApiUrl(): string {
    return `${getApiBaseUrl()}/banking`;
  }

  constructor(private http: HttpClient) {}

  getAccounts(): Observable<BankAccount[]> {
    return this.http.get<ApiResponse<BankAccount[]>>(`${this.getApiUrl()}/accounts`).pipe(
      map((r) => (r.success ? r.data : []))
    );
  }

  createAccount(data: Partial<BankAccount>): Observable<BankAccount | null> {
    return this.http.post<ApiResponse<BankAccount>>(`${this.getApiUrl()}/accounts`, data).pipe(
      map((r) => (r.success ? r.data : null))
    );
  }

  updateAccount(id: number, data: Partial<BankAccount>): Observable<BankAccount | null> {
    return this.http.put<ApiResponse<BankAccount>>(`${this.getApiUrl()}/accounts/${id}`, data).pipe(
      map((r) => (r.success ? r.data : null))
    );
  }

  deleteAccount(id: number): Observable<boolean> {
    return this.http.delete<ApiResponse<any>>(`${this.getApiUrl()}/accounts/${id}`).pipe(
      map((r) => !!r.success)
    );
  }

  getTransactions(filters: Record<string, any> = {}): Observable<{
    rows: BankTransaction[];
    total: number;
    total_debit?: number;
    total_credit?: number;
    net_cashflow?: number;
  }> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<ApiResponse<BankTransaction[]>>(`${this.getApiUrl()}/transactions`, { params }).pipe(
      map((r) => ({
        rows: r.success ? r.data : [],
        total: r.meta?.total || 0,
        total_debit: r.meta?.total_debit,
        total_credit: r.meta?.total_credit,
        net_cashflow: r.meta?.net_cashflow
      }))
    );
  }

  updateTransaction(id: number, data: Partial<BankTransaction>): Observable<BankTransaction | null> {
    return this.http.put<ApiResponse<BankTransaction>>(`${this.getApiUrl()}/transactions/${id}`, data).pipe(
      map((r) => (r.success ? r.data : null))
    );
  }

  deleteTransaction(id: number): Observable<boolean> {
    return this.http.delete<ApiResponse<any>>(`${this.getApiUrl()}/transactions/${id}`).pipe(
      map((r) => !!r.success)
    );
  }

  bulkCategorize(ids: number[], category: string): Observable<number> {
    return this.http.post<ApiResponse<{ updated: number }>>(`${this.getApiUrl()}/transactions/bulk-categorize`, { ids, category }).pipe(
      map((r) => r.data?.updated || 0)
    );
  }

  recategorize(accountId?: number): Observable<number> {
    return this.http.post<ApiResponse<{ updated: number }>>(`${this.getApiUrl()}/recategorize`, { account_id: accountId }).pipe(
      map((r) => r.data?.updated || 0)
    );
  }

  getAnalytics(filters: Record<string, any> = {}): Observable<any> {
    let params = new HttpParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params = params.set(k, String(v));
    });
    return this.http.get<ApiResponse<any>>(`${this.getApiUrl()}/analytics`, { params }).pipe(
      map((r) => (r.success ? r.data : null))
    );
  }

  getCategories(): Observable<string[]> {
    return this.http.get<ApiResponse<string[]>>(`${this.getApiUrl()}/categories`).pipe(
      map((r) => (r.success ? r.data : []))
    );
  }

  importStatement(accountId: number, file: File, bankHint?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    form.append('account_id', String(accountId));
    if (bankHint) form.append('bank_hint', bankHint);
    return this.http.post<ApiResponse<any>>(`${this.getApiUrl()}/import`, form).pipe(
      map((r) => {
        if (!r.success) throw new Error(r.error || 'Import failed');
        return r.data;
      })
    );
  }

  previewStatement(file: File, accountId?: number, bankHint?: string): Observable<any> {
    const form = new FormData();
    form.append('file', file);
    if (accountId) form.append('account_id', String(accountId));
    if (bankHint) form.append('bank_hint', bankHint);
    return this.http.post<ApiResponse<any>>(`${this.getApiUrl()}/import/preview`, form).pipe(
      map((r) => {
        if (!r.success) throw new Error(r.error || 'Preview failed');
        return r.data;
      })
    );
  }
}
