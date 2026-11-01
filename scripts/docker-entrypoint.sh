#!/bin/sh
# Контейнер эхлэхэд: өгөгдлийн санг хүлээж, хүснэгтүүдийг шинэчилж, админ (хүсвэл жишээ өгөгдөл) үүсгээд серверийг асаана.
set -e
node scripts/wait-db.mjs
node scripts/migrate.mjs
if [ "${SEED_DEMO:-0}" = "1" ]; then
  node scripts/seed.mjs
else
  node scripts/seed.mjs --admin-only
fi
exec node node_modules/next/dist/bin/next start -p "${PORT:-3000}" -H 0.0.0.0
