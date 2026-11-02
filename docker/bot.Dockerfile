FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
# --ignore-scripts: better-sqlite3 ships prebuilt binaries, but npm would still try to compile it
# (needs Python + a C++ compiler). None of our dependencies need an install script. Same in .npmrc.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY config ./config

# Run as the unprivileged "node" user; data/ is a volume for the SQLite file.
RUN mkdir -p /app/data && chown node:node /app/data
USER node

CMD ["node", "src/index.ts"]
