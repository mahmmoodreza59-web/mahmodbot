# به‌جای وابستگی به تشخیص خودکار Railpack، این Dockerfile مستقیم و قطعی
# می‌گوید ربات چطور بیلد و اجرا شود — دیگر جایی برای اشتباه تشخیص نمی‌ماند.

FROM node:20-slim

WORKDIR /app

# ابزارهای لازم برای کامپایل ماژول native (better-sqlite3) در صورت نیاز
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["node", "server.js"]
