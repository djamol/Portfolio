<?php

function mongo_analytics_to_date_string($value): ?string
{
    return mongo_store_to_date_string($value);
}

function mongo_analytics_matches_filters(array $investment, array $query): bool
{
    $platforms = snapshot_parse_list_param($query['platform'] ?? null);
    if ($platforms && !in_array($investment['website_app_name'], $platforms, true)) {
        return false;
    }

    $types = snapshot_parse_list_param($query['type'] ?? null);
    if ($types && !in_array($investment['investment_type'], $types, true)) {
        return false;
    }

    $subTypes = snapshot_parse_list_param($query['subType'] ?? null);
    if ($subTypes && !in_array($investment['sub_type_name'], $subTypes, true)) {
        return false;
    }

    $categories = snapshot_parse_list_param($query['category'] ?? null);
    if ($categories && !in_array($investment['sub_type_category'], $categories, true)) {
        return false;
    }

    $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
    $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);
    $amount = (float) ($investment['amount'] ?? 0);
    if ($minAmount !== null && $amount < $minAmount) {
        return false;
    }
    if ($maxAmount !== null && $amount > $maxAmount) {
        return false;
    }

    return true;
}

function mongo_analytics_amount_as_of(int $investmentId, $asOfDate, array $historyRows, array $investmentsById): float
{
    $asOf = mongo_analytics_to_date_string($asOfDate);
    $relevant = array_filter($historyRows, function ($h) use ($investmentId, $asOf) {
        return (int) $h['investment_id'] === $investmentId
            && mongo_analytics_to_date_string($h['change_date']) <= $asOf;
    });

    usort($relevant, function ($a, $b) {
        $dateCmp = strcmp(mongo_analytics_to_date_string($b['change_date']), mongo_analytics_to_date_string($a['change_date']));
        if ($dateCmp !== 0) {
            return $dateCmp;
        }
        return ($b['id'] ?? 0) <=> ($a['id'] ?? 0);
    });

    if ($relevant) {
        return (float) reset($relevant)['amount'];
    }

    $inv = $investmentsById[$investmentId] ?? null;
    return $inv ? (float) $inv['amount'] : 0.0;
}

function mongo_analytics_group_by(array $rows, callable $keyFn, callable $aggFn): array
{
    $map = [];
    foreach ($rows as $row) {
        $key = $keyFn($row);
        $map[$key][] = $row;
    }
    $result = [];
    foreach ($map as $key => $items) {
        $result[] = $aggFn($key, $items);
    }
    return $result;
}

function mongo_analytics_load_core_data(): array
{
    $db = mongo_get_db();
    $investments = iterator_to_array($db->selectCollection('investments')->find([]));
    $history = iterator_to_array($db->selectCollection('investment_history')->find([]));
    $transactions = iterator_to_array($db->selectCollection('investment_transactions')->find([]));

    $investments = array_map(fn ($d) => (array) $d, $investments);
    $history = array_map(fn ($d) => (array) $d, $history);
    $transactions = array_map(fn ($d) => (array) $d, $transactions);

    $investmentsById = [];
    foreach ($investments as $i) {
        $investmentsById[$i['id']] = $i;
    }

    return compact('investments', 'history', 'transactions', 'investmentsById');
}

function mongo_analytics_get_total(): array
{
    $data = mongo_analytics_load_core_data();
    $total = array_reduce($data['investments'], fn ($s, $i) => $s + (float) $i['amount'], 0.0);
    return ['total_amount' => $total, 'total_investments' => count($data['investments'])];
}

function mongo_analytics_get_by_type(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['investments'],
        fn ($i) => $i['investment_type'],
        function ($type, $items) {
            $total = array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0);
            return [
                'investment_type' => $type,
                'count' => count($items),
                'total_amount' => $total,
                'avg_amount' => count($items) ? $total / count($items) : 0,
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['total_amount'] <=> $a['total_amount']);
    return $rows;
}

