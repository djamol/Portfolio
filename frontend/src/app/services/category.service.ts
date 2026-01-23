import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = 'http://localhost:3000/api';

export interface SubTypeName {
  id?: number;
  name: string;
  investment_type: string;
  created_at?: string;
}

export interface SubTypeCategory {
  id?: number;
  category: string;
  sub_type_name_id?: number;
  investment_type: string;
  sub_type_name?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  constructor(private http: HttpClient) {}

  getSubTypeNames(investmentType?: string): Observable<{ success: boolean; data: SubTypeName[] }> {
    const url = investmentType 
      ? `${API_URL}/categories/sub-type-names/${investmentType}`
      : `${API_URL}/categories/sub-type-names`;
    return this.http.get<{ success: boolean; data: SubTypeName[] }>(url);
  }

  createSubTypeName(name: string, investmentType: string): Observable<{ success: boolean; data: SubTypeName }> {
    return this.http.post<{ success: boolean; data: SubTypeName }>(
      `${API_URL}/categories/sub-type-names`,
      { name, investment_type: investmentType }
    );
  }

  getCategories(investmentType: string, subTypeNameId?: number): Observable<{ success: boolean; data: SubTypeCategory[] }> {
    const url = subTypeNameId
      ? `${API_URL}/categories/categories/${investmentType}/${subTypeNameId}`
      : `${API_URL}/categories/categories/${investmentType}`;
    return this.http.get<{ success: boolean; data: SubTypeCategory[] }>(url);
  }

  createCategory(category: string, investmentType: string, subTypeNameId?: number): Observable<{ success: boolean; data: SubTypeCategory }> {
    return this.http.post<{ success: boolean; data: SubTypeCategory }>(
      `${API_URL}/categories/categories`,
      { category, investment_type: investmentType, sub_type_name_id: subTypeNameId }
    );
  }

  deleteSubTypeName(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${API_URL}/categories/sub-type-names/${id}`);
  }

  deleteCategory(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${API_URL}/categories/categories/${id}`);
  }
}
