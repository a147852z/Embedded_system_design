import React, { useState, useRef } from 'react';
import { ScanLine, Check, RotateCcw } from 'lucide-react';
import ParkingMap from '../components/ParkingMap';
import { Header, StatusBadge } from '../components/Shared';
import { recognizeLicensePlate } from '../services/geminiService';
import { ParkingSpot, SpotStatus } from '../types';
import { api } from '../services/api';

interface ClientViewProps {
  spots: ParkingSpot[];
  onRefresh: () => void;
}

const ClientView: React.FC<ClientViewProps> = ({ spots, onRefresh }) => {
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [scanning, setScanning] = useState(false);
  const [plate, setPlate] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter available spots count
  const availableCount = spots.filter(s => s.status === SpotStatus.AVAILABLE).length;

  const handleSpotClick = (spot: ParkingSpot) => {
    if (plate && !isConfirmed) {
      alert("請先確認您的車牌號碼是否正確。");
      return;
    }
    setSelectedSpot(spot);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setScanning(true);
      setPlate(null);
      setIsConfirmed(false);
      setSelectedSpot(null);
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        const recognizedPlate = await recognizeLicensePlate(base64String);
        setPlate(recognizedPlate);
        setScanning(false);
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  };

  const handleRescan = () => {
    setPlate(null);
    setIsConfirmed(false);
    fileInputRef.current?.click();
  };

  const handleConfirmPlate = () => {
    setIsConfirmed(true);
  };

  const handleConfirmParking = async () => {
    if (selectedSpot && plate && isConfirmed) {
      try {
        // API Call
        await api.occupySpot(selectedSpot.id, plate);
        
        alert("車輛已確認進場！導引路線已生成。");
        
        // Reset local UI state
        setPlate(null);
        setIsConfirmed(false);
        setSelectedSpot(null);
        
        // Refresh data from backend
        onRefresh();
      } catch (e) {
        alert("停車失敗，請稍後再試");
      }
    }
  };

  return (
    <div className="pb-24 min-h-screen bg-park-bg">
      <Header title="AI-Park" subtitle="智能停車引導系統 (Client)" />

      {/* Stats Bar */}
      <div className="bg-white p-4 shadow-sm flex justify-around text-center mb-4">
        <div>
          <span className="block text-2xl font-bold text-green-600">{availableCount}</span>
          <span className="text-xs text-gray-500">剩餘車位</span>
        </div>
        <div>
          <span className="block text-2xl font-bold text-blue-600">{spots.length}</span>
          <span className="text-xs text-gray-500">總車位</span>
        </div>
        <div>
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="flex flex-col items-center justify-center text-park-primary active:opacity-50"
           >
             <ScanLine className="w-8 h-8 mb-1"/>
             <span className="text-xs font-bold">掃描車牌</span>
           </button>
           <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
        </div>
      </div>

      {/* License Plate Recognition & Confirmation Modal */}
      {(scanning || plate) && (
        <div className="mx-4 mb-4 bg-white rounded-lg p-4 shadow-lg border border-blue-100 animate-in fade-in slide-in-from-top-4">
           {scanning ? (
             <div className="flex items-center justify-center gap-3 text-blue-600 py-4">
               <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
               <span className="font-bold">AI 辨識車牌中 (Gemini 2.5 Flash)...</span>
             </div>
           ) : (
             <div className="text-center">
                {!isConfirmed ? (
                  <>
                    <p className="text-sm text-gray-500 mb-2">辨識結果 (請確認)</p>
                    <div className="text-4xl font-mono font-black text-gray-800 bg-gray-50 p-4 rounded-xl border-2 border-gray-200 inline-block mb-4 shadow-inner tracking-widest">
                      {plate}
                    </div>
                    
                    <div className="flex gap-3 justify-center">
                      <button 
                        onClick={handleRescan}
                        className="flex-1 max-w-[140px] flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                      >
                        <RotateCcw size={18} />
                        重新掃描
                      </button>
                      <button 
                        onClick={handleConfirmPlate}
                        className="flex-1 max-w-[140px] flex items-center justify-center gap-2 bg-park-primary text-white py-2.5 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-md"
                      >
                        <Check size={18} />
                        確認正確
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 text-green-600 font-bold mb-2">
                       <Check size={20} className="border-2 border-green-600 rounded-full p-0.5" />
                       <span>車牌已確認: {plate}</span>
                    </div>
                    <p className="text-gray-800 font-bold text-lg animate-pulse">
                      👇 請點擊下方地圖選擇您的車位
                    </p>
                    
                    {selectedSpot && selectedSpot.status === SpotStatus.AVAILABLE && (
                      <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-bottom-2">
                        <button 
                          onClick={handleConfirmParking}
                          className="w-full bg-park-secondary text-white py-3 rounded-xl font-bold hover:bg-blue-600 shadow-lg text-lg"
                        >
                          確認停入 {selectedSpot.label}
                        </button>
                      </div>
                    )}
                  </>
                )}
             </div>
           )}
        </div>
      )}

      {/* Main Map */}
      <div className="px-2">
        <ParkingMap spots={spots} onSelectSpot={handleSpotClick} selectedSpotId={selectedSpot?.id} />
      </div>

      {/* Persistent Bottom Sheet */}
      {selectedSpot && !plate && (
        <div className="fixed bottom-0 left-0 w-full bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl z-40 p-5 transform transition-transform duration-300">
          <div className="flex justify-between items-start mb-4">
            <div>
               <h3 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                 車位 {selectedSpot.label}
               </h3>
               <p className="text-gray-500 text-sm">
                 距離入口約 {selectedSpot.distanceRaw} 公尺
               </p>
            </div>
            <StatusBadge status={selectedSpot.status} />
          </div>
          <button 
            onClick={() => setSelectedSpot(null)}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-300"
          >
            關閉
          </button>
        </div>
      )}
    </div>
  );
};

export default ClientView;