import { Component, OnInit } from '@angular/core';
import { AnalyticsFilters, AnalyticsService } from '../../services/analytics.service';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { INVESTMENT_TYPES } from '../../constants/investment-types.constants';
import { hasMultiSelectFilter, pruneSelections } from '../../utils/advanced-filter.util';
import { getIndianAmountBreakdown, IndianAmountBreakdown } from '../../utils/indian-number.util';

export interface AssetTrackerRow {
  date: string;
  dateLabel: string;
  amount: number;
  diffPreviousDate: number;
  diffPreviousPercent: number;
  daysSincePrevious: number | null;
  diffInL: number;
  monthsDiff: number;
  diffWithCurrent: number;
  percent: number;
  isLatest: boolean;
}

export interface AssetTrackerStats {
  currentAmount: number;
  latestSnapshotLabel: string;
  latestSnapshotAmount: number;
  firstSnapshotLabel: string;
  firstAmount: number;
  snapshotCount: number;
  totalGrowth: number;
  totalGrowthPercent: number;
  sinceLastSnapshot: number;
  sinceLastSnapshotPercent: number;
  highestAmount: number;
  highestDateLabel: string;
  lowestAmount: number;
  lowestDateLabel: string;
  cagr: number | null;
  trackingMonths: number;
  trackingDays: number;
  trackingPeriodLabel: string;
  avgPeriodChange: number;
  daysSinceLastSnapshot: number;
  drawdownFromPeak: number;
  drawdownFromPeakPercent: number;
  riseFromLow: number;
  riseFromLowPercent: number;
  positivePeriods: number;
  negativePeriods: number;
  bestPeriodLabel: string;
  bestPeriodPercent: number;
  worstPeriodLabel: string;
  worstPeriodPercent: number;
  lastPeriodChange: number;
  lastPeriodChangePercent: number;
  insights: string[];
}

type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-asset-tracker',
  templateUrl: './asset-tracker.component.html',
  styleUrls: ['./asset-tracker.component.css'],
  standalone: false
})
export class AssetTrackerComponent implements OnInit {
  rows: AssetTrackerRow[] = [];
  displayRows: AssetTrackerRow[] = [];
  stats: AssetTrackerStats | null = null;
  currentTotalBreakdown: IndianAmountBreakdown | null = null;
  growthBreakdown: IndianAmountBreakdown | null = null;
  peakBreakdown: IndianAmountBreakdown | null = null;
  firstAmountBreakdown: IndianAmountBreakdown | null = null;
  lastSnapshotBreakdown: IndianAmountBreakdown | null = null;
  loading = false;
  errorMessage = '';
  currentAmount = 0;
  sortDirection: SortDirection = 'asc';
  filterEmptyMessage = '';

  showAdvancedFilters = false;
  applyingFilters = false;
  filterFrom = '';
  filterTo = '';
  filterPlatforms: string[] = [];
  filterTypes: string[] = [];
  filterSubTypes: string[] = [];
  filterCategories: string[] = [];
  filterMinAmount: number | null = null;
  filterMaxAmount: number | null = null;
  filterIgnoreZero = false;

  investmentTypes: string[] = INVESTMENT_TYPES;
  filterPlatformsOptions: string[] = [];
  filterSummaryData: any[] = [];

  private allSortedDates: string[] = [];
  private allByDate = new Map<string, number>();

  amountDiffChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  periodChangeChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  growthChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  private readonly inrTooltip = (value: number) =>
    '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  amountDiffChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y ?? 0;
            if (context.dataset.yAxisID === 'y1') {
              const prefix = value >= 0 ? '+' : '-';
              return `${context.dataset.label}: ${prefix}${this.inrTooltip(Math.abs(value)).slice(1)}`;
            }
            return `${context.dataset.label}: ${this.inrTooltip(value)}`;
          }
        }
      }
    },
    scales: {
      y: {
        position: 'left',
        title: { display: true, text: 'Portfolio Value' },
        ticks: { callback: (value) => '₹' + Number(value).toLocaleString('en-IN') }
      },
      y1: {
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Period Change' },
        ticks: { callback: (value) => '₹' + Number(value).toLocaleString('en-IN') }
      }
    }
  };

  periodChangeChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y ?? 0;
            const prefix = value >= 0 ? '+' : '';
            return `Change: ${prefix}${value.toFixed(2)}%`;
          }
        }
      }
    },
    scales: {
      y: {
        title: { display: true, text: '% vs Previous Snapshot' },
        ticks: { callback: (value) => `${value}%` }
      }
    }
  };

  growthChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${(context.parsed.y ?? 0).toFixed(2)}%`
        }
      }
    },
    scales: {
      y: {
        title: { display: true, text: '% Growth vs Current' },
        ticks: { callback: (value) => `${value}%` }
      }
    }
  };

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit() {
    this.loadFilterOptions();
    this.loadData();
  }

  refresh() {
    this.loadData();
  }

  toggleSort() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applySort();
  }

  toggleAdvancedFilters() {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  get availableFilterSubTypes(): string[] {
    let source = this.filterSummaryData;
    if (this.filterTypes.length) {
      source = source.filter((item) => this.filterTypes.includes(item.investment_type));
    }
    return [...new Set(source.map((item) => item.sub_type_name))].filter(Boolean).sort();
  }

  get availableFilterCategories(): string[] {
    let source = this.filterSummaryData;
    if (this.filterTypes.length) {
      source = source.filter((item) => this.filterTypes.includes(item.investment_type));
    }
    if (this.filterSubTypes.length) {
      source = source.filter((item) => this.filterSubTypes.includes(item.sub_type_name));
    }
    return [...new Set(source.map((item) => item.sub_type_category))].filter(Boolean).sort();
  }

  hasActiveFilters(): boolean {
    return !!(
      hasMultiSelectFilter(this.filterTypes) ||
      hasMultiSelectFilter(this.filterSubTypes) ||
      hasMultiSelectFilter(this.filterCategories) ||
      hasMultiSelectFilter(this.filterPlatforms) ||
      this.filterFrom ||
      this.filterTo ||
      this.isPriceFilterActive() ||
      this.filterIgnoreZero
    );
  }

  isPriceFilterActive(): boolean {
    return (this.filterMinAmount !== null && this.filterMinAmount !== undefined && !Number.isNaN(this.filterMinAmount)) ||
      (this.filterMaxAmount !== null && this.filterMaxAmount !== undefined && !Number.isNaN(this.filterMaxAmount));
  }

  onAdvancedTypeChange() {
    this.filterSubTypes = pruneSelections(this.filterSubTypes, this.availableFilterSubTypes);
    this.filterCategories = pruneSelections(this.filterCategories, this.availableFilterCategories);
  }

  onAdvancedSubTypeChange() {
    this.filterCategories = pruneSelections(this.filterCategories, this.availableFilterCategories);
  }

  getAnalyticsFilters(): AnalyticsFilters {
    return {
      from: this.filterFrom || undefined,
      to: this.filterTo || undefined,
      platform: this.filterPlatforms,
      type: this.filterTypes,
      subType: this.filterSubTypes,
      category: this.filterCategories,
      minAmount: this.filterMinAmount,
      maxAmount: this.filterMaxAmount,
      ignoreZero: this.filterIgnoreZero
    };
  }

  applyFilters() {
    this.applyingFilters = true;
    this.loadData();
  }

  clearFilters() {
    this.filterPlatforms = [];
    this.filterTypes = [];
    this.filterSubTypes = [];
    this.filterCategories = [];
    this.filterFrom = '';
    this.filterTo = '';
    this.filterMinAmount = null;
    this.filterMaxAmount = null;
    this.filterIgnoreZero = false;
    this.filterEmptyMessage = '';
    this.applyingFilters = true;
    this.loadData();
  }

  loadFilterOptions() {
    this.analyticsService.getSummaryTable().subscribe({
      next: (response) => {
        if (response.data) {
          this.filterSummaryData = response.data;
          this.filterPlatformsOptions = [...new Set(response.data.map((item: any) => item.website_app_name))]
            .filter(Boolean)
            .sort();
        }
      },
      error: (error) => console.error('Error loading filter options:', error)
    });
  }

  loadData() {
    this.loading = true;
    this.errorMessage = '';
    this.filterEmptyMessage = '';
    const filters = this.getAnalyticsFilters();
    const hasScopedFilters = this.hasScopedFilters();

    this.analyticsService.getValueSeriesFiltered(filters).subscribe({
      next: (response) => {
        const rawRows = response.data?.rows || [];
        const byDate = new Map<string, number>();

        for (const row of rawRows) {
          if (!row.change_date) continue;
          const dateKey = this.normalizeDateKey(row.change_date);
          if (!dateKey) continue;
          const amount = this.toNumber(row.total_value);
          byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + amount);
        }

        const sortedDates = [...byDate.keys()].sort(
          (a, b) => this.parseDateKey(a).getTime() - this.parseDateKey(b).getTime()
        );

        this.allSortedDates = sortedDates;
        this.allByDate = byDate;

        if (sortedDates.length === 0) {
          this.allSortedDates = [];
          this.allByDate = new Map();
          this.currentAmount = 0;
          this.clearView();
          this.filterEmptyMessage = this.hasActiveFilters()
            ? 'No snapshots found for the selected filters.'
            : '';
          this.finishLoading();
          return;
        }

        const latestDate = sortedDates[sortedDates.length - 1];
        const latestSnapshotAmount = byDate.get(latestDate) ?? 0;

        if (hasScopedFilters) {
          this.currentAmount = latestSnapshotAmount;
          this.rebuildFromStoredData();
          this.finishLoading();
          return;
        }

        this.analyticsService.getTotal().subscribe({
          next: (totalResponse) => {
            const liveTotal = this.toNumber(totalResponse.data?.total_amount);
            this.currentAmount = liveTotal > 0 ? liveTotal : latestSnapshotAmount;
            this.rebuildFromStoredData();
            this.finishLoading();
          },
          error: () => {
            this.currentAmount = latestSnapshotAmount;
            this.rebuildFromStoredData();
            this.finishLoading();
          }
        });
      },
      error: (error) => {
        console.error('Error loading asset tracker data:', error);
        this.errorMessage = 'Failed to load asset tracker data. ' + (error.message || 'Please check if backend is running.');
        this.finishLoading();
      }
    });
  }

  private hasScopedFilters(): boolean {
    return !!(
      hasMultiSelectFilter(this.filterTypes) ||
      hasMultiSelectFilter(this.filterSubTypes) ||
      hasMultiSelectFilter(this.filterCategories) ||
      hasMultiSelectFilter(this.filterPlatforms) ||
      this.isPriceFilterActive() ||
      this.filterIgnoreZero
    );
  }

  private finishLoading() {
    this.loading = false;
    this.applyingFilters = false;
  }

  private rebuildFromStoredData() {
    if (this.allSortedDates.length === 0) {
      this.clearView();
      return;
    }

    this.filterEmptyMessage = '';
    const latestInView = this.allSortedDates[this.allSortedDates.length - 1];
    this.buildRows(this.allSortedDates, this.allByDate, latestInView);
  }

  private clearView() {
    this.rows = [];
    this.displayRows = [];
    this.stats = null;
    this.currentTotalBreakdown = null;
    this.growthBreakdown = null;
    this.peakBreakdown = null;
    this.firstAmountBreakdown = null;
    this.lastSnapshotBreakdown = null;
    this.buildCharts();
  }

  private buildRows(sortedDates: string[], byDate: Map<string, number>, latestDate: string) {
    this.rows = sortedDates.map((dateKey, index) => {
      const amount = byDate.get(dateKey) ?? 0;
      const prevAmount = index > 0 ? (byDate.get(sortedDates[index - 1]) ?? 0) : 0;
      const prevDateKey = index > 0 ? sortedDates[index - 1] : null;
      const diffPreviousDate = index === 0 ? 0 : amount - prevAmount;
      const diffPreviousPercent = index === 0 || prevAmount === 0
        ? 0
        : (diffPreviousDate / prevAmount) * 100;
      const daysSincePrevious = prevDateKey
        ? this.daysBetween(this.parseDateKey(prevDateKey), this.parseDateKey(dateKey))
        : null;
      const diffWithCurrent = this.currentAmount - amount;
      const diffInL = diffWithCurrent / 100000;
      const monthsDiff = this.monthsBetween(this.parseDateKey(dateKey), this.parseDateKey(latestDate));
      const percent = amount !== 0 ? (diffWithCurrent / amount) * 100 : 0;

      return {
        date: dateKey,
        dateLabel: this.formatDateLabel(dateKey),
        amount,
        diffPreviousDate,
        diffPreviousPercent,
        daysSincePrevious,
        diffInL,
        monthsDiff,
        diffWithCurrent,
        percent,
        isLatest: dateKey === latestDate
      };
    });

    this.computeStats(latestDate);
    this.currentTotalBreakdown = getIndianAmountBreakdown(this.currentAmount);
    this.growthBreakdown = getIndianAmountBreakdown(this.stats?.totalGrowth ?? 0);
    this.peakBreakdown = getIndianAmountBreakdown(this.stats?.highestAmount ?? 0);
    this.firstAmountBreakdown = getIndianAmountBreakdown(this.stats?.firstAmount ?? 0);
    this.lastSnapshotBreakdown = getIndianAmountBreakdown(this.stats?.latestSnapshotAmount ?? 0);
    this.applySort();
    this.buildCharts();
  }

  private computeStats(latestDate: string) {
    if (this.rows.length === 0) {
      this.stats = null;
      return;
    }

    const first = this.rows[0];
    const latest = this.rows[this.rows.length - 1];
    const amounts = this.rows.map((r) => r.amount);
    const highest = Math.max(...amounts);
    const lowest = Math.min(...amounts);
    const highestRow = this.rows.find((r) => r.amount === highest)!;
    const lowestRow = this.rows.find((r) => r.amount === lowest)!;

    const periodRows = this.rows.slice(1);
    const periodChanges = periodRows.map((r) => r.diffPreviousDate);
    const avgPeriodChange = periodChanges.length
      ? periodChanges.reduce((a, b) => a + b, 0) / periodChanges.length
      : 0;

    const positivePeriods = periodRows.filter((r) => r.diffPreviousDate > 0).length;
    const negativePeriods = periodRows.filter((r) => r.diffPreviousDate < 0).length;

    let bestPeriod = periodRows.length > 0 ? periodRows[0] : null;
    let worstPeriod = periodRows.length > 0 ? periodRows[0] : null;
    for (const row of periodRows) {
      if (bestPeriod && row.diffPreviousPercent > bestPeriod.diffPreviousPercent) bestPeriod = row;
      if (worstPeriod && row.diffPreviousPercent < worstPeriod.diffPreviousPercent) worstPeriod = row;
    }

    const trackingMonths = Math.max(1, this.monthsBetween(
      this.parseDateKey(first.date),
      this.parseDateKey(latestDate)
    ));
    const trackingDays = this.daysBetween(
      this.parseDateKey(first.date),
      this.parseDateKey(latestDate)
    );
    const daysSinceLastSnapshot = this.daysBetween(
      this.parseDateKey(latestDate),
      new Date()
    );

    let cagr: number | null = null;
    if (first.amount > 0 && trackingMonths > 0) {
      const years = trackingMonths / 12;
      cagr = (Math.pow(this.currentAmount / first.amount, 1 / years) - 1) * 100;
    }

    const sinceLastSnapshot = this.currentAmount - latest.amount;
    const sinceLastSnapshotPercent = latest.amount !== 0
      ? (sinceLastSnapshot / latest.amount) * 100
      : 0;

    const totalGrowth = this.currentAmount - first.amount;
    const totalGrowthPercent = first.amount !== 0
      ? (totalGrowth / first.amount) * 100
      : 0;

    const drawdownFromPeak = this.currentAmount - highest;
    const drawdownFromPeakPercent = highest !== 0 ? (drawdownFromPeak / highest) * 100 : 0;
    const riseFromLow = this.currentAmount - lowest;
    const riseFromLowPercent = lowest !== 0 ? (riseFromLow / lowest) * 100 : 0;

    const lastPeriodChange = latest.diffPreviousDate;
    const lastPeriodChangePercent = latest.diffPreviousPercent;

    const insights = this.buildInsights({
      totalGrowthPercent,
      firstSnapshotLabel: first.dateLabel,
      drawdownFromPeakPercent,
      highestDateLabel: highestRow.dateLabel,
      sinceLastSnapshot,
      latestSnapshotLabel: latest.dateLabel,
      daysSinceLastSnapshot,
      positivePeriods,
      negativePeriods,
      snapshotCount: this.rows.length,
      trackingPeriodLabel: `${first.dateLabel} → ${latest.dateLabel}`,
      bestPeriodLabel: bestPeriod?.dateLabel ?? '',
      bestPeriodPercent: bestPeriod?.diffPreviousPercent ?? 0,
      worstPeriodLabel: worstPeriod?.dateLabel ?? '',
      worstPeriodPercent: worstPeriod?.diffPreviousPercent ?? 0,
      cagr
    });

    this.stats = {
      currentAmount: this.currentAmount,
      latestSnapshotLabel: latest.dateLabel,
      latestSnapshotAmount: latest.amount,
      firstSnapshotLabel: first.dateLabel,
      firstAmount: first.amount,
      snapshotCount: this.rows.length,
      totalGrowth,
      totalGrowthPercent,
      sinceLastSnapshot,
      sinceLastSnapshotPercent,
      highestAmount: highest,
      highestDateLabel: highestRow.dateLabel,
      lowestAmount: lowest,
      lowestDateLabel: lowestRow.dateLabel,
      cagr,
      trackingMonths,
      trackingDays,
      trackingPeriodLabel: `${first.dateLabel} → ${latest.dateLabel}`,
      avgPeriodChange,
      daysSinceLastSnapshot,
      drawdownFromPeak,
      drawdownFromPeakPercent,
      riseFromLow,
      riseFromLowPercent,
      positivePeriods,
      negativePeriods,
      bestPeriodLabel: bestPeriod?.dateLabel ?? '—',
      bestPeriodPercent: bestPeriod?.diffPreviousPercent ?? 0,
      worstPeriodLabel: worstPeriod?.dateLabel ?? '—',
      worstPeriodPercent: worstPeriod?.diffPreviousPercent ?? 0,
      lastPeriodChange,
      lastPeriodChangePercent,
      insights
    };
  }

  private buildInsights(ctx: {
    totalGrowthPercent: number;
    firstSnapshotLabel: string;
    drawdownFromPeakPercent: number;
    highestDateLabel: string;
    sinceLastSnapshot: number;
    latestSnapshotLabel: string;
    daysSinceLastSnapshot: number;
    positivePeriods: number;
    negativePeriods: number;
    snapshotCount: number;
    trackingPeriodLabel: string;
    bestPeriodLabel: string;
    bestPeriodPercent: number;
    worstPeriodLabel: string;
    worstPeriodPercent: number;
    cagr: number | null;
  }): string[] {
    const insights: string[] = [];

    if (ctx.totalGrowthPercent > 0) {
      insights.push(`Portfolio grew ${ctx.totalGrowthPercent.toFixed(2)}% since first snapshot (${ctx.firstSnapshotLabel}).`);
    } else if (ctx.totalGrowthPercent < 0) {
      insights.push(`Portfolio is down ${Math.abs(ctx.totalGrowthPercent).toFixed(2)}% since first snapshot (${ctx.firstSnapshotLabel}).`);
    } else {
      insights.push(`Portfolio is flat since first snapshot (${ctx.firstSnapshotLabel}).`);
    }

    if (ctx.drawdownFromPeakPercent < -0.01) {
      insights.push(`Currently ${Math.abs(ctx.drawdownFromPeakPercent).toFixed(2)}% below peak on ${ctx.highestDateLabel}.`);
    } else if (Math.abs(ctx.drawdownFromPeakPercent) <= 0.01) {
      insights.push(`At all-time high — peak recorded on ${ctx.highestDateLabel}.`);
    }

    if (Math.abs(ctx.sinceLastSnapshot) < 0.01) {
      insights.push(`Live total matches latest snapshot (${ctx.latestSnapshotLabel}) — ${ctx.daysSinceLastSnapshot} day(s) ago.`);
    } else if (ctx.sinceLastSnapshot > 0) {
      insights.push(`Live total is ₹${ctx.sinceLastSnapshot.toLocaleString('en-IN')} above last snapshot (${ctx.latestSnapshotLabel}).`);
    } else {
      insights.push(`Live total is ₹${Math.abs(ctx.sinceLastSnapshot).toLocaleString('en-IN')} below last snapshot (${ctx.latestSnapshotLabel}).`);
    }

    const totalPeriods = ctx.snapshotCount - 1;
    if (totalPeriods > 0) {
      insights.push(`${ctx.positivePeriods} up / ${ctx.negativePeriods} down periods across ${totalPeriods} intervals.`);
    }

    if (ctx.bestPeriodPercent > 0 && ctx.bestPeriodLabel) {
      insights.push(`Best period: +${ctx.bestPeriodPercent.toFixed(2)}% on ${ctx.bestPeriodLabel}.`);
    }
    if (ctx.worstPeriodPercent < 0 && ctx.worstPeriodLabel) {
      insights.push(`Worst period: ${ctx.worstPeriodPercent.toFixed(2)}% on ${ctx.worstPeriodLabel}.`);
    }

    if (ctx.cagr !== null) {
      insights.push(`Tracking ${ctx.trackingPeriodLabel} (${ctx.snapshotCount} snapshots).`);
    }

    return insights;
  }

  private applySort() {
    this.displayRows = [...this.rows].sort((a, b) => {
      const diff = this.parseDateKey(a.date).getTime() - this.parseDateKey(b.date).getTime();
      return this.sortDirection === 'asc' ? diff : -diff;
    });
  }

  private buildCharts() {
    const chronological = [...this.rows];
    const labels = chronological.map((row) => row.dateLabel);

    this.amountDiffChartData = {
      labels,
      datasets: [
        {
          label: 'Portfolio Value',
          data: chronological.map((row) => row.amount),
          borderColor: 'rgba(14, 165, 233, 1)',
          backgroundColor: 'rgba(14, 165, 233, 0.12)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          yAxisID: 'y'
        },
        {
          label: 'Period Change',
          data: chronological.map((row) => row.diffPreviousDate),
          borderColor: 'rgba(30, 64, 175, 1)',
          backgroundColor: 'rgba(30, 64, 175, 0.08)',
          tension: 0.3,
          fill: false,
          pointRadius: 2,
          yAxisID: 'y1'
        }
      ]
    };

    const periodRows = chronological.filter((_, i) => i > 0);
    this.periodChangeChartData = {
      labels: periodRows.map((row) => row.dateLabel),
      datasets: [{
        label: 'Period % Change',
        data: periodRows.map((row) => row.diffPreviousPercent),
        backgroundColor: periodRows.map((row) =>
          row.diffPreviousPercent >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'
        ),
        borderColor: periodRows.map((row) =>
          row.diffPreviousPercent >= 0 ? 'rgba(16, 185, 129, 1)' : 'rgba(239, 68, 68, 1)'
        ),
        borderWidth: 1
      }]
    };

    this.growthChartData = {
      labels,
      datasets: [{
        label: 'Growth vs Current (%)',
        data: chronological.map((row) => row.percent),
        borderColor: 'rgba(118, 75, 162, 1)',
        backgroundColor: 'rgba(118, 75, 162, 0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3
      }]
    };
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private normalizeDateKey(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      return this.toDateKey(value);
    }

    const str = String(value).trim();
    const dateOnlyMatch = str.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnlyMatch) return dateOnlyMatch[1];

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) return this.toDateKey(parsed);

    return '';
  }

  private toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private formatDateLabel(dateKey: string): string {
    const d = this.parseDateKey(dateKey);
    if (Number.isNaN(d.getTime())) return dateKey;
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    return `${day}/${month}/${d.getFullYear()}`;
  }

  private monthsBetween(from: Date, to: Date): number {
    const years = to.getFullYear() - from.getFullYear();
    const months = to.getMonth() - from.getMonth();
    return Math.max(0, years * 12 + months);
  }

  private daysBetween(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
  }

  isNegative(value: number): boolean {
    return value < 0;
  }

  isPositive(value: number): boolean {
    return value > 0;
  }

  getIndianBreakdown(value: number): IndianAmountBreakdown {
    return getIndianAmountBreakdown(value);
  }
}
