/**
 * Alpha Vantage market data (server-side only — API key stays off the client).
 * Free tier: ~25 requests/day and ~1 call/sec — queue + cache aggressively.
 * @see https://www.alphavantage.co/documentation/
 */

const BASE = 'https://www.alphavantage.co/query';

/** Space every HTTP call; avoids Note spam when adjusted + daily run back-to-back. */
const MIN_MS_BETWEEN_CALLS = Math.max(
  1100,
  parseInt(process.env.ALPHA_VANTAGE_MIN_INTERVAL_MS || '1200', 10) || 1200
);

/** EOD series changes once per day; long TTL saves the 25/day budget on refresh. */
const SERIES_CACHE_MS = Math.max(
  60_000,
  parseInt(process.env.ALPHA_VANTAGE_SERIES_CACHE_MS || String(6 * 60 * 60 * 1000), 10) ||
    6 * 60 * 60 * 1000
);

const SEARCH_HIT_CACHE_MS = 30 * 60 * 1000;
const SEARCH_MISS_CACHE_MS = 90 * 1000;

/** TOP_GAINERS_LOSERS changes intraday; cache to protect free-tier quota. */
const TOP_MOVERS_CACHE_MS = Math.max(
  15 * 60 * 1000,
  parseInt(process.env.ALPHA_VANTAGE_TOP_MOVERS_CACHE_MS || String(45 * 60 * 1000), 10) || 45 * 60 * 1000
);

function getApiKey() {
  return (process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '').trim();
}

/**
 * Alpha Vantage: outputsize=compact (~100 points) is free; outputsize=full requires premium.
 * Set ALPHA_VANTAGE_OUTPUTSIZE=full only with a paid key.
 */
function resolveOutputSize() {
  const v = (process.env.ALPHA_VANTAGE_OUTPUTSIZE || 'compact').toLowerCase().trim();
  return v === 'full' ? 'full' : 'compact';
}

const cache = new Map(); // key -> { at, payload }

let avQueue = Promise.resolve();
let lastAvCallAt = 0;

function cacheGet(key, ttlMs) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > ttlMs) {
    cache.delete(key);
    return null;
  }
  return row.payload;
}

function cacheSet(key, payload) {
  cache.set(key, { at: Date.now(), payload });
}

function cacheGetSymbolSearch(key) {
  const row = cache.get(key);
  if (!row) return null;
  const hit = row.payload?.matches?.length > 0;
  const ttl = hit ? SEARCH_HIT_CACHE_MS : SEARCH_MISS_CACHE_MS;
  if (Date.now() - row.at > ttl) {
    cache.delete(key);
    return null;
  }
  return row.payload;
}

function isRateLimitOrError(body) {
  if (!body || typeof body !== 'object') return true;
  if (body.Note || body.Information || body['Error Message']) return true;
  return false;
}

/**
 * Serializes Alpha Vantage HTTP calls and enforces minimum spacing (free-tier friendly).
 */
function fetchAv(params) {
  const apikey = getApiKey();
  if (!apikey) return Promise.resolve({ error: 'missing_key', body: null });

  const run = avQueue.then(async () => {
    const wait = Math.max(0, MIN_MS_BETWEEN_CALLS - (Date.now() - lastAvCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    const url = new URL(BASE);
    Object.entries({ ...params, apikey }).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'FlowFundAI/1.0' },
    });
    lastAvCallAt = Date.now();
    if (!res.ok) return { error: `http_${res.status}`, body: null };
    const body = await res.json();
    if (isRateLimitOrError(body)) return { error: 'av_limit_or_error', body };
    return { error: null, body };
  });

  avQueue = run.catch(() => {});
  return run;
}

/**
 * @param {string} keywords
 * @returns {Promise<{ matches: object[], rawNote?: string }>}
 */
async function symbolSearch(keywords) {
  const q = (keywords || '').trim();
  if (q.length < 1) return { matches: [] };

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = cacheGetSymbolSearch(cacheKey);
  if (cached) return cached;

  const { error, body } = await fetchAv({
    function: 'SYMBOL_SEARCH',
    keywords: q,
  });

  if (error || !body?.bestMatches) {
    const out = { matches: [], error: error || 'no_results', rawNote: body?.Note || body?.Information };
    cacheSet(cacheKey, out);
    return out;
  }

  const matches = body.bestMatches.map((m) => ({
    symbol: m['1. symbol'],
    name: m['2. name'],
    type: m['3. type'],
    region: m['4. region'],
    currency: m['8. currency'],
  }));

  const out = { matches };
  cacheSet(cacheKey, out);
  return out;
}

/**
 * Daily adjusted OHLCV, ascending by date.
 * @param {string} symbol
 * @param {{ outputsize?: 'compact'|'full' }} opts
 */
