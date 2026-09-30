ARG NODE_IMAGE=node:26.9.0-bookworm-slim

FROM ${NODE_IMAGE} AS tooling
ARG PNPM_VERSION=12.6.0
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV XDG_CACHE_HOME=/pnpm/cache
ENV npm_config_cache=/pnpm/npm-cache
ENV npm_config_update_notifier=false
WORKDIR /workspace
RUN npm install --global --allow-scripts=pnpm pnpm@${PNPM_VERSION} \
    && mkdir -p /data \
    && chmod 1777 /data

FROM tooling AS build
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM tooling AS production-dependencies
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --prod --frozen-lockfile --filter @raft/backend...

FROM ${NODE_IMAGE} AS production
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN mkdir -p /data /app/apps/backend /app/apps/frontend /app/packages/shared \
    && chown -R node:node /data /app
COPY --from=production-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/backend/package.json ./apps/backend/package.json
COPY --from=build --chown=node:node /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=build --chown=node:node /workspace/apps/frontend/out/site ./apps/frontend/out/site
COPY --from=build --chown=node:node /workspace/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /workspace/packages/shared/dist ./packages/shared/dist
USER node
EXPOSE 3000
CMD ["node", "apps/backend/dist/main.js"]
