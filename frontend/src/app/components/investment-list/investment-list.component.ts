import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvestmentService, Investment } from '../../services/investment.service';
import { CategoryService, SubTypeName, SubTypeCategory } from '../../services/category.service';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-investment-list',
  templateUrl: './investment-list.component.html',
  styleUrls: ['./investment-list.component.css'],
  standalone: false
})
export class InvestmentListComponent implements OnInit {
  investments: Investment[] = [];
  showModal = false;
  showSubTypeModal = false;
  showCategoryModal = false;
  editingInvestment: Investment | null = null;
  currentInvestment: Investment = {
    website_app_name: '',
    investment_type: '',
    sub_type_name: '',
    sub_type_category: '',
    amount: 0,
    investment_date: new Date().toISOString().split('T')[0]
  };
  loading = false;
  
  subTypeNames: SubTypeName[] = [];
  categories: SubTypeCategory[] = [];
  selectedSubTypeNameId: number | null = null;
  selectedCategoryId: number | null = null;
  showNewSubTypeInput = false;
  showNewCategoryInput = false;
  newSubTypeName = '';
  newCategory = '';

  constructor(
    private investmentService: InvestmentService,
    private categoryService: CategoryService
  ) {}

  ngOnInit() {
    this.loadInvestments();
  }

  loadInvestments() {
    this.loading = true;
    this.investmentService.getInvestments().subscribe({
      next: (response) => {
        this.investments = response.data;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading investments:', error);
        this.loading = false;
        alert('Error loading investments. Make sure the backend is running.');
      }
    });
  }

  onInvestmentTypeChange() {
    if (this.currentInvestment.investment_type) {
      this.loadSubTypeNames();
      this.loadCategories();
      // Reset selections
      this.selectedSubTypeNameId = null;
      this.selectedCategoryId = null;
      this.currentInvestment.sub_type_name = '';
      this.currentInvestment.sub_type_category = '';
    }
  }

  onSubTypeNameChange() {
    if (this.selectedSubTypeNameId === null) {
      this.currentInvestment.sub_type_name = '';
      this.loadCategories();
      return;
    }
    
    if (this.selectedSubTypeNameId.toString() === '__NEW__') {
      this.showSubTypeModal = true;
      return;
    }

    const selectedSubType = this.subTypeNames.find(s => s.id === this.selectedSubTypeNameId);
    if (selectedSubType) {
      this.currentInvestment.sub_type_name = selectedSubType.name;
      this.loadCategories(this.selectedSubTypeNameId);
      this.selectedCategoryId = null; // Reset category when sub-type changes
    }
  }

  onCategoryChange() {
    if (this.selectedCategoryId === null) {
      this.currentInvestment.sub_type_category = '';
      return;
    }
    
    if (this.selectedCategoryId.toString() === '__NEW__') {
      this.showCategoryModal = true;
      return;
    }

    const selectedCategory = this.categories.find(c => c.id === this.selectedCategoryId);
    if (selectedCategory) {
      this.currentInvestment.sub_type_category = selectedCategory.category;
    }
  }

  loadSubTypeNames() {
    if (!this.currentInvestment.investment_type) return;
    
    this.categoryService.getSubTypeNames(this.currentInvestment.investment_type).subscribe({
      next: (response) => {
        this.subTypeNames = response.data;
      },
      error: (error) => {
        console.error('Error loading sub-type names:', error);
      }
    });
  }

  loadCategories(subTypeNameId?: number) {
    if (!this.currentInvestment.investment_type) return;
    
    this.categoryService.getCategories(this.currentInvestment.investment_type, subTypeNameId).subscribe({
      next: (response) => {
        this.categories = response.data;
      },
      error: (error) => {
        console.error('Error loading categories:', error);
      }
    });
  }

  openModal(investment?: Investment) {
    if (investment) {
      this.editingInvestment = investment;
      this.currentInvestment = { ...investment };
      // Set selected IDs based on existing values
      if (this.currentInvestment.investment_type) {
        this.loadSubTypeNames();
        setTimeout(() => {
          const subType = this.subTypeNames.find(s => s.name === investment.sub_type_name);
          if (subType) {
            this.selectedSubTypeNameId = subType.id!;
            this.loadCategories(subType.id!);
            setTimeout(() => {
              const category = this.categories.find(c => c.category === investment.sub_type_category);
              if (category) {
                this.selectedCategoryId = category.id!;
              }
            }, 100);
          }
        }, 100);
      }
    } else {
      this.editingInvestment = null;
      this.currentInvestment = {
        website_app_name: '',
        investment_type: '',
        sub_type_name: '',
        sub_type_category: '',
        amount: 0,
        investment_date: new Date().toISOString().split('T')[0]
      };
      this.selectedSubTypeNameId = null;
      this.selectedCategoryId = null;
      this.subTypeNames = [];
      this.categories = [];
    }
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingInvestment = null;
    this.showNewSubTypeInput = false;
    this.showNewCategoryInput = false;
    this.newSubTypeName = '';
    this.newCategory = '';
  }

