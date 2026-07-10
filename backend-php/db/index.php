<?php

function store_get_all_investments(): array
{
    return app_is_mongodb() ? mongo_store_get_all_investments() : mysql_store_get_all_investments();
}

function store_search_investments(array $criteria): array
{
    return app_is_mongodb() ? mongo_store_search_investments($criteria) : mysql_store_search_investments($criteria);
}

function store_get_investment_by_id($id): ?array
{
    return app_is_mongodb() ? mongo_store_get_investment_by_id($id) : mysql_store_get_investment_by_id($id);
}

function store_create_investment(array $data): array
{
    return app_is_mongodb() ? mongo_store_create_investment($data) : mysql_store_create_investment($data);
}

function store_update_investment($id, array $data): ?array
{
    return app_is_mongodb() ? mongo_store_update_investment($id, $data) : mysql_store_update_investment($id, $data);
}

function store_delete_investment($id): bool
{
    return app_is_mongodb() ? mongo_store_delete_investment($id) : mysql_store_delete_investment($id);
}

function store_get_all_sub_type_names(): array
{
    return app_is_mongodb() ? mongo_store_get_all_sub_type_names() : mysql_store_get_all_sub_type_names();
}

function store_get_sub_type_names_by_type(string $investmentType): array
{
    return app_is_mongodb()
        ? mongo_store_get_sub_type_names_by_type($investmentType)
        : mysql_store_get_sub_type_names_by_type($investmentType);
}

function store_create_sub_type_name(array $data): array
{
    return app_is_mongodb() ? mongo_store_create_sub_type_name($data) : mysql_store_create_sub_type_name($data);
}

function store_delete_sub_type_name($id): void
{
    if (app_is_mongodb()) {
        mongo_store_delete_sub_type_name($id);
    } else {
        mysql_store_delete_sub_type_name($id);
    }
}

function store_get_categories(string $investmentType, ?string $subTypeNameId): array
{
    return app_is_mongodb()
        ? mongo_store_get_categories($investmentType, $subTypeNameId)
        : mysql_store_get_categories($investmentType, $subTypeNameId);
}

function store_create_category(array $data): array
{
    return app_is_mongodb() ? mongo_store_create_category($data) : mysql_store_create_category($data);
}

function store_delete_category($id): void
{
    if (app_is_mongodb()) {
        mongo_store_delete_category($id);
    } else {
        mysql_store_delete_category($id);
    }
}

function store_find_investment_by_key(array $key): ?array
{
    return app_is_mongodb() ? mongo_store_find_investment_by_key($key) : mysql_store_find_investment_by_key($key);
}

function store_upsert_imported_investment(array $investment): array
{
    return app_is_mongodb()
        ? mongo_store_upsert_imported_investment($investment)
        : mysql_store_upsert_imported_investment($investment);
}
