<?php

const MONGO_INVESTMENT_TYPES = [
    'FD', 'Stock', 'ETF', 'Bond', 'Mutual Fund', 'Crypto', 'PPF', 'EPF', 'Saving Bank Balance',
];

function mongo_store_to_date_string($value): ?string
{
    if (!$value) {
        return null;
    }
    if ($value instanceof MongoDB\BSON\UTCDateTime) {
        return $value->toDateTime()->format('Y-m-d');
    }
    if ($value instanceof DateTimeInterface) {
        return $value->format('Y-m-d');
    }
    return substr((string) $value, 0, 10);
}

function mongo_store_to_datetime($value): ?DateTime
{
    if (!$value) {
        return null;
    }
    if ($value instanceof MongoDB\BSON\UTCDateTime) {
        return $value->toDateTime();
    }
    if ($value instanceof DateTimeInterface) {
        return DateTime::createFromInterface($value);
    }
    return new DateTime((string) $value);
}

function mongo_store_format_doc(?array $doc): ?array
{
    if (!$doc) {
        return null;
    }
    unset($doc['_id']);
    if (!isset($doc['id']) && isset($doc['_id'])) {
        $doc['id'] = $doc['_id'];
    }
    if (isset($doc['investment_date'])) {
        $doc['investment_date'] = mongo_store_to_date_string($doc['investment_date']);
    }
    if (isset($doc['change_date'])) {
        $doc['change_date'] = mongo_store_to_date_string($doc['change_date']);
    }
    if (isset($doc['txn_date'])) {
        $doc['txn_date'] = mongo_store_to_date_string($doc['txn_date']);
    }
    if (array_key_exists('amount', $doc) && $doc['amount'] !== null) {
        $doc['amount'] = (float) $doc['amount'];
    }
    if (!empty($doc['created_at'])) {
        $dt = mongo_store_to_datetime($doc['created_at']);
        $doc['created_at'] = $dt ? $dt->format('c') : $doc['created_at'];
    }
    if (!empty($doc['updated_at'])) {
        $dt = mongo_store_to_datetime($doc['updated_at']);
        $doc['updated_at'] = $dt ? $dt->format('c') : $doc['updated_at'];
    }
    return $doc;
}

function mongo_store_next_id(string $collectionName): int
{
    $db = mongo_get_db();
    $result = $db->selectCollection('counters')->findOneAndUpdate(
        ['_id' => $collectionName],
        ['$inc' => ['seq' => 1]],
        ['upsert' => true, 'returnDocument' => MongoDB\Operation\FindOneAndUpdate::RETURN_DOCUMENT_AFTER]
    );
    return (int) $result['seq'];
}

function mongo_store_sync_counter(string $collectionName, int $maxId): void
{
    if (!$maxId) {
        return;
    }
    $db = mongo_get_db();
    $current = $db->selectCollection('counters')->findOne(['_id' => $collectionName]);
    if (!$current || ($current['seq'] ?? 0) < $maxId) {
        $db->selectCollection('counters')->updateOne(
            ['_id' => $collectionName],
            ['$set' => ['seq' => $maxId]],
            ['upsert' => true]
        );
    }
}

function mongo_store_get_all_investments(): array
{
    $cursor = mongo_get_db()->selectCollection('investments')->find(
        [],
        ['sort' => ['investment_date' => -1, 'created_at' => -1]]
    );
    $rows = [];
    foreach ($cursor as $doc) {
        $rows[] = mongo_store_format_doc((array) $doc);
    }
    return $rows;
}

function mongo_store_search_investments(array $criteria): array
{
    $filter = [];
    if (!empty($criteria['website_app_name'])) {
        $filter['website_app_name'] = $criteria['website_app_name'];
    }
    if (!empty($criteria['sub_type_name'])) {
        $filter['sub_type_name'] = $criteria['sub_type_name'];
    }
    if (!empty($criteria['sub_type_category'])) {
        $filter['sub_type_category'] = $criteria['sub_type_category'];
    }

    $cursor = mongo_get_db()->selectCollection('investments')->find(
        $filter,
        ['sort' => ['investment_date' => -1, 'created_at' => -1]]
    );
    $rows = [];
    foreach ($cursor as $doc) {
        $rows[] = mongo_store_format_doc((array) $doc);
    }
    return $rows;
}

