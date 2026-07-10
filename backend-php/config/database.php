<?php

$dbConfig = [
    'host' => $_ENV['DB_HOST'] ?? 'localhost',
    'port' => (int) ($_ENV['DB_PORT'] ?? 3306),
    'user' => $_ENV['DB_USER'] ?? 'root',
    'password' => $_ENV['DB_PASSWORD'] ?? '',
    'database' => $_ENV['DB_NAME'] ?? 'portfolio',
];

/** @var PDO|null */
$mysqlPool = null;

function mysql_get_connection_summary(): array
{
    global $dbConfig;
    return [
        'host' => $dbConfig['host'],
        'port' => $dbConfig['port'],
        'user' => $dbConfig['user'],
        'database' => $dbConfig['database'],
        'password' => logger_redact($dbConfig['password']),
    ];
}

function mysql_get_dsn(): string
{
    global $dbConfig;
    return sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $dbConfig['host'],
        $dbConfig['port'],
        $dbConfig['database']
    );
}

function mysql_get_pool(): PDO
{
    global $mysqlPool, $dbConfig;

    if ($mysqlPool === null) {
        $mysqlPool = new PDO(
            mysql_get_dsn(),
            $dbConfig['user'],
            $dbConfig['password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }

    return $mysqlPool;
}

function mysql_sleep(int $ms): void
{
    usleep($ms * 1000);
}

function mysql_create_tables(): void
{
    $pool = mysql_get_pool();
    logger_info('MySQL: creating tables if missing');

    $pool->exec("
        CREATE TABLE IF NOT EXISTS investments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            website_app_name VARCHAR(255) NOT NULL,
            investment_type ENUM('FD', 'Stock', 'ETF', 'Bond', 'Mutual Fund', 'Crypto', 'PPF', 'EPF', 'Saving Bank Balance') NOT NULL,
            sub_type_name VARCHAR(255),
            sub_type_category VARCHAR(255),
            amount DECIMAL(15, 2) NOT NULL,
            investment_date DATE NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_investment_type (investment_type),
            INDEX idx_investment_date (investment_date),
            INDEX idx_website_app (website_app_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pool->exec("
        CREATE TABLE IF NOT EXISTS investment_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            investment_id INT NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            change_date DATE NOT NULL,
            change_type ENUM('added', 'removed', 'updated') NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
            INDEX idx_investment_id (investment_id),
            INDEX idx_change_date (change_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pool->exec("
        CREATE TABLE IF NOT EXISTS sub_type_names (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            investment_type ENUM('FD', 'Stock', 'ETF', 'Bond', 'Mutual Fund', 'Crypto', 'PPF', 'EPF', 'Saving Bank Balance') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_investment_type (investment_type),
            INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pool->exec("
        CREATE TABLE IF NOT EXISTS sub_type_categories (
            id INT AUTO_INCREMENT PRIMARY KEY,
            category VARCHAR(255) NOT NULL,
            sub_type_name_id INT,
            investment_type ENUM('FD', 'Stock', 'ETF', 'Bond', 'Mutual Fund', 'Crypto', 'PPF', 'EPF', 'Saving Bank Balance') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sub_type_name_id) REFERENCES sub_type_names(id) ON DELETE SET NULL,
            INDEX idx_investment_type (investment_type),
            INDEX idx_sub_type_name_id (sub_type_name_id),
            UNIQUE KEY unique_category_subtype (category, sub_type_name_id, investment_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $pool->exec("
        CREATE TABLE IF NOT EXISTS investment_transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            investment_id INT NOT NULL,
            txn_date DATE NOT NULL,
            txn_type ENUM(
                'buy', 'sell', 'dividend', 'interest', 'fee',
                'deposit', 'withdrawal', 'transfer_in', 'transfer_out'
            ) NOT NULL,
            units DECIMAL(20, 8) NULL,
            price DECIMAL(20, 8) NULL,
            cashflow_amount DECIMAL(15, 2) NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE CASCADE,
            INDEX idx_txn_investment_id (investment_id),
            INDEX idx_txn_date (txn_date),
            INDEX idx_txn_type (txn_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    logger_info('MySQL: tables ready');
}

function mysql_initialize_database_once(): void
{
    global $dbConfig;

    logger_info('MySQL: connecting', mysql_get_connection_summary());

    $serverDsn = sprintf(
        'mysql:host=%s;port=%d;charset=utf8mb4',
        $dbConfig['host'],
        $dbConfig['port']
    );

    $connection = new PDO(
        $serverDsn,
        $dbConfig['user'],
        $dbConfig['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    logger_info('MySQL: server reachable, ensuring database exists', ['database' => $dbConfig['database']]);
    $dbName = $dbConfig['database'];
    $connection->exec("CREATE DATABASE IF NOT EXISTS `{$dbName}`");
    $connection = null;

    global $mysqlPool;
    $mysqlPool = null;
    mysql_get_pool();
    mysql_create_tables();
    logger_info('MySQL: initialization complete', mysql_get_connection_summary());
}

function mysql_initialize_database(): void
{
    $maxAttempts = (int) ($_ENV['DB_CONNECT_RETRIES'] ?? 15);
    $delayMs = (int) ($_ENV['DB_CONNECT_DELAY_MS'] ?? 2000);

    logger_info('MySQL: starting connection attempts', array_merge([
        'maxAttempts' => $maxAttempts,
        'delayMs' => $delayMs,
        'maxWaitSeconds' => (int) round(($maxAttempts * $delayMs) / 1000),
    ], mysql_get_connection_summary()));

    global $mysqlPool;

    for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
        try {
            mysql_initialize_database_once();
            return;
        } catch (Throwable $error) {
            logger_log_error("MySQL initialization attempt {$attempt}/{$maxAttempts}", $error, mysql_get_connection_summary());
            $mysqlPool = null;
            if ($attempt === $maxAttempts) {
                logger_error('MySQL: all connection attempts exhausted', [
                    'hint' => 'Check DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME and that MySQL is running',
                ]);
                throw $error;
            }
            logger_warn('MySQL: retrying connection', ['attempt' => $attempt, 'nextRetryInMs' => $delayMs]);
            mysql_sleep($delayMs);
        }
    }
}

function mysql_ensure_tables_exist(): void
{
    global $mysqlPool;
    if ($mysqlPool === null) {
        mysql_get_pool();
    }
    mysql_create_tables();
}
