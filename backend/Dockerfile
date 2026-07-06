# Portfolio backend API (Express + MySQL)
FROM node:20-alpine

WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source
COPY config ./config
COPY routes ./routes
COPY utils ./utils
COPY server.js ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
