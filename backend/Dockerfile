# syntax=docker/dockerfile:1
# Build context is the REPOSITORY ROOT (the backend imports ../shared):
#   docker build -f backend/Dockerfile -t balanss-api .

FROM node:22-slim AS build
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci
COPY shared shared
COPY backend backend
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production \
    TZ=UTC \
    PORT=3000 \
    STORAGE_DIR=/data/storage
WORKDIR /app/backend
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/drizzle ./drizzle
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
