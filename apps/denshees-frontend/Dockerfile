FROM node:lts-alpine

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./

COPY apps/denshees-frontend/package.json apps/denshees-frontend/
COPY packages/database/package.json packages/database/

RUN pnpm install --frozen-lockfile

COPY packages/database/ packages/database/
COPY apps/denshees-frontend/ apps/denshees-frontend/

ENV DATABASE_URL="postgresql://postgres:build@postgres:5432/denshees"
ENV JWT_SECRET="build-time-jwt-secret"
ENV API_KEY="build-time-api-key"
ENV OPENAI_API_KEY="sk-build-placeholder"
ENV DODO_PAYMENTS_API_KEY="dp_build_placeholder"
ENV NODE_OPTIONS="--max-old-space-size=3072"

RUN pnpm --filter @denshees/database db:generate

WORKDIR /app/apps/denshees-frontend
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
