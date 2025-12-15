import React from 'react';
import { LayoutDashboard, Info } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-gray-100">
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

      </div>
    </div>
  );
};

export default AdminView;