# ARABIC.ONE backend — ikki bosqichli qurilish.
# 1-bosqichda TypeScript kompilyatsiya qilinadi, 2-bosqichga faqat
# tayyor natija ko'chiriladi — образ kichik qoladi.
#
# Baza uchun Node'ning o'z `node:sqlite` moduli ishlatiladi, shuning uchun
# native modul yig'ish (python/g++) kerak emas.

FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# Ishlab turadigan образ
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
# db.ts sxemani ../db/schema.sql dan o'qiydi (dist'ga nisbatan)
COPY db/schema.sql ./db/schema.sql

# Baza va rasmlar — doimiy hajmlarda (volume) saqlanadi.
# Konteyner ichida root'dan ishlamaydi.
RUN mkdir -p /data /app/uploads && chown -R node:node /data /app
USER node

ENV DB_PATH=/data/arabic.db
ENV PORT=3000
EXPOSE 3000

# Sog'liq tekshiruvi: konteyner ko'tarilganini compose shu orqali biladi
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/public/support').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
