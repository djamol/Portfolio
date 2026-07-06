# Single-container build: Angular frontend + Express backend
# Stage 1 — build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci && npm cache clean --force

COPY frontend/angular.json frontend/tsconfig.json frontend/tsconfig.app.json ./
COPY frontend/src ./src

RUN npx ng build --configuration production --base-href /

# Stage 2 — backend + serve static frontend
FROM node:20-alpine

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/config ./config
COPY backend/routes ./routes
COPY backend/utils ./utils
COPY backend/server.js ./

COPY --from=frontend-build /app/frontend/dist/portfolio-frontend ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
