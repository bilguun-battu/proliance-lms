#!/usr/bin/env bash
# Codespaces / Dev Container анх үүсэхэд: .env үүсгэж, хамаарал суулгаж, өгөгдлийн санг жишээ өгөгдөлтэй бэлтгэнэ.
set -e
if [ ! -f .env ]; then
  if [ -n "$CODESPACE_NAME" ]; then
    APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  else
    APP_URL="http://localhost:3000"
  fi
  cat > .env <<ENV
DATABASE_URL=postgresql://proliance:proliance@localhost:5432/proliance_lms
AUTH_SECRET=$(openssl rand -hex 32)
APP_URL=${APP_URL}
UPLOAD_DIR=./uploads
ADMIN_EMAIL=admin@proliance.mn
ADMIN_PASSWORD=Proliance2026!
CRON_SECRET=$(openssl rand -hex 16)
APP_TZ=Asia/Ulaanbaatar
SERVER_ACTIONS_ORIGINS=*.app.github.dev,localhost:3000
ENV
  echo ".env үүслээ: ${APP_URL}"
fi
npm ci --no-audit --no-fund
npm run db:wait
npm run db:migrate
npm run db:seed
echo "Бэлэн. Админ: admin@proliance.mn / Proliance2026!  Жишээ хэрэглэгчид: Test1234!"
