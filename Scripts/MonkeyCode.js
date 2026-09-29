/**
 * MonkeyCode 每日签到领积分
 * ------------------------------------------------------------------
 * 目标站点 : https://monkeycode-ai.com  （长亭科技 MonkeyCode 在线 AI 开发平台）
 * 适用环境 : Quantumult X (iOS) / 也可直接运行于 Node.js 18+
 * 脚本作者 : 逆向自官方前端 bundle，接口与算法均经实测验证
 * 更新日期 : 2026-09-30
 *
 * ── 功能 ────────────────────────────────────────────────────────────
 *   1. 自动登录（邮箱 + 密码），无需手动抓 Cookie
 *   2. 自动完成 PoW 人机验证（cap.js，纯计算，无需打码）
 *   3. 每日签到领取 100 积分
 *   4. 幂等：当日已签到则不再重复请求
 *   5. 多账号支持
 *   6. 结果推送通知
 *
 * ── 接口清单（均实测可用）────────────────────────────────────────────
 *   GET  /api/v1/server/config            → 服务端配置（captcha_enabled）
 *   POST /api/v1/public/captcha/challenge → 获取 PoW 题目 {c,s,d} + token
 *   POST /api/v1/public/captcha/redeem    → 提交解答，换取 captcha_token
 *   POST /api/v1/users/password-login     → 邮箱密码登录（写入 Cookie）
 *   GET  /api/v1/users/wallet/checkin     → 查询今日是否已签到 {checked_in}
 *   POST /api/v1/users/wallet/checkin     → 执行签到（body: {captcha_token}）
 *   GET  /api/v1/users/wallet             → 查询余额（积分）
 *
 * ── Quantumult X 配置 ───────────────────────────────────────────────
 *
 *   [task_local]
 *   # 每天早上 9:07 自动签到
 *   7 9 * * * MonkeyCode.js, tag=MonkeyCode签到, enabled=true
 *
 *   [rewrite_local]
 *   # 可选：自动捕获登录 Cookie（若你不想填密码，见下方说明）
 *   ^https:\/\/monkeycode-ai\.com\/api\/v1\/users\/(password-login|login) url script-request-header MonkeyCode.js
 *
 *   [mitm]
 *   hostname = monkeycode-ai.com
 *
 * ── 账号配置（两种方式，任选其一）───────────────────────────────────
 *
 *   方式 A（推荐，全自动）：在 [task_local] 里直接写账号，多个用 & 连接
 *     MONKEYCODE_ACCOUNTS=邮箱1,密码1&邮箱2,密码2
 *
 *   方式 B（不想存密码）：手动抓 Cookie 填进去
 *     MONKEYCODE_COOKIES=Cookie字符串1&Cookie字符串2
 *
 *   QX 中写法示例：
 *   7 9 * * * MonkeyCode.js, tag=MonkeyCode签到, enabled=true,
 *       env=MONKEYCODE_ACCOUNTS=me@qq.com,mypassword
 *
 * ── 免责声明 ────────────────────────────────────────────────────────
 *   本脚本仅用于个人账号的自动化签到，请勿用于批量注册、恶意刷积分等
 *   违反平台服务条款的行为。使用风险自负。
 */

/* ============================ 基础常量 ============================ */

const BASE = 'https://monkeycode-ai.com';
const API = {
  serverConfig:   `/api/v1/server/config`,
  captchaChal:    `/api/v1/public/captcha/challenge`,
  captchaRedeem:  `/api/v1/public/captcha/redeem`,
  passwordLogin:  `/api/v1/users/password-login`,
  checkinGet:     `/api/v1/users/wallet/checkin`,
  checkinPost:    `/api/v1/users/wallet/checkin`,
  wallet:         `/api/v1/users/wallet`,
};

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
           'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/* ============================ 工具函数 ============================ */

function log(msg) {
  console.log(`[MonkeyCode] ${msg}`);
}

/**
 * QX / Node 双环境 HTTP 封装
 * @returns {Promise<{status:number, headers:any, body:any, raw:string}>}
 */
