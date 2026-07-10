<?php

const SQL_EXPORT_TABLES = [
    'sub_type_names',
    'sub_type_categories',
    'investments',
    'investment_history',
    'investment_transactions',
];

function sql_export_escape_value($value): string
{
    if ($value === null) {
        return 'NULL';
    }
    if ($value instanceof DateTimeInterface) {
        return "'" . $value->format('Y-m-d H:i:s') . "'";
    }
    if (is_float($value) || is_int($value)) {
        if (is_finite((float) $value)) {
            return (string) $value;
        }
    }
    if (is_bool($value)) {
        return $value ? '1' : '0';
    }
    if (is_array($value) && isset($value['$date'])) {
        return "'" . substr((string) $value['$date'], 0, 19) . "'";
    }
    $str = (string) $value;
    return "'" . str_replace(["\\", "'"], ["\\\\", "''"], $str) . "'";
}

function sql_export_normalize_row(array $row): array
{
    $out = [];
    foreach ($row as $key => $value) {
        if ($key === '_id') {
            continue;
        }
        if ($value instanceof DateTimeInterface) {
            $out[$key] = $value;
        } elseif (is_array($value) && isset($value['$date'])) {
            $out[$key] = new DateTime($value['$date']);
        } else {
            $out[$key] = $value;
        }
    }
    return $out;
}

function sql_export_build_insert(string $table, array $rows): string
{
    if (!$rows) {
        return "-- No data for table `{$table}`\n";
    }

    $columns = array_keys($rows[0]);
    $columnList = implode(', ', array_map(fn ($c) => "`{$c}`", $columns));
    $chunks = [];
    $batchSize = 100;

    for ($i = 0; $i < count($rows); $i += $batchSize) {
        $batch = array_slice($rows, $i, $batchSize);
        $valueGroups = [];
        foreach ($batch as $row) {
            $values = array_map(fn ($col) => sql_export_escape_value($row[$col] ?? null), $columns);
            $valueGroups[] = '(' . implode(', ', $values) . ')';
        }
        $chunks[] = "INSERT INTO `{$table}` ({$columnList}) VALUES\n" . implode(",\n", $valueGroups) . ';';
    }

    return implode("\n\n", $chunks) . "\n";
}

function sql_export_fetch_mysql_rows(PDO $pool, string $table): array
{
    $stmt = $pool->query("SELECT * FROM `{$table}`");
    return $stmt->fetchAll();
}

function sql_export_fetch_mongo_rows(string $table): array
{
    $rows = mongo_store_get_collection_data($table);
    return array_map('sql_export_normalize_row', $rows);
}

function sql_export_database(?PDO $pool = null): array
{
    $lines = [];
    $exportedAt = gmdate('c');
    $source = app_is_mongodb() ? 'mongodb' : 'mysql';

    $lines[] = '-- Portfolio Management SQL Export';
    $lines[] = "-- Generated: {$exportedAt}";
    $lines[] = "-- Source: {$source}";
    $lines[] = 'SET NAMES utf8mb4;';
    $lines[] = 'SET FOREIGN_KEY_CHECKS=0;';
    $lines[] = '';

    $counts = [];
    $activePool = app_is_mongodb() ? null : ($pool ?? app_get_pool());

    foreach (SQL_EXPORT_TABLES as $table) {
        $rows = app_is_mongodb()
            ? sql_export_fetch_mongo_rows($table)
            : sql_export_fetch_mysql_rows($activePool, $table);

        $counts[$table] = count($rows);
        $lines[] = "-- Table: {$table} (" . count($rows) . ' rows)';
        $lines[] = "LOCK TABLES `{$table}` WRITE;";
        $lines[] = rtrim(sql_export_build_insert($table, $rows));
        $lines[] = 'UNLOCK TABLES;';
        $lines[] = '';
    }

    $lines[] = 'SET FOREIGN_KEY_CHECKS=1;';
    $lines[] = '';

    return [
        'sql' => implode("\n", $lines),
        'counts' => $counts,
        'exportedAt' => $exportedAt,
        'source' => $source,
    ];
}
