import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InvestmentService {
  private getApiUrl(): string {
    const apiDomain = localStorage.getItem('apiDomain') || 'http://localhost:3000';
    return `${apiDomain}/api`;
  }
  
  constructor(private http: HttpClient) {}

  getAll(): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${this.getApiUrl()}/investments`).pipe(
      map(response => response.success ? response.data : [])
    );
  }

  getByCriteria(platform: string, subTypeName: string, subTypeCategory: string): Observable<any[]> {
    return this.http.get<ApiResponse<any[]>>(`${this.getApiUrl()}/investments/search`, {
      params: {
        website_app_name: platform,
        sub_type_name: subTypeName,
        sub_type_category: subTypeCategory
      }
    }).pipe(
      map(response => response.success ? response.data : [])
    );
  }

  getById(id: number): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${this.getApiUrl()}/investments/${id}`).pipe(
      map(response => response.success ? response.data : null)
    );
  }

  create(data: any): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.getApiUrl()}/investments`, data).pipe(
      map(response => response.success ? response.data : null)
    );
  }

  update(id: number, data: any): Observable<any> {
    return this.http.put<ApiResponse<any>>(`${this.getApiUrl()}/investments/${id}`, data).pipe(
      map(response => response.success ? response.data : null)
    );
  }

  delete(id: number): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${this.getApiUrl()}/investments/${id}`).pipe(
      map(response => response.success ? response.data : null)
    );
  }
}