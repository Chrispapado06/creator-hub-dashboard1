/* ============================================================
   MERIDIAN — FinTech Operating System · front-end engine
   ============================================================ */
(() => {
  "use strict";

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Market data (simulated) ---------------- */
  const MARKETS = {
    crypto: [
      { sym: "BTC/USD", name: "Bitcoin", price: 67412.5, dp: 1, chg: 2.41, color: "#f7931a", tag: "BTC" },
      { sym: "ETH/USD", name: "Ethereum", price: 3512.84, dp: 2, chg: 1.87, color: "#627eea", tag: "ETH" },
      { sym: "SOL/USD", name: "Solana", price: 148.22, dp: 2, chg: 4.63, color: "#9945ff", tag: "SOL" },
      { sym: "XRP/USD", name: "Ripple", price: 0.5241, dp: 4, chg: -1.12, color: "#23a5da", tag: "XRP" },
      { sym: "ADA/USD", name: "Cardano", price: 0.4418, dp: 4, chg: 0.94, color: "#2a71d0", tag: "ADA" },
    ],
    shares: [
      { sym: "AAPL", name: "Apple Inc.", price: 213.44, dp: 2, chg: 1.21, color: "#8e9bae", tag: "AA" },
      { sym: "NVDA", name: "NVIDIA Corp.", price: 128.61, dp: 2, chg: 2.87, color: "#76b900", tag: "NV" },
      { sym: "TSLA", name: "Tesla Inc.", price: 248.92, dp: 2, chg: -0.84, color: "#e82127", tag: "TS" },
      { sym: "AMZN", name: "Amazon.com", price: 189.33, dp: 2, chg: 0.67, color: "#ff9900", tag: "AM" },
      { sym: "META", name: "Meta Platforms", price: 512.74, dp: 2, chg: 1.45, color: "#0668e1", tag: "ME" },
    ],
    forex: [
      { sym: "EUR/USD", name: "Euro / US Dollar", price: 1.0842, dp: 4, chg: -0.31, color: "#4c6fff", tag: "€$" },
      { sym: "GBP/USD", name: "Pound / US Dollar", price: 1.2718, dp: 4, chg: 0.18, color: "#b04cff", tag: "£$" },
      { sym: "USD/JPY", name: "US Dollar / Yen", price: 157.32, dp: 2, chg: 0.42, color: "#ff5c7a", tag: "$¥" },
      { sym: "AUD/USD", name: "Aussie / US Dollar", price: 0.6654, dp: 4, chg: -0.22, color: "#22d3ee", tag: "A$" },
      { sym: "USD/CHF", name: "US Dollar / Franc", price: 0.8971, dp: 4, chg: 0.11, color: "#e84c6f", tag: "$₣" },
    ],
    commodities: [
      { sym: "GOLD", name: "Gold Spot", price: 2384.5, dp: 1, chg: 0.81, color: "#f5b544", tag: "AU" },
      { sym: "SILVER", name: "Silver Spot", price: 30.84, dp: 2, chg: 1.24, color: "#a8b2c8", tag: "AG" },
      { sym: "OIL/WTI", name: "Crude Oil WTI", price: 81.24, dp: 2, chg: -1.05, color: "#3e4a63", tag: "OIL" },
      { sym: "NATGAS", name: "Natural Gas", price: 2.874, dp: 3, chg: 2.16, color: "#38b6ff", tag: "NG" },
      { sym: "COPPER", name: "Copper", price: 4.482, dp: 3, chg: 0.53, color: "#c87840", tag: "CU" },
    ],
    indices: [
      { sym: "US500", name: "US 500 Index", price: 5472.3, dp: 1, chg: 0.64, color: "#4c6fff", tag: "US" },
      { sym: "USTECH", name: "US Tech 100", price: 19752.8, dp: 1, chg: 1.12, color: "#22d3ee", tag: "TQ" },
      { sym: "GER40", name: "Germany 40", price: 18384.2, dp: 1, chg: -0.28, color: "#f5b544", tag: "DE" },
      { sym: "UK100", name: "UK 100", price: 8212.6, dp: 1, chg: 0.19, color: "#b04cff", tag: "UK" },
      { sym: "JPN225", name: "Japan 225", price: 39412.4, dp: 1, chg: 0.88, color: "#ff5c7a", tag: "JP" },
    ],
  };

  const fmt = (v, dp) =>
    v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const walk = (v, vol = 0.0012) => v * (1 + (Math.random() - 0.5) * 2 * vol);

  /* ---------------- Header / mobile nav ---------------- */
  const header = document.getElementById("siteHeader");
  const onScrollHeader = () => header.classList.toggle("scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  const navToggle = document.getElementById("navToggle");
  navToggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("#mainNav a").forEach((a) =>
    a.addEventListener("click", () => {
      document.body.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );

  /* ---------------- Scroll reveal ---------------- */
  const revealEls = document.querySelectorAll(".reveal");
  if (prefersReducedMotion) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------------- Count-up stats ---------------- */
  const counters = document.querySelectorAll("[data-count]");
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const dur = 1700;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased, decimals);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (prefersReducedMotion) {
    counters.forEach((el) => (el.textContent = fmt(parseFloat(el.dataset.count), parseInt(el.dataset.decimals || "0", 10))));
  } else {
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            runCounter(e.target);
            cio.unobserve(e.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((el) => cio.observe(el));
  }

  /* ---------------- Ticker tape ---------------- */
  const tickerEl = document.getElementById("tickerTape");
  const tickerData = [
    ...MARKETS.crypto.slice(0, 3),
    ...MARKETS.shares.slice(0, 3),
    ...MARKETS.forex.slice(0, 2),
    ...MARKETS.commodities.slice(0, 2),
    ...MARKETS.indices.slice(0, 2),
  ].map((m) => ({ ...m }));

  const tickHTML = (m, i) => {
    const cls = m.chg >= 0 ? "up" : "down";
    const sign = m.chg >= 0 ? "+" : "−";
    return `<div class="tick" data-i="${i}">
      <span class="sym">${m.sym}</span>
      <span class="val">${fmt(m.price, m.dp)}</span>
      <span class="chg ${cls}">${sign}${Math.abs(m.chg).toFixed(2)}%</span>
    </div>`;
  };
  const half = tickerData.map(tickHTML).join("");
  tickerEl.innerHTML = half + half; // duplicate for seamless loop

  setInterval(() => {
    const i = Math.floor(Math.random() * tickerData.length);
    const m = tickerData[i];
    const old = m.price;
    m.price = walk(m.price);
    m.chg += (m.price - old) / old * 100;
    const dir = m.price >= old ? "up" : "down";
    document.querySelectorAll(`.tick[data-i="${i}"]`).forEach((el) => {
      const val = el.querySelector(".val");
      const chg = el.querySelector(".chg");
      val.textContent = fmt(m.price, m.dp);
      val.classList.remove("flash-up", "flash-down");
      void val.offsetWidth;
      val.classList.add(`flash-${dir}`);
      chg.className = `chg ${m.chg >= 0 ? "up" : "down"}`;
      chg.textContent = `${m.chg >= 0 ? "+" : "−"}${Math.abs(m.chg).toFixed(2)}%`;
    });
  }, 1800);

  /* ---------------- Canvas line charts ---------------- */
  function liveChart(canvas, { stroke, fillTop, fillBottom, points = 90, vol = 0.35, interval = 900, onTick }) {
    const ctx = canvas.getContext("2d");
    let data = [];
    let progress = prefersReducedMotion ? 1 : 0; // draw-in animation

    const seed = () => {
      data = [];
      let v = 50;
      for (let i = 0; i < points; i++) {
        v += (Math.random() - 0.48) * vol * 6;
        v = Math.max(18, Math.min(85, v));
        data.push(v);
      }
      progress = prefersReducedMotion ? 1 : 0;
    };
    seed();

    const cssH = parseInt(canvas.getAttribute("height"), 10) || 200;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      canvas.width = w * dpr;
      canvas.height = cssH * dpr;
      canvas.style.height = cssH + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      const min = Math.min(...data) - 6;
      const max = Math.max(...data) + 6;
      const xs = (i) => (i / (data.length - 1)) * w;
      const ys = (val) => h - ((val - min) / (max - min)) * h;

      const lastIdx = Math.max(1, Math.floor((data.length - 1) * progress));

      // gradient fill
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, fillTop);
      grad.addColorStop(1, fillBottom);
      ctx.beginPath();
      ctx.moveTo(0, ys(data[0]));
      for (let i = 1; i <= lastIdx; i++) ctx.lineTo(xs(i), ys(data[i]));
      ctx.lineTo(xs(lastIdx), h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // line
      ctx.beginPath();
      ctx.moveTo(0, ys(data[0]));
      for (let i = 1; i <= lastIdx; i++) ctx.lineTo(xs(i), ys(data[i]));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.stroke();

      // pulse dot on last point
      if (progress >= 1) {
        const px = xs(data.length - 1);
        const py = ys(data[data.length - 1]);
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
        const pulse = (performance.now() / 900) % 1;
        ctx.beginPath();
        ctx.arc(px, py, 4 + pulse * 10, 0, Math.PI * 2);
        ctx.strokeStyle = stroke.replace("rgb(", "rgba(").replace(")", `, ${1 - pulse})`);
        if (stroke.startsWith("#")) ctx.strokeStyle = stroke + Math.round((1 - pulse) * 160).toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    const loop = () => {
      if (progress < 1) progress = Math.min(1, progress + 0.016);
      draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    if (!prefersReducedMotion) {
      setInterval(() => {
        const last = data[data.length - 1];
        let next = last + (Math.random() - 0.48) * vol * 6;
        next = Math.max(15, Math.min(88, next));
        data.push(next);
        data.shift();
        if (onTick) onTick(next, last);
      }, interval);
    }

    return { reseed: seed };
  }

  const heroCanvas = document.getElementById("heroChart");
  const heroPriceEl = document.getElementById("heroPrice");
  const heroChangeEl = document.getElementById("heroChange");
  const HERO_OPEN = 65825.7; // session-open reference so % change stays anchored
  let heroPrice = 67412.5;
  let heroChartHandle = null;
  if (heroCanvas) {
    heroChartHandle = liveChart(heroCanvas, {
      stroke: "#2ee6a8",
      fillTop: "rgba(46, 230, 168, 0.22)",
      fillBottom: "rgba(46, 230, 168, 0)",
      interval: 950,
      onTick: (next, last) => {
        const delta = (next - last) / last;
        heroPrice = Math.max(63000, Math.min(71000, heroPrice * (1 + delta * 0.4)));
        const chg = ((heroPrice - HERO_OPEN) / HERO_OPEN) * 100;
        heroPriceEl.textContent = fmt(heroPrice, 2);
        heroChangeEl.textContent = `${chg >= 0 ? "+" : "−"}${Math.abs(chg).toFixed(2)}%`;
        heroChangeEl.className = `chg ${chg >= 0 ? "up" : "down"}`;
      },
    });
  }

  /* timeframe pills: swap active state and redraw the chart */
  document.querySelectorAll(".chart-card-foot .pill").forEach((pill) =>
    pill.addEventListener("click", () => {
      document.querySelectorAll(".chart-card-foot .pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      if (heroChartHandle) heroChartHandle.reseed();
    })
  );

  const termCanvas = document.getElementById("terminalChart");
  if (termCanvas) {
    liveChart(termCanvas, {
      stroke: "#4c6fff",
      fillTop: "rgba(76, 111, 255, 0.25)",
      fillBottom: "rgba(76, 111, 255, 0)",
      interval: 1200,
    });
  }

  /* ---------------- Market table + tabs ---------------- */
  const body = document.getElementById("marketBody");
  const tabs = document.querySelectorAll("#marketTabs .tab");
  let activeCat = "crypto";
  let liveRows = [];

  const sparkline = (up) => {
    const pts = [];
    let v = 16 + Math.random() * 4;
    const drift = up ? -0.28 : 0.28; // svg y-axis is inverted
    for (let i = 0; i < 28; i++) {
      v += (Math.random() - 0.5) * 3 + drift;
      v = Math.max(3, Math.min(29, v));
      pts.push(`${(i * (110 / 27)).toFixed(1)},${v.toFixed(1)}`);
    }
    const color = up ? "#2ee6a8" : "#ff5c7a";
    return `<svg class="spark" viewBox="0 0 110 32" preserveAspectRatio="none">
      <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  };

  const renderMarket = (cat) => {
    liveRows = MARKETS[cat].map((m) => ({ ...m }));
    body.innerHTML = liveRows
      .map((m, i) => {
        const up = m.chg >= 0;
        return `<tr style="animation-delay:${i * 0.06}s">
          <td><div class="mkt-name">
            <span class="mkt-ava" style="background:${m.color}">${m.tag}</span>
            <div><strong>${m.sym}</strong><span class="muted">${m.name}</span></div>
          </div></td>
          <td class="hide-sm">${sparkline(up)}</td>
          <td class="price-cell" data-row="${i}">${fmt(m.price, m.dp)}</td>
          <td><span class="chg ${up ? "up" : "down"}" data-chg="${i}">${up ? "+" : "−"}${Math.abs(m.chg).toFixed(2)}%</span></td>
          <td class="hide-sm"><div class="trade-btns">
            <button class="tbtn buy">BUY</button><button class="tbtn sell">SELL</button>
          </div></td>
        </tr>`;
      })
      .join("");
  };
  renderMarket(activeCat);

  const marketPanel = document.getElementById("marketPanel");
  const setActiveTab = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    if (marketPanel) marketPanel.setAttribute("aria-labelledby", tab.id);
    activeCat = tab.dataset.tab;
    renderMarket(activeCat);
  };
  tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab)));

  document.getElementById("marketTabs").addEventListener("keydown", (e) => {
    const list = [...tabs];
    const i = list.indexOf(document.activeElement);
    if (i === -1) return;
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % list.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = list.length - 1;
    if (j !== null) {
      e.preventDefault();
      list[j].focus();
      setActiveTab(list[j]);
    }
  });

  /* BUY/SELL on a demo site leads to the sign-up CTA */
  body.addEventListener("click", (e) => {
    if (e.target.classList.contains("tbtn")) {
      document.getElementById("cta").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  });

  setInterval(() => {
    if (!liveRows.length) return;
    const i = Math.floor(Math.random() * liveRows.length);
    const m = liveRows[i];
    const old = m.price;
    m.price = walk(m.price, 0.0009);
    m.chg += ((m.price - old) / old) * 100;
    const cell = body.querySelector(`.price-cell[data-row="${i}"]`);
    const chgEl = body.querySelector(`[data-chg="${i}"]`);
    if (!cell) return;
    const dir = m.price >= old ? "up" : "down";
    cell.textContent = fmt(m.price, m.dp);
    cell.classList.remove("flash-up", "flash-down");
    void cell.offsetWidth;
    cell.classList.add(`flash-${dir}`);
    chgEl.className = `chg ${m.chg >= 0 ? "up" : "down"}`;
    chgEl.setAttribute("data-chg", i);
    chgEl.textContent = `${m.chg >= 0 ? "+" : "−"}${Math.abs(m.chg).toFixed(2)}%`;
  }, 1400);

  /* ---------------- Floating hero cards live-ish updates ---------------- */
  const floatAapl = document.getElementById("floatAapl");
  const floatEur = document.getElementById("floatEur");
  const floatGold = document.getElementById("floatGold");
  let fa = 213.44, fe = 1.0842, fg = 2384.5;
  setInterval(() => {
    fa = walk(fa, 0.0007);
    fe = walk(fe, 0.0004);
    fg = walk(fg, 0.0005);
    if (floatAapl) floatAapl.textContent = "$" + fmt(fa, 2);
    if (floatEur) floatEur.textContent = fmt(fe, 4);
    if (floatGold) floatGold.textContent = fmt(fg, 1);
  }, 2600);

  /* ---------------- Terminal metrics ---------------- */
  const tEquity = document.getElementById("tEquity");
  const tPnl = document.getElementById("tPnl");
  let eq = 128430.12, pnl = 2841.9;
  setInterval(() => {
    const d = (Math.random() - 0.47) * 180;
    eq += d; pnl += d;
    if (tEquity) tEquity.textContent = "$" + fmt(eq, 2);
    if (tPnl) {
      tPnl.textContent = `${pnl >= 0 ? "+" : "−"}$${fmt(Math.abs(pnl), 2)}`;
      tPnl.className = pnl >= 0 ? "up" : "down";
    }
  }, 2200);

  /* ---------------- Tilt effect ---------------- */
  const addTilt = (el, maxDeg = 6) => {
    if (prefersReducedMotion || !window.matchMedia("(hover: hover)").matches) return;
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateY(${x * maxDeg}deg) rotateX(${-y * maxDeg}deg)`;
    });
    el.addEventListener("mouseleave", () => {
      el.style.transform = "perspective(900px) rotateY(0) rotateX(0)";
    });
  };
  document.querySelectorAll(".tilt").forEach((el) => addTilt(el));

  /* ---------------- Feature card cursor glow ---------------- */
  document.querySelectorAll(".feature-card").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* ---------------- FAQ accordion ---------------- */
  const closeAccItem = (item) => {
    const b = item.querySelector(".acc-body");
    b.style.maxHeight = b.scrollHeight + "px"; // pin current height so the collapse animates
    void b.offsetHeight;
    b.style.maxHeight = "0px";
    item.classList.remove("open");
    item.querySelector(".acc-head").setAttribute("aria-expanded", "false");
  };
  document.querySelectorAll(".acc-item").forEach((item) => {
    const head = item.querySelector(".acc-head");
    const bodyEl = item.querySelector(".acc-body");
    // once fully open, release the pinned height so resizes can't clip the text
    bodyEl.addEventListener("transitionend", () => {
      if (item.classList.contains("open")) bodyEl.style.maxHeight = "none";
    });
    window.addEventListener("resize", () => {
      if (item.classList.contains("open")) bodyEl.style.maxHeight = "none";
    });
    head.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".acc-item.open").forEach(closeAccItem);
      if (!isOpen) {
        item.classList.add("open");
        bodyEl.style.maxHeight = bodyEl.scrollHeight + "px";
        head.setAttribute("aria-expanded", "true");
      }
    });
  });
})();
