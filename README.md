<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ejc6CFpTjA_9BEcubSCX6y_bZnsBtNOu

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Frontend only (dev):
   - `npm run dev`

3. To run the Django backend (optional, recommended for full features like plate recognition):
   - Change to the backend folder and follow `backend/README.md` to create a venv, install requirements and run `python manage.py migrate` then `python manage.py runserver 8000`.
   - After backend is running, in `services/api.ts` set `USE_MOCK_API = false` to make the React app call the Django APIs.

4. Gemini / Plate recognition:
   - The actual Gemini call has been moved to the backend for security. Set `GEMINI_API_KEY` in your backend environment before running the server if you want real recognition.
