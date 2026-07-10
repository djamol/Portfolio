<?php

const SQL_IMPORT_DESTRUCTIVE_PATTERNS = [
    '/^\s*DROP\s+TABLE/i',
    '/^\s*CREATE\s+TABLE/i',
    '/^\s*TRUNCATE\s+TABLE/i',
    '/^\s*DELETE\s+FROM/i',
    '/^\s*ALTER\s+TABLE/i',
];

function sql_import_strip_comments(string $sql): string
{
    $sql = preg_replace('/\/\*[\s\S]*?\*\//', '', $sql);
    return preg_replace('/--.*$/m', '', $sql);
}

function sql_import_split_statements(string $sql): array
{
    $statements = [];
    $current = '';
    $inSingleQuote = false;
    $inDoubleQuote = false;
    $escaped = false;
    $len = strlen($sql);

    for ($i = 0; $i < $len; $i++) {
        $char = $sql[$i];

        if ($escaped) {
            $current .= $char;
            $escaped = false;
            continue;
        }

        if ($char === '\\') {
            $current .= $char;
            $escaped = true;
            continue;
        }

        if ($char === "'" && !$inDoubleQuote) {
            $inSingleQuote = !$inSingleQuote;
            $current .= $char;
            continue;
        }

        if ($char === '"' && !$inSingleQuote) {
            $inDoubleQuote = !$inDoubleQuote;
            $current .= $char;
            continue;
        }

        if ($char === ';' && !$inSingleQuote && !$inDoubleQuote) {
            $trimmed = trim($current);
            if ($trimmed !== '') {
                $statements[] = $trimmed;
            }
            $current = '';
            continue;
        }

        $current .= $char;
    }

    $tail = trim($current);
    if ($tail !== '') {
        $statements[] = $tail;
    }

    return $statements;
}

function sql_import_filter_merge_statements(array $statements): array
{
    return array_values(array_filter($statements, function ($statement) {
        $normalized = preg_replace('/\s+/', ' ', trim($statement));
        if ($normalized === '') {
            return false;
        }
        foreach (SQL_IMPORT_DESTRUCTIVE_PATTERNS as $pattern) {
            if (preg_match($pattern, $normalized)) {
                return false;
            }
        }
        if (preg_match('/^SET\s+NAMES/i', $normalized)) {
            return true;
        }
        if (preg_match('/^SET\s+FOREIGN_KEY_CHECKS/i', $normalized)) {
            return true;
        }
        if (preg_match('/^LOCK\s+TABLES/i', $normalized)) {
            return true;
        }
        if (preg_match('/^UNLOCK\s+TABLES/i', $normalized)) {
            return true;
        }
        if (preg_match('/^INSERT\s+INTO/i', $normalized)) {
            return true;
        }
        return false;
    }));
}

function sql_import_table_exists(PDO $connection, string $tableName): bool
{
    $stmt = $connection->prepare(
        'SELECT COUNT(*) AS total
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = ?'
    );
    $stmt->execute([$tableName]);
    $row = $stmt->fetch();
    return (int) ($row['total'] ?? 0) > 0;
}

function sql_import_clear_all_tables(PDO $connection): void
{
    $connection->exec('SET FOREIGN_KEY_CHECKS=0');
    foreach (SQL_EXPORT_TABLES as $table) {
        if (sql_import_table_exists($connection, $table)) {
            $connection->exec("TRUNCATE TABLE `{$table}`");
        }
    }
    $connection->exec('SET FOREIGN_KEY_CHECKS=1');
}

function sql_import_database(PDO $pool, string $sqlText, array $options = []): array
{
    $freshInstall = $options['freshInstall'] ?? false;

    if (trim($sqlText) === '') {
        throw new RuntimeException('SQL content is empty');
    }

    $cleaned = sql_import_strip_comments($sqlText);
    $statements = sql_import_split_statements($cleaned);

    if (!$freshInstall) {
        $statements = sql_import_filter_merge_statements($statements);
    }

    if (!$statements) {
        throw new RuntimeException('No executable SQL statements found in file');
    }

    mysql_ensure_tables_exist();

    $errors = [];
    $executed = 0;
    $skipped = 0;

    $pool->exec('SET FOREIGN_KEY_CHECKS=0');

    if ($freshInstall) {
        sql_import_clear_all_tables($pool);
    }

    foreach ($statements as $statement) {
        $normalized = preg_replace('/\s+/', ' ', trim($statement));
        if ($normalized === '') {
            continue;
        }

        try {
            $pool->exec($statement);
            $executed++;
        } catch (PDOException $error) {
            if (!$freshInstall && stripos($error->getMessage(), 'Duplicate entry') !== false) {
                $skipped++;
                continue;
            }
            $errors[] = $error->getMessage();
        }
    }

    $pool->exec('SET FOREIGN_KEY_CHECKS=1');

    $counts = [];
    foreach (SQL_EXPORT_TABLES as $table) {
        $stmt = $pool->query("SELECT COUNT(*) AS total FROM `{$table}`");
        $counts[$table] = (int) $stmt->fetchColumn();
    }

    return [
        'freshInstall' => $freshInstall,
        'executed' => $executed,
        'skipped' => $skipped,
        'errors' => $errors,
        'tableCounts' => $counts,
    ];
}
