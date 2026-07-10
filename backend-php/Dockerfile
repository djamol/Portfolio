# Portfolio backend API (Slim + MySQL/MongoDB)
FROM php:8.2-cli-alpine

RUN apk add --no-cache \
    git \
    unzip \
    icu-dev \
    libzip-dev \
    $PHPIZE_DEPS \
    openssl-dev \
    && docker-php-ext-install pdo pdo_mysql \
    && pecl install mongodb \
    && docker-php-ext-enable mongodb \
    && apk del --no-cache git $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

COPY config ./config
COPY db ./db
COPY routes ./routes
COPY utils ./utils
COPY public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info

ENV DB_TYPE=mysql
ENV DB_HOST=localhost
ENV DB_USER=root
ENV DB_PASSWORD=portfolio
ENV DB_NAME=portfolio
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD php -r '$p=(int)(getenv("PORT")?:3000);$c=@file_get_contents("http://127.0.0.1:".$p."/api/health");exit($c?0:1);'

CMD ["php", "-S", "0.0.0.0:3000", "-t", "public", "public/index.php"]
