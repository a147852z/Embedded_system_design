// --- 修改前 ---
// const API_BASE_URL = 'http://192.168.178.151:8000/api';

// --- 修改後 (自動抓取當前 IP) ---
// 1. 抓取瀏覽器網址列的 Hostname (例如 'localhost' 或 '192.168.1.100')
const currentHostname = window.location.hostname;

// 2. 組合出後端網址 (假設後端永遠固定在 Port 8000)
const API_BASE_URL = `http://${currentHostname}:8000/api`;

console.log("當前 API 設定為:", API_BASE_URL); // 方便你除錯確認

// --- 以下函式保持不變 ---
export const recognizeLicensePlate = async (base64Image: string): Promise<string> => {
  console.log("準備發送 API，URL:", `${API_BASE_URL}/recognize/`); 

  try {
    const res = await fetch(`${API_BASE_URL}/recognize/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image })
    });

    if (!res.ok) {
      const errorText = await res.text(); 
      console.error('API 錯誤詳情:', res.status, errorText);
      return 'UNKNOWN';
    }

    const data = await res.json();
    return (data.plate_number || 'UNKNOWN').toString().toUpperCase();
  } catch (err) {
    console.error('連線完全失敗 (可能是網路不通或 CORS):', err);
    return 'UNKNOWN';
  }
};