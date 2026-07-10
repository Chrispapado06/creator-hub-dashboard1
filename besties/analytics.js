/* Analytics dashboard — reads /api/stats (same admin password as /admin). */
(function () {
  "use strict";

  var PW_KEY = "besties-admin-pw"; // shared with the admin panel
  var password = sessionStorage.getItem(PW_KEY) || "";
  var stats = null;

  var SERIES = [
    { key: "view", label: "Views", color: "#6b7280" },
    { key: "click", label: "Clicks", color: "#db18e7" },
    { key: "open", label: "Opens", color: "#16a34a" },
  ];

  function el(id) { return document.getElementById(id); }
  function authHeaders() { return { Authorization: "Bearer " + password }; }

  function pct(part, whole) {
    if (!whole) return "—";
    return (Math.round((part / whole) * 1000) / 10) + "%";
  }

  function fmt(n) { return (n || 0).toLocaleString(); }

  function lastDays(n) {
    var days = [];
    var now = Date.now();
    for (var i = n - 1; i >= 0; i--) {
      days.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
    }
    return days;
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
    tryLogin(el("login-password").value, function () {
      el("login-error").hidden = false;
    });
  });

  /* ---------------- load + render ---------------- */

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
        stats = data;
        renderKpis();
        renderChart();
        renderTable();
        renderSince();
      })
      .catch(function () {});
  }

  function renderKpis() {
    var t = stats.totals || { view: 0, click: 0, open: 0 };
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
    var days = lastDays(14);
    var byDay = stats.byDay || {};
    var series = SERIES.map(function (s) {
      return {
        key: s.key,
        color: s.color,
        label: s.label,
        values: days.map(function (d) { return (byDay[d] && byDay[d][s.key]) || 0; }),
      };
    });

    var W = 720, H = 240, padL = 34, padR = 12, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = 1;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });

    function x(i) { return padL + (days.length === 1 ? innerW / 2 : (i / (days.length - 1)) * innerW); }
    function y(v) { return padT + innerH - (v / max) * innerH; }

    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Daily analytics chart">';
    // baseline + max gridline
    svg += '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="#0000001f" />';
    svg += '<line x1="' + padL + '" y1="' + padT + '" x2="' + (W - padR) + '" y2="' + padT + '" stroke="#0000000f" />';
    svg += '<text x="' + (padL - 6) + '" y="' + (padT + 4) + '" text-anchor="end" font-size="11" fill="#82837e">' + max + "</text>";
    svg += '<text x="' + (padL - 6) + '" y="' + (padT + innerH) + '" text-anchor="end" font-size="11" fill="#82837e">0</text>';
    // x labels (~every 3rd day)
    days.forEach(function (d, i) {
      if (i % 3 === 0 || i === days.length - 1) {
        var parts = d.split("-");
        var label = parseInt(parts[1], 10) + "/" + parseInt(parts[2], 10);
        svg += '<text x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#82837e">' + label + "</text>";
      }
    });
    // series lines + dots
    series.forEach(function (s) {
      var pts = s.values.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      svg += '<polyline points="' + pts + '" fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />';
      s.values.forEach(function (v, i) {
        svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="2.5" fill="' + s.color + '" />';
      });
    });
    svg += "</svg>";
    el("chart-wrap").innerHTML = svg;

    // legend with per-series totals over the window
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

  function renderTable() {
    var byCreator = stats.byCreator || {};
    var totalClicks = stats.totals ? stats.totals.click : 0;
    var rows = Object.keys(byCreator).map(function (name) {
      var c = byCreator[name];
      return { name: name, click: c.click || 0, open: c.open || 0 };
    });
    rows.sort(function (a, b) { return b.click - a.click || b.open - a.open; });

    var tbody = el("creator-tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty";
      td.textContent = "No clicks recorded yet.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      function cell(text, cls) {
        var td = document.createElement("td");
        if (cls) td.className = cls;
        td.textContent = text;
        tr.appendChild(td);
      }
      cell(r.name);
      cell(fmt(r.click), "num");
      cell(fmt(r.open), "num");
      cell(pct(r.open, r.click), "num");
      cell(pct(r.click, totalClicks), "num");
      tbody.appendChild(tr);
    });
  }

  function renderSince() {
    var note = "—";
    if (stats.since) {
      var d = new Date(stats.since);
      if (!isNaN(d)) note = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    }
    el("since-note").textContent = note;
    el("range-note").textContent = "since " + note;
  }

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
