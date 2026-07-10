<?php

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

function register_category_routes(App $app): void
{
    $app->get('/api/categories/sub-type-names', function (Request $request, Response $response) {
        try {
            $rows = store_get_all_sub_type_names();
            $response->getBody()->write(json_encode(['success' => true, 'data' => $rows]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error fetching sub-type names: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/categories/sub-type-names', function (Request $request, Response $response) {
        try {
            $body = json_decode((string) $request->getBody(), true) ?? [];
            if (empty($body['name']) || empty($body['investment_type'])) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'Missing required fields: name, investment_type',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $newSubType = store_create_sub_type_name($body);
            $response->getBody()->write(json_encode(['success' => true, 'data' => $newSubType]));
            return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            if (($error->code ?? null) === 'ER_DUP_ENTRY'
                || $error->getCode() === 23000
                || stripos($error->getMessage(), 'already exists') !== false) {
                $response->getBody()->write(json_encode(['success' => false, 'error' => 'Sub-type name already exists']));
                return $response->withStatus(409)->withHeader('Content-Type', 'application/json');
            }
            error_log('Error creating sub-type name: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/categories/sub-type-names/{investmentType}', function (Request $request, Response $response, array $args) {
        try {
            $rows = store_get_sub_type_names_by_type($args['investmentType']);
            $response->getBody()->write(json_encode(['success' => true, 'data' => $rows]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error fetching sub-type names: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->post('/api/categories/categories', function (Request $request, Response $response) {
        try {
            $body = json_decode((string) $request->getBody(), true) ?? [];
            if (empty($body['category']) || empty($body['investment_type'])) {
                $response->getBody()->write(json_encode([
                    'success' => false,
                    'error' => 'Missing required fields: category, investment_type',
                ]));
                return $response->withStatus(400)->withHeader('Content-Type', 'application/json');
            }

            $newCategory = store_create_category($body);
            $response->getBody()->write(json_encode(['success' => true, 'data' => $newCategory]));
            return $response->withStatus(201)->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            if (($error->code ?? null) === 'ER_DUP_ENTRY'
                || $error->getCode() === 23000
                || stripos($error->getMessage(), 'already exists') !== false) {
                $response->getBody()->write(json_encode(['success' => false, 'error' => 'Category already exists for this sub-type']));
                return $response->withStatus(409)->withHeader('Content-Type', 'application/json');
            }
            error_log('Error creating category: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->get('/api/categories/categories/{investmentType}[/{subTypeNameId}]', function (Request $request, Response $response, array $args) {
        try {
            $rows = store_get_categories(
                $args['investmentType'],
                $args['subTypeNameId'] ?? null
            );
            $response->getBody()->write(json_encode(['success' => true, 'data' => $rows]));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error fetching categories: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->delete('/api/categories/sub-type-names/{id}', function (Request $request, Response $response, array $args) {
        try {
            store_delete_sub_type_name($args['id']);
            $response->getBody()->write(json_encode(['success' => true, 'message' => 'Sub-type name deleted successfully']));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error deleting sub-type name: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });

    $app->delete('/api/categories/categories/{id}', function (Request $request, Response $response, array $args) {
        try {
            store_delete_category($args['id']);
            $response->getBody()->write(json_encode(['success' => true, 'message' => 'Category deleted successfully']));
            return $response->withHeader('Content-Type', 'application/json');
        } catch (Throwable $error) {
            error_log('Error deleting category: ' . $error->getMessage());
            $response->getBody()->write(json_encode(['success' => false, 'error' => $error->getMessage()]));
            return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
        }
    });
}
