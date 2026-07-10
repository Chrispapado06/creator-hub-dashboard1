/* Analytics dashboard — reads /api/stats (same admin password as /admin).
 * All numbers are recomputed client-side for the selected date range (UTC days). */
(function () {
  "use strict";

  var PW_KEY = "besties-admin-pw"; // shared with the admin panel
  var password = sessionStorage.getItem(PW_KEY) || "";
  var stats = null; // { since, byDay }
  var range = { start: null, end: null };
  var activePreset = "14";

  var SERIES = [
    { key: "view", label: "Views", color: "#6b7280" },
    { key: "click", label: "Clicks", color: "#db18e7" },
    { key: "open", label: "Opens", color: "#16a34a" },
  ];

  function el(id) { return document.getElementById(id); }
  function authHeaders() { return { Authorization: "Bearer " + password }; }
  function fmt(n) { return (n || 0).toLocaleString(); }
  function pct(part, whole) { return whole ? (Math.round((part / whole) * 1000) / 10) + "%" : "—"; }
  function todayUTC() { return new Date().toISOString().slice(0, 10); }
  function daysAgoUTC(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

  function daysBetween(startStr, endStr) {
    var out = [];
    if (!startStr || !endStr) return out;
    var cur = new Date(startStr + "T00:00:00Z");
    var end = new Date(endStr + "T00:00:00Z");
    var guard = 0;
    while (cur <= end && guard < 1200) {
      out.push(cur.toISOString().slice(0, 10));
      cur = new Date(cur.getTime() + 86400000);
      guard++;
    }
    return out;
  }

  function flagEmoji(code) {
    if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "LO") return "🏳️";
    return code.replace(/./g, function (c) { return String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65); });
  }

  /* ---------------- login ---------------- */

  function tryLogin(pw, onFail) {
    return fetch("/api/verify", { headers: { Authorization: "Bearer " + pw } })
      .then(function (r) {
        if (r.ok) {
          password = pw;
          sessionStorage.setItem(PW_KEY, pw);
          el("login-scrim").hidden = true;
          el("dash").hidden = false;
          load();
        } else if (onFail) {
          onFail();
        }
      })
      .catch(function () { if (onFail) onFail(); });
  }

  el("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    tryLogin(el("login-password").value, function () { el("login-error").hidden = false; });
  });

  /* ---------------- data ---------------- */

  function load() {
    fetch("/api/stats", { headers: authHeaders(), cache: "no-store" })
      .then(function (r) {
        if (r.status === 401) {
          sessionStorage.removeItem(PW_KEY);
          el("dash").hidden = true;
          el("login-scrim").hidden = false;
          throw new Error("unauthorized");
        }
        return r.json();
      })
      .then(function (data) {
        stats = { since: data.since, byDay: data.byDay || {} };
        if (!range.start) applyPreset(activePreset);
        else render();
      })
      .catch(function () {});
  }

  // Sum all per-day buckets within [start, end] into range totals.
  function aggregate() {
    var totals = { view: 0, click: 0, open: 0 };
    var creators = {};
    var countries = {};
    Object.keys(stats.byDay).forEach(function (d) {
      if (d < range.start || d > range.end) return;
      var day = stats.byDay[d];
      totals.view += day.view || 0;
      totals.click += day.click || 0;
      totals.open += day.open || 0;
      Object.keys(day.creators || {}).forEach(function (name) {
        var c = day.creators[name];
        var t = creators[name] || (creators[name] = { click: 0, open: 0 });
        t.click += c.click || 0;
        t.open += c.open || 0;
      });
      Object.keys(day.countries || {}).forEach(function (code) {
        var c = day.countries[code];
        var t = countries[code] || (countries[code] = { view: 0, click: 0, open: 0, name: c.name || code });
        t.view += c.view || 0;
        t.click += c.click || 0;
        t.open += c.open || 0;
        if (c.name) t.name = c.name;
      });
    });
    return { totals: totals, creators: creators, countries: countries };
  }

  /* ---------------- render ---------------- */

  function render() {
    if (!stats) return;
    var agg = aggregate();
    renderKpis(agg.totals);
    renderChart();
    renderCreators(agg.creators, agg.totals.click);
    renderCountries(agg.countries, agg.totals.view);
    renderRangeNote(agg.totals);
    renderSince();
  }

  function renderKpis(t) {
    var tiles = [
      { label: "Page views", value: fmt(t.view) },
      { label: "Creator clicks", value: fmt(t.click), sub: "CTR " + pct(t.click, t.view) },
      { label: "Conversions", value: fmt(t.open), sub: "opens after age gate" },
      { label: "Conversion rate", value: pct(t.open, t.view), sub: "opens ÷ views" },
    ];
    var row = el("kpi-row");
    row.innerHTML = "";
    tiles.forEach(function (tile) {
      var card = document.createElement("div");
      card.className = "kpi";
      var v = document.createElement("div");
      v.className = "kpi-value";
      v.textContent = tile.value;
      var l = document.createElement("div");
      l.className = "kpi-label";
      l.textContent = tile.label;
      card.appendChild(v);
      card.appendChild(l);
      if (tile.sub) {
        var s = document.createElement("div");
        s.className = "kpi-sub";
        s.textContent = tile.sub;
        card.appendChild(s);
      }
      row.appendChild(card);
    });
  }

  function renderChart() {
    var days = daysBetween(range.start, range.end);
    if (days.length > 120) days = days.slice(days.length - 120); // keep the SVG readable
    var byDay = stats.byDay;
    var series = SERIES.map(function (s) {
      return {
        color: s.color,
        label: s.label,
        values: days.map(function (d) { return (byDay[d] && byDay[d][s.key]) || 0; }),
      };
    });

    var W = 720, H = 240, padL = 34, padR = 12, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = 1;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });

    function x(i) { return padL + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW); }
    function y(v) { return padT + innerH - (v / max) * innerH; }

    var labelEvery = Math.max(1, Math.ceil(days.length / 6));
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Analytics trend">';
    svg += '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="#0000001f" />';
    svg += '<line x1="' + padL + '" y1="' + padT + '" x2="' + (W - padR) + '" y2="' + padT + '" stroke="#0000000f" />';
    svg += '<text x="' + (padL - 6) + '" y="' + (padT + 4) + '" text-anchor="end" font-size="11" fill="#82837e">' + max + "</text>";
    svg += '<text x="' + (padL - 6) + '" y="' + (padT + innerH) + '" text-anchor="end" font-size="11" fill="#82837e">0</text>';
    days.forEach(function (d, i) {
      if (i % labelEvery === 0 || i === days.length - 1) {
        var parts = d.split("-");
        var label = parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10);
        svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#82837e">' + label + "</text>";
      }
    });
    series.forEach(function (s) {
      if (days.length === 1) {
        svg += '<circle cx="' + x(0) + '" cy="' + y(s.values[0]) + '" r="3.5" fill="' + s.color + '" />';
        return;
      }
      var pts = s.values.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      svg += '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />';
    });
    svg += "</svg>";
    el("chart-wrap").innerHTML = svg;

    var legend = el("chart-legend");
    legend.innerHTML = "";
    series.forEach(function (s) {
      var sum = s.values.reduce(function (a, b) { return a + b; }, 0);
      var item = document.createElement("span");
      item.className = "legend-item";
      var dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = s.color;
      item.appendChild(dot);
      item.append(s.label + " (" + fmt(sum) + ")");
      legend.appendChild(item);
    });
  }

  function fillTable(tbodyId, rows, cols, emptyText) {
    var tbody = el(tbodyId);
    tbody.innerHTML = "";
    if (!rows.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = cols;
      td.className = "empty";
      td.textContent = emptyText;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (cells) {
      var tr = document.createElement("tr");
      cells.forEach(function (cell) {
        var td = document.createElement("td");
        if (cell.cls) td.className = cell.cls;
        td.textContent = cell.text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderCreators(creators, totalClicks) {
    var rows = Object.keys(creators).map(function (name) {
      var c = creators[name];
      return { name: name, click: c.click || 0, open: c.open || 0 };
    });
    rows.sort(function (a, b) { return b.click - a.click || b.open - a.open; });
    fillTable(
      "creator-tbody",
      rows.map(function (r) {
        return [
          { text: r.name },
          { text: fmt(r.click), cls: "num" },
          { text: fmt(r.open), cls: "num" },
          { text: pct(r.open, r.click), cls: "num" },
          { text: pct(r.click, totalClicks), cls: "num" },
        ];
      }),
      5,
      "No clicks in this range."
    );
  }

  function renderCountries(countries, totalViews) {
    var rows = Object.keys(countries).map(function (code) {
      var c = countries[code];
      return { code: code, name: c.name || code, view: c.view || 0, click: c.click || 0, open: c.open || 0 };
    });
    rows.sort(function (a, b) { return b.view - a.view || b.click - a.click; });
    fillTable(
      "country-tbody",
      rows.map(function (r) {
        return [
          { text: flagEmoji(r.code) + "  " + r.name },
          { text: fmt(r.view), cls: "num" },
          { text: fmt(r.click), cls: "num" },
          { text: fmt(r.open), cls: "num" },
          { text: pct(r.view, totalViews), cls: "num" },
        ];
      }),
      5,
      "No visits in this range yet."
    );
  }

  function renderRangeNote(t) {
    el("range-note").textContent =
      "Showing " + range.start + " → " + range.end + " (UTC) · " +
      fmt(t.view) + " views, " + fmt(t.click) + " clicks, " + fmt(t.open) + " conversions.";
  }

  function renderSince() {
    var note = "—";
    if (stats.since) {
      var d = new Date(stats.since);
      if (!isNaN(d)) note = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    el("since-note").textContent = note;
  }

  /* ---------------- date range controls ---------------- */

  function earliestDay() {
    var keys = Object.keys(stats.byDay).sort();
    return keys.length ? keys[0] : todayUTC();
  }

  function applyPreset(preset) {
    activePreset = preset;
    var end = todayUTC();
    var start;
    if (preset === "7") start = daysAgoUTC(6);
    else if (preset === "14") start = daysAgoUTC(13);
    else if (preset === "30") start = daysAgoUTC(29);
    else if (preset === "month") start = end.slice(0, 8) + "01";
    else if (preset === "all") start = earliestDay();
    else start = daysAgoUTC(13);
    range.start = start;
    range.end = end;
    syncControls();
    render();
  }

  function syncControls() {
    el("from-date").value = range.start;
    el("to-date").value = range.end;
    el("from-date").max = todayUTC();
    el("to-date").max = todayUTC();
    var btns = el("presets").querySelectorAll("button");
    btns.forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-preset") === activePreset); });
  }

  el("presets").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-preset]");
    if (btn) applyPreset(btn.getAttribute("data-preset"));
  });

  function onCustomDate() {
    var from = el("from-date").value;
    var to = el("to-date").value;
    if (!from || !to) return;
    if (from > to) { var tmp = from; from = to; to = tmp; }
    range.start = from;
    range.end = to;
    activePreset = "custom";
    syncControls();
    render();
  }
  el("from-date").addEventListener("change", onCustomDate);
  el("to-date").addEventListener("change", onCustomDate);

  /* ---------------- actions ---------------- */

  el("refresh-btn").addEventListener("click", load);

  el("reset-btn").addEventListener("click", function () {
    if (!confirm("Reset ALL analytics counts to zero? This cannot be undone.")) return;
    fetch("/api/stats/reset", { method: "POST", headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error("reset failed");
        load();
      })
      .catch(function () { alert("Could not reset analytics."); });
  });

  /* ---------------- boot ---------------- */

  if (password) {
    tryLogin(password, function () { sessionStorage.removeItem(PW_KEY); });
  }
})();