function mongo_store_get_investment_by_id($id): ?array
{
    $doc = mongo_get_db()->selectCollection('investments')->findOne(['id' => (int) $id]);
    return mongo_store_format_doc($doc ? (array) $doc : null);
}

function mongo_store_create_investment(array $data): array
{
    $now = new MongoDB\BSON\UTCDateTime();
    $id = mongo_store_next_id('investments');
    $doc = [
        'id' => $id,
        'website_app_name' => $data['website_app_name'],
        'investment_type' => $data['investment_type'],
        'sub_type_name' => $data['sub_type_name'] ?? null,
        'sub_type_category' => $data['sub_type_category'] ?? null,
        'amount' => (float) $data['amount'],
        'investment_date' => mongo_store_to_date_string($data['investment_date']),
        'notes' => $data['notes'] ?? null,
        'created_at' => $now,
        'updated_at' => $now,
    ];

    mongo_get_db()->selectCollection('investments')->insertOne($doc);
    mongo_store_add_history([
        'investment_id' => $id,
        'amount' => $doc['amount'],
        'change_date' => $doc['investment_date'],
        'change_type' => 'added',
        'notes' => $doc['notes'],
    ]);

    return mongo_store_get_investment_by_id($id);
}

function mongo_store_update_investment($id, array $data): ?array
{
    $numId = (int) $id;
    $existing = mongo_get_db()->selectCollection('investments')->findOne(['id' => $numId]);
    if (!$existing) {
        return null;
    }

    $update = [
        'website_app_name' => $data['website_app_name'],
        'investment_type' => $data['investment_type'],
        'sub_type_name' => $data['sub_type_name'] ?? null,
        'sub_type_category' => $data['sub_type_category'] ?? null,
        'amount' => (float) $data['amount'],
        'investment_date' => mongo_store_to_date_string($data['investment_date']),
        'notes' => $data['notes'] ?? null,
        'updated_at' => new MongoDB\BSON\UTCDateTime(),
    ];

    mongo_get_db()->selectCollection('investments')->updateOne(['id' => $numId], ['$set' => $update]);

    if ((float) $existing['amount'] !== (float) $data['amount']) {
        mongo_store_add_history([
            'investment_id' => $numId,
            'amount' => (float) $data['amount'],
            'change_date' => mongo_store_to_date_string($data['investment_date']) ?? gmdate('Y-m-d'),
            'change_type' => 'updated',
            'notes' => $data['notes'] ?? null,
        ]);
    }

    return mongo_store_get_investment_by_id($numId);
}

function mongo_store_delete_investment($id): bool
{
    $numId = (int) $id;
    $existing = mongo_get_db()->selectCollection('investments')->findOne(['id' => $numId]);
    if (!$existing) {
        return false;
    }

    mongo_store_add_history([
        'investment_id' => $numId,
        'amount' => (float) $existing['amount'],
        'change_date' => gmdate('Y-m-d'),
        'change_type' => 'removed',
        'notes' => $existing['notes'] ?? null,
    ]);

    mongo_get_db()->selectCollection('investments')->deleteOne(['id' => $numId]);
    mongo_get_db()->selectCollection('investment_history')->deleteMany(['investment_id' => $numId]);
    mongo_get_db()->selectCollection('investment_transactions')->deleteMany(['investment_id' => $numId]);
    return true;
}

function mongo_store_add_history(array $entry): void
{
    $id = mongo_store_next_id('investment_history');
    mongo_get_db()->selectCollection('investment_history')->insertOne([
        'id' => $id,
        'investment_id' => $entry['investment_id'],
        'amount' => (float) $entry['amount'],
        'change_date' => mongo_store_to_date_string($entry['change_date']),
        'change_type' => $entry['change_type'],
        'notes' => $entry['notes'] ?? null,
        'created_at' => new MongoDB\BSON\UTCDateTime(),
    ]);
}

function mongo_store_get_all_sub_type_names(): array
{
    $cursor = mongo_get_db()->selectCollection('sub_type_names')->find(
        [],
        ['sort' => ['investment_type' => 1, 'name' => 1]]
    );
    $rows = [];
    foreach ($cursor as $doc) {
        $rows[] = mongo_store_format_doc((array) $doc);
    }
    return $rows;
}

