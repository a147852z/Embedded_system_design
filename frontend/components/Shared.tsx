import React from 'react';
import { XCircle, Siren, AlertOctagon } from 'lucide-react';
import { SpotStatus, ParkingSpot } from '../types';

export const StatusBadge = ({ status }: { status: SpotStatus }) => {
  const styles = {
    [SpotStatus.AVAILABLE]: 'bg-green-100 text-green-800 border-green-200',
    [SpotStatus.OCCUPIED]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [SpotStatus.ABNORMAL]: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
      {status}
    </span>
  );
};

export const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <header className="bg-park-primary text-white p-4 sticky top-0 z-50 shadow-md">
    <div className="container mx-auto flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-xs text-blue-200">{subtitle}</p>}
      </div>
      {/* 原本右上角 Client/Admin 切換按鈕已移除，保留純標題區塊 */}
    </div>
  </header>
);

export const AbnormalAlertOverlay = ({ spots, onClose }: { spots: ParkingSpot[], onClose: () => void }) => {
  const abnormalSpots = spots.filter(s => s.status === SpotStatus.ABNORMAL);
  if (abnormalSpots.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border-4 border-red-500 animate-pulse-fast">
        <div className="bg-red-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <Siren className="animate-spin" />
             <h2 className="text-lg font-bold">異常警報 (Abnormal)</h2>
          </div>
          <button onClick={onClose} className="text-white hover:bg-red-700 rounded-full p-1"><XCircle /></button>
        </div>
        <div className="p-6 text-center">
           <div className="mb-4 flex justify-center">
             <AlertOctagon size={64} className="text-red-500" />
           </div>
           <p className="text-gray-700 mb-2 font-bold text-lg">
             檢測到停車異常！
           </p>
           <ul className="text-left bg-red-50 p-3 rounded mb-4 space-y-2">
             {abnormalSpots.map(s => (
               <li key={s.id} className="text-red-800 flex items-center gap-2 text-sm">
                 <span className="font-mono bg-red-200 px-2 rounded">{s.label}</span>
                 {s.abnormalReason || "Vehicle parked incorrectly or improperly parked."}
               </li>
             ))}
           </ul>
           <p className="text-xs text-gray-500">
             蜂鳴器已啟動。LED 紅燈閃爍中。
           </p>
        </div>
        <div className="bg-gray-100 p-4">
          <button onClick={onClose} className="w-full bg-red-600 text-white py-3 rounded-lg font-bold shadow hover:bg-red-700 active:scale-95 transition-transform">
            確認並關閉警報
          </button>
        </div>
      </div>
    </div>
  );
};
