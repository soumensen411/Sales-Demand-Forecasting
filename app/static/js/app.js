const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "–" : v.toFixed(1) + "%");
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const day = (s, year) =>
  new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: year ? "numeric" : undefined, timeZone: "UTC" });

let stores = [];
let current = null;
let chart = null;

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

function setStatus(msg, isError = false) {
  const el = $("status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
}

/* ---------- store list ---------- */
function renderStoreList() {
  const q = $("search").value.trim();
  const type = $("typeFilter").value;
  const sort = $("sortBy").value;

  let list = stores.filter((s) => (!q || String(s.store).includes(q)) && (!type || s.store_type === type));
  if (sort === "worst") list.sort((a, b) => (b.rmspe_pct ?? 0) - (a.rmspe_pct ?? 0));
  else if (sort === "sales") list.sort((a, b) => b.avg_sales - a.avg_sales);
  else list.sort((a, b) => a.store - b.store);

  $("storeList").replaceChildren(
    ...list.map((s) => {
      const btn = document.createElement("button");
      btn.className = "row store";
      btn.dataset.id = s.store;
      btn.setAttribute("aria-current", String(s.store === current));
      for (const text of [`Store ${s.store}`, s.store_type, pct(s.rmspe_pct)]) {
        const span = document.createElement("span");
        span.textContent = text;
        btn.appendChild(span);
      }
      btn.addEventListener("click", () => selectStore(s.store));
      return btn;
    })
  );
  if (!list.some((s) => s.store === current) && list.length) selectStore(list[0].store);
}

function selectStore(id) {
  current = id;
  document.querySelectorAll(".store").forEach((b) => b.setAttribute("aria-current", String(Number(b.dataset.id) === id)));
  loadForecast();
}

/* ---------- forecast view ---------- */
function renderKpis(m) {
  const vsActual = m.actual_total ? (m.forecast_total / m.actual_total - 1) * 100 : null;
  const items = [
    ["Forecast total", nf.format(m.forecast_total), vsActual == null ? "No actuals" : `${vsActual > 0 ? "+" : ""}${vsActual.toFixed(1)}% vs actual`],
    ["Actual total", m.actual_total == null ? "–" : nf.format(m.actual_total), "Held-out sales"],
    ["WAPE", pct(m.wape_pct), "Error vs total sales"],
    ["90% coverage", pct(m.coverage90_pct), "Target 90%"],
  ];
  $("kpis").replaceChildren(
    ...items.map(([label, value, hint]) => {
      const div = document.createElement("div");
      div.className = "kpi";
      for (const [cls, text] of [["label", label], ["value", value], ["hint", hint]]) {
        const el = document.createElement("div");
        el.className = cls;
        el.textContent = text;
        div.appendChild(el);
      }
      return div;
    })
  );
}

function renderChart(d) {
  const accent = cssVar("--accent"), ink = cssVar("--ink"), ink2 = cssVar("--ink2"), ink3 = cssVar("--ink3");
  const grid = cssVar("--line"), bad = cssVar("--bad"), card = cssVar("--card");
  const mono = cssVar("--mono");
  const missed = new Set(d.table.filter((r) => r.within90 === false).map((r) => r.date));
  const base = { pointRadius: 0, borderWidth: 2, spanGaps: true, tension: 0.2 };
  const datasets = [
    { ...base, label: "_lo90", data: d.lo90, borderWidth: 0, fill: false },
    { ...base, label: "90% interval", data: d.hi90, borderWidth: 0, fill: "-1", backgroundColor: cssVar("--band90") },
    { ...base, label: "_lo80", data: d.lo80, borderWidth: 0, fill: false },
    { ...base, label: "80% interval", data: d.hi80, borderWidth: 0, fill: "-1", backgroundColor: cssVar("--band80") },
    { ...base, label: "Median forecast", data: d.median, borderColor: accent },
    { ...base, label: "History", data: d.history, borderColor: ink3, borderWidth: 1.5 },
    { ...base, label: "Actual", data: d.actual, showLine: false, pointRadius: 3,
      backgroundColor: d.dates.map((x) => (missed.has(x) ? bad : ink)), borderWidth: 0 },
  ];
  const shown = ["Median forecast", "History", "Actual"];

  Chart.defaults.font.family = mono;
  Chart.defaults.font.size = 11;
  if (chart) chart.destroy();
  chart = new Chart($("chart"), {
    type: "line",
    data: { labels: d.dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 240 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { align: "start", labels: { color: ink2, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16, filter: (i) => !i.text.startsWith("_") } },
        tooltip: {
          filter: (i) => shown.includes(i.dataset.label) && i.parsed.y != null,
          backgroundColor: card, titleColor: ink, bodyColor: ink2, borderColor: grid, borderWidth: 1,
          padding: 12, cornerRadius: 8, boxPadding: 4,
          callbacks: { title: (i) => day(i[0].label, true), label: (c) => `${c.dataset.label}: ${nf.format(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: ink3, maxTicksLimit: 8, autoSkip: true, callback(v) { return day(this.getLabelForValue(v)); } }, grid: { display: false }, border: { color: grid } },
        y: { ticks: { color: ink3, callback: (v) => nf.format(v) }, grid: { color: grid }, border: { display: false } },
      },
    },
  });
}

function renderTable(rows) {
  const cols = [
    ["Date", (r) => `${day(r.date)} ${r.weekday}`],
    ["Promo", (r) => (r.promo ? "Promo" : ""), "dim"],
    ["Forecast", (r) => nf.format(r.median)],
    ["80% range", (r) => `${nf.format(r.lo80)} – ${nf.format(r.hi80)}`, "dim"],
    ["90% range", (r) => `${nf.format(r.lo90)} – ${nf.format(r.hi90)}`, "dim"],
    ["Actual", (r) => (r.actual == null ? "–" : nf.format(r.actual))],
  ];
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const [name] of cols) {
    const th = document.createElement("th");
    th.textContent = name;
    hr.appendChild(th);
  }
  head.appendChild(hr);

  const body = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const [name, fn, cls] of cols) {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      if (name === "Actual" && r.within90 != null) {
        const dot = document.createElement("span");
        dot.className = "dot" + (r.within90 ? "" : " miss");
        dot.title = r.within90 ? "Inside 90% range" : "Outside 90% range";
        td.append(dot, fn(r));
      } else td.textContent = fn(r);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  $("fcTable").replaceChildren(head, body);
}

async function loadForecast() {
  const id = current;
  if (id == null) return;
  setStatus("Loading…");
  try {
    const d = await api(`/api/forecast/${id}?history_days=${$("historyDays").value}`);
    if (id !== current) return; // a newer selection won the race
    renderKpis(d.metrics);
    renderChart(d);
    renderTable(d.table);
    $("title").textContent = `Store ${d.store}`;
    $("meta").textContent = `Type ${d.store_type} · Assortment ${d.assortment} · ${day(d.table[0].date)} – ${day(d.table.at(-1).date, true)}`;
    $("csvLink").href = `/api/forecast/${id}/csv`;
    setStatus("");
  } catch (err) {
    setStatus(err.message, true);
  }
}

/* ---------- model results tab ---------- */
const cell = (v) => {
  if (v == null) return "–";
  if (typeof v !== "number") return v;
  const a = Math.abs(v);
  return v === 0 ? "0" : a >= 100 ? nf.format(v) : v.toFixed(a >= 1 ? 1 : 3);
};

let tablesLoaded = false;
async function loadTables() {
  if (tablesLoaded) return;
  const tables = await api("/api/tables");
  const root = $("tables");
  if (!tables.length) { root.textContent = "No result tables found in data/app/tables.json"; return; }
  root.replaceChildren(
    ...tables.map((t) => {
      const card = document.createElement("div");
      card.className = "card";
      const h = document.createElement("h2");
      h.textContent = t.title;
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      const txt = t.columns.map((_, i) => typeof t.rows[0]?.[i] === "string"); // text columns read left-aligned
      t.columns.forEach((c, i) => { const th = document.createElement("th"); th.textContent = c.replace(/_/g, " "); if (txt[i]) th.className = "txt"; hr.appendChild(th); });
      thead.appendChild(hr);
      const tbody = document.createElement("tbody");
      t.rows.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((v, i) => { const td = document.createElement("td"); td.textContent = cell(v); if (txt[i]) td.className = "txt"; tr.appendChild(td); });
        tbody.appendChild(tr);
      });
      table.append(thead, tbody);
      wrap.appendChild(table);
      card.append(h, wrap);
      return card;
    })
  );
  tablesLoaded = true;
}

/* ---------- wiring ---------- */
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.body.dataset.tab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "results") loadTables().catch((e) => setStatus(e.message, true));
  })
);

["search", "typeFilter", "sortBy"].forEach((id) => $(id).addEventListener("input", renderStoreList));
$("historyDays").addEventListener("change", loadForecast);

(async function init() {
  try {
    stores = await api("/api/stores");
    const types = [...new Set(stores.map((s) => s.store_type))].sort();
    types.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = `Type ${t}`;
      $("typeFilter").appendChild(opt);
    });
    renderStoreList();
  } catch (err) {
    setStatus("Could not load stores: " + err.message, true);
  }
})();