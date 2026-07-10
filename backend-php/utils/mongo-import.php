<?php

function mongo_import_parse_export($input): array
{
    $data = $input;

    if (is_string($input)) {
        $trimmed = trim($input);
        if ($trimmed === '') {
            throw new RuntimeException('MongoDB export content is empty');
        }
        $data = json_decode($trimmed, true, 512, JSON_THROW_ON_ERROR);
    }

    if (($data['meta']['format'] ?? null) === 'portfolio-mongo-export' && isset($data['collections'])) {
        return $data;
    }

    if (isset($data['database'], $data['collections'])) {
        return [
            'meta' => [
                'format' => 'portfolio-mongo-export',
                'version' => 1,
                'database' => $data['database'],
                'exportedAt' => $data['exportedAt'] ?? gmdate('c'),
            ],
            'collections' => $data['collections'],
        ];
    }

    $collections = [];
    $found = false;
    foreach (MONGO_EXPORT_COLLECTIONS as $name) {
        if (isset($data[$name]) && is_array($data[$name])) {
            $collections[$name] = $data[$name];
            $found = true;
        }
    }
    if ($found) {
        return [
            'meta' => ['format' => 'portfolio-mongo-export', 'version' => 1],
            'collections' => $collections,
        ];
    }

    throw new RuntimeException('Unrecognized MongoDB export format. Expected portfolio-mongo-export JSON.');
}

function mongo_import_normalize_documents(array $documents): array
{
    return array_map(function ($doc) {
        $normalized = mongo_export_from_extended_json($doc);
        if (!empty($normalized['created_at']) && $normalized['created_at'] instanceof DateTimeInterface) {
            $normalized['created_at'] = DateTime::createFromInterface($normalized['created_at']);
        }
        if (!empty($normalized['updated_at']) && $normalized['updated_at'] instanceof DateTimeInterface) {
            $normalized['updated_at'] = DateTime::createFromInterface($normalized['updated_at']);
        }
        return $normalized;
    }, $documents);
}

function mongo_import_mysql_collection(PDO $connection, string $collectionName, array $documents, bool $freshInstall): array
{
    if (!$documents) {
        return ['inserted' => 0, 'skipped' => 0];
    }

    $inserted = 0;
    $skipped = 0;

    foreach ($documents as $doc) {
        $row = $doc;
        unset($row['_id']);

        $columns = array_keys($row);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $values = array_map(fn ($col) => $row[$col], $columns);
        $columnSql = implode(', ', array_map(fn ($c) => "`{$c}`", $columns));

        try {
            if ($freshInstall) {
                $stmt = $connection->prepare(
                    "INSERT INTO `{$collectionName}` ({$columnSql}) VALUES ({$placeholders})"
                );
                $stmt->execute($values);
                $inserted++;
            } else {
                $updateCols = array_filter($columns, fn ($c) => $c !== 'id');
                $updateSql = implode(', ', array_map(fn ($c) => "`{$c}` = VALUES(`{$c}`)", $updateCols));
                $stmt = $connection->prepare(
                    "INSERT INTO `{$collectionName}` ({$columnSql}) VALUES ({$placeholders})
                     ON DUPLICATE KEY UPDATE {$updateSql}"
                );
                $stmt->execute($values);
                $inserted++;
            }
        } catch (PDOException $error) {
            if (stripos($error->getMessage(), 'duplicate') !== false) {
                $skipped++;
            } else {
                throw $error;
            }
        }
    }

    return ['inserted' => $inserted, 'skipped' => $skipped];
}

function mongo_import_database($exportData, array $options = []): array
{
    $freshInstall = $options['freshInstall'] ?? false;
    $parsed = mongo_import_parse_export($exportData);
    $collectionResults = [];
    $totalInserted = 0;
    $totalSkipped = 0;
    $errors = [];

    if (app_is_mongodb()) {
        if ($freshInstall) {
            mongo_store_clear_all_collections();
        }

        foreach (MONGO_EXPORT_COLLECTIONS as $name) {
            $rawDocs = $parsed['collections'][$name] ?? [];
            $documents = mongo_import_normalize_documents($rawDocs);
            try {
                $result = mongo_store_import_collection_data($name, $documents, ['freshInstall' => $freshInstall]);
                $collectionResults[$name] = $result;
                $totalInserted += $result['inserted'];
                $totalSkipped += $result['skipped'];
            } catch (Throwable $error) {
                $errors[] = "{$name}: {$error->getMessage()}";
            }
        }

        return [
            'freshInstall' => $freshInstall,
            'collectionResults' => $collectionResults,
            'inserted' => $totalInserted,
            'skipped' => $totalSkipped,
            'errors' => $errors,
            'tableCounts' => mongo_store_get_collection_counts(),
        ];
    }

    $pool = app_get_pool();
    $pool->exec('SET FOREIGN_KEY_CHECKS=0');
    if ($freshInstall) {
        sql_import_clear_all_tables($pool);
    }

    foreach (MONGO_EXPORT_COLLECTIONS as $name) {
        $rawDocs = $parsed['collections'][$name] ?? [];
        $documents = mongo_import_normalize_documents($rawDocs);
        try {
            $result = mongo_import_mysql_collection($pool, $name, $documents, $freshInstall);
            $collectionResults[$name] = $result;
            $totalInserted += $result['inserted'];
            $totalSkipped += $result['skipped'];
        } catch (Throwable $error) {
            $errors[] = "{$name}: {$error->getMessage()}";
        }
    }

    $pool->exec('SET FOREIGN_KEY_CHECKS=1');

    $tableCounts = [];
    foreach (MONGO_EXPORT_COLLECTIONS as $name) {
        $stmt = $pool->query("SELECT COUNT(*) AS total FROM `{$name}`");
        $tableCounts[$name] = (int) $stmt->fetchColumn();
    }

    return [
        'freshInstall' => $freshInstall,
        'collectionResults' => $collectionResults,
        'inserted' => $totalInserted,
        'skipped' => $totalSkipped,
        'errors' => $errors,
        'tableCounts' => $tableCounts,
    ];
}