function http(method, path, { body, headers, timeout = 30000, cookieStore } = {}) {
  const url = path.startsWith('http') ? path : BASE + path;
  const hdrs = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Origin': BASE,
    'Referer': `${BASE}/console`,
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(headers || {}),
  };

  const opt = {
    url,
    method,
    headers: hdrs,
    timeout,
  };
  if (body) opt.body = typeof body === 'string' ? body : JSON.stringify(body);
  if (cookieStore) opt.headers['Cookie'] = cookieStore;

  const isQx = typeof $task !== 'undefined';
  const fetcher = isQx
    // QX 的 $task.fetch 不支持 timeout 字段，需忽略
    ? $task.fetch({ url: opt.url, method: opt.method, headers: opt.headers, body: opt.body })
    : nodeFetch(opt);

  return Promise.resolve(fetcher).then((res) => {
    const raw = res.body || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* 非 JSON */ }

    // 兼容 QX( statusCode ) 与 Node fetch( status )
    const status = res.statusCode || res.status || 0;
    return {
      status,
      headers: res.headers || {},
      body: parsed,
      raw,
      // 从响应头提取 Set-Cookie，用于维持会话
      setCookie: extractSetCookie(res.headers),
    };
  });
}

/** Node 18+ 的 fetch 适配，便于本地调试脚本逻辑 */
async function nodeFetch(opt) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opt.timeout || 30000);
  try {
    const r = await fetch(opt.url, {
      method: opt.method,
      headers: opt.headers,
      body: opt.body,
      signal: ac.signal,
      redirect: 'follow',
    });
    const text = await r.text();
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    // 兼容 Node 的 getSetCookie
    if (typeof r.headers.getSetCookie === 'function') {
      headers['set-cookie'] = r.headers.getSetCookie();
    }
    return { status: r.status, headers, body: text };
  } finally {
    clearTimeout(timer);
  }
}

/** 从响应头中归一化提取 Set-Cookie 数组 */
function extractSetCookie(headers) {
  if (!headers) return [];
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'set-cookie') {
      const v = headers[k];
      return Array.isArray(v) ? v : [v];
    }
  }
  return [];
}

/** 把 Set-Cookie 合并进 Cookie 串（只保留 name=value） */
function mergeCookies(current, setCookies) {
  const jar = {};
  (current || '').split(';').forEach((part) => {
    const [k, ...rest] = part.trim().split('=');
    if (k && rest.length) jar[k] = rest.join('=');
  });
  setCookies.forEach((sc) => {
    const first = String(sc).split(';')[0];
    const [k, ...rest] = first.trim().split('=');
    if (k && rest.length) jar[k] = rest.join('=');
  });
  return Object.keys(jar).map((k) => `${k}=${jar[k]}`).join('; ');
}

/* ==================== 核心一：PoW 验证码求解 ==================== */

/**
 * 复刻 cap.js 的 PRNG（FNV-1a 32bit 播种 + xorshift32 出数）
 * 官方实现见 @cap.js/server source: prng(seed, length)
 */
function prng(seed, length) {
  // FNV-1a 32bit
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  let state = hash >>> 0;

  // xorshift32 出数，每轮变 8 位十六进制
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };

  let out = '';
  while (out.length < length) {
    out += next().toString(16).padStart(8, '0');
  }
  return out.substring(0, length);
}

