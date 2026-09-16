// ============================================================
// server.js — نقطه ورود روی Railway (یا هر هاست Node.js دیگر)
// ============================================================
//
// bot.js دقیقاً همان فایلی است که برای Cloudflare Workers نوشته شده و
// خروجی‌اش یک آبجکت با متد fetch(request, env, ctx) است (استاندارد Web
// Fetch API، نه Express). این فایل یک سرور معمولی Node.js بالا می‌آورد،
// هر درخواست HTTP را به یک Request استاندارد تبدیل می‌کند، به همان
// fetch(...) می‌دهد، و Response برگشتی را به کلاینت می‌فرستد.
//
// یعنی bot.js اصلاً دست نخورده باقی مانده — فقط «لباس» اجرا عوض شده.
// ------------------------------------------------------------

import http from 'node:http';
import worker from './bot.js';
import { SHOP_KV, DB } from './db.js';

const PORT = process.env.PORT || 3000;

// env همان آبجکتی است که روی Cloudflare Workers هم به fetch() داده می‌شد:
// همه متغیرهای محیطی + دو binding (SHOP_KV و DB) که در db.js پیاده شده‌اند.
const env = {
  ...process.env,
  SHOP_KV,
  DB,
};

// روی Cloudflare Workers، ctx.waitUntil اجازه می‌دهد یک کار پس‌زمینه بعد از
// پاسخ‌دادن هم ادامه پیدا کند. در Node.js پردازه تا وقتی promise تمام نشود
// خودش زنده می‌ماند، پس کافی‌ست فقط خطاهایش را بگیریم تا crash نکند.
const ctx = {
  waitUntil(promise) {
    Promise.resolve(promise).catch((err) => {
      console.error('[waitUntil] background task error:', err);
    });
  },
};

async function nodeRequestToWebRequest(req) {
  // Railway پشت یک پراکسی است؛ پروتکل و هاست واقعی (که برای ساخت آدرس
  // وبهوک لازم است) از این هدرهای استاندارد proxy خوانده می‌شود.
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${PORT}`;
  const url = `${proto}://${host}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body;
  if (hasBody) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

async function sendWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await webResponse.arrayBuffer());
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  try {
    const webRequest = await nodeRequestToWebRequest(req);
    const webResponse = await worker.fetch(webRequest, env, ctx);
    await sendWebResponse(res, webResponse);
  } catch (err) {
    console.error('[server] request handling error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=UTF-8');
      res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`✅ ربات روی پورت ${PORT} بالا آمد`);
  console.log('برای تنظیم خودکار وبهوک، آدرس عمومی Railway را در مرورگر باز کنید (مسیر /).');
});
