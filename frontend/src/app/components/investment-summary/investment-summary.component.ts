import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-investment-summary',
  templateUrl: './investment-summary.component.html',
  styleUrls: ['./investment-summary.component.css'],
  standalone: false
})
export class InvestmentSummaryComponent implements OnInit {
  summaryData: any[] = [];
  filteredData: any[] = [];
  loading = false;
  errorMessage = '';

  // Search and filter properties
  searchTerm: string = '';
  selectedType: string = '';
  selectedPlatform: string = '';
  selectedCategory: string = '';
  sortBy: string = 'amount';
  sortDirection: 'asc' | 'desc' = 'desc';

  // Unique values for filters
  investmentTypes: string[] = [];
  platforms: string[] = [];
  categories: string[] = [];

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit() {
    this.loadSummaryData();
  }

  loadSummaryData() {
    this.loading = true;
    this.errorMessage = '';

    this.analyticsService.getSummaryTable().subscribe({
      next: (response) => {
        if (response.data) {
          this.summaryData = response.data.map(item => ({
            ...item,
            amount: parseFloat(item.amount) || 0,
            investment_date: new Date(item.investment_date)
          }));
          this.extractFilterOptions();
          this.applyFilters();
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading summary table:', error);
        this.errorMessage = 'Failed to load investment summary. ' + (error.message || 'Please check if backend is running.');
        this.loading = false;
      }
    });
  }

  extractFilterOptions() {
    // Extract unique investment types
    this.investmentTypes = [...new Set(this.summaryData.map(item => item.investment_type))].filter(Boolean);

    // Extract unique platforms
    this.platforms = [...new Set(this.summaryData.map(item => item.website_app_name))].filter(Boolean);

    // Extract unique categories
    this.categories = [...new Set(this.summaryData.map(item => item.sub_type_category))].filter(Boolean);
  }

  applyFilters() {
    // Apply search term filter
    let result = this.summaryData.filter(item => {
      const searchStr = this.searchTerm.toLowerCase();
      return (
        !this.searchTerm ||
        item.website_app_name.toLowerCase().includes(searchStr) ||
        item.investment_type.toLowerCase().includes(searchStr) ||
        (item.sub_type_name && item.sub_type_name.toLowerCase().includes(searchStr)) ||
        (item.sub_type_category && item.sub_type_category.toLowerCase().includes(searchStr)) ||
        item.amount.toString().includes(searchStr) ||
        item.investment_date.toISOString().toLowerCase().includes(searchStr)
      );
    });

    // Apply type filter
    if (this.selectedType) {
      result = result.filter(item => item.investment_type === this.selectedType);
    }

    // Apply platform filter
    if (this.selectedPlatform) {
      result = result.filter(item => item.website_app_name === this.selectedPlatform);
    }

    // Apply category filter
    if (this.selectedCategory) {
      result = result.filter(item => item.sub_type_category === this.selectedCategory);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (this.sortBy) {
        case 'amount':
          comparison = a.amount - b.amount;
          break;
        case 'investment_type':
          comparison = a.investment_type.localeCompare(b.investment_type);
          break;
        case 'website_app_name':
          comparison = a.website_app_name.localeCompare(b.website_app_name);
          break;
        case 'sub_type_name':
          comparison = (a.sub_type_name || '').localeCompare(b.sub_type_name || '');
          break;
        case 'sub_type_category':
          comparison = (a.sub_type_category || '').localeCompare(b.sub_type_category || '');
          break;
        case 'investment_date':
          comparison = a.investment_date.getTime() - b.investment_date.getTime();
          break;
        default:
          comparison = 0;
      }
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    this.filteredData = result;
  }

  onSearchChange() {
    this.applyFilters();
  }

  onFilterChange() {
    this.applyFilters();
  }

  onSort(column: string) {
    if (this.sortBy === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDirection = 'desc'; // Default to descending for new sorts
    }
    this.applyFilters();
  }

  getSortIcon(column: string) {
    if (this.sortBy !== column) {
      return '↕️';
    }
    return this.sortDirection === 'asc' ? '↑' : '↓';
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedType = '';
    this.selectedPlatform = '';
    this.selectedCategory = '';
    this.sortBy = 'amount';
    this.sortDirection = 'desc';
    this.applyFilters();
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}