/** 纯同步 SHA-256（返回小写 hex），避免依赖 crypto.subtle 的异步与兼容问题 */
function sha256Hex(str) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  // UTF-8 编码
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0xd800 || c >= 0xe000)
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      // 代理对
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(++i) & 0x3ff));
      bytes.push(
        0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)
      );
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 大端写入 64 位长度
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push((hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff);
  bytes.push((lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) |
             (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => (x >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * 完整走一遍 PoW 验证码流程，返回可用的 captcha_token
 *
 * 流程（cap.js 协议）：
 *   1) POST /challenge  → { challenge:{c,s,d}, token }
 *   2) 对 i=1..c 分别求 nonce，使 sha256(salt + nonce) 的 hex 以 target 开头
 *        salt   = prng(token + i,   s)
 *        target = prng(token + i+'d', d)
 *   3) POST /redeem { token, solutions:[nonce...] } → { token: "id:vertoken" }
 */
async function solveCaptcha(enabled) {
  if (!enabled) return '';

  const chalRes = await http('POST', API.captchaChal);
  const data = chalRes.body;
  if (!data || !data.token || !data.challenge) {
    throw new Error(`获取验证码题目失败: ${chalRes.raw.slice(0, 200)}`);
  }

  const { c, s, d } = data.challenge;
  const token = data.token;
  const t0 = Date.now();

  const solutions = [];
  for (let i = 1; i <= c; i++) {
    const salt = prng(`${token}${i}`, s);
    const target = prng(`${token}${i}d`, d);
    let nonce = 0;
    // 难度 d 个 hex 字符 → 平均 16^d 次尝试；d=3 时约 4096 次，毫秒级
    while (!sha256Hex(salt + nonce).startsWith(target)) {
      nonce++;
      if (nonce > 5e7) throw new Error('PoW 求解超时，难度异常');
    }
    solutions.push(nonce);
  }

  log(`验证码已解算 ${c} 题，耗时 ${Date.now() - t0}ms`);

  const redRes = await http('POST', API.captchaRedeem, {
    body: { token, solutions },
  });
  const red = redRes.body;
  if (!red || !red.success || !red.token) {
    throw new Error(`验证码兑换失败: ${redRes.raw.slice(0, 200)}`);
  }
  return red.token;
}

/* ==================== 核心二：账号签到流程 ==================== */

/** 解析账号配置，返回 [{ email, password, cookie }] */
function parseAccounts() {
  const accounts = [];

  // 方式 A：邮箱,密码
  const accEnv = readEnv('MONKEYCODE_ACCOUNTS');
  if (accEnv) {
    accEnv.split('&').forEach((item) => {
      const [email, ...pw] = item.split(',');
      if (email && pw.length) {
        accounts.push({ email: email.trim(), password: pw.join(',').trim() });
      }
    });
  }

  // 方式 B：Cookie
  const ckEnv = readEnv('MONKEYCODE_COOKIES');
  if (ckEnv) {
    ckEnv.split('&').forEach((ck) => {
      if (ck.trim()) accounts.push({ cookie: ck.trim() });
    });
  }

  return accounts;
}

/** 读取环境变量：优先 QX 的 $environment，其次 process.env */
function readEnv(key) {
  try {
    if (typeof $environment !== 'undefined' && $environment[key] != null)
      return String($environment[key]);
  } catch (e) { /* ignore */ }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] != null)
      return String(process.env[key]);
  } catch (e) { /* ignore */ }
  try {
    if (typeof $prefs !== 'undefined' && typeof $prefs.valueForKey === 'function') {
      const v = $prefs.valueForKey(key);
      if (v != null) return String(v);
    }
  } catch (e) { /* ignore */ }
  return '';
}

/**
 * 单账号签到
 * @param {{email?:string,password?:string,cookie?:string}} acc
 * @param {number} index 账号序号（从 1 开始）
 */
