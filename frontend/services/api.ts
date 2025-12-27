import { ParkingSpot, SpotStatus, LogEntry } from '../types';

// --- CONFIGURATION ---
// Set this to FALSE when your Django server is running
const USE_MOCK_API = false;

// 自動抓取當前瀏覽器的 Hostname (解決 localhost vs 192.168.x.x 問題)
// const currentHostname = window.location.hostname;
const API_BASE_URL = `/api`;

// --- MOCK DATA (Simulating Database) ---
// 預設為空資料，若使用 Mock 模式，重置時會清空回這裡
let MOCK_SPOTS: ParkingSpot[] = [];
let MOCK_LOGS: LogEntry[] = [];

// --- API FUNCTIONS ---

export const api = {
  /**
   * GET /api/camera/snapshot/
   * 獲取後端攝影機的即時快照
   */
  getCameraSnapshot: async (): Promise<string> => {
    if (USE_MOCK_API) {
      // Mock: Return a placeholder image
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    }
    try {
      const requestStartTime = Date.now();
      console.log(`[前端] 發送相機快照請求，時間: ${new Date().toISOString()}`);
      const response = await fetch(`${API_BASE_URL}/camera/snapshot/`);
      const requestTime = Date.now() - requestStartTime;
      console.log(`[前端] 相機快照響應，耗時: ${requestTime}ms，狀態: ${response.status}`);
      if (!response.ok) throw new Error('Failed to fetch snapshot');
      const data = await response.json();
      return data.image; // Expecting base64 string
    } catch (error) {
      console.error('[前端] 獲取相機快照失敗:', error);
      throw error;
    }
  },

  /**
   * GET /api/spots/
   */
  fetchSpots: async (): Promise<ParkingSpot[]> => {
    if (USE_MOCK_API) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));
      return [...MOCK_SPOTS];
    }

    const res = await fetch(`${API_BASE_URL}/spots/`);
    const data = await res.json();
    // Convert backend (snake_case) to frontend shape (camelCase + Date objects)
    return data.map((s: any) => ({
      id: s.id,
      label: s.label,
      status: s.status as SpotStatus,
      distanceRaw: s.distance_raw,
      floor: s.floor,
      section: s.section,
      plateNumber: s.plate_number || undefined,
      parkedTime: s.parked_time ? new Date(s.parked_time) : undefined,
      abnormalReason: s.abnormal_reason || undefined,
    }));
  },

  /**
   * POST /api/spots/:id/occupy/
   */
  occupySpot: async (spotId: string, plateNumber: string): Promise<void> => {
    if (USE_MOCK_API) {
      await new Promise(resolve => setTimeout(resolve, 300));
      MOCK_SPOTS = MOCK_SPOTS.map(s => s.id === spotId ? {
        ...s,
        status: SpotStatus.OCCUPIED,
        plateNumber: plateNumber,
        parkedTime: new Date()
      } : s);
      return;
    }

    await fetch(`${API_BASE_URL}/spots/${spotId}/occupy/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plate_number: plateNumber })
    });
  },

  /**
   * PATCH /api/spots/:id/
   */
  updateSpotStatus: async (spotId: string, status: SpotStatus, abnormalReason?: string): Promise<void> => {
    if (USE_MOCK_API) {
      MOCK_SPOTS = MOCK_SPOTS.map(s => s.id === spotId ? {
        ...s,
        status: status,
        abnormalReason: status === SpotStatus.ABNORMAL ? (abnormalReason || '模擬異常') : undefined,
        plateNumber: status === SpotStatus.AVAILABLE ? undefined : s.plateNumber
      } : s);
      return;
    }

    await fetch(`${API_BASE_URL}/spots/${spotId}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, abnormal_reason: abnormalReason })
    });
  },

  /**
   * GET /api/logs/
   */
  fetchLogs: async (): Promise<LogEntry[]> => {
    if (USE_MOCK_API) {
      return [...MOCK_LOGS];
    }
    const res = await fetch(`${API_BASE_URL}/logs/`);
    // Need to convert string timestamps to Date objects if fetching from JSON
    const data = await res.json();
    return data.map((log: any) => ({
      id: log.id?.toString(),
      timestamp: new Date(log.timestamp),
      type: log.type,
      message: log.message,
      plateNumber: log.plate_number || undefined,
      spotId: log.spot || undefined,
    }));
  },

  /**
   * POST /api/logs/
   */
  createLog: async (entry: Omit<LogEntry, 'id'>): Promise<void> => {
    if (USE_MOCK_API) {
      const newLog = { ...entry, id: Date.now().toString() };
      MOCK_LOGS = [newLog, ...MOCK_LOGS];
      return;
    }

    // Convert frontend entry keys to backend naming where needed
    const payload: any = {
      timestamp: entry.timestamp.toISOString(),
      type: entry.type,
      message: entry.message,
    };
    if (entry.plateNumber) payload.plate_number = entry.plateNumber;
    if (entry.spotId) payload.spot = entry.spotId;

    await fetch(`${API_BASE_URL}/logs/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },

  /**
   * POST /api/reset/
   * 重置系統：清空車位與紀錄
   */
  resetSystem: async (): Promise<void> => {
    if (USE_MOCK_API) {
      // 重置 Mock 資料
      MOCK_SPOTS = MOCK_SPOTS.map(s => ({
        ...s,
        status: SpotStatus.AVAILABLE,
        plateNumber: undefined,
        parkedTime: undefined,
        abnormalReason: undefined
      }));
      MOCK_LOGS = [];
      return;
    }

    // 呼叫真實後端重置
    await fetch(`${API_BASE_URL}/reset/`, {
      method: 'POST',
    });
  }
};