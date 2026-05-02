const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = '8711297302:AAFgsMxbXlcWtuaDbRU2Unqn2cVNW4kNbYw';
const TELEGRAM_CHAT_ID = '8714907722';

// ── TRADE STORAGE ────────────────────────────────────────────
const trades = [];
let currentPrice = 0;
let lastPriceUpdate = null;

// ── TELEGRAM ─────────────────────────────────────────────────
function sendTelegram(message) {
  const text = encodeURIComponent(message);
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${text}&parse_mode=HTML`;
  https.get(url, (res) => {
    res.on('data', () => {});
  }).on('error', (e) => {
    console.error('Telegram error:', e.message);
  });
}

// ── FETCH LIVE SPX PRICE ─────────────────────────────────────
function fetchSPXPrice(callback) {
  const options = {
    hostname: 'query1.finance.yahoo.com',
    path: '/v8/finance/chart/%5EGSPC?interval=1m&range=1d',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) {
          currentPrice = parseFloat(price);
          lastPriceUpdate = new Date();
          if (callback) callback(currentPrice);
        }
      } catch (e) {
        console.error('Price fetch error:', e.message);
      }
    });
  });
  req.on('error', (e) => console.error('Request error:', e.message));
  req.end();
}

// ── PRICE MONITOR — every 30 seconds ─────────────────────────
function monitorTrades() {
  fetchSPXPrice((price) => {
    console.log(`SPX: ${price} @ ${new Date().toLocaleTimeString('en-US', {timeZone:'America/New_York'})} EST`);

    const openTrades = trades.filter(t => t.result === 'OPEN');

    openTrades.forEach(trade => {
      const isCall = trade.signal.includes('CALL');
      const isPut  = trade.signal.includes('PUT');
      const entry  = parseFloat(trade.price);
      const tp1    = parseFloat(trade.tp1);
      const sl     = parseFloat(trade.sl);
      const ageMin = (new Date() - new Date(trade.time)) / 1000 / 60;

      if (!tp1 || !sl) return;

      // CALL: TP1 hit
      if (isCall && price >= tp1) {
        trade.result = 'WIN';
        trade.exitPrice = price.toFixed(2);
        trade.exitTime = new Date().toISOString();
        sendTelegram(`✅ <b>WIN — TP1 HIT</b>\nSignal: ${trade.signal}\nEntry: ${entry} → Exit: ${price}\n+${(tp1-entry).toFixed(2)} pts 🎯`);
      }
      // PUT: TP1 hit
      else if (isPut && price <= tp1) {
        trade.result = 'WIN';
        trade.exitPrice = price.toFixed(2);
        trade.exitTime = new Date().toISOString();
        sendTelegram(`✅ <b>WIN — TP1 HIT</b>\nSignal: ${trade.signal}\nEntry: ${entry} → Exit: ${price}\n+${(entry-tp1).toFixed(2)} pts 🎯`);
      }
      // CALL: SL hit
      else if (isCall && price <= sl) {
        trade.result = 'LOSS';
        trade.exitPrice = price.toFixed(2);
        trade.exitTime = new Date().toISOString();
        sendTelegram(`❌ <b>LOSS — SL HIT</b>\nSignal: ${trade.signal}\nEntry: ${entry} → Exit: ${price}\n-${(entry-sl).toFixed(2)} pts`);
      }
      // PUT: SL hit
      else if (isPut && price >= sl) {
        trade.result = 'LOSS';
        trade.exitPrice = price.toFixed(2);
        trade.exitTime = new Date().toISOString();
        sendTelegram(`❌ <b>LOSS — SL HIT</b>\nSignal: ${trade.signal}\nEntry: ${entry} → Exit: ${price}\n-${(sl-entry).toFixed(2)} pts`);
      }
      // Auto expire after 90 mins
      else if (ageMin > 90) {
        trade.result = 'EXPIRED';
        trade.exitPrice = price.toFixed(2);
        trade.exitTime = new Date().toISOString();
        sendTelegram(`⏰ <b>EXPIRED</b>\nSignal: ${trade.signal}\nEntry: ${entry} | Current: ${price}\nNeither TP1 nor SL hit in 90 mins`);
      }
    });
  });
}

setInterval(monitorTrades, 30000);

// ── WEBHOOK ───────────────────────────────────────────────────
app.post('/webhook', (req, res) => {
  const data   = req.body;
  const signal = data.signal || 'UNKNOWN';
  const price  = parseFloat(data.price || currentPrice || 0).toFixed(2);
  const sl     = parseFloat(data.sl  || 0).toFixed(2);
  const tp1    = parseFloat(data.tp1 || 0).toFixed(2);
  const tp2    = parseFloat(data.tp2 || 0).toFixed(2);
  const tp3    = parseFloat(data.tp3 || 0).toFixed(2);
  const time   = new Date().toLocaleTimeString('en-US', {timeZone:'America/New_York'});

  const trade = {
    id: Date.now(),
    time: new Date().toISOString(),
    signal, price, sl, tp1, tp2, tp3,
    result: (signal.includes('WAIT') || signal.includes('EXIT')) ? 'INFO' : 'OPEN',
    exitPrice: null,
    exitTime: null
  };

  trades.push(trade);

  let emoji = '⚡';
  if (signal.includes('CALL')) emoji = '🟢';
  if (signal.includes('PUT'))  emoji = '🔴';
  if (signal.includes('WAIT')) emoji = '⏳';
  if (signal.includes('EXIT')) emoji = '🚨';

  const msg = `${emoji} <b>SPX SNIPER</b>
Signal: <b>${signal}</b>
Time: ${time} EST
Entry: <b>${price}</b>
TP1: ${tp1} | TP2: ${tp2} | TP3: ${tp3}
SL: ${sl}
<i>📡 Monitoring automatically...</i>`;

  sendTelegram(msg);
  console.log('Signal:', signal, '@', price);
  res.json({ status: 'ok', trade });
});

// ── DASHBOARD ─────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  const tradeable = trades.filter(t => t.result !== 'INFO');
  const closed    = tradeable.filter(t => t.result !== 'OPEN');
  const wins      = closed.filter(t => t.result === 'WIN').length;
  const losses    = closed.filter(t => t.result === 'LOSS').length;
  const expired   = closed.filter(t => t.result === 'EXPIRED').length;
  const open      = tradeable.filter(t => t.result === 'OPEN').length;
  const winRate   = closed.length > 0 ? ((wins/closed.length)*100).toFixed(1) : 0;

  const callWins  = trades.filter(t => t.signal==='CALL' && t.result==='WIN').length;
  const callLoss  = trades.filter(t => t.signal==='CALL' && t.result==='LOSS').length;
  const putWins   = trades.filter(t => t.signal==='PUT'  && t.result==='WIN').length;
  const putLoss   = trades.filter(t => t.signal==='PUT'  && t.result==='LOSS').length;
  const ceWins    = trades.filter(t => t.signal==='CALL Entry' && t.result==='WIN').length;
  const ceLoss    = trades.filter(t => t.signal==='CALL Entry' && t.result==='LOSS').length;
  const peWins    = trades.filter(t => t.signal==='PUT Entry'  && t.result==='WIN').length;
  const peLoss    = trades.filter(t => t.signal==='PUT Entry'  && t.result==='LOSS').length;

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>SPX Sniper Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0d0d0d;color:#fff;font-family:-apple-system,sans-serif;padding:20px}
    h1{color:#FFD700;font-size:24px;margin-bottom:5px}
    .sub{color:#555;font-size:12px;margin-bottom:15px}
    .pricebar{background:#1a1a1a;border-radius:10px;padding:12px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
    .pricebar span{color:#888;font-size:12px}
    .pricebar strong{color:#00FF88;font-size:22px}
    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px}
    .stat{background:#1a1a1a;border-radius:10px;padding:15px;text-align:center}
    .stat h2{font-size:26px;font-weight:bold}
    .stat p{color:#666;font-size:11px;margin-top:4px}
    .green{color:#00FF88}.red{color:#FF69B4}.gold{color:#FFD700}.white{color:#fff}.orange{color:#FFA500}
    .section{color:#FFD700;font-size:15px;margin:20px 0 10px}
    .breakdown{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:20px}
    .bcard{background:#1a1a1a;border-radius:10px;padding:12px}
    .bcard h3{font-size:12px;color:#888;margin-bottom:8px}
    .brow{display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid #222}
    .brow:last-child{border-bottom:none}
    table{width:100%;border-collapse:collapse;background:#1a1a1a;border-radius:10px;overflow:hidden}
    th{background:#222;padding:9px 10px;text-align:left;color:#FFD700;font-size:11px}
    td{padding:9px 10px;border-top:1px solid #1f1f1f;font-size:11px}
    .win{color:#00FF88;font-weight:bold}.loss{color:#FF69B4;font-weight:bold}
    .open{color:#FFD700;font-weight:bold}.expired{color:#555}.info{color:#333}
    .badge{padding:2px 7px;border-radius:20px;font-size:10px;font-weight:bold}
    .bc{background:#252525;color:#aaa}.bp{background:#200a12;color:#FF69B4}
    .bw{background:#1a1500;color:#FFD700}.be{background:#1a0000;color:#ff4444}
    .bn{background:#0a1a0a;color:#00FF88}
    .refresh{color:#333;font-size:10px;margin-bottom:12px}
  </style>
  <script>setTimeout(()=>location.reload(),15000)</script>
</head>
<body>
  <h1>🎯 SPX Sniper Dashboard</h1>
  <p class="sub">Automated Paper Testing — Zero manual input required</p>
  <p class="refresh">Auto-refreshes every 15s</p>

  <div class="pricebar">
    <span>Live SPX</span>
    <strong>${currentPrice > 0 ? currentPrice.toFixed(2) : 'Fetching...'}</strong>
    <span>${lastPriceUpdate ? lastPriceUpdate.toLocaleTimeString('en-US',{timeZone:'America/New_York'})+' EST' : '--'}</span>
  </div>

  <div class="stats">
    <div class="stat"><h2 class="gold">${winRate}%</h2><p>Win Rate</p></div>
    <div class="stat"><h2 class="white">${closed.length}</h2><p>Closed</p></div>
    <div class="stat"><h2 class="green">${wins}</h2><p>Wins ✅</p></div>
    <div class="stat"><h2 class="red">${losses}</h2><p>Losses ❌</p></div>
    <div class="stat"><h2 class="gold">${open}</h2><p>Open 🔄</p></div>
    <div class="stat"><h2 class="orange">${expired}</h2><p>Expired ⏰</p></div>
  </div>

  <h2 class="section">📊 Signal Breakdown</h2>
  <div class="breakdown">
    <div class="bcard"><h3>🟢 CALL</h3>
      <div class="brow"><span>Wins</span><span class="green">${callWins}</span></div>
      <div class="brow"><span>Losses</span><span class="red">${callLoss}</span></div>
      <div class="brow"><span>Win Rate</span><span class="gold">${callWins+callLoss>0?((callWins/(callWins+callLoss))*100).toFixed(0):0}%</span></div>
    </div>
    <div class="bcard"><h3>🔴 PUT</h3>
      <div class="brow"><span>Wins</span><span class="green">${putWins}</span></div>
      <div class="brow"><span>Losses</span><span class="red">${putLoss}</span></div>
      <div class="brow"><span>Win Rate</span><span class="gold">${putWins+putLoss>0?((putWins/(putWins+putLoss))*100).toFixed(0):0}%</span></div>
    </div>
    <div class="bcard"><h3>🟢 CALL Entry</h3>
      <div class="brow"><span>Wins</span><span class="green">${ceWins}</span></div>
      <div class="brow"><span>Losses</span><span class="red">${ceLoss}</span></div>
      <div class="brow"><span>Win Rate</span><span class="gold">${ceWins+ceLoss>0?((ceWins/(ceWins+ceLoss))*100).toFixed(0):0}%</span></div>
    </div>
    <div class="bcard"><h3>🔴 PUT Entry</h3>
      <div class="brow"><span>Wins</span><span class="green">${peWins}</span></div>
      <div class="brow"><span>Losses</span><span class="red">${peLoss}</span></div>
      <div class="brow"><span>Win Rate</span><span class="gold">${peWins+peLoss>0?((peWins/(peLoss+peWins))*100).toFixed(0):0}%</span></div>
    </div>
  </div>

  <h2 class="section">📋 All Signals</h2>
  <table>
    <tr><th>Time</th><th>Signal</th><th>Entry</th><th>TP1</th><th>SL</th><th>Exit</th><th>Result</th></tr>
    ${trades.slice().reverse().map(t=>`
    <tr>
      <td>${new Date(t.time).toLocaleTimeString('en-US',{timeZone:'America/New_York'})}</td>
      <td><span class="badge ${t.signal.includes('Entry')?'bn':t.signal.includes('CALL')?'bc':t.signal.includes('PUT')?'bp':t.signal.includes('WAIT')?'bw':'be'}">${t.signal}</span></td>
      <td>${t.price}</td>
      <td class="gold">${parseFloat(t.tp1)>0?t.tp1:'-'}</td>
      <td class="red">${parseFloat(t.sl)>0?t.sl:'-'}</td>
      <td>${t.exitPrice||'-'}</td>
      <td class="${t.result==='WIN'?'win':t.result==='LOSS'?'loss':t.result==='OPEN'?'open':t.result==='EXPIRED'?'expired':'info'}">${t.result}</td>
    </tr>`).join('')}
  </table>
</body>
</html>`);
});

app.get('/health', (req, res) => res.json({
  status: 'alive',
  spxPrice: currentPrice,
  lastUpdate: lastPriceUpdate,
  total: trades.length,
  open: trades.filter(t=>t.result==='OPEN').length
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SPX Sniper running on port ${PORT}`);
  sendTelegram('🚀 <b>SPX Sniper LIVE</b>\nAutomated paper testing active ✅\nSignals tracked automatically — zero input needed.');
  fetchSPXPrice((p) => console.log('Initial SPX price:', p));
});
