/**
 * ==========================================================================
 *  ربات فروش اشتراک تلگرام - Cloudflare Workers
 *  فروش فیلترشکن پارس وی پی ان + اتصال کامل به API پنل PasarGuard
 * ==========================================================================
 *
 *  نحوه استقرار:
 *   1) این فایل را در Cloudflare Workers ایجاد کنید (Workers & Pages > Create).
 *
 *   2) این مقادیر را به‌صورت Secret ست کنید (Settings > Variables and Secrets
 *      یا «npx wrangler secret put NAME»). هیچ‌کدام داخل کد نوشته نشده‌اند:
 *        TELEGRAM_BOT_TOKEN   = توکن ربات از BotFather                    [اجباری]
 *        ADMIN_IDS            = آیدی عددی ادمین‌ها با کاما، اولی=ادمین اصلی [اجباری]
 *        WEBHOOK_SECRET       = رشته تصادفی برای امضای وبهوک تلگرام       [توصیه‌شده]
 *        PASARGUARD_BASE_URL  = مثل https://panel.example.com:8000        [اجباری]
 *        PASARGUARD_API_TOKEN = کلید API پنل، با pg_key_ شروع می‌شود      [توصیه‌شده]
 *        PASARGUARD_USERNAME  = جایگزین API Key: نام کاربری ادمین پنل
 *        PASARGUARD_PASSWORD  = جایگزین API Key: رمز ادمین پنل
 *        PAYMENT_CALLBACK_SECRET = کلید HMAC برای callback درگاه (اختیاری)
 *      متغیرهای زیر اختیاری هستند (مقدار اولیه؛ بعداً از داخل پنل ادمین
 *      قابل تغییرند و آن تغییرات در اولویت قرار می‌گیرند):
 *        ADMIN_CHAT_ID   = مقصد اعلان سفارش‌ها (گروه با -100... یا آیدی خودت)
 *        ADMIN_GROUP_ID  = -1001234567890
 *        SUPPORT_USERNAME= mahmmoodreza_13
 *        CHANNEL_ID      = @pars_vpn100
 *        SHOP_NAME       = فروش فیلترشکن پارس وی پی ان
 *        PG_USERNAME_PREFIX      = pv
 *        PASARGUARD_SUB_BASE_URL = آدرس پایه لینک اشتراک (اگر با آدرس پنل فرق دارد)
 *      نام‌های قدیمی BOT_TOKEN و ADMIN_USER_ID هم برای سازگاری پذیرفته می‌شوند.
 *
 *      راهنمای کامل نصب، دستورهای wrangler و بخش
 *      «PASARGUARD API CONFIGURATION» در فایل README.md آمده است.
 *
 *   3) برای ذخیره‌سازی دائمی (تا داده‌ها با ری‌استارت/دیپلوی مجدد Worker از
 *      بین نروند)، یک Cloudflare KV Namespace بسازید و آن را با نام
 *      متغیر SHOP_KV به این Worker متصل (bind) کنید:
 *        Workers & Pages > (این Worker) > Settings > Bindings > Add binding
 *        > KV Namespace > Variable name: SHOP_KV > یک namespace جدید بسازید یا انتخاب کنید
 *      اگر این binding را اضافه نکنید، ربات باز هم کار می‌کند، اما داده‌ها
 *      (سفارش‌ها، کارت‌ها، بسته‌ها، کیف پول‌ها، ادمین‌های اضافه‌شده، تنظیمات)
 *      فقط در حافظه موقت می‌مانند و با ری‌استارت Worker پاک می‌شوند. وضعیت
 *      این مورد در صفحه اصلی (/) و در پنل ادمین نمایش داده می‌شود.
 *
 *   ۳-ب) برای گزارش‌گیری، حسابداری و لاگ ماندگار، یک Cloudflare D1 Database
 *      بسازید و با نام متغیر DB به این Worker متصل (bind) کنید:
 *        Workers & Pages > (این Worker) > Settings > Bindings > Add binding
 *        > D1 database > Variable name: DB
 *      ⚠️ نیازی به اجرای دستی migration نیست؛ همین فایل اسکیمای کامل را
 *      داخل خودش دارد (بخش ۲.۶) و در اولین اجرا جدول‌ها را می‌سازد.
 *      اگر D1 را وصل نکنید ربات کامل کار می‌کند و فقط گزارش‌گیری SQL
 *      و لاگ ماندگار را ندارید.
 *
 *   4) پس از Deploy، آدرس Worker را در مرورگر باز کنید (صفحه اصلی /)
 *      وبهوک و منوی دستورات ربات به‌صورت خودکار تنظیم می‌شوند.
 *
 *   5) تقریباً همه‌چیز (نام فروشگاه، آیدی پشتیبانی/کانال/گروه ادمین، متن
 *      دکمه‌ها، عنوان دسته‌بندی محصول، کارت‌های بانکی، ادمین‌ها، بسته‌های
 *      اینترنتی، کیف پول کاربران و وضعیت عضویت اجباری) از داخل پنل ادمین
 *      ربات (/admin) قابل افزودن/ویرایش/حذف است و برای همیشه ذخیره می‌شود.
 *
 *   6) ⚠️ نکته مهم درباره «عضویت اجباری در کانال»: برای اینکه ربات بتواند
 *      عضویت کاربران را چک کند، باید ربات را در کانال (CHANNEL_ID) به‌عنوان
 *      «ادمین» اضافه کنید. اگر ربات ادمین کانال نباشد، تلگرام اجازه استعلام
 *      عضویت را نمی‌دهد و برای جلوگیری از قفل‌شدن کامل ربات، در این حالت
 *      کاربران مسدود نمی‌شوند (fail-open).
 * ==========================================================================
 */

// ============================================================
// ۱. تنظیمات و ثابت‌ها
// ============================================================

const DEFAULTS = {
  ADMIN_GROUP_ID: '',
  SUPPORT_USERNAME: 'mahmmoodreza_13',
  CHANNEL_ID: '@pars_vpn100',
  SHOP_NAME: 'فروش فیلترشکن پارس وی پی ان',
  BTN_SHOP_LABEL: '🛒 خرید اشتراک',
  BTN_MYORDERS_LABEL: '📦 اشتراک من',
  BTN_RENEW_LABEL: '🔄 تمدید اشتراک',
  BTN_STATUS_LABEL: '📊 وضعیت اشتراک',
  BTN_WALLET_LABEL: '💰 کیف پول',
  BTN_SUPPORT_LABEL: '🎫 پشتیبانی',
  BTN_CHANNEL_LABEL: '📢 کانال',
  BTN_TESTCONFIG_LABEL: '🎁 تست کانفیگ رایگان',
  BTN_INVITE_LABEL: '👥 دعوت دوستان',
  INVITE_TEXT: 'دوستت را به {shop} دعوت کن! 💙\nبا لینک زیر وارد ربات شو:\n{link}',
  // متن و لینک پیش‌فرض دکمه شیشه‌ای زیر «تبلیغ در کانال» — هنگام ساخت آگهی
  // جدید با دستور /default قابل استفاده است و از داخل پنل ادمین قابل تغییر است.
  // مقدار ویژه «shop» برای لینک یعنی: با زدن دکمه، کاربر مستقیماً وارد ربات
  // شده و منوی «خرید اشتراک» برایش باز می‌شود (نیازی به لینک دستی نیست).
  // ادمین می‌تواند این مقدار را از پنل تنظیمات با یک لینک دلخواه (کانال،
  // گروه پشتیبانی و ...) جایگزین کند.
  AD_DEFAULT_BUTTON_TEXT: '🛒 خرید اشتراک',
  AD_DEFAULT_BUTTON_URL: 'shop',
  // ---------- رنگ‌بندی دکمه‌های صفحه وضعیت (/) — از پنل مدیریتی /theme قابل تغییر است ----------
  THEME_COLOR_GREEN: '#62C457',
  THEME_COLOR_BLUE: '#4AA9E5',
  THEME_COLOR_RED: '#E16668',
  THEME_COLOR_BG: '#EEF5F2',
  // ---------- رنگ دکمه‌های واقعی ربات تلگرام (منوی اصلی) ----------
  // از نسخه Bot API 9.4 (فوریه ۲۰۲۶) تلگرام فیلد «style» را به دکمه‌های
  // Reply Keyboard و Inline Keyboard اضافه کرد که فقط سه مقدار می‌پذیرد:
  // 'primary' (آبی)، 'success' (سبز)، 'danger' (قرمز). رنگ دلخواه/HEX روی
  // دکمه‌های واقعی چت تلگرام امکان‌پذیر نیست؛ فقط همین سه گزینه.
  BTN_STYLE_SHOP: 'success',
  BTN_STYLE_MYORDERS: 'primary',
  BTN_STYLE_RENEW: 'success',
  BTN_STYLE_STATUS: 'primary',
  BTN_STYLE_WALLET: 'primary',
  BTN_STYLE_TESTCONFIG: 'success',
  BTN_STYLE_INVITE: 'primary',
  BTN_STYLE_SUPPORT: 'danger',
  BTN_STYLE_CHANNEL: 'primary',
  PRODUCT_CATEGORY_TITLE: '📦 بسته‌های اینترنت',
  // متن پیام بالای دکمه‌های دسته‌بندی، وقتی کاربر روی «🛒 خرید اشتراک» یا
  // «⚪ بازگشت» از صفحه بسته‌ها می‌زند و به این صفحه برمی‌گردد.
  PRODUCT_SELECT_TEXT: '📦 دسته‌بندی را انتخاب کنید:',
  WELCOME_EXTRA_TEXT:
    '🌟 به پارس VPN خوش اومدی! 🌟\n' +
    'ممنون که ما رو انتخاب کردی 💙\n' +
    'اینجا قراره با سرعت بالا، اتصال پایدار، امنیت مطمئن و لوکیشن‌های متنوع یک تجربه متفاوت از اینترنت داشته باشی. 🚀🌐\n\n' +
    '💰 گیگی فقط ۴ هزار تومان\n' +
    '🎧 پشتیبانی ۲۴ ساعته\n' +
    '⚡ سرعت و پایداری بالا\n' +
    '🔒 امنیت پیشرفته\n' +
    '📩 برای خرید و راهنمایی پیام بده: @mahmmoodreza_13\n\n' +
    '❤️ پارس VPN؛ سریع وصل شو، راحت استفاده کن!',
};

// فیلدهایی از تنظیمات که ادمین می‌تواند از داخل ربات تغییر دهد و برای همیشه ذخیره شود
const SETTINGS_FIELDS = {
  SHOP_NAME: 'نام فروشگاه',
  SUPPORT_USERNAME: 'آیدی پشتیبانی (بدون @)',
  CHANNEL_ID: 'آیدی کانال (مثل ‎@channel)',
  ADMIN_GROUP_ID: 'آیدی عددی گروه ادمین (مقصد سفارش‌ها)',
  PRODUCT_CATEGORY_TITLE: 'عنوان دسته‌بندی محصول (در فروشگاه)',
  PRODUCT_SELECT_TEXT: 'متن پیام «انتخاب دسته‌بندی» (بالای دکمه‌ها)',
  WELCOME_EXTRA_TEXT: 'متن تبلیغاتی خوش‌آمدگویی (زیر پیام /start)',
  BTN_SHOP_LABEL: 'متن دکمه «خرید اشتراک»',
  BTN_MYORDERS_LABEL: 'متن دکمه «اشتراک من»',
  BTN_RENEW_LABEL: 'متن دکمه «تمدید اشتراک»',
  BTN_STATUS_LABEL: 'متن دکمه «وضعیت اشتراک»',
  BTN_WALLET_LABEL: 'متن دکمه «کیف پول»',
  BTN_SUPPORT_LABEL: 'متن دکمه «پشتیبانی»',
  BTN_CHANNEL_LABEL: 'متن دکمه «کانال»',
  BTN_TESTCONFIG_LABEL: 'متن دکمه «تست کانفیگ»',
  BTN_INVITE_LABEL: 'متن دکمه «دعوت دوستان»',
  INVITE_TEXT: 'متن دعوت دوستان (متغیرها: {link} و {shop})',
  AD_DEFAULT_BUTTON_TEXT: 'متن پیش‌فرض دکمه تبلیغ کانال',
  AD_DEFAULT_BUTTON_URL: 'لینک پیش‌فرض دکمه تبلیغ کانال (shop = باز شدن خودکار خرید اشتراک، یا یک لینک کامل)',
};

// رنگ دکمه‌های صفحه وضعیت (/) — این‌ها از داخل ربات تلگرام قابل تغییر
// نیستند (فقط کدهای HEX هستند)؛ برای آن‌ها یک صفحه وب اختصاصی با
// Color Picker به آدرس /theme ساخته شده که فقط با کلید مدیریتی
// (همان WEBHOOK_SECRET) باز می‌شود. مقدار همیشه در DB.settings ذخیره
// می‌شود، یعنی دقیقاً همان سیستم ذخیره‌سازی موجود در پروژه.
const THEME_COLOR_FIELDS = {
  THEME_COLOR_GREEN: 'رنگ دکمه‌های سبز',
  THEME_COLOR_BLUE: 'رنگ دکمه‌های آبی',
  THEME_COLOR_RED: 'رنگ دکمه‌های قرمز/مرجانی',
  THEME_COLOR_BG: 'رنگ پس‌زمینه کلی',
};

// نگاشت رنگ واقعی دکمه‌های منوی اصلی ربات تلگرام (Reply Keyboard) — هر
// دکمه یکی از سه رنگ ثابت تلگرام (primary/success/danger) یا حالت
// پیش‌فرض کلاینت («» یعنی بدون استایل خاص) را می‌گیرد. از پنل ادمین
// (⚙️ تنظیمات فروشگاه → 🎨 رنگ دکمه‌های منو) قابل تغییر است.
const BTN_STYLE_TARGETS = {
  BTN_STYLE_SHOP: { labelKey: 'BTN_SHOP_LABEL', title: 'خرید اشتراک' },
  BTN_STYLE_MYORDERS: { labelKey: 'BTN_MYORDERS_LABEL', title: 'اشتراک من' },
  BTN_STYLE_RENEW: { labelKey: 'BTN_RENEW_LABEL', title: 'تمدید اشتراک' },
  BTN_STYLE_STATUS: { labelKey: 'BTN_STATUS_LABEL', title: 'وضعیت اشتراک' },
  BTN_STYLE_WALLET: { labelKey: 'BTN_WALLET_LABEL', title: 'کیف پول' },
  BTN_STYLE_TESTCONFIG: { labelKey: 'BTN_TESTCONFIG_LABEL', title: 'تست کانفیگ رایگان' },
  BTN_STYLE_INVITE: { labelKey: 'BTN_INVITE_LABEL', title: 'دعوت دوستان' },
  BTN_STYLE_SUPPORT: { labelKey: 'BTN_SUPPORT_LABEL', title: 'پشتیبانی' },
  BTN_STYLE_CHANNEL: { labelKey: 'BTN_CHANNEL_LABEL', title: 'کانال' },
};

const BTN_STYLE_CHOICES = [
  { value: '', emoji: '⚪', label: 'پیش‌فرض' },
  { value: 'primary', emoji: '🔵', label: 'آبی' },
  { value: 'success', emoji: '🟢', label: 'سبز' },
  { value: 'danger', emoji: '🔴', label: 'قرمز' },
];

// فیلد style را فقط وقتی به آبجکت دکمه اضافه می‌کند که مقدار معتبر باشد
function withButtonStyle(button, style) {
  return style && ['primary', 'success', 'danger'].includes(style)
    ? { ...button, style }
    : button;
}

// ============================================================
// ۱.۰ب دکمه «بازگشت به منوی قبلی» — استاندارد برای همه بخش‌ها
// ============================================================
// این دکمه در انتهای همه کیبوردهای اینلاین (شیشه‌ای) اضافه می‌شود.
// callback_data آن با پیشوند «navback:» است تا در همه‌جا یکسان مدیریت شود:
//   navback:admin → بازگشت به منوی اصلی ادمین (Reply Keyboard ادمین)
//   navback:main  → بازگشت به منوی اصلی مشتری (Reply Keyboard اصلی)
// برای بخش‌هایی که خودشان قبلاً یک دکمه بازگشت اختصاصی و دقیق‌تر دارند
// (مثلاً «بازگشت به لیست بسته‌ها»)، همان دکمه اختصاصی حفظ شده است.
const BACK_BUTTON_TEXT = '🔙 بازگشت به منوی قبلی';

function backNavRow(target) {
  return [{ text: BACK_BUTTON_TEXT, callback_data: `navback:${target}` }];
}

// برای رنگ‌آمیزی سراسری دکمه‌های شیشه‌ای (اینلاین) از پنل ادمین استفاده می‌شود.
// همان سه مقدار مجاز تلگرام (Bot API 9.4 به بعد): primary/success/danger
const GLASS_BTN_STYLE_CHOICES = [
  { value: '', emoji: '⚪', label: 'پیش‌فرض' },
  { value: 'primary', emoji: '🔵', label: 'آبی' },
  { value: 'success', emoji: '🟢', label: 'سبز' },
  { value: 'danger', emoji: '🔴', label: 'قرمز' },
];

// دو نوع دکمه شیشه‌ای در کل ربات وجود دارد که هرکدام رنگ جدا می‌گیرند:
//   INLINE_BTN_STYLE      → همه دکمه‌های اصلی/عملیاتی (مثل «📦 بسته‌های اینترنت»)
//   INLINE_BACK_BTN_STYLE → فقط دکمه «🔙 بازگشت به منوی قبلی» (navback:*)
// مقدار پیش‌فرض کارخانه‌ای: اصلی‌ها سبز، بازگشت آبی — تا در نگاه اول
// دکمه بازگشت از بقیه دکمه‌ها متمایز باشد.
const GLASS_STYLE_TARGETS = {
  INLINE_BTN_STYLE: { title: 'دکمه‌های اصلی (شیشه‌ای)', default: 'success' },
  INLINE_BACK_BTN_STYLE: { title: 'دکمه «بازگشت به منوی قبلی»', default: 'danger' },
  INLINE_CATEGORY_BTN_STYLE: { title: 'دکمه «دسته‌بندی محصولات»', default: 'success' },
  INLINE_PLAN_RIGHT_BTN_STYLE: { title: 'بسته‌ها — ستون راست', default: 'success' },
  INLINE_PLAN_LEFT_BTN_STYLE: { title: 'بسته‌ها — ستون چپ', default: 'primary' },
  INLINE_PLAN_LAST_BTN_STYLE: { title: 'بسته‌ها — دکمه آخر (تک‌ستونی)', default: 'danger' },
};

// این تابع رنگ سراسری انتخاب‌شده توسط ادمین را روی تک‌تک دکمه‌های شیشه‌ای
// (inline_keyboard) یک reply_markup اعمال می‌کند — مگر اینکه آن دکمه از قبل
// رنگ اختصاصی خودش را داشته باشد (مثل دکمه‌های تبلیغ کانال با style: 'success').
// دکمه‌های «بازگشت به منوی قبلی» (navback:*) رنگ جدا و مستقل از بقیه می‌گیرند.
function applyGlassStyle(replyMarkup) {
  if (!replyMarkup || !Array.isArray(replyMarkup.inline_keyboard)) return replyMarkup;
  const overrides = (DB && DB.settings) || {};
  const styleFor = (key) =>
    Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : GLASS_STYLE_TARGETS[key].default;
  const actionStyle = styleFor('INLINE_BTN_STYLE');
  const backStyle = styleFor('INLINE_BACK_BTN_STYLE');
  return {
    ...replyMarkup,
    inline_keyboard: replyMarkup.inline_keyboard.map((row) =>
      row.map((btn) => {
        if (!btn || btn.style) return btn; // دکمه‌ای که رنگ اختصاصی خودش را دارد دست‌نخورده می‌ماند
        const isBack =
          btn.text === BACK_BUTTON_TEXT ||
          (typeof btn.callback_data === 'string' && btn.callback_data.startsWith('navback:'));
        const style = isBack ? backStyle : actionStyle;
        return style && ['primary', 'success', 'danger'].includes(style) ? { ...btn, style } : btn;
      })
    ),
  };
}

// ============================================================
// ۱.۱ خواندن تنظیمات از Secrets / Environment
//     هیچ مقدار حساسی در کد hard-code نشده است.
// ============================================================

function stripTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * آدرس پایه پنل را تمیز می‌کند.
 *
 * کاربر معمولاً آدرسی را کپی می‌کند که در مرورگر باز است، مثل
 * «https://panel.example.com/dashboard/». اما API پنل روی ریشه دامنه است و
 * اگر «/dashboard» بماند، درخواست‌ها به فایل‌های داشبورد می‌خورند و پنل
 * جواب 404/405 می‌دهد (چون آن مسیر فقط GET است). پس این پسوندها را حذف می‌کنیم.
 */
function normalizePanelBaseUrl(value) {
  let url = stripTrailingSlash(value);
  // ممکن است چند لایه باشد: /dashboard/ یا /api/ یا /docs
  for (let i = 0; i < 3; i += 1) {
    const trimmed = url.replace(/\/(dashboard|api|docs|redoc|openapi\.json)$/i, '');
    if (trimmed === url) break;
    url = stripTrailingSlash(trimmed);
  }
  return url;
}

/**
 * مقدار ورودی آیدی کانال را برای استفاده در Bot API نرمال‌سازی می‌کند.
 *
 * تلگرام برای sendMessage/sendPhoto فقط دو نوع chat_id قبول می‌کند:
 *   ۱) آیدی عددی (برای کانال‌های خصوصی همیشه با -100 شروع می‌شود)
 *   ۲) نام کاربری عمومی به‌صورت «@username»
 * لینک‌های دعوت خصوصی (t.me/+... یا t.me/joinchat/...) هیچ‌کدام از این دو
 * نیستند و اگر مستقیماً به‌عنوان chat_id فرستاده شوند، تلگرام خطای
 * «Bad Request: chat not found» می‌دهد. برای کانال خصوصی باید آیدی عددی را
 * از طریق فوروارد یک پست از کانال به ربات به دست آورد (در حین ویرایش این
 * تنظیم، ربات این کار را خودکار انجام می‌دهد).
 *
 * خروجی: { value, invitelink } — اگر invitelink=true یعنی ورودی یک لینک
 * دعوت خصوصی بوده و قابل استفاده مستقیم نیست.
 */
function normalizeChannelIdInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return { value: '', invitelink: false };
  // آیدی عددی (کانال‌های خصوصی: -100xxxxxxxxxx)
  if (/^-?\d{3,20}$/.test(value)) return { value, invitelink: false };
  // لینک دعوت خصوصی: t.me/+xxxx یا t.me/joinchat/xxxx → قابل تبدیل به chat_id نیست
  if (/t\.me\/(\+|joinchat\/)/i.test(value)) return { value, invitelink: true };
  // لینک عمومی: https://t.me/username یا t.me/username → به @username تبدیل می‌شود
  const publicLinkMatch = value.match(/t\.me\/([A-Za-z0-9_]{5,32})\/?$/i);
  if (publicLinkMatch) return { value: `@${publicLinkMatch[1]}`, invitelink: false };
  // نام کاربری با یا بدون @
  const username = value.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{5,32}$/.test(username)) return { value: `@${username}`, invitelink: false };
  return { value, invitelink: false };
}

// آیدی ادمین‌ها از ADMIN_IDS (چندتایی، با کاما) یا ADMIN_USER_ID قدیمی
function parseAdminIds(env) {
  const raw = String(env.ADMIN_IDS || env.ADMIN_USER_ID || '');
  const ids = [];
  for (const piece of raw.split(/[,\s;]+/)) {
    const id = piece.trim();
    if (/^\d{3,20}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// نام کاربری پاسارگارد فقط [a-zA-Z0-9-_@.] می‌پذیرد و کاراکتر ویژه تکراری ممنوع است،
// پس پیشوند را به حروف و رقم محدود می‌کنیم.
function sanitizePgPrefix(value) {
  const clean = String(value || 'bot').replace(/[^a-zA-Z0-9]/g, '11').slice(0, 16);
  return clean || 'pv';
}

function getConfig(env) {
  const adminIds = parseAdminIds(env);
  const base = {
    // ---------- تلگرام ----------
    BOT_TOKEN: env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || '',
    WEBHOOK_SECRET: String(env.WEBHOOK_SECRET || 'https://tiny-art-7ed5.mahmmoodreza59.workers.dev/'),
    ADMIN_IDS: adminIds,
    ADMIN_USER_ID: adminIds[0] || '7799828411',
    ADMIN_GROUP_ID: env.ADMIN_GROUP_ID || DEFAULTS.ADMIN_GROUP_ID,
    // مقصد اختصاصی اعلان‌های ادمین. اگر خالی باشد، اول گروه ادمین و بعد
    // چت خصوصی اولین ادمین امتحان می‌شود تا اعلان سفارش هیچ‌وقت گم نشود.
    ADMIN_CHAT_ID: String(env.ADMIN_CHAT_ID || '7799828411').trim(),
    SUPPORT_USERNAME: env.SUPPORT_USERNAME || DEFAULTS.SUPPORT_USERNAME,
    CHANNEL_ID: env.CHANNEL_ID || DEFAULTS.CHANNEL_ID,
    SHOP_NAME: env.SHOP_NAME || DEFAULTS.SHOP_NAME,
    BTN_SHOP_LABEL: DEFAULTS.BTN_SHOP_LABEL,
    BTN_MYORDERS_LABEL: DEFAULTS.BTN_MYORDERS_LABEL,
    BTN_RENEW_LABEL: DEFAULTS.BTN_RENEW_LABEL,
    BTN_STATUS_LABEL: DEFAULTS.BTN_STATUS_LABEL,
    BTN_WALLET_LABEL: DEFAULTS.BTN_WALLET_LABEL,
    BTN_SUPPORT_LABEL: DEFAULTS.BTN_SUPPORT_LABEL,
    BTN_CHANNEL_LABEL: DEFAULTS.BTN_CHANNEL_LABEL,
    BTN_TESTCONFIG_LABEL: DEFAULTS.BTN_TESTCONFIG_LABEL,
    BTN_INVITE_LABEL: DEFAULTS.BTN_INVITE_LABEL,
    INVITE_TEXT: DEFAULTS.INVITE_TEXT,
    REFERRAL_ENABLED: DB.settings.REFERRAL_ENABLED !== false,
    // پورسانت دعوت دوست: به‌ازای هر خریدی که دوست دعوت‌شده انجام دهد، درصدی
    // از مبلغ آن خرید به‌صورت خودکار به کیف پول دعوت‌کننده واریز می‌شود.
    REFERRAL_COMMISSION_ENABLED: DB.settings.REFERRAL_COMMISSION_ENABLED !== false,
    REFERRAL_COMMISSION_PERCENT:
      Number(DB.settings.REFERRAL_COMMISSION_PERCENT) > 0 ? Number(DB.settings.REFERRAL_COMMISSION_PERCENT) : 10,
    PRODUCT_CATEGORY_TITLE: DEFAULTS.PRODUCT_CATEGORY_TITLE,
    PRODUCT_SELECT_TEXT: DEFAULTS.PRODUCT_SELECT_TEXT,
    WELCOME_EXTRA_TEXT: DEFAULTS.WELCOME_EXTRA_TEXT,
    AD_DEFAULT_BUTTON_TEXT: DEFAULTS.AD_DEFAULT_BUTTON_TEXT,
    AD_DEFAULT_BUTTON_URL: DEFAULTS.AD_DEFAULT_BUTTON_URL,
    // ---------- رنگ‌بندی صفحه وضعیت ----------
    THEME_COLOR_GREEN: DEFAULTS.THEME_COLOR_GREEN,
    THEME_COLOR_BLUE: DEFAULTS.THEME_COLOR_BLUE,
    THEME_COLOR_RED: DEFAULTS.THEME_COLOR_RED,
    THEME_COLOR_BG: DEFAULTS.THEME_COLOR_BG,
    // ---------- رنگ دکمه‌های واقعی ربات تلگرام ----------
    BTN_STYLE_SHOP: DEFAULTS.BTN_STYLE_SHOP,
    BTN_STYLE_MYORDERS: DEFAULTS.BTN_STYLE_MYORDERS,
    BTN_STYLE_RENEW: DEFAULTS.BTN_STYLE_RENEW,
    BTN_STYLE_STATUS: DEFAULTS.BTN_STYLE_STATUS,
    BTN_STYLE_WALLET: DEFAULTS.BTN_STYLE_WALLET,
    BTN_STYLE_TESTCONFIG: DEFAULTS.BTN_STYLE_TESTCONFIG,
    BTN_STYLE_INVITE: DEFAULTS.BTN_STYLE_INVITE,
    BTN_STYLE_SUPPORT: DEFAULTS.BTN_STYLE_SUPPORT,
    BTN_STYLE_CHANNEL: DEFAULTS.BTN_STYLE_CHANNEL,
    // ---------- پاسارگارد (PasarGuard panel API) ----------
    // آدرس پایه پنل. اگر اشتباهاً «/dashboard» یا «/api» هم کپی شده باشد،
    // خودش پاک می‌شود — چون API پنل روی ریشه دامنه است.
    PG_BASE_URL: normalizePanelBaseUrl(env.PASARGUARD_BASE_URL),
    // روش ۱: API Key پنل (همیشه با pg_key_ شروع می‌شود) — با هدر X-Api-Key فرستاده می‌شود
    PG_API_TOKEN: String(env.PASARGUARD_API_TOKEN || '').trim(),
    // روش ۲: نام کاربری/رمز ادمین پنل — از POST /api/admin/token توکن JWT گرفته می‌شود
    PG_USERNAME: String(env.PASARGUARD_USERNAME || '').trim(),
    PG_PASSWORD: String(env.PASARGUARD_PASSWORD || ''),
    // آدرس پایه لینک اشتراک؛ اگر تنظیم نشود از خود آدرس پنل استفاده می‌شود
    PG_SUB_BASE_URL: normalizePanelBaseUrl(env.PASARGUARD_SUB_BASE_URL || env.PASARGUARD_BASE_URL),
    PG_USERNAME_PREFIX: sanitizePgPrefix(env.PG_USERNAME_PREFIX),
    // ---------- درگاه پرداخت ----------
    PAYMENT_CALLBACK_SECRET: String(env.PAYMENT_CALLBACK_SECRET || ''),
  };
  // تنظیماتی که ادمین از داخل ربات تغییر داده (در KV ذخیره شده) اولویت دارند
  const overrides = DB.settings || {};
  const merged = { ...base };
  for (const key of Object.keys(SETTINGS_FIELDS)) {
    if (overrides[key]) merged[key] = overrides[key];
  }
  // رنگ‌های تم که از صفحه وب /theme ذخیره شده‌اند نیز اولویت دارند
  for (const key of Object.keys(THEME_COLOR_FIELDS)) {
    if (overrides[key]) merged[key] = overrides[key];
  }
  // رنگ دکمه‌های منوی تلگرام؛ چون مقدار «پیش‌فرض» یک رشته خالی معتبر است
  // (نه «تنظیم نشده»)، اینجا باید صریحاً بررسی شود که آیا ادمین اصلاً این
  // مقدار را ذخیره کرده یا نه، نه فقط اینکه مقدار «راست» است یا نه.
  for (const key of Object.keys(BTN_STYLE_TARGETS)) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) merged[key] = overrides[key];
  }
  // رنگ سراسری دکمه‌های شیشه‌ای (اینلاین)؛ مثل بالا، رشته خالی هم مقدار معتبری است
  for (const key of Object.keys(GLASS_STYLE_TARGETS)) {
    merged[key] = Object.prototype.hasOwnProperty.call(overrides, key)
      ? overrides[key]
      : GLASS_STYLE_TARGETS[key].default;
  }
  return merged;
}

// بسته‌های اینترنتی پیش‌فرض (فقط برای اولین اجرا؛ پس از آن لیست واقعی از
// DB.plans خوانده می‌شود که کاملاً از پنل ادمین قابل مدیریت است)
//   gb         = حجم بسته به گیگابایت (۰ = نامحدود)
//   days       = مدت اعتبار به روز — در این نسخه همیشه ۰ است، یعنی
//                کانفیگ‌ها تاریخ انقضا ندارند و فقط با حجم محدود می‌شوند.
//                (فیلد در ساختار داده باقی مانده تا اگر روزی مدت‌دار خواستی
//                 بدون تغییر ساختار قابل استفاده باشد)
//   price      = قیمت به تومان
//   groupIds   = آرایه شناسه گروه‌های پاسارگارد که کاربر باید عضوشان شود
//                (بدون گروه، کاربر ساخته می‌شود ولی هیچ اینباند/کانفیگی ندارد)
//   templateId = اگر پر باشد، کاربر با POST /api/user/from_template ساخته می‌شود
//                و حجم/مدت از همان قالب پنل خوانده می‌شود
//   onHold     = true یعنی شمارش اعتبار از اولین اتصال کاربر شروع شود
const DEFAULT_PLANS = [
  { id: 'g5', title: 'گیگ 5', gb: 5, days: 0, price: 20, groupIds: [], templateId: null, onHold: false },
  { id: 'g10', title: 'گیگ 10', gb: 10, days: 0, price: 40, groupIds: [], templateId: null, onHold: false },
  { id: 'g15', title: 'گیگ 15', gb: 15, days: 0, price: 60, groupIds: [], templateId: null, onHold: false },
  { id: 'g20', title: 'گیگ 20', gb: 20, days: 0, price: 80, groupIds: [], templateId: null, onHold: false },
  { id: 'g25', title: 'گیگ 25', gb: 25, days: 0, price: 100, groupIds: [], templateId: null, onHold: false },
  { id: 'g30', title: 'گیگ 30', gb: 30, days: 0, price: 120, groupIds: [], templateId: null, onHold: false },
  { id: 'g35', title: 'گیگ 35', gb: 35, days: 0, price: 140, groupIds: [], templateId: null, onHold: false },
  { id: 'g40', title: 'گیگ 40', gb: 40, days: 0, price: 160, groupIds: [], templateId: null, onHold: false },
  { id: 'g45', title: 'گیگ 45', gb: 45, days: 0, price: 180, groupIds: [], templateId: null, onHold: false },
  { id: 'g50', title: 'گیگ 50', gb: 50, days: 0, price: 200, groupIds: [], templateId: null, onHold: false },
  { id: 'g60', title: 'گیگ 60', gb: 60, days: 0, price: 240, groupIds: [], templateId: null, onHold: false },
  { id: 'g70', title: 'گیگ 70', gb: 70, days: 0, price: 280, groupIds: [], templateId: null, onHold: false },
  { id: 'g80', title: 'گیگ 80', gb: 80, days: 0, price: 320, groupIds: [], templateId: null, onHold: false },
  { id: 'g90', title: 'گیگ 90', gb: 90, days: 0, price: 360, groupIds: [], templateId: null, onHold: false },
  { id: 'g100', title: 'گیگ 100', gb: 100, days: 0, price: 400, groupIds: [], templateId: null, onHold: false },
];

const PRODUCT_CATEGORY_ID = 'cat_internet';

// ============================================================
// ۱.۲ ثابت‌های مربوط به اشتراک، پرداخت و ارتباط با پاسارگارد
// ============================================================

const GIGABYTE = 1024 * 1024 * 1024;

// حداکثر زمان انتظار برای هر درخواست به پنل پاسارگارد
const PG_TIMEOUT_MS = 15000;

// کلید کش توکن JWT پنل در KV (فقط وقتی از username/password استفاده شود)
const PG_TOKEN_KV_KEY = 'pg_token_v1';

// نوع سفارش
const ORDER_KIND = {
  NEW: 'new',
  RENEW: 'renew',
};

// وضعیت اشتراک در دیتابیس ربات
const SUB_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  LIMITED: 'limited',
  DISABLED: 'disabled',
  ON_HOLD: 'on_hold',
  REVOKED: 'revoked',
};

// برچسب فارسی وضعیت‌هایی که پنل پاسارگارد برمی‌گرداند
const PG_STATUS_LABEL = {
  active: '✅ فعال',
  on_hold: '⏸ در انتظار اولین اتصال',
  disabled: '🚫 غیرفعال',
  limited: '📉 حجم تمام شده',
  expired: '⌛ منقضی شده',
};

// وضعیت پرداخت
const PAYMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  FAILED: 'failed',
};

// حداکثر تعداد کانفیگ تستی که ادمین می‌تواند در استخر تست کانفیگ نگه دارد
const MAX_TEST_CONFIGS = 50;

const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  SENT: 'sent',
};

const STATUS_LABEL = {
  [ORDER_STATUS.PENDING]: '⏳ در انتظار بررسی',
  [ORDER_STATUS.CONFIRMED]: '✅ تایید شده',
  [ORDER_STATUS.REJECTED]: '❌ رد شده',
  [ORDER_STATUS.SENT]: '📨 اشتراک تحویل شد',
};

// وضعیت درخواست‌های شارژ کیف پول
const WALLET_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const WALLET_STATUS_LABEL = {
  [WALLET_REQUEST_STATUS.PENDING]: '⏳ در انتظار بررسی',
  [WALLET_REQUEST_STATUS.APPROVED]: '✅ تایید و شارژ شد',
  [WALLET_REQUEST_STATUS.REJECTED]: '❌ رد شده',
};

// ============================================================
// ۲. حافظه ساده (Map) با توابع get/set/delete + لایه ذخیره‌سازی دائمی (KV)
// ============================================================

const DB = {
  sessions: new Map(), // chatId -> { step, data } — روی KV هم پایدار می‌شود (پایین را ببینید)
  orders: new Map(), // orderId -> order
  users: new Map(), // userId -> user info (شامل walletBalance)
  cards: new Map(), // cardId -> card info
  admins: new Set(), // آیدی ادمین‌های اضافه‌شده (به‌جز ادمین اصلی)
  settings: {}, // تنظیمات قابل‌تغییر از پنل ادمین
  plans: [], // بسته‌های اینترنتی قابل‌تغییر از پنل ادمین (همیشه آرایه است)
  plansLoaded: false, // آیا لیست بسته‌ها از KV خوانده شده؟ اگر نه، DEFAULT_PLANS پر می‌شود
  testConfigs: [], // استخر کانفیگ‌های تست (حداکثر MAX_TEST_CONFIGS عدد) - هر کدام فقط یک‌بار به یک مشتری تعلق می‌گیرد
  walletRequests: new Map(), // requestId -> درخواست شارژ کیف پول
  referralRewards: new Map(), // rewardId -> درخواست جایزه دعوت دوست (به ازای هر دعوت تایید‌شده)
  channelAds: new Map(), // adId -> پیام تبلیغاتی ارسال‌شده در کانال (با دکمه شیشه‌ای، کاملاً قابل‌ویرایش)
  subscriptions: new Map(), // subId -> اشتراک ساخته‌شده روی پاسارگارد
  tutorials: new Map(), // tutorialId -> {id, title, url} — لینک‌های آموزش، قابل افزودن/ویرایش/حذف از پنل ادمین
  payments: new Map(), // paymentId -> رکورد پرداخت
  notifiedOrders: new Set(), // شماره سفارش‌هایی که اعلانشان به ادمین رفته (ضد تکرار)
  forceJoinEnabled: true, // کلید کلی فعال/غیرفعال کردن عضویت اجباری در کانال
};

let orderSeq = 1;
let cardSeq = 1;
let planSeq = 1;
let testConfigSeq = 1;
let walletReqSeq = 1;
let tutorialSeq = 1;
let kvLoadedOnce = false;

function memGet(map, key) {
  return map.get(key);
}
function memSet(map, key, value) {
  map.set(key, value);
  return value;
}
function memDelete(map, key) {
  return map.delete(key);
}

const STATE_KEY = 'shop_state_v1';

// خواندن کامل وضعیت از KV (در صورت وجود binding) و پر کردن Mapهای حافظه
async function loadState(env) {
  if (!env.SHOP_KV) return false;
  try {
    const raw = await env.SHOP_KV.get(STATE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      DB.orders = new Map(state.orders || []);
      DB.users = new Map(state.users || []);
      DB.cards = new Map(state.cards || []);
      DB.admins = new Set(state.admins || []);
      DB.settings = state.settings || {};
      DB.plans = Array.isArray(state.plans) ? state.plans : [];
      DB.plansLoaded = Array.isArray(state.plans);
      DB.testConfigs = state.testConfigs || [];
      DB.walletRequests = new Map(state.walletRequests || []);
      DB.referralRewards = new Map(state.referralRewards || []);
      DB.channelAds = new Map(state.channelAds || []);
      DB.subscriptions = new Map(state.subscriptions || []);
      DB.tutorials = new Map(state.tutorials || []);
      DB.payments = new Map(state.payments || []);
      DB.notifiedOrders = new Set(state.notifiedOrders || []);
      DB.forceJoinEnabled = state.forceJoinEnabled !== undefined ? state.forceJoinEnabled : true;
      // ✅ سشن‌های فعال کاربران (مثلاً «awaiting_receipt») هم از KV بازیابی می‌شوند.
      // قبلاً این‌ها فقط در حافظه (RAM) نگه‌داری می‌شدند و چون ربات روی محیط
      // serverless اجرا می‌شود، هر ریکوئست می‌توانست به یک instance جدید برسد
      // و سشن قبلی را نبیند — نتیجه‌اش این بود که مثلاً مشتری بعد از انتخاب کارت،
      // عکس رسید را می‌فرستاد ولی چون سشن گم شده بود، ربات هیچ پاسخی نمی‌داد.
      DB.sessions = new Map(state.sessions || []);
      orderSeq = state.orderSeq || 1;
      cardSeq = state.cardSeq || 1;
      planSeq = state.planSeq || 1;
      testConfigSeq = state.testConfigSeq || 1;
      walletReqSeq = state.walletReqSeq || 1;
      tutorialSeq = state.tutorialSeq || 1;
    }
    kvLoadedOnce = true;
    return true;
  } catch (err) {
    console.error('loadState error:', err);
    return false;
  }
}

// نوشتن کامل وضعیت روی KV (در صورت وجود binding)
async function saveState(env) {
  if (!env.SHOP_KV) return false;
  try {
    const state = {
      orders: [...DB.orders.entries()],
      users: [...DB.users.entries()],
      cards: [...DB.cards.entries()],
      admins: [...DB.admins],
      settings: DB.settings,
      plans: DB.plans || [],
      testConfigs: DB.testConfigs || [],
      walletRequests: [...DB.walletRequests.entries()],
      referralRewards: [...DB.referralRewards.entries()],
      channelAds: [...DB.channelAds.entries()],
      subscriptions: [...DB.subscriptions.entries()],
      tutorials: [...DB.tutorials.entries()],
      // فقط آخرین پرداخت‌ها در KV می‌مانند تا حجم state کنترل‌شده بماند؛
      // تاریخچه کامل پرداخت‌ها در D1 نگه داشته می‌شود.
      payments: [...DB.payments.entries()].slice(-1000),
      notifiedOrders: [...DB.notifiedOrders].slice(-NOTIFIED_ORDERS_LIMIT),
      forceJoinEnabled: DB.forceJoinEnabled,
      // فقط سشن‌های «فعال» (غیر idle) ذخیره می‌شوند تا حجم KV با انباشته‌شدن
      // یک رکورد idle به‌ازای هر کاربری که تا حالا پیام داده، بی‌رویه زیاد نشود.
      // سشن‌های idle مهم نیستند چون getSession در صورت نبودشان دوباره می‌سازدشان.
      sessions: [...DB.sessions.entries()].filter(([, s]) => s && s.step && s.step !== 'idle'),
      orderSeq,
      cardSeq,
      planSeq,
      testConfigSeq,
      walletReqSeq,
      tutorialSeq,
    };
    await env.SHOP_KV.put(STATE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('saveState error:', err);
    return false;
  }
}

function isPersistenceEnabled(env) {
  return Boolean(env.SHOP_KV);
}

// اطمینان از اینکه لیست بسته‌ها همیشه مقداردهی شده باشد (اولین اجرا / بدون KV)
function ensurePlansLoaded() {
  // اگر لیست بسته‌ها هرگز در KV ذخیره نشده باشد، با بسته‌های پیش‌فرض پر می‌شود.
  // توجه: لیست خالیِ ذخیره‌شده (یعنی ادمین همه را حذف کرده) دست‌نخورده می‌ماند.
  if (!DB.plansLoaded) {
    DB.plans = DEFAULT_PLANS.map((p) => ({ ...p }));
    DB.plansLoaded = true;
  }
  // مهاجرت نرم: بسته‌های ساخته‌شده با نسخه قبلی ربات فیلدهای جدید را ندارند
  // (کانفیگ‌ها تاریخ انقضا ندارند، پس مدت همیشه صفر می‌ماند)
  for (const plan of DB.plans) {
    if (plan.days === undefined || plan.days === null) plan.days = 0;
    if (!Array.isArray(plan.groupIds)) plan.groupIds = [];
    if (plan.templateId === undefined) plan.templateId = null;
    if (plan.onHold === undefined) plan.onHold = false;
  }
}

const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 دقیقه

// مراحلی که مهلت اختصاصی خودشان را دارند (مثلاً 30 دقیقه برای ارسال رسید)
// و نباید با تایم‌اوت عمومی 10 دقیقه‌ای session زودتر از موعد ریست شوند.
const SESSION_TIMEOUT_EXEMPT_STEPS = new Set(['awaiting_receipt', 'awaiting_wallet_receipt']);

function getSession(chatId) {
  if (!DB.sessions.has(chatId)) {
    memSet(DB.sessions, chatId, { step: 'idle', data: {}, updatedAt: Date.now() });
  }
  const s = memGet(DB.sessions, chatId);
  // اگر سشن بیش از 10 دقیقه نیست آپدیت نشده باشد و فعال باشد، ریست کن
  // (به‌جز مراحلی که مهلت اختصاصی طولانی‌تر خودشان مثل receiptDeadline را دارند)
  if (
    s.step !== 'idle' &&
    !SESSION_TIMEOUT_EXEMPT_STEPS.has(s.step) &&
    s.updatedAt &&
    Date.now() - s.updatedAt > SESSION_TIMEOUT_MS
  ) {
    const fresh = { step: 'idle', data: {}, updatedAt: Date.now(), _timedOut: true };
    memSet(DB.sessions, chatId, fresh);
    return fresh;
  }
  return s;
}
function setSession(chatId, session) {
  session.updatedAt = Date.now();
  return memSet(DB.sessions, chatId, session);
}
function resetSession(chatId) {
  return memSet(DB.sessions, chatId, { step: 'idle', data: {}, updatedAt: Date.now() });
}

function isAdmin(userId, config) {
  const idStr = String(userId);
  // ADMIN_IDS می‌تواند چند ادمین (با کاما) داشته باشد
  if (Array.isArray(config.ADMIN_IDS) && config.ADMIN_IDS.includes(idStr)) return true;
  if (config.ADMIN_USER_ID && idStr === config.ADMIN_USER_ID) return true;
  return DB.admins.has(idStr);
}

// ---------- توابع کیف پول ----------

function getWallet(userId) {
  const user = memGet(DB.users, String(userId));
  return user && user.walletBalance ? user.walletBalance : 0;
}

function addWalletBalance(userId, amount) {
  const idStr = String(userId);
  const user = memGet(DB.users, idStr) || { id: idStr, orders: [], walletBalance: 0 };
  user.walletBalance = (user.walletBalance || 0) + amount;
  memSet(DB.users, idStr, user);
  return user.walletBalance;
}

// در صورت کافی بودن موجودی، مبلغ را کسر می‌کند و true برمی‌گرداند؛ در غیر این صورت false
function deductWalletBalance(userId, amount) {
  const idStr = String(userId);
  const user = memGet(DB.users, idStr) || { id: idStr, orders: [], walletBalance: 0 };
  const current = user.walletBalance || 0;
  if (current < amount) return false;
  user.walletBalance = current - amount;
  memSet(DB.users, idStr, user);
  return true;
}

// ============================================================
// ۲.۵ لایه Cloudflare D1 (دفتر ثبت ماندگار)
//
//   تقسیم مسئولیت:
//     KV  → حالت زنده ربات (تنظیمات، بسته‌ها، کارت‌ها، اشتراک‌ها، سفارش‌ها)
//           همان چیزی که خواندن‌های ربات از آن انجام می‌شود.
//     D1  → همان داده‌ها به‌صورت جدولی و قابل query برای گزارش‌گیری و لاگ.
//
//   اگر binding با نام DB وصل نباشد، همه توابع این بخش بی‌صدا رد می‌شوند و
//   ربات بدون D1 هم کامل کار می‌کند.
// ============================================================

function hasD1(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function newId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

// کلیدهایی که هرگز نباید در لاگ یا ستون raw ذخیره شوند
const SENSITIVE_KEYS = [
  'token',
  'password',
  'secret',
  'authorization',
  'api_key',
  'apikey',
  'access_token',
  'bot_token',
  'signature',
  'sign',
];

// حذف مقادیر حساس از آبجکت قبل از لاگ/ذخیره
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 25).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
        out[key] = '[redacted]';
      } else {
        out[key] = redact(val, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 400) return `${value.slice(0, 400)}…`;
  return value;
}

// ---------- کمک‌کننده‌های اجرای کوئری (هرگز throw نمی‌کنند) ----------

async function d1Run(env, sql, params = []) {
  if (!hasD1(env)) return null;
  try {
    return await env.DB.prepare(sql)
      .bind(...params)
      .run();
  } catch (err) {
    console.error('D1 run error:', err && err.message ? err.message : err);
    return null;
  }
}

async function d1All(env, sql, params = []) {
  if (!hasD1(env)) return [];
  try {
    const res = await env.DB.prepare(sql)
      .bind(...params)
      .all();
    return (res && res.results) || [];
  } catch (err) {
    console.error('D1 all error:', err && err.message ? err.message : err);
    return [];
  }
}

async function d1First(env, sql, params = []) {
  if (!hasD1(env)) return null;
  try {
    return await env.DB.prepare(sql)
      .bind(...params)
      .first();
  } catch (err) {
    console.error('D1 first error:', err && err.message ? err.message : err);
    return null;
  }
}

// ---------- لاگ ----------

async function dbLog(env, level, scope, message, meta = {}, ids = {}) {
  const safeMeta = JSON.stringify(redact(meta) || {}).slice(0, 2000);
  console.log(`[${level}][${scope}] ${message}`);
  await d1Run(
    env,
    `INSERT INTO logs (level, scope, telegram_id, order_id, message, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      level,
      scope,
      ids.telegramId ? String(ids.telegramId) : null,
      ids.orderId ? String(ids.orderId) : null,
      String(message).slice(0, 500),
      safeMeta,
      nowSec(),
    ]
  );
}

// ---------- کاربران ----------

async function dbUpsertUser(env, from) {
  if (!hasD1(env) || !from) return;
  const ts = nowSec();
  await d1Run(
    env,
    `INSERT INTO users (telegram_id, username, first_name, last_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username   = excluded.username,
       first_name = excluded.first_name,
       last_name  = excluded.last_name,
       updated_at = excluded.updated_at`,
    [String(from.id), from.username || null, from.first_name || null, from.last_name || null, ts, ts]
  );
}

async function dbSyncUserWallet(env, telegramId, balance) {
  await d1Run(env, `UPDATE users SET wallet_balance = ?, updated_at = ? WHERE telegram_id = ?`, [
    Math.round(Number(balance) || 0),
    nowSec(),
    String(telegramId),
  ]);
}

// ---------- بسته‌ها (آینه‌ی DB.plans که ادمین ویرایش می‌کند) ----------

async function dbSyncPlan(env, plan) {
  if (!hasD1(env) || !plan) return;
  const ts = nowSec();
  await d1Run(
    env,
    `INSERT INTO plans (id, title, data_limit_gb, duration_days, price, group_ids, template_id, on_hold, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       title         = excluded.title,
       data_limit_gb = excluded.data_limit_gb,
       duration_days = excluded.duration_days,
       price         = excluded.price,
       group_ids     = excluded.group_ids,
       template_id   = excluded.template_id,
       on_hold       = excluded.on_hold,
       is_active     = 1,
       updated_at    = excluded.updated_at`,
    [
      String(plan.id),
      String(plan.title || ''),
      Number(plan.gb) || 0,
      Number(plan.days) || 0,
      Number(plan.price) || 0,
      JSON.stringify(Array.isArray(plan.groupIds) ? plan.groupIds : []),
      plan.templateId === null || plan.templateId === undefined ? null : Number(plan.templateId),
      plan.onHold ? 1 : 0,
      ts,
      ts,
    ]
  );
}

async function dbDeactivatePlan(env, planId) {
  await d1Run(env, `UPDATE plans SET is_active = 0, updated_at = ? WHERE id = ?`, [nowSec(), String(planId)]);
}

// ---------- سفارش‌ها ----------

async function dbSaveOrder(env, order) {
  if (!hasD1(env) || !order) return;
  const ts = nowSec();
  await d1Run(
    env,
    `INSERT INTO orders (id, telegram_id, plan_id, plan_title, kind, renew_of, amount, status, payment_provider, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       status           = excluded.status,
       payment_provider = excluded.payment_provider,
       note             = excluded.note,
       updated_at       = excluded.updated_at`,
    [
      String(order.id),
      String(order.userId),
      order.planId ? String(order.planId) : null,
      order.planTitle || null,
      order.kind || ORDER_KIND.NEW,
      order.renewOf ? String(order.renewOf) : null,
      Math.round(Number(order.price) || 0),
      order.status || ORDER_STATUS.PENDING,
      order.paidVia || null,
      order.note || null,
      Math.floor((order.createdAt || Date.now()) / 1000),
      ts,
    ]
  );
}

// ---------- پرداخت‌ها ----------

async function dbSavePayment(env, payment) {
  if (!hasD1(env) || !payment) return;
  const ts = nowSec();
  await d1Run(
    env,
    `INSERT INTO payments (id, order_id, telegram_id, provider, amount, currency, status, reference, raw, verified_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       status      = excluded.status,
       reference   = excluded.reference,
       raw         = excluded.raw,
       verified_at = excluded.verified_at,
       updated_at  = excluded.updated_at`,
    [
      String(payment.id),
      payment.orderId ? String(payment.orderId) : null,
      String(payment.userId),
      payment.provider,
      Math.round(Number(payment.amount) || 0),
      payment.currency || 'IRT',
      payment.status || PAYMENT_STATUS.PENDING,
      payment.reference || null,
      JSON.stringify(redact(payment.raw || {})).slice(0, 2000),
      payment.verifiedAt ? Math.floor(payment.verifiedAt / 1000) : null,
      Math.floor((payment.createdAt || Date.now()) / 1000),
      ts,
    ]
  );
}

// ---------- اشتراک‌ها ----------

async function dbSaveSubscription(env, sub) {
  if (!hasD1(env) || !sub) return;
  const ts = nowSec();
  await d1Run(
    env,
    `INSERT INTO subscriptions (id, telegram_id, order_id, plan_id, plan_title, pg_username, pg_user_id,
        data_limit_bytes, used_traffic_bytes, start_at, expire_at, subscription_url, status,
        previous_id, last_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       pg_user_id         = excluded.pg_user_id,
       data_limit_bytes   = excluded.data_limit_bytes,
       used_traffic_bytes = excluded.used_traffic_bytes,
       expire_at          = excluded.expire_at,
       subscription_url   = excluded.subscription_url,
       status             = excluded.status,
       last_synced_at     = excluded.last_synced_at,
       updated_at         = excluded.updated_at`,
    [
      String(sub.id),
      String(sub.userId),
      sub.orderId ? String(sub.orderId) : null,
      sub.planId ? String(sub.planId) : null,
      sub.planTitle || null,
      String(sub.pgUsername),
      sub.pgUserId === null || sub.pgUserId === undefined ? null : Number(sub.pgUserId),
      Math.round(Number(sub.dataLimitBytes) || 0),
      Math.round(Number(sub.usedTrafficBytes) || 0),
      sub.startAt ? Math.floor(sub.startAt / 1000) : null,
      sub.expireAt ? Math.floor(sub.expireAt / 1000) : null,
      sub.subscriptionUrl || null,
      sub.status || SUB_STATUS.ACTIVE,
      sub.previousId ? String(sub.previousId) : null,
      sub.lastSyncedAt ? Math.floor(sub.lastSyncedAt / 1000) : null,
      Math.floor((sub.createdAt || Date.now()) / 1000),
      ts,
    ]
  );
}

// آمار سریع برای پنل ادمین (فقط وقتی D1 وصل باشد)
async function dbStats(env) {
  if (!hasD1(env)) return null;
  const row = await d1First(
    env,
    `SELECT
       (SELECT COUNT(*) FROM subscriptions)                          AS subs_total,
       (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')   AS subs_active,
       (SELECT COUNT(*) FROM payments WHERE status = 'verified')      AS pay_verified,
       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'verified') AS pay_sum,
       (SELECT COUNT(*) FROM logs WHERE level = 'error')              AS log_errors`
  );
  return row || null;
}

// ============================================================
// ۲.۶ اسکیمای D1 داخل همین فایل (بدون نیاز به اجرای دستی migration)
//
//   همین اسکیما در فایل migrations/0001_initial.sql هم آمده است؛ اگر ترجیح
//   می‌دهی دستی اجرا کنی، دستور آن در README هست. در غیر این صورت ربات در
//   اولین درخواست خودش جدول‌ها را می‌سازد (CREATE TABLE IF NOT EXISTS).
//
//   توجه: PRAGMA اینجا استفاده نشده چون D1 همه PRAGMAها را نمی‌پذیرد.
// ============================================================

const D1_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    telegram_id     TEXT    PRIMARY KEY,
    username        TEXT,
    first_name      TEXT,
    last_name       TEXT,
    wallet_balance  INTEGER NOT NULL DEFAULT 0,
    test_claimed    INTEGER NOT NULL DEFAULT 0,
    is_blocked      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)`,
  `CREATE TABLE IF NOT EXISTS plans (
    id             TEXT    PRIMARY KEY,
    title          TEXT    NOT NULL,
    data_limit_gb  REAL    NOT NULL DEFAULT 0,
    duration_days  INTEGER NOT NULL DEFAULT 0,
    price          INTEGER NOT NULL DEFAULT 0,
    group_ids      TEXT,
    template_id    INTEGER,
    on_hold        INTEGER NOT NULL DEFAULT 0,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id               TEXT    PRIMARY KEY,
    telegram_id      TEXT    NOT NULL,
    plan_id          TEXT,
    plan_title       TEXT,
    kind             TEXT    NOT NULL DEFAULT 'new',
    renew_of         TEXT,
    amount           INTEGER NOT NULL DEFAULT 0,
    status           TEXT    NOT NULL DEFAULT 'pending',
    payment_provider TEXT,
    note             TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (telegram_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id                 TEXT    PRIMARY KEY,
    telegram_id        TEXT    NOT NULL,
    order_id           TEXT,
    plan_id            TEXT,
    plan_title         TEXT,
    pg_username        TEXT    NOT NULL,
    pg_user_id         INTEGER,
    data_limit_bytes   INTEGER NOT NULL DEFAULT 0,
    used_traffic_bytes INTEGER NOT NULL DEFAULT 0,
    start_at           INTEGER,
    expire_at          INTEGER,
    subscription_url   TEXT,
    status             TEXT    NOT NULL DEFAULT 'active',
    previous_id        TEXT,
    last_synced_at     INTEGER,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,
    FOREIGN KEY (telegram_id) REFERENCES users (telegram_id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_pg_username ON subscriptions (pg_username)`,
  `CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (telegram_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_subs_expire ON subscriptions (expire_at)`,
  `CREATE TABLE IF NOT EXISTS payments (
    id          TEXT    PRIMARY KEY,
    order_id    TEXT,
    telegram_id TEXT    NOT NULL,
    provider    TEXT    NOT NULL,
    amount      INTEGER NOT NULL DEFAULT 0,
    currency    TEXT    NOT NULL DEFAULT 'IRT',
    status      TEXT    NOT NULL DEFAULT 'pending',
    reference   TEXT,
    raw         TEXT,
    verified_at INTEGER,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
     ON payments (provider, reference) WHERE reference IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id)`,
  `CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    level       TEXT    NOT NULL DEFAULT 'info',
    scope       TEXT,
    telegram_id TEXT,
    order_id    TEXT,
    message     TEXT    NOT NULL,
    meta        TEXT,
    created_at  INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_logs_created ON logs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_scope ON logs (scope, created_at DESC)`,
];

// فقط یک‌بار در طول عمر هر isolate اجرا می‌شود
let d1SchemaReady = false;

/**
 * اگر جدول‌ها نبودند، اسکیما را می‌سازد. خطا را بالا نمی‌دهد تا ربات هرگز
 * به‌خاطر مشکل دیتابیس از کار نیفتد (در آن حالت فقط KV فعال می‌ماند).
 *
 * دستورها یکی‌یکی اجرا می‌شوند (نه batch) چون ایندکس‌ها به جدول‌های
 * ساخته‌شده در دستور قبلی وابسته‌اند و همه هم IF NOT EXISTS هستند.
 */
async function ensureD1Schema(env) {
  if (d1SchemaReady || !hasD1(env)) return d1SchemaReady;
  try {
    const probe = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'subscriptions'"
    ).first();
    if (!probe) {
      for (const statement of D1_SCHEMA) {
        await env.DB.prepare(statement).run();
      }
      console.log('[info][system] D1 schema created');
    }
    d1SchemaReady = true;
  } catch (err) {
    console.error('ensureD1Schema error:', err && err.message ? err.message : err);
  }
  return d1SchemaReady;
}

// ============================================================
// ۳. توابع Telegram API
// ============================================================

async function callTelegram(token, method, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  // اگر reply_markup شامل دکمه‌های شیشه‌ای (inline_keyboard) باشد، رنگ
  // سراسری انتخاب‌شده توسط ادمین (تنظیمات → رنگ دکمه‌های شیشه‌ای) روی
  // تک‌تک آن‌ها اعمال می‌شود — یک نقطه واحد برای همه پیام‌های ربات.
  const finalPayload =
    payload && payload.reply_markup
      ? { ...payload, reply_markup: applyGlassStyle(payload.reply_markup) }
      : payload;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload || {}),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API error [${method}]:`, JSON.stringify(data));
    }
    return data;
  } catch (err) {
    console.error(`Telegram API exception [${method}]:`, err);
    return { ok: false, error: String(err) };
  }
}

function sendMessage(token, chatId, text, options = {}) {
  return callTelegram(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

function editMessageText(token, chatId, messageId, text, options = {}) {
  return callTelegram(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options,
  });
}

function answerCallbackQuery(token, callbackQueryId, text = '', showAlert = false) {
  return callTelegram(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

function sendPhoto(token, chatId, fileId, caption = '', options = {}) {
  return callTelegram(token, 'sendPhoto', {
    chat_id: chatId,
    photo: fileId,
    caption,
    parse_mode: 'HTML',
    ...options,
  });
}

function editMessageCaption(token, chatId, messageId, caption, options = {}) {
  return callTelegram(token, 'editMessageCaption', {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: 'HTML',
    ...options,
  });
}

function editMessageMedia(token, chatId, messageId, media, options = {}) {
  return callTelegram(token, 'editMessageMedia', {
    chat_id: chatId,
    message_id: messageId,
    media,
    ...options,
  });
}

function editMessageReplyMarkup(token, chatId, messageId, replyMarkup) {
  return callTelegram(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup || { inline_keyboard: [] },
  });
}

function deleteMessage(token, chatId, messageId) {
  return callTelegram(token, 'deleteMessage', { chat_id: chatId, message_id: messageId });
}

function getMe(token) {
  return callTelegram(token, 'getMe', {});
}

function getWebhookInfo(token) {
  return callTelegram(token, 'getWebhookInfo', {});
}

function setWebhook(token, url, secretToken = '') {
  const payload = { url, allowed_updates: ['message', 'callback_query'] };
  // تلگرام این رشته را در هدر X-Telegram-Bot-Api-Secret-Token هر آپدیت می‌فرستد
  if (secretToken) payload.secret_token = secretToken;
  return callTelegram(token, 'setWebhook', payload);
}

function getChatMember(token, chatId, userId) {
  return callTelegram(token, 'getChatMember', { chat_id: chatId, user_id: userId });
}

// بررسی می‌کند آیا کاربر عضو کانال تنظیم‌شده (config.CHANNEL_ID) هست یا نه.
// اگر ربات ادمین کانال نباشد یا خطایی رخ دهد، برای جلوگیری از قفل‌شدن کامل
// ربات، به‌صورت fail-open عمل می‌شود (یعنی کاربر مسدود نمی‌شود).
async function isChannelMember(config, userId) {
  if (!config.CHANNEL_ID) return true;
  try {
    const res = await getChatMember(config.BOT_TOKEN, config.CHANNEL_ID, userId);
    if (!res.ok) {
      console.error('isChannelMember error:', JSON.stringify(res));
      return true;
    }
    const status = res.result.status;
    return ['creator', 'administrator', 'member'].includes(status);
  } catch (err) {
    console.error('isChannelMember exception:', err);
    return true;
  }
}

// منوی دستورات ربات برای همه کاربران
function setMyCommands(token) {
  return callTelegram(token, 'setMyCommands', {
    commands: [
      { command: 'start', description: '🏠 شروع / منوی اصلی' },
      { command: 'invite', description: '👥 دعوت دوستان' },
      { command: 'buy', description: '🛒 خرید اشتراک' },
      { command: 'mysubs', description: '📦 اشتراک‌های من' },
      { command: 'renew', description: '🔄 تمدید اشتراک' },
      { command: 'wallet', description: '💰 کیف پول من' },
      { command: 'testconfig', description: '🎁 تست کانفیگ رایگان' },
      { command: 'orders', description: '🧾 تاریخچه سفارش‌ها' },
      { command: 'support', description: '🎫 پشتیبانی' },
      { command: 'cancel', description: '❌ لغو عملیات جاری' },
    ],
  });
}

// منوی دستورات مخصوص ادمین (شامل /admin و /sub) — فقط برای چت ادمین‌ها تنظیم
// می‌شود تا این دستورها در منوی دستورات مشتری‌ها دیده نشوند.
function setAdminCommands(token, adminUserId) {
  return callTelegram(token, 'setMyCommands', {
    scope: { type: 'chat', chat_id: Number(adminUserId) },
    commands: [
      { command: 'start', description: '🏠 شروع / منوی اصلی' },
      { command: 'invite', description: '👥 دعوت دوستان' },
      { command: 'admin', description: '🛠 پنل مدیریت' },
      { command: 'sub', description: '🛰 مدیریت یک اشتراک (نام کاربری پنل)' },
      { command: 'buy', description: '🛒 خرید اشتراک' },
      { command: 'mysubs', description: '📦 اشتراک‌های من' },
      { command: 'renew', description: '🔄 تمدید اشتراک' },
      { command: 'wallet', description: '💰 کیف پول من' },
      { command: 'support', description: '🎫 پشتیبانی' },
      { command: 'cancel', description: '❌ لغو عملیات جاری' },
    ],
  });
}

// ============================================================
// ۳.۵ سرویس PasarGuard — تمام ارتباط با API پنل فقط از همین بخش انجام می‌شود
//
//  مبنای پیاده‌سازی: کد منبع پنل (مخزن PasarGuard/panel، شاخه main).
//  هیچ endpoint، هدر یا پارامتری حدس زده نشده است:
//
//   احراز هویت
//     • API Key:   هدر  X-Api-Key: pg_key_<uuid4>
//                  (app/routers/authentication.py → _extract_api_key)
//     • رمز عبور:  POST /api/admin/token  با content-type
//                  application/x-www-form-urlencoded و فیلدهای username/password
//                  پاسخ: { "access_token": "...", "token_type": "bearer" }
//                  (app/routers/admin.py → admin_token)
//
//   عملیات کاربر (app/routers/user.py، پیشوند /api/user)
//     • ساخت:              POST   /api/user                                   → 201
//     • ساخت از قالب:      POST   /api/user/from_template                      → 201
//     • خواندن:            GET    /api/user/by-username/{username}
//     • ویرایش:            PUT    /api/user/by-username/{username}
//     • فعال/غیرفعال:      PUT    /api/user/by-username/{username}/disabled
//     • حذف:               DELETE /api/user/by-username/{username}             → 204
//     • ریست حجم مصرفی:    POST   /api/user/by-username/{username}/reset
//     • باطل‌کردن لینک:     POST   /api/user/by-username/{username}/revoke_sub
//     • لیست کاربران:      GET    /api/users?load_sub=true
//     • گروه‌ها:            GET    /api/groups/simple   (app/routers/group.py)
//
//   قواعد مدل UserCreate (app/models/user.py و app/models/validators.py)
//     • username: ۳ تا ۱۲۸ کاراکتر، فقط [a-zA-Z0-9-_@.] و بدون دو کاراکتر ویژه پشت‌سرهم
//     • expire: UNIX timestamp بر حسب ثانیه (UTC) یا رشته ISO — مقدار ۰/خالی = بدون انقضا
//     • data_limit: بایت — مقدار ۰ = نامحدود
//     • status: active | on_hold  (برای on_hold باید on_hold_expire_duration داده شود)
//     • group_ids: آرایه شناسه گروه‌ها — بدون گروه، کاربر هیچ اینباندی ندارد
// ============================================================

// خطای استاندارد سمت پنل — پیام آن برای نمایش به کاربر امن است (بدون توکن)
class PgError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'PgError';
    this.status = status;
    this.detail = detail;
  }
}

// کش توکن در سطح isolate (وقتی KV وصل نیست هم کار می‌کند)
let pgTokenMemo = { token: '', expiresAt: 0 };

function pgConfigured(config) {
  return Boolean(config.PG_BASE_URL && (config.PG_API_TOKEN || (config.PG_USERNAME && config.PG_PASSWORD)));
}

// کدام متغیرها ست نشده‌اند؟ (برای پیام خطای دقیق به‌جای «تنظیم نشده»)
function pgMissingConfig(config) {
  const missing = [];
  if (!config.PG_BASE_URL) missing.push('PASARGUARD_BASE_URL');
  if (!config.PG_API_TOKEN && !(config.PG_USERNAME && config.PG_PASSWORD)) {
    missing.push('PASARGUARD_API_TOKEN (یا PASARGUARD_USERNAME و PASARGUARD_PASSWORD)');
  }
  return missing;
}

// هشدارهای پیکربندی که باعث خطای ۴۰۱ بی‌دلیل می‌شوند
function pgConfigWarnings(config) {
  const warnings = [];
  if (config.PG_API_TOKEN && !config.PG_API_TOKEN.startsWith('pg_key_')) {
    warnings.push('کلید API با «pg_key_» شروع نمی‌شود؛ پنل چنین کلیدی را نمی‌پذیرد و خطای احراز هویت می‌دهد.');
  }
  if (/\/api\/?$/.test(config.PG_BASE_URL)) {
    warnings.push('آدرس پنل نباید به «/api» ختم شود؛ ربات خودش مسیرها را اضافه می‌کند.');
  }
  if (/\/dashboard\/?$/.test(config.PG_BASE_URL)) {
    warnings.push('آدرس پنل نباید به «/dashboard» ختم شود؛ فقط دامنه (و پورت) کافی است.');
  }
  if (config.PG_BASE_URL && !/^https:\/\//i.test(config.PG_BASE_URL)) {
    warnings.push('آدرس پنل باید با https:// شروع شود؛ Cloudflare Workers به http یا گواهی self-signed وصل نمی‌شود.');
  }
  return warnings;
}

function pgApiUrl(config, path) {
  return `${config.PG_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

// تبدیل خطای HTTP پنل به پیام فارسی قابل نمایش (بدون افشای اطلاعات حساس)
function pgErrorMessage(status, data) {
  let detail = '';

  if (data && typeof data.detail === 'string') {
    detail = data.detail;
  } else if (data && Array.isArray(data.detail)) {
    // شکل استاندارد خطای اعتبارسنجی FastAPI: [{loc, msg, type}]
    detail = data.detail
      .map((item) => {
        if (!item) return '';
        const where = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== 'body' && part !== 'query').join('.')
          : '';
        const msg = item.msg || item.message || '';
        return where && msg ? `${where}: ${msg}` : msg || where;
      })
      .filter(Boolean)
      .join(' | ');
  } else if (data && data.detail && typeof data.detail === 'object') {
    detail = JSON.stringify(data.detail);
  }

  // اگر پنل چیزی غیرمنتظره برگرداند، خام‌اش را نشان می‌دهیم تا خطا نامرئی نماند
  if (!detail && data) detail = JSON.stringify(data);
  const map = {
    400: 'درخواست نامعتبر بود',
    401: 'احراز هویت پنل ناموفق بود (API Key یا نام کاربری/رمز را بررسی کنید)',
    403: 'دسترسی این ادمین در پنل کافی نیست',
    404: 'مسیر یا کاربر مورد نظر در پنل پیدا نشد — اگر همه درخواست‌ها ۴۰۴ می‌شوند، آدرس پنل (PASARGUARD_BASE_URL) اشتباه است',
    405:
      'پنل این متد را روی آن مسیر قبول نکرد — تقریباً همیشه یعنی PASARGUARD_BASE_URL اشتباه است ' +
      '(مثلاً «/dashboard» یا «/api» انتهای آن مانده). فقط دامنه پنل را بگذارید',
    409: 'این نام کاربری از قبل در پنل وجود دارد',
    422: 'اطلاعات ارسالی با قواعد پنل سازگار نیست',
    429: 'تعداد درخواست‌ها بیش از حد مجاز است',
    500: 'خطای داخلی پنل',
    502: 'پنل در دسترس نیست',
    503: 'پنل موقتاً در دسترس نیست',
  };
  const base = map[status] || `خطای پنل (HTTP ${status})`;
  return detail ? `${base}: ${String(detail).slice(0, 200)}` : base;
}

// راهنمای اضافه برای خطاهایی که علت رایج و مشخصی دارند
function pgErrorHint(error, plan) {
  if (!(error instanceof PgError)) return '';
  const message = String(error.message || '');
  const noTarget = plan && !plan.templateId && !(Array.isArray(plan.groupIds) && plan.groupIds.length);

  // خطاهایی که خود پنل صریحاً درباره گروه می‌دهد (مثل «Group not found»)
  if (/group/i.test(message) || /گروه/.test(message)) {
    const current =
      plan && Array.isArray(plan.groupIds) && plan.groupIds.length ? plan.groupIds.join('، ') : '— خالی —';
    return (
      `\n\n💡 مشکل از شناسه گروه بسته است (مقدار فعلی: ${current}).\n` +
      'از «🛰 پاسارگارد → 📋 دریافت لیست گروه‌ها» شناسه‌های واقعی پنل را ببینید و در ' +
      '«📦 مدیریت بسته‌ها» همان‌ها را برای بسته ست کنید.\n' +
      'اگر لیست خالی بود، اول در پنل یک Group با اینباندهای دلخواه بسازید.'
    );
  }

  if (error.status === 422 && noTarget) {
    return (
      '\n\n💡 این بسته هیچ گروهی (group_ids) ندارد و پنل کاربر بدون گروه را قبول نمی‌کند.\n' +
      'از «🛰 پاسارگارد → 📋 دریافت لیست گروه‌ها» شناسه بگیرید و در ' +
      '«📦 مدیریت بسته‌ها» برای همان بسته ست کنید.'
    );
  }
  if (error.status === 405 || error.status === 404) {
    return '\n\n💡 معمولاً یعنی PASARGUARD_BASE_URL اشتباه است؛ فقط دامنه پنل را بگذارید.';
  }
  if (error.status === 401) {
    return '\n\n💡 کلید API را دوباره بسازید و مطمئن شوید با «pg_key_» شروع می‌شود.';
  }
  return '';
}

// دریافت توکن JWT پنل (فقط در حالت username/password) و کش آن
async function pgLogin(env, config) {
  const form = new URLSearchParams();
  form.set('grant_type', 'password');
  form.set('username', config.PG_USERNAME);
  form.set('password', config.PG_PASSWORD);

  let res;
  try {
    res = await fetch(pgApiUrl(config, '/api/admin/token'), {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(PG_TIMEOUT_MS),
    });
  } catch (err) {
    throw new PgError('ارتباط با پنل برای گرفتن توکن برقرار نشد', 0);
  }

  if (!res.ok) throw new PgError(pgErrorMessage(res.status, null), res.status);

  const data = await res.json().catch(() => null);
  if (!data || !data.access_token) throw new PgError('پاسخ توکن پنل معتبر نبود', 500);

  // عمر کش کوتاه‌تر از عمر واقعی توکن پنل نگه داشته می‌شود
  pgTokenMemo = { token: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  if (env.SHOP_KV) {
    try {
      await env.SHOP_KV.put(PG_TOKEN_KV_KEY, data.access_token, { expirationTtl: 3300 });
    } catch (err) {
      console.error('pgLogin: token cache failed');
    }
  }
  return data.access_token;
}

async function pgGetToken(env, config, forceRefresh = false) {
  if (!forceRefresh) {
    if (pgTokenMemo.token && pgTokenMemo.expiresAt > Date.now()) return pgTokenMemo.token;
    if (env.SHOP_KV) {
      const cached = await env.SHOP_KV.get(PG_TOKEN_KV_KEY).catch(() => null);
      if (cached) {
        pgTokenMemo = { token: cached, expiresAt: Date.now() + 5 * 60 * 1000 };
        return cached;
      }
    }
  } else {
    pgTokenMemo = { token: '', expiresAt: 0 };
  }
  return pgLogin(env, config);
}

/**
 * تنها نقطه ارسال درخواست به پنل.
 *  - timeout مشخص روی همه درخواست‌ها
 *  - در صورت 401 یک‌بار توکن را تازه می‌کند و دوباره تلاش می‌کند
 *  - هیچ‌وقت هدرهای حساس را لاگ نمی‌کند
 */
async function pgFetch(env, config, path, options = {}) {
  const { method = 'GET', body, retryOn401 = true } = options;

  if (!pgConfigured(config)) {
    throw new PgError(
      `اتصال پنل پاسارگارد تنظیم نشده — این مقدارها در Secrets ست نشده‌اند: ${pgMissingConfig(config).join(' و ')}`,
      0
    );
  }

  const headers = { accept: 'application/json' };
  if (config.PG_API_TOKEN) {
    headers['X-Api-Key'] = config.PG_API_TOKEN;
  } else {
    headers.authorization = `Bearer ${await pgGetToken(env, config)}`;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(pgApiUrl(config, path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(PG_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new PgError(timedOut ? 'پنل در زمان مقرر پاسخ نداد' : 'ارتباط با پنل برقرار نشد', 0);
  }

  // توکن منقضی‌شده: یک‌بار تازه‌سازی و تلاش مجدد
  if (res.status === 401 && retryOn401 && !config.PG_API_TOKEN) {
    await pgGetToken(env, config, true);
    return pgFetch(env, config, path, { method, body, retryOn401: false });
  }

  if (res.status === 204) return null;

  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = null;
    }
  }

  if (!res.ok) throw new PgError(pgErrorMessage(res.status, data), res.status, data);

  // پاسخ ۲۰۰ ولی غیر-JSON یعنی به API نخورده‌ایم و صفحه داشبورد/پروکسی جواب داده.
  // بدون این بررسی، تست اتصال به‌اشتباه «موفق» گزارش می‌شد.
  if (text && data === null) {
    throw new PgError(
      'پاسخ پنل JSON نبود؛ به‌نظر می‌رسد آدرس پنل به صفحه داشبورد یا یک پروکسی اشاره می‌کند. ' +
        'مقدار PASARGUARD_BASE_URL باید فقط دامنه پنل باشد (بدون /dashboard و بدون /api).',
      res.status
    );
  }

  return data;
}

// ---------- تبدیل «بسته ربات» به «کاربر پاسارگارد» ----------

// حجم بسته به بایت (۰ = نامحدود)
function planDataLimitBytes(plan) {
  const gb = Number(plan && plan.gb) || 0;
  return gb <= 0 ? 0 : Math.round(gb * GIGABYTE);
}

// تاریخ انقضا به‌صورت UNIX timestamp ثانیه‌ای UTC (۰ = بدون انقضا)
function planExpireTimestamp(plan, fromMs = Date.now()) {
  const days = Number(plan && plan.days) || 0;
  if (days <= 0) return 0;
  return Math.floor(fromMs / 1000) + days * 86400;
}

function normalizeGroupIds(groupIds) {
  if (!Array.isArray(groupIds)) return [];
  const out = [];
  for (const raw of groupIds) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

// نام کاربری پنل: pv_<telegramId>_<شماره>  → با قواعد validate_username سازگار است
function buildPgUsername(config, telegramId, seq, salt = '') {
  const parts = [config.PG_USERNAME_PREFIX, String(telegramId), String(seq)];
  if (salt) parts.push(salt);
  return parts.join('_').slice(0, 128);
}

// همان قاعده‌ای که پنل اعمال می‌کند (app/models/validators.py)
function isValidPgUsername(username) {
  const value = String(username || '');
  if (value.length < 3 || value.length > 128) return false;
  if (!/^[a-zA-Z0-9\-_@.]+$/.test(value)) return false;
  if (/[-_@.]{2,}/.test(value)) return false;
  return true;
}

// پنل ممکن است لینک اشتراک را نسبی برگرداند (وقتی url_prefix در تنظیماتش خالی است)
function pgSubscriptionUrl(config, rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = config.PG_SUB_BASE_URL || config.PG_BASE_URL;
  if (!base) return url;
  return `${stripTrailingSlash(base)}/${url.replace(/^\/+/, '')}`;
}

// expire در پاسخ پنل می‌تواند رشته ISO یا عدد ثانیه‌ای باشد
function parsePgExpire(value) {
  if (value === null || value === undefined || value === 0 || value === '') return null;
  if (typeof value === 'number') return value > 1e11 ? value : value * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

// بدنه درخواست POST /api/user بر اساس یک بسته
//
// نکته: کل بدنه در یک آبجکت ساخته می‌شود (به‌جای انتساب‌های بعدی) تا
// هم شکل داده روشن بماند و هم ابزارهای type-check روی JS خطا نگیرند.
//   • حالت عادی → status=active و expire (timestamp ثانیه‌ای UTC)
//   • حالت on_hold → status=on_hold و on_hold_expire_duration (ثانیه)
//     و در این حالت expire نباید اصلاً فرستاده شود.
//   • note → نام فارسی مشتری و بسته، تا در پنل قابل شناسایی باشد (حداکثر ۵۰۰ کاراکتر)
function buildUserCreatePayload(plan, username, note = '') {
  const useHold = Boolean(plan.onHold) && Number(plan.days) > 0;
  return {
    username,
    status: useHold ? 'on_hold' : 'active',
    data_limit: planDataLimitBytes(plan),
    data_limit_reset_strategy: 'no_reset',
    group_ids: normalizeGroupIds(plan.groupIds),
    note: buildPgNote(plan, note),
    ...(useHold
      ? { on_hold_expire_duration: Number(plan.days) * 86400 }
      : { expire: planExpireTimestamp(plan) || null }),
  };
}

// یادداشت پنل: نام مشتری (فارسی) + عنوان بسته. خط جدید و کاراکتر کنترلی حذف می‌شود.
function buildPgNote(plan, customerName) {
  const clean = (value) =>
    String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
  const parts = [];
  if (clean(customerName)) parts.push(clean(customerName));
  if (clean(plan && plan.title)) parts.push(clean(plan.title));
  parts.push('ربات تلگرام');
  return parts.join(' | ').slice(0, 500);
}

// ---------- عملیات‌های API ----------

// ۱) ساخت کاربر/کلاینت — با حجم و مدت مشخص
function pgCreateUser(env, config, payload) {
  return pgFetch(env, config, '/api/user', { method: 'POST', body: payload });
}

// ۱-ب) ساخت کاربر از قالب پنل (حجم و مدت از خود قالب خوانده می‌شود)
function pgCreateUserFromTemplate(env, config, templateId, username, note = '') {
  return pgFetch(env, config, '/api/user/from_template', {
    method: 'POST',
    body: {
      user_template_id: Number(templateId),
      username,
      note: buildPgNote(null, note),
    },
  });
}

// ۲) دریافت وضعیت اشتراک
async function pgGetGroups(env, config) {
  const ENDPOINTS = [
    { path: '/api/user_group',    keys: ['user_groups', 'groups', 'items'] },
    { path: '/api/user_template', keys: ['user_templates', 'templates', 'items'] },
    { path: '/api/group',         keys: ['groups', 'items'] },
  ];
  for (const { path, keys } of ENDPOINTS) {
    try {
      const data = await pgFetch(env, config, path);
      const list = Array.isArray(data)
        ? data
        : keys.reduce((acc, k) => acc || (data && data[k]), null) || [];
      const groups = list
        .map(g => ({
          id:   Number(g.id != null ? g.id : (g.group_id != null ? g.group_id : g.template_id)),
          name: String(g.name || g.title || ''),
        }))
        .filter(g => Number.isFinite(g.id) && g.id > 0);
      if (groups.length > 0) {
        console.log('[pgGetGroups] from', path, ':', JSON.stringify(groups));
        return groups;  // [{id, name}]
      }
    } catch (_) {}
  }
  return [];
}

function pgGetUser(env, config, username) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}`);
}

// ۳) ویرایش کاربر (تغییر حجم/مدت/گروه)
function pgModifyUser(env, config, username, patch) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}`, {
    method: 'PUT',
    body: patch,
  });
}

// ۴) غیرفعال/فعال کردن اشتراک
function pgSetUserDisabled(env, config, username, disabled) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}/disabled`, {
    method: 'PUT',
    body: { disabled: Boolean(disabled) },
  });
}

// ۵) حذف کامل اشتراک
function pgDeleteUser(env, config, username) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

// ۶) ریست حجم مصرفی
function pgResetUserUsage(env, config, username) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}/reset`, { method: 'POST' });
}

// ۷) باطل کردن لینک اشتراک و ساخت لینک تازه
function pgRevokeUserSub(env, config, username) {
  return pgFetch(env, config, `/api/user/by-username/${encodeURIComponent(username)}/revoke_sub`, { method: 'POST' });
}

// ۸) لیست گروه‌ها — برای اینکه ادمین شناسه گروه‌ها را بدون مراجعه به پنل ببیند
function pgListGroups(env, config) {
  return pgFetch(env, config, '/api/groups/simple');
}

// ۹) تست سلامت اتصال. اول اطلاعات ادمین جاری، و اگر آن مسیر در نسخه نصب‌شده
//    نبود، به لیست گروه‌ها برمی‌گردد تا صرفاً صحت اتصال و کلید بررسی شود.
async function pgPing(env, config) {
  try {
    const admin = await pgFetch(env, config, '/api/admin');
    return { ok: true, via: '/api/admin', admin: admin && admin.username ? admin.username : null };
  } catch (err) {
    if (err instanceof PgError && (err.status === 404 || err.status === 405)) {
      const groups = await pgListGroups(env, config);
      const count = groups && Array.isArray(groups.groups) ? groups.groups.length : 0;
      return { ok: true, via: '/api/groups/simple', groups: count };
    }
    throw err;
  }
}

// ---------- ساخت اشتراک تازه با نام کاربری یکتا ----------

/**
 * یک کاربر تازه روی پنل می‌سازد و اطلاعات نرمال‌شده اشتراک را برمی‌گرداند.
 * اگر نام کاربری تکراری بود (خطای 409) تا سه بار با شماره/نمک تازه تلاش می‌کند.
 */
async function pgProvision(env, config, { plan, telegramId, seq, note = '' }) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const salt = attempt === 0 ? '' : Math.random().toString(36).slice(2, 6);
    const username = buildPgUsername(config, telegramId, Number(seq) + attempt, salt);

    if (!isValidPgUsername(username)) {
      throw new PgError('نام کاربری تولیدشده با قواعد پنل سازگار نیست', 0);
    }

    try {
      const created = plan.templateId
        ? await pgCreateUserFromTemplate(env, config, plan.templateId, username, note)
        : await pgCreateUser(env, config, buildUserCreatePayload(plan, username, note));
      return normalizePgUser(config, created);
    } catch (err) {
      lastError = err;
      if (!(err instanceof PgError) || err.status !== 409) throw err;
    }
  }

  throw lastError || new PgError('ساخت اشتراک روی پنل ناموفق بود', 0);
}

// پاسخ UserResponse پنل را به شکل ثابت و قابل‌استفاده در ربات تبدیل می‌کند
function normalizePgUser(config, user) {
  const data = user || {};
  return {
    pgUserId: data.id === undefined || data.id === null ? null : Number(data.id),
    pgUsername: String(data.username || ''),
    status: String(data.status || SUB_STATUS.ACTIVE),
    dataLimitBytes: Math.round(Number(data.data_limit) || 0),
    usedTrafficBytes: Math.round(Number(data.used_traffic) || 0),
    expireAt: parsePgExpire(data.expire),
    onHoldSeconds: Number(data.on_hold_expire_duration) || 0,
    subscriptionUrl: pgSubscriptionUrl(config, data.subscription_url),
    createdAt: parsePgExpire(data.created_at) || Date.now(),
    raw: data,
  };
}

// ============================================================
// ۳.۶ لایه پرداخت (ماژولار — آماده برای افزودن درگاه شما)
//
//  هر Payment Provider یک آبجکت با این قالب است:
//    {
//      id: 'my_gateway',
//      label: 'درگاه من',
//      autoVerify: true,                 // بدون دخالت ادمین تایید می‌شود؟
//      async start(ctx)  -> { instructions, redirectUrl, reference, error }
//      async verify(ctx) -> { ok, reference, amount, raw, reason }
//    }
//
//  ⚠️ هر دو تابع باید همیشه همه کلیدهای بالا را برگردانند (مقدار استفاده‌نشده
//  را null بگذارید). این قرارداد ثابت باعث می‌شود مصرف‌کننده‌ها لازم نباشد
//  وجود کلید را چک کنند و ابزارهای type-check هم خطا نگیرند.
//
//  ctx شامل: { env, config, order, user, params }
//
//  برای اضافه کردن درگاه واقعی:
//    ۱) یک آبجکت مثل بالا بسازید (مثلاً zarinpalProvider)
//    ۲) آن را در PAYMENT_PROVIDERS ثبت کنید
//    ۳) درگاه را روی «<آدرس Worker>/payment/callback» تنظیم کنید
//  بقیه زنجیره (تایید ← ساخت اشتراک روی پاسارگارد ← ذخیره ← ارسال لینک)
//  به‌صورت خودکار در provisionOrder اجرا می‌شود و نیازی به تغییر ندارد.
// ============================================================

const textEncoder = new TextEncoder();

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// مقایسه با زمان ثابت تا امضا با آزمون‌وخطا حدس زده نشود
function safeCompare(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

// شکل ثابت پاسخ‌ها — همه Providerها از همین دو سازنده استفاده می‌کنند
function paymentStart({ instructions = null, redirectUrl = null, reference = null, error = null } = {}) {
  return { instructions, redirectUrl, reference, error };
}

function paymentResult({ ok = false, reference = null, amount = 0, raw = {}, reason = null } = {}) {
  return { ok, reference, amount, raw, reason };
}

// ---------- Provider ۱: کیف پول داخلی ----------
const walletProvider = {
  id: 'wallet',
  label: '💰 پرداخت از کیف پول',
  autoVerify: true,
  async start() {
    return paymentStart({ instructions: 'مبلغ از موجودی کیف پول شما کسر می‌شود.' });
  },
  async verify(ctx) {
    const amount = Math.round(Number(ctx.order.price) || 0);
    const deducted = deductWalletBalance(ctx.order.userId, amount);
    if (!deducted) return paymentResult({ reason: 'موجودی کیف پول کافی نیست' });
    return paymentResult({
      ok: true,
      reference: `wallet_${ctx.order.id}`,
      amount,
      raw: { method: 'wallet' },
    });
  },
};

// ---------- Provider ۲: کارت به کارت با تایید ادمین ----------
const manualCardProvider = {
  id: 'card',
  label: '💳 کارت به کارت',
  autoVerify: false,
  async start(ctx) {
    return paymentStart({
      instructions: 'پس از واریز، عکس رسید را ارسال کنید تا ادمین بررسی کند.',
      reference: String(ctx.order.id),
    });
  },
  // تایید نهایی با دکمه «تایید سفارش» توسط ادمین انجام می‌شود
  async verify(ctx) {
    return paymentResult({
      ok: true,
      reference: `card_${ctx.order.id}`,
      amount: Math.round(Number(ctx.order.price) || 0),
      raw: {
        method: 'card',
        approvedBy: ctx.params && ctx.params.adminId ? String(ctx.params.adminId) : null,
      },
    });
  },
};

// ---------- Provider ۳: درگاه پرداخت (اسکلت آماده) ----------
//  این Provider فقط زمانی فعال است که PAYMENT_CALLBACK_SECRET ست شده باشد.
//  callback باید با این پارامترها به /payment/callback بیاید:
//    order_id, amount, reference, status(=ok)، signature
//  و signature باید HMAC-SHA256 هگز از رشته زیر با همان کلید باشد:
//    `${order_id}|${amount}|${reference}|${status}`
const gatewayProvider = {
  id: 'gateway',
  label: '🌐 درگاه پرداخت آنلاین',
  autoVerify: true,
  async start(ctx) {
    if (!ctx.config.PAYMENT_CALLBACK_SECRET) {
      return paymentStart({ error: 'درگاه پرداخت آنلاین هنوز تنظیم نشده است.' });
    }
    // 🔧 اینجا درخواست ساخت تراکنش را به درگاه خودتان بزنید و redirectUrl را برگردانید:
    //   const res = await fetch('https://api.your-gateway.ir/request', { ... });
    //   const data = await res.json();
    //   return paymentStart({ redirectUrl: data.payment_url, reference: data.authority });
    return paymentStart({
      error: 'اتصال به درگاه پرداخت شما پیاده‌سازی نشده است (بخش gatewayProvider.start).',
    });
  },

  async verify(ctx) {
    const secret = ctx.config.PAYMENT_CALLBACK_SECRET;
    if (!secret) return paymentResult({ reason: 'کلید امضای درگاه تنظیم نشده است' });

    const params = ctx.params || {};
    const orderId = String(params.order_id || '');
    const amount = String(params.amount || '');
    const reference = String(params.reference || '');
    const status = String(params.status || '');
    const signature = String(params.signature || '');

    if (!orderId || !reference || !signature) {
      return paymentResult({ reason: 'پارامترهای callback ناقص است' });
    }
    if (status !== 'ok') return paymentResult({ reason: 'درگاه پرداخت را ناموفق اعلام کرد' });

    const expected = await hmacSha256Hex(secret, `${orderId}|${amount}|${reference}|${status}`);
    if (!safeCompare(expected, signature.toLowerCase())) {
      return paymentResult({ reason: 'امضای callback معتبر نیست' });
    }

    const paidAmount = Math.round(Number(amount) || 0);
    const expectedAmount = Math.round(Number(ctx.order.price) || 0);
    if (paidAmount !== expectedAmount) {
      return paymentResult({
        reason: `مبلغ پرداخت (${paidAmount}) با مبلغ سفارش (${expectedAmount}) یکی نیست`,
      });
    }

    return paymentResult({
      ok: true,
      reference,
      amount: paidAmount,
      raw: { method: 'gateway', status },
    });
  },
};

// ثبت Providerها — درگاه خودتان را همین‌جا اضافه کنید
const PAYMENT_PROVIDERS = {
  [walletProvider.id]: walletProvider,
  [manualCardProvider.id]: manualCardProvider,
  [gatewayProvider.id]: gatewayProvider,
};

function getPaymentProvider(id) {
  return PAYMENT_PROVIDERS[String(id || '')] || null;
}

// آیا درگاه آنلاین قابل نمایش به کاربر است؟
function isGatewayEnabled(config) {
  return Boolean(config.PAYMENT_CALLBACK_SECRET);
}

// ============================================================
// ۳.۸ اعلان به ادمین (تحویل تضمین‌شده + بدون تکرار)
//
//   • مقصد اعلان از متغیر محیطی خوانده می‌شود:
//       ADMIN_CHAT_ID  (اولویت اول)  →  ADMIN_GROUP_ID  →  اولین آیدی ADMIN_IDS
//   • اولین ارسال موفق کافی است؛ اگر گروه ادمین اشتباه/ناموجود باشد، پیام
//     خودکار به چت خصوصی ادمین می‌رود (پس اعلان هیچ‌وقت گم نمی‌شود).
//   • هر شماره سفارش فقط یک‌بار اعلان می‌شود (حتی اگر تلگرام آپدیت را
//     دوباره بفرستد یا ادمین دکمه را دوباره بزند).
//   • خطاها در D1 لاگ می‌شوند و هیچ‌وقت باعث شکست پردازش سفارش نمی‌شوند.
// ============================================================

// حداکثر تعداد شماره سفارشی که برای جلوگیری از اعلان تکراری نگه داشته می‌شود
const NOTIFIED_ORDERS_LIMIT = 2000;

// تبدیل متن HTML به متن ساده — برای آخرین تلاش ارسال وقتی تلگرام
// به هر دلیلی parse_mode=HTML را رد می‌کند (مثلاً کاراکتر عجیب در نام مشتری)
function stripHtmlTags(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * تحویل پیام به یک چت با سه تلاش پشت‌سرهم، تا اعلان به هیچ دلیلی گم نشود:
 *   ۱) عکس رسید با کپشن  ۲) پیام متنی HTML  ۳) متن ساده بدون HTML و بدون دکمه
 * هیچ‌وقت throw نمی‌کند (callTelegram خطا را به {ok:false} تبدیل می‌کند).
 */
async function deliverAdminMessage(config, chatId, text, photoFileId, replyMarkup) {
  const extra = replyMarkup ? { reply_markup: replyMarkup } : {};
  const errors = [];

  if (photoFileId) {
    const photo = await sendPhoto(config.BOT_TOKEN, chatId, photoFileId, text, extra);
    if (photo && photo.ok) return { ok: true, via: 'photo', errors };
    errors.push(`photo: ${(photo && photo.description) || 'ارسال ناموفق'}`);
  }

  const html = await sendMessage(config.BOT_TOKEN, chatId, text, extra);
  if (html && html.ok) return { ok: true, via: 'text', errors };
  errors.push(`text: ${(html && html.description) || 'ارسال ناموفق'}`);

  // آخرین تلاش: بدون parse_mode و بدون reply_markup تا مشکل‌های قالب‌بندی
  // یا دکمه نتوانند جلوی رسیدن خودِ اعلان را بگیرند
  const plain = await sendMessage(config.BOT_TOKEN, chatId, stripHtmlTags(text), { parse_mode: undefined });
  if (plain && plain.ok) return { ok: true, via: 'plain', errors };
  errors.push(`plain: ${(plain && plain.description) || 'ارسال ناموفق'}`);

  return { ok: false, via: null, errors };
}

// فهرست مقصدهای اعلان، به‌ترتیب اولویت و بدون تکرار
function adminNotifyTargets(config) {
  const targets = [];
  const add = (value) => {
    const id = String(value || '').trim();
    if (id && !targets.includes(id)) targets.push(id);
  };

  add(config.ADMIN_CHAT_ID);
  add(config.ADMIN_GROUP_ID);
  for (const adminId of config.ADMIN_IDS || []) add(adminId);
  return targets;
}

/**
 * ارسال اعلان به ادمین.
 * @returns {Promise<{ok: boolean, chatId: string|null, via: string|null, skipped: boolean, errors: string[]}>}
 */
async function notifyAdmins(env, config, options = {}) {
  const { text, photoFileId = null, replyMarkup = null, orderId = null, once = true } = options;

  const dedupeKey = orderId === null || orderId === undefined ? '' : String(orderId);
  if (once && dedupeKey && DB.notifiedOrders.has(dedupeKey)) {
    return { ok: true, chatId: null, via: null, skipped: true, errors: [] };
  }

  const targets = adminNotifyTargets(config);
  const errors = [];

  for (const chatId of targets) {
    const delivered = await deliverAdminMessage(config, chatId, text, photoFileId, replyMarkup);
    if (delivered.ok) {
      if (dedupeKey) rememberNotifiedOrder(dedupeKey);
      return { ok: true, chatId, via: delivered.via, skipped: false, errors };
    }
    for (const err of delivered.errors) errors.push(`${chatId}: ${err}`);
  }

  // لاگ هم اگر ممکن نبود، پردازش سفارش نباید متوقف شود
  try {
    await dbLog(env, 'error', 'telegram', 'admin notification failed', { targets, errors }, { orderId });
  } catch (err) {
    console.error('admin notification log failed:', err);
  }
  return { ok: false, chatId: null, via: null, skipped: false, errors };
}

function rememberNotifiedOrder(key) {
  DB.notifiedOrders.add(String(key));
  // مجموعه را کوتاه نگه می‌داریم تا حجم state در KV کنترل‌شده بماند
  if (DB.notifiedOrders.size > NOTIFIED_ORDERS_LIMIT) {
    const keys = [...DB.notifiedOrders];
    DB.notifiedOrders = new Set(keys.slice(keys.length - NOTIFIED_ORDERS_LIMIT));
  }
}

// ============================================================
// ۳.۷ زنجیره تحویل سفارش
//   Payment → Verify → PasarGuard API → Create Subscription → Save in D1
//            → Send Subscription URL to Telegram
// ============================================================

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return 'نامحدود';
  if (value >= GIGABYTE) return `${(value / GIGABYTE).toFixed(2)} گیگابایت`;
  return `${(value / (1024 * 1024)).toFixed(0)} مگابایت`;
}

function formatDate(ms) {
  if (!ms) return 'بدون تاریخ انقضا';
  try {
    return new Date(ms).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (err) {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function daysLeft(ms) {
  if (!ms) return null;
  return Math.ceil((ms - Date.now()) / 86400000);
}

// بسته مرتبط با سفارش؛ اگر ادمین بسته را حذف کرده باشد از snapshot خود سفارش
function resolveOrderPlan(order) {
  if (order && order.planSnapshot) return order.planSnapshot;
  ensurePlansLoaded();
  const found = DB.plans.find((p) => p.id === (order && order.planId));
  if (found) return found;
  return null;
}

// شماره ترتیبی اشتراک برای ساخت نام کاربری یکتا روی پنل
function nextSubSeq(userId) {
  const idStr = String(userId);
  let max = 0;
  for (const sub of DB.subscriptions.values()) {
    if (String(sub.userId) === idStr) max = Math.max(max, Number(sub.seq) || 0);
  }
  return max + 1;
}

function listUserSubscriptions(userId) {
  const idStr = String(userId);
  return [...DB.subscriptions.values()]
    .filter((sub) => String(sub.userId) === idStr)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// متن پیام تحویل اشتراک به مشتری
function formatSubscriptionMessage(config, sub, plan) {
  const lines = [
    '🎉 <b>اشتراک شما آماده است!</b>',
    '',
    `📶 حجم: <b>${formatBytes(sub.dataLimitBytes)}</b>`,
  ];

  // کانفیگ‌ها تاریخ انقضا ندارند؛ خط انقضا فقط وقتی نمایش داده می‌شود که
  // واقعاً تاریخی روی اشتراک ست شده باشد (مثلاً بسته‌های قالب‌دار پنل).
  if (sub.status === 'on_hold') {
    const days = plan && Number(plan.days) ? Number(plan.days) : 0;
    if (days > 0) lines.push(`⏳ مدت اعتبار: <b>${days} روز</b> (از اولین اتصال شما شروع می‌شود)`);
  } else if (sub.expireAt) {
    lines.push(`📅 تاریخ انقضا: <b>${formatDate(sub.expireAt)}</b>`);
  }

  lines.push(
    '',
    '🔗 <b>لینک اشتراک (Subscription):</b>',
    `<code>${escapeHtml(sub.subscriptionUrl)}</code>`,
    '',
    'این لینک را در برنامه‌ای مثل v2rayNG، Streisand، Hiddify یا Clash در بخش',
    '«افزودن از لینک اشتراک / Add from subscription» وارد کنید.',
    '',
    `🆔 شناسه اشتراک: <code>${escapeHtml(sub.id)}</code>`,
    `🎫 پشتیبانی: @${escapeHtml(config.SUPPORT_USERNAME)}`
  );
  return lines.join('\n');
}

// متن وضعیت اشتراک (پس از همگام‌سازی با پنل)
function formatSubscriptionStatus(sub) {
  const remaining = Math.max(0, (Number(sub.dataLimitBytes) || 0) - (Number(sub.usedTrafficBytes) || 0));
  const left = daysLeft(sub.expireAt);
  const lines = [
    '📊 <b>وضعیت اشتراک</b>',
    '',
    `📌 وضعیت: <b>${PG_STATUS_LABEL[sub.status] || escapeHtml(sub.status)}</b>`,
    `📶 حجم کل: <b>${formatBytes(sub.dataLimitBytes)}</b>`,
    `📉 مصرف‌شده: <b>${formatBytes(sub.usedTrafficBytes)}</b>`,
  ];
  if (Number(sub.dataLimitBytes) > 0) {
    lines.push(`✅ باقیمانده: <b>${formatBytes(remaining)}</b>`);
  }
  if (sub.expireAt) {
    lines.push(`📅 انقضا: <b>${formatDate(sub.expireAt)}</b>`);
    if (left !== null) {
      lines.push(left >= 0 ? `⏳ روزهای باقیمانده: <b>${left}</b>` : '⌛ این اشتراک منقضی شده است.');
    }
  }
  if (sub.subscriptionUrl) {
    lines.push('', '🔗 لینک اشتراک:', `<code>${escapeHtml(sub.subscriptionUrl)}</code>`);
  }
  return lines.join('\n');
}

/**
 * ساخت اشتراک روی پاسارگارد و تحویل آن به مشتری.
 * این تابع idempotent است: اگر سفارش قبلاً تحویل شده باشد، اشتراک موجود را
 * برمی‌گرداند و اشتراک تکراری نمی‌سازد (مهم برای callback درگاه).
 */
async function provisionOrder(env, config, order, options = {}) {
  const notifyChatId = options.notifyChatId || order.chatId || order.userId;

  if (order.subscriptionId) {
    const existing = memGet(DB.subscriptions, order.subscriptionId);
    if (existing) return { ok: true, subscription: existing, alreadyDone: true };
  }

  const plan = resolveOrderPlan(order);
  if (!plan) {
    await failOrder(env, config, order, 'بسته این سفارش دیگر در لیست بسته‌ها موجود نیست.', notifyChatId);
    return { ok: false, error: 'plan_not_found' };
  }

  if (!pgConfigured(config)) {
    await failOrder(
      env,
      config,
      order,
      'اتصال پنل پاسارگارد تنظیم نشده است (PASARGUARD_BASE_URL و کلید API).',
      notifyChatId
    );
    return { ok: false, error: 'pasarguard_not_configured' };
  }

  let pgUser;
  const seq = nextSubSeq(order.userId);
  try {
    pgUser = await pgProvision(env, config, {
      plan,
      telegramId: order.userId,
      seq,
      // نام فارسی مشتری در پنل به‌عنوان یادداشت ثبت می‌شود تا اشتراک قابل شناسایی باشد
      note: order.customerName || '',
    });
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص در ارتباط با پنل';
    const hint = pgErrorHint(err, plan);
    await dbLog(env, 'error', 'pasarguard', `provision failed: ${message}`, { planId: plan.id }, {
      telegramId: order.userId,
      orderId: order.id,
    });
    await failOrder(env, config, order, `${message}${hint}`, notifyChatId);
    return { ok: false, error: message };
  }

  const sub = {
    id: newId('sub'),
    userId: String(order.userId),
    chatId: order.chatId || order.userId,
    seq,
    orderId: order.id,
    planId: plan.id,
    planTitle: plan.title,
    pgUsername: pgUser.pgUsername,
    pgUserId: pgUser.pgUserId,
    dataLimitBytes: pgUser.dataLimitBytes,
    usedTrafficBytes: pgUser.usedTrafficBytes,
    startAt: Date.now(),
    expireAt: pgUser.expireAt,
    subscriptionUrl: pgUser.subscriptionUrl,
    status: pgUser.status,
    previousId: order.renewOf || null,
    lastSyncedAt: Date.now(),
    createdAt: Date.now(),
  };
  memSet(DB.subscriptions, sub.id, sub);

  order.status = ORDER_STATUS.SENT;
  order.subscriptionId = sub.id;
  order.pgUsername = sub.pgUsername;
  order.updatedAt = Date.now();
  memSet(DB.orders, order.id, order);

  // ذخیره در D1 (اگر binding وصل باشد)
  await dbUpsertUser(env, { id: order.userId, username: order.username });
  await dbSyncPlan(env, plan);
  await dbSaveOrder(env, order);
  await dbSaveSubscription(env, sub);
  await dbLog(
    env,
    'info',
    'pasarguard',
    `subscription created (${sub.pgUsername})`,
    { planId: plan.id, kind: order.kind || ORDER_KIND.NEW },
    { telegramId: order.userId, orderId: order.id }
  );

  // ارسال لینک اشتراک به مشتری
  await sendMessage(config.BOT_TOKEN, notifyChatId, formatSubscriptionMessage(config, sub, plan), {
    reply_markup: mainReplyKeyboard(config),
  });

  // دکمه شیشه‌ای «🎓 آموزش‌ها» زیر پیام تحویل — تلگرام روی هر پیام فقط یک نوع
  // reply_markup می‌پذیرد، پس این دکمه در یک پیام کوتاه جداگانه (بلافاصله زیر
  // پیام تحویل) ارسال می‌شود. محتوای آن از پنل ادمین (مدیریت آموزش‌ها) قابل
  // افزودن/ویرایش/حذف است.
  if (DB.tutorials.size > 0) {
    await sendMessage(config.BOT_TOKEN, notifyChatId, '📚 برای آموزش اتصال و استفاده از سرویس روی دکمه زیر بزنید:', {
      reply_markup: { inline_keyboard: [[{ text: '🎓 آموزش‌ها', callback_data: 'tutorials:view' }]] },
    });
  }

  // اطلاع به ادمین (اگر گروه ادمین در دسترس نباشد، به چت خصوصی ادمین می‌رود)
  await notifyAdmins(env, config, {
    orderId: `sub:${order.id}`,
    text:
      `✅ <b>اشتراک ساخته و ارسال شد</b> — سفارش #${order.id}\n` +
      `👤 مشتری: ${escapeHtml(order.customerName || '—')} (<code>${order.userId}</code>)\n` +
      `🧾 نام کاربری پنل: <code>${escapeHtml(sub.pgUsername)}</code>\n` +
      `📦 ${escapeHtml(sub.planTitle || '—')} | ${formatBytes(sub.dataLimitBytes)}${
        sub.expireAt ? ` | ${formatDate(sub.expireAt)}` : ''
      }`,
  });

  // پورسانت خودکار دعوت دوست: اگر خریدار از طریق لینک دعوت شخص دیگری آمده،
  // درصدی از مبلغ این خرید به کیف پول دعوت‌کننده واریز می‌شود.
  await creditReferralCommission(env, config, order);

  return { ok: true, subscription: sub };
}

// ثبت شکست سفارش: بازگشت پول کیف پول، اطلاع به مشتری و ادمین
async function failOrder(env, config, order, reason, notifyChatId) {
  order.status = ORDER_STATUS.CONFIRMED; // پرداخت معتبر بوده، فقط تحویل انجام نشده
  order.lastError = String(reason).slice(0, 300);
  order.updatedAt = Date.now();
  memSet(DB.orders, order.id, order);
  await dbSaveOrder(env, order);

  let refundNote = '';
  if (order.paidVia === 'wallet' && !order.refunded) {
    const balance = addWalletBalance(order.userId, order.price);
    order.refunded = true;
    memSet(DB.orders, order.id, order);
    await dbSyncUserWallet(env, order.userId, balance);
    refundNote = '\n💰 مبلغ به کیف پول شما بازگردانده شد.';
  }

  await sendMessage(
    config.BOT_TOKEN,
    notifyChatId,
    `⚠️ پرداخت شما ثبت شد، اما ساخت خودکار اشتراک انجام نشد.${refundNote}\n\n` +
      `همکاران ما در جریان قرار گرفتند و اشتراک به‌صورت دستی برای شما ارسال می‌شود.\n` +
      `🎫 پشتیبانی: @${escapeHtml(config.SUPPORT_USERNAME)}`
  );

  if (config.ADMIN_GROUP_ID || (config.ADMIN_IDS && config.ADMIN_IDS.length)) {
    await notifyAdmins(env, config, {
      orderId: `fail:${order.id}`,
      replyMarkup: adminOrderKeyboard(order.id, ORDER_STATUS.CONFIRMED),
      text:
        `🚨 <b>ساخت اشتراک ناموفق</b> — سفارش #${order.id}\n` +
        `👤 مشتری: ${escapeHtml(order.customerName || '—')} (<code>${order.userId}</code>)\n` +
        `📦 بسته: ${escapeHtml(order.planTitle || '-')}\n` +
        `❌ دلیل: ${escapeHtml(String(reason).slice(0, 700))}\n\n` +
        `با دکمه «ارسال اکانت به مشتری» می‌توانید دستی تحویل دهید.`,
    });
  }
}

/**
 * همگام‌سازی وضعیت یک اشتراک با پنل: حجم مصرفی، وضعیت و تاریخ انقضا.
 * توجه: پنل هر بار توکن لینک اشتراک را از نو می‌سازد (هر دو معتبرند)، پس
 * لینک ذخیره‌شده را عوض نمی‌کنیم تا لینک مشتری ثابت بماند.
 */
async function syncSubscription(env, config, sub) {
  try {
    const fresh = normalizePgUser(config, await pgGetUser(env, config, sub.pgUsername));
    sub.usedTrafficBytes = fresh.usedTrafficBytes;
    sub.dataLimitBytes = fresh.dataLimitBytes;
    sub.expireAt = fresh.expireAt;
    sub.status = fresh.status;
    if (!sub.subscriptionUrl && fresh.subscriptionUrl) sub.subscriptionUrl = fresh.subscriptionUrl;
    sub.lastSyncedAt = Date.now();
    memSet(DB.subscriptions, sub.id, sub);
    await dbSaveSubscription(env, sub);
    return { ok: true, sub };
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص در ارتباط با پنل';
    if (err instanceof PgError && err.status === 404) {
      sub.status = SUB_STATUS.REVOKED;
      sub.lastSyncedAt = Date.now();
      memSet(DB.subscriptions, sub.id, sub);
      await dbSaveSubscription(env, sub);
    }
    await dbLog(env, 'warn', 'pasarguard', `sync failed: ${message}`, { pgUsername: sub.pgUsername }, {
      telegramId: sub.userId,
    });
    return { ok: false, error: message, sub };
  }
}

// ============================================================
// ۴. کیبوردها
// ============================================================

// --- Reply Keyboard (Custom Keyboard) - منوی اصلی ---
// متن دکمه‌ها از تنظیمات (قابل تغییر توسط ادمین) خوانده می‌شود
function mainReplyKeyboard(config) {
  return {
    keyboard: [
      [
        withButtonStyle({ text: config.BTN_MYORDERS_LABEL }, config.BTN_STYLE_MYORDERS),
        withButtonStyle({ text: config.BTN_SHOP_LABEL }, config.BTN_STYLE_SHOP),
      ],
      [
        withButtonStyle({ text: config.BTN_RENEW_LABEL }, config.BTN_STYLE_RENEW),
      ],
      [
        withButtonStyle({ text: config.BTN_TESTCONFIG_LABEL }, config.BTN_STYLE_TESTCONFIG),
        withButtonStyle({ text: config.BTN_WALLET_LABEL }, config.BTN_STYLE_WALLET),
      ],
      ...(config.REFERRAL_ENABLED
        ? [[withButtonStyle({ text: config.BTN_INVITE_LABEL }, config.BTN_STYLE_INVITE)]]
        : []),
      [
        withButtonStyle({ text: config.BTN_SUPPORT_LABEL }, config.BTN_STYLE_SUPPORT),
      ],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// --- Reply Keyboard مخصوص ادمین ---
function adminReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '⏳ سفارش‌های در انتظار' }, { text: '💳 مدیریت کارت‌ها' }],
      [{ text: '📦 مدیریت بسته‌ها' }, { text: '🛰 پاسارگارد' }],
      [{ text: '🎓 مدیریت آموزش‌ها' }],
      [{ text: '🎁 مدیریت تست کانفیگ' }, { text: '💰 مدیریت کیف پول' }],
      [{ text: '🔒 عضویت اجباری' }],
      [{ text: '👤 مدیریت ادمین‌ها' }, { text: '⚙️ تنظیمات فروشگاه' }],
      [{ text: '🚦 مدیریت کانفیگ کاربران' }],
      [{ text: '📊 آمار فروشگاه' }, { text: '🔙 بازگشت به منوی کاربری' }],
      [{ text: '👥 مدیریت دعوت دوستان' }],
      [{ text: '📢 پیام همگانی' }, { text: '📣 تبلیغ در کانال' }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

// --- کیبورد دسته‌بندی محصولات (اینلاین) ---
// عنوان دسته‌بندی از تنظیمات قابل‌تغییر خوانده می‌شود
function productsKeyboard(config) {
  return {
    inline_keyboard: [
      [withButtonStyle(
        { text: `${config.PRODUCT_CATEGORY_TITLE}`, callback_data: `product:${PRODUCT_CATEGORY_ID}` },
        config.INLINE_CATEGORY_BTN_STYLE
      )],
      backNavRow('main'),
    ],
  };
}

// --- کیبورد بسته‌ها (اینلاین) ---
// لیست بسته‌ها از DB.plans (قابل مدیریت کامل توسط ادمین) خوانده می‌شود.
// کانفیگ‌ها تاریخ انقضا ندارند، پس فقط حجم و قیمت نمایش داده می‌شود.
function planLabel(plan) {
  const RLM = '\u200F'; // Right-to-Left Mark: جلوگیری از بهم‌ریختگی نمایش عدد+فارسی روی دسکتاپ
  const volume = Number(plan.gb) > 0 ? `${RLM}${plan.gb}${RLM} گیگ` : 'نامحدود';
  const price = `${RLM}${Number(plan.price).toLocaleString()}${RLM} ت`;
  return `${RLM}${volume}${RLM} | ${price}`;
}

function plansKeyboard(config) {
  ensurePlansLoaded();
  const rows = [];
  const plans = DB.plans;
  for (let i = 0; i < plans.length; i += 2) {
    const hasPair = Boolean(plans[i + 1]);
    if (hasPair) {
      // ردیف زوجی: دکمه اول آرایه در کلاینت راست‌چین به‌صورت «ستون راست» و
      // دکمه دوم به‌صورت «ستون چپ» نمایش داده می‌شود.
      const row = [
        withButtonStyle(
          { text: planLabel(plans[i]), callback_data: `plan:${plans[i].id}` },
          config.INLINE_PLAN_RIGHT_BTN_STYLE
        ),
        withButtonStyle(
          { text: planLabel(plans[i + 1]), callback_data: `plan:${plans[i + 1].id}` },
          config.INLINE_PLAN_LEFT_BTN_STYLE
        ),
      ];
      rows.push(row);
    } else {
      // آخرین بسته وقتی تعداد فرد باشد و جفت نداشته باشد (تک‌ستونی)
      rows.push([
        withButtonStyle(
          { text: planLabel(plans[i]), callback_data: `plan:${plans[i].id}` },
          config.INLINE_PLAN_LAST_BTN_STYLE
        ),
      ]);
    }
  }
  if (plans.length === 0) {
    rows.push([{ text: '⚠️ در حال حاضر بسته‌ای ثبت نشده', callback_data: 'noop' }]);
  }
  rows.push([{ text: BACK_BUTTON_TEXT, callback_data: 'back:products' }]);
  return { inline_keyboard: rows };
}

// --- کیبورد انتخاب روش پرداخت ---
// درگاه آنلاین فقط وقتی نمایش داده می‌شود که PAYMENT_CALLBACK_SECRET ست شده باشد
function paymentMethodKeyboard(walletBalance, config) {
  const rows = [[{ text: '💳 پرداخت کارت به کارت', callback_data: 'paymethod:card' }]];

  if (config && isGatewayEnabled(config)) {
    rows.push([{ text: '🌐 پرداخت با درگاه آنلاین', callback_data: 'paymethod:gateway' }]);
  }

  rows.push([
    {
      text: `💰 پرداخت از کیف پول (موجودی: ${walletBalance.toLocaleString()} ت)`,
      callback_data: 'paymethod:wallet',
    },
  ]);
  rows.push([{ text: BACK_BUTTON_TEXT, callback_data: 'back:plans' }]);
  return { inline_keyboard: rows };
}

// --- کیبورد انتخاب کارت برای پرداخت (مشتری، اینلاین) ---
function cardsKeyboard() {
  const rows = [];
  for (const card of DB.cards.values()) {
    rows.push([{ text: `🔵 ${card.bankName} - ${card.number}`, callback_data: `paycard:${card.id}` }]);
  }
  if (rows.length === 0) {
    rows.push([{ text: '⚠️ در حال حاضر کارتی ثبت نشده', callback_data: 'noop' }]);
  }
  rows.push([{ text: BACK_BUTTON_TEXT, callback_data: 'back:plans' }]);
  return { inline_keyboard: rows };
}

// --- کیبورد انتخاب کارت برای شارژ کیف پول (مشتری، اینلاین) ---
function walletTopupCardsKeyboard() {
  const rows = [];
  for (const card of DB.cards.values()) {
    rows.push([{ text: `🔵 ${card.bankName} - ${card.number}`, callback_data: `walletcard:${card.id}` }]);
  }
  if (rows.length === 0) {
    rows.push([{ text: '⚠️ در حال حاضر کارتی ثبت نشده', callback_data: 'noop' }]);
  }
  rows.push([{ text: BACK_BUTTON_TEXT, callback_data: 'wallet:menu' }]);
  return { inline_keyboard: rows };
}

// --- کیبورد منوی کیف پول (مشتری، اینلاین) ---
function walletMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '➕ شارژ کیف پول', callback_data: 'wallet:topup' }],
      backNavRow('main'),
    ],
  };
}

// --- کیبورد مدیریت کارت‌ها (ادمین، اینلاین) ---
function cardsAdminInlineKeyboard() {
  const rows = [];
  for (const card of DB.cards.values()) {
    rows.push([{ text: `🔴 حذف: ${card.bankName} - ${card.number}`, callback_data: `card_del:${card.id}` }]);
  }
  rows.push([{ text: '🟢 افزودن کارت جدید', callback_data: 'card_add' }]);
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// --- کیبورد مدیریت ادمین‌ها (ادمین، اینلاین) ---
function adminsAdminInlineKeyboard() {
  const rows = [];
  for (const id of DB.admins) {
    rows.push([{ text: `🔴 حذف ادمین: ${id}`, callback_data: `adminmgmt_del:${id}` }]);
  }
  rows.push([{ text: '🟢 افزودن ادمین جدید', callback_data: 'adminmgmt_add' }]);
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// --- کیبورد تنظیمات فروشگاه (ادمین، اینلاین) ---
function settingsInlineKeyboard() {
  return {
    inline_keyboard: [
      ...Object.keys(SETTINGS_FIELDS).map((field) => [
        { text: `🟣 ${SETTINGS_FIELDS[field]}`, callback_data: `setting_edit:${field}` },
      ]),
      [{ text: '🎨 رنگ دکمه‌های منو', callback_data: 'btnstyle_menu' }],
      [{ text: '🎨 رنگ دکمه‌های شیشه‌ای (همه بخش‌ها)', callback_data: 'glassstyle_menu' }],
      backNavRow('admin'),
    ],
  };
}

// --- کیبورد مدیریت بسته‌ها (ادمین، اینلاین) ---
// کانفیگ‌ها تاریخ انقضا ندارند، پس فقط حجم و مقصد (گروه/قالب) نمایش داده می‌شود.
function plansAdminInlineKeyboard() {
  ensurePlansLoaded();
  const rows = [];
  for (const plan of DB.plans) {
    const volume = Number(plan.gb) > 0 ? `${plan.gb}گیگ` : 'نامحدود';
    const target = plan.templateId
      ? `قالب ${plan.templateId}`
      : Array.isArray(plan.groupIds) && plan.groupIds.length
        ? `گروه ${plan.groupIds.join('،')}`
        : '⚠️ بی‌گروه';
    rows.push([
      {
        text: `🟡 ${plan.title} | ${volume} | ${target}`,
        callback_data: `plan_edit:${plan.id}`,
      },
      { text: '🔴 حذف', callback_data: `plan_del:${plan.id}` },
    ]);
  }
  rows.push([{ text: '🟢 افزودن بسته جدید', callback_data: 'plan_add' }]);
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// --- کیبورد مدیریت آموزش‌ها (ادمین، اینلاین) ---
function tutorialsAdminInlineKeyboard() {
  const rows = [];
  for (const tutorial of DB.tutorials.values()) {
    rows.push([
      { text: `🟡 ${tutorial.title}`, callback_data: `tut_edit:${tutorial.id}` },
      { text: '🔴 حذف', callback_data: `tut_del:${tutorial.id}` },
    ]);
  }
  rows.push([{ text: '🟢 افزودن آموزش جدید', callback_data: 'tut_add' }]);
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// --- کیبورد نمایش لینک‌های آموزش (مشتری، اینلاین) ---
function tutorialsViewKeyboard() {
  const rows = [];
  for (const tutorial of DB.tutorials.values()) {
    rows.push([{ text: `🔗 ${tutorial.title}`, url: tutorial.url }]);
  }
  return { inline_keyboard: rows };
}

// --- کیبورد مدیریت استخر تست کانفیگ (ادمین، اینلاین) ---
function testConfigsAdminInlineKeyboard() {
  const unusedCount = DB.testConfigs.filter((c) => !c.used).length;
  const rows = [
    [{ text: '🟢 افزودن کانفیگ تست (چندتایی)', callback_data: 'testcfg_add' }],
  ];
  if (unusedCount > 0) {
    rows.push([{ text: '🔴 حذف همه کانفیگ‌های استفاده‌نشده', callback_data: 'testcfg_clear_unused' }]);
  }
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// --- کیبورد مدیریت کیف پول (ادمین، اینلاین) ---
function walletAdminInlineKeyboard() {
  const pendingCount = [...DB.walletRequests.values()].filter(
    (r) => r.status === WALLET_REQUEST_STATUS.PENDING
  ).length;
  return {
    inline_keyboard: [
      [{ text: `📋 درخواست‌های شارژ در انتظار (${pendingCount})`, callback_data: 'walletadmin:pending' }],
      [{ text: '✏️ تغییر دستی موجودی کاربر', callback_data: 'walletadmin:adjust' }],
      backNavRow('admin'),
    ],
  };
}

// --- کیبورد اقدام ادمین روی درخواست شارژ کیف پول (اینلاین) ---
function walletRequestAdminKeyboard(reqId, status) {
  if (status === WALLET_REQUEST_STATUS.PENDING) {
    return {
      inline_keyboard: [
        [
          { text: '🟢 تایید و شارژ', callback_data: `walletreq:approve:${reqId}` },
          { text: '🔴 رد', callback_data: `walletreq:reject:${reqId}` },
        ],
      ],
    };
  }
  return { inline_keyboard: [] };
}

// --- کیبورد مدیریت عضویت اجباری (ادمین، اینلاین) ---
function forceJoinAdminKeyboard() {
  return {
    inline_keyboard: [
      [
        {
          text: DB.forceJoinEnabled ? '🟡 غیرفعال کردن عضویت اجباری' : '🟠 فعال کردن عضویت اجباری',
          callback_data: 'forcejoin_toggle',
        },
      ],
      backNavRow('admin'),
    ],
  };
}

// --- کیبورد عضویت در کانال برای کاربرانی که هنوز عضو نشده‌اند ---
function joinChannelKeyboard(config) {
  const channelId = String(config.CHANNEL_ID || '').replace(/^@/, '');
  const rows = [];
  if (channelId && !channelId.startsWith('-')) {
    rows.push([{ text: '📢 عضویت در کانال', url: `https://t.me/${channelId}` }]);
  }
  rows.push([{ text: '✅ عضو شدم، بررسی مجدد', callback_data: 'checkjoin' }]);
  return { inline_keyboard: rows };
}

// --- کیبورد تایید نهایی سفارش توسط مشتری (اینلاین) ---
function orderConfirmKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ تایید و ثبت سفارش', callback_data: 'order:confirm' }],
      [{ text: '🔴 انصراف از سفارش', callback_data: 'order:cancel' }],
    ],
  };
}

// --- کیبورد اقدامات ادمین روی سفارش (اینلاین) ---
function adminOrderKeyboard(orderId, status) {
  if (status === ORDER_STATUS.PENDING) {
    return {
      inline_keyboard: [
        [
          { text: '🟢 تایید سفارش', callback_data: `admin:confirm:${orderId}` },
          { text: '🔴 رد سفارش', callback_data: `admin:reject:${orderId}` },
        ],
      ],
    };
  }
  if (status === ORDER_STATUS.CONFIRMED) {
    return {
      inline_keyboard: [[{ text: '🔵 ارسال اکانت به مشتری', callback_data: `admin:send:${orderId}` }]],
    };
  }
  return { inline_keyboard: [] };
}

// ============================================================
// ۴.۵ کیبوردهای مربوط به اشتراک
// ============================================================

// لیست اشتراک‌های کاربر به‌صورت دکمه؛ action مشخص می‌کند کلیک چه کاری بکند
// (کانفیگ‌ها انقضا ندارند، پس حجم روی دکمه نمایش داده می‌شود)
function subscriptionsKeyboard(subs, action) {
  const rows = [];
  for (const sub of subs.slice(0, 10)) {
    const badge = sub.status === 'active' ? '🟢' : sub.status === 'on_hold' ? '⏸' : '🔴';
    const detail = sub.expireAt ? formatDate(sub.expireAt) : formatBytes(sub.dataLimitBytes);
    rows.push([
      {
        text: `${badge} ${sub.planTitle || 'اشتراک'} — ${detail}`,
        callback_data: `${action}:${sub.id}`,
      },
    ]);
  }
  if (rows.length === 0) {
    rows.push([{ text: '⚠️ اشتراکی یافت نشد', callback_data: 'noop' }]);
  }
  rows.push(backNavRow('main'));
  return { inline_keyboard: rows };
}

// دکمه‌های زیر پیام وضعیت یک اشتراک
function subscriptionActionsKeyboard(sub) {
  const rows = [
    [{ text: '🔁 بروزرسانی وضعیت', callback_data: `substatus:${sub.id}` }],
    [{ text: '🔄 تمدید همین اشتراک', callback_data: `renew:${sub.id}` }],
  ];
  // دکمه شیشه‌ای «🎓 آموزش‌ها» — فقط وقتی حداقل یک آموزش از پنل ادمین ثبت
  // شده باشد نمایش داده می‌شود. محتوای آن (افزودن/ویرایش/حذف) کاملاً از
  // پنل ادمین → مدیریت آموزش‌ها قابل کنترل است (همان سیستم tutorials موجود).
  if (DB.tutorials.size > 0) {
    rows.push([{ text: '🎓 آموزش‌ها', callback_data: 'tutorials:view' }]);
  }
  rows.push(backNavRow('main'));
  return {
    inline_keyboard: rows,
  };
}

// کیبورد پنل ادمین برای بخش پاسارگارد
function pasarguardAdminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔍 تست اتصال به پنل', callback_data: 'pg:ping' }],
      [{ text: '📋 دریافت لیست گروه‌ها (شناسه‌ها)', callback_data: 'pg:groups' }],
      [{ text: '🧪 ساخت اشتراک آزمایشی برای خودم', callback_data: 'pg:selftest' }],
      backNavRow('admin'),
    ],
  };
}

// ============================================================
// ۵. توابع فرمت پیام
// ============================================================

function formatOrderSummary(order) {
  return (
    `🧾 <b>خلاصه سفارش شما</b>\n\n` +
    `📦 بسته: <b>${escapeHtml(order.planTitle)}</b>\n` +
    `💰 مبلغ: <b>${Number(order.price || 0).toLocaleString()} تومان</b>\n` +
    `👤 نام: <b>${escapeHtml(order.customerName)}</b>\n` +
    `💳 کارت مقصد: <b>${escapeHtml(order.cardLabel)}</b>\n` +
    `🖼 رسید: ${order.receiptFileId ? '✅ دریافت شد' : '❌ ارسال نشده'}\n\n` +
    `در صورت تایید اطلاعات، دکمه «✅ تایید و ثبت سفارش» را بزنید.`
  );
}

function formatAdminOrderMessage(order) {
  const quantity = Number(order.quantity) || 1;
  const paidViaLabel =
    order.paidVia === 'wallet'
      ? '💰 کیف پول (پرداخت‌شده)'
      : order.paidVia === 'gateway'
        ? '🌐 درگاه آنلاین'
        : `💳 کارت به کارت${order.cardLabel && order.cardLabel !== '—' ? ` — ${escapeHtml(order.cardLabel)}` : ''}`;

  return (
    `🛍️ <b>سفارش جدید ثبت شد!</b>${order.kind === ORDER_KIND.RENEW ? ' (تمدید)' : ''}\n\n` +
    `👤 نام مشتری: ${escapeHtml(order.customerName || '—')}\n` +
    `🆔 Telegram ID: <code>${order.userId}</code>\n` +
    `📱 Username: ${order.username ? `@${escapeHtml(order.username)}` : '—'}\n` +
    `📦 شماره سفارش: <b>#${order.id}</b>\n` +
    `🛒 محصولات: ${escapeHtml(order.planTitle || '—')} × ${quantity}\n` +
    `💰 مبلغ نهایی: <b>${Number(order.price || 0).toLocaleString()} تومان</b>\n` +
    `💳 روش پرداخت: ${paidViaLabel}\n` +
    `🕐 زمان ثبت سفارش: ${new Date(order.createdAt || Date.now()).toLocaleString('fa-IR')}\n` +
    `✅ تایید نهایی مشتری: انجام شد\n` +
    `📌 وضعیت سفارش: ${formatOrderStatus(order.status)}` +
    `${order.pgUsername ? `\n🧾 نام کاربری پنل: <code>${escapeHtml(order.pgUsername)}</code>` : ''}` +
    `${order.lastError ? `\n⚠️ آخرین خطا: ${escapeHtml(String(order.lastError).slice(0, 200))}` : ''}`
  );
}

function formatOrderStatus(status) {
  return STATUS_LABEL[status] || status;
}

function formatWalletRequestMessage(req) {
  return (
    `💰 <b>درخواست شارژ کیف پول</b> #${req.id}\n\n` +
    `🆔 آیدی: <code>${req.userId}</code>\n` +
    `👤 نام: ${escapeHtml(req.customerName || '-')}\n` +
    `🔗 یوزرنیم: ${req.username ? '@' + req.username : '—'}\n\n` +
    `💵 مبلغ: <b>${req.amount.toLocaleString()} تومان</b>\n` +
    `💳 کارت مقصد: ${escapeHtml(req.cardLabel || '-')}\n\n` +
    `📅 تاریخ ثبت: ${new Date(req.createdAt).toLocaleString('fa-IR')}\n` +
    `📌 وضعیت: ${WALLET_STATUS_LABEL[req.status] || req.status}`
  );
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================
// ۶. هندلرهای اصلی
// ============================================================

async function handleStart(message, config, env) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  registerUser(message.from);
  await dbUpsertUser(env, message.from);
  resetSession(chatId);

  let welcome =
    `👋 سلام <b>${escapeHtml(message.from.first_name || '')}</b>!\n\n` +
    `به <b>${escapeHtml(config.SHOP_NAME)}</b> خوش آمدید.`;

  if (config.WELCOME_EXTRA_TEXT) {
    welcome += `\n\n${escapeHtml(config.WELCOME_EXTRA_TEXT)}`;
  }

  welcome += `\n\nاز منوی زیر یکی از گزینه‌ها را انتخاب کنید:`;

  await sendMessage(config.BOT_TOKEN, chatId, welcome, { reply_markup: mainReplyKeyboard(config) });

  if (isAdmin(userId, config)) {
    let adminNote = '🛠 شما ادمین هستید. برای ورود به پنل مدیریت از دستور /admin استفاده کنید.';
    if (!isPersistenceEnabled(env)) {
      adminNote += '\n\n⚠️ توجه: حافظه دائمی (KV) وصل نیست — تغییرات پنل ادمین با ری‌استارت Worker از بین می‌روند.';
    }
    await sendMessage(config.BOT_TOKEN, chatId, adminNote);
  }

  // اگر کاربر از طریق لینک عمیق «start=shop» وارد شده (مثلاً با زدن دکمه
  // پیش‌فرض تبلیغ کانال)، منوی «خرید اشتراک» بلافاصله بعد از خوش‌آمدگویی باز می‌شود.
  const startPayloadMatch = (message.text || '').trim().match(/^\/start(?:@[a-zA-Z0-9_]+)?\s+(shop|buy)$/i);
  if (startPayloadMatch) {
    await handleBuyStart(chatId, config);
  }
}

function registerUser(from) {
  const id = String(from.id);
  const existing = memGet(DB.users, id) || { id, orders: [], walletBalance: 0 };
  memSet(DB.users, id, {
    ...existing,
    username: from.username || null,
    firstName: from.first_name || '',
    lastName: from.last_name || '',
  });
}

// ---------- دعوت دوستان ----------
// Attribution is accepted only on first private contact. The referral stays
// pending until the existing membership gate allows access. No wallet rewards.
// Fields live inside DB.users and use the existing KV snapshot persistence.
function captureReferral(message, config) {
  if (!message.from || message.from.is_bot || message.chat.type !== 'private') return;
  const id = String(message.from.id);
  const isNew = !DB.users.has(id);
  registerUser(message.from);
  if (!isNew || !config.REFERRAL_ENABLED) return;
  const match = (message.text || '').trim().match(/^\/start(?:@[a-zA-Z0-9_]+)?\s+ref_([1-9]\d{0,19})$/i);
  if (!match || match[1] === id || !DB.users.has(match[1])) return;
  const user = DB.users.get(id);
  user.pendingReferrerId = match[1];
  user.referralStartedAt = Date.now();
}

function confirmReferral(userId, config) {
  if (!config.REFERRAL_ENABLED) return null;
  const id = String(userId);
  const user = DB.users.get(id);
  if (!user || user.referredBy || !user.pendingReferrerId) return null;
  const referrerId = String(user.pendingReferrerId);
  if (referrerId === id || !DB.users.has(referrerId)) return null;
  user.referredBy = referrerId;
  user.referredAt = Date.now();
  delete user.pendingReferrerId;
  return referrerId;
}

// تایید دعوت را ثبت می‌کند (بدون جایزه فوری). از این پس، به‌ازای هر خریدی
// که این کاربر انجام دهد، پورسانتی خودکار به دعوت‌کننده تعلق می‌گیرد
// (به تابع creditReferralCommission در زمان تحویل سفارش نگاه کنید).
async function confirmReferralAndReward(userId, config, env) {
  confirmReferral(userId, config);
}

// ---------- پورسانت خرید دعوت دوست ----------
function listReferralRewards(referrerId) {
  const result = [];
  for (const reward of DB.referralRewards.values()) {
    if (String(reward.referrerId) === String(referrerId)) result.push(reward);
  }
  result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return result;
}

// به‌ازای هر خرید موفق (تحویل‌شده) یک کاربر که از طریق لینک دعوت شخص دیگری
// آمده، درصدی از مبلغ همان خرید به‌صورت خودکار به کیف پول دعوت‌کننده
// واریز می‌شود؛ نیازی به تایید دستی ادمین نیست.
async function creditReferralCommission(env, config, order) {
  if (!config.REFERRAL_ENABLED || !config.REFERRAL_COMMISSION_ENABLED) return;
  const price = Number(order.price) || 0;
  if (price <= 0) return;

  const buyer = DB.users.get(String(order.userId));
  const referrerId = buyer && buyer.referredBy ? String(buyer.referredBy) : null;
  if (!referrerId || referrerId === String(order.userId)) return;

  const percent = config.REFERRAL_COMMISSION_PERCENT;
  const amount = Math.floor((price * percent) / 100);
  if (amount <= 0) return;

  const balance = addWalletBalance(referrerId, amount);
  await dbSyncUserWallet(env, referrerId, balance);

  const commission = {
    id: newId('rwd'),
    referrerId,
    refereeId: String(order.userId),
    orderId: order.id,
    amount,
    percent,
    createdAt: Date.now(),
  };
  memSet(DB.referralRewards, commission.id, commission);

  await dbLog(env, 'info', 'referral', `commission credited (${amount} تومان)`, { percent }, {
    telegramId: referrerId,
    orderId: order.id,
  });

  const referee = DB.users.get(String(order.userId));
  const refereeLabel = referee ? formatUserIdentityLine(referee) : `<code>${order.userId}</code>`;

  await sendMessage(config.BOT_TOKEN, referrerId,
    '💰 <b>پورسانت دعوت دوست</b>\n\n' +
    `دوست دعوت‌شده شما (${refereeLabel}) یک خرید انجام داد.\n` +
    `${percent}٪ از مبلغ خرید (<b>${amount.toLocaleString()} تومان</b>) به کیف پول شما اضافه شد. 🎉`
  ).catch(() => {});
}

function referralCount(userId) {
  let total = 0;
  for (const user of DB.users.values()) {
    if (String(user.referredBy || '') === String(userId)) total += 1;
  }
  return total;
}

// نمایش اطلاعات یک کاربر: نام، آیدی (یوزرنیم) و آیدی عددی
function formatUserIdentityLine(user) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const namePart = name ? escapeHtml(name) : '—';
  const usernamePart = user.username ? `@${escapeHtml(user.username)}` : '—';
  return `${namePart} | ${usernamePart} | <code>${user.id}</code>`;
}

function listReferredUsers(referrerId) {
  const result = [];
  for (const user of DB.users.values()) {
    if (String(user.referredBy || '') === String(referrerId)) result.push(user);
  }
  result.sort((a, b) => (a.referredAt || 0) - (b.referredAt || 0));
  return result;
}

// خروجی: متن کامل لیست همه دعوت‌ها گروه‌بندی‌شده بر اساس دعوت‌کننده (برای ادمین)
function buildAllReferralsText() {
  const byReferrer = new Map();
  for (const user of DB.users.values()) {
    if (!user.referredBy) continue;
    const key = String(user.referredBy);
    if (!byReferrer.has(key)) byReferrer.set(key, []);
    byReferrer.get(key).push(user);
  }
  if (byReferrer.size === 0) return '';
  const lines = ['📋 <b>لیست کامل دعوت‌شدگان</b>\n'];
  for (const [referrerId, invitees] of byReferrer.entries()) {
    const referrer = DB.users.get(referrerId);
    const referrerLabel = referrer ? formatUserIdentityLine(referrer) : `<code>${referrerId}</code>`;
    lines.push(`👤 دعوت‌کننده: ${referrerLabel} — <b>${invitees.length}</b> نفر`);
    invitees
      .sort((a, b) => (a.referredAt || 0) - (b.referredAt || 0))
      .forEach((u, i) => lines.push(`   ${i + 1}. ${formatUserIdentityLine(u)}`));
    lines.push('');
  }
  return lines.join('\n').trim();
}

// شکستن متن بلند به چند پیام برای رعایت محدودیت طول پیام تلگرام
function chunkText(text, maxLen = 3500) {
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function formatInviteText(config, link) {
  const template = String(config.INVITE_TEXT || DEFAULTS.INVITE_TEXT);
  const text = template.replace(/\{(shop|link)\}/g, (_, key) => key === 'shop' ? config.SHOP_NAME : link);
  return template.includes('{link}') ? text : `${text}\n\n${link}`;
}

async function handleInviteMenu(message, config) {
  const chatId = message.chat.id;
  if (message.chat.type !== 'private') {
    return sendMessage(config.BOT_TOKEN, chatId, '👥 برای دریافت لینک دعوت، در گفت‌وگوی خصوصی ربات /invite را بفرستید.');
  }
  if (!config.REFERRAL_ENABLED) {
    return sendMessage(config.BOT_TOKEN, chatId, '⏸ دعوت دوستان در حال حاضر غیرفعال است.');
  }
  registerUser(message.from);
  // Read the actual username: no hardcoded bot name or extra deployment setting.
  let me;
  try { me = await getMe(config.BOT_TOKEN); } catch (_) { me = null; }
  const username = me && me.ok && me.result && me.result.username;
  if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
    return sendMessage(config.BOT_TOKEN, chatId, '⚠️ دریافت لینک دعوت ممکن نشد. کمی بعد دوباره امتحان کنید.');
  }
  const link = `https://t.me/${username}?start=ref_${message.from.id}`;
  const invitation = formatInviteText(config, link);
  const shareText = invitation.split(link).join('').trim();

  const invitees = listReferredUsers(message.from.id);
  const MAX_SHOWN = 30;
  let inviteesBlock = '';
  if (invitees.length > 0) {
    const shown = invitees.slice(0, MAX_SHOWN)
      .map((u, i) => `${i + 1}. ${formatUserIdentityLine(u)}`)
      .join('\n');
    const more = invitees.length > MAX_SHOWN
      ? `\n… و ${invitees.length - MAX_SHOWN} نفر دیگر`
      : '';
    inviteesBlock = `\n\n👤 <b>لیست دوستان دعوت‌شده:</b>\n${shown}${more}\n`;
  }

  let rewardBlock = '';
  if (config.REFERRAL_COMMISSION_ENABLED) {
    const commissions = listReferralRewards(message.from.id);
    const totalEarned = commissions.reduce((sum, c) => sum + (c.amount || 0), 0);
    rewardBlock =
      `\n💰 به‌ازای هر خرید دوستان دعوت‌شده: <b>${config.REFERRAL_COMMISSION_PERCENT}٪</b> پورسانت مستقیم به کیف پول شما\n` +
      `💵 مجموع پورسانت دریافتی: <b>${totalEarned.toLocaleString()} تومان</b>${
        commissions.length ? ` (از ${commissions.length} خرید)` : ''
      }\n`;
  }

  return sendMessage(config.BOT_TOKEN, chatId,
    '👥 <b>دعوت دوستان</b>\n\n' +
    `✅ تعداد دوستان دعوت‌شده: <b>${invitees.length}</b>\n` +
    `${rewardBlock}` +
    `${inviteesBlock}\n` +
    `${escapeHtml(invitation)}\n\n` +
    'ℹ️ فقط کاربران جدیدی که با لینک شما ربات را شروع کنند و از مرحله عضویت عبور کنند، ثبت می‌شوند. دعوت تکراری یا دعوت خودتان شمرده نمی‌شود.',
    { reply_markup: { inline_keyboard: [[{
      text: '📤 ارسال لینک برای دوستان',
      url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`,
    }]] } }
  );
}

async function handleReferralAdminMenu(chatId, config) {
  let confirmed = 0;
  let pending = 0;
  for (const user of DB.users.values()) {
    if (user.referredBy) confirmed += 1;
    else if (user.pendingReferrerId) pending += 1;
  }

  let commissionCount = 0;
  let commissionTotal = 0;
  for (const c of DB.referralRewards.values()) {
    commissionCount += 1;
    commissionTotal += c.amount || 0;
  }

  await sendMessage(config.BOT_TOKEN, chatId,
    '👥 <b>مدیریت دعوت دوستان</b>\n\n' +
    `وضعیت دعوت: <b>${config.REFERRAL_ENABLED ? 'فعال ✅' : 'غیرفعال ⏸'}</b>\n` +
    `دعوت‌های ثبت‌شده: <b>${confirmed}</b>\nدر انتظار ورود: <b>${pending}</b>\n\n` +
    `💰 وضعیت پورسانت خرید: <b>${config.REFERRAL_COMMISSION_ENABLED ? 'فعال ✅' : 'غیرفعال ⏸'}</b>\n` +
    `💰 درصد پورسانت هر خرید: <b>${config.REFERRAL_COMMISSION_PERCENT}٪</b>\n` +
    `💵 مجموع پورسانت پرداخت‌شده: <b>${commissionTotal.toLocaleString()} تومان</b> (${commissionCount} خرید)\n\n` +
    `عنوان دکمه: ${escapeHtml(config.BTN_INVITE_LABEL)}\n\n` +
    `متن دعوت:\n${escapeHtml(config.INVITE_TEXT)}\n\n` +
    'متغیر {link} با لینک اختصاصی و {shop} با نام فروشگاه جایگزین می‌شود. اگر {link} را حذف کنید، لینک خودکار به انتهای متن اضافه می‌شود.\n\n' +
    'به‌ازای هر خریدی که دوست دعوت‌شده انجام دهد، درصد تعیین‌شده از مبلغ همان خرید بلافاصله و بدون نیاز به تایید ادمین به کیف پول دعوت‌کننده واریز می‌شود.',
    { reply_markup: { inline_keyboard: [
      [{ text: config.REFERRAL_ENABLED ? '⏸ غیرفعال کردن دعوت' : '✅ فعال کردن دعوت', callback_data: 'referraladmin:toggle' }],
      [{ text: config.REFERRAL_COMMISSION_ENABLED ? '⏸ غیرفعال کردن پورسانت' : '✅ فعال کردن پورسانت', callback_data: 'referraladmin:toggle_commission' }],
      [{ text: '✏️ ویرایش درصد پورسانت', callback_data: 'referraladmin:edit_commission_percent' }],
      [{ text: '✏️ ویرایش متن دعوت', callback_data: 'setting_edit:INVITE_TEXT' }],
      [{ text: '✏️ ویرایش نام دکمه', callback_data: 'setting_edit:BTN_INVITE_LABEL' }],
      [{ text: '🔄 بروزرسانی آمار', callback_data: 'referraladmin:menu' }],
      backNavRow('admin'),
    ] } }
  );

  const fullListText = buildAllReferralsText();
  if (!fullListText) return;
  const chunks = chunkText(fullListText);
  for (const part of chunks) {
    await sendMessage(config.BOT_TOKEN, chatId, part);
  }
}

async function handleMainMenuText(message, config, env) {
  const chatId = message.chat.id;
  const text = message.text;

  // متن دکمه‌ها ممکن است توسط ادمین تغییر کرده باشد؛ دستورات اسلش همیشه به‌عنوان میان‌بر ثابت کار می‌کنند
  if (text === config.BTN_SHOP_LABEL || text === '/shop' || text === '/buy') {
    return handleBuyStart(chatId, config);
  }
  if (text === config.BTN_MYORDERS_LABEL || text === '/myorders' || text === '/mysubs') {
    return handleMySubscriptions(chatId, message.from.id, config);
  }
  // تاریخچه سفارش‌ها (فاکتورها) — جدا از لیست اشتراک‌ها
  if (text === '/orders') {
    return handleMyOrders(chatId, message.from.id, config);
  }
  if (text === config.BTN_RENEW_LABEL || text === '/renew') {
    return handleRenewMenu(chatId, message.from.id, config);
  }
  if (text === config.BTN_WALLET_LABEL || text === '/wallet') {
    return handleWalletMenu(chatId, message.from.id, config);
  }
  if (text === config.BTN_SUPPORT_LABEL || text === '/support') {
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      `🎫 <b>پشتیبانی</b>\n\nبرای ارتباط با پشتیبانی به آیدی زیر پیام دهید:\n👤 @${config.SUPPORT_USERNAME}\n\n` +
        'اگر مشکل فنی در اتصال دارید، شناسه اشتراک خود را هم برای ما بفرستید.'
    );
  }
  if (text === config.BTN_INVITE_LABEL || text === '/invite') {
    return handleInviteMenu(message, config);
  }
  if (text === config.BTN_TESTCONFIG_LABEL || text === '/testconfig') {
    return handleTestConfigRequest(chatId, message.from.id, config, env);
  }
  return false; // یعنی متن مرتبط با منوی اصلی نبود
}

async function handleMyOrders(chatId, userId, config) {
  const userOrders = [...DB.orders.values()].filter((o) => String(o.userId) === String(userId));
  if (userOrders.length === 0) {
    return sendMessage(config.BOT_TOKEN, chatId, '📭 شما تاکنون هیچ سفارشی ثبت نکرده‌اید.');
  }
  let text = `📦 <b>سفارش‌های شما</b>\n\n`;
  for (const o of userOrders.slice(-15).reverse()) {
    text += `#️⃣ ${o.id} | ${escapeHtml(o.planTitle)} | ${Number(o.price || 0).toLocaleString()} تومان | ${formatOrderStatus(o.status)}\n`;
  }
  return sendMessage(config.BOT_TOKEN, chatId, text);
}

// ---------- کیف پول (مشتری) ----------

async function handleWalletMenu(chatId, userId, config) {
  const balance = getWallet(userId);
  const text =
    `💰 <b>کیف پول شما</b>\n\n` +
    `موجودی فعلی: <b>${balance.toLocaleString()} تومان</b>\n\n` +
    'هنگام خرید بسته می‌توانید از موجودی کیف پول برای پرداخت استفاده کنید، یا ابتدا کیف پول خود را شارژ کنید.';
  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: walletMenuKeyboard() });
}

async function handleWalletTopupStart(callbackQuery, config) {
  const chatId = callbackQuery.message.chat.id;
  const session = getSession(chatId);
  session.step = 'awaiting_wallet_amount';
  session.data = {};
  setSession(chatId, session);
  return sendMessage(config.BOT_TOKEN, chatId, '💵 مبلغ مورد نظر برای شارژ کیف پول را به تومان (فقط عدد) ارسال کنید:');
}

async function handleWalletCardSelection(callbackQuery, cardId, config) {
  const chatId = callbackQuery.message.chat.id;
  const card = memGet(DB.cards, cardId);
  if (!card) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ این کارت دیگر معتبر نیست.', true);
  }
  const session = getSession(chatId);
  if (!session.data || !session.data.amount) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⚠️ ابتدا مبلغ شارژ را وارد کنید.', true);
  }
  session.data.cardId = card.id;
  session.data.cardLabel = `${card.bankName} - ${card.number} (${card.holder || ''})`;
  session.step = 'awaiting_wallet_receipt';
  session.data.receiptDeadline = Date.now() + 30 * 60 * 1000;
  setSession(chatId, session);

  await editMessageText(
    config.BOT_TOKEN,
    chatId,
    callbackQuery.message.message_id,
    `💳 کارت انتخاب‌شده:\n<code>${card.number}</code>\n${card.bankName}\n\n` +
      `پس از واریز مبلغ ${session.data.amount.toLocaleString()} تومان، عکس رسید پرداخت را ارسال کنید:`
  );
}

// ---------- روش پرداخت سفارش (کارت / درگاه / کیف پول) ----------

// یک سفارش تازه از داده‌های session می‌سازد (خرید جدید یا تمدید)
// planSnapshot نگه داشته می‌شود تا اگر ادمین بسته را حذف/ویرایش کرد، تحویل سفارش خراب نشود
//
// ⚠️ همه فیلدهای اختیاری سفارش از همین‌جا با مقدار پیش‌فرض ساخته می‌شوند
// (note، subscriptionId، pgUsername، paymentId، lastError، refunded).
// دلیلش این است که این فیلدها بعداً در مراحل دیگر مقدار می‌گیرند و اگر اینجا
// تعریف نشده باشند، هر ابزار type-check روی JS (از جمله ادیتور داشبورد
// Cloudflare) روی خط‌هایی مثل «order.note = ...» خطا می‌دهد.
function buildOrderFromSession(session, from, chatId, extra = {}) {
  ensurePlansLoaded();
  const plan = DB.plans.find((p) => p.id === session.data.planId) || null;
  return {
    id: orderSeq++,
    userId: from.id,
    chatId,
    username: from.username || null,
    customerName: session.data.customerName || `${from.first_name || ''} ${from.last_name || ''}`.trim(),
    planId: session.data.planId,
    planTitle: session.data.planTitle,
    planSnapshot: plan ? { ...plan } : null,
    price: session.data.price,
    kind: session.data.kind || ORDER_KIND.NEW,
    renewOf: session.data.renewOf || null,
    cardId: null,
    cardLabel: '—',
    receiptFileId: null,
    paidVia: null,
    status: ORDER_STATUS.PENDING,
    // فیلدهایی که در مراحل بعدی پر می‌شوند
    note: null,
    subscriptionId: null,
    pgUsername: null,
    paymentId: null,
    lastError: null,
    refunded: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
}

// رکورد پرداخت را در KV و D1 ثبت می‌کند
// paymentId ثابت (مثل pay_card_12) باعث می‌شود تایید بعدی همان رکورد را آپدیت کند
// و رکورد تکراری ساخته نشود (ایندکس یکتا روی provider+reference).
async function recordPayment(env, order, provider, verification, paymentId = null) {
  const payment = {
    id: paymentId || newId('pay'),
    orderId: order.id,
    userId: order.userId,
    provider: provider.id,
    amount: verification && verification.amount ? verification.amount : order.price,
    currency: 'IRT',
    status: verification && verification.ok ? PAYMENT_STATUS.VERIFIED : PAYMENT_STATUS.PENDING,
    reference: (verification && verification.reference) || null,
    raw: (verification && verification.raw) || {},
    verifiedAt: verification && verification.ok ? Date.now() : null,
    createdAt: Date.now(),
  };
  memSet(DB.payments, payment.id, payment);
  await dbSavePayment(env, payment);
  return payment;
}

async function handlePaymentMethodSelection(callbackQuery, method, config, env) {
  const chatId = callbackQuery.message.chat.id;
  const fromId = callbackQuery.from.id;
  const messageId = callbackQuery.message.message_id;
  const session = getSession(chatId);

  if (!session.data || !session.data.planId) {
    return answerCallbackQuery(
      config.BOT_TOKEN,
      callbackQuery.id,
      '⚠️ اطلاعات سفارش ناقص است. دوباره از «🛒 خرید اشتراک» شروع کنید.',
      true
    );
  }

  // ---------- کارت به کارت ----------
  if (method === 'card') {
    return editMessageText(config.BOT_TOKEN, chatId, messageId, '💳 لطفاً یکی از کارت‌های زیر را برای واریز انتخاب کنید:', {
      reply_markup: cardsKeyboard(),
    });
  }

  // ---------- درگاه آنلاین ----------
  if (method === 'gateway') {
    const provider = getPaymentProvider(gatewayProvider.id);
    if (!provider || !isGatewayEnabled(config)) {
      return editMessageText(config.BOT_TOKEN, chatId, messageId, '⚠️ درگاه پرداخت آنلاین در حال حاضر فعال نیست.');
    }

    const order = buildOrderFromSession(session, callbackQuery.from, chatId, { paidVia: provider.id });
    memSet(DB.orders, order.id, order);
    await dbUpsertUser(env, callbackQuery.from);
    await dbSaveOrder(env, order);

    const started = await provider.start({ env, config, order, params: {} });
    if (!started || started.error || !started.redirectUrl) {
      // سفارش را می‌بندیم ولی session را نگه می‌داریم تا کاربر بتواند
      // بی‌دردسر روش پرداخت دیگری انتخاب کند.
      order.status = ORDER_STATUS.REJECTED;
      order.note = 'gateway_unavailable';
      order.updatedAt = Date.now();
      memSet(DB.orders, order.id, order);
      await dbSaveOrder(env, order);
      await dbLog(env, 'warn', 'payment', 'gateway start unavailable', {}, { telegramId: fromId, orderId: order.id });

      return editMessageText(
        config.BOT_TOKEN,
        chatId,
        messageId,
        `⚠️ ${escapeHtml((started && started.error) || 'شروع پرداخت آنلاین ممکن نشد.')}\n\n` +
          'روش پرداخت دیگری را انتخاب کنید:',
        { reply_markup: paymentMethodKeyboard(getWallet(fromId), config) }
      );
    }

    resetSession(chatId);

    return editMessageText(
      config.BOT_TOKEN,
      chatId,
      messageId,
      `🌐 برای پرداخت سفارش <b>#${order.id}</b> روی دکمه زیر بزنید.\n` +
        'پس از پرداخت موفق، اشتراک به‌صورت خودکار ساخته و ارسال می‌شود.',
      { reply_markup: { inline_keyboard: [[{ text: '💳 پرداخت آنلاین', url: started.redirectUrl }]] } }
    );
  }

  // ---------- کیف پول ----------
  if (method === 'wallet') {
    const price = Number(session.data.price) || 0;
    const balance = getWallet(fromId);

    if (balance < price) {
      return editMessageText(
        config.BOT_TOKEN,
        chatId,
        messageId,
        `⚠️ موجودی کیف پول شما کافی نیست.\n\n` +
          `موجودی فعلی: ${balance.toLocaleString()} تومان\n` +
          `مبلغ بسته: ${price.toLocaleString()} تومان\n\n` +
          'می‌توانید ابتدا کیف پول خود را شارژ کنید یا از پرداخت کارتی استفاده کنید.',
        { reply_markup: walletMenuKeyboard() }
      );
    }

    const provider = getPaymentProvider(walletProvider.id);
    const order = buildOrderFromSession(session, callbackQuery.from, chatId, { paidVia: provider.id });

    // Verify → کسر از کیف پول
    const verification = await provider.verify({ env, config, order, params: {} });
    if (!verification.ok) {
      return answerCallbackQuery(
        config.BOT_TOKEN,
        callbackQuery.id,
        `⚠️ ${verification.reason || 'پرداخت از کیف پول انجام نشد.'}`,
        true
      );
    }

    order.status = ORDER_STATUS.CONFIRMED;
    memSet(DB.orders, order.id, order);

    const user = memGet(DB.users, String(fromId)) || { id: String(fromId), orders: [], walletBalance: 0 };
    user.orders = [...(user.orders || []), order.id];
    user.lastOrderName = order.customerName;
    memSet(DB.users, String(fromId), user);

    resetSession(chatId);

    await dbUpsertUser(env, callbackQuery.from);
    await dbSaveOrder(env, order);
    await recordPayment(env, order, provider, verification);
    await dbSyncUserWallet(env, fromId, getWallet(fromId));

    // ⚡ اعلان فوری به ادمین — همان لحظه‌ای که مشتری سفارش را تایید کرد،
    // بدون اینکه منتظر ساخت اشتراک روی پنل بمانیم. اگر ارسال به ادمین
    // خطا بدهد، هیچ تاثیری روی ادامه سفارش مشتری ندارد.
    const notified = notifyAdmins(env, config, {
      text: formatAdminOrderMessage(order),
      replyMarkup: adminOrderKeyboard(order.id, order.status),
      orderId: order.id,
    });

    await editMessageText(
      config.BOT_TOKEN,
      chatId,
      messageId,
      `✅ پرداخت سفارش <b>#${order.id}</b> از کیف پول انجام شد.\n⏳ در حال ساخت اشتراک روی سرور…`
    );

    await notified;

    // Verify → PasarGuard API → Create Subscription → Save in D1 → Send to Telegram
    return provisionOrder(env, config, order, { notifyChatId: chatId });
  }
}

// ---------- تست کانفیگ رایگان (فقط یک‌بار برای هر مشتری) ----------

async function handleTestConfigRequest(chatId, userId, config, env) {
  const idStr = String(userId);
  const user = memGet(DB.users, idStr) || { id: idStr, orders: [], walletBalance: 0 };

  if (user.testConfigClaimed) {
    return sendMessage(config.BOT_TOKEN, chatId,
      '<b>شما قبلاً تست کانفیگ دریافت کرده‌اید.</b>\n' +
      'هر مشتری فقط یک‌بار تست کانفیگ رایگان دریافت می‌کند.\n\n' +
      `پشتیبانی: @${config.SUPPORT_USERNAME}`
    );
  }

  if (!pgConfigured(config)) {
    return sendMessage(config.BOT_TOKEN, chatId,
      'سرویس تست کانفیگ در حال حاضر فعال نیست.\n' +
      `پشتیبانی: @${config.SUPPORT_USERNAME}`
    );
  }

  try {
    // گروه‌های پنل: 24 = All, 25 = 222
    // اولویت: 1) PG_GROUP_IDS از Cloudflare  2) از پنل  3) فالبک [24, 25]
    let groupIds = [];
    if (config.PG_GROUP_IDS) {
      groupIds = String(config.PG_GROUP_IDS).split(',').map(Number).filter(Boolean);
    } else {
      const allGroups = await pgGetGroups(env, config); // [{id, name}]
      groupIds = allGroups.map(g => g.id);
    }
    if (groupIds.length === 0) {
      groupIds = [24, 25]; // fallback ثابت: All + 222
    }
    console.log('[TEST-CFG] groupIds:', JSON.stringify(groupIds));

    const testPlan = {
      id: 'test_50mb',
      title: 'Test 50MB',
      gb: 50 / 1024,
      days: 0,
      groupIds,
      templateId: null,
      onHold: false,
    };
    const seq = Date.now();
    console.log('[TEST-CFG] groupIds:', JSON.stringify(groupIds));
    const provisioned = await pgProvision(env, config, {
      plan: testPlan, telegramId: userId, seq,
      note: `Test 50MB | ${idStr}`,
    });

    user.testConfigClaimed = true;
    user.testConfigClaimedAt = Date.now();
    memSet(DB.users, idStr, user);

    const subUrl = provisioned.subscriptionUrl || '';
    return sendMessage(config.BOT_TOKEN, chatId,
      `<b>کانفیگ تست رایگان شما (50 مگابایت)</b>\n\n` +
      `لینک اشتراک:\n<code>${escapeHtml(subUrl)}</code>\n\n` +
      `حجم: <b>50 مگابایت</b> | بدون تاریخ انقضا\n` +
      'این تست فقط <b>یک‌بار</b> ارسال شد. امکان دریافت مجدد وجود ندارد.'
    );
  } catch (pgErr) {
    console.warn('[TEST-CFG] error:', String(pgErr), pgErr && pgErr.status);
    return sendMessage(config.BOT_TOKEN, chatId,
      'در ساخت کانفیگ تست مشکلی پیش آمد. لطفاً کمی بعد دوباره تلاش کنید.\n' +
      `پشتیبانی: @${config.SUPPORT_USERNAME}`
    );
  }
}

async function handlePgGroupsCommand(chatId, config, env) {
  if (!pgConfigured(config)) {
    return sendMessage(config.BOT_TOKEN, chatId, 'پنل تنظیم نشده است.');
  }
  const paths = ['/api/user_group', '/api/user_template', '/api/group'];
  let msg = '<b>گروه‌های پنل:</b>\n';
  for (const p of paths) {
    try {
      const d = await pgFetch(env, config, p);
      msg += `\n<b>${p}</b>:\n<code>${escapeHtml(JSON.stringify(d).slice(0, 600))}</code>\n`;
    } catch (e) {
      msg += `\n<b>${p}</b>: خطا - ${escapeHtml(String(e))}\n`;
    }
  }
  return sendMessage(config.BOT_TOKEN, chatId, msg);
}

async function handleProductSelection(callbackQuery, config) {
  const chatId = callbackQuery.message.chat.id;
  await editMessageText(config.BOT_TOKEN, chatId, callbackQuery.message.message_id, '💎 یکی از سرویس‌های ما را انتخاب کنید:', {
    reply_markup: plansKeyboard(config),
  });
}

async function handlePlanSelection(callbackQuery, planId, config) {
  const chatId = callbackQuery.message.chat.id;
  ensurePlansLoaded();
  const plan = DB.plans.find((p) => p.id === planId);
  if (!plan) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ این بسته یافت نشد.', true);
  }

  const session = getSession(chatId);
  const kind = (session.data && session.data.kind) || ORDER_KIND.NEW;
  const renewOf = (session.data && session.data.renewOf) || null;
  const knownName = (session.data && session.data.customerName) || '';

  session.data = {
    planId: plan.id,
    planTitle: plan.title,
    price: plan.price,
    kind,
    renewOf,
    customerName: knownName,
  };

  const volume = Number(plan.gb) > 0 ? `${plan.gb} گیگابایت` : 'حجم نامحدود';
  const duration = Number(plan.days) > 0 ? `${plan.days} روز` : 'بدون تاریخ انقضا';
  const summary =
    `✅ بسته انتخابی: <b>${volume}</b>\n` +
    `📅 ${duration}\n` +
    `💰 مبلغ: <b>${Number(plan.price).toLocaleString()} تومان</b>`;

  // در تمدید، نام مشتری را از قبل داریم و مستقیم به مرحله پرداخت می‌رویم
  if (kind === ORDER_KIND.RENEW && knownName) {
    session.step = 'awaiting_payment_method';
    session.startedAt = Date.now();
    setSession(chatId, session);
    return editMessageText(config.BOT_TOKEN, chatId, callbackQuery.message.message_id, `${summary}\n\n💰 روش پرداخت را انتخاب کنید:`, {
      reply_markup: paymentMethodKeyboard(getWallet(callbackQuery.from.id), config),
    });
  }

  session.step = 'awaiting_name';
  session.startedAt = Date.now();
  setSession(chatId, session);
  return editMessageText(
    config.BOT_TOKEN,
    chatId,
    callbackQuery.message.message_id,
    `${summary}\n\n👤 لطفاً نام و نام خانوادگی خود را ارسال کنید:`
  );
}

async function handleOrderStepMessage(message, config, env) {
  const chatId = message.chat.id;
  const session = getSession(chatId);
  const text = message.text || '';

  // ✅ بررسی timeout سفارش — مشتری 15 دقیقه (یک ربع) فرصت دارد سفارش را ثبت کند
  // (این چک فقط تا قبل از انتخاب کارت اعمال می‌شود؛ از لحظه‌ای که کارت انتخاب
  // شد و مهلت اختصاصی 30 دقیقه‌ای ارسال رسید — receiptDeadline — تنظیم شد،
  // دیگر این تایم‌اوت 15 دقیقه‌ای اعمال نمی‌شود تا با وعده «30 دقیقه فرصت
  // دارید» که به مشتری داده شده تناقض نداشته باشد.)
  const ORDER_SESSION_TIMEOUT_MS = 15 * 60 * 1000;
  if (
    !session.data.receiptDeadline &&
    session.startedAt &&
    Date.now() - session.startedAt > ORDER_SESSION_TIMEOUT_MS
  ) {
    resetSession(chatId);
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      '⏰ مهلت ثبت سفارش شما (15 دقیقه) به پایان رسید. لطفاً دوباره از منوی «🛙 فروشگاه» اقدام کنید.'
    );
  }

  switch (session.step) {
    case 'awaiting_name': {
      if (!text.trim()) {
        return sendMessage(config.BOT_TOKEN, chatId, '⚠️ لطفاً نام معتبر ارسال کنید.');
      }
      session.data.customerName = text.trim();
      session.step = 'awaiting_payment_method';
      setSession(chatId, session);
      const balance = getWallet(message.from.id);
      return sendMessage(config.BOT_TOKEN, chatId, '💰 روش پرداخت را انتخاب کنید:', {
        reply_markup: paymentMethodKeyboard(balance, config),
      });
    }
    case 'awaiting_payment_method': {
      return sendMessage(config.BOT_TOKEN, chatId, '⚠️ لطفاً یکی از دکمه‌های بالا را برای انتخاب روش پرداخت بزنید.');
    }
    case 'awaiting_receipt': {
      if (session.data.receiptDeadline && Date.now() > session.data.receiptDeadline) {
        resetSession(chatId);
        return sendMessage(config.BOT_TOKEN, chatId,
          '⏰ مهلت 30 دقیقه ارسال رسید به پایان رسید.\nلطفاً سفارش را از ابتدا ثبت کنید.');
      }
      if (message.photo && message.photo.length > 0) {
        const bestPhoto = message.photo[message.photo.length - 1];
        session.data.receiptFileId = bestPhoto.file_id;
        session.step = 'awaiting_confirm';
        setSession(chatId, session);

        const order = buildOrderPreview(session.data, message.from);
        return sendMessage(config.BOT_TOKEN, chatId, formatOrderSummary(order), {
          reply_markup: orderConfirmKeyboard(),
        });
      }
      return sendMessage(config.BOT_TOKEN, chatId, '⚠️ لطفاً عکس رسید پرداخت را ارسال کنید (به‌صورت تصویر، نه فایل متنی).');
    }
    case 'awaiting_wallet_amount': {
      const amount = Number(text.trim());
      if (!text.trim() || isNaN(amount) || amount <= 0) {
        return sendMessage(config.BOT_TOKEN, chatId, '⚠️ لطفاً یک عدد معتبر و بزرگ‌تر از صفر ارسال کنید.');
      }
      session.data.amount = amount;
      session.step = 'awaiting_wallet_card';
      setSession(chatId, session);
      return sendMessage(
        config.BOT_TOKEN,
        chatId,
        `💳 لطفاً یکی از کارت‌های زیر را برای واریز مبلغ ${amount.toLocaleString()} تومان انتخاب کنید:`,
        { reply_markup: walletTopupCardsKeyboard() }
      );
    }
    case 'awaiting_wallet_receipt': {
      if (session.data.receiptDeadline && Date.now() > session.data.receiptDeadline) {
        resetSession(chatId);
        return sendMessage(config.BOT_TOKEN, chatId,
          '⏰ مهلت 30 دقیقه ارسال رسید به پایان رسید.\nلطفاً از ابتدا اقدام کنید.');
      }
      if (message.photo && message.photo.length > 0) {
        const bestPhoto = message.photo[message.photo.length - 1];
        const req = {
          id: walletReqSeq++,
          userId: message.from.id,
          chatId,
          username: message.from.username || null,
          customerName: `${message.from.first_name || ''} ${message.from.last_name || ''}`.trim(),
          amount: session.data.amount,
          cardId: session.data.cardId,
          cardLabel: session.data.cardLabel,
          receiptFileId: bestPhoto.file_id,
          status: WALLET_REQUEST_STATUS.PENDING,
          createdAt: Date.now(),
        };
        memSet(DB.walletRequests, req.id, req);
        await dbUpsertUser(env, message.from);
        resetSession(chatId);

        await notifyAdmins(env, config, {
          orderId: `wallet:${req.id}`,
          text: formatWalletRequestMessage(req),
          photoFileId: req.receiptFileId,
          replyMarkup: walletRequestAdminKeyboard(req.id, req.status),
        });

        return sendMessage(
          config.BOT_TOKEN,
          chatId,
          `✅ درخواست شارژ شما به مبلغ ${req.amount.toLocaleString()} تومان ثبت شد و پس از تایید ادمین به کیف پول شما اضافه می‌شود.`
        );
      }
      return sendMessage(config.BOT_TOKEN, chatId, '⚠️ لطفاً عکس رسید پرداخت را ارسال کنید (به‌صورت تصویر، نه فایل متنی).');
    }
    default:
      return null; // این پیام مربوط به هیچ مرحله سفارشی نیست
  }
}

function buildOrderPreview(data, from) {
  return {
    id: 'preview',
    userId: from.id,
    username: from.username || null,
    customerName: data.customerName,
    planTitle: data.planTitle,
    price: data.price,
    cardLabel: data.cardLabel,
    receiptFileId: data.receiptFileId,
    status: ORDER_STATUS.PENDING,
  };
}

async function handleCardSelection(callbackQuery, cardId, config) {
  const chatId = callbackQuery.message.chat.id;
  const card = memGet(DB.cards, cardId);
  if (!card) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ این کارت دیگر معتبر نیست.', true);
  }
  const session = getSession(chatId);
  session.data.cardId = card.id;
  session.data.cardLabel = `${card.bankName} - ${card.number} (${card.holder || ''})`;
  session.step = 'awaiting_receipt';
  session.data.receiptDeadline = Date.now() + 30 * 60 * 1000;
  setSession(chatId, session);

  await editMessageText(
    config.BOT_TOKEN,
    chatId,
    callbackQuery.message.message_id,
    `💳 کارت انتخاب‌شده:\n<code>${card.number}</code>\n${card.bankName}\n\nپس از واریز، عکس رسید پرداخت را ارسال کنید.\n⏰ شما <b>30 دقیقه</b> فرصت دارید.`
  );
}

async function handlePlaceOrder(callbackQuery, config, env) {
  const chatId = callbackQuery.message.chat.id;
  const from = callbackQuery.from;
  const session = getSession(chatId);

  if (session.step !== 'awaiting_confirm') {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⚠️ اطلاعات سفارش ناقص است.', true);
  }

  const provider = getPaymentProvider(manualCardProvider.id);
  const order = buildOrderFromSession(session, from, chatId, {
    cardId: session.data.cardId,
    cardLabel: session.data.cardLabel,
    receiptFileId: session.data.receiptFileId,
    paidVia: provider.id,
    status: ORDER_STATUS.PENDING,
  });
  memSet(DB.orders, order.id, order);

  const user = memGet(DB.users, String(from.id)) || { id: String(from.id), orders: [], walletBalance: 0 };
  user.orders = [...(user.orders || []), order.id];
  user.lastOrderName = order.customerName;
  memSet(DB.users, String(from.id), user);

  resetSession(chatId);

  await dbUpsertUser(env, from);
  await dbSaveOrder(env, order);
  await recordPayment(
    env,
    order,
    provider,
    paymentResult({ ok: false, reference: `card_${order.id}`, amount: order.price }),
    `pay_card_${order.id}`
  );

  const kindNote =
    order.kind === ORDER_KIND.RENEW ? '\n🔄 این سفارش یک <b>تمدید</b> است و اشتراک تازه ساخته می‌شود.' : '';

  // ⚡ اعلان فوری به ادمین + پیام تایید به مشتری، هم‌زمان.
  // allSettled استفاده می‌شود تا اگر ویرایش پیام مشتری خطا بدهد (مثلاً پیام
  // خیلی قدیمی باشد) اعلان ادمین قطعاً انجام شود و برعکس.
  // notifyAdmins خودش تضمین می‌کند اعلان گم نشود (گروه ادمین → چت خصوصی ادمین،
  // عکس → متن → متن ساده) و برای هر شماره سفارش فقط یک‌بار ارسال شود.
  const results = await Promise.allSettled([
    // چرخش دکمه مشتری فوراً متوقف شود
    answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ سفارش ثبت شد'),
    notifyAdmins(env, config, {
      text: formatAdminOrderMessage(order),
      photoFileId: order.receiptFileId,
      replyMarkup: adminOrderKeyboard(order.id, order.status),
      orderId: order.id,
    }),
    editMessageText(
      config.BOT_TOKEN,
      chatId,
      callbackQuery.message.message_id,
      `✅ سفارش شما با شماره <b>#${order.id}</b> ثبت شد و در حال بررسی توسط ادمین است.${kindNote}\n` +
        'به‌محض تایید پرداخت، اشتراک به‌صورت خودکار ساخته و لینک آن همین‌جا برای شما ارسال می‌شود.'
    ),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      await dbLog(env, 'warn', 'telegram', `order confirm step failed: ${String(result.reason).slice(0, 200)}`, {}, {
        telegramId: from.id,
        orderId: order.id,
      });
    }
  }
}

async function handleOrderCancel(callbackQuery, config) {
  const chatId = callbackQuery.message.chat.id;
  resetSession(chatId);
  await editMessageText(config.BOT_TOKEN, chatId, callbackQuery.message.message_id, '❌ سفارش لغو شد. هر زمان خواستید از منوی «🛍 فروشگاه» دوباره اقدام کنید.');
}

// ---------- اقدامات ادمین روی سفارش ----------

// پیام سفارش در گروه ادمین را با وضعیت تازه بازنویسی می‌کند
async function refreshAdminOrderMessage(config, order, adminChatId, adminMsgId) {
  const markup = adminOrderKeyboard(order.id, order.status);
  if (order.receiptFileId) {
    return editCaptionSafely(config, adminChatId, adminMsgId, formatAdminOrderMessage(order), markup);
  }
  return editMessageText(config.BOT_TOKEN, adminChatId, adminMsgId, formatAdminOrderMessage(order), {
    reply_markup: markup,
  });
}

async function handleAdminAction(callbackQuery, action, orderId, config, env) {
  const fromId = callbackQuery.from.id;
  if (!isAdmin(fromId, config)) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⛔ شما دسترسی ادمین ندارید.', true);
  }

  const order = memGet(DB.orders, Number(orderId));
  if (!order) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ سفارش یافت نشد.', true);
  }

  const adminChatId = callbackQuery.message.chat.id;
  const adminMsgId = callbackQuery.message.message_id;

  // ---------- تایید پرداخت → ساخت خودکار اشتراک ----------
  if (action === 'confirm') {
    if (order.subscriptionId && memGet(DB.subscriptions, order.subscriptionId)) {
      return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, 'ℹ️ اشتراک این سفارش قبلاً ساخته شده است.', true);
    }

    order.status = ORDER_STATUS.CONFIRMED;
    order.updatedAt = Date.now();
    memSet(DB.orders, order.id, order);

    const provider = getPaymentProvider(order.paidVia) || manualCardProvider;
    // پرداخت‌های کیف پول و درگاه قبلاً تایید و کسر شده‌اند؛ تایید دوباره
    // نباید باعث کسر مجدد از موجودی کاربر شود.
    const alreadyPaid = order.paidVia === walletProvider.id || order.paidVia === gatewayProvider.id;
    const verification = alreadyPaid
      ? paymentResult({
          ok: true,
          reference: `${provider.id}_${order.id}`,
          amount: order.price,
          raw: { reused: true },
        })
      : await provider.verify({ env, config, order, params: { adminId: fromId } });
    await recordPayment(env, order, provider, verification, `pay_${provider.id}_${order.id}`);
    await dbSaveOrder(env, order);
    await dbLog(env, 'info', 'payment', `order confirmed by admin`, { provider: provider.id }, {
      telegramId: order.userId,
      orderId: order.id,
    });

    await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ تایید شد. اشتراک در حال ساخت است…');
    await refreshAdminOrderMessage(config, order, adminChatId, adminMsgId);
    await sendMessage(
      config.BOT_TOKEN,
      order.chatId,
      `✅ پرداخت سفارش شما (#${order.id}) تایید شد.\n⏳ در حال ساخت اشتراک روی سرور…`
    );

    const result = await provisionOrder(env, config, order, { notifyChatId: order.chatId });
    if (result.ok) await refreshAdminOrderMessage(config, order, adminChatId, adminMsgId);
    return;
  }

  // ---------- رد سفارش ----------
  if (action === 'reject') {
    order.status = ORDER_STATUS.REJECTED;
    order.updatedAt = Date.now();
    memSet(DB.orders, order.id, order);

    // اگر سفارش با کیف پول پرداخت شده بود، مبلغ را به کیف پول کاربر برگردان
    if (order.paidVia === walletProvider.id && !order.refunded) {
      addWalletBalance(order.userId, order.price);
      order.refunded = true;
      memSet(DB.orders, order.id, order);
      await dbSyncUserWallet(env, order.userId, getWallet(order.userId));
    }

    await dbSaveOrder(env, order);
    await dbLog(env, 'info', 'payment', 'order rejected by admin', {}, {
      telegramId: order.userId,
      orderId: order.id,
    });

    await sendMessage(
      config.BOT_TOKEN,
      order.chatId,
      `❌ متاسفانه سفارش شما (#${order.id}) رد شد.` +
        (order.refunded ? '\n💰 مبلغ سفارش به کیف پول شما بازگردانده شد.' : '') +
        `\nدر صورت وجود سوال با پشتیبانی در تماس باشید: @${config.SUPPORT_USERNAME}`
    );
    await refreshAdminOrderMessage(config, order, adminChatId, adminMsgId);
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ سفارش رد شد.');
  }

  // ---------- ارسال دستی اکانت (پشتیبان، وقتی ساخت خودکار ناموفق بوده) ----------
  if (action === 'send') {
    const adminSession = getSession(`admin_${fromId}`);
    adminSession.step = 'awaiting_send_account';
    adminSession.data = { orderId: order.id };
    setSession(`admin_${fromId}`, adminSession);

    return answerCallbackQuery(
      config.BOT_TOKEN,
      callbackQuery.id,
      '📨 اطلاعات اکانت را در پیام بعدی ارسال کنید.',
      true
    );
  }
}

async function editCaptionSafely(config, chatId, messageId, caption, replyMarkup) {
  return callTelegram(config.BOT_TOKEN, 'editMessageCaption', {
    chat_id: chatId,
    message_id: messageId,
    caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
  });
}

// ---------- اقدامات ادمین روی درخواست شارژ کیف پول ----------

async function handleWalletRequestAction(callbackQuery, action, reqId, config, env) {
  const fromId = callbackQuery.from.id;
  if (!isAdmin(fromId, config)) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⛔ شما دسترسی ادمین ندارید.', true);
  }

  const req = memGet(DB.walletRequests, Number(reqId));
  if (!req) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ درخواست یافت نشد.', true);
  }

  const adminChatId = callbackQuery.message.chat.id;
  const adminMsgId = callbackQuery.message.message_id;

  if (action === 'approve') {
    req.status = WALLET_REQUEST_STATUS.APPROVED;
    memSet(DB.walletRequests, req.id, req);
    const newBalance = addWalletBalance(req.userId, req.amount);
    await dbSyncUserWallet(env, req.userId, newBalance);

    await sendMessage(
      config.BOT_TOKEN,
      req.chatId,
      `✅ شارژ کیف پول شما به مبلغ ${req.amount.toLocaleString()} تومان تایید شد.\nموجودی جدید: <b>${newBalance.toLocaleString()} تومان</b>`
    );
    await editCaptionSafely(config, adminChatId, adminMsgId, formatWalletRequestMessage(req), walletRequestAdminKeyboard(req.id, req.status));
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ شارژ تایید و اعمال شد.');
  }

  if (action === 'reject') {
    req.status = WALLET_REQUEST_STATUS.REJECTED;
    memSet(DB.walletRequests, req.id, req);

    await sendMessage(
      config.BOT_TOKEN,
      req.chatId,
      `❌ متاسفانه درخواست شارژ کیف پول شما (${req.amount.toLocaleString()} تومان) رد شد.\nبرای اطلاعات بیشتر با پشتیبانی در تماس باشید: @${config.SUPPORT_USERNAME}`
    );
    await editCaptionSafely(config, adminChatId, adminMsgId, formatWalletRequestMessage(req), walletRequestAdminKeyboard(req.id, req.status));
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ درخواست رد شد.');
  }
}

// ---------- عضویت اجباری در کانال ----------

async function handleCheckJoin(callbackQuery, config, env) {
  const chatId = callbackQuery.message.chat.id;
  const fromId = callbackQuery.from.id;
  const member = !DB.forceJoinEnabled || isAdmin(fromId, config) || await isChannelMember(config, fromId);
  if (member) {
    registerUser(callbackQuery.from);
    if (callbackQuery.message.chat.type === 'private') await confirmReferralAndReward(fromId, config, env);
    await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ عضویت شما تایید شد.');
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      '🎉 عضویت شما تایید شد! خوش آمدید 👋\n\nاز منوی زیر یکی از گزینه‌ها را انتخاب کنید:',
      { reply_markup: mainReplyKeyboard(config) }
    );
  }
  return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⚠️ شما هنوز عضو کانال نشده‌اید. لطفاً ابتدا عضو شوید.', true);
}

async function handleForceJoinMenu(chatId, config) {
  let text = '🔒 <b>عضویت اجباری در کانال</b>\n\n';
  text += 'در صورت فعال بودن این قابلیت، کاربران قبل از استفاده از ربات باید عضو کانال شما شوند.\n\n';
  text += `📢 کانال تنظیم‌شده: ${escapeHtml(config.CHANNEL_ID)}\n`;
  text += `⚙️ وضعیت فعلی: ${DB.forceJoinEnabled ? '✅ فعال' : '❌ غیرفعال'}\n\n`;
  text += '⚠️ توجه: برای کارکرد صحیح این قابلیت، ربات باید ادمین کانال باشد؛ در غیر این صورت کاربران مسدود نمی‌شوند.';
  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: forceJoinAdminKeyboard() });
}

async function handleForceJoinToggle(callbackQuery, config) {
  DB.forceJoinEnabled = !DB.forceJoinEnabled;
  await answerCallbackQuery(
    config.BOT_TOKEN,
    callbackQuery.id,
    DB.forceJoinEnabled ? '✅ عضویت اجباری فعال شد.' : '❌ عضویت اجباری غیرفعال شد.'
  );
  return handleForceJoinMenu(callbackQuery.message.chat.id, config);
}

// ---------- پنل مدیریت ادمین ----------


// ---------- مدیریت کانفیگ کاربران (فعال/غیرفعال/حذف) ----------
async function handleUserConfigsMenu(chatId, config) {
  const allSubs = [...DB.subscriptions.values()]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (allSubs.length === 0) {
    return sendMessage(config.BOT_TOKEN, chatId, '📭 هیچ کانفیگی ثبت نشده است.');
  }

  const rows = allSubs.slice(0, 20).map((sub) => {
    const icon = sub.status === 'disabled' ? '🔴' :
                 sub.status === 'on_hold'  ? '⏸' : '🟢';
    return [{ text: `${icon} ${sub.pgUsername} — ${sub.planTitle || '-'}`, callback_data: `ucfg:sel:${sub.id}` }];
  });

  const extra = allSubs.length > 20
    ? `

⚠️ فقط ۲۰ مورد آخر نمایش داده می‌شود. برای جستجوی دقیق از /sub استفاده کنید.`
    : '';

  return sendMessage(
    config.BOT_TOKEN,
    chatId,
    `🚦 <b>مدیریت کانفیگ کاربران</b>
🟢 فعال | 🔴 غیرفعال | ⏸ توقف${extra}

یک کاربر را انتخاب کنید:`,
    { reply_markup: { inline_keyboard: rows } }
  );
}

async function handleAdminPanel(message, config, env) {
  const chatId = message.chat.id;
  if (!isAdmin(message.from.id, config)) {
    return sendMessage(config.BOT_TOKEN, chatId, '⛔ شما دسترسی به پنل مدیریت ندارید.');
  }
  let text = '🛠 <b>پنل مدیریت</b>\nیکی از گزینه‌ها را انتخاب کنید:';
  if (!isPersistenceEnabled(env)) {
    text += '\n\n⚠️ حافظه دائمی (KV) وصل نیست. برای اطلاعات بیشتر ابتدای کد را ببینید.';
  }
  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: adminReplyKeyboard() });
}

// ---------- تبلیغ در کانال (پیام + دکمه شیشه‌ای، کاملاً قابل‌ویرایش توسط ادمین) ----------

const AD_TEXT_MAX = 1000;
const AD_BUTTON_TEXT_MAX = 64;

function isValidButtonUrl(url) {
  return /^(https?:\/\/|tg:\/\/)\S+$/i.test(String(url || '').trim());
}

// آیدی کاربری ربات را (برای ساخت لینک عمیق t.me/...?start=...) می‌گیرد و
// در حافظه موقت Worker کش می‌کند تا هر بار getMe صدا زده نشود.
let cachedBotUsername = null;
async function getBotUsernameCached(config) {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await getMe(config.BOT_TOKEN);
    const username = me && me.ok && me.result && me.result.username;
    if (username && /^[a-zA-Z0-9_]+$/.test(username)) {
      cachedBotUsername = username;
      return username;
    }
  } catch (_) {
    // نادیده گرفته می‌شود؛ فراخوان مقدار null را مدیریت می‌کند
  }
  return null;
}

/**
 * مقدار خام لینک دکمه تبلیغ را به یک URL واقعی تبدیل می‌کند.
 * اگر مقدار خالی باشد یا برابر کلمهٔ ویژه «shop» باشد، لینک عمیق ربات با
 * start=shop ساخته می‌شود (باز شدن مستقیم منوی «خرید اشتراک»). در غیر این
 * صورت همان لینکی که ادمین وارد کرده برگردانده می‌شود.
 */
async function resolveAdButtonUrl(config, rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value || value.toLowerCase() === 'shop') {
    const username = await getBotUsernameCached(config);
    if (!username) return null;
    return `https://t.me/${username}?start=shop`;
  }
  return value;
}

// نکته: تا نسخه Bot API 9.4 (فوریه ۲۰۲۶)، تلگرام هیچ راهی برای رنگی‌کردن
// دکمه‌های شیشه‌ای (inline keyboard) نداشت. از آن نسخه به بعد فیلد «style»
// اضافه شده و اجازه می‌دهد دکمه واقعاً سبز (success)، آبی (primary) یا
// قرمز (danger) رنگ شود — بدون نیاز به ایموجی یا ترفند بصری.
function adButtonKeyboard(text, url) {
  return { inline_keyboard: [[{ text, url, style: 'success' }]] };
}

// متن قابل‌نمایش لینک پیش‌فرض دکمه تبلیغ (برای پیام‌های راهنما)
function describeAdDefaultButtonUrl(config) {
  const value = String(config.AD_DEFAULT_BUTTON_URL || '').trim();
  if (!value || value.toLowerCase() === 'shop') return 'باز شدن خودکار منوی «خرید اشتراک» در ربات';
  return value;
}

function adBuildKeyboard(ad) {
  if (ad.buttonText && ad.buttonUrl) {
    return adButtonKeyboard(ad.buttonText, ad.buttonUrl);
  }
  return { inline_keyboard: [] };
}

function formatAdPreview(ad) {
  const shortText = (ad.text || '').slice(0, 200);
  const lines = [
    `🆔 <code>${ad.id}</code>`,
    `📡 کانال: <code>${escapeHtml(ad.channelId || ad.chatId || '—')}</code>`,
    `📝 متن:\n${escapeHtml(shortText)}${(ad.text || '').length > 200 ? '…' : ''}`,
    ad.photoFileId ? '🖼 دارای عکس' : '🖼 بدون عکس',
    ad.buttonText && ad.buttonUrl
      ? `🔘 دکمه: ${escapeHtml(ad.buttonText)} → ${escapeHtml(ad.buttonUrl)}`
      : '🔘 بدون دکمه',
    `🕐 آخرین بروزرسانی: ${formatDate(ad.updatedAt || ad.createdAt)}`,
  ];
  return lines.join('\n');
}

async function handleChannelAdMenu(chatId, config) {
  const ads = [...DB.channelAds.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const rows = ads.slice(0, 25).map((ad) => {
    const label = (ad.text || '(بدون متن)').replace(/\n/g, ' ').slice(0, 34);
    return [{ text: `📢 ${label}${(ad.text || '').length > 34 ? '…' : ''}`, callback_data: `ad_open:${ad.id}` }];
  });
  rows.push([{ text: '➕ ارسال تبلیغ جدید', callback_data: 'ad_new' }]);
  rows.push(backNavRow('admin'));

  return sendMessage(config.BOT_TOKEN, chatId,
    '📣 <b>تبلیغ در کانال</b>\n\n' +
    'هر آگهی به کانالی که موقع ساختنش مشخص می‌کنید ارسال می‌شود (نه لزوماً کانال پیش‌فرض تنظیمات).\n' +
    `کانال پیش‌فرض تنظیمات (فقط برای عضویت اجباری): <code>${escapeHtml(config.CHANNEL_ID)}</code>\n` +
    `تعداد آگهی‌های ارسال‌شده: <b>${ads.length}</b>\n\n` +
    (ads.length > 0
      ? 'یک آگهی را برای مشاهده و ویرایش انتخاب کنید، یا آگهی جدید بسازید:'
      : 'هنوز آگهی‌ای ارسال نشده. برای شروع، آگهی جدید بسازید:'),
    { reply_markup: { inline_keyboard: rows } }
  );
}

function channelAdDetailKeyboard(ad) {
  const rows = [
    [{ text: '✏️ ویرایش متن', callback_data: `ad_edit:text:${ad.id}` }],
  ];
  rows.push([{
    text: ad.photoFileId ? '🖼 تعویض عکس' : '🖼 عکس ندارد (نیاز به آگهی جدید)',
    callback_data: ad.photoFileId ? `ad_edit:photo:${ad.id}` : 'noop',
  }]);
  rows.push([{ text: ad.buttonText ? '🔘 ویرایش دکمه' : '➕ افزودن دکمه', callback_data: `ad_edit:button:${ad.id}` }]);
  if (ad.buttonText) rows.push([{ text: '🗑 حذف دکمه', callback_data: `ad_edit:removebtn:${ad.id}` }]);
  rows.push([{ text: '🗑 حذف کامل آگهی', callback_data: `ad_delete:${ad.id}` }]);
  rows.push([{ text: '🔙 بازگشت به لیست', callback_data: 'ad_menu' }]);
  return { inline_keyboard: rows };
}

async function handleChannelAdOpen(callbackQuery, adId, config) {
  const ad = memGet(DB.channelAds, adId);
  if (!ad) return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ آگهی یافت نشد.', true);
  return sendMessage(config.BOT_TOKEN, callbackQuery.message.chat.id,
    `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`,
    { reply_markup: channelAdDetailKeyboard(ad) }
  );
}

async function handleChannelAdNewStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_ad_channel_id';
  session.data = {};
  setSession(`admin_${fromId}`, session);
  return sendMessage(config.BOT_TOKEN, callbackQuery.message.chat.id,
    '📣 <b>ساخت آگهی جدید</b>\n\n' +
    '📡 اول بگویید این آگهی در <b>چه کانالی</b> ارسال شود — آیدی عددی همان کانال را بفرستید ' +
    '(مثل <code>-1001234567890</code>)،\n' +
    'یا اگر نمی‌دانید آیدی عددی چیست، فقط یک پست از همان کانال را همین‌جا برای ربات <b>فوروارد</b> کنید ' +
    'تا آیدی آن خودکار استخراج شود.\n\n' +
    `📌 کانال پیش‌فرض تنظیمات فعلی شما (<code>${escapeHtml(String(config.CHANNEL_ID || '—'))}</code>) ` +
    'فقط برای اطلاع است و با این کار <b>هیچ‌وقت</b> تغییر نمی‌کند؛ فقط همین یک آگهی به کانالی که الان مشخص می‌کنید ارسال می‌شود.\n\n' +
    '⚠️ ربات باید از قبل در آن کانال «ادمین» باشد.\n' +
    'برای لغو دستور /cancel را بفرستید.'
  );
}

async function handleChannelAdEditStart(callbackQuery, subaction, adId, config) {
  const ad = memGet(DB.channelAds, adId);
  if (!ad) return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ آگهی یافت نشد.', true);
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  const chatId = callbackQuery.message.chat.id;

  if (subaction === 'text') {
    session.step = 'awaiting_ad_edit_text';
    session.data = { adId };
    setSession(`admin_${fromId}`, session);
    return sendMessage(config.BOT_TOKEN, chatId,
      `✏️ متن جدید آگهی را ارسال کنید (حداکثر ${AD_TEXT_MAX} کاراکتر):\n\nمتن فعلی:\n${escapeHtml(ad.text || '')}`
    );
  }

  if (subaction === 'photo') {
    if (!ad.photoFileId) {
      return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id,
        '⚠️ این آگهی بدون عکس ارسال شده و تلگرام اجازه نمی‌دهد پیام متنی به پیام عکس‌دار تبدیل شود. برای افزودن عکس، آگهی جدید بسازید.', true);
    }
    session.step = 'awaiting_ad_edit_photo';
    session.data = { adId };
    setSession(`admin_${fromId}`, session);
    return sendMessage(config.BOT_TOKEN, chatId, '🖼 عکس جدید آگهی را ارسال کنید:');
  }

  if (subaction === 'button') {
    session.step = 'awaiting_ad_edit_button_text';
    session.data = { adId };
    setSession(`admin_${fromId}`, session);
    return sendMessage(config.BOT_TOKEN, chatId,
      `🔘 متن جدید دکمه را ارسال کنید (حداکثر ${AD_BUTTON_TEXT_MAX} کاراکتر):\n\n` +
      (ad.buttonText ? `متن فعلی: ${escapeHtml(ad.buttonText)}` : 'در حال حاضر دکمه‌ای ندارد.') +
      `\n\nبرای استفاده از دکمه پیش‌فرض «${config.AD_DEFAULT_BUTTON_TEXT}» → ${describeAdDefaultButtonUrl(config)} دستور /default را بفرستید.`
    );
  }

  if (subaction === 'removebtn') {
    if (!ad.buttonText) {
      return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, 'ℹ️ این آگهی در حال حاضر دکمه‌ای ندارد.', true);
    }
    ad.buttonText = null;
    ad.buttonUrl = null;
    ad.updatedAt = Date.now();
    memSet(DB.channelAds, ad.id, ad);
    await editMessageReplyMarkup(config.BOT_TOKEN, ad.chatId, ad.messageId, { inline_keyboard: [] });
    await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ دکمه حذف شد.');
    return sendMessage(config.BOT_TOKEN, chatId, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
      reply_markup: channelAdDetailKeyboard(ad),
    });
  }

  return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id);
}

async function handleChannelAdDelete(callbackQuery, adId, config) {
  const ad = memGet(DB.channelAds, adId);
  if (!ad) return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ آگهی یافت نشد.', true);
  await deleteMessage(config.BOT_TOKEN, ad.chatId, ad.messageId);
  memDelete(DB.channelAds, adId);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '🗑 آگهی حذف شد.');
  return handleChannelAdMenu(callbackQuery.message.chat.id, config);
}

// ساخت و ارسال آگهی جدید به کانال بر اساس داده‌های جمع‌آوری‌شده در سشن
// توجه: کانال مقصد از session.data.channelId (همان چیزی که ادمین موقع ساخت
// آگهی وارد کرده) خوانده می‌شود، نه از config.CHANNEL_ID — تنظیمات پیش‌فرض
// کانال هرگز توسط این تابع تغییر نمی‌کند.
async function finalizeNewChannelAd(config, chatId, session) {
  const { text, photoFileId, buttonText, buttonUrl, channelId } = session.data;
  const targetChannelId = channelId;
  const replyMarkup = buttonText && buttonUrl
    ? adButtonKeyboard(buttonText, buttonUrl)
    : undefined;
  const extra = replyMarkup ? { reply_markup: replyMarkup } : {};

  const sent = photoFileId
    ? await sendPhoto(config.BOT_TOKEN, targetChannelId, photoFileId, text, extra)
    : await sendMessage(config.BOT_TOKEN, targetChannelId, text, extra);

  if (!sent || !sent.ok) {
    const desc = (sent && sent.description) || 'خطای نامشخص';
    const chatNotFound = /chat not found/i.test(desc);
    await sendMessage(config.BOT_TOKEN, chatId,
      `⚠️ ارسال آگهی به کانال ناموفق بود: ${desc}\n\n` +
      `کانالی که وارد کردید: <code>${escapeHtml(String(targetChannelId || ''))}</code>\n\n` +
      (chatNotFound
        ? '👉 این خطا معمولاً یعنی آیدی وارد‌شده اشتباه است یا ربات در آن کانال ادمین نیست. ' +
          'یک پست از همان کانال را برای ربات فوروارد کنید تا آیدی عددی صحیح دوباره استخراج شود؛ ' +
          'همچنین مطمئن شوید ربات از قبل در آن کانال «ادمین» است.'
        : 'مطمئن شوید ربات در آن کانال ادمین است و آیدی وارد‌شده درست است.')
    );
    return null;
  }

  const ad = {
    id: newId('ad'),
    text,
    photoFileId: photoFileId || null,
    buttonText: buttonText || null,
    buttonUrl: buttonUrl || null,
    channelId: String(targetChannelId || ''),
    chatId: String(sent.result.chat.id),
    messageId: sent.result.message_id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  memSet(DB.channelAds, ad.id, ad);
  return ad;
}

async function handleAdminReplyKeyboardText(message, config, env) {
  const chatId = message.chat.id;
  const fromId = message.from.id;
  const text = message.text;

  if (!isAdmin(fromId, config)) return false;

  if (text === '⏳ سفارش‌های در انتظار') {
    const pending = [...DB.orders.values()].filter((o) => o.status === ORDER_STATUS.PENDING);
    if (pending.length === 0) {
      await sendMessage(config.BOT_TOKEN, chatId, '📭 سفارش در انتظاری وجود ندارد.');
      return true;
    }
    for (const order of pending.slice(-10)) {
      if (order.receiptFileId) {
        await sendPhoto(config.BOT_TOKEN, chatId, order.receiptFileId, formatAdminOrderMessage(order), {
          reply_markup: adminOrderKeyboard(order.id, order.status),
        });
      } else {
        await sendMessage(config.BOT_TOKEN, chatId, formatAdminOrderMessage(order), {
          reply_markup: adminOrderKeyboard(order.id, order.status),
        });
      }
    }
    return true;
  }

  if (text === '💳 مدیریت کارت‌ها') {
    await handleCardsManagementMenu(chatId, config);
    return true;
  }

  if (text === '📦 مدیریت بسته‌ها') {
    await handlePlansManagementMenu(chatId, config);
    return true;
  }

  if (text === '🎓 مدیریت آموزش‌ها') {
    await handleTutorialsManagementMenu(chatId, config);
    return true;
  }

  if (text === '🛰 پاسارگارد') {
    await handlePasarguardMenu(chatId, config, env);
    return true;
  }

  if (text === '🎁 مدیریت تست کانفیگ') {
    await handleTestConfigsManagementMenu(chatId, config);
    return true;
  }

  if (text === '💰 مدیریت کیف پول') {
    await handleWalletAdminMenu(chatId, config);
    return true;
  }

  if (text === '🔒 عضویت اجباری') {
    await handleForceJoinMenu(chatId, config);
    return true;
  }

  if (text === '👤 مدیریت ادمین‌ها') {
    await handleAdminsManagementMenu(chatId, config);
    return true;
  }

  if (text === '👥 مدیریت دعوت دوستان') {
    await handleReferralAdminMenu(chatId, config);
    return true;
  }

  if (text === '⚙️ تنظیمات فروشگاه') {
    await handleSettingsMenu(chatId, config);
    return true;
  }

  if (text === '📊 آمار فروشگاه') {
    await handleStats(chatId, config, env);
    return true;
  }

  if (text === '🔙 بازگشت به منوی کاربری') {
    await sendMessage(config.BOT_TOKEN, chatId, '🏠 بازگشت به منوی اصلی.', {
      reply_markup: mainReplyKeyboard(config),
    });
    return true;
  }

  if (text === '🚦 مدیریت کانفیگ کاربران') {
    await handleUserConfigsMenu(chatId, config);
    return true;
  }

  if (text === '📢 پیام همگانی') {
    const adminSession = getSession(`admin_${fromId}`);
    adminSession.step = 'awaiting_broadcast_message';
    adminSession.data = {};
    setSession(`admin_${fromId}`, adminSession);
    const userCount = DB.users.size;
    await sendMessage(
      config.BOT_TOKEN,
      chatId,
      `📢 <b>پیام همگانی</b>\n\n` +
        `👥 تعداد کاربران ثبت‌شده: <b>${userCount}</b> نفر\n\n` +
        'متن پیام همگانی را ارسال کنید (پشتیبانی HTML دارد):\n' +
        'برای لغو دستور /cancel را بفرستید.'
    );
    return true;
  }

  if (text === '📣 تبلیغ در کانال') {
    await handleChannelAdMenu(chatId, config);
    return true;
  }

  return false;
}

async function handleStats(chatId, config, env) {
  ensurePlansLoaded();
  const orders = [...DB.orders.values()];
  const count = (status) => orders.filter((o) => o.status === status).length;
  const subs = [...DB.subscriptions.values()];
  const activeSubs = subs.filter((s) => s.status === 'active' || s.status === 'on_hold').length;
  const totalWalletBalance = [...DB.users.values()].reduce((sum, u) => sum + (u.walletBalance || 0), 0);
  const pendingWalletRequests = [...DB.walletRequests.values()].filter(
    (r) => r.status === WALLET_REQUEST_STATUS.PENDING
  ).length;

  let text =
    `📊 <b>آمار فروشگاه</b>\n\n` +
    `👥 کاربران: ${DB.users.size}\n` +
    `📦 کل سفارش‌ها: ${DB.orders.size}\n` +
    `⏳ در انتظار: ${count(ORDER_STATUS.PENDING)}\n` +
    `✅ تایید شده: ${count(ORDER_STATUS.CONFIRMED)}\n` +
    `📨 تحویل شده: ${count(ORDER_STATUS.SENT)}\n` +
    `❌ رد شده: ${count(ORDER_STATUS.REJECTED)}\n\n` +
    `🛰 اشتراک‌های ساخته‌شده: ${subs.length}\n` +
    `🟢 اشتراک‌های فعال: ${activeSubs}\n` +
    `🔄 تمدیدها: ${orders.filter((o) => o.kind === ORDER_KIND.RENEW).length}\n\n` +
    `💳 تعداد کارت‌های فعال: ${DB.cards.size}\n` +
    `📶 تعداد بسته‌های فعال: ${DB.plans.length}\n` +
    `🎁 تست کانفیگ (موجود/استفاده‌شده): ${DB.testConfigs.filter((c) => !c.used).length}/${
      DB.testConfigs.filter((c) => c.used).length
    }\n` +
    `💰 مجموع موجودی کیف پول‌ها: ${totalWalletBalance.toLocaleString()} تومان\n` +
    `📋 درخواست‌های شارژ در انتظار: ${pendingWalletRequests}\n` +
    `🔒 عضویت اجباری در کانال: ${DB.forceJoinEnabled ? 'فعال' : 'غیرفعال'}\n` +
    `🗄 دیتابیس D1: ${hasD1(env) ? 'متصل' : 'متصل نیست'}`;

  const stats = await dbStats(env);
  if (stats) {
    text +=
      `\n\n<b>گزارش D1</b>\n` +
      `🧾 پرداخت‌های تاییدشده: ${stats.pay_verified}\n` +
      `💵 مجموع مبالغ تاییدشده: ${Number(stats.pay_sum || 0).toLocaleString()} تومان\n` +
      `🚨 خطاهای ثبت‌شده: ${stats.log_errors}`;
  }

  return sendMessage(config.BOT_TOKEN, chatId, text);
}

// ---------- مدیریت کارت‌ها (اینلاین + تعاملی) ----------

async function handleCardsManagementMenu(chatId, config) {
  let text = '💳 <b>مدیریت کارت‌های بانکی</b>\n\n';
  if (DB.cards.size === 0) {
    text += 'در حال حاضر هیچ کارتی ثبت نشده است.\n';
  } else {
    for (const card of DB.cards.values()) {
      text += `🔹 ${card.bankName} | <code>${card.number}</code> | ${card.holder || '-'}\n`;
    }
  }
  text += '\nبرای افزودن یا حذف کارت از دکمه‌های زیر استفاده کنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: cardsAdminInlineKeyboard() });
}

async function handleCardAddStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_card_bank';
  session.data = {};
  setSession(`admin_${fromId}`, session);
  return sendMessage(config.BOT_TOKEN, callbackQuery.message.chat.id, '🏦 نام بانک را ارسال کنید (مثلاً: بانک ملی):');
}

async function handleCardDelete(callbackQuery, cardId, config) {
  const found = memGet(DB.cards, Number(cardId));
  if (!found) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ کارت یافت نشد.', true);
  }
  memDelete(DB.cards, Number(cardId));
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '🗑 کارت حذف شد و برای همیشه ذخیره شد.');
  return handleCardsManagementMenu(callbackQuery.message.chat.id, config);
}

// ---------- مدیریت بسته‌های اینترنت (اینلاین + تعاملی) ----------

async function handlePlansManagementMenu(chatId, config) {
  ensurePlansLoaded();
  let text = '📦 <b>مدیریت بسته‌های اینترنت</b>\n\n';
  if (DB.plans.length === 0) {
    text += 'در حال حاضر هیچ بسته‌ای ثبت نشده است.\n';
  } else {
    for (const plan of DB.plans) {
      const target = plan.templateId
        ? `قالب ${plan.templateId}`
        : Array.isArray(plan.groupIds) && plan.groupIds.length
          ? `گروه‌های ${plan.groupIds.join('،')}`
          : '⚠️ بدون گروه';
      text += `🔹 ${escapeHtml(plan.title)} | ${plan.gb} گیگ | ${plan.price.toLocaleString()} تومان | ${target}\n`;
    }
  }
  text += '\nبرای ویرایش یا حذف روی دکمه مربوطه بزنید، یا بسته جدید اضافه کنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: plansAdminInlineKeyboard() });
}

async function handlePlanAddStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_plan_title';
  session.data = { mode: 'add' };
  setSession(`admin_${fromId}`, session);
  return sendMessage(config.BOT_TOKEN, callbackQuery.message.chat.id, '✏️ عنوان بسته جدید را ارسال کنید (مثلاً: گیگ 5):');
}

async function handlePlanEditStart(callbackQuery, planId, config) {
  ensurePlansLoaded();
  const plan = DB.plans.find((p) => p.id === planId);
  if (!plan) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ بسته یافت نشد.', true);
  }
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_plan_gb';
  session.data = { mode: 'edit', planId, title: plan.title };
  setSession(`admin_${fromId}`, session);
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `✏️ ویرایش بسته — مقادیر را مرحله‌به‌مرحله می‌پرسم.\n\n` +
      `حجم: ${plan.gb} گیگ | قیمت: ${plan.price.toLocaleString()} تومان\n` +
      `گروه‌ها: ${Array.isArray(plan.groupIds) && plan.groupIds.length ? plan.groupIds.join('،') : '—'}` +
      ` | قالب: ${plan.templateId || '—'}\n\n` +
      `📶 حجم جدید بسته را به گیگابایت ارسال کنید (فقط عدد، ۰ = نامحدود):`
  );
}

async function handlePlanDelete(callbackQuery, planId, config, env) {
  ensurePlansLoaded();
  const idx = DB.plans.findIndex((p) => p.id === planId);
  if (idx === -1) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ بسته یافت نشد.', true);
  }
  DB.plans.splice(idx, 1);
  await dbDeactivatePlan(env, planId);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '🗑 بسته حذف شد و برای همیشه ذخیره شد.');
  return handlePlansManagementMenu(callbackQuery.message.chat.id, config);
}

// ---------- مدیریت آموزش‌ها (اینلاین + تعاملی) ----------
// این بخش امکان افزودن/ویرایش/حذف لینک‌های آموزشی را از پنل ادمین فراهم می‌کند.
// این لینک‌ها با زدن دکمه شیشه‌ای «🎓 آموزش‌ها» که زیر پیام تحویل سرویس به
// مشتری نمایش داده می‌شود، در اختیار مشتری قرار می‌گیرند.

async function handleTutorialsManagementMenu(chatId, config) {
  let text = '🎓 <b>مدیریت آموزش‌ها</b>\n\n';
  if (DB.tutorials.size === 0) {
    text += 'در حال حاضر هیچ آموزشی ثبت نشده است.\n';
  } else {
    for (const tutorial of DB.tutorials.values()) {
      text += `🔹 ${escapeHtml(tutorial.title)}\n${escapeHtml(tutorial.url)}\n\n`;
    }
  }
  text += 'برای ویرایش یا حذف روی دکمه مربوطه بزنید، یا آموزش جدید اضافه کنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: tutorialsAdminInlineKeyboard() });
}

async function handleTutorialAddStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_tutorial_title';
  session.data = { mode: 'add' };
  setSession(`admin_${fromId}`, session);
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    '✏️ عنوان آموزش جدید را ارسال کنید (مثلاً: آموزش اتصال با v2rayNG):'
  );
}

async function handleTutorialEditStart(callbackQuery, tutorialId, config) {
  tutorialId = Number(tutorialId);
  const tutorial = memGet(DB.tutorials, tutorialId);
  if (!tutorial) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ آموزش یافت نشد.', true);
  }
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_tutorial_title';
  session.data = { mode: 'edit', tutorialId };
  setSession(`admin_${fromId}`, session);
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `✏️ ویرایش آموزش — مقادیر فعلی:\n` +
      `عنوان: ${escapeHtml(tutorial.title)}\nلینک: ${escapeHtml(tutorial.url)}\n\n` +
      `عنوان جدید را ارسال کنید:`
  );
}

async function handleTutorialDelete(callbackQuery, tutorialId, config) {
  tutorialId = Number(tutorialId);
  const found = memGet(DB.tutorials, tutorialId);
  if (!found) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ آموزش یافت نشد.', true);
  }
  memDelete(DB.tutorials, tutorialId);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '🗑 آموزش حذف شد و برای همیشه ذخیره شد.');
  return handleTutorialsManagementMenu(callbackQuery.message.chat.id, config);
}

// نمایش لینک‌های آموزش به مشتری (با زدن دکمه شیشه‌ای زیر پیام تحویل سرویس)
async function handleTutorialsView(callbackQuery, config) {
  const chatId = callbackQuery.message.chat.id;
  if (DB.tutorials.size === 0) {
    return sendMessage(config.BOT_TOKEN, chatId, '📭 فعلاً آموزشی ثبت نشده است. لطفاً بعداً دوباره بررسی کنید.');
  }
  return sendMessage(config.BOT_TOKEN, chatId, '🎓 <b>آموزش‌های مرتبط:</b>\nبرای مشاهده هر آموزش روی دکمه مربوطه بزنید:', {
    reply_markup: tutorialsViewKeyboard(),
  });
}

// ---------- مدیریت استخر تست کانفیگ (اینلاین + تعاملی) ----------
// هر مشتری فقط یک‌بار یکی از این کانفیگ‌ها را دریافت می‌کند؛ ادمین می‌تواند تا
// سقف MAX_TEST_CONFIGS (۵۰ عدد) کانفیگ در این استخر قرار دهد.

async function handleTestConfigsManagementMenu(chatId, config) {
  const total = DB.testConfigs.length;
  const usedCount = DB.testConfigs.filter((c) => c.used).length;
  const unusedCount = total - usedCount;

  let text = '🎁 <b>مدیریت تست کانفیگ‌ها</b>\n\n';
  text += `📦 ظرفیت کل: ${MAX_TEST_CONFIGS} عدد\n`;
  text += `✅ موجود (آماده ارسال): ${unusedCount}\n`;
  text += `📨 استفاده‌شده (تحویل‌داده‌شده به مشتری): ${usedCount}\n`;
  text += `🧮 مجموع ثبت‌شده: ${total} از ${MAX_TEST_CONFIGS}\n\n`;
  text +=
    'برای افزودن، دکمه «➕ افزودن کانفیگ تست» را بزنید و می‌توانید چند کانفیگ را هر کدام در یک خط جداگانه در یک پیام ارسال کنید (تا سقف ظرفیت باقیمانده).';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: testConfigsAdminInlineKeyboard() });
}

async function handleTestConfigAddStart(callbackQuery, config) {
  const remaining = MAX_TEST_CONFIGS - DB.testConfigs.length;
  if (remaining <= 0) {
    return answerCallbackQuery(
      config.BOT_TOKEN,
      callbackQuery.id,
      `⛔ ظرفیت پر است (حداکثر ${MAX_TEST_CONFIGS} کانفیگ). ابتدا کانفیگ‌های استفاده‌نشده را حذف کنید.`,
      true
    );
  }
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_test_configs_bulk';
  session.data = {};
  setSession(`admin_${fromId}`, session);

  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `✏️ کانفیگ‌های تست را ارسال کنید — هر کانفیگ در یک خط جداگانه (می‌توانید همه را در یک پیام بفرستید).\n` +
      `ظرفیت باقیمانده: ${remaining} عدد از ${MAX_TEST_CONFIGS} کل.`
  );
}

async function handleTestConfigsClearUnused(callbackQuery, config) {
  const before = DB.testConfigs.length;
  DB.testConfigs = DB.testConfigs.filter((c) => c.used);
  const removed = before - DB.testConfigs.length;
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, `🗑 ${removed} کانفیگ استفاده‌نشده حذف شد و ذخیره شد.`);
  return handleTestConfigsManagementMenu(callbackQuery.message.chat.id, config);
}

// ---------- مدیریت کیف پول (اینلاین + تعاملی) ----------

async function handleWalletAdminMenu(chatId, config) {
  const pendingCount = [...DB.walletRequests.values()].filter(
    (r) => r.status === WALLET_REQUEST_STATUS.PENDING
  ).length;
  const totalWallets = [...DB.users.values()].reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  let text = '💰 <b>مدیریت کیف پول</b>\n\n';
  text += `📋 درخواست‌های شارژ در انتظار: ${pendingCount}\n`;
  text += `🧮 مجموع موجودی کیف پول همه کاربران: ${totalWallets.toLocaleString()} تومان\n\n`;
  text += 'برای مشاهده و تایید/رد درخواست‌های شارژ یا تغییر دستی موجودی یک کاربر از دکمه‌های زیر استفاده کنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: walletAdminInlineKeyboard() });
}

async function handleWalletAdminPendingList(chatId, config) {
  const pending = [...DB.walletRequests.values()].filter((r) => r.status === WALLET_REQUEST_STATUS.PENDING);
  if (pending.length === 0) {
    return sendMessage(config.BOT_TOKEN, chatId, '📭 درخواست شارژ در انتظاری وجود ندارد.');
  }
  for (const req of pending.slice(-10)) {
    await sendPhoto(config.BOT_TOKEN, chatId, req.receiptFileId, formatWalletRequestMessage(req), {
      reply_markup: walletRequestAdminKeyboard(req.id, req.status),
    });
  }
}

async function handleWalletAdjustStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_wallet_adjust_id';
  session.data = {};
  setSession(`admin_${fromId}`, session);
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    '👤 یک پیام از کاربر مورد نظر برای ما «فوروارد» کنید، یا مستقیماً آیدی عددی او را ارسال کنید:'
  );
}

// ---------- مدیریت ادمین‌ها (اینلاین + تعاملی) ----------

async function handleAdminsManagementMenu(chatId, config) {
  let text = '👤 <b>مدیریت ادمین‌ها</b>\n\n';
  text += `👑 ادمین اصلی (غیرقابل حذف): <code>${config.ADMIN_USER_ID}</code>\n`;
  if (DB.admins.size > 0) {
    text += '\nادمین‌های اضافه‌شده:\n';
    for (const id of DB.admins) {
      text += `🔹 <code>${id}</code>\n`;
    }
  } else {
    text += '\nادمین اضافه‌ای ثبت نشده است.\n';
  }
  text += '\nبرای افزودن یا حذف ادمین از دکمه‌های زیر استفاده کنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: adminsAdminInlineKeyboard() });
}

async function handleAdminAddStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_admin_id';
  session.data = {};
  setSession(`admin_${fromId}`, session);
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    '👤 یک پیام از کاربر مورد نظر برای ما «فوروارد» کنید، یا مستقیماً آیدی عددی او را ارسال کنید:'
  );
}

async function handleAdminDelete(callbackQuery, targetId, config) {
  if (targetId === config.ADMIN_USER_ID) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⛔ ادمین اصلی قابل حذف نیست.', true);
  }
  DB.admins.delete(targetId);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '🗑 ادمین حذف شد و برای همیشه ذخیره شد.');
  return handleAdminsManagementMenu(callbackQuery.message.chat.id, config);
}

// ---------- تنظیمات فروشگاه (اینلاین + تعاملی) ----------

async function handleSettingsMenu(chatId, config) {
  let text = '⚙️ <b>تنظیمات فروشگاه</b>\n\n';
  for (const field of Object.keys(SETTINGS_FIELDS)) {
    text += `${SETTINGS_FIELDS[field]}: <code>${escapeHtml(config[field])}</code>\n`;
  }
  text += '\nℹ️ توکن ربات (BOT_TOKEN) از اینجا قابل تغییر نیست و فقط باید در تنظیمات Cloudflare Worker (Secret) عوض شود.';
  text += '\n\nبرای تغییر هر مورد، روی دکمه مربوطه بزنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: settingsInlineKeyboard() });
}

// کیبورد انتخاب رنگ برای یک دکمه خاص از منوی اصلی
function btnStyleKeyboard(config) {
  const rows = Object.keys(BTN_STYLE_TARGETS).map((key) => {
    const current = config[key] || '';
    return BTN_STYLE_CHOICES.map((choice) => ({
      text: `${choice.value === current ? '✅' : choice.emoji} ${choice.label}`,
      callback_data: `btnstyle_set:${key}:${choice.value}`,
    }));
  });
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

// کیبورد انتخاب رنگ سراسری برای دکمه‌های شیشه‌ای (اینلاین) ربات — یک ردیف
// برای دکمه‌های اصلی و یک ردیف جدا برای دکمه «بازگشت به منوی قبلی»
function glassStyleKeyboard(config) {
  const rows = Object.keys(GLASS_STYLE_TARGETS).map((key) => {
    const current = config[key] || '';
    return GLASS_BTN_STYLE_CHOICES.map((choice) => ({
      text: `${choice.value === current ? '✅' : choice.emoji} ${choice.label}`,
      callback_data: `glassstyle_set:${key}:${choice.value}`,
    }));
  });
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

async function handleGlassStyleMenu(chatId, config) {
  let text =
    '🎨 <b>رنگ دکمه‌های شیشه‌ای (اینلاین)</b>\n\n' +
    'این تنظیم روی همه دکمه‌های شیشه‌ای ربات در همه بخش‌ها (فروشگاه، ادمین، اشتراک‌ها و ...) یکجا اعمال می‌شود؛ دکمه «بازگشت به منوی قبلی» جدا و با رنگ خودش تنظیم می‌شود تا از بقیه دکمه‌ها متمایز باشد.\n' +
    'دکمه‌هایی که از قبل رنگ اختصاصی دارند (مثل دکمه‌های تبلیغ در کانال) تحت تاثیر قرار نمی‌گیرند.\n\n';
  for (const key of Object.keys(GLASS_STYLE_TARGETS)) {
    const target = GLASS_STYLE_TARGETS[key];
    const current = GLASS_BTN_STYLE_CHOICES.find((c) => c.value === (config[key] || '')) || GLASS_BTN_STYLE_CHOICES[0];
    text += `${current.emoji} ${target.title}\n`;
  }
  text += '\nبرای تغییر هر رنگ، از ردیف مربوطه در پایین انتخاب کنید:';
  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: glassStyleKeyboard(config) });
}

async function handleGlassStyleSet(callbackQuery, key, style, config, env) {
  if (!GLASS_STYLE_TARGETS[key]) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ مورد نامعتبر است.', true);
  }
  const validStyle = GLASS_BTN_STYLE_CHOICES.some((c) => c.value === style) ? style : '';
  if (!DB.settings) DB.settings = {};
  DB.settings[key] = validStyle;
  await saveState(env);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ رنگ دکمه‌های شیشه‌ای بروزرسانی شد.');
  return handleGlassStyleMenu(callbackQuery.message.chat.id, getConfig(env));
}

async function handleBtnStyleMenu(chatId, config) {
  let text = '🎨 <b>رنگ دکمه‌های منوی اصلی</b>\n\n';
  text += 'از نسخه Bot API 9.4 تلگرام، دکمه‌های ربات فقط می‌توانند یکی از سه رنگ ثابت را بگیرند: 🔵 آبی، 🟢 سبز، 🔴 قرمز (یا ⚪ بدون رنگ خاص/پیش‌فرض کلاینت). رنگ دلخواه (HEX) روی دکمه‌های واقعی چت پشتیبانی نمی‌شود.\n\n';
  for (const key of Object.keys(BTN_STYLE_TARGETS)) {
    const target = BTN_STYLE_TARGETS[key];
    const current = BTN_STYLE_CHOICES.find((c) => c.value === (config[key] || '')) || BTN_STYLE_CHOICES[0];
    text += `${current.emoji} ${target.title} («${escapeHtml(config[target.labelKey])}»)\n`;
  }
  text += '\nبرای تغییر رنگ هر دکمه، از ردیف مربوطه در پایین انتخاب کنید:';
  return sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: btnStyleKeyboard(config) });
}

async function handleBtnStyleSet(callbackQuery, key, style, config, env) {
  if (!BTN_STYLE_TARGETS[key]) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ دکمه نامعتبر است.', true);
  }
  const validStyle = BTN_STYLE_CHOICES.some((c) => c.value === style) ? style : '';
  if (!DB.settings) DB.settings = {};
  DB.settings[key] = validStyle;
  await saveState(env);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '✅ رنگ بروزرسانی شد.');
  return handleBtnStyleMenu(callbackQuery.message.chat.id, getConfig(env));
}

async function handleSettingEditStart(callbackQuery, field, config) {
  if (!SETTINGS_FIELDS[field]) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ فیلد نامعتبر است.', true);
  }
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_setting_value';
  session.data = { field };
  setSession(`admin_${fromId}`, session);

  const channelHint = field === 'CHANNEL_ID'
    ? '\n\nℹ️ اگر کانال شما <b>عمومی</b> است، کافی است @username یا لینک آن را بفرستید.\n' +
      'اگر کانال شما <b>خصوصی</b> است (لینک آن با t.me/+ شروع می‌شود)، آن لینک را مستقیماً '
      + 'نمی‌توان استفاده کرد؛ در عوض <b>یک پست از همان کانال را همین‌جا برای ربات فوروارد کنید</b> '
      + 'تا آیدی عددی صحیح خودکار ذخیره شود.'
    : '';
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `✏️ مقدار جدید برای «${SETTINGS_FIELDS[field]}» را ارسال کنید:\n\nمقدار فعلی: <code>${escapeHtml(config[field])}</code>${channelHint}`
  );
}

async function handleReferralCommissionPercentEditStart(callbackQuery, config) {
  const fromId = callbackQuery.from.id;
  const session = getSession(`admin_${fromId}`);
  session.step = 'awaiting_referral_commission_percent';
  session.data = {};
  setSession(`admin_${fromId}`, session);

  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `✏️ درصد پورسانت هر خرید را ارسال کنید (فقط عدد بین ۱ تا ۱۰۰):\n\nمقدار فعلی: <code>${config.REFERRAL_COMMISSION_PERCENT}</code>`
  );
}

// ============================================================
// ۶.۵ هندلرهای اشتراک (خرید، اشتراک من، تمدید، وضعیت)
// ============================================================

// 📦 اشتراک من — لیست اشتراک‌های ساخته‌شده روی پاسارگارد
async function handleMySubscriptions(chatId, userId, config) {
  const subs = listUserSubscriptions(userId);
  if (subs.length === 0) {
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      '📭 هنوز اشتراکی ندارید.\n\nبرای خرید، دکمه «🛒 خرید اشتراک» را بزنید.',
      { reply_markup: mainReplyKeyboard(config) }
    );
  }

  let text = `📦 <b>اشتراک‌های شما</b> (${subs.length} مورد)\n\n`;
  for (const sub of subs.slice(0, 10)) {
    const expirePart = sub.expireAt ? ` | انقضا: ${formatDate(sub.expireAt)}` : '';
    text +=
      `${PG_STATUS_LABEL[sub.status] || sub.status} | <b>${escapeHtml(sub.planTitle || '-')}</b>\n` +
      `   حجم: ${formatBytes(sub.dataLimitBytes)}${expirePart}\n` +
      `   <code>${escapeHtml(sub.subscriptionUrl || '—')}</code>\n\n`;
  }
  text += 'برای دیدن مصرف لحظه‌ای، روی دکمه اشتراک مورد نظر بزنید:';

  return sendMessage(config.BOT_TOKEN, chatId, text, {
    reply_markup: subscriptionsKeyboard(subs, 'substatus'),
  });
}

// 📊 وضعیت اشتراک — اگر یک اشتراک باشد مستقیم، وگرنه با انتخاب کاربر
async function handleSubscriptionStatusMenu(chatId, userId, config, env) {
  const subs = listUserSubscriptions(userId);
  if (subs.length === 0) {
    return sendMessage(config.BOT_TOKEN, chatId, '📭 اشتراک فعالی برای شما ثبت نشده است.', {
      reply_markup: mainReplyKeyboard(config),
    });
  }
  if (subs.length === 1) {
    return sendSubscriptionStatus(chatId, subs[0], config, env);
  }
  return sendMessage(config.BOT_TOKEN, chatId, '📊 وضعیت کدام اشتراک را می‌خواهید؟', {
    reply_markup: subscriptionsKeyboard(subs, 'substatus'),
  });
}

// وضعیت یک اشتراک را از پنل می‌گیرد و نمایش می‌دهد
async function sendSubscriptionStatus(chatId, sub, config, env) {
  const result = await syncSubscription(env, config, sub);
  if (!result.ok) {
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      `⚠️ در حال حاضر امکان دریافت وضعیت لحظه‌ای از پنل نبود.\n(${escapeHtml(result.error)})\n\n` +
        `آخرین اطلاعات ثبت‌شده:\n\n${formatSubscriptionStatus(result.sub)}`,
      { reply_markup: subscriptionActionsKeyboard(sub) }
    );
  }
  return sendMessage(config.BOT_TOKEN, chatId, formatSubscriptionStatus(result.sub), {
    reply_markup: subscriptionActionsKeyboard(result.sub),
  });
}

async function handleSubscriptionStatusCallback(callbackQuery, subId, config, env) {
  const sub = memGet(DB.subscriptions, subId);
  if (!sub || String(sub.userId) !== String(callbackQuery.from.id)) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ این اشتراک پیدا نشد.', true);
  }
  return sendSubscriptionStatus(callbackQuery.message.chat.id, sub, config, env);
}

// 🔄 تمدید اشتراک — طبق سیاست انتخاب‌شده، یک اشتراک تازه ساخته می‌شود
async function handleRenewMenu(chatId, userId, config) {
  const subs = listUserSubscriptions(userId);
  if (subs.length === 0) {
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      '📭 اشتراکی برای تمدید ندارید. ابتدا از «🛒 خرید اشتراک» یک بسته تهیه کنید.',
      { reply_markup: mainReplyKeyboard(config) }
    );
  }
  return sendMessage(
    config.BOT_TOKEN,
    chatId,
    '🔄 <b>تمدید اشتراک</b>\n\n' +
      'کدام اشتراک را می‌خواهید تمدید کنید؟\n' +
      'ℹ️ با تمدید، یک اشتراک تازه با لینک جدید برای شما ساخته می‌شود و اشتراک قبلی تا پایان اعتبارش کار می‌کند.',
    { reply_markup: subscriptionsKeyboard(subs, 'renew') }
  );
}

// کاربر اشتراک مورد نظر برای تمدید را انتخاب کرد → انتخاب بسته
async function handleRenewSelection(callbackQuery, subId, config) {
  const chatId = callbackQuery.message.chat.id;
  const sub = memGet(DB.subscriptions, subId);
  if (!sub || String(sub.userId) !== String(callbackQuery.from.id)) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ این اشتراک پیدا نشد.', true);
  }

  const user = memGet(DB.users, String(callbackQuery.from.id)) || {};
  const session = getSession(chatId);
  session.step = 'idle';
  session.data = {
    kind: ORDER_KIND.RENEW,
    renewOf: sub.id,
    customerName:
      user.lastOrderName || `${callbackQuery.from.first_name || ''} ${callbackQuery.from.last_name || ''}`.trim(),
  };
  setSession(chatId, session);

  return editMessageText(
    config.BOT_TOKEN,
    chatId,
    callbackQuery.message.message_id,
    `🔄 تمدید «${escapeHtml(sub.planTitle || '-')}»\n\nبسته مورد نظر برای تمدید را انتخاب کنید:`,
    { reply_markup: plansKeyboard(config) }
  );
}

// 🛒 خرید اشتراک — شروع فرآیند خرید جدید
async function handleBuyStart(chatId, config) {
  const session = getSession(chatId);
  session.step = 'idle';
  session.data = { kind: ORDER_KIND.NEW };
  setSession(chatId, session);
  return sendMessage(config.BOT_TOKEN, chatId, config.PRODUCT_SELECT_TEXT, {
    reply_markup: productsKeyboard(config),
  });
}

// ============================================================
// ۶.۶ بخش پاسارگارد در پنل ادمین
// ============================================================

async function handlePasarguardMenu(chatId, config, env) {
  const authMode = config.PG_API_TOKEN
    ? '🔑 API Key (X-Api-Key)'
    : config.PG_USERNAME && config.PG_PASSWORD
      ? '👤 نام کاربری/رمز (JWT از /api/admin/token)'
      : '❌ تنظیم نشده';

  ensurePlansLoaded();
  const plansWithoutTarget = DB.plans.filter(
    (p) => !p.templateId && (!Array.isArray(p.groupIds) || p.groupIds.length === 0)
  ).length;

  let text = '🛰 <b>اتصال پاسارگارد</b>\n\n';
  text += `🌐 آدرس پنل: <code>${escapeHtml(config.PG_BASE_URL || '— تنظیم نشده —')}</code>\n`;
  text += `🔐 روش احراز هویت: ${authMode}\n`;
  text += `🔗 پایه لینک اشتراک: <code>${escapeHtml(config.PG_SUB_BASE_URL || '—')}</code>\n`;
  text += `🧩 پیشوند نام کاربری: <code>${escapeHtml(config.PG_USERNAME_PREFIX)}</code>\n`;
  text += `🗄 دیتابیس D1: ${hasD1(env) ? '✅ متصل' : '❌ متصل نیست (فقط KV)'}\n`;
  text += `📦 تعداد اشتراک‌های ثبت‌شده: ${DB.subscriptions.size}\n\n`;

  // اگر چیزی ست نشده، دقیقاً بگو کدام متغیر
  const missing = pgMissingConfig(config);
  if (missing.length) {
    text +=
      `❌ <b>این مقدارها ست نشده‌اند:</b>\n` +
      missing.map((name) => `• <code>${escapeHtml(name)}</code>`).join('\n') +
      '\n\nراه ست کردن: <code>npx wrangler secret put NAME</code> یا در داشبورد Cloudflare:\n' +
      'Worker → Settings → Variables and Secrets → Add → (نوع Secret) → و بعد حتماً <b>Deploy</b>.\n' +
      '⚠️ نام متغیرها باید مو‌به‌مو همین باشد (حساس به حروف بزرگ/کوچک) و مقدار داخل کوتیشن گذاشته نشود.\n\n';
  }

  for (const warning of pgConfigWarnings(config)) {
    text += `⚠️ ${escapeHtml(warning)}\n\n`;
  }

  if (plansWithoutTarget > 0) {
    text +=
      `⚠️ <b>${plansWithoutTarget}</b> بسته نه گروه (group_ids) دارد و نه قالب (template).\n` +
      'کاربری که بدون گروه ساخته شود هیچ اینباند/کانفیگی نخواهد داشت. از «📋 دریافت لیست گروه‌ها» ' +
      'شناسه‌ها را بگیرید و در «📦 مدیریت بسته‌ها» ست کنید.\n\n';
  }

  text += 'برای بررسی اتصال از دکمه‌های زیر استفاده کنید:';
  await sendMessage(config.BOT_TOKEN, chatId, text, { reply_markup: pasarguardAdminKeyboard() });
  return handlePgRecentErrors(chatId, config, env);
}

// آخرین خطاهای ثبت‌شده در D1 — برای عیب‌یابی سریع ساخت اشتراک
async function handlePgRecentErrors(chatId, config, env) {
  if (!hasD1(env)) return null;
  const rows = await d1All(
    env,
    `SELECT level, scope, message, created_at FROM logs
     WHERE level IN ('error', 'warn') ORDER BY created_at DESC LIMIT 5`
  );
  if (!rows.length) return null;
  let text = '🧾 <b>آخرین خطاهای ثبت‌شده</b>\n\n';
  for (const row of rows) {
    const when = formatDate(Number(row.created_at) * 1000);
    text += `${row.level === 'error' ? '🔴' : '🟠'} [${escapeHtml(String(row.scope || '-'))}] ${escapeHtml(
      String(row.message || '')
    )}\n<i>${when}</i>\n\n`;
  }
  return sendMessage(config.BOT_TOKEN, chatId, text);
}

async function handlePgPing(callbackQuery, config, env) {
  const chatId = callbackQuery.message.chat.id;
  if (!pgConfigured(config)) {
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      '❌ اتصال تنظیم نشده است. این مقدارها ست نشده‌اند:\n' +
        pgMissingConfig(config)
          .map((name) => `• <code>${escapeHtml(name)}</code>`)
          .join('\n')
    );
  }
  try {
    const result = await pgPing(env, config);
    const who = result.admin ? `\n👤 ادمین متصل: <code>${escapeHtml(result.admin)}</code>` : '';
    return sendMessage(
      config.BOT_TOKEN,
      chatId,
      `✅ اتصال به پنل برقرار است.\n🔗 مسیر بررسی: <code>${result.via}</code>${who}`
    );
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص';
    await dbLog(env, 'error', 'pasarguard', `ping failed: ${message}`);
    return sendMessage(config.BOT_TOKEN, chatId, `❌ اتصال برقرار نشد.\n\n${escapeHtml(message)}`);
  }
}

async function handlePgGroups(callbackQuery, config, env) {
  const chatId = callbackQuery.message.chat.id;
  try {
    const data = await pgListGroups(env, config);
    const groups = (data && data.groups) || [];
    if (groups.length === 0) {
      return sendMessage(
        config.BOT_TOKEN,
        chatId,
        'ℹ️ هیچ گروهی در پنل ساخته نشده است. ابتدا در پنل پاسارگارد یک Group با اینباندهای دلخواه بسازید.'
      );
    }
    let text = '📋 <b>گروه‌های پنل پاسارگارد</b>\n\nاین شناسه‌ها را در «📦 مدیریت بسته‌ها» وارد کنید:\n\n';
    for (const group of groups.slice(0, 50)) {
      text += `🔹 <code>${group.id}</code> — ${escapeHtml(String(group.name || ''))}\n`;
    }
    text += '\nمثال ورودی برای یک بسته: <code>1,3</code>';
    return sendMessage(config.BOT_TOKEN, chatId, text);
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص';
    return sendMessage(config.BOT_TOKEN, chatId, `❌ دریافت گروه‌ها ناموفق بود.\n\n${escapeHtml(message)}`);
  }
}

/**
 * تست سرتاسری API: ساخت یک کاربر آزمایشی → خواندن آن → حذف آن.
 * چیزی در پنل باقی نمی‌ماند و روی اشتراک مشتری‌ها اثری ندارد.
 */
async function handlePgSelfTest(callbackQuery, config, env) {
  const chatId = callbackQuery.message.chat.id;
  ensurePlansLoaded();
  const sample = DB.plans[0] || {};
  const username = `${config.PG_USERNAME_PREFIX}_selftest_${Math.random().toString(36).slice(2, 8)}`;
  const steps = [];

  // پنل کاربر بدون گروه (یا با گروه ناموجود) را قبول نمی‌کند، پس اول گروه‌های
  // واقعی پنل را می‌گیریم و شناسه‌های بسته را با آن‌ها تطبیق می‌دهیم.
  let groupIds = normalizeGroupIds(sample.groupIds);
  if (!sample.templateId) {
    try {
      const data = await pgListGroups(env, config);
      const groups = (data && data.groups) || [];
      const realIds = groups.map((group) => Number(group.id));

      if (!groups.length) {
        steps.push('⚠️ در پنل هیچ گروهی ساخته نشده — اول در پاسارگارد یک Group با اینباندهای دلخواه بسازید');
        groupIds = [];
      } else {
        const invalid = groupIds.filter((id) => !realIds.includes(id));
        const valid = groupIds.filter((id) => realIds.includes(id));

        if (invalid.length) {
          steps.push(
            `⚠️ این شناسه‌های گروه در پنل وجود ندارند: <b>${invalid.join('، ')}</b>\n` +
              `   گروه‌های موجود: ${groups.map((g) => `<code>${g.id}</code> (${escapeHtml(String(g.name))})`).join(' , ')}`
          );
        }

        groupIds = valid.length ? valid : [realIds[0]];
        if (!valid.length) {
          steps.push(
            `ℹ️ برای این تست از گروه «${escapeHtml(String(groups[0].name))}» (${groups[0].id}) استفاده شد`
          );
        }
      }
    } catch (err) {
      steps.push(`⚠️ دریافت گروه‌ها ناموفق بود: ${escapeHtml(err instanceof PgError ? err.message : 'خطای نامشخص')}`);
    }
  }

  const plan = {
    id: 'selftest',
    title: 'تست اتصال',
    gb: 1,
    days: 0, // کانفیگ‌ها بدون تاریخ انقضا ساخته می‌شوند
    price: 0,
    groupIds,
    templateId: sample.templateId || null,
    onHold: false,
  };

  let created = null;
  try {
    created = plan.templateId
      ? await pgCreateUserFromTemplate(env, config, plan.templateId, username, 'تست اتصال ربات')
      : await pgCreateUser(env, config, buildUserCreatePayload(plan, username, 'تست اتصال ربات'));
    const normalized = normalizePgUser(config, created);
    steps.push(`✅ ساخت کاربر: <code>${escapeHtml(normalized.pgUsername)}</code>`);
    steps.push(`✅ لینک اشتراک: <code>${escapeHtml(normalized.subscriptionUrl || '—')}</code>`);
    steps.push(`✅ حجم/انقضا: ${formatBytes(normalized.dataLimitBytes)} | ${formatDate(normalized.expireAt)}`);
  } catch (err) {
    steps.push(
      `❌ ساخت کاربر: ${escapeHtml(err instanceof PgError ? err.message : 'خطای نامشخص')}${pgErrorHint(err, plan)}`
    );
  }

  if (created) {
    try {
      await pgGetUser(env, config, username);
      steps.push('✅ خواندن وضعیت کاربر');
    } catch (err) {
      steps.push(`❌ خواندن وضعیت: ${escapeHtml(err instanceof PgError ? err.message : 'خطای نامشخص')}`);
    }
    try {
      await pgDeleteUser(env, config, username);
      steps.push('✅ حذف کاربر آزمایشی (چیزی در پنل باقی نماند)');
    } catch (err) {
      steps.push(
        `⚠️ حذف کاربر آزمایشی ناموفق بود، آن را دستی حذف کنید: <code>${escapeHtml(username)}</code>\n` +
          escapeHtml(err instanceof PgError ? err.message : 'خطای نامشخص')
      );
    }
  }

  await dbLog(env, 'info', 'pasarguard', 'self test executed', { username });
  return sendMessage(config.BOT_TOKEN, chatId, `🧪 <b>تست سرتاسری API</b>\n\n${steps.join('\n')}`);
}

// ============================================================
// ۶.۷ مدیریت یک اشتراک توسط ادمین (دستور /sub)
//   این بخش عملیات‌های ویرایش/غیرفعال‌سازی/ریست/باطل‌کردن/حذف پنل را
//   در دسترس ادمین قرار می‌دهد.
// ============================================================

const ADMIN_EXTEND_DAYS = 30;

// جستجوی اشتراک با شناسه اشتراک یا نام کاربری پنل
function findSubscription(needle) {
  const key = String(needle || '').trim();
  if (!key) return null;
  const direct = memGet(DB.subscriptions, key);
  if (direct) return direct;
  for (const sub of DB.subscriptions.values()) {
    if (sub.pgUsername === key) return sub;
  }
  return null;
}

function adminSubKeyboard(sub) {
  const disabled = sub.status === 'disabled';
  const rows = [
    [
      { text: disabled ? '✅ فعال‌سازی' : '🚫 غیرفعال‌سازی', callback_data: `sadm:toggle:${sub.id}` },
      { text: '🔁 ریست حجم مصرفی', callback_data: `sadm:reset:${sub.id}` },
    ],
    [
      { text: '♻️ لینک تازه (revoke)', callback_data: `sadm:revoke:${sub.id}` },
      { text: '🔄 بروزرسانی اطلاعات', callback_data: `sadm:sync:${sub.id}` },
    ],
  ];

  // دکمه تمدید تاریخ فقط برای اشتراک‌هایی معنا دارد که تاریخ انقضا دارند
  // (کانفیگ‌های این فروشگاه بدون انقضا ساخته می‌شوند)
  if (sub.expireAt) {
    rows.push([{ text: `📅 +${ADMIN_EXTEND_DAYS} روز اعتبار`, callback_data: `sadm:extend:${sub.id}` }]);
  }

  rows.push([{ text: '🗑 حذف کامل از پنل', callback_data: `sadm:del:${sub.id}` }]);
  rows.push(backNavRow('admin'));
  return { inline_keyboard: rows };
}

function formatAdminSubscription(sub) {
  const expireLine = sub.expireAt ? `\n📅 انقضا: ${formatDate(sub.expireAt)}` : '';
  return (
    `🛰 <b>اشتراک ${escapeHtml(sub.pgUsername)}</b>\n\n` +
    `👤 مشتری: <code>${escapeHtml(String(sub.userId))}</code>\n` +
    `📦 بسته: ${escapeHtml(sub.planTitle || '-')}\n` +
    `📌 وضعیت: ${PG_STATUS_LABEL[sub.status] || escapeHtml(sub.status)}\n` +
    `📶 حجم: ${formatBytes(sub.dataLimitBytes)} | مصرف: ${formatBytes(sub.usedTrafficBytes)}` +
    expireLine +
    `\n🆔 شناسه: <code>${escapeHtml(sub.id)}</code>\n` +
    `🔗 <code>${escapeHtml(sub.subscriptionUrl || '—')}</code>`
  );
}

// دستور ادمین: /sub <شناسه اشتراک یا نام کاربری پنل>
async function handleAdminSubLookup(message, config, env) {
  const chatId = message.chat.id;
  const needle = (message.text || '').replace(/^\/sub(@\S+)?\s*/i, '').trim();

  if (!needle) {
    const recent = [...DB.subscriptions.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    let text = '🛰 <b>مدیریت اشتراک</b>\n\nاستفاده: <code>/sub نام‌کاربری‌پنل</code>\n';
    if (recent.length) {
      text += '\nآخرین اشتراک‌ها:\n';
      for (const sub of recent.slice(0, 10)) {
        text += `🔹 <code>${escapeHtml(sub.pgUsername)}</code> — ${escapeHtml(sub.planTitle || '-')}\n`;
      }
    }
    return sendMessage(config.BOT_TOKEN, chatId, text);
  }

  const sub = findSubscription(needle);
  if (!sub) {
    return sendMessage(config.BOT_TOKEN, chatId, '❌ اشتراکی با این شناسه/نام کاربری در دیتابیس ربات پیدا نشد.');
  }

  await syncSubscription(env, config, sub);
  return sendMessage(config.BOT_TOKEN, chatId, formatAdminSubscription(sub), {
    reply_markup: adminSubKeyboard(sub),
  });
}

// اجرای عملیات ادمین روی اشتراک
async function handleAdminSubAction(callbackQuery, action, subId, config, env) {
  const chatId = callbackQuery.message.chat.id;
  const sub = memGet(DB.subscriptions, subId);
  if (!sub) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ اشتراک یافت نشد.', true);
  }

  try {
    if (action === 'toggle') {
      const disable = sub.status !== 'disabled';
      const updated = normalizePgUser(config, await pgSetUserDisabled(env, config, sub.pgUsername, disable));
      sub.status = updated.status;
      await sendMessage(
        config.BOT_TOKEN,
        chatId,
        disable ? '🚫 اشتراک در پنل غیرفعال شد.' : '✅ اشتراک در پنل فعال شد.'
      );
    } else if (action === 'reset') {
      const updated = normalizePgUser(config, await pgResetUserUsage(env, config, sub.pgUsername));
      sub.usedTrafficBytes = updated.usedTrafficBytes;
      await sendMessage(config.BOT_TOKEN, chatId, '🔁 حجم مصرفی این اشتراک صفر شد.');
    } else if (action === 'revoke') {
      const updated = normalizePgUser(config, await pgRevokeUserSub(env, config, sub.pgUsername));
      if (updated.subscriptionUrl) sub.subscriptionUrl = updated.subscriptionUrl;
      await sendMessage(
        config.BOT_TOKEN,
        chatId,
        '♻️ لینک قبلی باطل شد. لینک تازه برای مشتری ارسال می‌شود.'
      );
      await sendMessage(
        config.BOT_TOKEN,
        sub.chatId || sub.userId,
        `♻️ لینک اشتراک شما بازنشانی شد. لینک تازه:\n<code>${escapeHtml(sub.subscriptionUrl)}</code>`
      );
    } else if (action === 'extend') {
      if (!sub.expireAt || sub.status === 'on_hold') {
        await answerCallbackQuery(
          config.BOT_TOKEN,
          callbackQuery.id,
          'ℹ️ این اشتراک تاریخ انقضا ندارد و فقط با حجم محدود می‌شود.',
          true
        );
        return;
      }
      const base = Math.max(Date.now(), Number(sub.expireAt) || Date.now());
      const newExpire = Math.floor(base / 1000) + ADMIN_EXTEND_DAYS * 86400;
      const updated = normalizePgUser(config, await pgModifyUser(env, config, sub.pgUsername, { expire: newExpire }));
      sub.expireAt = updated.expireAt;
      sub.status = updated.status;
      await sendMessage(
        config.BOT_TOKEN,
        chatId,
        `📅 اعتبار تا ${formatDate(sub.expireAt)} تمدید شد.`
      );
      await sendMessage(
        config.BOT_TOKEN,
        sub.chatId || sub.userId,
        `📅 اعتبار اشتراک شما تا <b>${formatDate(sub.expireAt)}</b> تمدید شد.`
      );
    }
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص';
    await dbLog(env, 'error', 'pasarguard', `admin action ${action} failed: ${message}`, {}, {
      telegramId: sub.userId,
    });
    return sendMessage(config.BOT_TOKEN, chatId, `❌ عملیات انجام نشد.\n\n${escapeHtml(message)}`);
  }

  if (action === 'sync') await syncSubscription(env, config, sub);

  sub.lastSyncedAt = Date.now();
  memSet(DB.subscriptions, sub.id, sub);
  await dbSaveSubscription(env, sub);
  await dbLog(env, 'info', 'pasarguard', `admin action ${action}`, {}, { telegramId: sub.userId });

  return sendMessage(config.BOT_TOKEN, chatId, formatAdminSubscription(sub), {
    reply_markup: adminSubKeyboard(sub),
  });
}

// حذف اشتراک عملیاتی برگشت‌ناپذیر است، پس یک مرحله تایید دارد
async function handleAdminSubDeleteAsk(callbackQuery, subId, config) {
  const sub = memGet(DB.subscriptions, subId);
  if (!sub) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ اشتراک یافت نشد.', true);
  }
  return sendMessage(
    config.BOT_TOKEN,
    callbackQuery.message.chat.id,
    `⚠️ <b>حذف کامل اشتراک</b>\n\n` +
      `کاربر <code>${escapeHtml(sub.pgUsername)}</code> از پنل پاسارگارد حذف می‌شود و ` +
      `لینک اشتراک مشتری از کار می‌افتد. این کار برگشت‌ناپذیر است.\n\nمطمئن هستید؟`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗑 بله، حذف کن', callback_data: `sadm:delok:${sub.id}` },
            { text: '⚪ انصراف', callback_data: 'noop' },
          ],
        ],
      },
    }
  );
}

async function handleAdminSubDelete(callbackQuery, subId, config, env) {
  const chatId = callbackQuery.message.chat.id;
  const sub = memGet(DB.subscriptions, subId);
  if (!sub) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ اشتراک یافت نشد.', true);
  }

  try {
    await pgDeleteUser(env, config, sub.pgUsername);
  } catch (err) {
    const message = err instanceof PgError ? err.message : 'خطای نامشخص';
    if (!(err instanceof PgError) || err.status !== 404) {
      await dbLog(env, 'error', 'pasarguard', `delete failed: ${message}`, {}, { telegramId: sub.userId });
      return sendMessage(config.BOT_TOKEN, chatId, `❌ حذف انجام نشد.\n\n${escapeHtml(message)}`);
    }
  }

  sub.status = SUB_STATUS.REVOKED;
  sub.updatedAt = Date.now();
  memSet(DB.subscriptions, sub.id, sub);
  await dbSaveSubscription(env, sub);
  await dbLog(env, 'info', 'pasarguard', 'subscription deleted by admin', {}, { telegramId: sub.userId });

  return sendMessage(
    config.BOT_TOKEN,
    chatId,
    `🗑 اشتراک <code>${escapeHtml(sub.pgUsername)}</code> از پنل حذف و در دیتابیس ربات باطل شد.`
  );
}

// ---------- مسیریاب ورودی‌های متنی/فورواردی ادمین (بر اساس مرحله session) ----------

async function handleAdminAwaitingInput(message, config, env) {
  const fromId = message.from.id;
  if (!isAdmin(fromId, config)) return false;

  const session = getSession(`admin_${fromId}`);
  const text = (message.text || message.caption || '').trim();

  switch (session.step) {
    case 'awaiting_send_account': {
      const orderId = session.data.orderId;
      const order = memGet(DB.orders, orderId);
      if (!order) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ سفارش یافت نشد.');
        return true;
      }
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً اطلاعات اکانت را به‌صورت متن ارسال کنید.');
        return true;
      }
      await sendMessage(
        config.BOT_TOKEN,
        order.chatId,
        `📨 <b>اکانت شما آماده است!</b>\n\nسفارش: #${order.id} | ${escapeHtml(order.planTitle)}\n\n${escapeHtml(text)}`
      );
      order.status = ORDER_STATUS.SENT;
      order.updatedAt = Date.now();
      order.accountInfo = text;
      memSet(DB.orders, order.id, order);
      resetSession(`admin_${fromId}`);
      await sendMessage(config.BOT_TOKEN, message.chat.id, `✅ اکانت برای سفارش #${order.id} ارسال شد.`);
      return true;
    }

    case 'awaiting_card_bank': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً نام بانک را ارسال کنید.');
        return true;
      }
      session.data.bankName = text;
      session.step = 'awaiting_card_number';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '💳 شماره کارت را ارسال کنید:');
      return true;
    }

    case 'awaiting_card_number': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً شماره کارت را ارسال کنید.');
        return true;
      }
      session.data.number = text;
      session.step = 'awaiting_card_holder';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '👤 نام صاحب کارت را ارسال کنید:');
      return true;
    }

    case 'awaiting_card_holder': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً نام صاحب کارت را ارسال کنید.');
        return true;
      }
      const card = { id: cardSeq++, bankName: session.data.bankName, number: session.data.number, holder: text };
      memSet(DB.cards, card.id, card);
      resetSession(`admin_${fromId}`);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ کارت جدید ثبت شد و برای همیشه ذخیره شد.');
      await handleCardsManagementMenu(message.chat.id, config);
      return true;
    }

    case 'awaiting_tutorial_title': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً عنوان آموزش را ارسال کنید.');
        return true;
      }
      session.data.title = text;
      session.step = 'awaiting_tutorial_url';
      setSession(`admin_${fromId}`, session);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        '🔗 لینک آموزش را ارسال کنید (باید با http:// یا https:// شروع شود):'
      );
      return true;
    }

    case 'awaiting_tutorial_url': {
      const url = text.trim();
      if (!/^https?:\/\/\S+$/i.test(url)) {
        await sendMessage(
          config.BOT_TOKEN,
          message.chat.id,
          '⚠️ لینک نامعتبر است. لطفاً لینکی که با http:// یا https:// شروع می‌شود ارسال کنید:'
        );
        return true;
      }
      if (session.data.mode === 'edit' && session.data.tutorialId != null) {
        const existing = memGet(DB.tutorials, session.data.tutorialId);
        if (!existing) {
          resetSession(`admin_${fromId}`);
          await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ آموزش یافت نشد (شاید قبلاً حذف شده).');
          return true;
        }
        existing.title = session.data.title;
        existing.url = url;
        memSet(DB.tutorials, existing.id, existing);
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ آموزش ویرایش شد و برای همیشه ذخیره شد.');
      } else {
        const tutorial = { id: tutorialSeq++, title: session.data.title, url };
        memSet(DB.tutorials, tutorial.id, tutorial);
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ آموزش جدید ثبت شد و برای همیشه ذخیره شد.');
      }
      await handleTutorialsManagementMenu(message.chat.id, config);
      return true;
    }

    case 'awaiting_plan_title': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک عنوان معتبر ارسال کنید.');
        return true;
      }
      session.data.title = text;
      session.step = 'awaiting_plan_gb';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '📶 حجم بسته را به گیگابایت ارسال کنید (فقط عدد، ۰ = نامحدود):');
      return true;
    }

    case 'awaiting_plan_gb': {
      const gb = Number(text);
      if (!text || isNaN(gb) || gb < 0) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک عدد معتبر (۰ یا بیشتر) برای حجم ارسال کنید.');
        return true;
      }
      session.data.gb = gb;
      // کانفیگ‌ها تاریخ انقضا ندارند، پس مرحله «مدت اعتبار» پرسیده نمی‌شود
      session.data.days = 0;
      session.step = 'awaiting_plan_price';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '💰 قیمت بسته را به تومان ارسال کنید (فقط عدد):');
      return true;
    }

    case 'awaiting_plan_price': {
      const price = Number(text);
      if (!text || isNaN(price) || price < 0) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک عدد معتبر برای قیمت (تومان) ارسال کنید.');
        return true;
      }
      session.data.price = price;
      session.step = 'awaiting_plan_groups';
      setSession(`admin_${fromId}`, session);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        '🧩 شناسه گروه‌های پاسارگارد این بسته را با کاما ارسال کنید (مثلاً <code>1,3</code>).\n\n' +
          'برای دیدن شناسه‌ها: پنل ادمین ← «🛰 پاسارگارد» ← «📋 دریافت لیست گروه‌ها».\n' +
          '⚠️ اگر گروه ندهید و قالب هم تعیین نکنید، کاربر ساخته می‌شود ولی هیچ کانفیگی نخواهد داشت.\n' +
          'برای رد کردن این مرحله «-» بفرستید.'
      );
      return true;
    }

    case 'awaiting_plan_groups': {
      let groupIds = [];
      if (text && text !== '-') {
        groupIds = normalizeGroupIds(text.split(/[,\s;]+/));
        if (groupIds.length === 0) {
          await sendMessage(
            config.BOT_TOKEN,
            message.chat.id,
            '⚠️ فرمت نامعتبر است. نمونه صحیح: <code>1,3</code> — یا برای رد کردن «-» بفرستید.'
          );
          return true;
        }
      }
      session.data.groupIds = groupIds;
      session.step = 'awaiting_plan_template';
      setSession(`admin_${fromId}`, session);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        '🧾 اگر می‌خواهید این بسته از «قالب کاربری» پنل ساخته شود، شناسه عددی قالب ' +
          '(user_template_id) را ارسال کنید.\n\n' +
          'در این حالت حجم و مدت از خود قالب پنل خوانده می‌شود.\n' +
          'برای استفاده از حجم/مدتی که همین‌جا وارد کردید، «-» بفرستید.'
      );
      return true;
    }

    case 'awaiting_plan_template': {
      let templateId = null;
      if (text && text !== '-') {
        const parsed = Number(text);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          await sendMessage(
            config.BOT_TOKEN,
            message.chat.id,
            '⚠️ شناسه قالب باید یک عدد صحیح مثبت باشد — یا برای رد کردن «-» بفرستید.'
          );
          return true;
        }
        templateId = parsed;
      }

      ensurePlansLoaded();
      let savedPlan = null;

      if (session.data.mode === 'edit') {
        const plan = DB.plans.find((p) => p.id === session.data.planId);
        if (plan) {
          plan.title = session.data.title;
          plan.gb = session.data.gb;
          plan.days = 0;
          plan.price = session.data.price;
          plan.groupIds = session.data.groupIds;
          plan.templateId = templateId;
          savedPlan = plan;
        }
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ بسته ویرایش شد و برای همیشه ذخیره شد.');
      } else {
        savedPlan = {
          id: `custom${planSeq++}`,
          title: session.data.title,
          gb: session.data.gb,
          days: 0,
          price: session.data.price,
          groupIds: session.data.groupIds,
          templateId,
          onHold: false,
        };
        DB.plans.push(savedPlan);
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ بسته جدید اضافه شد و برای همیشه ذخیره شد.');
      }

      if (savedPlan) await dbSyncPlan(env, savedPlan);
      await handlePlansManagementMenu(message.chat.id, config);
      return true;
    }

    case 'awaiting_broadcast_message': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً متن پیام را ارسال کنید.');
        return true;
      }
      resetSession(`admin_${fromId}`);
      const broadcastUsers = [...DB.users.values()];
      let broadcastOk = 0;
      let broadcastFail = 0;
      await sendMessage(config.BOT_TOKEN, message.chat.id, `⏳ در حال ارسال پیام به <b>${broadcastUsers.length}</b> کاربر...`);
      for (const u of broadcastUsers) {
        try {
          const targetChatId = u.chatId || u.id;
          await sendMessage(
            config.BOT_TOKEN,
            targetChatId,
            `📢 <b>پیام مهم</b>\n\n${text}`
          );
          broadcastOk++;
        } catch (_e) {
          broadcastFail++;
        }
      }
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        `✅ پیام همگانی ارسال شد.\n\n` +
          `✔️ موفق: <b>${broadcastOk}</b>\n` +
          `❌ ناموفق (بلاک یا خطا): <b>${broadcastFail}</b>`
      );
      return true;
    }

    case 'awaiting_test_configs_bulk': {
      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً حداقل یک کانفیگ به‌صورت متن ارسال کنید.');
        return true;
      }
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ هیچ خط معتبری پیدا نشد. لطفاً دوباره ارسال کنید.');
        return true;
      }

      const remaining = MAX_TEST_CONFIGS - DB.testConfigs.length;
      if (remaining <= 0) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, `⛔ ظرفیت پر است (حداکثر ${MAX_TEST_CONFIGS} کانفیگ).`);
        await handleTestConfigsManagementMenu(message.chat.id, config);
        return true;
      }

      const toAdd = lines.slice(0, remaining);
      const dropped = lines.length - toAdd.length;

      for (const line of toAdd) {
        DB.testConfigs.push({ id: testConfigSeq++, text: line, used: false, usedByUserId: null, usedAt: null });
      }

      resetSession(`admin_${fromId}`);

      let confirmText = `✅ ${toAdd.length} کانفیگ تست اضافه شد و برای همیشه ذخیره شد.`;
      if (dropped > 0) {
        confirmText += `\n⚠️ ${dropped} خط دیگر به‌دلیل پر شدن ظرفیت (سقف ${MAX_TEST_CONFIGS} عدد) اضافه نشد.`;
      }
      await sendMessage(config.BOT_TOKEN, message.chat.id, confirmText);
      await handleTestConfigsManagementMenu(message.chat.id, config);
      return true;
    }

    case 'awaiting_admin_id': {
      let newId = null;
      if (message.forward_from && message.forward_from.id) {
        newId = String(message.forward_from.id);
      } else if (/^\d+$/.test(text)) {
        newId = text;
      }
      if (!newId) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ پیام معتبر نبود. یک پیام از کاربر فوروارد کنید یا آیدی عددی او را ارسال کنید.');
        return true;
      }
      DB.admins.add(newId);
      resetSession(`admin_${fromId}`);
      await sendMessage(config.BOT_TOKEN, message.chat.id, `✅ کاربر <code>${newId}</code> به‌عنوان ادمین اضافه شد و برای همیشه ذخیره شد.`);
      await handleAdminsManagementMenu(message.chat.id, config);
      return true;
    }

    case 'awaiting_wallet_adjust_id': {
      let targetId = null;
      if (message.forward_from && message.forward_from.id) {
        targetId = String(message.forward_from.id);
      } else if (/^\d+$/.test(text)) {
        targetId = text;
      }
      if (!targetId) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ پیام معتبر نبود. یک پیام از کاربر فوروارد کنید یا آیدی عددی او را ارسال کنید.');
        return true;
      }
      session.data.targetId = targetId;
      session.step = 'awaiting_wallet_adjust_amount';
      setSession(`admin_${fromId}`, session);
      const currentBalance = getWallet(targetId);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        `👤 کاربر: <code>${targetId}</code>\n💰 موجودی فعلی: ${currentBalance.toLocaleString()} تومان\n\n` +
          'مبلغ تغییر را ارسال کنید. برای افزایش موجودی با + و برای کاهش با - شروع کنید، مثلاً:\n<code>+50000</code> یا <code>-20000</code>'
      );
      return true;
    }

    case 'awaiting_wallet_adjust_amount': {
      const match = /^([+-])\s*(\d+)$/.exec(text);
      if (!match) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ فرمت نامعتبر است. مثال صحیح: +50000 یا -20000');
        return true;
      }
      const sign = match[1] === '-' ? -1 : 1;
      const amount = Number(match[2]) * sign;
      const targetId = session.data.targetId;
      const user = memGet(DB.users, targetId) || { id: targetId, orders: [], walletBalance: 0 };
      const newBalance = (user.walletBalance || 0) + amount;
      if (newBalance < 0) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ موجودی نمی‌تواند منفی شود.');
        return true;
      }
      user.walletBalance = newBalance;
      memSet(DB.users, targetId, user);
      await dbSyncUserWallet(env, targetId, newBalance);
      resetSession(`admin_${fromId}`);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        `✅ موجودی کاربر <code>${targetId}</code> بروزرسانی شد.\nموجودی جدید: ${newBalance.toLocaleString()} تومان`
      );
      await sendMessage(
        config.BOT_TOKEN,
        targetId,
        `💰 موجودی کیف پول شما توسط ادمین بروزرسانی شد.\nموجودی جدید: <b>${newBalance.toLocaleString()} تومان</b>`
      );
      return true;
    }

    case 'awaiting_setting_value': {
      const field = session.data.field;
      if (!SETTINGS_FIELDS[field]) {
        resetSession(`admin_${fromId}`);
        return true;
      }

      // ---- مورد خاص: تنظیم آیدی کانال ----
      if (field === 'CHANNEL_ID') {
        // اگر ادمین یک پست از کانال را فوروارد کند، آیدی عددی صحیح (حتی برای
        // کانال خصوصی) از روی خود پیام استخراج می‌شود — این تنها راه مطمئن
        // برای گرفتن chat_id قابل استفاده در کانال‌های خصوصی است.
        const forwardedChat = message.forward_from_chat
          || (message.forward_origin && message.forward_origin.chat)
          || null;
        if (forwardedChat && forwardedChat.type === 'channel') {
          const channelId = String(forwardedChat.id);
          if (!DB.settings) DB.settings = {};
          DB.settings.CHANNEL_ID = channelId;
          resetSession(`admin_${fromId}`);
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            `✅ آیدی کانال «${escapeHtml(forwardedChat.title || '')}» با موفقیت ثبت شد.\n` +
            `مقدار ذخیره‌شده: <code>${channelId}</code>\n\n` +
            '⚠️ یادتان باشد ربات باید در این کانال «ادمین» باشد تا بتواند پیام ارسال کند و عضویت را چک کند.');
          return true;
        }
        if (!text) {
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            '⚠️ لطفاً @username کانال را بفرستید، یا یک پست از کانال را فوروارد کنید.');
          return true;
        }
        const normalized = normalizeChannelIdInput(text);
        if (normalized.invitelink) {
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            '⚠️ لینک‌های دعوت خصوصی (t.me/+...) را نمی‌توان مستقیماً به‌عنوان آیدی کانال استفاده کرد ' +
            '(همان علت خطای «chat not found»).\n\n' +
            '👉 راه‌حل: یک پست از همین کانال را همین‌جا برای ربات <b>فوروارد</b> کنید تا آیدی عددی صحیح ' +
            'خودکار استخراج و ذخیره شود.\n\n' +
            'نکته: ربات باید از قبل در آن کانال «ادمین» باشد.');
          return true;
        }
        if (!DB.settings) DB.settings = {};
        DB.settings.CHANNEL_ID = normalized.value;
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          `✅ «${SETTINGS_FIELDS[field]}» بروزرسانی شد و برای همیشه ذخیره شد.\nمقدار جدید: <code>${escapeHtml(normalized.value)}</code>\n\n` +
          '⚠️ یادتان باشد ربات باید در این کانال «ادمین» باشد.');
        return true;
      }

      if (!text) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک مقدار معتبر ارسال کنید.');
        return true;
      }
      if ((field === 'INVITE_TEXT' && text.length > 1000) ||
          (field === 'BTN_INVITE_LABEL' && (text.length > 64 || /[\r\n]/.test(text)))) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          '⚠️ متن دعوت حداکثر ۱۰۰۰ کاراکتر و نام دکمه حداکثر ۶۴ کاراکتر در یک خط باشد.');
        return true;
      }
      if (field === 'BTN_INVITE_LABEL' && (text.startsWith('/') ||
          Object.keys(SETTINGS_FIELDS).some(key => key.startsWith('BTN_') && key !== field && config[key] === text) ||
          adminReplyKeyboard().keyboard.flat().some(button => button.text === text))) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ نام دکمه باید با سایر دکمه‌ها و دستورات متفاوت باشد.');
        return true;
      }
      if (!DB.settings) DB.settings = {};
      DB.settings[field] = text;
      resetSession(`admin_${fromId}`);
      await sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        `✅ «${SETTINGS_FIELDS[field]}» بروزرسانی شد و برای همیشه ذخیره شد.\nمقدار جدید: <code>${escapeHtml(text)}</code>`
      );
      if (field === 'INVITE_TEXT' || field === 'BTN_INVITE_LABEL') {
        await handleReferralAdminMenu(message.chat.id, getConfig(env));
      }
      return true;
    }

    case 'awaiting_referral_commission_percent': {
      const percent = Number(text);
      if (!text || isNaN(percent) || percent <= 0 || percent > 100) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک عدد معتبر بین ۱ تا ۱۰۰ ارسال کنید.');
        return true;
      }
      if (!DB.settings) DB.settings = {};
      DB.settings.REFERRAL_COMMISSION_PERCENT = percent;
      resetSession(`admin_${fromId}`);
      await sendMessage(config.BOT_TOKEN, message.chat.id, `✅ درصد پورسانت به ${percent}٪ بروزرسانی شد.`);
      await handleReferralAdminMenu(message.chat.id, getConfig(env));
      return true;
    }

    case 'awaiting_ad_channel_id': {
      // اگر ادمین یک پست از کانال را فوروارد کند، آیدی عددی صحیح (حتی برای
      // کانال خصوصی) از روی خود پیام استخراج می‌شود.
      const forwardedChat = message.forward_from_chat
        || (message.forward_origin && message.forward_origin.chat)
        || null;
      let channelId = null;
      let channelLabel = '';
      if (forwardedChat && forwardedChat.type === 'channel') {
        channelId = String(forwardedChat.id);
        channelLabel = forwardedChat.title || '';
      } else if (text && /^-?\d{3,20}$/.test(text.trim())) {
        channelId = text.trim();
      } else {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          '⚠️ این مقدار آیدی عددی معتبر یک کانال نیست.\n\n' +
          'یا فقط رقم‌های آیدی عددی کانال را بفرستید (مثل <code>-1001234567890</code>)، ' +
          'یا یک پست از همان کانال را همین‌جا برای ربات فوروارد کنید.');
        return true;
      }
      // توجه: این مقدار فقط برای همین آگهی در سشن نگه داشته می‌شود و هیچ‌وقت
      // در DB.settings.CHANNEL_ID (کانال پیش‌فرض) نوشته نمی‌شود.
      session.data.channelId = channelId;
      session.step = 'awaiting_ad_text';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id,
        `✅ کانال مقصد این آگهی ثبت شد: <code>${escapeHtml(channelId)}</code>${channelLabel ? ` (${escapeHtml(channelLabel)})` : ''}\n\n` +
        `📝 حالا متن آگهی را ارسال کنید (حداکثر ${AD_TEXT_MAX} کاراکتر، HTML پشتیبانی می‌شود):`);
      return true;
    }

    case 'awaiting_ad_text': {
      if (!text || text.length > AD_TEXT_MAX) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, `⚠️ لطفاً متنی بین ۱ تا ${AD_TEXT_MAX} کاراکتر ارسال کنید.`);
        return true;
      }
      session.data.text = text;
      session.step = 'awaiting_ad_photo';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id,
        '🖼 عکس آگهی را ارسال کنید (اختیاری).\nاگر عکس نمی‌خواهید، دستور /skip را بفرستید.');
      return true;
    }

    case 'awaiting_ad_photo': {
      if (text === '/skip') {
        session.data.photoFileId = null;
      } else if (message.photo && message.photo.length > 0) {
        session.data.photoFileId = message.photo[message.photo.length - 1].file_id;
      } else {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          '⚠️ لطفاً یک عکس ارسال کنید یا برای رد کردن /skip را بفرستید.');
        return true;
      }
      session.step = 'awaiting_ad_button_text';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id,
        `🔘 متن دکمه شیشه‌ای زیر آگهی را ارسال کنید (حداکثر ${AD_BUTTON_TEXT_MAX} کاراکتر؛ مثلاً «🛒 خرید اشتراک»).\n` +
        `برای استفاده از دکمه پیش‌فرض «${config.AD_DEFAULT_BUTTON_TEXT}» → ${describeAdDefaultButtonUrl(config)} دستور /default را بفرستید.\n` +
        'اگر دکمه نمی‌خواهید، دستور /skip را بفرستید.');
      return true;
    }

    case 'awaiting_ad_button_text': {
      if (text === '/skip') {
        session.data.buttonText = null;
        session.data.buttonUrl = null;
        const chatId = message.chat.id;
        const ad = await finalizeNewChannelAd(config, chatId, session);
        resetSession(`admin_${fromId}`);
        if (ad) {
          await sendMessage(config.BOT_TOKEN, chatId, '✅ آگهی با موفقیت در کانال ارسال شد.');
          await handleChannelAdMenu(chatId, config);
        }
        return true;
      }
      if (text === '/default') {
        const resolvedUrl = await resolveAdButtonUrl(config, config.AD_DEFAULT_BUTTON_URL);
        if (!resolvedUrl) {
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            '⚠️ ساخت لینک پیش‌فرض «خرید اشتراک» ممکن نشد (دریافت اطلاعات ربات ناموفق بود). کمی بعد دوباره امتحان کنید یا یک لینک دستی وارد کنید.');
          return true;
        }
        session.data.buttonText = config.AD_DEFAULT_BUTTON_TEXT;
        session.data.buttonUrl = resolvedUrl;
        const chatId = message.chat.id;
        const ad = await finalizeNewChannelAd(config, chatId, session);
        resetSession(`admin_${fromId}`);
        if (ad) {
          await sendMessage(config.BOT_TOKEN, chatId, '✅ آگهی با دکمه پیش‌فرض «خرید اشتراک» در کانال ارسال شد.');
          await handleChannelAdMenu(chatId, config);
        }
        return true;
      }
      if (!text || text.length > AD_BUTTON_TEXT_MAX) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, `⚠️ متن دکمه باید بین ۱ تا ${AD_BUTTON_TEXT_MAX} کاراکتر باشد.`);
        return true;
      }
      session.data.buttonText = text;
      session.step = 'awaiting_ad_button_url';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id,
        '🔗 لینک دکمه را ارسال کنید (باید با http:// یا https:// یا tg:// شروع شود):');
      return true;
    }

    case 'awaiting_ad_button_url': {
      if (!isValidButtonUrl(text)) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          '⚠️ لینک نامعتبر است. باید با http:// یا https:// یا tg:// شروع شود.');
        return true;
      }
      session.data.buttonUrl = text.trim();
      const chatId = message.chat.id;
      const ad = await finalizeNewChannelAd(config, chatId, session);
      resetSession(`admin_${fromId}`);
      if (ad) {
        await sendMessage(config.BOT_TOKEN, chatId, '✅ آگهی با موفقیت در کانال ارسال شد.');
        await handleChannelAdMenu(chatId, config);
      }
      return true;
    }

    case 'awaiting_ad_edit_text': {
      const ad = memGet(DB.channelAds, session.data.adId);
      if (!ad) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ آگهی یافت نشد (شاید حذف شده).');
        return true;
      }
      if (!text || text.length > AD_TEXT_MAX) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, `⚠️ لطفاً متنی بین ۱ تا ${AD_TEXT_MAX} کاراکتر ارسال کنید.`);
        return true;
      }
      ad.text = text;
      ad.updatedAt = Date.now();
      memSet(DB.channelAds, ad.id, ad);
      const keyboard = adBuildKeyboard(ad);
      const result = ad.photoFileId
        ? await editMessageCaption(config.BOT_TOKEN, ad.chatId, ad.messageId, ad.text, { reply_markup: keyboard })
        : await editMessageText(config.BOT_TOKEN, ad.chatId, ad.messageId, ad.text, { reply_markup: keyboard });
      resetSession(`admin_${fromId}`);
      if (!result || !result.ok) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          `⚠️ متن در دیتابیس بروزرسانی شد اما ویرایش پیام کانال ناموفق بود: ${(result && result.description) || 'خطای نامشخص'}`);
      } else {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ متن آگهی بروزرسانی شد.');
      }
      await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
        reply_markup: channelAdDetailKeyboard(ad),
      });
      return true;
    }

    case 'awaiting_ad_edit_photo': {
      const ad = memGet(DB.channelAds, session.data.adId);
      if (!ad) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ آگهی یافت نشد (شاید حذف شده).');
        return true;
      }
      if (!message.photo || message.photo.length === 0) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '⚠️ لطفاً یک عکس ارسال کنید.');
        return true;
      }
      const newFileId = message.photo[message.photo.length - 1].file_id;
      const result = await editMessageMedia(config.BOT_TOKEN, ad.chatId, ad.messageId, {
        type: 'photo',
        media: newFileId,
        caption: ad.text,
        parse_mode: 'HTML',
      }, { reply_markup: adBuildKeyboard(ad) });
      resetSession(`admin_${fromId}`);
      if (!result || !result.ok) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          `⚠️ تعویض عکس ناموفق بود: ${(result && result.description) || 'خطای نامشخص'}`);
        return true;
      }
      ad.photoFileId = newFileId;
      ad.updatedAt = Date.now();
      memSet(DB.channelAds, ad.id, ad);
      await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ عکس آگهی بروزرسانی شد.');
      await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
        reply_markup: channelAdDetailKeyboard(ad),
      });
      return true;
    }

    case 'awaiting_ad_edit_button_text': {
      const ad = memGet(DB.channelAds, session.data.adId);
      if (!ad) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ آگهی یافت نشد (شاید حذف شده).');
        return true;
      }
      if (text === '/remove') {
        ad.buttonText = null;
        ad.buttonUrl = null;
        ad.updatedAt = Date.now();
        memSet(DB.channelAds, ad.id, ad);
        await editMessageReplyMarkup(config.BOT_TOKEN, ad.chatId, ad.messageId, { inline_keyboard: [] });
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ دکمه حذف شد.');
        await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
          reply_markup: channelAdDetailKeyboard(ad),
        });
        return true;
      }
      if (text === '/default') {
        const resolvedUrl = await resolveAdButtonUrl(config, config.AD_DEFAULT_BUTTON_URL);
        if (!resolvedUrl) {
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            '⚠️ ساخت لینک پیش‌فرض «خرید اشتراک» ممکن نشد (دریافت اطلاعات ربات ناموفق بود). کمی بعد دوباره امتحان کنید یا یک لینک دستی وارد کنید.');
          return true;
        }
        ad.buttonText = config.AD_DEFAULT_BUTTON_TEXT;
        ad.buttonUrl = resolvedUrl;
        ad.updatedAt = Date.now();
        memSet(DB.channelAds, ad.id, ad);
        const result = await editMessageReplyMarkup(config.BOT_TOKEN, ad.chatId, ad.messageId, adBuildKeyboard(ad));
        resetSession(`admin_${fromId}`);
        if (!result || !result.ok) {
          await sendMessage(config.BOT_TOKEN, message.chat.id,
            `⚠️ دکمه در دیتابیس بروزرسانی شد اما ویرایش پیام کانال ناموفق بود: ${(result && result.description) || 'خطای نامشخص'}`);
        } else {
          await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ دکمه پیش‌فرض «خرید اشتراک» تنظیم شد.');
        }
        await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
          reply_markup: channelAdDetailKeyboard(ad),
        });
        return true;
      }
      if (!text || text.length > AD_BUTTON_TEXT_MAX) {
        await sendMessage(config.BOT_TOKEN, message.chat.id, `⚠️ متن دکمه باید بین ۱ تا ${AD_BUTTON_TEXT_MAX} کاراکتر باشد.`);
        return true;
      }
      session.data.buttonText = text;
      session.step = 'awaiting_ad_edit_button_url';
      setSession(`admin_${fromId}`, session);
      await sendMessage(config.BOT_TOKEN, message.chat.id,
        '🔗 لینک جدید دکمه را ارسال کنید (باید با http:// یا https:// یا tg:// شروع شود؛ برای حذف دکمه /remove را بفرستید):');
      return true;
    }

    case 'awaiting_ad_edit_button_url': {
      const ad = memGet(DB.channelAds, session.data.adId);
      if (!ad) {
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '❌ آگهی یافت نشد (شاید حذف شده).');
        return true;
      }
      if (text === '/remove') {
        ad.buttonText = null;
        ad.buttonUrl = null;
        ad.updatedAt = Date.now();
        memSet(DB.channelAds, ad.id, ad);
        await editMessageReplyMarkup(config.BOT_TOKEN, ad.chatId, ad.messageId, { inline_keyboard: [] });
        resetSession(`admin_${fromId}`);
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ دکمه حذف شد.');
        await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
          reply_markup: channelAdDetailKeyboard(ad),
        });
        return true;
      }
      if (!isValidButtonUrl(text)) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          '⚠️ لینک نامعتبر است. باید با http:// یا https:// یا tg:// شروع شود.');
        return true;
      }
      ad.buttonText = session.data.buttonText;
      ad.buttonUrl = text.trim();
      ad.updatedAt = Date.now();
      memSet(DB.channelAds, ad.id, ad);
      const result = await editMessageReplyMarkup(config.BOT_TOKEN, ad.chatId, ad.messageId, adBuildKeyboard(ad));
      resetSession(`admin_${fromId}`);
      if (!result || !result.ok) {
        await sendMessage(config.BOT_TOKEN, message.chat.id,
          `⚠️ دکمه در دیتابیس بروزرسانی شد اما ویرایش پیام کانال ناموفق بود: ${(result && result.description) || 'خطای نامشخص'}`);
      } else {
        await sendMessage(config.BOT_TOKEN, message.chat.id, '✅ دکمه آگهی بروزرسانی شد.');
      }
      await sendMessage(config.BOT_TOKEN, message.chat.id, `📣 <b>جزئیات آگهی</b>\n\n${formatAdPreview(ad)}`, {
        reply_markup: channelAdDetailKeyboard(ad),
      });
      return true;
    }

    default:
      return false;
  }
}

// ============================================================
// ۷. پردازش Webhook
// ============================================================

async function processUpdate(update, config, env) {
  try {
    // 🔍 لاگ تشخیصی موقت — برای پیدا کردن علت بی‌پاسخ ماندن ارسال عکس رسید.
    // بعد از رفع مشکل می‌توان این بلوک را حذف کرد.
    try {
      if (update.message) {
        const m = update.message;
        const sess = getSession(m.chat.id);
        console.log('DEBUG update.message', JSON.stringify({
          chatId: m.chat.id,
          fromId: m.from && m.from.id,
          hasText: Boolean(m.text),
          hasPhoto: Boolean(m.photo && m.photo.length),
          photoCount: m.photo ? m.photo.length : 0,
          hasDocument: Boolean(m.document),
          hasCaption: Boolean(m.caption),
          sessionStep: sess.step,
          sessionData: sess.data,
        }));
      } else if (update.callback_query) {
        console.log('DEBUG update.callback_query', JSON.stringify({
          fromId: update.callback_query.from && update.callback_query.from.id,
          data: update.callback_query.data,
        }));
      } else {
        console.log('DEBUG unknown update type', JSON.stringify(Object.keys(update)));
      }
    } catch (logErr) {
      console.error('DEBUG logging failed:', logErr);
    }

    if (update.message) {
      await processMessage(update.message, config, env);
    } else if (update.callback_query) {
      await processCallbackQuery(update.callback_query, config, env);
    }
  } catch (err) {
    console.error('processUpdate error:', err);
    // ⚠️ قبلاً در صورت بروز خطای برنامه‌نویسی، ربات کاملاً بی‌صدا می‌ماند و نه
    // کاربر و نه ادمین متوجه نمی‌شدند مشکل کجاست. حالا هر دو مطلع می‌شوند.
    await notifyUpdateFailure(update, config, err).catch((e) =>
      console.error('notifyUpdateFailure failed:', e)
    );
  } finally {
    await saveState(env);
  }
}

// وقتی پردازش یک پیام/دکمه با خطا مواجه شود، به‌جای سکوت کامل:
// ۱) به خود کاربر یک پیام کلی «خطا رخ داد» نشان می‌دهد (تا گیج نماند)
// ۲) متن دقیق خطا را برای ادمین ارسال می‌کند (تا بتوان مشکل را دیباگ کرد)
async function notifyUpdateFailure(update, config, err) {
  const chatId =
    (update.message && update.message.chat && update.message.chat.id) ||
    (update.callback_query && update.callback_query.message && update.callback_query.message.chat.id) ||
    null;

  if (chatId) {
    await sendMessage(
      config.BOT_TOKEN,
      chatId,
      '⚠️ متاسفانه در پردازش درخواست شما خطایی رخ داد.\nلطفاً چند لحظه دیگر دوباره تلاش کنید یا با پشتیبانی در تماس باشید.'
    ).catch(() => {});
  }

  const errorText = err && err.stack ? err.stack : String(err);
  const adminTarget = config.ADMIN_GROUP_ID || config.ADMIN_CHAT_ID || null;
  if (adminTarget) {
    await sendMessage(
      config.BOT_TOKEN,
      adminTarget,
      `🐞 <b>خطای فنی ربات</b>\n\n👤 chatId: <code>${chatId || '-'}</code>\n\n<code>${escapeHtml(
        errorText.slice(0, 1500)
      )}</code>`
    ).catch(() => {});
  }
}

async function processMessage(message, config, env) {
  const text = message.text || '';
  // Capture before the channel gate so the /start payload is not lost.
  captureReferral(message, config);

  // ---------- گیت عضویت اجباری در کانال ----------
  // اگر قابلیت فعال باشد، کاربر (به‌جز ادمین‌ها) باید ابتدا عضو کانال شود؛
  // این چک حتی جلوی دستور /start را هم می‌گیرد.
  if (!isAdmin(message.from.id, config) && DB.forceJoinEnabled && config.CHANNEL_ID) {
    const member = await isChannelMember(config, message.from.id);
    if (!member) {
      registerUser(message.from);
      return sendMessage(
        config.BOT_TOKEN,
        message.chat.id,
        `⚠️ برای استفاده از ربات، ابتدا باید عضو کانال ما شوید:\n${config.CHANNEL_ID}\n\nپس از عضویت، روی دکمه «✅ عضو شدم» بزنید.`,
        { reply_markup: joinChannelKeyboard(config) }
      );
    }
  }

  if (message.chat.type === 'private') await confirmReferralAndReward(message.from.id, config, env);

  if (/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(text.trim())) {
    return handleStart(message, config, env);
  }
  if (text === '/admin') {
    return handleAdminPanel(message, config, env);
  }
  if (text === '/cancel') {
    resetSession(message.chat.id);
    if (isAdmin(message.from.id, config)) resetSession(`admin_${message.from.id}`);
    return sendMessage(config.BOT_TOKEN, message.chat.id, '❌ عملیات جاری لغو شد.', {
      reply_markup: mainReplyKeyboard(config),
    });
  }

  // دستور ادمین برای مدیریت یک اشتراک: /sub <نام کاربری پنل>
  if (/^\/sub(\s|@|$)/i.test(text.trim()) && isAdmin(message.from.id, config)) {
    return handleAdminSubLookup(message, config, env);
  }

  // ۱) آیا ادمین در مرحله‌ای از یک فرآیند تعاملی است؟ (ارسال اکانت / افزودن کارت /
  //    افزودن بسته / افزودن ادمین / افزودن مشتری ویژه / تنظیمات / کیف پول)
  if (await handleAdminAwaitingInput(message, config, env)) return;

  // ۲) دکمه‌های Reply Keyboard پنل ادمین
  if (await handleAdminReplyKeyboardText(message, config, env)) return;

  // ۳) اگر کاربر در یک عملیات جاری است — فقط مرحله جاری پردازش می‌شود
  const session = getSession(message.chat.id);
  // اگر session تایم‌اوت شده ، کاربر را مطلع کن
  if (session._timedOut) {
    delete session._timedOut;
    return sendMessage(config.BOT_TOKEN, message.chat.id,
      '⌛ عملیات قبلی به دلیل گذشت۱۰ دقیقه بی‌توجهی خودکار لغو شد.\n'
      + 'از منوی زیر می‌توانید دوباره شروع کنید.',
      { reply_markup: mainReplyKeyboard(config) }
    );
  }
  if (session.step !== 'idle') {
    const handled = await handleOrderStepMessage(message, config, env);
    if (handled !== null) return;
    // پیام به مرحله جاری مربوط نیست — بلوک کن
    return sendMessage(config.BOT_TOKEN, message.chat.id,
      '⚠️ یک عملیات در جریان دارید.\n' + 'لطفاً آن را تکمیل کنید یا با دستور /cancel لغو کنید.'
    );
  }

  // ۴) دکمه‌های منوی اصلی — فقط در حالت idle
  const mainMenuHandled = await handleMainMenuText(message, config, env);
  if (mainMenuHandled !== false) return;
}

async function processCallbackQuery(callbackQuery, config, env) {
  const data = callbackQuery.data || '';
  if (!callbackQuery.message) return;
  if (callbackQuery.message.chat.type === 'private') registerUser(callbackQuery.from);

  // دکمه «عضو شدم، بررسی مجدد» همیشه (حتی وقتی هنوز عضو نیستند) باید کار کند
  if (data === 'checkjoin') {
    return handleCheckJoin(callbackQuery, config, env);
  }

  // ---------- گیت عضویت اجباری در کانال برای بقیه دکمه‌ها ----------
  if (!isAdmin(callbackQuery.from.id, config) && DB.forceJoinEnabled && config.CHANNEL_ID) {
    const member = await isChannelMember(config, callbackQuery.from.id);
    if (!member) {
      await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⚠️ ابتدا باید عضو کانال شوید.', true);
      return sendMessage(
        config.BOT_TOKEN,
        callbackQuery.message.chat.id,
        `⚠️ برای استفاده از ربات، ابتدا باید عضو کانال ما شوید:\n${config.CHANNEL_ID}\n\nپس از عضویت، روی دکمه «✅ عضو شدم» بزنید.`,
        { reply_markup: joinChannelKeyboard(config) }
      );
    }
  }

  if (callbackQuery.message.chat.type === 'private') await confirmReferralAndReward(callbackQuery.from.id, config, env);
  await answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id);

  if (data === 'noop') return;

  // ---------- خرید / بسته‌ها ----------
  if (data.startsWith('product:')) {
    return handleProductSelection(callbackQuery, config);
  }
  if (data === 'back:products') {
    await deleteMessage(config.BOT_TOKEN, callbackQuery.message.chat.id, callbackQuery.message.message_id).catch(() => {});
    return sendMessage(config.BOT_TOKEN, callbackQuery.message.chat.id, config.PRODUCT_SELECT_TEXT, {
      reply_markup: productsKeyboard(config),
    });
  }
  if (data === 'back:plans') {
    return editMessageText(
      config.BOT_TOKEN,
      callbackQuery.message.chat.id,
      callbackQuery.message.message_id,
      '💎 یکی از سرویس‌های ما را انتخاب کنید:',
      { reply_markup: plansKeyboard(config) }
    );
  }
  if (data.startsWith('plan:')) {
    const planId = data.split(':')[1];
    return handlePlanSelection(callbackQuery, planId, config);
  }
  if (data.startsWith('paymethod:')) {
    const method = data.split(':')[1];
    return handlePaymentMethodSelection(callbackQuery, method, config, env);
  }
  if (data.startsWith('paycard:')) {
    const cardId = Number(data.split(':')[1]);
    return handleCardSelection(callbackQuery, cardId, config);
  }
  if (data === 'order:confirm') {
    return handlePlaceOrder(callbackQuery, config, env);
  }
  if (data === 'order:cancel') {
    return handleOrderCancel(callbackQuery, config);
  }

  // ---------- اشتراک‌ها (وضعیت و تمدید) ----------
  if (data.startsWith('substatus:')) {
    const subId = data.slice('substatus:'.length);
    return handleSubscriptionStatusCallback(callbackQuery, subId, config, env);
  }
  if (data.startsWith('renew:')) {
    const subId = data.slice('renew:'.length);
    return handleRenewSelection(callbackQuery, subId, config);
  }

  // دکمه شیشه‌ای «🎓 آموزش‌ها» زیر پیام تحویل سرویس — برای همه کاربران
  if (data === 'tutorials:view') {
    return handleTutorialsView(callbackQuery, config);
  }

  if (data.startsWith('admin:')) {
    const [, action, orderId] = data.split(':');
    return handleAdminAction(callbackQuery, action, orderId, config, env);
  }

  // ---- کیف پول (مشتری) ----
  if (data === 'wallet:menu') {
    await deleteMessage(config.BOT_TOKEN, callbackQuery.message.chat.id, callbackQuery.message.message_id).catch(() => {});
    return handleWalletMenu(callbackQuery.message.chat.id, callbackQuery.from.id, config);
  }
  if (data === 'wallet:topup') {
    return handleWalletTopupStart(callbackQuery, config);
  }
  if (data.startsWith('walletcard:')) {
    const cardId = Number(data.split(':')[1]);
    return handleWalletCardSelection(callbackQuery, cardId, config);
  }
  if (data.startsWith('walletreq:')) {
    const [, action, reqId] = data.split(':');
    return handleWalletRequestAction(callbackQuery, action, reqId, config, env);
  }

  // ---------- از این پس فقط ادمین‌ها ----------
  // نگهبان یکجا تا هیچ دکمه مدیریتی بدون بررسی دسترسی نماند
  const adminOnly =
    data.startsWith('card_') ||
    data.startsWith('plan_') ||
    data.startsWith('tut_') ||
    data.startsWith('testcfg_') ||
    data.startsWith('adminmgmt_') ||
    data.startsWith('setting_edit:') ||
    data.startsWith('btnstyle_') ||
    data.startsWith('referraladmin:') ||
    data.startsWith('ad_') ||
    data.startsWith('walletadmin:') ||
    data.startsWith('pg:') ||
    data.startsWith('ucfg:') ||
    data.startsWith('sadm:') ||
    data === 'forcejoin_toggle';

  if (adminOnly && !isAdmin(callbackQuery.from.id, config)) {
    return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '⛔ دسترسی ندارید.', true);
  }

  if (data === 'referraladmin:toggle' || data === 'referraladmin:menu') {
    if (data === 'referraladmin:toggle') {
      DB.settings.REFERRAL_ENABLED = !config.REFERRAL_ENABLED;
    }
    return handleReferralAdminMenu(callbackQuery.message.chat.id, getConfig(env));
  }
  if (data === 'referraladmin:toggle_commission') {
    DB.settings.REFERRAL_COMMISSION_ENABLED = !config.REFERRAL_COMMISSION_ENABLED;
    return handleReferralAdminMenu(callbackQuery.message.chat.id, getConfig(env));
  }
  if (data === 'referraladmin:edit_commission_percent') {
    return handleReferralCommissionPercentEditStart(callbackQuery, config);
  }

  // ---- تبلیغ در کانال ----
  if (data === 'ad_menu') {
    return handleChannelAdMenu(callbackQuery.message.chat.id, config);
  }
  if (data === 'ad_new') {
    return handleChannelAdNewStart(callbackQuery, config);
  }
  if (data.startsWith('ad_open:')) {
    return handleChannelAdOpen(callbackQuery, data.slice('ad_open:'.length), config);
  }
  if (data.startsWith('ad_edit:')) {
    const [, subaction, adId] = data.split(':');
    return handleChannelAdEditStart(callbackQuery, subaction, adId, config);
  }
  if (data.startsWith('ad_delete:')) {
    return handleChannelAdDelete(callbackQuery, data.slice('ad_delete:'.length), config);
  }

  // ---- مدیریت کانفیگ کاربران — انتخاب از لیست ----
  if (data.startsWith('ucfg:')) {
    const ucParts = data.split(':');
    if (ucParts[1] === 'sel') {
      const sub = memGet(DB.subscriptions, ucParts[2]);
      if (!sub) return answerCallbackQuery(config.BOT_TOKEN, callbackQuery.id, '❌ اشتراک یافت نشد.', true);
      await syncSubscription(env, config, sub);
      return sendMessage(
        config.BOT_TOKEN,
        callbackQuery.message.chat.id,
        formatAdminSubscription(sub),
        { reply_markup: adminSubKeyboard(sub) }
      );
    }
    return;
  }

  // ---- مدیریت اشتراک توسط ادمین ----
  if (data.startsWith('sadm:')) {
    const [, action, subId] = data.split(':');
    if (action === 'del') return handleAdminSubDeleteAsk(callbackQuery, subId, config);
    if (action === 'delok') return handleAdminSubDelete(callbackQuery, subId, config, env);
    return handleAdminSubAction(callbackQuery, action, subId, config, env);
  }

  // ---- کارت‌ها ----
  if (data === 'card_add') {
    return handleCardAddStart(callbackQuery, config);
  }
  if (data.startsWith('card_del:')) {
    return handleCardDelete(callbackQuery, data.split(':')[1], config);
  }

  // ---- بسته‌های اینترنت ----
  if (data === 'plan_add') {
    return handlePlanAddStart(callbackQuery, config);
  }
  if (data.startsWith('plan_edit:')) {
    return handlePlanEditStart(callbackQuery, data.split(':')[1], config);
  }
  if (data.startsWith('plan_del:')) {
    return handlePlanDelete(callbackQuery, data.split(':')[1], config, env);
  }

  // ---- آموزش‌ها ----
  if (data === 'tut_add') {
    return handleTutorialAddStart(callbackQuery, config);
  }
  if (data.startsWith('tut_edit:')) {
    return handleTutorialEditStart(callbackQuery, data.split(':')[1], config);
  }
  if (data.startsWith('tut_del:')) {
    return handleTutorialDelete(callbackQuery, data.split(':')[1], config);
  }

  // ---- تست کانفیگ ----
  if (data === 'testcfg_add') {
    return handleTestConfigAddStart(callbackQuery, config);
  }
  if (data === 'testcfg_clear_unused') {
    return handleTestConfigsClearUnused(callbackQuery, config);
  }

  // ---- ادمین‌ها ----
  if (data === 'adminmgmt_add') {
    return handleAdminAddStart(callbackQuery, config);
  }
  if (data.startsWith('adminmgmt_del:')) {
    return handleAdminDelete(callbackQuery, data.split(':')[1], config);
  }

  // ---- تنظیمات فروشگاه ----
  if (data.startsWith('setting_edit:')) {
    return handleSettingEditStart(callbackQuery, data.split(':')[1], config);
  }
  if (data === 'btnstyle_menu') {
    return handleBtnStyleMenu(callbackQuery.message.chat.id, config);
  }
  if (data.startsWith('btnstyle_set:')) {
    const [, key, style] = data.split(':');
    return handleBtnStyleSet(callbackQuery, key, style || '', config, env);
  }
  if (data === 'glassstyle_menu') {
    return handleGlassStyleMenu(callbackQuery.message.chat.id, config);
  }
  if (data.startsWith('glassstyle_set:')) {
    const [, key, style] = data.split(':');
    return handleGlassStyleSet(callbackQuery, key, style || '', config, env);
  }

  // ---- بازگشت به منوی قبلی (استاندارد در همه بخش‌ها) ----
  if (data.startsWith('navback:')) {
    const target = data.split(':')[1];
    const backChatId = callbackQuery.message.chat.id;
    // پیام قبلی (همان پیامی که دکمه بازگشت رویش بود) حذف شود
    await deleteMessage(config.BOT_TOKEN, backChatId, callbackQuery.message.message_id).catch(() => {});
    if (target === 'admin' && isAdmin(callbackQuery.from.id, config)) {
      return sendMessage(config.BOT_TOKEN, backChatId, '🛠 منوی مدیریت:', {
        reply_markup: adminReplyKeyboard(),
      });
    }
    return sendMessage(config.BOT_TOKEN, backChatId, '🏠 منوی اصلی:', {
      reply_markup: mainReplyKeyboard(config),
    });
  }

  // ---- مدیریت کیف پول (ادمین) ----
  if (data === 'walletadmin:pending') {
    return handleWalletAdminPendingList(callbackQuery.message.chat.id, config);
  }
  if (data === 'walletadmin:adjust') {
    return handleWalletAdjustStart(callbackQuery, config);
  }

  // ---- عضویت اجباری (ادمین) ----
  if (data === 'forcejoin_toggle') {
    return handleForceJoinToggle(callbackQuery, config);
  }

  // ---- پاسارگارد (ادمین) ----
  if (data === 'pg:ping') {
    return handlePgPing(callbackQuery, config, env);
  }
  if (data === 'pg:groups') {
    return handlePgGroups(callbackQuery, config, env);
  }
  if (data === 'pg:selftest') {
    return handlePgSelfTest(callbackQuery, config, env);
  }
}

// ============================================================
// ۸. توابع تست و تنظیم
// ============================================================

async function testBotToken(config) {
  if (!config.BOT_TOKEN) {
    return { ok: false, error: 'BOT_TOKEN تنظیم نشده است.' };
  }
  const result = await getMe(config.BOT_TOKEN);
  return result;
}

// کلید ذخیره «امضای» آخرین تنظیم وبهوک در KV (خودِ secret ذخیره نمی‌شود)
const WEBHOOK_MARKER_KV_KEY = 'webhook_marker_v1';

// تلگرام برای secret_token فقط این کاراکترها را می‌پذیرد (۱ تا ۲۵۶ کاراکتر).
// اگر WEBHOOK_SECRET چیز دیگری داشته باشد (فاصله، حروف فارسی، = و + در base64، ...)
// تلگرام درخواست setWebhook را با خطای «invalid secret token» رد می‌کند و
// وبهوک هرگز تنظیم نمی‌شود. برای همین در آن حالت از هش SHA-256 خودِ secret
// استفاده می‌کنیم؛ هم setWebhook موفق می‌شود و هم مقایسه هدر با همان مقدار.
const TELEGRAM_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

let telegramSecretCache = { raw: null, token: '' };

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(String(value)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * مقداری که واقعاً به‌عنوان secret_token با تلگرام رد و بدل می‌شود.
 * برای secretهای سازگار، همان مقدار خام؛ در غیر این صورت هش آن.
 */
async function telegramSecretToken(secret) {
  const raw = String(secret || '');
  if (!raw) return '';
  if (TELEGRAM_SECRET_PATTERN.test(raw)) return raw;
  if (telegramSecretCache.raw === raw) return telegramSecretCache.token;
  const token = await sha256Hex(raw);
  telegramSecretCache = { raw, token };
  return token;
}

// نشانه‌ای یکتا از (آدرس وبهوک + secret) بدون افشای secret
async function webhookMarker(webhookUrl, secretToken) {
  const digest = await hmacSha256Hex(secretToken || '-', `webhook|${webhookUrl}`);
  return `${webhookUrl}|${digest.slice(0, 16)}`;
}

/**
 * تنظیم وبهوک تلگرام + منوی دستورات.
 *
 * idempotent است: اگر آدرس وبهوک و secret از قبل همان باشد، دوباره روی
 * تلگرام چیزی ست نمی‌کند (تا بی‌دلیل به محدودیت نرخ تلگرام نخوریم).
 * اگر آدرس Worker عوض شود یا secret را تغییر بدهی، خودش دوباره تنظیم می‌کند.
 */
async function setupWebhookAutomatically(request, config, env) {
  if (!config.BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN تنظیم نشده است.' };
  }

  const url = new URL(request.url);
  const webhookUrl = `${url.protocol}//${url.host}/webhook`;
  const secretToken = await telegramSecretToken(config.WEBHOOK_SECRET);
  const marker = await webhookMarker(webhookUrl, secretToken);

  const info = await getWebhookInfo(config.BOT_TOKEN);
  const currentUrl = info && info.ok && info.result ? info.result.url : '';

  let storedMarker = null;
  if (env && env.SHOP_KV) {
    storedMarker = await env.SHOP_KV.get(WEBHOOK_MARKER_KV_KEY).catch(() => null);
  }

  // همه‌چیز از قبل درست است → کاری لازم نیست
  if (currentUrl === webhookUrl && storedMarker === marker) {
    return { ok: true, webhookUrl, unchanged: true, pendingUpdates: info.result.pending_update_count || 0 };
  }

  const result = await setWebhook(config.BOT_TOKEN, webhookUrl, secretToken);

  if (result && result.ok) {
    await setMyCommands(config.BOT_TOKEN);
    for (const adminId of config.ADMIN_IDS || []) {
      await setAdminCommands(config.BOT_TOKEN, adminId);
    }
    if (env && env.SHOP_KV) {
      await env.SHOP_KV.put(WEBHOOK_MARKER_KV_KEY, marker).catch(() => null);
    }
  }

  return { ...result, webhookUrl, unchanged: false };
}

// ============================================================
// صفحه اصلی HTML
// ============================================================

async function renderHomePage(request, config, env) {
  ensurePlansLoaded();
  let tokenStatus = '❌ تنظیم نشده';
  let botUsername = '-';
  let webhookStatus = '❌ نامشخص';
  let webhookUrlSet = '-';

  if (config.BOT_TOKEN) {
    const me = await getMe(config.BOT_TOKEN);
    if (me.ok) {
      tokenStatus = '✅ معتبر';
      botUsername = '@' + me.result.username;
    } else {
      tokenStatus = '❌ نامعتبر';
    }

    const setupResult = await setupWebhookAutomatically(request, config, env);
    const info = await getWebhookInfo(config.BOT_TOKEN);
    if (info.ok && info.result.url) {
      const pending = Number(info.result.pending_update_count) || 0;
      const pendingNote = pending > 0 ? ` — ${pending} آپدیت در انتظار پردازش` : '';
      if (!setupResult.ok) {
        webhookStatus = `⚠️ فعال ولی خطا در تنظیم مجدد${pendingNote}`;
      } else {
        webhookStatus = setupResult.unchanged
          ? `✅ فعال${pendingNote}`
          : `✅ فعال (همین حالا تنظیم شد)${pendingNote}`;
      }
      webhookUrlSet = info.result.url;
    } else {
      // دلیل واقعی خطای تلگرام را نشان می‌دهیم تا عیب‌یابی حدسی نباشد
      const reason = setupResult && !setupResult.ok
        ? String(setupResult.description || setupResult.error || setupResult.error_code || '').slice(0, 200)
        : '';
      webhookStatus = reason ? `❌ تنظیم نشد — ${escapeHtml(reason)}` : '❌ تنظیم نشده';
    }
  }

  const persistenceOn = isPersistenceEnabled(env);
  const persistenceStatus = persistenceOn ? '✅ فعال (KV متصل است)' : '❌ غیرفعال (SHOP_KV تنظیم نشده - داده‌ها موقت هستند)';
  const d1Status = hasD1(env) ? '✅ متصل' : '❌ متصل نیست (فقط KV)';
  const pgStatus = pgConfigured(config)
    ? `✅ تنظیم شده (${config.PG_API_TOKEN ? 'API Key' : 'نام کاربری/رمز'})`
    : '❌ تنظیم نشده';
  const secretStatus = config.WEBHOOK_SECRET ? '✅ فعال' : '⚠️ تنظیم نشده';
  const notifyTarget = adminNotifyTargets(config)[0];
  const notifySource = config.ADMIN_CHAT_ID
    ? 'ADMIN_CHAT_ID'
    : config.ADMIN_GROUP_ID
      ? 'ADMIN_GROUP_ID'
      : 'ADMIN_IDS';
  const adminNotifyStatus = notifyTarget
    ? `✅ ${escapeHtml(notifyTarget)} (از ${notifySource})`
    : '❌ هیچ مقصدی تنظیم نشده';
  const walletTotal = [...DB.users.values()].reduce((sum, u) => sum + (u.walletBalance || 0), 0);

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(config.SHOP_NAME)}</title>
<style>
  * { box-sizing: border-box; }
  :root {
    --theme-green: ${escapeHtml(config.THEME_COLOR_GREEN)};
    --theme-blue: ${escapeHtml(config.THEME_COLOR_BLUE)};
    --theme-red: ${escapeHtml(config.THEME_COLOR_RED)};
    --theme-bg: ${escapeHtml(config.THEME_COLOR_BG)};
  }
  body {
    font-family: Tahoma, Arial, sans-serif;
    background: var(--theme-bg);
    color: #1f2937;
    margin: 0;
    padding: 40px 16px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .card {
    background: #ffffff;
    border: 1px solid #e2e8e5;
    border-radius: 16px;
    padding: 32px;
    max-width: 560px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  h1 { font-size: 22px; margin-bottom: 4px; color: #1f2937; }
  p.sub { color: #64748b; margin-top: 0; margin-bottom: 24px; }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #e5e9e7;
    font-size: 14px;
  }
  .row:last-child { border-bottom: none; }
  .label { color: #64748b; }
  .value { font-weight: bold; color: #1f2937; }
  .actions { margin-top: 24px; display: flex; gap: 12px; flex-wrap: wrap; }
  button, a.btn {
    position: relative;
    color: #ffffff;
    border: none;
    border-radius: 40px;
    padding: 12px 20px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    font-size: 14px;
    flex: 1;
    min-width: 150px;
    text-align: center;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.15);
    transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  }
  button:hover, a.btn:hover {
    transform: translateY(-2px);
    filter: brightness(0.94);
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.2);
  }
  button:active, a.btn:active {
    transform: translateY(0);
    filter: brightness(0.9);
  }
  a.btn.btn-blue, button.btn-blue { background: var(--theme-blue); }
  a.btn.btn-green, button.btn-green { background: var(--theme-green); }
  a.btn.btn-red, button.btn-red { background: var(--theme-red); }
  @media (max-width: 480px) {
    .actions { flex-direction: column; }
    button, a.btn { flex: none; width: 100%; min-width: 0; }
  }
  footer { margin-top: 24px; color: #94a3b8; font-size: 12px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <h1>🛍 ${escapeHtml(config.SHOP_NAME)}</h1>
    <p class="sub">پنل وضعیت ربات فروشگاهی تلگرام</p>

    <div class="row"><span class="label">وضعیت توکن ربات</span><span class="value">${tokenStatus}</span></div>
    <div class="row"><span class="label">نام کاربری ربات</span><span class="value">${botUsername}</span></div>
    <div class="row"><span class="label">وضعیت Webhook</span><span class="value">${webhookStatus}</span></div>
    <div class="row"><span class="label">آدرس Webhook</span><span class="value" style="direction:ltr;">${webhookUrlSet}</span></div>
    <div class="row"><span class="label">امضای وبهوک (secret_token)</span><span class="value">${secretStatus}</span></div>
    <div class="row"><span class="label">مقصد اعلان ادمین</span><span class="value">${adminNotifyStatus}</span></div>
    <div class="row"><span class="label">حافظه دائمی (KV)</span><span class="value">${persistenceStatus}</span></div>
    <div class="row"><span class="label">دیتابیس D1</span><span class="value">${d1Status}</span></div>
    <div class="row"><span class="label">اتصال پاسارگارد</span><span class="value">${pgStatus}</span></div>
    <div class="row"><span class="label">تعداد اشتراک‌ها</span><span class="value">${DB.subscriptions.size}</span></div>
    <div class="row"><span class="label">عضویت اجباری در کانال</span><span class="value">${DB.forceJoinEnabled ? '✅ فعال' : '❌ غیرفعال'}</span></div>
    <div class="row"><span class="label">تعداد بسته‌ها</span><span class="value">${DB.plans.length}</span></div>
    <div class="row"><span class="label">تعداد سفارش‌ها</span><span class="value">${DB.orders.size}</span></div>
    <div class="row"><span class="label">تعداد کارت‌های فعال</span><span class="value">${DB.cards.size}</span></div>
    <div class="row"><span class="label">مجموع موجودی کیف پول‌ها</span><span class="value">${walletTotal.toLocaleString()} تومان</span></div>

    <div class="actions">
      <a class="btn btn-green" href="/health">💚 health check</a>
    </div>

    <p class="sub" style="margin-top:16px;font-size:12px;line-height:1.9;">
      مسیرهای مدیریتی <code>/test</code>، <code>/webhook-info</code>، <code>/force-webhook</code>،
      <code>/api-test</code>، <code>/theme</code> (تنظیمات رنگ) و جزئیات <code>/health</code> فقط با کلید مدیریتی باز می‌شوند.
      <br>کلید همان <code>WEBHOOK_SECRET</code> است و به‌صورت
      <code style="direction:ltr;display:inline-block;">?key=...</code> یا هدر
      <code style="direction:ltr;display:inline-block;">X-Admin-Key</code> فرستاده می‌شود.
    </p>

    <footer>Cloudflare Workers • Telegram Bot API</footer>
  </div>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
}

// ============================================================
// ۸.۵ Endpointهای سرویس: /health ، /api-test ، /payment/callback
// ============================================================

// مسیرهای تشخیصی فقط با کلید مدیریتی (همان WEBHOOK_SECRET) باز می‌شوند
function hasAdminKey(request, config) {
  if (!config.WEBHOOK_SECRET) return false;
  const url = new URL(request.url);
  const provided = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
  return safeCompare(provided, config.WEBHOOK_SECRET);
}

function isValidHexColor(value) {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(String(value || '').trim());
}

// ============================================================
// ۸.۴ صفحه وب تنظیمات رنگ (/theme) — فقط با کلید مدیریتی باز می‌شود
// ============================================================

async function renderThemeAdminPage(request, config, notice) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const colors = {
    green: config.THEME_COLOR_GREEN,
    blue: config.THEME_COLOR_BLUE,
    red: config.THEME_COLOR_RED,
    bg: config.THEME_COLOR_BG,
  };
  const noticeHtml = notice ? `<div class="notice">${escapeHtml(notice)}</div>` : '';

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🎨 تنظیمات رنگ — ${escapeHtml(config.SHOP_NAME)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Tahoma, Arial, sans-serif;
    background: ${escapeHtml(colors.bg)};
    color: #1f2937;
    margin: 0;
    padding: 40px 16px;
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .card {
    background: #ffffff;
    border: 1px solid #e2e8e5;
    border-radius: 16px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  }
  h1 { font-size: 20px; margin-bottom: 4px; color: #1f2937; }
  p.sub { color: #64748b; margin-top: 0; margin-bottom: 24px; font-size: 13px; }
  .field { margin-bottom: 18px; }
  .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #374151; }
  .field .row { display: flex; align-items: center; gap: 10px; }
  .field input[type="color"] {
    width: 48px; height: 40px; border: 1px solid #e2e8e5; border-radius: 10px;
    padding: 2px; cursor: pointer; background: #fff;
  }
  .field input[type="text"] {
    flex: 1; padding: 10px 12px; border: 1px solid #e2e8e5; border-radius: 10px;
    font-family: monospace; direction: ltr; font-size: 14px;
  }
  .preview { display: flex; gap: 10px; margin: 20px 0; flex-wrap: wrap; }
  .preview .btn {
    color: #fff; border: none; padding: 12px 20px; border-radius: 40px;
    font-weight: 600; font-size: 14px;
  }
  .actions { display: flex; gap: 12px; margin-top: 24px; }
  .actions button {
    flex: 1; padding: 12px 16px; border: none; border-radius: 40px;
    font-weight: 600; font-size: 14px; cursor: pointer;
  }
  .actions button[value="save"] { background: #1f2937; color: #fff; }
  .actions button[value="reset"] { background: #f1f5f4; color: #374151; border: 1px solid #e2e8e5; }
  .notice { background: #ecfdf3; color: #15803d; border: 1px solid #bbf7d0; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px; }
  footer { margin-top: 20px; color: #94a3b8; font-size: 11px; text-align: center; }
</style>
</head>
<body>
  <div class="card">
    <h1>🎨 تنظیمات رنگ رابط کاربری</h1>
    <p class="sub">این صفحه فقط برای ادمین قابل دسترسی است؛ تغییرات بلافاصله برای همه بازدیدکنندگان سایت اعمال می‌شود.</p>
    ${noticeHtml}
    <form method="POST" action="/theme?key=${encodeURIComponent(key)}">
      <div class="field">
        <label>🟢 رنگ دکمه‌های سبز</label>
        <div class="row">
          <input type="color" id="pickGreen" value="${colors.green}">
          <input type="text" name="green" id="textGreen" value="${colors.green}" maxlength="7">
        </div>
      </div>
      <div class="field">
        <label>🔵 رنگ دکمه‌های آبی</label>
        <div class="row">
          <input type="color" id="pickBlue" value="${colors.blue}">
          <input type="text" name="blue" id="textBlue" value="${colors.blue}" maxlength="7">
        </div>
      </div>
      <div class="field">
        <label>🔴 رنگ دکمه‌های قرمز/مرجانی</label>
        <div class="row">
          <input type="color" id="pickRed" value="${colors.red}">
          <input type="text" name="red" id="textRed" value="${colors.red}" maxlength="7">
        </div>
      </div>
      <div class="field">
        <label>⬜ رنگ پس‌زمینه کلی</label>
        <div class="row">
          <input type="color" id="pickBg" value="${colors.bg}">
          <input type="text" name="bg" id="textBg" value="${colors.bg}" maxlength="7">
        </div>
      </div>

      <div class="preview">
        <span class="btn" id="prevGreen" style="background:${colors.green};">🟢 نمونه</span>
        <span class="btn" id="prevBlue" style="background:${colors.blue};">🔵 نمونه</span>
        <span class="btn" id="prevRed" style="background:${colors.red};">🔴 نمونه</span>
      </div>

      <div class="actions">
        <button type="submit" name="action" value="save">💾 ذخیره تغییرات</button>
        <button type="submit" name="action" value="reset">↩️ بازگردانی پیش‌فرض</button>
      </div>
    </form>
    <footer>مقادیر در همان محل ذخیره‌سازی سایر تنظیمات ربات نگهداری می‌شوند.</footer>
  </div>
<script>
  function link(pickId, textId, prevId) {
    var pick = document.getElementById(pickId);
    var text = document.getElementById(textId);
    var prev = prevId ? document.getElementById(prevId) : null;
    var hexRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
    pick.addEventListener('input', function () {
      text.value = pick.value;
      if (prev) prev.style.background = pick.value;
      if (pickId === 'pickBg') document.body.style.background = pick.value;
    });
    text.addEventListener('input', function () {
      var v = text.value.trim();
      if (hexRe.test(v)) {
        pick.value = v;
        if (prev) prev.style.background = v;
        if (pickId === 'pickBg') document.body.style.background = v;
      }
    });
  }
  link('pickGreen', 'textGreen', 'prevGreen');
  link('pickBlue', 'textBlue', 'prevBlue');
  link('pickRed', 'textRed', 'prevRed');
  link('pickBg', 'textBg', null);
</script>
</body>
</html>`;

  return new Response(html, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
}

async function handleThemeAdminSave(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch (_) {
    form = new Map();
  }
  const action = String(form.get ? form.get('action') || 'save' : 'save');
  if (!DB.settings) DB.settings = {};

  if (action === 'reset') {
    for (const key of Object.keys(THEME_COLOR_FIELDS)) delete DB.settings[key];
    await saveState(env);
    return renderThemeAdminPage(request, getConfig(env), '✅ رنگ‌ها به مقادیر پیش‌فرض بازگردانده شدند.');
  }

  const fieldMap = { green: 'THEME_COLOR_GREEN', blue: 'THEME_COLOR_BLUE', red: 'THEME_COLOR_RED', bg: 'THEME_COLOR_BG' };
  let hasInvalid = false;
  for (const [formKey, settingKey] of Object.entries(fieldMap)) {
    const value = String((form.get ? form.get(formKey) : '') || '').trim();
    if (!isValidHexColor(value)) {
      hasInvalid = true;
      continue;
    }
    DB.settings[settingKey] = value;
  }
  await saveState(env);
  const notice = hasInvalid
    ? '⚠️ یکی از مقادیر رنگ نامعتبر بود (فرمت باید مثل #62C457 باشد) — بقیه مقادیر ذخیره شد.'
    : '✅ رنگ‌ها با موفقیت ذخیره شد و برای همه کاربران اعمال شد.';
  return renderThemeAdminPage(request, getConfig(env), notice);
}

// health check ساده و عمومی؛ جزئیات پیکربندی فقط با کلید مدیریتی
function healthResponse(request, config, env) {
  const body = { ok: true, service: 'telegram-subscription-bot', time: new Date().toISOString() };

  if (hasAdminKey(request, config)) {
    body.telegram = {
      token_configured: Boolean(config.BOT_TOKEN),
      webhook_secret_configured: Boolean(config.WEBHOOK_SECRET),
      admin_ids_count: config.ADMIN_IDS.length,
      admin_notify_targets: adminNotifyTargets(config).length,
      admin_notify_source: config.ADMIN_CHAT_ID
        ? 'ADMIN_CHAT_ID'
        : config.ADMIN_GROUP_ID
          ? 'ADMIN_GROUP_ID'
          : 'ADMIN_IDS',
    };
    body.pasarguard = {
      configured: pgConfigured(config),
      base_url_set: Boolean(config.PG_BASE_URL),
      auth_mode: config.PG_API_TOKEN ? 'api_key' : config.PG_USERNAME ? 'password' : 'none',
    };
    body.storage = { kv: isPersistenceEnabled(env), d1: hasD1(env) };
    body.counts = {
      plans: Array.isArray(DB.plans) ? DB.plans.length : 0,
      orders: DB.orders.size,
      subscriptions: DB.subscriptions.size,
      users: DB.users.size,
    };
    body.payment = { gateway_enabled: isGatewayEnabled(config) };
  }

  return jsonResponse(body);
}

// تست فقط-خواندنی اتصال به پنل پاسارگارد (نیازمند کلید مدیریتی)
async function apiTestResponse(request, config, env) {
  if (!hasAdminKey(request, config)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!pgConfigured(config)) {
    return jsonResponse({ ok: false, error: 'pasarguard_not_configured' }, 400);
  }
  try {
    const ping = await pgPing(env, config);
    let groups = null;
    try {
      const data = await pgListGroups(env, config);
      groups = ((data && data.groups) || []).map((g) => ({ id: g.id, name: g.name }));
    } catch (err) {
      groups = null;
    }
    return jsonResponse({ ok: true, ping, groups });
  } catch (err) {
    const status = err instanceof PgError ? err.status || 502 : 502;
    return jsonResponse({ ok: false, error: err instanceof PgError ? err.message : 'unknown_error' }, status);
  }
}

// پارامترهای callback را از query یا بدنه (JSON و form) می‌خواند
async function readCallbackParams(request) {
  const url = new URL(request.url);
  const params = {};
  for (const [key, value] of url.searchParams.entries()) params[key] = value;

  if (request.method === 'POST') {
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    try {
      if (contentType.includes('application/json')) {
        Object.assign(params, (await request.json()) || {});
      } else if (contentType.includes('form')) {
        const form = await request.formData();
        for (const [key, value] of form.entries()) params[key] = typeof value === 'string' ? value : '';
      }
    } catch (err) {
      console.error('readCallbackParams: invalid body');
    }
  }
  return params;
}

/**
 * callback درگاه پرداخت.
 * زنجیره: Verify → PasarGuard API → Create Subscription → Save in D1 → Send to Telegram
 * این مسیر idempotent است؛ فراخوانی دوباره اشتراک دوم نمی‌سازد.
 */
async function handlePaymentCallback(request, config, env) {
  if (!isGatewayEnabled(config)) {
    return jsonResponse({ ok: false, error: 'gateway_disabled' }, 404);
  }

  const params = await readCallbackParams(request);
  const orderId = String(params.order_id || '');
  const order = memGet(DB.orders, Number(orderId)) || memGet(DB.orders, orderId);

  if (!order) {
    await dbLog(env, 'warn', 'payment', 'callback for unknown order', { orderId });
    return jsonResponse({ ok: false, error: 'order_not_found' }, 404);
  }

  // قبلاً تحویل شده؟ همان نتیجه را برگردان (تکرار callback مشکلی ایجاد نکند)
  if (order.subscriptionId && memGet(DB.subscriptions, order.subscriptionId)) {
    return jsonResponse({ ok: true, already_processed: true, order_id: order.id });
  }

  const provider = getPaymentProvider(gatewayProvider.id);
  const verification = await provider.verify({ env, config, order, params });

  const payment = {
    id: newId('pay'),
    orderId: order.id,
    userId: order.userId,
    provider: provider.id,
    amount: verification.amount || order.price,
    currency: 'IRT',
    status: verification.ok ? PAYMENT_STATUS.VERIFIED : PAYMENT_STATUS.REJECTED,
    reference: verification.reference || String(params.reference || '') || null,
    raw: verification.raw || params,
    verifiedAt: verification.ok ? Date.now() : null,
    createdAt: Date.now(),
  };
  memSet(DB.payments, payment.id, payment);
  await dbSavePayment(env, payment);

  if (!verification.ok) {
    await dbLog(env, 'warn', 'payment', `callback rejected: ${verification.reason || 'invalid'}`, {}, {
      telegramId: order.userId,
      orderId: order.id,
    });
    return jsonResponse({ ok: false, error: verification.reason || 'verification_failed' }, 400);
  }

  order.status = ORDER_STATUS.CONFIRMED;
  order.paidVia = provider.id;
  order.paymentId = payment.id;
  order.updatedAt = Date.now();
  memSet(DB.orders, order.id, order);
  await dbSaveOrder(env, order);

  // ⚡ اعلان فوری به ادمین به‌محض تایید پرداخت آنلاین (قبل از ساخت اشتراک)
  await notifyAdmins(env, config, {
    text: formatAdminOrderMessage(order),
    replyMarkup: adminOrderKeyboard(order.id, order.status),
    orderId: order.id,
  });

  const result = await provisionOrder(env, config, order);
  await saveState(env);

  return jsonResponse({
    ok: result.ok,
    order_id: order.id,
    subscription_id: result.ok ? result.subscription.id : null,
    error: result.ok ? null : result.error,
  });
}

// ============================================================
// ۹. ورودی اصلی Worker
// ============================================================

export default {
  async fetch(request, env, ctx) {
    await loadState(env);
    ensurePlansLoaded();
    // اسکیمای D1 در اولین اجرا خودکار ساخته می‌شود (نیازی به migration دستی نیست)
    await ensureD1Schema(env);
    const config = getConfig(env);
    const url = new URL(request.url);

    try {
      // ---------- صفحه وضعیت (وبهوک را هم خودکار تنظیم می‌کند) ----------
      if (url.pathname === '/' && request.method === 'GET') {
        return await renderHomePage(request, config, env);
      }

      // ---------- health check ----------
      if (url.pathname === '/health') {
        return healthResponse(request, config, env);
      }

      // ---------- تست فقط-خواندنی API پاسارگارد (نیازمند کلید مدیریتی) ----------
      if (url.pathname === '/api-test') {
        return await apiTestResponse(request, config, env);
      }

      // ---------- صفحه تنظیمات رنگ رابط کاربری (نیازمند کلید مدیریتی) ----------
      if (url.pathname === '/theme') {
        if (!hasAdminKey(request, config)) {
          return jsonResponse(
            {
              ok: false,
              error: 'unauthorized',
              hint: 'این صفحه با ?key=<WEBHOOK_SECRET> یا هدر X-Admin-Key باز می‌شود.',
            },
            401
          );
        }
        if (request.method === 'POST') {
          return await handleThemeAdminSave(request, env);
        }
        return await renderThemeAdminPage(request, config, null);
      }

      // ---------- callback درگاه پرداخت ----------
      if (url.pathname === '/payment/callback') {
        return await handlePaymentCallback(request, config, env);
      }

      // ---------- مسیرهای مدیریتی: فقط با ?key=<WEBHOOK_SECRET> ----------
      if (url.pathname === '/test' || url.pathname === '/webhook-info' || url.pathname === '/force-webhook') {
        if (!hasAdminKey(request, config)) {
          return jsonResponse(
            {
              ok: false,
              error: 'unauthorized',
              hint: 'این مسیرها با ?key=<WEBHOOK_SECRET> یا هدر X-Admin-Key باز می‌شوند.',
            },
            401
          );
        }
        if (url.pathname === '/test') {
          return jsonResponse(await testBotToken(config));
        }
        if (url.pathname === '/webhook-info') {
          return jsonResponse(await getWebhookInfo(config.BOT_TOKEN));
        }
        return jsonResponse(await setupWebhookAutomatically(request, config, env));
      }

      // ---------- وبهوک تلگرام ----------
      if (url.pathname === '/webhook' && request.method === 'POST') {
        if (!config.BOT_TOKEN) {
          return jsonResponse({ ok: false, error: 'TELEGRAM_BOT_TOKEN تنظیم نشده است.' }, 500);
        }

        // فقط درخواست‌هایی که تلگرام با secret_token امضا کرده پذیرفته می‌شوند
        if (config.WEBHOOK_SECRET) {
          const expected = await telegramSecretToken(config.WEBHOOK_SECRET);
          const provided = request.headers.get('x-telegram-bot-api-secret-token') || '';
          if (!safeCompare(provided, expected)) {
            console.error('webhook: invalid secret token');
            return jsonResponse({ ok: false }, 401);
          }
        }

        let update;
        try {
          update = await request.json();
        } catch (e) {
          console.error('Invalid webhook JSON');
          return jsonResponse({ ok: false }, 400);
        }

        ctx.waitUntil(processUpdate(update, config, env));
        return jsonResponse({ ok: true });
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('Fetch handler error:', err);
      return jsonResponse({ ok: false, error: 'internal_error' }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}