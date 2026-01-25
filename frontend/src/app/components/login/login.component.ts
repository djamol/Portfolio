import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent implements OnInit {
  username: string = '';
  password: string = '';
  apiDomain: string = 'http://localhost:3000';
  errorMessage: string = '';
  loading: boolean = false;
  
  constructor(
    private http: HttpClient,
    private router: Router,
    private authService: AuthService
  ) {}
  
  ngOnInit() {
    // Check if user is already logged in
    if (this.authService.isAuthenticated()) {
      const storedApiDomain = this.authService.getApiDomain();
      if (storedApiDomain) {
        this.apiDomain = storedApiDomain;
      }
      this.router.navigate(['/investments']);
    }
  }
  
  login() {
    this.loading = true;
    this.errorMessage = '';
    
    // Validate credentials
    if (this.username === 'amol' && this.password === 'admin') {
      // Test API connection
      this.testApiConnection()
        .then(() => {
          // Store login state and API domain using auth service
          this.authService.login(this.apiDomain);
          
          // Navigate to main application
          this.router.navigate(['/investments']);
        })
        .catch((error) => {
          this.errorMessage = 'Cannot connect to API server. Please check the domain and ensure the backend is running.';
          this.loading = false;
        });
    } else {
      this.errorMessage = 'Invalid username or password';
      this.loading = false;
    }
  }
  
  private testApiConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Test with a simple API call
      const timeout = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('API connection timeout'));
      }, 5000);
      
      const subscription = this.http.get(`${this.apiDomain}/api/investments`)
        .subscribe({
          next: () => {
            clearTimeout(timeout);
            resolve();
          },
          error: () => {
            clearTimeout(timeout);
            reject(new Error('API connection failed'));
          }
        });
    });
  }
  
  logout() {
    this.authService.logout();
    this.username = '';
    this.password = '';
    this.errorMessage = '';
  }
}
