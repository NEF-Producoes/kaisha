# Kaisha · um container só, sem banco externo
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TZ=America/Sao_Paulo
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev
COPY server ./server
COPY web ./web
COPY themes ./themes
COPY examples ./examples
COPY LICENSE README.md ./
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" >/dev/null || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
