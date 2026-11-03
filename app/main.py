import io
import json
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE = Path(__file__).resolve().parent
DATA = BASE.parent / "data" / "app"
state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    fc = pd.read_parquet(DATA / "forecasts.parquet")
    hist = pd.read_parquet(DATA / "history.parquet")
    fc["date"], hist["date"] = pd.to_datetime(fc["date"]), pd.to_datetime(hist["date"])

    state["fc"] = {int(s): g.sort_values("date").reset_index(drop=True) for s, g in fc.groupby("store")}
    state["hist"] = {int(s): g.sort_values("date").reset_index(drop=True) for s, g in hist.groupby("store")}
    state["stores"] = json.loads((DATA / "stores.json").read_text())
    state["stores_by_id"] = {s["store"]: s for s in state["stores"]}
    tables = DATA / "tables.json"
    state["tables"] = json.loads(tables.read_text()) if tables.exists() else []
    yield
    state.clear()


app = FastAPI(title="Sales Forecasting API", version="1.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


# ---------- schemas ----------
class Metrics(BaseModel):
    forecast_total: float
    actual_total: float | None = None
    mae: float | None = None
    wape_pct: float | None = None
    rmspe_pct: float | None = None
    coverage90_pct: float | None = None


class ForecastResponse(BaseModel):
    store: int
    store_type: str
    assortment: str
    dates: list[str]
    history: list[float | None]
    actual: list[float | None]
    median: list[float | None]
    lo80: list[float | None]
    hi80: list[float | None]
    lo90: list[float | None]
    hi90: list[float | None]
    metrics: Metrics
    table: list[dict]


# ---------- helpers ----------
def num(v, nd=1):
    return None if pd.isna(v) else round(float(v), nd)


def get_store_frames(store_id: int):
    fc, meta = state["fc"].get(store_id), state["stores_by_id"].get(store_id)
    if fc is None or meta is None:
        raise HTTPException(status_code=404, detail=f"No forecast for store {store_id}")
    return fc, state["hist"].get(store_id), meta


def forecast_table(fc: pd.DataFrame) -> list[dict]:
    rows = []
    for r in fc.itertuples():
        has_actual = not pd.isna(r.actual)
        rows.append({
            "date": r.date.strftime("%Y-%m-%d"), "weekday": r.date.strftime("%a"),
            "promo": int(r.promo), "median": num(r.median, 0),
            "lo80": num(r.lo80, 0), "hi80": num(r.hi80, 0),
            "lo90": num(r.lo90, 0), "hi90": num(r.hi90, 0),
            "actual": num(r.actual, 0) if has_actual else None,
            "within90": bool(r.lo90 <= r.actual <= r.hi90) if has_actual else None,
        })
    return rows


# ---------- routes ----------
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "stores": len(state["fc"])}


@app.get("/api/stores")
def list_stores():
    return state["stores"]


@app.get("/api/tables")
def model_tables():
    return state["tables"]


@app.get("/api/forecast/{store_id}", response_model=ForecastResponse)
def get_forecast(store_id: int, history_days: int = Query(90, ge=14, le=365)):
    fc, hist, meta = get_store_frames(store_id)

    start = fc.date.min() - pd.Timedelta(days=history_days)
    dates = pd.date_range(start, fc.date.max(), freq="D")

    def aligned(frame, col):
        if frame is None:
            return [None] * len(dates)
        return [num(v) for v in frame.set_index("date")[col].reindex(dates)]

    has_actual = fc.actual.notna().any()
    err = fc.actual - fc["median"]
    metrics = Metrics(
        forecast_total=float(fc["median"].sum()),
        actual_total=float(fc.actual.sum()) if has_actual else None,
        mae=num(err.abs().mean()) if has_actual else None,
        wape_pct=num(err.abs().sum() / fc.actual.sum() * 100) if has_actual else None,
        rmspe_pct=num(np.sqrt(((err / fc.actual) ** 2).mean()) * 100) if has_actual else None,
        coverage90_pct=num(((fc.actual >= fc.lo90) & (fc.actual <= fc.hi90)).mean() * 100) if has_actual else None,
    )
    return ForecastResponse(
        store=store_id, store_type=meta["store_type"], assortment=meta["assortment"],
        dates=[d.strftime("%Y-%m-%d") for d in dates],
        history=aligned(hist, "sales"),
        actual=aligned(fc, "actual"), median=aligned(fc, "median"),
        lo80=aligned(fc, "lo80"), hi80=aligned(fc, "hi80"),
        lo90=aligned(fc, "lo90"), hi90=aligned(fc, "hi90"),
        metrics=metrics, table=forecast_table(fc),
    )


@app.get("/api/forecast/{store_id}/csv")
def download_csv(store_id: int):
    fc, _, _ = get_store_frames(store_id)
    buf = io.StringIO()
    pd.DataFrame(forecast_table(fc)).to_csv(buf, index=False)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="store_{store_id}_forecast.csv"'})