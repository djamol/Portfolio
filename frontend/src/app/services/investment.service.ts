import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:3000/api';

export interface Investment {
  id?: number;
  website_app_name: string;
  investment_type: string;
  sub_type_name?: string;
  sub_type_category?: string;
  amount: number;
  investment_date: string;
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvestmentService {
  constructor(private http: HttpClient) {}

  getInvestments(): Observable<{ success: boolean; data: Investment[] }> {
    return this.http.get<{ success: boolean; data: Investment[] }>(`${API_URL}/investments`);
  }

  getInvestment(id: number): Observable<{ success: boolean; data: Investment }> {
    return this.http.get<{ success: boolean; data: Investment }>(`${API_URL}/investments/${id}`);
  }

  createInvestment(investment: Investment): Observable<{ success: boolean; data: Investment }> {
    return this.http.post<{ success: boolean; data: Investment }>(`${API_URL}/investments`, investment);
  }

  updateInvestment(id: number, investment: Investment): Observable<{ success: boolean; data: Investment }> {
    return this.http.put<{ success: boolean; data: Investment }>(`${API_URL}/investments/${id}`, investment);
  }

  deleteInvestment(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${API_URL}/investments/${id}`);
  }
}