async function checkinAccount(acc, index) {
  const label = acc.email ? maskEmail(acc.email) : `Cookie账号#${index}`;
  let cookie = acc.cookie || '';

  try {
    /* --- 步骤 1：确定验证码是否开启 --- */
    let captchaEnabled = true;
    try {
      const cfg = await http('GET', API.serverConfig);
      if (cfg.body && cfg.body.data) {
        captchaEnabled = cfg.body.data.captcha_enabled !== false;
      }
    } catch (e) {
      log(`[${label}] 读取服务端配置失败，按默认开启验证码处理`);
    }

    /* --- 步骤 2：若无 Cookie 则邮箱密码登录 --- */
    if (!cookie) {
      if (!acc.email || !acc.password) {
        return { ok: false, label, msg: '缺少账号或密码' };
      }
      const captchaToken = await solveCaptcha(captchaEnabled);
      const loginRes = await http('POST', API.passwordLogin, {
        body: {
          email: acc.email,
          password: acc.password,
          captcha_token: captchaToken || '',
        },
      });
      const lb = loginRes.body;
      if (!lb || lb.code !== 0) {
        return {
          ok: false, label,
          msg: `登录失败: ${(lb && (lb.message || lb.msg)) || loginRes.status}`,
        };
      }
      cookie = mergeCookies('', loginRes.setCookie);
      if (!cookie) {
        return { ok: false, label, msg: '登录成功但未返回 Cookie，请改用手动抓 Cookie 方式' };
      }
      log(`[${label}] 登录成功`);
    }

    /* --- 步骤 3：查询今日签到状态（幂等） --- */
    const statusRes = await http('GET', API.checkinGet, { cookieStore: cookie });
    if (statusRes.status === 401) {
      return { ok: false, label, msg: 'Cookie 已失效，请重新获取' };
    }
    const sb = statusRes.body;
    const already = sb && sb.data && sb.data.checked_in === true;

    // 余额查询工具
    const getBalance = async () => {
      try {
        const w = await http('GET', API.wallet, { cookieStore: cookie });
        if (w.body && w.body.code === 0 && w.body.data)
          return w.body.data.balance != null ? w.body.data.balance / 1000 : null;
      } catch (e) { /* ignore */ }
      return null;
    };

    if (already) {
      const bal = await getBalance();
      return {
        ok: true, label, already: true,
        msg: `今日已签到${bal != null ? `，当前积分 ${bal}` : ''}`,
      };
    }

    /* --- 步骤 4：执行签到 --- */
    const captchaToken = await solveCaptcha(captchaEnabled);
    const r = await http('POST', API.checkinPost, {
      cookieStore: cookie,
      body: { captcha_token: captchaToken || '' },
    });
    const rb = r.body;

    if (rb && rb.code === 0) {
      const bal = await getBalance();
      return {
        ok: true, label,
        msg: `签到成功 +100 积分${bal != null ? `，当前积分 ${bal}` : ''}`,
      };
    }

    // 部分实现会用特定文案表示重复签到
    const msg = (rb && (rb.message || rb.msg)) || `HTTP ${r.status}`;
    if (/已.*签到|重复|already/i.test(String(msg))) {
      const bal = await getBalance();
      return { ok: true, label, already: true, msg: `今日已签到${bal != null ? `，当前积分 ${bal}` : ''}` };
    }
    return { ok: false, label, msg: `签到失败: ${msg}` };
  } catch (err) {
    return { ok: false, label, msg: `异常: ${(err && err.message) || err}` };
  }
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  const keep = name.slice(0, 2);
  return `${keep}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

/* ============================ 通知 ============================ */

function notify(title, subtitle, body) {
  if (typeof $notify !== 'undefined') {
    $notify(title, subtitle, body);
  } else {
    console.log(`\n===== ${title} =====\n${subtitle}\n${body}\n`);
  }
}

/* ============================ 入口 ============================ */

/**
 * 兼容两种运行模式：
 *   1) [task_local] 定时任务 —— 直接执行签到
 *   2) [rewrite_local] 抓包 —— 把捕获到的 Cookie 写入本地存储，供定时任务复用
 */
async function main() {
  // ---- 模式 2：重写抓包（自动捕获 Cookie）----
  if (typeof $request !== 'undefined' && $request && $request.headers) {
    handleRewrite();
    return;
  }

  // ---- 模式 1：定时签到 ----
  const accounts = parseAccounts();
  if (accounts.length === 0) {
    notify(
      'MonkeyCode 签到',
      '未配置账号',
      '请在 [task_local] 中配置 env=MONKEYCODE_ACCOUNTS=邮箱,密码\n' +
      '或 env=MONKEYCODE_COOKIES=Cookie'
    );
    if (typeof $done !== 'undefined') $done();
    return;
  }

  log(`共 ${accounts.length} 个账号，开始签到`);
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const r = await checkinAccount(accounts[i], i + 1);
    results.push(r);
    log(`[${r.label}] ${r.ok ? '✓' : '✗'} ${r.msg}`);
    // 账号间隔，降低请求频率
    if (i < accounts.length - 1) await sleep(1500);
  }

  const okCount = results.filter((r) => r.ok).length;
  const successList = results.filter((r) => r.ok && !r.already);
  const failList = results.filter((r) => !r.ok);

  let subtitle;
  if (failList.length === 0) {
    subtitle = successList.length > 0
      ? `签到成功 ${successList.length} 个`
      : '全部已签到';
  } else if (okCount === 0) {
    subtitle = '全部失败';
  } else {
    subtitle = `成功 ${okCount} / 失败 ${failList.length}`;
  }

  const body = results.map((r) => `${r.label}: ${r.msg}`).join('\n');
  notify('MonkeyCode 每日签到', subtitle, body);

  if (typeof $done !== 'undefined') $done();
}

/** 抓包模式：从登录请求头中提取 Cookie 并持久化 */
function handleRewrite() {
  const cookie = $request.headers['Cookie'] || $request.headers['cookie'] || '';
  if (cookie) {
    if (typeof $prefs !== 'undefined') {
      $prefs.setValueForKey(cookie, 'MONKEYCODE_COOKIE_CACHE');
    }
    log('已捕获 Cookie 并保存');
  }
  if (typeof $done !== 'undefined') $done({});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  log(`脚本异常: ${(e && e.stack) || e}`);
  notify('MonkeyCode 签到', '脚本异常', String((e && e.message) || e));
  if (typeof $done !== 'undefined') $done();
});

/* 供本地测试引用 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { prng, sha256Hex, solveCaptcha, checkinAccount, parseAccounts, mergeCookies };
}
