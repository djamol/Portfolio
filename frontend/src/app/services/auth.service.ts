import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { normalizeApiDomain } from '../utils/api-url.util';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  
  constructor(private router: Router) {}
  
  isAuthenticated(): boolean {
    return localStorage.getItem('isLoggedIn') === 'true';
  }
  
  getApiDomain(): string | null {
    return localStorage.getItem('apiDomain');
  }
  
  login(apiDomain: string): void {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('apiDomain', normalizeApiDomain(apiDomain));
    localStorage.setItem('loginTime', new Date().toISOString());
  }
  
  logout(): void {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('apiDomain');
    localStorage.removeItem('loginTime');
    this.router.navigate(['/login']);
  }
  
  canActivate(): boolean {
    if (this.isAuthenticated()) {
      return true;
    } else {
      this.router.navigate(['/login']);
      return false;
    }
  }
}
