#!/usr/bin/env node
/**
 * CLI: sync sub_type_names / sub_type_categories from investments.
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/sync-lookup-from-investments.js
 *
 * Prefer the API when the server is running:
 *   POST /api/categories/sync-from-investments
 */

const path = require('path');

async function main() {
  // Ensure backend .env is loaded the same way as the server
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

  const db = require('../config/index');
  const store = require('../db');
  const { syncLookupTablesFromInvestments } = require('../utils/sync-lookup-tables');

  console.log(`Connecting (${db.getDbType()})...`);
  await db.initializeDatabase();

  console.log('Syncing lookup tables from investments...');
  const summary = await syncLookupTablesFromInvestments(store);

  console.log(JSON.stringify(summary.counts, null, 2));
  if (summary.sub_type_names.added.length) {
    console.log('Names added:', summary.sub_type_names.added.map((r) => r.name).join(', '));
  }
  if (summary.sub_type_categories.added.length) {
    console.log(
      'Categories added:',
      summary.sub_type_categories.added.map((r) => r.category).join(', ')
    );
  }
  if (summary.sub_type_names.errors.length || summary.sub_type_categories.errors.length) {
    console.error('Errors:', {
      names: summary.sub_type_names.errors,
      categories: summary.sub_type_categories.errors
    });
    process.exitCode = 1;
  }

  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error('Sync failed:', error);
  process.exit(1);
});