function mongo_analytics_get_by_month(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['investments'],
        fn ($i) => substr(mongo_analytics_to_date_string($i['investment_date']), 0, 7),
        function ($month, $items) {
            return [
                'month' => $month,
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
                'count' => count($items),
            ];
        }
    );
    usort($rows, fn ($a, $b) => strcmp($b['month'], $a['month']));
    return $rows;
}

function mongo_analytics_get_by_year(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['investments'],
        fn ($i) => (int) substr(mongo_analytics_to_date_string($i['investment_date']), 0, 4),
        function ($year, $items) {
            return [
                'year' => $year,
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
                'count' => count($items),
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['year'] <=> $a['year']);
    return $rows;
}

function mongo_analytics_get_monthly_changes(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['history'],
        fn ($h) => substr(mongo_analytics_to_date_string($h['change_date']), 0, 7),
        function ($month, $items) {
            return [
                'month' => $month,
                'added' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'added'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
                'removed' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'removed'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
                'updated' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'updated'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
            ];
        }
    );
    usort($rows, fn ($a, $b) => strcmp($b['month'], $a['month']));
    return array_slice($rows, 0, 12);
}

function mongo_analytics_get_yearly_changes(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['history'],
        fn ($h) => (int) substr(mongo_analytics_to_date_string($h['change_date']), 0, 4),
        function ($year, $items) {
            return [
                'year' => $year,
                'added' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'added'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
                'removed' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'removed'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
                'updated' => array_reduce(array_filter($items, fn ($h) => $h['change_type'] === 'updated'), fn ($s, $h) => $s + (float) $h['amount'], 0.0),
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['year'] <=> $a['year']);
    return $rows;
}

function mongo_analytics_get_by_platform(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['investments'],
        fn ($i) => $i['website_app_name'],
        function ($platform, $items) {
            return [
                'website_app_name' => $platform,
                'count' => count($items),
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['total_amount'] <=> $a['total_amount']);
    return $rows;
}

function mongo_analytics_get_by_sub_type_name(): array
{
    $data = mongo_analytics_load_core_data();
    $filtered = array_filter($data['investments'], fn ($i) => !empty($i['sub_type_name']));
    $rows = mongo_analytics_group_by(
        $filtered,
        fn ($i) => $i['sub_type_name'],
        function ($name, $items) {
            return [
                'sub_type_name' => $name,
                'count' => count($items),
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['total_amount'] <=> $a['total_amount']);
    return $rows;
}

function mongo_analytics_get_by_sub_type_category(): array
{
    $data = mongo_analytics_load_core_data();
    $filtered = array_filter($data['investments'], fn ($i) => !empty($i['sub_type_category']));
    $rows = mongo_analytics_group_by(
        $filtered,
        fn ($i) => $i['sub_type_category'],
        function ($category, $items) {
            return [
                'sub_type_category' => $category,
                'count' => count($items),
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
            ];
        }
    );
    usort($rows, fn ($a, $b) => $b['total_amount'] <=> $a['total_amount']);
    return $rows;
}

function mongo_analytics_get_growth(): array
{
    $data = mongo_analytics_load_core_data();
    $byMonth = mongo_analytics_group_by(
        $data['investments'],
        fn ($i) => substr(mongo_analytics_to_date_string($i['investment_date']), 0, 7),
        function ($month, $items) {
            return [
                'month' => $month,
                'total_amount' => array_reduce($items, fn ($s, $i) => $s + (float) $i['amount'], 0.0),
            ];
        }
    );
    usort($byMonth, fn ($a, $b) => strcmp($a['month'], $b['month']));

    $cumulative = 0.0;
    $result = [];
    foreach ($byMonth as $row) {
        $cumulative += $row['total_amount'];
        $result[] = ['month' => $row['month'], 'cumulative_amount' => $cumulative];
    }
    return $result;
}

function mongo_analytics_get_cashflows_by_month(): array
{
    $data = mongo_analytics_load_core_data();
    $rows = mongo_analytics_group_by(
        $data['transactions'],
        fn ($t) => substr(mongo_analytics_to_date_string($t['txn_date']), 0, 7),
        function ($month, $items) {
            $net = array_reduce($items, fn ($s, $t) => $s + (float) $t['cashflow_amount'], 0.0);
            $outflow = array_reduce(
                array_filter($items, fn ($t) => (float) $t['cashflow_amount'] < 0),
                fn ($s, $t) => $s + abs((float) $t['cashflow_amount']),
                0.0
            );
            $inflow = array_reduce(
                array_filter($items, fn ($t) => (float) $t['cashflow_amount'] > 0),
                fn ($s, $t) => $s + (float) $t['cashflow_amount'],
                0.0
            );
            return ['month' => $month, 'net_cashflow' => $net, 'outflow' => $outflow, 'inflow' => $inflow];
        }
    );
    usort($rows, fn ($a, $b) => strcmp($a['month'], $b['month']));
    return $rows;
}

function mongo_analytics_get_investment_history($investmentId): array
{
    $cursor = mongo_get_db()->selectCollection('investment_history')->find(
        ['investment_id' => (int) $investmentId],
        ['sort' => ['change_date' => -1, 'id' => -1]]
    );
    $rows = [];
    foreach ($cursor as $r) {
        $r = (array) $r;
        $rows[] = [
            ...$r,
            'change_date' => mongo_analytics_to_date_string($r['change_date']),
            'amount' => (float) $r['amount'],
        ];
    }
    return $rows;
}

function mongo_analytics_get_summary_table(): array
{
    $data = mongo_analytics_load_core_data();
    $historyByInvestment = [];
    foreach ($data['history'] as $h) {
        $historyByInvestment[$h['investment_id']][] = $h;
    }

    $rows = array_map(function ($i) use ($historyByInvestment) {
        $items = $historyByInvestment[$i['id']] ?? [];
        usort($items, function ($a, $b) {
            $d = strcmp(mongo_analytics_to_date_string($b['change_date']), mongo_analytics_to_date_string($a['change_date']));
            return $d !== 0 ? $d : (($b['id'] ?? 0) <=> ($a['id'] ?? 0));
        });
        $latest = $items[0] ?? null;
        return [
            'id' => $i['id'],
            'website_app_name' => $i['website_app_name'],
            'investment_type' => $i['investment_type'],
            'sub_type_name' => $i['sub_type_name'],
            'sub_type_category' => $i['sub_type_category'],
            'amount' => $latest ? (float) $latest['amount'] : (float) $i['amount'],
            'investment_date' => mongo_analytics_to_date_string($i['investment_date']),
            'notes' => $i['notes'],
            'history_count' => count($items),
        ];
    }, $data['investments']);

    usort($rows, fn ($a, $b) => $b['amount'] <=> $a['amount']);
    return $rows;
}

function mongo_analytics_resolve_series_breakdown(array $query): ?array
{
    $breakdown = $query['breakdown'] ?? null;
    if (!$breakdown || $breakdown === 'none') {
        return null;
    }
    $allowed = ['investment_type', 'website_app_name', 'sub_type_name', 'sub_type_category'];
    if (!in_array($breakdown, $allowed, true)) {
        return null;
    }
    return ['breakdown' => $breakdown, 'seriesExpr' => $breakdown];
}

function mongo_analytics_get_value_series(array $query): array
{
    $data = mongo_analytics_load_core_data();
    $filtered = array_values(array_filter($data['investments'], fn ($i) => mongo_analytics_matches_filters($i, $query)));
    $snapshotDates = array_values(array_unique(array_map(fn ($h) => mongo_analytics_to_date_string($h['change_date']), $data['history'])));
    sort($snapshotDates);

    $from = !empty($query['from']) ? mongo_analytics_to_date_string($query['from']) : null;
    $to = !empty($query['to']) ? mongo_analytics_to_date_string($query['to']) : null;
    $dates = array_values(array_filter($snapshotDates, fn ($d) => (!$from || $d >= $from) && (!$to || $d <= $to)));
    $breakdown = mongo_analytics_resolve_series_breakdown($query);

    $rows = [];
    foreach ($dates as $changeDate) {
        if ($breakdown) {
            $seriesMap = [];
            foreach ($filtered as $inv) {
                $amount = mongo_analytics_amount_as_of((int) $inv['id'], $changeDate, $data['history'], $data['investmentsById']);
                $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
                $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);
                if ($minAmount !== null && $amount < $minAmount) {
                    continue;
                }
                if ($maxAmount !== null && $amount > $maxAmount) {
                    continue;
                }
                $series = $inv[$breakdown['breakdown']] ?? 'Unknown';
                $seriesMap[$series] = ($seriesMap[$series] ?? 0) + $amount;
            }
            foreach ($seriesMap as $series_name => $total_value) {
                $rows[] = ['change_date' => $changeDate, 'series_name' => $series_name, 'total_value' => $total_value];
            }
        } else {
            $total = 0.0;
            foreach ($filtered as $inv) {
                $amount = mongo_analytics_amount_as_of((int) $inv['id'], $changeDate, $data['history'], $data['investmentsById']);
                $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
                $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);
                if ($minAmount !== null && $amount < $minAmount) {
                    continue;
                }
                if ($maxAmount !== null && $amount > $maxAmount) {
                    continue;
                }
                $total += $amount;
            }
            $rows[] = ['change_date' => $changeDate, 'total_value' => $total];
        }
    }

    if ($breakdown) {
        return ['mode' => 'series', 'breakdown' => $breakdown['breakdown'], 'rows' => $rows];
    }
    return ['mode' => 'total', 'breakdown' => null, 'rows' => $rows];
}

function mongo_analytics_get_allocation_latest(array $query): array
{
    $data = mongo_analytics_load_core_data();
    $today = mongo_analytics_to_date_string(new DateTime());
    $filtered = array_values(array_filter($data['investments'], fn ($i) => mongo_analytics_matches_filters($i, $query)));
    $map = [];

    foreach ($filtered as $inv) {
        $value = mongo_analytics_amount_as_of((int) $inv['id'], $today, $data['history'], $data['investmentsById']);
        $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
        $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);
        if ($minAmount !== null && $value < $minAmount) {
            continue;
        }
        if ($maxAmount !== null && $value > $maxAmount) {
            continue;
        }
        $type = $inv['investment_type'];
        $map[$type] = ($map[$type] ?? 0) + $value;
    }

    $rows = [];
    foreach ($map as $investment_type => $value) {
        $rows[] = ['investment_type' => $investment_type, 'value' => $value];
    }
    usort($rows, fn ($a, $b) => $b['value'] <=> $a['value']);
    return $rows;
}

function mongo_analytics_get_insights(array $query): array
{
    $data = mongo_analytics_load_core_data();
    $dates = array_values(array_unique(array_map(fn ($h) => mongo_analytics_to_date_string($h['change_date']), $data['history'])));
    sort($dates);
    $latestDate = $dates ? $dates[count($dates) - 1] : null;

    if (!$latestDate) {
        return ['latestDate' => null, 'daysSinceLatestSnapshot' => null, 'portfolio' => null, 'topHoldings' => []];
    }

    $prevDate = count($dates) > 1 ? $dates[count($dates) - 2] : null;
    $filtered = array_values(array_filter($data['investments'], fn ($i) => mongo_analytics_matches_filters($i, $query)));

    $portfolioValueAt = function ($date) use ($filtered, $data, $query) {
        $sum = 0.0;
        foreach ($filtered as $inv) {
            $amount = mongo_analytics_amount_as_of((int) $inv['id'], $date, $data['history'], $data['investmentsById']);
            $minAmount = snapshot_parse_number_param($query['minAmount'] ?? null);
            $maxAmount = snapshot_parse_number_param($query['maxAmount'] ?? null);
            if ($minAmount !== null && $amount < $minAmount) {
                continue;
            }
            if ($maxAmount !== null && $amount > $maxAmount) {
                continue;
            }
            $sum += $amount;
        }
        return $sum;
    };

    $latestValue = $portfolioValueAt($latestDate);
    $prevValue = $prevDate ? $portfolioValueAt($prevDate) : null;
    $changeAbs = $prevValue === null ? null : ($latestValue - $prevValue);
    $changePct = ($prevValue === null || $prevValue == 0) ? null : (($latestValue - $prevValue) / $prevValue) * 100;

    $today = new DateTime();
    $latest = new DateTime($latestDate);
    $daysSinceLatestSnapshot = (int) floor(($today->getTimestamp() - $latest->getTimestamp()) / 86400);

    $topHoldings = array_map(function ($inv) use ($latestDate, $data) {
        return [
            'investment_id' => $inv['id'],
            'website_app_name' => $inv['website_app_name'],
            'investment_type' => $inv['investment_type'],
            'sub_type_name' => $inv['sub_type_name'],
            'sub_type_category' => $inv['sub_type_category'],
            'amount' => mongo_analytics_amount_as_of((int) $inv['id'], $latestDate, $data['history'], $data['investmentsById']),
        ];
    }, $filtered);

    usort($topHoldings, fn ($a, $b) => $b['amount'] <=> $a['amount']);
    $topHoldings = array_slice($topHoldings, 0, 10);
    $topHoldings = array_map(function ($row) use ($latestValue) {
        $row['pct_of_portfolio'] = $latestValue > 0 ? ($row['amount'] / $latestValue) * 100 : 0;
        return $row;
    }, $topHoldings);

    return [
        'latestDate' => $latestDate,
        'prevDate' => $prevDate,
        'daysSinceLatestSnapshot' => $daysSinceLatestSnapshot,
        'portfolio' => [
            'latestValue' => $latestValue,
            'prevValue' => $prevValue,
            'changeAbs' => $changeAbs,
            'changePct' => $changePct,
        ],
        'topHoldings' => $topHoldings,
    ];
}

function mongo_analytics_get_delta(string $fromDate, string $toDate): array
{
    $data = mongo_analytics_load_core_data();
    $fromMap = [];
    $toMap = [];

    foreach ($data['history'] as $h) {
        $d = mongo_analytics_to_date_string($h['change_date']);
        if ($d === mongo_analytics_to_date_string($fromDate)) {
            $fromMap[$h['investment_id']] = (float) $h['amount'];
        }
        if ($d === mongo_analytics_to_date_string($toDate)) {
            $toMap[$h['investment_id']] = (float) $h['amount'];
        }
    }

    $rows = array_map(function ($i) use ($fromMap, $toMap) {
        $amount_from = $fromMap[$i['id']] ?? 0.0;
        $amount_to = $toMap[$i['id']] ?? 0.0;
        return [
            'investment_id' => $i['id'],
            'website_app_name' => $i['website_app_name'],
            'investment_type' => $i['investment_type'],
            'sub_type_name' => $i['sub_type_name'],
            'sub_type_category' => $i['sub_type_category'],
            'amount_to' => $amount_to,
            'amount_from' => $amount_from,
            'delta' => $amount_to - $amount_from,
        ];
    }, $data['investments']);

    $rows = array_values(array_filter($rows, fn ($r) => $r['amount_to'] != 0 || $r['amount_from'] != 0));
    usort($rows, fn ($a, $b) => $b['delta'] <=> $a['delta']);
    return $rows;
}