function mongo_store_get_sub_type_names_by_type(string $investmentType): array
{
    $cursor = mongo_get_db()->selectCollection('sub_type_names')->find(
        ['investment_type' => $investmentType],
        ['sort' => ['name' => 1]]
    );
    $rows = [];
    foreach ($cursor as $doc) {
        $rows[] = mongo_store_format_doc((array) $doc);
    }
    return $rows;
}

function mongo_store_create_sub_type_name(array $data): array
{
    $existing = mongo_get_db()->selectCollection('sub_type_names')->findOne(['name' => $data['name']]);
    if ($existing) {
        $err = new RuntimeException('Sub-type name already exists');
        $err->code = 'ER_DUP_ENTRY';
        throw $err;
    }

    $id = mongo_store_next_id('sub_type_names');
    $doc = [
        'id' => $id,
        'name' => $data['name'],
        'investment_type' => $data['investment_type'],
        'created_at' => new MongoDB\BSON\UTCDateTime(),
    ];
    mongo_get_db()->selectCollection('sub_type_names')->insertOne($doc);
    return mongo_store_format_doc($doc);
}

function mongo_store_delete_sub_type_name($id): void
{
    mongo_get_db()->selectCollection('sub_type_names')->deleteOne(['id' => (int) $id]);
}

function mongo_store_get_categories(string $investmentType, ?string $subTypeNameId): array
{
    $filter = ['investment_type' => $investmentType];
    if ($subTypeNameId && $subTypeNameId !== 'null') {
        $filter['$or'] = [
            ['sub_type_name_id' => (int) $subTypeNameId],
            ['sub_type_name_id' => null],
        ];
    }

    $categories = mongo_get_db()->selectCollection('sub_type_categories')->find(
        $filter,
        ['sort' => ['category' => 1]]
    );

    $categoryList = [];
    $subTypeIds = [];
    foreach ($categories as $c) {
        $c = (array) $c;
        $categoryList[] = $c;
        if (!empty($c['sub_type_name_id'])) {
            $subTypeIds[] = $c['sub_type_name_id'];
        }
    }

    $subTypeMap = [];
    if ($subTypeIds) {
        $subTypes = mongo_get_db()->selectCollection('sub_type_names')->find(['id' => ['$in' => array_values(array_unique($subTypeIds))]]);
        foreach ($subTypes as $s) {
            $s = (array) $s;
            $subTypeMap[$s['id']] = $s['name'];
        }
    }

    return array_map(function ($c) use ($subTypeMap) {
        $c['sub_type_name'] = !empty($c['sub_type_name_id']) ? ($subTypeMap[$c['sub_type_name_id']] ?? null) : null;
        return mongo_store_format_doc($c);
    }, $categoryList);
}

function mongo_store_create_category(array $data): array
{
    $filter = [
        'category' => $data['category'],
        'investment_type' => $data['investment_type'],
        'sub_type_name_id' => $data['sub_type_name_id'] ?? null,
    ];
    $existing = mongo_get_db()->selectCollection('sub_type_categories')->findOne($filter);
    if ($existing) {
        $err = new RuntimeException('Category already exists for this sub-type');
        $err->code = 'ER_DUP_ENTRY';
        throw $err;
    }

    $id = mongo_store_next_id('sub_type_categories');
    $doc = [
        'id' => $id,
        'category' => $data['category'],
        'sub_type_name_id' => $data['sub_type_name_id'] ?? null,
        'investment_type' => $data['investment_type'],
        'created_at' => new MongoDB\BSON\UTCDateTime(),
    ];
    mongo_get_db()->selectCollection('sub_type_categories')->insertOne($doc);

    $subTypeName = null;
    if ($doc['sub_type_name_id']) {
        $subType = mongo_get_db()->selectCollection('sub_type_names')->findOne(['id' => $doc['sub_type_name_id']]);
        $subTypeName = $subType['name'] ?? null;
    }

    return mongo_store_format_doc(array_merge($doc, ['sub_type_name' => $subTypeName]));
}

function mongo_store_delete_category($id): void
{
    mongo_get_db()->selectCollection('sub_type_categories')->deleteOne(['id' => (int) $id]);
}

