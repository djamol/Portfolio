<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

function register_investment_routes(App $app): void
{
    $app->get('/api/investments', function (Request $request, Response $response) {
        try {
            $rows = store_get_all_investments();
            $response->getBody()->write(json_encode(['success' => true, 'data' => $rows]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error fetching investments: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/investments/search', function (Request $request, Response $response) {
        try {
            $query = $request->getQueryParams();
            $rows = store_search_investments([
                'website_app_name' => $query['website_app_name'] ?? null,
                'sub_type_name' => $query['sub_type_name'] ?? null,
                'sub_type_category' => $query['sub_type_category'] ?? null,
            ]);
            $response->getBody()->write(json_encode(['success' => true, 'data' => $rows]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error searching investments: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/investments/{id}', function (Request $request, Response $response, array $args) {
        try {
            $row = store_get_investment_by_id($args['id']);
            if (!$row) {
                $response->getBody()->write(json_encode(['success' => false, 'error' => 'Investment not found']));
                return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
            }
            $response->getBody()->write(json_encode(['success' => true, 'data' => $row]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error fetching investment: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/investments', function (Request $request, Response $response) {
        try {
            $body = json_decode((string) $request->getBody(), true) ?? [];
            $required = ['website_app_name', 'investment_type', 'amount', 'investment_date'];
            foreach ($required as $field) {
                if (empty($body[$field]) && $body[$field] !== 0 && $body[$field] !== '0') {
                    $response->getBody()->write(json_encode([
                        'success' => false,
                        'error' => 'Missing required fields: website_app_name, investment_type, amount, investment_date',
                    ]));
                    return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
                }
            }

            $newInvestment = store_create_investment($body);
            $response->getBody()->write(json_encode(['success' => true, 'data' => $newInvestment]));
            return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error creating investment: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->put('/api/investments/{id}', function (Request $request, Response $response, array $args) {
        try {
            $body = json_decode((string) $request->getBody(), true) ?? [];
            $updated = store_update_investment($args['id'], $body);
            if (!$updated) {
                $response->getBody()->write(json_encode(['success' => false, 'error' => 'Investment not found']));
                return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
            }
            $response->getBody()->write(json_encode(['success' => true, 'data' => $updated]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error updating investment: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->delete('/api/investments/{id}', function (Request $request, Response $response, array $args) {
        try {
            $deleted = store_delete_investment($args['id']);
            if (!$deleted) {
                $response->getBody()->write(json_encode(['success' => false, 'error' => 'Investment not found']));
                return $response->withStatus(404)->withHeader('Content-Type', 'application/json');
            }
            $response->getBody()->write(json_encode(['success' => true, 'message' => 'Investment deleted successfully']));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error deleting investment: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });
}
