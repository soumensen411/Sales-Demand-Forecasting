# Sales Demand Forecasting

A retail sales forecasting project that combines historical sales data, store metadata, and uncertainty-aware demand predictions to provide an interactive dashboard for exploring store-level projections.

This repository contains:
- a FastAPI backend that serves forecast data and store metadata,
- a lightweight web dashboard for browsing and comparing retail stores,
- precomputed forecast artifacts stored in Parquet/JSON formats,
- a Jupyter notebook used for analysis and model experimentation.

## Live Demo

Open the deployed application here:

https://sales-demand-forecasting-hwve.onrender.com/

## Project Overview

The goal of this project is to estimate future demand for individual stores using historical transaction patterns and store characteristics. Forecast outputs include:
- median sales forecast,
- 80% and 90% prediction intervals,
- actual vs. forecast comparison,
- summary metrics such as MAE, WAPE, RMSPE, and coverage.

The app is designed to be easy to explore locally and is well suited for demo, analytics, or further model experimentation.

## Key Features

- Store-level sales visualization for multiple retail locations
- Search and filtering by store ID and store type
- Adjustable history window (e.g. 30, 90, 180, 365 days)
- Forecast charts with confidence intervals
- Summary KPIs for each store
- CSV export of forecast tables
- FastAPI JSON endpoints for integration or downstream apps
- Static front-end dashboard powered by Chart.js

## Tech Stack

- Python 3.x
- FastAPI
- Uvicorn
- Pandas
- NumPy
- PyArrow
- Jupyter Notebook
- Chart.js

## Repository Structure

```text
Sales-Demand-Forecasting-
├── app/
│   ├── main.py              # FastAPI application and API routes
│   ├── static/
│   │   ├── index.html       # Dashboard UI
│   │   ├── css/
│   │   ├── js/
│   │   └── public/
│   └── __pycache__/
├── data/
│   └── app/
│       ├── forecasts.parquet
│       ├── history.parquet
│       ├── stores.json
│       └── tables.json
├── store-sales-forecasting.ipynb
├── store-sales-forecasting (1).ipynb
├── requirements.txt
├── README.md
└── .gitignore
```

## Data Description

The project uses pre-generated forecast data stored in `data/app/`.

### Files

- `forecasts.parquet`: forecasted daily values by store, including actuals and intervals
- `history.parquet`: historical sales records used for display and comparison
- `stores.json`: store metadata such as store ID, type, and assortment
- `tables.json`: additional model result tables or summary metadata for the dashboard

### Forecast schema

Each forecast entry typically includes:
- `store`
- `date`
- `promo`
- `actual`
- `median`
- `lo80`, `hi80`
- `lo90`, `hi90`

These values allow the dashboard to show both expected demand and forecast uncertainty.

## Application Architecture

The backend is defined in `app/main.py`.

### API responsibilities

- Load forecast and historical data during app startup
- Group data by store for efficient retrieval
- Serve store metadata and model/tables metadata
- Return forecast metrics and aligned time-series values
- Provide CSV export for any store forecast

### Example API endpoints

- `GET /api/health` — check service health
- `GET /api/stores` — list all stores and their metadata
- `GET /api/tables` — get model tables metadata
- `GET /api/forecast/{store_id}` — fetch one store forecast and metrics
- `GET /api/forecast/{store_id}/csv` — download forecast as CSV

The frontend is a single-page dashboard served from `app/static/index.html`, with static assets in the `app/static` directory.

## Dashboard Functionality

The dashboard provides a user-friendly interface to:
- search a store by ID,
- filter by store type,
- sort stores by forecast error, total sales, or ID,
- adjust the time window for historical context,
- inspect forecast performance metrics,
- review daily forecast tables,
- download a raw CSV version of the forecast.

## Installation

1. Clone the repository:

```bash
git clone https://github.com/soumensen411/Sales-Demand-Forecasting-.git
cd Sales-Demand-Forecasting-
```

2. Create and activate a virtual environment (optional but recommended):

```bash
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
# or
.venv\Scripts\activate      # Windows
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

## Running the App

Start the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Then open:

```text
http://localhost:8000
```

The app serves the dashboard at the root URL and exposes the forecast API under `/api/*`.

## Example Usage

### Health check

```bash
curl http://localhost:8000/api/health
```

### Get forecast data for a store

```bash
curl http://localhost:8000/api/forecast/1
```

### Download CSV for a store

```bash
curl -L http://localhost:8000/api/forecast/1/csv -o store_1_forecast.csv
```

## Forecast Metrics

The backend calculates the following values when actuals are available:

- `mae`: mean absolute error
- `wape_pct`: weighted absolute percentage error
- `rmspe_pct`: root mean squared percentage error
- `coverage90_pct`: percentage of actuals inside the 90% prediction interval
- `forecast_total`: sum of forecasted values
- `actual_total`: sum of actual observed values

These metrics help quantify both accuracy and reliability of the forecasting model.

## Model and Analysis Notes

The project includes Jupyter notebooks for exploring forecasting logic and data relationships. While the repository primarily ships with precomputed data and a deployed dashboard, the notebook files can be used to:
- inspect historical demand patterns,
- evaluate seasonal or promotional effects,
- test alternative forecasting methods,
- refine store-level model behavior.

The project is structured to support both demonstration and iterative experimentation.

## Limitations

- Forecasts are precomputed and loaded from parquet files rather than trained live at runtime.
- The backend does not currently include a training pipeline or model persistence workflow in the app code.
- Forecast quality depends on the underlying dataset and assumptions captured in the notebook/model outputs.

## Future Improvements

Potential enhancements include:
- adding a real training pipeline,
- integrating a modern MLOps workflow,
- implementing authentication or user accounts,
- adding more advanced forecasting models,
- supporting multi-store comparisons and benchmarking,
- exposing model version metadata in the API.

## License

This project does not currently include a license file. If you plan to publish or share it more broadly, consider adding an appropriate open-source license such as MIT or Apache 2.0.

## Contributing

Contributions are welcome. If you want to improve the model, dashboard, or API, feel free to fork the repository, make changes, and open a pull request.

## Contact

For questions or collaboration requests, use the repository owner information available in the GitHub project page.

---

This README was prepared to document the project purpose, structure, setup, and usage in a way that is clear to both developers and end users.
