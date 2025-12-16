import React from 'react';
import { LayoutDashboard, Info, RotateCcw, Settings } from 'lucide-react'; // 引入 RotateCcw 和 Settings
import { Header, StatusBadge } from '../components/Shared';
import { ParkingSpot, SpotStatus, LogEntry } from '../types';
import { api } from '../services/api';

interface AdminViewProps {
  spots: ParkingSpot[];
  logs: LogEntry[];
  onRefresh: () => void;
}

const AdminView: React.FC<AdminViewProps> = ({ spots, logs, onRefresh }) => {
  
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