import { Component, OnInit } from '@angular/core';
import { AnalyticsService, DeltaRow, InsightsResponse, ValueSeriesResponse } from '../../services/analytics.service';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { getIndianAmountBreakdown, IndianAmountBreakdown } from '../../utils/indian-number.util';

const WATCHLIST_KEY = 'investment-tracker-watchlist';

type SummaryRow = {
  id: number;
  website_app_name: string;
  investment_type: string;
  sub_type_name: string | null;
  sub_type_category: string | null;
  amount: number;
  investment_date: Date;
  notes?: string | null;
};

type MaturityItem = {
  id: number;
  name: string;
  type: string;
  amount: number;
  maturityDate: Date;
  daysLeft: number;
  source: 'notes' | 'estimate';
};

type TaxBucket = {
  label: string;
  amount: number;
  percent: number;
  count: number;
};

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  standalone: false
})
export class DashboardComponent implements OnInit {
  loading = true;
  errorMessage = '';

  totalAmount = 0;
  totalInvestments = 0;
  totalBreakdown: IndianAmountBreakdown | null = null;
  insights: InsightsResponse | null = null;
  daysSinceSnapshot: number | null = null;

  summaryRows: SummaryRow[] = [];
  watchlistIds: number[] = [];
  watchlistRows: SummaryRow[] = [];

  topGainers: DeltaRow[] = [];
  topLosers: DeltaRow[] = [];
  deltaFrom = '';
  deltaTo = '';

  maturityItems: MaturityItem[] = [];
  taxBuckets: TaxBucket[] = [];
  taxTotal = 0;
  taxPercentOfPortfolio = 0;

  allocationChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: [
        'rgba(59, 130, 246, 0.85)',
        'rgba(16, 185, 129, 0.85)',
        'rgba(245, 158, 11, 0.85)',
        'rgba(239, 68, 68, 0.85)',
        'rgba(118, 75, 162, 0.85)',
        'rgba(14, 165, 233, 0.85)',
        'rgba(236, 72, 153, 0.85)',
        'rgba(34, 197, 94, 0.85)'
      ]
    }]
  };

  sparklineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };

  doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = Number(ctx.parsed) || 0;
            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + (Number(b) || 0), 0);
            const pct = total > 0 ? (value / total) * 100 : 0;
            return `${ctx.label}: ₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (${pct.toFixed(1)}%)`;
          }
        }
      }
    }
  };

  sparklineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `₹${(ctx.parsed.y ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        }
      }
    },
    scales: {
      x: { ticks: { maxTicksLimit: 6 } },
      y: {
        ticks: {
          callback: (value) => '₹' + Number(value).toLocaleString('en-IN')
        }
      }
    }
  };

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit() {
    this.loadWatchlistIds();
    this.refresh();
  }

  refresh() {
    this.loading = true;
    this.errorMessage = '';
    this.deltaFrom = '';
    this.deltaTo = '';
    this.topGainers = [];
    this.topLosers = [];
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending <= 0) this.loading = false;
    };

    this.analyticsService.getTotal().subscribe({
      next: (res) => {
        this.totalAmount = this.toNumber(res.data?.total_amount);
        this.totalInvestments = this.toNumber(res.data?.total_investments);
        this.totalBreakdown = getIndianAmountBreakdown(this.totalAmount);
        if (this.summaryRows.length) this.buildTaxBuckets();
        done();
      },
      error: () => {
        this.errorMessage = 'Failed to load portfolio totals.';
        done();
      }
    });

    this.analyticsService.getInsights().subscribe({
      next: (res) => {
        this.insights = res.data;
        this.daysSinceSnapshot = res.data?.daysSinceLatestSnapshot ?? null;
        // Prefer insights snapshot pair so movers match "VS PREVIOUS SNAPSHOT".
        const from = this.dateKey(res.data?.prevDate);
        const to = this.dateKey(res.data?.latestDate);
        if (from && to && from !== to) {
          this.deltaFrom = from;
          this.deltaTo = to;
          this.loadMovers();
        }
        done();
      },
      error: () => done()
    });

    this.analyticsService.getAllocationLatest().subscribe({
      next: (res) => {
        const rows = [...(res.data || [])].sort(
          (a, b) => this.toNumber(b.value) - this.toNumber(a.value)
        );
        this.allocationChartData = {
          labels: rows.map((r) => r.investment_type),
          datasets: [{
            ...this.allocationChartData.datasets[0],
            data: rows.map((r) => this.toNumber(r.value))
          }]
        };
        done();
      },
      error: () => done()
    });

    const from = this.monthsAgoKey(12);
    this.analyticsService.getValueSeriesFiltered({ from }).subscribe({
      next: (res) => {
        this.buildSparkline(res.data);
        // Fallback only when insights did not supply a snapshot pair.
        if (!this.deltaFrom || !this.deltaTo) {
          this.setupDeltaDates(res.data);
          if (this.deltaFrom && this.deltaTo) {
            this.loadMovers();
          }
        }
        done();
      },
      error: () => done()
    });

    this.analyticsService.getSummaryTable().subscribe({
      next: (res) => {
        this.summaryRows = (res.data || []).map((item: any) => ({
          id: Number(item.id),
          website_app_name: item.website_app_name,
          investment_type: item.investment_type,
          sub_type_name: item.sub_type_name,
          sub_type_category: item.sub_type_category,
          amount: this.toNumber(item.amount),
          investment_date: new Date(item.investment_date),
          notes: item.notes ?? null
        }));
        this.rebuildWatchlistRows();
        this.buildTaxBuckets();
        this.buildMaturityWatch();
      },
      error: () => { /* non-blocking */ }
    });
  }

  toggleWatchlist(id: number) {
    if (this.watchlistIds.includes(id)) {
      this.watchlistIds = this.watchlistIds.filter((x) => x !== id);
    } else {
      this.watchlistIds = [...this.watchlistIds, id];
    }
    this.persistWatchlist();
    this.rebuildWatchlistRows();
  }

  isWatched(id: number): boolean {
    return this.watchlistIds.includes(id);
  }

  pinTopHoldings() {
    const tops = (this.insights?.topHoldings || []).slice(0, 5);
    for (const h of tops) {
      if (!this.watchlistIds.includes(h.investment_id)) {
        this.watchlistIds.push(h.investment_id);
      }
    }
    this.persistWatchlist();
    this.rebuildWatchlistRows();
  }

  clearWatchlist() {
    this.watchlistIds = [];
    this.persistWatchlist();
    this.watchlistRows = [];
  }

  freshnessTone(): string {
    if (this.daysSinceSnapshot === null) return 'neutral';
    if (this.daysSinceSnapshot <= 7) return 'good';
    if (this.daysSinceSnapshot <= 21) return 'warn';
    return 'bad';
  }

  toNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  private loadMovers() {
    this.analyticsService.getDelta(this.deltaFrom, this.deltaTo).subscribe({
      next: (res) => {
        const rows = (res.data || []).filter((r) => this.toNumber(r.delta) !== 0);
        this.topGainers = [...rows].sort((a, b) => this.toNumber(b.delta) - this.toNumber(a.delta)).slice(0, 5);
        this.topLosers = [...rows].sort((a, b) => this.toNumber(a.delta) - this.toNumber(b.delta)).slice(0, 5);
      },
      error: () => {
        this.topGainers = [];
        this.topLosers = [];
      }
    });
  }

  private buildSparkline(payload: ValueSeriesResponse | undefined) {
    const rows = payload?.rows || [];
    if (!rows.length || payload?.mode === 'series') {
      // Aggregate series mode by date if needed
      const byDate = new Map<string, number>();
      for (const row of rows) {
        const key = String(row.change_date).slice(0, 10);
        byDate.set(key, (byDate.get(key) ?? 0) + this.toNumber(row.total_value));
      }
      const dates = [...byDate.keys()].sort();
      this.sparklineChartData = {
        labels: dates.map((d) => this.formatLabel(d)),
        datasets: [{
          label: 'Portfolio',
          data: dates.map((d) => byDate.get(d) ?? 0),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      };
      return;
    }

    const sorted = [...rows].sort(
      (a, b) => new Date(a.change_date).getTime() - new Date(b.change_date).getTime()
    );
    this.sparklineChartData = {
      labels: sorted.map((r) => this.formatLabel(String(r.change_date))),
      datasets: [{
        label: 'Portfolio',
        data: sorted.map((r) => this.toNumber(r.total_value)),
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    };
  }

  private setupDeltaDates(payload: ValueSeriesResponse | undefined) {
    const dates = [...new Set((payload?.rows || []).map((r) => this.dateKey(r.change_date)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (dates.length >= 2) {
      this.deltaFrom = dates[dates.length - 2];
      this.deltaTo = dates[dates.length - 1];
    } else if (dates.length === 1) {
      this.deltaFrom = dates[0];
      this.deltaTo = dates[0];
    }
  }

  /** Normalize API dates to YYYY-MM-DD without UTC day-shift (IST-safe). */
  private dateKey(value: unknown): string {
    if (value == null || value === '') return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    return s.slice(0, 10);
  }

  private buildTaxBuckets() {
    const taxLike = this.summaryRows.filter((r) => this.isTaxRelated(r));
    this.taxTotal = taxLike.reduce((s, r) => s + r.amount, 0);
    const portfolioBase = this.totalAmount > 0
      ? this.totalAmount
      : this.summaryRows.reduce((s, r) => s + r.amount, 0);
    this.taxPercentOfPortfolio = portfolioBase > 0 ? (this.taxTotal / portfolioBase) * 100 : 0;

    const map = new Map<string, { amount: number; count: number }>();
    for (const row of taxLike) {
      const label = row.sub_type_name || row.investment_type;
      const cur = map.get(label) || { amount: 0, count: 0 };
      cur.amount += row.amount;
      cur.count += 1;
      map.set(label, cur);
    }
    this.taxBuckets = [...map.entries()]
      .map(([label, v]) => ({
        label,
        amount: v.amount,
        count: v.count,
        percent: this.taxTotal > 0 ? (v.amount / this.taxTotal) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }

  private isTaxRelated(row: SummaryRow): boolean {
    const blob = [
      row.investment_type,
      row.sub_type_name || '',
      row.sub_type_category || ''
    ].join(' ').toLowerCase();
    return (
      blob.includes('tax') ||
      blob.includes('elss') ||
      blob.includes('ppf') ||
      row.investment_type === 'PPF'
    );
  }

  private buildMaturityWatch() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const items: MaturityItem[] = [];

    for (const row of this.summaryRows) {
      if (!['FD', 'Bond', 'PPF'].includes(row.investment_type)) continue;

      const fromNotes = this.parseMaturityFromNotes(row.notes);
      if (fromNotes) {
        const daysLeft = Math.round((fromNotes.getTime() - today.getTime()) / 86400000);
        if (daysLeft >= -30 && daysLeft <= 365) {
          items.push({
            id: row.id,
            name: `${row.website_app_name} · ${row.sub_type_name || row.investment_type}`,
            type: row.investment_type,
            amount: row.amount,
            maturityDate: fromNotes,
            daysLeft,
            source: 'notes'
          });
        }
        continue;
      }

      // Soft estimate from investment date + category tenor
      if (!row.investment_date || Number.isNaN(row.investment_date.getTime())) continue;
      const months = this.estimateTenorMonths(row);
      if (!months) continue;
      const maturity = new Date(row.investment_date);
      maturity.setMonth(maturity.getMonth() + months);
      const daysLeft = Math.round((maturity.getTime() - today.getTime()) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 180) {
        items.push({
          id: row.id,
          name: `${row.website_app_name} · ${row.sub_type_name || row.investment_type}`,
          type: row.investment_type,
          amount: row.amount,
          maturityDate: maturity,
          daysLeft,
          source: 'estimate'
        });
      }
    }

    this.maturityItems = items.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8);
  }

  private parseMaturityFromNotes(notes: string | null | undefined): Date | null {
    if (!notes) return null;
    const match = notes.match(/maturity\s*[:=]\s*(\d{4}-\d{2}-\d{2})/i)
      || notes.match(/matures?\s*[:=]?\s*(\d{4}-\d{2}-\d{2})/i);
    if (!match) return null;
    const d = new Date(match[1]);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private estimateTenorMonths(row: SummaryRow): number | null {
    const cat = (row.sub_type_category || '').toLowerCase();
    if (cat.includes('short')) return 12;
    if (cat.includes('medium')) return 36;
    if (cat.includes('long') || row.investment_type === 'PPF') return 60;
    if (row.investment_type === 'FD') return 12;
    if (row.investment_type === 'Bond') return 36;
    return null;
  }

  private loadWatchlistIds() {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.watchlistIds = parsed.map(Number).filter((n) => Number.isFinite(n));
      }
    } catch { /* ignore */ }
  }

  private persistWatchlist() {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(this.watchlistIds));
    } catch { /* ignore */ }
  }

  private rebuildWatchlistRows() {
    const set = new Set(this.watchlistIds);
    this.watchlistRows = this.summaryRows.filter((r) => set.has(r.id));
  }

  private monthsAgoKey(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatLabel(dateStr: string): string {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
}
