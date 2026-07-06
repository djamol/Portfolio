# Stage 1: Build Angular app
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src

# Serve from container root (Back4App dedicated frontend container)
RUN npx ng build --configuration production --base-href /

# Stage 2: Serve static files with nginx
FROM nginx:1.27-alpine

COPY --from=build /app/dist/portfolio-frontend /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=80

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
