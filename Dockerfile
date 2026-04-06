FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
ARG CACHE_BUST=1
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ ./dist/
ENV TRANSPORT=http
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["node", "dist/index.js"]
