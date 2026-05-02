const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = '8711297302:AAFgsMxbXlcWtuaDbRU2Unqn2cVNW4kNbYw';
const TELEGRAM_CHAT_ID = '8714907722';

const trades = [];

function sendTelegram(message) {
  const text = encodeURIComponent(message);
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${text}&parse_mode=HTML`;
  https.get(url, (res) => {
    res.on('data', () => {});
  }).on('error', (e) => {
    console.error('Telegram error:', e.message);
  });
}

app.post('/webhook', (req, res) => {
  const data = req.body;
  const signal = data.signal || 'UNKNOWN';
  const price = parseFloat(data.price || 0).toFixed(2);
  const sl    = parseFloat(data.sl   || 0).toFixed(2);
  const tp1   = parseFloat(data.tp1  || 0).toFixed(2);
  const tp2   = parseFloat(data.tp2  || 0).toFixed(2);
  const tp3   = parseFloat(data.tp3  || 0).toFixed(2);
  const time  = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' });

  const trade = {
    id: Date.now(),
    time: new Date().toISOString(),
    signal, price, sl, tp1, tp2, tp3,
    result: 'OPEN',
    exitPrice: null
  };
  trades.push(trade);

  // Build Telegram message
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
SL: ${sl}`;

  sendTelegram(msg);
  console.log('Signal received:', trade);
  res.json({ status: 'ok', trade });
});

app.post('/result', (req, res) => {
  const { id, result, exitPrice } = req.body;
  const trade = trades.find(t => t.id == id);
  if (trade) {
    trade.result = result;
    trade.exitPrice = exitPrice;
    const emoji = result === 'WIN' ? '✅' : '❌';
    sendTelegram(`${emoji} Trade ${result}\nEntry: ${trade.price} → Exit: ${exitPrice}`);
  }
  res.json({ status: 'ok' });
});

app.get('/dashboard', (req, res) => {
  const closed = trades.filter(t => t.result !== 'OPEN');
  const wins = closed.filter(t => t.result === 'WIN').length;
  const losses = closed.filter(t => t.result === 'LOSS').length;
  const winRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : 0;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SPX Sniper Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0d0d0d; color: #fff; font-family: -apple-system, sans-serif; padding: 20px; }
        h1 { color: #FFD700; font-size: 24px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .stat { background: #1a1a1a; border-radius: 12px; padding: 20px; text-align: center; }
        .stat h2 { font-size: 32px; font-weight: bold; }
        .stat p { color: #888; font-size: 13px; margin-top: 5px; }
        .green { color: #00FF88; }
        .red { color: #FF69B4; }
        .gold { color: #FFD700; }
        .white { color: #fff; }
        table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 12px; overflow: hidden; }
        th { background: #222; padding: 12px; text-align: left; color: #FFD700; font-size: 13px; }
        td { padding: 12px; border-top: 1px solid #2a2a2a; font-size: 13px; }
        .win { color: #00FF88; font-weight: bold; }
        .loss { color: #FF69B4; font-weight: bold; }
        .open { color: #FFD700; font-weight: bold; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .badge-call { background: #333; color: #aaa; }
        .badge-put { background: #2a0a1a; color: #FF69B4; }
        .badge-wait { background: #2a2000; color: #FFD700; }
        .badge-exit { background: #2a0000; color: #ff4444; }
        .refresh { color: #888; font-size: 12px; margin-bottom: 15px; }
      </style>
      <script>setTimeout(() => location.reload(), 15000);</script>
    </head>
    <body>
      <h1>🎯 SPX Sniper Dashboard</h1>
      <p class="refresh">Auto-refreshes every 15 seconds</p>
      <div class="stats">
        <div class="stat">
          <h2 class="gold">${winRate}%</h2>
          <p>Win Rate</p>
        </div>
        <div class="stat">
          <h2 class="white">${closed.length}</h2>
          <p>Closed Trades</p>
        </div>
        <div class="stat">
          <h2 class="green">${wins}</h2>
          <p>Wins ✅</p>
        </div>
        <div class="stat">
          <h2 class="red">${losses}</h2>
          <p>Losses ❌</p>
        </div>
        <div class="stat">
          <h2 class="gold">${trades.filter(t => t.result === 'OPEN').length}</h2>
          <p>Open</p>
        </div>
      </div>
      <table>
        <tr>
          <th>Time</th>
          <th>Signal</th>
          <th>Entry</th>
          <th>TP1</th>
          <th>SL</th>
          <th>Result</th>
        </tr>
        ${trades.slice().reverse().map(t => `
          <tr>
            <td>${new Date(t.time).toLocaleTimeString('en-US', {timeZone:'America/New_York'})}</td>
            <td><span class="badge ${t.signal.includes('CALL') ? 'badge-call' : t.signal.includes('PUT') ? 'badge-put' : t.signal.includes('WAIT') ? 'badge-wait' : 'badge-exit'}">${t.signal}</span></td>
            <td>${t.price}</td>
            <td class="gold">${t.tp1}</td>
            <td class="red">${t.sl}</td>
            <td class="${t.result === 'WIN' ? 'win' : t.result === 'LOSS' ? 'loss' : 'open'}">${t.result}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => res.json({ status: 'alive', trades: trades.length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SPX Sniper server running on port ${PORT}`);
  sendTelegram('🚀 SPX Sniper server is LIVE and ready for signals!');
});
