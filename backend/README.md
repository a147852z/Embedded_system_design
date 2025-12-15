# Django backend for AI-Park

This folder contains a minimal Django + Django REST Framework backend that provides the API used by the React frontend in the repository root.

Quick start (Windows / PowerShell):

1. Create and activate a virtual environment

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
```

2. Install dependencies

```powershell
pip install -r requirements.txt
```

3. Run migrations

```powershell
python manage.py migrate
```

4. (Optional) Create some initial ParkingSpot records via Django admin or shell.

5. Run the development server

```powershell
python manage.py runserver 8000
```

Notes:
- The recognition endpoint `/api/recognize/` is a placeholder that returns `{{"plate_number": "UNKNOWN"}}` unless you set `GEMINI_API_KEY` environment variable and implement the real call inside `api/views.py`.
- CORS is allowed for all origins for local development. Adjust `CORS_ALLOW_ALL_ORIGINS` in `backend/backend/settings.py` for production.