async function timeSeriesDailyAdjusted(symbol, opts = {}) {
  const sym = (symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!sym) return { error: 'bad_symbol', rows: [] };

  const outputsize = opts.outputsize === 'full' ? 'full' : 'compact';
  const cacheKey = `daily_adj:${sym}:${outputsize}`;
  const cached = cacheGet(cacheKey, SERIES_CACHE_MS);
  if (cached?.rows?.length) return cached;

  const { error, body } = await fetchAv({
    function: 'TIME_SERIES_DAILY_ADJUSTED',
    symbol: sym,
    outputsize,
  });

  if (error || !body['Time Series (Daily)']) {
    const out = {
      rows: [],
      error: error || 'no_series',
      meta: body?.['Meta Data'] || null,
      rawNote: body?.Note || body?.Information,
    };
    return out;
  }

  const ts = body['Time Series (Daily)'];
  const rows = Object.entries(ts)
    .map(([date, o]) => ({
      date,
      open: parseFloat(o['1. open']),
      high: parseFloat(o['2. high']),
      low: parseFloat(o['3. low']),
      close: parseFloat(o['4. close']),
      adjClose: parseFloat(o['5. adjusted close']),
      volume: parseInt(o['6. volume'], 10) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const out = {
    rows,
    error: null,
    meta: body['Meta Data'] || {},
    symbol: sym,
  };
  cacheSet(cacheKey, out);
  return out;
}

/**
 * Standard daily OHLCV (often still on free tier when DAILY_ADJUSTED is restricted).
 * Uses close as adjClose so downstream indicators stay unchanged.
 */
async function timeSeriesDaily(symbol, opts = {}) {
  const sym = (symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!sym) return { error: 'bad_symbol', rows: [] };

  const outputsize = opts.outputsize === 'full' ? 'full' : 'compact';
  const cacheKey = `daily:${sym}:${outputsize}`;
  const cached = cacheGet(cacheKey, SERIES_CACHE_MS);
  if (cached?.rows?.length) return cached;

  const { error, body } = await fetchAv({
    function: 'TIME_SERIES_DAILY',
    symbol: sym,
    outputsize,
  });

  if (error || !body['Time Series (Daily)']) {
    return {
      rows: [],
      error: error || 'no_series',
      meta: body?.['Meta Data'] || null,
      rawNote: body?.Note || body?.Information,
      symbol: sym,
    };
  }

  const ts = body['Time Series (Daily)'];
  const rows = Object.entries(ts)
    .map(([date, o]) => {
      const close = parseFloat(o['4. close']);
      return {
        date,
        open: parseFloat(o['1. open']),
        high: parseFloat(o['2. high']),
        low: parseFloat(o['3. low']),
        close,
        adjClose: close,
        volume: parseInt(o['5. volume'], 10) || 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const out = {
    rows,
    error: null,
    meta: body['Meta Data'] || {},
    symbol: sym,
  };
  cacheSet(cacheKey, out);
  return out;
}

/**
 * Prefer adjusted series; if Alpha Vantage blocks it (premium / migration), use TIME_SERIES_DAILY.
 */
async function fetchDailySeries(symbol, opts = {}) {
  const sym = (symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const adjusted = await timeSeriesDailyAdjusted(symbol, opts);
  if (adjusted.rows?.length > 0) {
    return {
      rows: adjusted.rows,
      meta: adjusted.meta,
      rawNote: null,
      avSeriesFunction: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol: sym,
    };
  }

  const daily = await timeSeriesDaily(symbol, opts);
  if (daily.rows?.length > 0) {
    const hint =
      adjusted.rawNote || adjusted.error
        ? 'Adjusted series was unavailable; using TIME_SERIES_DAILY (close ≈ adj. for same-day math).'
        : null;
    return {
      rows: daily.rows,
      meta: daily.meta,
      rawNote: hint,
      avSeriesFunction: 'TIME_SERIES_DAILY',
      symbol: sym,
    };
  }

  return {
    rows: [],
    meta: daily.meta || adjusted.meta,
    rawNote: daily.rawNote || adjusted.rawNote,
    avSeriesFunction: null,
    symbol: sym,
  };
}

/**
 * Alpha Vantage TOP_GAINERS_LOSERS — top gainers, losers, most actively traded (US).
 * @returns {Promise<{ error: string|null, last_updated?: string, most_actively_traded?: object[], top_gainers?: object[], top_losers?: object[], rawNote?: string }>}
 */
async function topGainersLosers() {
  const cacheKey = 'top_gainers_losers:v1';
  const cached = cacheGet(cacheKey, TOP_MOVERS_CACHE_MS);
  if (cached && !cached.error) return cached;

  const { error, body } = await fetchAv({ function: 'TOP_GAINERS_LOSERS' });

  if (error || !body?.most_actively_traded) {
    return {
      error: error || 'no_movers',
      most_actively_traded: [],
      rawNote: body?.Note || body?.Information,
    };
  }

  const out = {
    error: null,
    last_updated: body.last_updated || null,
    metadata: body.metadata || null,
    most_actively_traded: body.most_actively_traded,
    top_gainers: body.top_gainers || [],
    top_losers: body.top_losers || [],
  };
  cacheSet(cacheKey, out);
  return out;
}

const KNOWN_COMPANY_NAMES = {
  NVDA: 'NVIDIA Corporation',
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corporation',
  AMZN: 'Amazon.com Inc.',
  GOOGL: 'Alphabet Inc.',
  META: 'Meta Platforms Inc.',
  TSLA: 'Tesla Inc.',
  AVGO: 'Broadcom Inc.',
  INTC: 'Intel Corporation',
  PLTR: 'Palantir Technologies Inc.',
  AMD: 'Advanced Micro Devices',
  SPY: 'SPDR S&P 500 ETF Trust',
  VTI: 'Vanguard Total Stock Market ETF',
  VOO: 'Vanguard S&P 500 ETF',
  QQQ: 'Invesco QQQ Trust',
  IWM: 'iShares Russell 2000 ETF',
  BITO: 'ProShares Bitcoin ETF',
  NOK: 'Nokia Corporation',
  SOXL: 'Direxion Daily Semiconductor Bull 3X Shares',
  SOXS: 'Direxion Daily Semiconductor Bear 3X Shares',
};

/**
 * Pick liquid-looking US symbols from movers (skip obvious warrants/pennies where possible).
 */
function pickSuggestedStocksFromMovers(moversPayload, limit = 3) {
  const active = moversPayload.most_actively_traded || [];
  const plainTicker = (t) => typeof t === 'string' && /^[A-Z]{1,5}$/.test(t);
  const notWarrant = (t) => t && !/[W+^]/.test(t);
  const priceNum = (p) => parseFloat(p) || 0;

  const tier1 = active.filter(
    (x) =>
      plainTicker(x.ticker) &&
      notWarrant(x.ticker) &&
      priceNum(x.price) >= 8
  );
  const tier2 = active.filter(
    (x) => plainTicker(x.ticker) && notWarrant(x.ticker) && priceNum(x.price) >= 3
  );
  const pool = tier1.length >= limit ? tier1 : tier2.length >= limit ? tier2 : active;

  const seen = new Set();
  const rows = [];
  for (const x of pool) {
    if (rows.length >= limit) break;
    const sym = x.ticker;
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    rows.push({
      symbol: sym,
      name: KNOWN_COMPANY_NAMES[sym] || null,
      price: priceNum(x.price),
      changePercent: String(x.change_percentage || '').replace(/%/g, '').trim(),
      changeAmount: x.change_amount != null ? String(x.change_amount) : null,
      volume: parseInt(x.volume, 10) || 0,
      tag: 'High volume (US)',
    });
  }
  return rows;
}

const STATIC_DIVERSIFIED_PICKS = [
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    price: null,
    changePercent: null,
    changeAmount: null,
    volume: null,
    tag: 'Core US large-cap',
  },
  {
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    price: null,
    changePercent: null,
    changeAmount: null,
    volume: null,
    tag: 'Total US market',
  },
  {
    symbol: 'VXUS',
    name: 'Vanguard Total International Stock ETF',
    price: null,
    changePercent: null,
    changeAmount: null,
    volume: null,
    tag: 'International diversification',
  },
];

/**
 * @param {number} limit
 * @returns {Promise<{ stocks: object[], source: 'alphavantage'|'static', last_updated: string|null, notice?: string }>}
 */
async function getSuggestedStocksForReadiness(limit = 3) {
  if (!getApiKey()) {
    return {
      stocks: STATIC_DIVERSIFIED_PICKS.slice(0, limit),
      source: 'static',
      last_updated: null,
      notice: 'Set ALPHA_VANTAGE_API_KEY for live market movers from Alpha Vantage.',
    };
  }

  const movers = await topGainersLosers();
  if (movers.error) {
    return {
      stocks: STATIC_DIVERSIFIED_PICKS.slice(0, limit),
      source: 'static',
      last_updated: movers.last_updated || null,
      notice:
        movers.rawNote ||
        'Live movers temporarily unavailable (rate limit or API). Showing diversified ETF examples.',
    };
  }

  let stocks = pickSuggestedStocksFromMovers(movers, limit);
  if (stocks.length < limit) {
    const fill = STATIC_DIVERSIFIED_PICKS.filter((s) => !stocks.find((r) => r.symbol === s.symbol));
    stocks = [...stocks, ...fill].slice(0, limit);
  }

  return {
    stocks,
    source: 'alphavantage',
    last_updated: movers.last_updated || null,
    notice: undefined,
  };
}

module.exports = {
  getApiKey,
  resolveOutputSize,
  symbolSearch,
  timeSeriesDailyAdjusted,
  timeSeriesDaily,
  fetchDailySeries,
  topGainersLosers,
  pickSuggestedStocksFromMovers,
  getSuggestedStocksForReadiness,
};
