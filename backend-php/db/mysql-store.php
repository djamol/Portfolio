<?php

function mysql_store_get_all_investments(): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->query('SELECT * FROM investments ORDER BY investment_date DESC, created_at DESC');
    return $stmt->fetchAll();
}

function mysql_store_search_investments(array $criteria): array
{
    $pool = mysql_get_pool();
    $query = 'SELECT * FROM investments WHERE 1=1';
    $params = [];

    if (!empty($criteria['website_app_name'])) {
        $query .= ' AND website_app_name = ?';
        $params[] = $criteria['website_app_name'];
    }
    if (!empty($criteria['sub_type_name'])) {
        $query .= ' AND sub_type_name = ?';
        $params[] = $criteria['sub_type_name'];
    }
    if (!empty($criteria['sub_type_category'])) {
        $query .= ' AND sub_type_category = ?';
        $params[] = $criteria['sub_type_category'];
    }

    $query .= ' ORDER BY investment_date DESC, created_at DESC';
    $stmt = $pool->prepare($query);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function mysql_store_get_investment_by_id($id): ?array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('SELECT * FROM investments WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function mysql_store_create_investment(array $data): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare(
        'INSERT INTO investments (website_app_name, investment_type, sub_type_name, sub_type_category, amount, investment_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $data['website_app_name'],
        $data['investment_type'],
        $data['sub_type_name'] ?? null,
        $data['sub_type_category'] ?? null,
        $data['amount'],
        $data['investment_date'],
        $data['notes'] ?? null,
    ]);

    $insertId = (int) $pool->lastInsertId();

    $hist = $pool->prepare(
        'INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
         VALUES (?, ?, ?, \'added\', ?)'
    );
    $hist->execute([$insertId, $data['amount'], $data['investment_date'], $data['notes'] ?? null]);

    return mysql_store_get_investment_by_id($insertId);
}

function mysql_store_update_investment($id, array $data): ?array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('SELECT amount FROM investments WHERE id = ?');
    $stmt->execute([$id]);
    $oldInvestment = $stmt->fetch();
    if (!$oldInvestment) {
        return null;
    }

    $update = $pool->prepare(
        'UPDATE investments
         SET website_app_name = ?, investment_type = ?, sub_type_name = ?,
             sub_type_category = ?, amount = ?, investment_date = ?, notes = ?
         WHERE id = ?'
    );
    $update->execute([
        $data['website_app_name'],
        $data['investment_type'],
        $data['sub_type_name'] ?? null,
        $data['sub_type_category'] ?? null,
        $data['amount'],
        $data['investment_date'],
        $data['notes'] ?? null,
        $id,
    ]);

    if ((float) $oldInvestment['amount'] !== (float) $data['amount']) {
        $changeDate = $data['investment_date'] ?? gmdate('Y-m-d');
        $hist = $pool->prepare(
            'INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
             VALUES (?, ?, ?, \'updated\', ?)'
        );
        $hist->execute([$id, $data['amount'], $changeDate, $data['notes'] ?? null]);
    }

    return mysql_store_get_investment_by_id($id);
}

function mysql_store_delete_investment($id): bool
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('SELECT * FROM investments WHERE id = ?');
    $stmt->execute([$id]);
    $investment = $stmt->fetch();
    if (!$investment) {
        return false;
    }

    $hist = $pool->prepare(
        'INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
         VALUES (?, ?, ?, \'removed\', ?)'
    );
    $hist->execute([$id, $investment['amount'], gmdate('Y-m-d'), $investment['notes'] ?? null]);

    $del = $pool->prepare('DELETE FROM investments WHERE id = ?');
    $del->execute([$id]);
    return true;
}

function mysql_store_get_all_sub_type_names(): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->query('SELECT * FROM sub_type_names ORDER BY investment_type, name ASC');
    return $stmt->fetchAll();
}

function mysql_store_get_sub_type_names_by_type(string $investmentType): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('SELECT * FROM sub_type_names WHERE investment_type = ? ORDER BY name ASC');
    $stmt->execute([$investmentType]);
    return $stmt->fetchAll();
}

function mysql_store_create_sub_type_name(array $data): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('INSERT INTO sub_type_names (name, investment_type) VALUES (?, ?)');
    $stmt->execute([$data['name'], $data['investment_type']]);
    $insertId = (int) $pool->lastInsertId();
    return mysql_store_get_sub_type_name_by_id($insertId);
}

function mysql_store_get_sub_type_name_by_id(int $id): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('SELECT * FROM sub_type_names WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function mysql_store_delete_sub_type_name($id): void
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('DELETE FROM sub_type_names WHERE id = ?');
    $stmt->execute([$id]);
}

function mysql_store_get_categories(string $investmentType, ?string $subTypeNameId): array
{
    $pool = mysql_get_pool();
    $query = '
        SELECT c.*, s.name as sub_type_name
        FROM sub_type_categories c
        LEFT JOIN sub_type_names s ON c.sub_type_name_id = s.id
        WHERE c.investment_type = ?
    ';
    $params = [$investmentType];

    if ($subTypeNameId && $subTypeNameId !== 'null') {
        $query .= ' AND (c.sub_type_name_id = ? OR c.sub_type_name_id IS NULL)';
        $params[] = $subTypeNameId;
    }

    $query .= ' ORDER BY c.category ASC';
    $stmt = $pool->prepare($query);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function mysql_store_create_category(array $data): array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare(
        'INSERT INTO sub_type_categories (category, sub_type_name_id, investment_type) VALUES (?, ?, ?)'
    );
    $stmt->execute([
        $data['category'],
        $data['sub_type_name_id'] ?? null,
        $data['investment_type'],
    ]);
    $insertId = (int) $pool->lastInsertId();

    $fetch = $pool->prepare(
        'SELECT c.*, s.name as sub_type_name FROM sub_type_categories c
         LEFT JOIN sub_type_names s ON c.sub_type_name_id = s.id WHERE c.id = ?'
    );
    $fetch->execute([$insertId]);
    return $fetch->fetch();
}

function mysql_store_delete_category($id): void
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare('DELETE FROM sub_type_categories WHERE id = ?');
    $stmt->execute([$id]);
}

function mysql_store_find_investment_by_key(array $key): ?array
{
    $pool = mysql_get_pool();
    $stmt = $pool->prepare(
        'SELECT id FROM investments
         WHERE website_app_name = ? AND investment_type = ? AND sub_type_name = ? AND sub_type_category = ?
         LIMIT 1'
    );
    $stmt->execute([
        $key['website_app_name'],
        $key['investment_type'],
        $key['sub_type_name'] ?? null,
        $key['sub_type_category'] ?? null,
    ]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function mysql_store_upsert_imported_investment(array $investment): array
{
    $existing = mysql_store_find_investment_by_key($investment);
    $pool = mysql_get_pool();

    if ($existing) {
        $update = $pool->prepare(
            'UPDATE investments
             SET amount = ?, investment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?'
        );
        $update->execute([
            $investment['amount'],
            $investment['investment_date'],
            $investment['notes'] ?? null,
            $existing['id'],
        ]);

        $hist = $pool->prepare(
            'INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
             VALUES (?, ?, ?, \'updated\', ?)'
        );
        $hist->execute([
            $existing['id'],
            $investment['amount'],
            $investment['investment_date'],
            $investment['notes'] ?? null,
        ]);

        return ['action' => 'updated', 'id' => $existing['id']];
    }

    $created = mysql_store_create_investment($investment);
    return ['action' => 'imported', 'id' => $created['id']];
}
