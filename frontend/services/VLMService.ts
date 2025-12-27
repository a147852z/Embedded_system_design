// --- 修改後：同源 API（配合 Vite proxy / 反向代理） ---
// 1) 一律走同源 /api，避免 Mixed Content，也避免外部使用者打到自己的 :8000
const API_BASE_URL = '/api';

console.log('當前 API 設定為:', API_BASE_URL);

// --- 以下函式保持功能不變 ---
export const recognizeLicensePlate = async (base64Image: string): Promise<string> => {
  const endpoint = `${API_BASE_URL}/recognize/`;
  const requestStartTime = Date.now();
  console.log(`[前端] 準備發送車牌識別請求，URL: ${endpoint}，時間: ${new Date().toISOString()}`);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    });

    const requestTime = Date.now() - requestStartTime;
    console.log(`[前端] 收到後端響應，耗時: ${requestTime}ms，狀態: ${res.status}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[前端] API 錯誤詳情:', res.status, errorText);
      return 'UNKNOWN';
    }

    const data = await res.json();
    console.log(`[前端] 識別結果: ${data.plate_number}`);
    return (data.plate_number || 'UNKNOWN').toString().toUpperCase();
  } catch (err) {
    const requestTime = Date.now() - requestStartTime;
    console.error(`[前端] 連線完全失敗，耗時: ${requestTime}ms，錯誤:`, err);
    return 'UNKNOWN';
  }
};