function mongo_store_find_investment_by_key(array $key): ?array
{
    $doc = mongo_get_db()->selectCollection('investments')->findOne([
        'website_app_name' => $key['website_app_name'],
        'investment_type' => $key['investment_type'],
        'sub_type_name' => $key['sub_type_name'] ?? null,
        'sub_type_category' => $key['sub_type_category'] ?? null,
    ]);
    return mongo_store_format_doc($doc ? (array) $doc : null);
}

function mongo_store_upsert_imported_investment(array $investment): array
{
    $existing = mongo_store_find_investment_by_key($investment);
    if ($existing) {
        mongo_get_db()->selectCollection('investments')->updateOne(
            ['id' => $existing['id']],
            ['$set' => [
                'amount' => (float) $investment['amount'],
                'investment_date' => mongo_store_to_date_string($investment['investment_date']),
                'notes' => $investment['notes'] ?? null,
                'updated_at' => new MongoDB\BSON\UTCDateTime(),
            ]]
        );
        mongo_store_add_history([
            'investment_id' => $existing['id'],
            'amount' => (float) $investment['amount'],
            'change_date' => mongo_store_to_date_string($investment['investment_date']),
            'change_type' => 'updated',
            'notes' => $investment['notes'] ?? null,
        ]);
        return ['action' => 'updated', 'id' => $existing['id']];
    }

    $created = mongo_store_create_investment($investment);
    return ['action' => 'imported', 'id' => $created['id']];
}

function mongo_store_get_collection_data(string $collectionName): array
{
    $cursor = mongo_get_db()->selectCollection($collectionName)->find([]);
    $rows = [];
    foreach ($cursor as $doc) {
        $doc = (array) $doc;
        unset($doc['_id']);
        $rows[] = $doc;
    }
    return $rows;
}

function mongo_store_clear_all_collections(): void
{
    $collections = [
        'investment_transactions',
        'investment_history',
        'investments',
        'sub_type_categories',
        'sub_type_names',
    ];
    foreach ($collections as $name) {
        mongo_get_db()->selectCollection($name)->deleteMany([]);
    }
}

function mongo_store_import_collection_data(string $collectionName, array $documents, array $options = []): array
{
    $freshInstall = $options['freshInstall'] ?? false;
    if (!$documents) {
        return ['inserted' => 0, 'skipped' => 0];
    }

    $db = mongo_get_db();
    $inserted = 0;
    $skipped = 0;

    foreach ($documents as $raw) {
        $doc = $raw;
        unset($doc['_id']);
        if (isset($doc['id'])) {
            $doc['id'] = (int) $doc['id'];
        }
        if (!empty($doc['created_at'])) {
            $doc['created_at'] = mongo_store_to_datetime($doc['created_at']);
        }
        if (!empty($doc['updated_at'])) {
            $doc['updated_at'] = mongo_store_to_datetime($doc['updated_at']);
        }
        if (!empty($doc['investment_date'])) {
            $doc['investment_date'] = mongo_store_to_date_string($doc['investment_date']);
        }
        if (!empty($doc['change_date'])) {
            $doc['change_date'] = mongo_store_to_date_string($doc['change_date']);
        }
        if (!empty($doc['txn_date'])) {
            $doc['txn_date'] = mongo_store_to_date_string($doc['txn_date']);
        }

        try {
            if ($freshInstall) {
                $db->selectCollection($collectionName)->insertOne($doc);
                $inserted++;
            } else {
                $db->selectCollection($collectionName)->updateOne(
                    ['id' => $doc['id']],
                    ['$set' => $doc],
                    ['upsert' => true]
                );
                $inserted++;
            }
        } catch (Throwable $error) {
            if (stripos($error->getMessage(), 'duplicate') !== false) {
                $skipped++;
            } else {
                throw $error;
            }
        }
    }

    $maxId = max(array_map(fn ($d) => (int) ($d['id'] ?? 0), $documents));
    mongo_store_sync_counter($collectionName, $maxId);
    return ['inserted' => $inserted, 'skipped' => $skipped];
}

function mongo_store_get_collection_counts(): array
{
    $names = [
        'sub_type_names',
        'sub_type_categories',
        'investments',
        'investment_history',
        'investment_transactions',
    ];
    $counts = [];
    foreach ($names as $name) {
        $counts[$name] = mongo_get_db()->selectCollection($name)->countDocuments([]);
    }
    return $counts;
}
