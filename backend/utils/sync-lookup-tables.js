/**
 * Sync sub_type_names / sub_type_categories from distinct investment groupings.
 * Used by POST /api/categories/sync-from-investments and the CLI script.
 */

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function buildNameKey(investmentType, name) {
  return `${investmentType}::${name}`;
}

function buildCategoryKey(investmentType, category, subTypeNameId) {
  return `${investmentType}::${category}::${subTypeNameId == null ? 'null' : subTypeNameId}`;
}

/**
 * @param {object} store - mysql-store or mongo-store exports
 * @returns {Promise<object>} sync summary
 */
async function syncLookupTablesFromInvestments(store) {
  const investments = await store.getAllInvestments();
  const existingNames = await store.getAllSubTypeNames();
  const existingCategories = typeof store.getAllCategories === 'function'
    ? await store.getAllCategories()
    : [];

  const summary = {
    scannedInvestments: investments.length,
    sub_type_names: { added: [], skipped: [], errors: [] },
    sub_type_categories: { added: [], skipped: [], errors: [] }
  };

  // name (global unique in schema) → row
  const namesByName = new Map(existingNames.map((row) => [row.name, row]));
  // type+name → row (for linking categories)
  const namesByTypeAndName = new Map(
    existingNames.map((row) => [buildNameKey(row.investment_type, row.name), row])
  );

  const nameGroups = new Map();
  const categoryGroups = new Map();

  for (const inv of investments) {
    const investmentType = normalizeText(inv.investment_type);
    const subTypeName = normalizeText(inv.sub_type_name);
    const subTypeCategory = normalizeText(inv.sub_type_category);
    if (!investmentType) continue;

    if (subTypeName) {
      const key = buildNameKey(investmentType, subTypeName);
      if (!nameGroups.has(key)) {
        nameGroups.set(key, { investment_type: investmentType, name: subTypeName });
      }
    }

    if (subTypeCategory) {
      const key = `${investmentType}::${subTypeName || ''}::${subTypeCategory}`;
      if (!categoryGroups.has(key)) {
        categoryGroups.set(key, {
          investment_type: investmentType,
          sub_type_name: subTypeName,
          category: subTypeCategory
        });
      }
    }
  }

  for (const group of nameGroups.values()) {
    const byName = namesByName.get(group.name);
    if (byName) {
      summary.sub_type_names.skipped.push({
        name: group.name,
        investment_type: group.investment_type,
        reason: byName.investment_type === group.investment_type
          ? 'already exists'
          : `name already exists under ${byName.investment_type}`
      });
      namesByTypeAndName.set(buildNameKey(group.investment_type, group.name), byName);
      continue;
    }

    try {
      const created = await store.createSubTypeName({
        name: group.name,
        investment_type: group.investment_type
      });
      namesByName.set(created.name, created);
      namesByTypeAndName.set(buildNameKey(created.investment_type, created.name), created);
      summary.sub_type_names.added.push({
        id: created.id,
        name: created.name,
        investment_type: created.investment_type
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        summary.sub_type_names.skipped.push({
          name: group.name,
          investment_type: group.investment_type,
          reason: 'duplicate'
        });
      } else {
        summary.sub_type_names.errors.push({
          name: group.name,
          investment_type: group.investment_type,
          error: error.message
        });
      }
    }
  }

  const categoriesByKey = new Map();
  const categoriesByTypeAndCategory = new Set();
  for (const row of existingCategories) {
    categoriesByKey.set(
      buildCategoryKey(row.investment_type, row.category, row.sub_type_name_id ?? null),
      row
    );
    categoriesByTypeAndCategory.add(`${row.investment_type}::${row.category}`);
  }

  for (const group of categoryGroups.values()) {
    let subTypeNameId = null;
    if (group.sub_type_name) {
      const linked =
        namesByTypeAndName.get(buildNameKey(group.investment_type, group.sub_type_name)) ||
        namesByName.get(group.sub_type_name);
      subTypeNameId = linked?.id ?? null;
    }

    const exactKey = buildCategoryKey(group.investment_type, group.category, subTypeNameId);
    const typeCategoryKey = `${group.investment_type}::${group.category}`;

    if (categoriesByKey.has(exactKey) || categoriesByTypeAndCategory.has(typeCategoryKey)) {
      summary.sub_type_categories.skipped.push({
        category: group.category,
        investment_type: group.investment_type,
        sub_type_name: group.sub_type_name,
        sub_type_name_id: subTypeNameId,
        reason: 'already exists'
      });
      continue;
    }

    try {
      const created = await store.createCategory({
        category: group.category,
        investment_type: group.investment_type,
        sub_type_name_id: subTypeNameId
      });
      categoriesByKey.set(
        buildCategoryKey(created.investment_type, created.category, created.sub_type_name_id ?? null),
        created
      );
      categoriesByTypeAndCategory.add(`${created.investment_type}::${created.category}`);
      summary.sub_type_categories.added.push({
        id: created.id,
        category: created.category,
        investment_type: created.investment_type,
        sub_type_name_id: created.sub_type_name_id ?? null,
        sub_type_name: group.sub_type_name
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        summary.sub_type_categories.skipped.push({
          category: group.category,
          investment_type: group.investment_type,
          sub_type_name: group.sub_type_name,
          reason: 'duplicate'
        });
      } else {
        summary.sub_type_categories.errors.push({
          category: group.category,
          investment_type: group.investment_type,
          sub_type_name: group.sub_type_name,
          error: error.message
        });
      }
    }
  }

  summary.counts = {
    distinctNameGroups: nameGroups.size,
    distinctCategoryGroups: categoryGroups.size,
    namesAdded: summary.sub_type_names.added.length,
    namesSkipped: summary.sub_type_names.skipped.length,
    namesErrors: summary.sub_type_names.errors.length,
    categoriesAdded: summary.sub_type_categories.added.length,
    categoriesSkipped: summary.sub_type_categories.skipped.length,
    categoriesErrors: summary.sub_type_categories.errors.length
  };

  return summary;
}

module.exports = {
  syncLookupTablesFromInvestments
};
