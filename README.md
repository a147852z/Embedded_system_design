# AI Park Management System

這是一個結合 Django 後端與 React 前端的智慧停車管理系統專案。

## 系統需求 (Prerequisites)

- **Node.js** (建議 v16 以上)
- **Python** (建議 3.8 以上)

## 安裝與設定 (Installation)

請分別設定後端與前端環境。

### 1. 後端設定 (Backend)

後端位於 `backend/` 資料夾，使用 Django 框架。

```bash
# 進入後端目錄
cd backend

# 建立 Python 虛擬環境 (建議)
# Windows:
python -m venv .venv
# Mac/Linux:
# python3 -m venv .venv

# 啟動虛擬環境
# Windows:
.\.venv\Scripts\Activate
# Mac/Linux:
# source .venv/bin/activate

# 安裝依賴套件
pip install -r requirements.txt

# 初始化資料庫
python manage.py migrate
```

### 2. 前端設定 (Frontend)

前端位於 `frontend/` 資料夾，使用 React + Vite。

```bash
# 進入前端目錄
cd frontend

# 安裝依賴套件
npm install
```

## 啟動專案 (Running the Project)

你需要同時啟動後端與前端伺服器。

### 啟動後端

在 `backend/` 目錄下（確保虛擬環境已啟動）：

```bash
python manage.py runserver 8000
```
後端將運行於: `http://127.0.0.1:8000`

### 啟動前端

在 `frontend/` 目錄下：

```bash
npm run dev
```
前端將運行於: `http://localhost:5173` (或終端機顯示的其他 Port)

## 設定說明 (Configuration)

### 連接後端 API
預設情況下，前端會嘗試連接本地後端。請確保 `frontend/services/api.ts` 中的設定如下：
```typescript
const USE_MOCK_API = false; // 設為 false 以使用真實後端
```

### 車牌辨識 (Gemini API)
若要使用真實的車牌辨識功能，請在後端環境中設定 `GEMINI_API_KEY` 環境變數。