  closeModalOnBackdrop(event: Event) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.closeModal();
    }
  }

  saveInvestment() {
    // Handle sub-type name selection
    if (this.selectedSubTypeNameId && this.selectedSubTypeNameId.toString() !== '__NEW__') {
      const selectedSubType = this.subTypeNames.find(s => s.id === this.selectedSubTypeNameId);
      if (selectedSubType) {
        this.currentInvestment.sub_type_name = selectedSubType.name;
      }
    }

    // Handle category selection - if "__NEW__", open modal and return
    if (this.selectedCategoryId && this.selectedCategoryId.toString() === '__NEW__') {
      this.showCategoryModal = true;
      return;
    }

    if (this.selectedCategoryId && this.selectedCategoryId.toString() !== '__NEW__') {
      const selectedCategory = this.categories.find(c => c.id === this.selectedCategoryId);
      if (selectedCategory) {
        this.currentInvestment.sub_type_category = selectedCategory.category;
      }
    }

    this.performSaveInvestment();
  }

  saveNewSubType() {
    if (!this.newSubTypeName || !this.currentInvestment.investment_type) {
      alert('Please fill in all required fields');
      return;
    }

    this.categoryService.createSubTypeName(this.newSubTypeName, this.currentInvestment.investment_type).subscribe({
      next: (response) => {
        this.subTypeNames.push(response.data);
        this.selectedSubTypeNameId = response.data.id!;
        this.currentInvestment.sub_type_name = response.data.name;
        this.closeSubTypeModal();
        this.loadCategories();
      },
      error: (error) => {
        console.error('Error creating sub-type:', error);
        alert(error.error?.error || 'Error creating sub-type');
      }
    });
  }

  saveNewCategory() {
    if (!this.newCategory || !this.currentInvestment.investment_type) {
      alert('Please fill in all required fields');
      return;
    }

    this.categoryService.createCategory(
      this.newCategory, 
      this.currentInvestment.investment_type,
      this.selectedSubTypeNameId || undefined
    ).subscribe({
      next: (response) => {
        this.categories.push(response.data);
        this.selectedCategoryId = response.data.id!;
        this.currentInvestment.sub_type_category = response.data.category;
        this.closeCategoryModal();
        // Auto-save investment after category is created
        setTimeout(() => {
          this.performSaveInvestment();
        }, 100);
      },
      error: (error) => {
        console.error('Error creating category:', error);
        alert(error.error?.error || 'Error creating category');
      }
    });
  }

  performSaveInvestment() {
    if (this.editingInvestment) {
      this.investmentService.updateInvestment(this.editingInvestment.id!, this.currentInvestment).subscribe({
        next: () => {
          this.loadInvestments();
          this.closeModal();
        },
        error: (error) => {
          console.error('Error updating investment:', error);
          alert('Error updating investment');
        }
      });
    } else {
      this.investmentService.createInvestment(this.currentInvestment).subscribe({
        next: () => {
          this.loadInvestments();
          this.closeModal();
        },
        error: (error) => {
          console.error('Error creating investment:', error);
          alert('Error creating investment');
        }
      });
    }
  }

  closeSubTypeModal() {
    this.showSubTypeModal = false;
    this.newSubTypeName = '';
  }

  closeSubTypeModalOnBackdrop(event: Event) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.closeSubTypeModal();
    }
  }

  closeCategoryModal() {
    this.showCategoryModal = false;
    this.newCategory = '';
  }

  closeCategoryModalOnBackdrop(event: Event) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.closeCategoryModal();
    }
  }

  editInvestment(investment: Investment) {
    this.openModal(investment);
  }

  deleteInvestment(id: number) {
    if (confirm('Are you sure you want to delete this investment?')) {
      this.investmentService.deleteInvestment(id).subscribe({
        next: () => {
          this.loadInvestments();
        },
        error: (error) => {
          console.error('Error deleting investment:', error);
          alert('Error deleting investment');
        }
      });
    }
  }
}