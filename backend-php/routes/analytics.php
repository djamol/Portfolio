<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

function analytics_json_response(Response $response, array $payload, int $status = 200): Response
{
    $response->getBody()->write(json_encode($payload));
    return $response->withStatus($status)->withHeader('Content-Type', 'application/json');
}

function analytics_error_response(Response $response, string $context, Throwable $error): Response
{
    error_log("Error {$context}: " . $error->getMessage());
    return analytics_json_response($response, ['success' => false, 'error' => $error->getMessage()], 500);
}

function analytics_mysql_query(string $sql, array $params = []): array
{
    $pool = app_get_pool();
    $stmt = $pool->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function register_analytics_routes(App $app): void
{
    $app->get('/api/analytics/total', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_total()]);
            }
            $rows = analytics_mysql_query('SELECT SUM(amount) as total_amount, COUNT(*) as total_investments FROM investments');
            return analytics_json_response($response, ['success' => true, 'data' => $rows[0] ?? null]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching total', $error);
        }
    });

    $app->get('/api/analytics/by-type', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_type()]);
            }
            $rows = analytics_mysql_query('
                SELECT investment_type, COUNT(*) as count, SUM(amount) as total_amount, AVG(amount) as avg_amount
                FROM investments GROUP BY investment_type ORDER BY total_amount DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by type', $error);
        }
    });

    $app->get('/api/analytics/by-month', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_month()]);
            }
            $rows = analytics_mysql_query('
                SELECT DATE_FORMAT(investment_date, \'%Y-%m\') as month, SUM(amount) as total_amount, COUNT(*) as count
                FROM investments GROUP BY DATE_FORMAT(investment_date, \'%Y-%m\') ORDER BY month DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by month', $error);
        }
    });

    $app->get('/api/analytics/by-year', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_year()]);
            }
            $rows = analytics_mysql_query('
                SELECT YEAR(investment_date) as year, SUM(amount) as total_amount, COUNT(*) as count
                FROM investments GROUP BY YEAR(investment_date) ORDER BY year DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by year', $error);
        }
    });

    $app->get('/api/analytics/monthly-changes', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_monthly_changes()]);
            }
            $rows = analytics_mysql_query('
                SELECT DATE_FORMAT(change_date, \'%Y-%m\') as month,
                    SUM(CASE WHEN change_type = \'added\' THEN amount ELSE 0 END) as added,
                    SUM(CASE WHEN change_type = \'removed\' THEN amount ELSE 0 END) as removed,
                    SUM(CASE WHEN change_type = \'updated\' THEN amount ELSE 0 END) as updated
                FROM investment_history
                GROUP BY DATE_FORMAT(change_date, \'%Y-%m\')
                ORDER BY month DESC LIMIT 12
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching monthly changes', $error);
        }
    });

    $app->get('/api/analytics/yearly-changes', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_yearly_changes()]);
            }
            $rows = analytics_mysql_query('
                SELECT YEAR(change_date) as year,
                    SUM(CASE WHEN change_type = \'added\' THEN amount ELSE 0 END) as added,
                    SUM(CASE WHEN change_type = \'removed\' THEN amount ELSE 0 END) as removed,
                    SUM(CASE WHEN change_type = \'updated\' THEN amount ELSE 0 END) as updated
                FROM investment_history
                GROUP BY YEAR(change_date) ORDER BY year DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching yearly changes', $error);
        }
    });

    $app->get('/api/analytics/by-platform', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_platform()]);
            }
            $rows = analytics_mysql_query('
                SELECT website_app_name, COUNT(*) as count, SUM(amount) as total_amount
                FROM investments GROUP BY website_app_name ORDER BY total_amount DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by platform', $error);
        }
    });

    $app->get('/api/analytics/growth', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_growth()]);
            }
            $rows = analytics_mysql_query('
                SELECT DATE_FORMAT(investment_date, \'%Y-%m\') as month,
                    SUM(amount) OVER (ORDER BY DATE_FORMAT(investment_date, \'%Y-%m\') ASC) as cumulative_amount
                FROM investments
                GROUP BY DATE_FORMAT(investment_date, \'%Y-%m\')
                ORDER BY month ASC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching growth', $error);
        }
    });

    $app->get('/api/analytics/value-series', function (Request $request, Response $response) {
        try {
            $query = $request->getQueryParams();
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_value_series($query)]);
            }

            $from = $query['from'] ?? null;
            $to = $query['to'] ?? null;
            $breakdown = snapshot_resolve_series_breakdown($query);

            $snapshotWhere = [];
            $snapshotParams = [];
            if ($from) {
                $snapshotWhere[] = 'sd.change_date >= ?';
                $snapshotParams[] = $from;
            }
            if ($to) {
                $snapshotWhere[] = 'sd.change_date <= ?';
                $snapshotParams[] = $to;
            }

            $investmentParams = [];
            $investmentWhere = snapshot_build_investment_filter_clauses($query, $investmentParams);
            $investmentSql = $investmentWhere ? 'WHERE ' . implode(' AND ', $investmentWhere) : '';

            $amountParams = [];
            $amountWhere = snapshot_build_amount_filter_clauses($query, $amountParams, 'vals.amount_at_date');
            $outerWhere = array_merge($snapshotWhere, $amountWhere);
            $outerSql = $outerWhere ? 'WHERE ' . implode(' AND ', $outerWhere) : '';

            $seriesSelect = $breakdown ? "{$breakdown['seriesExpr']} AS series_name," : '';
            $groupBySeries = $breakdown ? ', vals.series_name' : '';
            $selectSeries = $breakdown ? 'vals.series_name,' : '';

            $sql = "
                SELECT sd.change_date, {$selectSeries} SUM(vals.amount_at_date) AS total_value
                FROM (SELECT DISTINCT change_date FROM investment_history) sd
                JOIN (
                    SELECT i.id, sd2.change_date, {$seriesSelect}
                        " . snapshot_amount_as_of_subquery('i', 'sd2.change_date') . " AS amount_at_date
                    FROM (SELECT DISTINCT change_date FROM investment_history) sd2
                    CROSS JOIN investments i {$investmentSql}
                ) vals ON vals.change_date = sd.change_date
                {$outerSql}
                GROUP BY sd.change_date{$groupBySeries}
                ORDER BY sd.change_date ASC" . ($breakdown ? ', vals.series_name ASC' : '');

            $rows = analytics_mysql_query($sql, array_merge($investmentParams, $snapshotParams, $amountParams));

            if ($breakdown) {
                return analytics_json_response($response, [
                    'success' => true,
                    'data' => ['mode' => 'series', 'breakdown' => $breakdown['breakdown'], 'rows' => $rows],
                ]);
            }

            return analytics_json_response($response, [
                'success' => true,
                'data' => ['mode' => 'total', 'breakdown' => null, 'rows' => $rows],
            ]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching value series', $error);
        }
    });

    $app->get('/api/analytics/allocation-latest', function (Request $request, Response $response) {
        try {
            $query = $request->getQueryParams();
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_allocation_latest($query)]);
            }

            $amountExpr = snapshot_amount_as_of_subquery('i', 'CURDATE()');
            $investmentParams = [];
            $investmentWhere = snapshot_build_investment_filter_clauses($query, $investmentParams);
            $amountParams = [];
            $amountWhere = snapshot_build_amount_filter_clauses($query, $amountParams, 'vals.amount_at_date');
            $investmentSql = $investmentWhere ? 'WHERE ' . implode(' AND ', $investmentWhere) : '';
            $amountSql = $amountWhere ? 'WHERE ' . implode(' AND ', $amountWhere) : '';

            $rows = analytics_mysql_query("
                SELECT vals.investment_type, SUM(vals.amount_at_date) AS value
                FROM (
                    SELECT i.investment_type, {$amountExpr} AS amount_at_date
                    FROM investments i {$investmentSql}
                ) vals {$amountSql}
                GROUP BY vals.investment_type ORDER BY value DESC
            ", array_merge($investmentParams, $amountParams));

            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching latest allocation', $error);
        }
    });

    $app->get('/api/analytics/insights', function (Request $request, Response $response) {
        try {
            $query = $request->getQueryParams();
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_insights($query)]);
            }

            $latestRows = analytics_mysql_query('SELECT MAX(change_date) AS latest_date FROM investment_history');
            $latestDate = $latestRows[0]['latest_date'] ?? null;

            if (!$latestDate) {
                return analytics_json_response($response, [
                    'success' => true,
                    'data' => [
                        'latestDate' => null,
                        'daysSinceLatestSnapshot' => null,
                        'portfolio' => null,
                        'topHoldings' => [],
                    ],
                ]);
            }

            $prevRows = analytics_mysql_query(
                'SELECT MAX(change_date) AS prev_date FROM investment_history WHERE change_date < ?',
                [$latestDate]
            );
            $prevDate = $prevRows[0]['prev_date'] ?? null;

            $investmentParams = [];
            $investmentWhere = snapshot_build_investment_filter_clauses($query, $investmentParams);
            $investmentSql = $investmentWhere ? 'WHERE ' . implode(' AND ', $investmentWhere) : '';
            $amountParams = [];
            $amountWhere = snapshot_build_amount_filter_clauses($query, $amountParams, 'vals.amount_at_date');
            $amountSql = $amountWhere ? 'WHERE ' . implode(' AND ', $amountWhere) : '';

            $portfolioValueSql = "
                SELECT SUM(vals.amount_at_date) AS total_value
                FROM (
                    SELECT " . snapshot_amount_as_of_subquery('i', '?') . " AS amount_at_date
                    FROM investments i {$investmentSql}
                ) vals {$amountSql}
            ";

            $portfolioLatest = analytics_mysql_query(
                $portfolioValueSql,
                array_merge([$latestDate], $investmentParams, $amountParams)
            );

            $portfolioPrevValue = null;
            if ($prevDate) {
                $portfolioPrev = analytics_mysql_query(
                    $portfolioValueSql,
                    array_merge([$prevDate], $investmentParams, $amountParams)
                );
                $portfolioPrevValue = $portfolioPrev[0]['total_value'] ?? null;
            }

            $freshness = analytics_mysql_query('SELECT DATEDIFF(CURDATE(), ?) AS days_since', [$latestDate]);

            $topHoldingsRaw = analytics_mysql_query("
                SELECT i.id AS investment_id, i.website_app_name, i.investment_type,
                    i.sub_type_name, i.sub_type_category, vals.amount_at_date AS amount
                FROM (
                    SELECT i.id, " . snapshot_amount_as_of_subquery('i', '?') . " AS amount_at_date
                    FROM investments i {$investmentSql}
                ) vals
                JOIN investments i ON i.id = vals.id {$amountSql}
                ORDER BY vals.amount_at_date DESC LIMIT 10
            ", array_merge([$latestDate], $investmentParams, $amountParams));

            $totalForPct = (float) ($portfolioLatest[0]['total_value'] ?? 0);
            $topHoldings = array_map(function ($row) use ($totalForPct) {
                $row['pct_of_portfolio'] = $totalForPct > 0 ? ((float) $row['amount'] / $totalForPct) * 100 : 0;
                return $row;
            }, $topHoldingsRaw);

            $latestValue = $portfolioLatest[0]['total_value'] ?? 0;
            $prevValue = $portfolioPrevValue;
            $changeAbs = $prevValue === null ? null : ($latestValue - $prevValue);
            $changePct = ($prevValue === null || (float) $prevValue === 0.0)
                ? null
                : (($latestValue - $prevValue) / $prevValue) * 100;

            return analytics_json_response($response, [
                'success' => true,
                'data' => [
                    'latestDate' => $latestDate,
                    'prevDate' => $prevDate,
                    'daysSinceLatestSnapshot' => $freshness[0]['days_since'] ?? null,
                    'portfolio' => [
                        'latestValue' => $latestValue,
                        'prevValue' => $prevValue,
                        'changeAbs' => $changeAbs,
                        'changePct' => $changePct,
                    ],
                    'topHoldings' => $topHoldings,
                ],
            ]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching insights', $error);
        }
    });

    $app->get('/api/analytics/delta', function (Request $request, Response $response) {
        try {
            $query = $request->getQueryParams();
            $fromDate = $query['from'] ?? null;
            $toDate = $query['to'] ?? null;

            if (!$fromDate || !$toDate) {
                return analytics_json_response($response, [
                    'success' => false,
                    'error' => 'Missing query params. Expected from=YYYY-MM-DD&to=YYYY-MM-DD',
                ], 400);
            }

            if (app_is_mongodb()) {
                $rows = mongo_analytics_get_delta($fromDate, $toDate);
                return analytics_json_response($response, [
                    'success' => true,
                    'meta' => ['from' => $fromDate, 'to' => $toDate],
                    'data' => $rows,
                ]);
            }

            $rows = analytics_mysql_query('
                WITH a AS (SELECT investment_id, amount FROM investment_history WHERE change_date = ?),
                b AS (SELECT investment_id, amount FROM investment_history WHERE change_date = ?)
                SELECT i.id AS investment_id, i.website_app_name, i.investment_type,
                    i.sub_type_name, i.sub_type_category,
                    COALESCE(b.amount, 0) AS amount_to, COALESCE(a.amount, 0) AS amount_from,
                    COALESCE(b.amount, 0) - COALESCE(a.amount, 0) AS delta
                FROM investments i
                LEFT JOIN a ON a.investment_id = i.id
                LEFT JOIN b ON b.investment_id = i.id
                WHERE COALESCE(b.amount, 0) <> 0 OR COALESCE(a.amount, 0) <> 0
                ORDER BY delta DESC
            ', [$fromDate, $toDate]);

            return analytics_json_response($response, [
                'success' => true,
                'meta' => ['from' => $fromDate, 'to' => $toDate],
                'data' => $rows,
            ]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching delta', $error);
        }
    });

    $app->get('/api/analytics/cashflows-by-month', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_cashflows_by_month()]);
            }
            $rows = analytics_mysql_query('
                SELECT DATE_FORMAT(txn_date, \'%Y-%m\') AS month,
                    SUM(cashflow_amount) AS net_cashflow,
                    SUM(CASE WHEN cashflow_amount < 0 THEN -cashflow_amount ELSE 0 END) AS outflow,
                    SUM(CASE WHEN cashflow_amount > 0 THEN cashflow_amount ELSE 0 END) AS inflow
                FROM investment_transactions
                GROUP BY DATE_FORMAT(txn_date, \'%Y-%m\') ORDER BY month ASC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching cashflows', $error);
        }
    });

    $app->get('/api/analytics/by-sub-type-name', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_sub_type_name()]);
            }
            $rows = analytics_mysql_query('
                SELECT sub_type_name, COUNT(*) as count, SUM(amount) as total_amount
                FROM investments
                WHERE sub_type_name IS NOT NULL AND sub_type_name != \'\'
                GROUP BY sub_type_name ORDER BY total_amount DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by sub type name', $error);
        }
    });

    $app->get('/api/analytics/by-sub-type-category', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_by_sub_type_category()]);
            }
            $rows = analytics_mysql_query('
                SELECT sub_type_category, COUNT(*) as count, SUM(amount) as total_amount
                FROM investments
                WHERE sub_type_category IS NOT NULL AND sub_type_category != \'\'
                GROUP BY sub_type_category ORDER BY total_amount DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching by sub type category', $error);
        }
    });

    $app->get('/api/analytics/summary-table', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                return analytics_json_response($response, ['success' => true, 'data' => mongo_analytics_get_summary_table()]);
            }
            $rows = analytics_mysql_query('
                SELECT i.id, i.website_app_name, i.investment_type, i.sub_type_name, i.sub_type_category,
                    COALESCE(
                        (SELECT h.amount FROM investment_history h
                         WHERE h.investment_id = i.id ORDER BY h.change_date DESC, h.id DESC LIMIT 1),
                        i.amount
                    ) AS amount,
                    i.investment_date, i.notes, COALESCE(h.history_count, 0) as history_count
                FROM investments i
                LEFT JOIN (
                    SELECT investment_id, COUNT(*) as history_count
                    FROM investment_history GROUP BY investment_id
                ) h ON i.id = h.investment_id
                ORDER BY amount DESC
            ');
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching summary table', $error);
        }
    });

    $app->get('/api/analytics/investment-history/{id}', function (Request $request, Response $response, array $args) {
        try {
            if (app_is_mongodb()) {
                $rows = mongo_analytics_get_investment_history($args['id']);
                return analytics_json_response($response, ['success' => true, 'data' => $rows]);
            }
            $rows = analytics_mysql_query('
                SELECT id, investment_id, change_type, amount, change_date, notes
                FROM investment_history WHERE investment_id = ?
                ORDER BY change_date DESC, id DESC
            ', [$args['id']]);
            return analytics_json_response($response, ['success' => true, 'data' => $rows]);
        } catch (Throwable $error) {
            return analytics_error_response($response, 'fetching investment history', $error);
        }
    });
}
