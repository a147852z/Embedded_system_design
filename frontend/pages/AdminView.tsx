import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutDashboard, Info, RotateCcw, Settings, Camera, Save, FileJson, RefreshCw } from 'lucide-react'; // 引入 RotateCcw 和 Settings
import { Header, StatusBadge } from '../components/Shared';
import { ParkingSpot, SpotStatus, LogEntry } from '../types';
import { api } from '../services/api';

interface AdminViewProps {
  spots: ParkingSpot[];
  logs: LogEntry[];
  onRefresh: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ spots, logs, onRefresh }) => {
  const [hwConfigText, setHwConfigText] = useState<string>('');
  const [hwLoading, setHwLoading] = useState(false);
  const [hwSaving, setHwSaving] = useState(false);
  const [hwError, setHwError] = useState<string | null>(null);
  const [hwSuccess, setHwSuccess] = useState<string | null>(null);
  const [cameraPreview, setCameraPreview] = useState<{ name: 'entrance' | 'parking'; image: string } | null>(null);
  const [cameraLoading, setCameraLoading] = useState<'entrance' | 'parking' | null>(null);

  // Hardware status panel
  const [hwStatus, setHwStatus] = useState<any | null>(null);
  const [hwStatusLoading, setHwStatusLoading] = useState(false);

  // ROI editor state (for parking camera)
  const imgRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const [roiSpotId, setRoiSpotId] = useState<'1' | '2' | '3' | '4'>('1');
  const [roiDraft, setRoiDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const canSaveHw = useMemo(() => hwConfigText.trim().length > 0 && !hwSaving, [hwConfigText, hwSaving]);

  const loadHwConfig = async () => {
    setHwLoading(true);
    setHwError(null);
    setHwSuccess(null);
    try {
      const cfg = await api.fetchHardwareConfig();
      setHwConfigText(JSON.stringify(cfg, null, 2));
    } catch (e: any) {
      setHwError(e?.message || '載入硬體設定失敗');
    } finally {
      setHwLoading(false);
    }
  };

  const loadHwStatus = async (active: boolean) => {
    setHwStatusLoading(true);
    setHwError(null);
    setHwSuccess(null);
    try {
      const data = await api.fetchHardwareStatus(active);
      setHwStatus(data);
      setHwSuccess(active ? '已完成主動測試（閃燈/鳴叫）' : '已更新硬體檢測結果（被動）');
    } catch (e: any) {
      setHwError(e?.message || '取得硬體狀態失敗');
    } finally {
      setHwStatusLoading(false);
    }
  };

  const formatHwConfig = () => {
    setHwError(null);
    setHwSuccess(null);
    try {
      const obj = JSON.parse(hwConfigText);
      setHwConfigText(JSON.stringify(obj, null, 2));
    } catch (e: any) {
      setHwError(e?.message || 'JSON 格式錯誤，無法格式化');
    }
  };

  const saveHwConfig = async () => {
    setHwSaving(true);
    setHwError(null);
    setHwSuccess(null);
    try {
      const obj = JSON.parse(hwConfigText);
      const res = await api.updateHardwareConfig(obj);
      // 後端回傳 raw（保留 device 的平台 dict 形式）
      const raw = res?.raw ?? obj;
      setHwConfigText(JSON.stringify(raw, null, 2));
      setHwSuccess('已儲存並套用（後端已驗證）');
    } catch (e: any) {
      setHwError(e?.message || '儲存硬體設定失敗');
    } finally {
      setHwSaving(false);
    }
  };

  const testCamera = async (name: 'entrance' | 'parking') => {
    setCameraLoading(name);
    setHwError(null);
    setHwSuccess(null);
    try {
      const img = await api.getCameraSnapshot(name);
      setCameraPreview({ name, image: img });
      setHwSuccess(`已取得 ${name === 'entrance' ? '入口' : '停車場內'} 相機快照，請確認畫面是否正確`);
    } catch (e: any) {
      setHwError(e?.message || '取得相機快照失敗');
    } finally {
      setCameraLoading(null);
    }
  };

  const getImageScale = () => {
    const img = imgRef.current;
    if (!img) return null;
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const rect = img.getBoundingClientRect();
    const displayW = rect.width || 1;
    const displayH = rect.height || 1;
    const sx = naturalW / displayW;
    const sy = naturalH / displayH;
    return { sx, sy, displayW, displayH, naturalW, naturalH };
  };

  const parseHwObj = () => {
    const obj = JSON.parse(hwConfigText || '{}');
    return obj;
  };

  const getCurrentRoiFromConfig = (): { x: number; y: number; w: number; h: number } | null => {
    try {
      const obj = parseHwObj();
      const roi = obj?.cameras?.parking?.roi_by_spot?.[roiSpotId];
      if (!roi) return null;
      return { x: Number(roi.x), y: Number(roi.y), w: Number(roi.w), h: Number(roi.h) };
    } catch {
      return null;
    }
  };

  const applyRoiToConfig = (roi: { x: number; y: number; w: number; h: number }) => {
    setHwError(null);
    setHwSuccess(null);
    try {
      const obj = parseHwObj();
      obj.cameras = obj.cameras || {};
      obj.cameras.parking = obj.cameras.parking || {};
      obj.cameras.parking.roi_by_spot = obj.cameras.parking.roi_by_spot || {};
      obj.cameras.parking.roi_by_spot[String(roiSpotId)] = {
        x: Math.max(0, Math.round(roi.x)),
        y: Math.max(0, Math.round(roi.y)),
        w: Math.max(1, Math.round(roi.w)),
        h: Math.max(1, Math.round(roi.h)),
      };
      setHwConfigText(JSON.stringify(obj, null, 2));
      setHwSuccess(`已更新 ROI：車位 ${roiSpotId}（尚未儲存，請按「儲存套用」）`);
    } catch (e: any) {
      setHwError(e?.message || '更新 ROI 失敗（JSON 可能有誤）');
    }
  };

  const redrawOverlay = () => {
    const canvas = overlayRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const scale = getImageScale();
    if (!scale) return;

    // match canvas size to displayed image size
    canvas.width = Math.floor(scale.displayW);
    canvas.height = Math.floor(scale.displayH);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw all ROIs from config
    let obj: any = null;
    try { obj = parseHwObj(); } catch { obj = null; }
    const rois = obj?.cameras?.parking?.roi_by_spot || {};

    const drawRect = (roi: any, color: string, label: string) => {
      const x = (Number(roi.x) || 0) / scale.sx;
      const y = (Number(roi.y) || 0) / scale.sy;
      const w = (Number(roi.w) || 0) / scale.sx;
      const h = (Number(roi.h) || 0) / scale.sy;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = color;
      ctx.font = '12px sans-serif';
      ctx.fillText(label, x + 4, y + 14);
    };

    Object.keys(rois).forEach((sid) => {
      const isSelected = String(sid) === String(roiSpotId);
      drawRect(rois[sid], isSelected ? '#22c55e' : '#3b82f6', `Spot ${sid}`);
    });

    // draw draft on top
    if (roiDraft) {
      drawRect(roiDraft, '#f59e0b', `Draft ${roiSpotId}`);
    }
  };

  const onOverlayMouseDown = (e: React.MouseEvent) => {
    if (!imgRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setIsDrawing(true);
    drawStartRef.current = { x: px, y: py };
    setRoiDraft(null);
  };

  const onOverlayMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !drawStartRef.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const start = drawStartRef.current;
    const x = Math.min(start.x, px);
    const y = Math.min(start.y, py);
    const w = Math.abs(px - start.x);
    const h = Math.abs(py - start.y);
    const scale = getImageScale();
    if (!scale) return;

    // convert to natural pixel coords
    const roi = {
      x: x * scale.sx,
      y: y * scale.sy,
      w: w * scale.sx,
      h: h * scale.sy,
    };
    setRoiDraft(roi);
  };

  const onOverlayMouseUp = () => {
    setIsDrawing(false);
    drawStartRef.current = null;
    if (roiDraft) {
      applyRoiToConfig(roiDraft);
      setRoiDraft(null);
    }
  };
  
  const toggleStatus = async (id: string, newStatus: SpotStatus) => {
    try {
      // Simulate hardware trigger via API
      let reason = undefined;
      if (newStatus === SpotStatus.ABNORMAL) {
        reason = '車身歪斜 (管理員模擬)';
        // Also log it
        await api.createLog({
           timestamp: new Date(),
           type: 'ABNORMAL',
           message: `管理員手動觸發異常: 車位 ${id}`,
           spotId: id
        });
      }
      
      await api.updateSpotStatus(id, newStatus, reason);
      onRefresh();
    } catch (e) {
      alert("更新失敗");
    }
  };

  // 系統重置邏輯
  const handleReset = async () => {
    if (!window.confirm("⚠️ 警告：確定要重置整個系統嗎？\n\n這將會：\n1. 清空所有車位上的車輛\n2. 刪除所有操作紀錄")) {
      return;
    }
    try {
      await api.resetSystem();
      alert("系統已重置完成！");
      onRefresh(); // 重新抓取資料
    } catch (e) {
      console.error(e);
      alert("重置失敗，請檢查後端連線");
    }
  };

  useEffect(() => {
    // 進入後台先載入一次硬體設定，讓管理員能直接看見目前設定
    loadHwConfig();
    // 同時載入一次硬體狀態
    loadHwStatus(false);
  }, []);

  useEffect(() => {
    // 畫 ROI overlay（config 或 spot 切換、或快照載入時重繪）
    redrawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hwConfigText, roiSpotId, cameraPreview, roiDraft]);

  return (
    <div className="min-h-screen bg-gray-100 pb-10"> {/* 增加 pb-10 讓底部留白 */}
      <Header title="AI-Park 後台管理" subtitle="Admin Dashboard" />
      
      <div className="container mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Status Control Panel */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <LayoutDashboard /> 車位狀態管理
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">狀態</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {spots.map(spot => (
                  <tr key={spot.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{spot.label}</td>
                    <td className="px-4 py-3"><StatusBadge status={spot.status} /></td>
                    <td className="px-4 py-3 flex gap-2">
                      <button 
                        onClick={() => toggleStatus(spot.id, SpotStatus.AVAILABLE)}
                        className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200" title="Set Available"
                      >
                        空
                      </button>
                      <button 
                         onClick={() => toggleStatus(spot.id, SpotStatus.OCCUPIED)}
                        className="p-1 bg-yellow-100 text-yellow-600 rounded hover:bg-yellow-200" title="Set Occupied"
                      >
                        停
                      </button>
                       <button 
                         onClick={() => toggleStatus(spot.id, SpotStatus.ABNORMAL)}
                        className="p-1 bg-red-100 text-red-600 rounded hover:bg-red-200" title="Trigger Sensor Abnormal"
                      >
                        警
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Logs Panel */}
        <div className="bg-white p-6 rounded-xl shadow-sm">
           <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Info /> 系統紀錄 (Logs)
          </h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {logs.length === 0 ? (
              <p className="text-gray-400 text-center py-8">暫無紀錄</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className="border-l-4 border-gray-300 pl-3 py-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="font-mono">{log.type}</span>
                  </div>
                  <p className="text-sm text-gray-800">{log.message}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Device Simulation Status */}
        <div className="bg-white p-6 rounded-xl shadow-sm lg:col-span-2">
          <h2 className="text-lg font-bold mb-4">設備狀態 (Device Mock)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <div className="p-4 bg-gray-50 rounded border text-center">
               <div className="text-sm text-gray-500">Raspberry Pi</div>
               <div className="text-green-600 font-bold">Online</div>
             </div>
             <div className="p-4 bg-gray-50 rounded border text-center">
               <div className="text-sm text-gray-500">HC-SR04 Sensors</div>
               <div className="text-green-600 font-bold">Active (2)</div>
             </div>
             <div className="p-4 bg-gray-50 rounded border text-center">
               <div className="text-sm text-gray-500">Camera (VLM)</div>
               <div className="text-green-600 font-bold">Standby</div>
             </div>
             <div className="p-4 bg-gray-50 rounded border text-center">
               <div className="text-sm text-gray-500">Buzzer/LED</div>
               <div className={spots.some(s => s.status === SpotStatus.ABNORMAL) ? "text-red-600 font-bold animate-pulse" : "text-gray-400"}>
                 {spots.some(s => s.status === SpotStatus.ABNORMAL) ? "TRIGGERED" : "Idle"}
               </div>
             </div>
          </div>
        </div>

        {/* Hardware Config Panel */}
        <div className="bg-white p-6 rounded-xl shadow-sm lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                <FileJson size={20} /> 硬體設定 (GPIO / Camera / ROI)
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                可在此確認並修改「入口/出口相機」與各腳位。建議相機使用 <span className="font-mono">/dev/v4l/by-id/...</span> 避免 0/1 對調。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadHwConfig}
                disabled={hwLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 disabled:opacity-50"
              >
                <RefreshCw size={18} className={hwLoading ? "animate-spin" : ""} />
                重新載入
              </button>
              <button
                onClick={formatHwConfig}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100"
              >
                <FileJson size={18} />
                格式化
              </button>
              <button
                onClick={saveHwConfig}
                disabled={!canSaveHw}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50"
              >
                <Save size={18} />
                {hwSaving ? "儲存中..." : "儲存套用"}
              </button>
            </div>
          </div>

          {(hwError || hwSuccess) && (
            <div className={`mb-4 p-3 rounded-lg border ${hwError ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
              <div className="text-sm font-bold">{hwError ? "錯誤" : "成功"}</div>
              <div className="text-sm mt-1 whitespace-pre-wrap">{hwError || hwSuccess}</div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <textarea
                value={hwConfigText}
                onChange={(e) => setHwConfigText(e.target.value)}
                className="w-full min-h-[340px] font-mono text-xs bg-gray-900 text-gray-100 rounded-xl p-4 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="載入中..."
              />
            </div>

            <div className="space-y-3">
              {/* Hardware Status */}
              <div className="p-4 rounded-xl border bg-white">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="font-bold text-gray-800">硬體檢測</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadHwStatus(false)}
                      disabled={hwStatusLoading}
                      className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1"
                    >
                      <RefreshCw size={14} className={hwStatusLoading ? "animate-spin" : ""} />
                      {hwStatusLoading ? "檢測中..." : "被動刷新"}
                    </button>
                    <button
                      onClick={() => loadHwStatus(true)}
                      disabled={hwStatusLoading}
                      className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <RefreshCw size={14} className={hwStatusLoading ? "animate-spin" : ""} />
                      主動測試
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-600 mb-3">
                  - 被動刷新：只檢查「能否初始化/權限/庫」→ <span className="font-bold">不會有實體反應</span><br />
                  - 主動測試：會短暫閃燈/鳴叫，並嘗試讀超音波一次（部署到樹莓派且硬體接上才會有效）
                </div>

                {hwStatus ? (
                  <div className="space-y-2 text-sm">
                    <div className="p-2 rounded bg-gray-50 border">
                      <div className="font-bold">平台</div>
                      <div className="font-mono text-xs text-gray-700">
                        {hwStatus?.platform?.system} {hwStatus?.platform?.release} ({hwStatus?.platform?.os_name})
                      </div>
                    </div>

                    <div className="p-2 rounded bg-gray-50 border">
                      <div className="font-bold">GPIO Library</div>
                      <div className="text-xs text-gray-700">
                        {hwStatus?.gpio?.library_ok ? "✅ 可用" : "❌ 不可用"}
                        {hwStatus?.gpio?.error ? ` — ${hwStatus.gpio.error}` : ""}
                      </div>
                      {!hwStatus?.gpio?.library_ok && (
                        <div className="text-xs text-gray-500 mt-1">
                          如果你是在 Windows 開發機，這是正常的：GPIO 不會有反應；請在樹莓派上執行後端再測。
                        </div>
                      )}
                    </div>

                    <div className="p-2 rounded bg-gray-50 border">
                      <div className="font-bold">共用蜂鳴器</div>
                      <div className="text-xs text-gray-700">
                        pin={hwStatus?.shared?.buzzer?.pin} — {hwStatus?.shared?.buzzer?.ok ? "✅ OK" : "❌ FAIL"}
                        {hwStatus?.shared?.buzzer?.error ? ` — ${hwStatus.shared.buzzer.error}` : ""}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-gray-50 border">
                      <div className="font-bold">相機</div>
                      <div className="space-y-1 text-xs text-gray-700">
                        {Object.keys(hwStatus?.cameras || {}).length === 0 ? (
                          <div className="text-gray-500">無</div>
                        ) : (
                          Object.entries(hwStatus.cameras).map(([name, c]: any) => (
                            <div key={name} className="flex justify-between gap-2">
                              <span className="font-mono">{name}</span>
                              <span className="font-mono truncate">device={String(c.device)}</span>
                              <span>{c.ok ? "✅" : "❌"}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="p-2 rounded bg-gray-50 border">
                      <div className="font-bold">車位硬體</div>
                      <div className="space-y-2 text-xs text-gray-700">
                        {Object.keys(hwStatus?.spots || {}).length === 0 ? (
                          <div className="text-gray-500">無</div>
                        ) : (
                          Object.entries(hwStatus.spots).map(([sid, s]: any) => (
                            <div key={sid} className="p-2 rounded bg-white border">
                              <div className="font-bold mb-1">Spot {sid} ({s.label})</div>
                              <div className="grid grid-cols-1 gap-1">
                                <div>
                                  LED:
                                  <span className="ml-2">R({s.led?.r?.pin}) {s.led?.r?.ok ? "✅" : "❌"}</span>
                                  <span className="ml-2">Y({s.led?.y?.pin}) {s.led?.y?.ok ? "✅" : "❌"}</span>
                                  <span className="ml-2">G({s.led?.g?.pin}) {s.led?.g?.ok ? "✅" : "❌"}</span>
                                  {(s.led?.r?.error || s.led?.y?.error || s.led?.g?.error) && (
                                    <div className="text-[11px] text-red-600 mt-1 break-words">
                                      {s.led?.r?.error ? `R: ${s.led.r.error} ` : ""}
                                      {s.led?.y?.error ? `Y: ${s.led.y.error} ` : ""}
                                      {s.led?.g?.error ? `G: ${s.led.g.error}` : ""}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  US(left):
                                  <span className="ml-2">T{String(s.ultrasonic?.left?.trigger)}/E{String(s.ultrasonic?.left?.echo)}</span>
                                  <span className="ml-2">{s.ultrasonic?.left?.ok ? "✅" : "❌"}</span>
                                  {typeof s.ultrasonic?.left?.distance_m === 'number' && (
                                    <span className="ml-2">d={s.ultrasonic.left.distance_m.toFixed(3)}m</span>
                                  )}
                                  {s.ultrasonic?.left?.error && (
                                    <div className="text-[11px] text-red-600 mt-1 break-words">left: {s.ultrasonic.left.error}</div>
                                  )}
                                </div>
                                <div>
                                  US(right):
                                  <span className="ml-2">T{String(s.ultrasonic?.right?.trigger)}/E{String(s.ultrasonic?.right?.echo)}</span>
                                  <span className="ml-2">{s.ultrasonic?.right?.ok ? "✅" : "❌"}</span>
                                  {typeof s.ultrasonic?.right?.distance_m === 'number' && (
                                    <span className="ml-2">d={s.ultrasonic.right.distance_m.toFixed(3)}m</span>
                                  )}
                                  {s.ultrasonic?.right?.error && (
                                    <div className="text-[11px] text-red-600 mt-1 break-words">right: {s.ultrasonic.right.error}</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      注意：被動檢測只能確認「程式/權限/腳位初始化」是否正常；要確認超音波是否真的有回波，請勾選主動測試並在樹莓派上執行。
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">尚未取得狀態</div>
                )}
              </div>

              <div className="p-4 rounded-xl border bg-gray-50">
                <div className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <Camera size={18} /> 相機確認
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  點擊後端會依設定檔抓取對應相機快照，請確認畫面是否為入口 / 停車場內。
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => testCamera('entrance')}
                    disabled={cameraLoading !== null}
                    className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {cameraLoading === 'entrance' ? "入口擷取中..." : "測試入口(車牌)"}
                  </button>
                  <button
                    onClick={() => testCamera('parking')}
                    disabled={cameraLoading !== null}
                    className="flex-1 px-3 py-2 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 disabled:opacity-50"
                  >
                    {cameraLoading === 'parking' ? "停車場擷取中..." : "測試停車場"}
                  </button>
                </div>
              </div>

              {cameraPreview && (
                <div className="p-4 rounded-xl border bg-white">
                  <div className="font-bold text-gray-800 mb-2 flex items-center justify-between">
                    <span>預覽：{cameraPreview.name === 'entrance' ? '入口(車牌)' : '停車場內(ROI)'}</span>
                    <button
                      onClick={() => setCameraPreview(null)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      關閉
                    </button>
                  </div>

                  {/* ROI Editor only for parking camera */}
                  {cameraPreview.name === 'parking' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-gray-800">
                          ROI 框選（停車場相機）
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600">選擇車位：</span>
                          <select
                            value={roiSpotId}
                            onChange={(e) => setRoiSpotId(e.target.value as any)}
                            className="text-sm px-2 py-1 rounded border bg-white"
                          >
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                          </select>
                          <button
                            onClick={() => {
                              const roi = getCurrentRoiFromConfig();
                              if (!roi) {
                                setHwError(`找不到車位 ${roiSpotId} 的 ROI，請直接在圖片上拖曳框選`);
                                return;
                              }
                              setHwSuccess(`目前車位 ${roiSpotId} ROI：x=${roi.x}, y=${roi.y}, w=${roi.w}, h=${roi.h}`);
                            }}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 flex items-center gap-1"
                          >
                            <RefreshCw size={14} />
                            顯示數值
                          </button>
                        </div>
                      </div>

                      <div className="relative w-full rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                        <img
                          ref={imgRef}
                          src={cameraPreview.image}
                          alt="parking camera preview"
                          className="w-full object-contain"
                          onLoad={() => redrawOverlay()}
                        />
                        <canvas
                          ref={overlayRef}
                          className="absolute inset-0"
                          onMouseDown={onOverlayMouseDown}
                          onMouseMove={onOverlayMouseMove}
                          onMouseUp={onOverlayMouseUp}
                          onMouseLeave={onOverlayMouseUp}
                        />
                      </div>

                      <div className="text-xs text-gray-600">
                        操作方式：先選擇車位 → 在圖片上「按住拖曳」框選要辨識的區域 → 會自動寫入 JSON（尚未儲存）→ 按「儲存套用」才會寫回後端檔案。
                      </div>
                    </div>
                  ) : (
                    <img
                      src={cameraPreview.image}
                      alt="camera preview"
                      className="w-full rounded-lg border border-gray-200 object-contain bg-gray-50"
                    />
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    若相機對應錯誤，請修改設定檔中的 <span className="font-mono">cameras.entrance.device</span> / <span className="font-mono">cameras.parking.device</span>。
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- [修改處] 系統重置區塊 (移到最下方) --- */}
        <div className="bg-white p-6 rounded-xl shadow-sm lg:col-span-2 border-t-4 border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
             <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
                  <Settings size={20} /> 系統管理 (Danger Zone)
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                   此區域操作將會影響整個系統的資料狀態，請謹慎使用。
                </p>
             </div>
             
             <button 
               onClick={handleReset}
               className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors border border-red-200 shadow-sm"
             >
               <RotateCcw size={18} />
               <span className="font-bold">重置資料</span>
             </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AdminView;