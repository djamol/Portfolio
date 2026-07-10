<?php

function snapshot_parse_list_param($value): array
{
    if ($value === null || $value === '') {
        return [];
    }
    return array_values(array_filter(array_map('trim', explode(',', (string) $value))));
}

function snapshot_parse_number_param($value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }
    $n = (float) $value;
    return is_finite($n) ? $n : null;
}

function snapshot_parse_bool_param($value): bool
{
    return $value === true || $value === 'true' || $value === '1';
}

function snapshot_amount_as_of_subquery(string $investmentAlias, string $asOfDateExpr): string
{
    return "COALESCE(
        (
            SELECT ih.amount
            FROM investment_history ih
            WHERE ih.investment_id = {$investmentAlias}.id
                AND ih.change_date <= {$asOfDateExpr}
            ORDER BY ih.change_date DESC, ih.id DESC
            LIMIT 1
        ),
        {$investmentAlias}.amount
    )";
}

function snapshot_build_investment_filter_clauses(array $query, array &$params, string $alias = 'i'): array
{
    $clauses = [];

    $platforms = snapshot_parse_list_param($query['platform'] ?? null);
    if (count($platforms) === 1) {
        $clauses[] = "{$alias}.website_app_name = ?";
        $params[] = $platforms[0];
    } elseif (count($platforms) > 1) {
        $clauses[] = "{$alias}.website_app_name IN (" . implode(', ', array_fill(0, count($platforms), '?')) . ')';
        array_push($params, ...$platforms);
    }

    $types = snapshot_parse_list_param($query['type'] ?? null);
    if (count($types) === 1) {
        $clauses[] = "{$alias}.investment_type = ?";
        $params[] = $types[0];
    } elseif (count($types) > 1) {
        $clauses[] = "{$alias}.investment_type IN (" . implode(', ', array_fill(0, count($types), '?')) . ')';
        array_push($params, ...$types);
    }

    $subTypes = snapshot_parse_list_param($query['subType'] ?? null);
    if (count($subTypes) === 1) {
        $clauses[] = "{$alias}.sub_type_name = ?";
        $params[] = $subTypes[0];
    } elseif (count($subTypes) > 1) {
        $clauses[] = "{$alias}.sub_type_name IN (" . implode(', ', array_fill(0, count($subTypes), '?')) . ')';
        array_push($params, ...$subTypes);
    }

    $categories = snapshot_parse_list_param($query['category'] ?? null);
    if (count($categories) === 1) {
        $clauses[] = "{$alias}.sub_type_category = ?";
        $params[] = $categories[0];
    } elseif (count($categories) > 1) {
        $clauses[] = "{$alias}.sub_type_category IN (" . implode(', ', array_fill(0, count($categories), '?')) . ')';
        array_push($params, ...$categories);
    }

    return $clauses;
}

function snapshot_build_amount_filter_clauses(array $query, array &$params, string $amountExpr): array
{
    $clauses = [];
    $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
    $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);

    if ($minAmount !== null) {
        $clauses[] = "{$amountExpr} >= ?";
        $params[] = $minAmount;
    }
    if ($maxAmount !== null) {
        $clauses[] = "{$amountExpr} <= ?";
        $params[] = $maxAmount;
    }
    if (snapshot_parse_bool_param($query['ignoreZero'] ?? null)) {
        $clauses[] = "{$amountExpr} <> 0";
    }

    return $clauses;
}

function snapshot_parse_analytics_filters(array $query): array
{
    return [
        'from' => $query['from'] ?? null,
        'to' => $query['to'] ?? null,
        'platforms' => snapshot_parse_list_param($query['platform'] ?? null),
        'types' => snapshot_parse_list_param($query['type'] ?? null),
        'subTypes' => snapshot_parse_list_param($query['subType'] ?? null),
        'categories' => snapshot_parse_list_param($query['category'] ?? null),
        'minAmount' => snapshot_parse_number_param($query['minAmount'] ?? null),
        'maxAmount' => snapshot_parse_number_param($query['maxAmount'] ?? null),
        'ignoreZero' => snapshot_parse_bool_param($query['ignoreZero'] ?? null),
    ];
}

function snapshot_resolve_series_breakdown(array $query): ?array
{
    $platforms = snapshot_parse_list_param($query['platform'] ?? null);
    $types = snapshot_parse_list_param($query['type'] ?? null);
    $subTypes = snapshot_parse_list_param($query['subType'] ?? null);
    $categories = snapshot_parse_list_param($query['category'] ?? null);

    $candidates = [];
    if (count($types)) {
        $candidates[] = ['breakdown' => 'type', 'seriesExpr' => 'i.investment_type'];
    }
    if (count($subTypes)) {
        $candidates[] = ['breakdown' => 'subType', 'seriesExpr' => 'i.sub_type_name'];
    }
    if (count($categories)) {
        $candidates[] = ['breakdown' => 'category', 'seriesExpr' => 'i.sub_type_category'];
    }
    if (count($platforms)) {
        $candidates[] = ['breakdown' => 'platform', 'seriesExpr' => 'i.website_app_name'];
    }

    return count($candidates) === 1 ? $candidates[0] : null;
}
