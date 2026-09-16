// ============================================================
// db.js — جایگزین KV و D1 کلادفلر برای اجرا روی Node.js / Railway
// ============================================================
//
// فایل bot.js اصلاً دست نخورده و همانی است که برای Cloudflare Workers
// نوشته شده بود. آن فایل انتظار دو چیز را از env دارد:
//   env.SHOP_KV  → یک KV ساده با متدهای async get(key) / put(key, value, {expirationTtl})
//   env.DB       → یک دیتابیس D1 با env.DB.prepare(sql).bind(...).run()/.all()/.first()
//
// این فایل همان دو رابط را با یک فایل SQLite واحد (روی دیسک) پیاده‌سازی
// می‌کند تا داده‌ها بین ری‌استارت‌ها و دیپلوی‌های مجدد روی Railway از بین
// نروند. برای ماندگاری کامل، یک Volume در Railway به مسیر DATA_DIR وصل کنید
// (پیش‌فرض: ./data) — در غیر این صورت داده‌ها با هر دیپلوی جدید پاک می‌شوند.
//
// چون Cloudflare D1 خودش هم روی SQLite ساخته شده، تمام کوئری‌های SQL داخل
// bot.js (CREATE TABLE، INSERT/UPDATE/SELECT با ? placeholder) بدون هیچ
// تغییری روی better-sqlite3 هم کار می‌کنند.
// ============================================================

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbFilePath = path.join(DATA_DIR, 'app.sqlite');
const sqlite = new Database(dbFilePath);
sqlite.pragma('journal_mode = WAL');

console.log(`[db] SQLite file: ${dbFilePath}`);

// ------------------------------------------------------------
// جدول کلید/مقدار — جایگزین Cloudflare KV (SHOP_KV)
// ------------------------------------------------------------
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    expires_at  INTEGER
  )
`);

const kvGetStmt = sqlite.prepare('SELECT value, expires_at FROM kv_store WHERE key = ?');
const kvPutStmt = sqlite.prepare(`
  INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
`);
const kvDeleteStmt = sqlite.prepare('DELETE FROM kv_store WHERE key = ?');

export const SHOP_KV = {
  async get(key) {
    const row = kvGetStmt.get(key);
    if (!row) return null;
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
      kvDeleteStmt.run(key); // منقضی شده — پاک می‌کنیم
      return null;
    }
    return row.value;
  },
  async put(key, value, options = {}) {
    const ttl = options && options.expirationTtl ? Number(options.expirationTtl) : null;
    const expiresAt = ttl ? Math.floor(Date.now() / 1000) + ttl : null;
    kvPutStmt.run(key, value, expiresAt);
  },
  async delete(key) {
    kvDeleteStmt.run(key);
  },
};

// ------------------------------------------------------------
// شبیه‌ساز D1 — جایگزین Cloudflare D1 (env.DB)
// bot.js همیشه به این شکل صدا می‌زند:
//   env.DB.prepare(sql).bind(...params).run()/.all()/.first()
//   env.DB.prepare(sql).run()/.first()   (بدون bind، برای کوئری‌های بدون پارامتر)
// ------------------------------------------------------------
function makeBoundResult(stmt, args) {
  return {
    async run() {
      const info = stmt.run(...args);
      return {
        success: true,
        meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
      };
    },
    async all() {
      const results = stmt.all(...args);
      return { results, success: true };
    },
    async first() {
      const row = stmt.get(...args);
      return row === undefined ? null : row;
    },
  };
}

export const DB = {
  prepare(sql) {
    const stmt = sqlite.prepare(sql);
    return {
      bind(...args) {
        return makeBoundResult(stmt, args);
      },
      run() {
        return makeBoundResult(stmt, []).run();
      },
      all() {
        return makeBoundResult(stmt, []).all();
      },
      first() {
        return makeBoundResult(stmt, []).first();
      },
    };
  },
};
