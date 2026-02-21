// Chart bars
  const chartEl = document.getElementById('chartBars');
  let initialBalance = 0.0;
  let currentBalance = initialBalance;
  let deposits = [];
  let withdrawals = [];
  let firstName;
  let Surname;
  let pinAttempts = 5;

  // Load persisted state (if any)
  function loadState() {
    try {
      const raw = localStorage.getItem('rancle_bank');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (typeof s.currentBalance === 'number') currentBalance = s.currentBalance;
        if (typeof s.initialBalance === 'number') initialBalance = s.initialBalance;
        if (Array.isArray(s.deposits)) deposits = s.deposits.map(Number);
        if (Array.isArray(s.withdrawals)) withdrawals = s.withdrawals.map(Number);
      }
    } catch (e) {
      // ignore parse errors
    }
    // If there's a stored current balance but no initialBalance, initialize it
    if (!initialBalance && currentBalance) initialBalance = currentBalance;
  }

  // Fetch and render top-5 currency rates (including GHS) into the Transactions panel
  async function fetchTopRatesAndRender() {
    const panel = document.getElementById('ratesPanel');
    const listEl = document.getElementById('ratesList');
    if (!panel || !listEl) return;
    listEl.textContent = 'Loading rates…';
    const symbols = ['USD','EUR','GBP','JPY','GHS'];
    const symbolMap = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', GHS: '₵' };
    const api = `https://api.exchangerate.host/latest?base=USD&symbols=${symbols.join(',')}`;
    try {
      const res = await fetch(api);
      const json = await res.json();
      const rates = json && json.rates ? json.rates : {};
      listEl.innerHTML = '';
      symbols.forEach(code => {
        const rate = (code === 'USD') ? 1 : (rates[code] || 0);
        const row = document.createElement('div');
        row.className = 'rate-row';
        row.innerHTML = `
          <div class="rate-left">
            <span class="rate-badge">${symbolMap[code] || ''}</span>
            <div class="rate-meta">
              <div class="rate-code">${code}</div>
              <div class="rate-label">per USD</div>
            </div>
          </div>
          <div class="rate-value">${rate.toFixed(4)}</div>`;
        // click to copy
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => {
          try { navigator.clipboard.writeText((rate).toFixed(4)); showToast(`${code} rate copied`); } catch(e){ showToast('Copy failed'); }
        });
        listEl.appendChild(row);
      });
      if (json && json.date) {
        const ts = document.createElement('div');
        ts.className = 'rates-timestamp';
        ts.textContent = `Updated: ${json.date}`;
        listEl.appendChild(ts);
        // populate header timestamp and refresh handler
        const up = document.getElementById('ratesUpdated');
        if (up) up.textContent = json.date;
        const btn = document.getElementById('refreshRates');
        if (btn) btn.onclick = fetchTopRatesAndRender;
      }
    } catch (e) {
      // fallback
      const fallback = {
        USD:1, EUR:0.92, GBP:0.82, JPY:145.12, GHS:12.50
      };
      listEl.innerHTML = '';
      Object.keys(fallback).forEach(code => {
        const row = document.createElement('div');
        row.className = 'rate-row';
        row.innerHTML = `
          <div class="rate-left">
            <span class="rate-badge">${symbolMap[code] || ''}</span>
            <div class="rate-meta">
              <div class="rate-code">${code}</div>
              <div class="rate-label">per USD</div>
            </div>
          </div>
          <div class="rate-value">${fallback[code].toFixed(4)}</div>`;
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => { try{navigator.clipboard.writeText(fallback[code].toFixed(4)); showToast(`${code} rate copied`)}catch(e){showToast('Copy failed')}; });
        listEl.appendChild(row);
      });
      const ts = document.createElement('div');
      ts.className = 'rates-timestamp';
      ts.textContent = 'Rates unavailable — showing sample values';
      listEl.appendChild(ts);
      const up = document.getElementById('ratesUpdated'); if (up) up.textContent = 'offline sample';
      const btn = document.getElementById('refreshRates'); if (btn) btn.onclick = fetchTopRatesAndRender;
    }
  }

  // Fetch 30-day timeseries for currencies against GHS and render SVG sparklines
  async function fetchCurrencyHistoryAndRender() {
    const container = document.getElementById('currencyList');
    if (!container) return;
    container.innerHTML = '<div class="currency-loading">Loading currency charts…</div>';
    const symbols = ['USD','EUR','GBP','JPY'];
    // build date range (last 30 days)
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 29);
    const fmt = (d) => d.toISOString().slice(0,10);
    const api = `https://api.exchangerate.host/timeseries?start_date=${fmt(from)}&end_date=${fmt(to)}&base=GHS&symbols=${symbols.join(',')}`;
    try {
      const res = await fetch(api);
      const json = await res.json();
      const ratesByDate = json.rates || {};
      const dates = Object.keys(ratesByDate).sort();
      const series = {};
      symbols.forEach(s => series[s] = []);
      dates.forEach(d => {
        const day = ratesByDate[d] || {};
        symbols.forEach(s => series[s].push(Number(day[s] || 0)));
      });
      // render cards with SVG sparklines
      container.innerHTML = '';
      symbols.forEach(code => {
        const arr = series[code];
        const card = document.createElement('div');
        card.className = 'currency-card';
        const current = arr[arr.length-1] || 0;
        // build sparkline SVG
        const w = 220, h = 56, pad = 6;
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        const range = max - min || 1;
        const points = arr.map((v,i) => {
          const x = pad + (i * (w - pad*2) / (arr.length-1 || 1));
          const y = pad + (1 - (v - min) / range) * (h - pad*2);
          return `${x},${y}`;
        }).join(' ');
        const pathD = 'M' + points.replace(/\s+/g,' L ');
        const areaD = pathD + ` L ${w-pad},${h-pad} L ${pad},${h-pad} Z`;
        const svg = `
          <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark">
            <defs>
              <linearGradient id="g-${code}" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="#ff9a9e" stop-opacity="0.36" />
                <stop offset="100%" stop-color="#fecfef" stop-opacity="0.04" />
              </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#g-${code})" stroke="none"></path>
            <path d="${pathD}" fill="none" stroke="#ff7b7b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
            <title>${code} — ${current.toFixed(4)} (last: ${dates[dates.length-1] || ''})</title>
          </svg>`;
        card.innerHTML = `
          <div class="currency-header"><span class="code">${code}</span><span class="value">${current.toFixed(4)}</span></div>
          <div class="mini-chart">${svg}</div>`;
        container.appendChild(card);
        // attach interactive tooltip handlers to the appended SVG
        const svgEl = card.querySelector('svg');
        if (svgEl) {
          svgEl.__spark = { arr: arr.slice(), dates: dates.slice(), code, min, max, pad, w, h };
          setupSparkTooltip(svgEl);
        }
      });
    } catch (e) {
      // fallback static display
      container.innerHTML = '<div class="currency-loading">Rates unavailable — showing sample charts</div>';
    }
  }
  function saveState() {
    try {
      const state = {
        currentBalance,
        initialBalance,
        deposits,
        withdrawals
      };
      localStorage.setItem('rancle_bank', JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }

  // --- Sparkline tooltip helpers ---
  function ensureSparkTooltip() {
    if (document.getElementById('sparkTooltip')) return;
    const tt = document.createElement('div');
    tt.id = 'sparkTooltip';
    tt.style.position = 'absolute';
    tt.style.pointerEvents = 'none';
    tt.style.background = 'rgba(23,25,28,0.92)';
    tt.style.color = '#fff';
    tt.style.padding = '6px 8px';
    tt.style.borderRadius = '6px';
    tt.style.fontSize = '12px';
    tt.style.boxShadow = '0 6px 18px rgba(8,10,12,0.4)';
    tt.style.zIndex = '9999';
    tt.style.display = 'none';
    document.body.appendChild(tt);
  }

  function setupSparkTooltip(svg) {
    ensureSparkTooltip();
    const meta = svg.__spark;
    if (!meta || !Array.isArray(meta.arr) || !Array.isArray(meta.dates)) return;
    const tt = document.getElementById('sparkTooltip');
    // create marker circle
    let marker = svg.querySelector('.spark-marker');
    if (!marker) {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('class', 'spark-marker');
      marker.setAttribute('r', 3.5);
      marker.setAttribute('fill', '#ffffff');
      marker.setAttribute('stroke', '#ff7b7b');
      marker.setAttribute('stroke-width', '1');
      marker.style.display = 'none';
      svg.appendChild(marker);
    }

    svg.addEventListener('mousemove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const xRel = ev.clientX - rect.left;
      const t = Math.max(0, Math.min(1, xRel / rect.width));
      const idx = Math.round(t * (meta.arr.length - 1));
      const val = meta.arr[Math.max(0, Math.min(meta.arr.length - 1, idx))] || 0;
      const date = meta.dates[idx] || '';
      const vb = svg.viewBox.baseVal;
      const pad = meta.pad || 6;
      const w = vb.width || meta.w || rect.width;
      const h = vb.height || meta.h || rect.height;
      const range = (meta.max - meta.min) || 1;
      const x = pad + (idx * (w - pad * 2) / (meta.arr.length - 1 || 1));
      const y = pad + (1 - (val - meta.min) / range) * (h - pad * 2);
      // position marker
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.style.display = 'block';
      // show tooltip
      tt.textContent = `${meta.code} ${Number(val).toFixed(4)} — ${date}`;
      tt.style.display = 'block';
      tt.style.left = (ev.pageX + 12) + 'px';
      tt.style.top = (ev.pageY + 12) + 'px';
    });

    svg.addEventListener('mouseleave', () => {
      const mk = svg.querySelector('.spark-marker'); if (mk) mk.style.display = 'none';
      const tt = document.getElementById('sparkTooltip'); if (tt) tt.style.display = 'none';
    });
  }

  // Fetch latest exchange rates (USD base) and render chart with USD, GBP, GHS
  async function loadRatesAndRender() {
    if (!chartEl) return;
    chartEl.innerHTML = '<div class="loading">Loading rates…</div>';
    const api = 'https://api.exchangerate.host/latest?base=USD&symbols=GBP,GHS';
    try {
      const res = await fetch(api);
      const json = await res.json();
      const rates = json && json.rates ? json.rates : {};
      const labels = ['USD', 'GBP', 'GHS'];
      const values = [1, Number(rates.GBP) || 0, Number(rates.GHS) || 0];
      const maxVal = Math.max(...values.filter(v => v > 0));
      chartEl.innerHTML = '';
      labels.forEach((lab, i) => {
        const v = values[i] || 0;
        const pct = maxVal ? (v / maxVal) * 100 : 0;
        chartEl.innerHTML += `
        <div class="bar-wrap">
          <div class="bar" style="height:${pct}%" title="${lab}: ${v}"></div>
          <span class="bar-month">${lab}</span>
        </div>`;
      });
    } catch (e) {
      // fallback: show static sample values
      const labels = ['USD','GBP','GHS'];
      const values = [1, 0.82, 12.5];
      const maxVal = Math.max(...values);
      chartEl.innerHTML = '';
      labels.forEach((lab, i) => {
        const pct = (values[i] / maxVal) * 100;
        chartEl.innerHTML += `
        <div class="bar-wrap">
          <div class="bar" style="height:${pct}%" title="${lab}: ${values[i]}"></div>
          <span class="bar-month">${lab}</span>
        </div>`;
      });
    }
  }


  // Modal logic
  let currentModal = '';

  const modals = {
    balance: {
      title: 'Account Balance',
      sub: 'Your current account overview.',
      body: `<div style="background:rgba(201,146,42,0.08);border:1px solid rgba(201,146,42,0.2);border-radius:14px;padding:1.5rem;text-align:center">
          <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#8FADB8;margin-bottom:0.5rem">Available Balance</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:3rem;font-weight:600;color:#F4F1EC">$<span id="liveBalance">${currentBalance.toFixed(2)}</span></div>
          <div style="font-size:0.75rem;color:#4CAF82;margin-top:0.25rem">↑ +2.4% this month</div>
        </div>`
    },
    withdraw: {
      title: 'Withdraw Funds',
      sub: 'Enter the amount you wish to withdraw.',
      body: `
        <div class="form-group">
          <label class="form-label">Amount (USD)</label>
          <input class="form-input" type="number" id="Wamount" placeholder="0.00" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">PIN Confirmation</label>
          <input class="form-input" type="password" id="txPin" placeholder="••••" maxlength="4">
        </div>`
    },
    deposit: {
      title: 'Make a Deposit',
      sub: 'Add funds securely to your account.',
      body: `
        <div class="form-group">
          <label class="form-label">Amount (USD)</label>
          <input class="form-input" type="number" id="Damount" placeholder="0.00" min="1">
        </div>
        <div class="form-group">
          <label class="form-label">Source Reference</label>
          <input class="form-input" type="text" id="txRef" placeholder="Bank transfer / Cash / Wallet">
        </div>`
    }
  };

  // Processors for deposit/withdraw actions
  function depositProcess() {
    const el = document.getElementById('Damount');
    const amt = el ? parseFloat(el.value) || 0 : 0;
    if (!amt || amt <= 0) {
      showToast('Enter a valid deposit amount');
      return 0;
    }
    currentBalance += amt;
    deposits.push(amt);
    updateBalanceDisplay();
    saveState();
    return amt;
  }

  // Withdraw processor (separate function)
  function withdrawProcess() {
    const pinEl = document.getElementById('txPin');
    const pin = pinEl ? String(pinEl.value).trim() : '';
    if (pin !== '1221') {
      pinAttempts = Math.max(0, pinAttempts - 1);
      if (pinEl) pinEl.value = '';
      if (pinAttempts > 0) {
        showToast(`Invalid PIN. ${pinAttempts} attempts remaining`);
        return null;
      }
      showToast('Too many incorrect PIN attempts — action blocked');
      // optionally close modal
      document.getElementById('modalOverlay').classList.remove('open');
      return null;
    }

    const el = document.getElementById('Wamount');
    const amt = el ? parseFloat(el.value) || 0 : 0;
    if (!amt || amt <= 0) {
      showToast('Enter a valid withdrawal amount');
      return null;
    }
    if (amt > currentBalance) {
      showToast('Insufficient funds');
      return null;
    }
    currentBalance -= amt;
    withdrawals.push(amt);
    updateBalanceDisplay();
    saveState();
    // reset attempts after successful withdraw
    pinAttempts = 5;
    return amt;
  }

  

  // Update balance shown on the main page and in modal if open
  function updateBalanceDisplay() {
    const mainEl = document.getElementById('mainBalance');
    if (mainEl) mainEl.textContent = currentBalance.toFixed(2);
    const liveEl = document.getElementById('liveBalance');
    if (liveEl) liveEl.textContent = currentBalance.toFixed(2);
    const symbols = ['USD','EUR','GBP','JPY','GHS'];
    const symbolMap = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', GHS: '₵' };
    // fetch last-2-days timeseries to compute short trend
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 1);
    const fmt = d => d.toISOString().slice(0,10);
    const api = `https://api.exchangerate.host/timeseries?start_date=${fmt(from)}&end_date=${fmt(to)}&base=USD&symbols=${symbols.join(',')}`;
    try {
      const res = await fetch(api);
      const json = await res.json();
      const ratesByDate = json.rates || {};
      const dates = Object.keys(ratesByDate).sort();
      listEl.innerHTML = '';
      symbols.forEach(code => {
        // compute latest and previous
        let prev = null, latest = null;
        if (dates.length >= 1) latest = ratesByDate[dates[dates.length-1]][code] || (code==='USD'?1:0);
        if (dates.length >= 2) prev = ratesByDate[dates[dates.length-2]][code] || (code==='USD'?1:0);
        if (dates.length === 1) prev = latest;
        if (code === 'USD') { prev = 1; latest = 1; }
        const rate = latest || 0;
        const change = (prev != null) ? (rate - prev) : 0;
        const pct = (prev && prev !== 0) ? (change / prev) * 100 : 0;
        const row = document.createElement('div');
        row.className = 'rate-row';
        // two-column layout: left = currency, right = value + trend
        row.innerHTML = `
          <div class="rate-left">
            <span class="rate-badge">${symbolMap[code] || ''}</span>
            <div class="rate-meta">
              <div class="rate-code">${code}</div>
              <div class="rate-label">per USD</div>
            </div>
          </div>
          <div class="rate-right">
            <div class="rate-value">${rate.toFixed(4)}</div>
            <div class="rate-trend ${change>0? 'up': (change<0? 'down':'flat')}">
              ${change>0? '▲': (change<0? '▼':'—')} ${Math.abs(pct).toFixed(2)}%
            </div>
          </div>`;
        row.addEventListener('click', () => {
          try { navigator.clipboard.writeText((rate).toFixed(4)); showToast(`${code} rate copied`); } catch(e){ showToast('Copy failed'); }
        });
        listEl.appendChild(row);
      });
      // timestamp + header wiring
      if (json && json.date) {
        const ts = document.createElement('div');
        ts.className = 'rates-timestamp';
        ts.textContent = `Updated: ${json.date}`;
        listEl.appendChild(ts);
        const up = document.getElementById('ratesUpdated'); if (up) up.textContent = json.date;
        const btn = document.getElementById('refreshRates'); if (btn) btn.onclick = fetchTopRatesAndRender;
      }
    } catch (e) {
      // fallback
      const fallback = { USD:1, EUR:0.92, GBP:0.82, JPY:145.12, GHS:12.50 };
      listEl.innerHTML = '';
      Object.keys(fallback).forEach(code => {
        const rate = fallback[code];
        const row = document.createElement('div');
        row.className = 'rate-row';
        row.innerHTML = `
          <div class="rate-left">
            <span class="rate-badge">${symbolMap[code] || ''}</span>
            <div class="rate-meta">
              <div class="rate-code">${code}</div>
              <div class="rate-label">per USD</div>
            </div>
          </div>
          <div class="rate-right">
            <div class="rate-value">${rate.toFixed(4)}</div>
            <div class="rate-trend flat">— 0.00%</div>
          </div>`;
        row.addEventListener('click', () => { try{navigator.clipboard.writeText(rate.toFixed(4)); showToast(`${code} rate copied`)}catch(e){showToast('Copy failed')}; });
        listEl.appendChild(row);
      });
      const ts = document.createElement('div'); ts.className = 'rates-timestamp'; ts.textContent = 'Rates unavailable — showing sample values'; listEl.appendChild(ts);
      const up = document.getElementById('ratesUpdated'); if (up) up.textContent = 'offline sample';
      const btn = document.getElementById('refreshRates'); if (btn) btn.onclick = fetchTopRatesAndRender;
    }
  function closeModal(e) {
    if (!e || e.target === document.getElementById('modalOverlay')) {
      document.getElementById('modalOverlay').classList.remove('open');
    }
  }
  
  
  function handleModalSubmit() {
    if (currentModal === 'deposit') {
      const amt = depositProcess();
      if (!amt || amt <= 0) return; // depositProcess already guarded
      document.getElementById('modalOverlay').classList.remove('open');
      showToast(`$${amt.toFixed(2)} has been deposited successfully!`);
      return;
    }
    if (currentModal === 'withdraw') {
      const amt = withdrawProcess();
      if (amt === null) return; // withdrawProcess already shows toast for errors
      document.getElementById('modalOverlay').classList.remove('open');
      showToast(`$${amt.toFixed(2)} has been withdrawn successfully!`);
      return;
    }
    if (currentModal === 'balance') {
      document.getElementById('modalOverlay').classList.remove('open');
      showToast(`Your current balance is $${currentBalance.toFixed(2)}`);
      return;
    }
    document.getElementById('modalOverlay').classList.remove('open');
    showToast('Done!');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
  }

  // Animate sections on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.style.animationPlayState = 'running';
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate').forEach(el => {
    el.style.animationPlayState = 'paused';
    observer.observe(el);
  });

  // Initialize app on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    try {
      loadState();
      updateBalanceDisplay();
      // render rates and charts
      fetchTopRatesAndRender();
      loadRatesAndRender();
    } catch (e) {
      console.error('init error', e);
    }
  });