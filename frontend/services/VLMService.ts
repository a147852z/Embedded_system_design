// --- 修改後：同源 API（配合 Vite proxy / 反向代理） ---
// 1) 一律走同源 /api，避免 Mixed Content，也避免外部使用者打到自己的 :8000
const API_BASE_URL = '/api';

console.log('當前 API 設定為:', API_BASE_URL);

// --- 以下函式保持功能不變 ---
export const recognizeLicensePlate = async (base64Image: string): Promise<string> => {
  const endpoint = `${API_BASE_URL}/recognize/`;
  console.log('準備發送 API，URL:', endpoint);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API 錯誤詳情:', res.status, errorText);
      return 'UNKNOWN';
    }

    const data = await res.json();
    return (data.plate_number || 'UNKNOWN').toString().toUpperCase();
  } catch (err) {
    console.error('連線完全失敗:', err);
    return 'UNKNOWN';
  }
};
