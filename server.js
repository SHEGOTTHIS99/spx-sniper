const express = require('express');
const app = express();
app.use(express.json());

const trades = [];

app.post('/webhook', (req, res) => {
  const data = req.body;
  const trade = {
    id: Date.now(),
    time: new Date().toISOString(),
    signal: data.signal || 'UNKNOWN',
    price: data.price || 0,
    sl: data.sl || 0,
    tp1: data.tp1 || 0,
    tp2: data.tp2 || 0,
    tp3: data.tp3 || 0,
    result: 'OPEN',
    exitPrice: null
  };
  trades.push(trade);
  console.log('Signal received:', trade);
  res.json({ status: 'ok', trade });
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
        .win { color: #00FF88; }
        .loss { color: #FF69B4; }
        .open { color: #FFD700; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
        .badge-call { background: #333; color: #888; }
        .badge-put { background: #2a0a1a; color: #FF69B4; }
        .badge-wait { background: #2a2000; color: #FFD700; }
        .badge-exit { background: #2a0000; color: #ff4444; }
      </style>
      <script>setTimeout(() => location.reload(), 30000);</script>
    </head>
    <body>
      <h1>🎯 SPX Sniper Dashboard</h1>
      <div class="stats">
        <div class="stat">
          <h2 class="gold">${winRate}%</h2>
          <p>Win Rate</p>
        </div>
        <div class="stat">
          <h2 class="white">${closed.length}</h2>
          <p>Total Trades</p>
        </div>
        <div class="stat">
          <h2 class="green">${wins}</h2>
          <p>Wins</p>
        </div>
        <div class="stat">
          <h2 class="red">${losses}</h2>
          <p>Losses</p>
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
            <td>${new Date(t.time).toLocaleTimeString()}</td>
            <td><span class="badge ${t.signal.includes('CALL') ? 'badge-call' : t.signal.includes('PUT') ? 'badge-put' : t.signal.includes('WAIT') ? 'badge-wait' : 'badge-exit'}">${t.signal}</span></td>
            <td>${t.price}</td>
            <td>${t.tp1}</td>
            <td>${t.sl}</td>
            <td class="${t.result === 'WIN' ? 'win' : t.result === 'LOSS' ? 'loss' : 'open'}">${t.result}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => res.json({ status: 'alive' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SPX Sniper server running on port ${PORT}`));
