# Exact stable official runtime; wrapper source preserved from the live service.
FROM ghcr.io/openclaw/openclaw:2026.10.8@sha256:82b6ce63048e75ca749dbc250e872ee21f4b1c098fc6bff94636e357bcb64bf5 AS upstream
FROM node:24.22.1-bookworm@sha256:6449e19d8184d84062525b6a7524def03146c2cb04a7f08b076680d0e8e4240a
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates tini python3 python3-venv git openssh-client libgomp1 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=upstream /app /openclaw
RUN corepack enable && corepack prepare "$(node -p 'require("/openclaw/package.json").packageManager')" --activate
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
RUN printf '%s\n' '#!/bin/sh' 'exec node /openclaw/openclaw.mjs "$@"' > /usr/local/bin/openclaw && chmod 755 /usr/local/bin/openclaw
RUN openclaw --version && test "$(node -p 'require("/openclaw/package.json").version')" = 2026.10.8
ENV NPM_CONFIG_PREFIX=/data/npm NPM_CONFIG_CACHE=/data/npm-cache PNPM_HOME=/data/pnpm PNPM_STORE_DIR=/data/pnpm-store
ENV PATH="/data/npm/bin:/data/pnpm:${PATH}"
COPY src ./src
EXPOSE 8080
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
