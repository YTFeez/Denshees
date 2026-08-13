#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.hostinger.example .env
  echo "Created .env — edit JWT_SECRET / API_KEY / POSTGRES_PASSWORD then re-run."
  exit 1
fi

docker compose -f docker-compose.hostinger.yml --env-file .env up -d --build

echo "Waiting for postgres..."
sleep 8

echo "Running migrations..."
docker compose -f docker-compose.hostinger.yml --env-file .env run --rm --no-deps backend \
  sh -c "cd /app && pnpm --filter @denshees/database exec prisma migrate deploy" || \
docker compose -f docker-compose.hostinger.yml --env-file .env exec backend \
  sh -c "cd /app && pnpm --filter @denshees/database exec prisma migrate deploy" || true

echo ""
echo "Denshees should be at: http://$(curl -s ifconfig.me 2>/dev/null || echo VPS_IP):3000"
echo "Open firewall port 3000 in Hostinger if the page does not load."
