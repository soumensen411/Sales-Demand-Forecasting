const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (v) => (v == null ? "–" : v.toFixed(1) + "%");
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let stores = [];
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
  const previous = $("storeSelect").value;

  let list = stores.filter((s) => (!q || String(s.store).includes(q)) && (!type || s.store_type === type));
  if (sort === "worst") list.sort((a, b) => (b.rmspe_pct ?? 0) - (a.rmspe_pct ?? 0));
  else if (sort === "sales") list.sort((a, b) => b.avg_sales - a.avg_sales);
  else list.sort((a, b) => a.store - b.store);

  const select = $("storeSelect");
  select.replaceChildren(
    ...list.map((s) => {
      const opt = document.createElement("option");
      opt.value = s.store;
      opt.textContent = `Store ${s.store} · type ${s.store_type} · ${pct(s.rmspe_pct)} err`;
      return opt;
    })
  );
  if (list.some((s) => String(s.store) === previous)) select.value = previous;
  else if (list.length) { select.value = list[0].store; loadForecast(); }
}

/* ---------- forecast view ---------- */
function renderKpis(m) {
  const items = [
    ["Forecast total", nf.format(m.forecast_total), "sum of median forecasts"],
    ["Actual total", m.actual_total == null ? "–" : nf.format(m.actual_total), "held-out sales"],
    ["WAPE", pct(m.wape_pct), "total absolute error / total sales"],
    ["90% interval coverage", pct(m.coverage90_pct), "days inside the band (target 90%)"],
  ];
  $("kpis").replaceChildren(
    ...items.map(([label, value, hint]) => {
      const div = document.createElement("div");
      div.className = "kpi";
      for (const [cls, text] of [["label", label], ["value", value], ["hint", hint]]) {
        const span = document.createElement("div");
        span.className = cls;
        span.textContent = text;
        div.appendChild(span);
      }
      return div;
    })
  );
}

function renderChart(d) {
  const accent = cssVar("--accent"), muted = cssVar("--muted"), ink = cssVar("--ink"), grid = cssVar("--border");
  const base = { pointRadius: 0, borderWidth: 2, spanGaps: true, tension: 0.15 };
  const datasets = [
    { ...base, label: "_lo90", data: d.lo90, borderWidth: 0, fill: false },
    { ...base, label: "90% interval", data: d.hi90, borderWidth: 0, fill: "-1", backgroundColor: cssVar("--band90") },
    { ...base, label: "_lo80", data: d.lo80, borderWidth: 0, fill: false },
    { ...base, label: "80% interval", data: d.hi80, borderWidth: 0, fill: "-1", backgroundColor: cssVar("--band80") },
    { ...base, label: "Median forecast", data: d.median, borderColor: accent, borderDash: [6, 4] },
    { ...base, label: "History", data: d.history, borderColor: muted },
    { ...base, label: "Actual (held out)", data: d.actual, borderColor: ink, showLine: false, pointRadius: 3, backgroundColor: ink },
  ];
  const shown = ["Median forecast", "History", "Actual (held out)"];

  if (chart) chart.destroy();
  chart = new Chart($("chart"), {
    type: "line",
    data: { labels: d.dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: muted, filter: (item) => !item.text.startsWith("_") } },
        tooltip: {
          filter: (item) => shown.includes(item.dataset.label) && item.parsed.y != null,
          callbacks: { label: (c) => `${c.dataset.label}: ${nf.format(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 10, autoSkip: true }, grid: { color: grid } },
        y: { ticks: { color: muted }, grid: { color: grid }, title: { display: true, text: "Daily sales", color: muted } },
      },
    },
  });
}

function renderTable(rows) {
  const cols = [
    ["Date", (r) => `${r.date} ${r.weekday}`],
    ["Promo", (r) => (r.promo ? "yes" : "")],
    ["Forecast", (r) => nf.format(r.median)],
    ["80% range", (r) => `${nf.format(r.lo80)} – ${nf.format(r.hi80)}`],
    ["90% range", (r) => `${nf.format(r.lo90)} – ${nf.format(r.hi90)}`],
    ["Actual", (r) => (r.actual == null ? "–" : nf.format(r.actual))],
  ];
  const table = $("fcTable");
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
    cols.forEach(([name, fn]) => {
      const td = document.createElement("td");
      td.textContent = fn(r);
      if (name === "Actual" && r.within90 != null) td.className = r.within90 ? "hit" : "miss";
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
  table.replaceChildren(head, body);
}

async function loadForecast() {
  const id = $("storeSelect").value;
  if (!id) return;
  setStatus("Loading…");
  try {
    const d = await api(`/api/forecast/${id}?history_days=${$("historyDays").value}`);
    renderKpis(d.metrics);
    renderChart(d);
    renderTable(d.table);
    $("csvLink").href = `/api/forecast/${id}/csv`;
    setStatus(`Store ${d.store} · type ${d.store_type} · assortment ${d.assortment}`);
  } catch (err) {
    setStatus(err.message, true);
  }
}

/* ---------- model results tab ---------- */
let tablesLoaded = false;
async function loadTables() {
  if (tablesLoaded) return;
  const tables = await api("/api/tables");
  const root = $("tables");
  if (!tables.length) { root.textContent = "No result tables found in data/app/tables.json."; return; }
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
      t.columns.forEach((c) => { const th = document.createElement("th"); th.textContent = c; hr.appendChild(th); });
      thead.appendChild(hr);
      const tbody = document.createElement("tbody");
      t.rows.forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((v) => { const td = document.createElement("td"); td.textContent = v == null ? "–" : v; tr.appendChild(td); });
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
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "results") loadTables().catch((e) => setStatus(e.message, true));
  })
);

["search", "typeFilter", "sortBy"].forEach((id) => $(id).addEventListener("input", renderStoreList));
$("storeSelect").addEventListener("change", loadForecast);
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