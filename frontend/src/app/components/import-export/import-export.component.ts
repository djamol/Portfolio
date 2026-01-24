import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-import-export',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-export.component.html',
  styleUrl: './import-export.component.css'
})
export class ImportExportComponent {
  private apiUrl = 'http://localhost:3000/api';
  loading = false;
  message = '';
  messageType: 'success' | 'error' | 'info' = 'info';
  
  constructor(private http: HttpClient) {}
  
  // Export all data
  exportData() {
    this.loading = true;
    this.message = 'Exporting data...';
    this.messageType = 'info';
    
    this.http.get(`${this.apiUrl}/portfolio/export`).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          // Convert to CSV format
          const csvContent = this.convertToCSV(response.data);
          
          // Create download link
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          
          link.setAttribute('href', url);
          link.setAttribute('download', `portfolio_data_${new Date().toISOString().split('T')[0]}.csv`);
          link.style.visibility = 'hidden';
          
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          this.showMessage('Export completed successfully!', 'success');
        } else {
          this.showMessage('No data to export', 'error');
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Export error:', error);
        this.showMessage('Export failed: ' + (error.message || 'Unknown error'), 'error');
        this.loading = false;
      }
    });
  }
  
  // Import data from CSV
  importData(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.showMessage('Please select a CSV file', 'error');
      return;
    }

    this.loading = true;
    this.message = 'Processing file...';
    this.messageType = 'info';
    
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const csvText = e.target.result;
        const parsedData = this.parseImportCSV(csvText);
        
        if (parsedData.length === 0) {
          this.showMessage('No valid data found in CSV file', 'error');
          this.loading = false;
          return;
        }

        this.http.post(`${this.apiUrl}/portfolio/import`, parsedData).subscribe({
          next: (response: any) => {
            if (response.success) {
              const result = response.data;
              this.showMessage(
                `Import completed: ${result.imported} new records added, ${result.updated} existing records updated.`,
                'success'
              );
            } else {
              this.showMessage('Import failed: ' + (response.error || 'Unknown error'), 'error');
            }
            this.loading = false;
          },
          error: (error) => {
            console.error('Import error:', error);
            this.showMessage('Import failed: ' + (error.message || 'Unknown error'), 'error');
            this.loading = false;
          }
        });
      } catch (error) {
        console.error('CSV parsing error:', error);
        this.showMessage('Error parsing CSV file: ' + (error as Error).message, 'error');
        this.loading = false;
      }
    };
    
    reader.readAsText(file);
  }
  
  // Convert data to CSV format
  private convertToCSV(data: any[]): string {
    if (!data.length) return '';
    
    // Define CSV headers
    const headers = [
      'ID',
      'Website/App Name',
      'Investment Type',
      'Sub Type Name',
      'Sub Type Category',
      'Amount',
      'Investment Date',
      'Notes',
      'Created At',
      'Updated At'
    ];
    
    // Create CSV rows
    const rows = data.map(item => [
      item.id,
      `"${item.website_app_name || ''}"`,
      `"${item.investment_type || ''}"`,
      `"${item.sub_type_name || ''}"`,
      `"${item.sub_type_category || ''}"`,
      item.amount,
      item.investment_date,
      `"${item.notes || ''}"`,
      item.created_at,
      item.updated_at
    ]);
    
    // Combine headers and rows
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  // Parse CSV data for import
  private parseImportCSV(csvText: string): any[] {
    const lines = csvText.split('\n');
    const result: any[] = [];
    
    if (lines.length < 2) return result;
    
    // Skip header row and parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV parsing (handles quoted fields)
      const fields = this.parseCSVLine(line);
      
      // Skip if not enough fields
      if (fields.length < 7) continue;
      
      const investment = {
        website_app_name: fields[1]?.replace(/^"|"$/g, '')?.trim(),
        investment_type: fields[2]?.replace(/^"|"$/g, '')?.trim(),
        sub_type_name: fields[3]?.replace(/^"|"$/g, '')?.trim() || null,
        sub_type_category: fields[4]?.replace(/^"|"$/g, '')?.trim() || null,
        amount: parseFloat(fields[5]) || 0,
        investment_date: fields[6]?.trim(),
        notes: fields[7]?.replace(/^"|"$/g, '')?.trim() || null
      };
      
      // Validate required fields
      if (investment.website_app_name && investment.investment_type && 
          investment.amount > 0 && investment.investment_date) {
        result.push(investment);
      }
    }
    
    return result;
  }
  
  // Helper method to parse CSV line
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Double quotes inside quoted field - treat as single quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        // Regular character
        current += char;
      }
    }
    
    // Add last field
    result.push(current.trim());
    
    return result;
  }
  
  private showMessage(msg: string, type: 'success' | 'error' | 'info') {
    this.message = msg;
    this.messageType = type;
    setTimeout(() => {
      if (this.message === msg) {
        this.message = '';
      }
    }, 5000);
  }
}
