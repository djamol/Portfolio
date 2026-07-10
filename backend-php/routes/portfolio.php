<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

function register_portfolio_routes(App $app): void
{
    $app->get('/api/portfolio/export', function (Request $request, Response $response) {
        try {
            $investments = store_get_all_investments();
            $response->getBody()->write(json_encode(['success' => true, 'data' => $investments]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error exporting portfolio: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/portfolio/import', function (Request $request, Response $response) {
        try {
            $investments = json_decode((string) $request->getBody(), true);
            if (!is_array($investments) || count($investments) === 0) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'Invalid data format. Expected array of investments.',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $importedCount = 0;
            $updatedCount = 0;
            $errors = [];

            foreach ($investments as $investment) {
                try {
                    if (empty($investment['website_app_name']) || empty($investment['investment_type'])
                        || !isset($investment['amount']) || empty($investment['investment_date'])) {
                        $errors[] = 'Skipping record: Missing required fields for '
                            . ($investment['website_app_name'] ?? 'unknown') . ' - '
                            . ($investment['investment_type'] ?? 'unknown');
                        continue;
                    }

                    $result = store_upsert_imported_investment($investment);
                    if ($result['action'] === 'updated') {
                        $updatedCount++;
                    } else {
                        $importedCount++;
                    }
                } catch (Throwable $error) {
                    $errors[] = 'Error processing investment '
                        . ($investment['website_app_name'] ?? 'unknown') . ': ' . $error->getMessage();
                }
            }

            $response->getBody()->write(json_encode([
                'success' => true,
                'data' => [
                    'imported' => $importedCount,
                    'updated' => $updatedCount,
                    'errors' => $errors,
                    'totalProcessed' => count($investments),
                ],
                'message' => "Import completed: {$importedCount} new investments added, {$updatedCount} existing investments updated.",
            ]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error importing portfolio: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/portfolio/export/sql', function (Request $request, Response $response) {
        try {
            $pool = app_is_mongodb() ? null : app_get_pool();
            $result = sql_export_database($pool);
            $filename = 'portfolio_export_' . substr($result['exportedAt'], 0, 10) . '.sql';
            $response->getBody()->write($result['sql']);
            return $response
                ->withHeader('Content-Type', 'application/sql; charset=utf-8')
                ->withHeader('Content-Disposition', 'attachment; filename="' . $filename . '"');
        } catch (Throwable $error) {
            error_log('Error exporting SQL: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/portfolio/import/sql', function (Request $request, Response $response) {
        try {
            if (app_is_mongodb()) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'SQL import is not available when DB_TYPE=mongodb. Use /import/mongo instead.',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $body = json_decode((string) $request->getBody(), true) ?? [];
            $sql = $body['sql'] ?? null;
            $freshInstall = !empty($body['freshInstall']);

            if (!$sql || trim((string) $sql) === '') {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'Missing SQL content. Expected { sql: string, freshInstall?: boolean }',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $result = sql_import_database(app_get_pool(), (string) $sql, ['freshInstall' => $freshInstall]);
            $message = $freshInstall
                ? "Fresh SQL import completed. {$result['executed']} statements executed."
                : "SQL merge import completed. {$result['executed']} statements executed, {$result['skipped']} duplicates skipped.";

            $response->getBody()->write(json_encode(['success' => true, 'data' => $result, 'message' => $message]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error importing SQL: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/portfolio/export/mongo', function (Request $request, Response $response) {
        try {
            $result = mongo_export_database();
            $filename = 'portfolio_export_' . substr($result['exportedAt'], 0, 10) . '.mongo.json';
            $response->getBody()->write($result['json']);
            return $response
                ->withHeader('Content-Type', 'application/json; charset=utf-8')
                ->withHeader('Content-Disposition', 'attachment; filename="' . $filename . '"');
        } catch (Throwable $error) {
            error_log('Error exporting MongoDB: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/portfolio/import/mongo', function (Request $request, Response $response) {
        try {
            $body = json_decode((string) $request->getBody(), true) ?? [];
            $exportPayload = $body['data'] ?? $body;
            $freshInstall = !empty($body['freshInstall']);

            if (!$exportPayload
                || (is_array($exportPayload) && !isset($exportPayload['collections']) && !isset($exportPayload['investments']))) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'Missing MongoDB export content. Expected { data: object, freshInstall?: boolean }',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $result = mongo_import_database($exportPayload, ['freshInstall' => $freshInstall]);
            $message = $freshInstall
                ? "Fresh MongoDB import completed. {$result['inserted']} documents inserted."
                : "MongoDB merge import completed. {$result['inserted']} documents upserted, {$result['skipped']} skipped.";

            $response->getBody()->write(json_encode(['success' => true, 'data' => $result, 'message' => $message]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error importing MongoDB: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });
}
