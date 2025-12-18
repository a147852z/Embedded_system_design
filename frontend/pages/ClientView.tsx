import React, { useState, useRef } from 'react';
import { ScanLine, Check, RotateCcw } from 'lucide-react';
import ParkingMap from '../components/ParkingMap';
import { Header, StatusBadge } from '../components/Shared';
import { recognizeLicensePlate } from '../services/VLMService';
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
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [navigationSpot, setNavigationSpot] = useState<ParkingSpot | null>(null);
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

  const handleCaptureAndRecognize = async () => {
    setScanning(true);
    setPlate(null);
    setCapturedImage(null);
    setIsConfirmed(false);
    setSelectedSpot(null);

    try {
      // 1. Get snapshot from backend camera
      const imageBase64 = await api.getCameraSnapshot();
      setCapturedImage(imageBase64);

      // 2. Recognize plate from the snapshot
      const recognizedPlate = await recognizeLicensePlate(imageBase64);
      
      if (recognizedPlate === 'UNKNOWN') {
        alert("無法辨識車牌，請重新掃描一次");
        setPlate(null);
      } else {
        setPlate(recognizedPlate);
      }
    } catch (error) {
      console.error("Capture failed:", error);
      alert("無法連接攝影機或辨識失敗");
    } finally {
      setScanning(false);
    }
  };

  const handleRescan = () => {
    setPlate(null);
    setCapturedImage(null);
    setIsConfirmed(false);
    // Instead of file input, trigger capture again
    handleCaptureAndRecognize();
  };

  const handleConfirmPlate = () => {
    setIsConfirmed(true);
  };

  const handleFinishNavigation = () => {
    setNavigationSpot(null);
    setCapturedImage(null); // Clear image when done
  };

  const handleConfirmParking = async () => {
    if (selectedSpot && plate && isConfirmed) {
      try {
        // API Call
        await api.occupySpot(selectedSpot.id, plate);
        
        // Set navigation target
        setNavigationSpot(selectedSpot);
        
        // Reset local UI state
        setPlate(null);
        setIsConfirmed(false);
        setSelectedSpot(null);
        // Note: capturedImage is kept until navigation is finished or new scan
        
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
             onClick={handleCaptureAndRecognize}
             className="flex flex-col items-center justify-center text-park-primary active:opacity-50"
           >
             <ScanLine className="w-8 h-8 mb-1"/>
             <span className="text-xs font-bold">掃描車牌</span>
           </button>
           {/* Hidden file input removed as we use camera API now */}
        </div>
      </div>

      {/* License Plate Recognition & Confirmation Modal */}
      {(scanning || plate) && (
        <div className="mx-4 mb-4 bg-white rounded-lg p-4 shadow-lg border border-blue-100 animate-in fade-in slide-in-from-top-4">
           {scanning ? (
             <div className="flex items-center justify-center gap-3 text-blue-600 py-4">
               <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
               <span className="font-bold">AI 辨識車牌中</span>
             </div>
           ) : (
             <div className="text-center">
                {!isConfirmed ? (
                  <>
                    <p className="text-sm text-gray-500 mb-2">辨識結果 (請確認)</p>
                    
                    {/* Display Captured Image */}
                    {capturedImage && (
                      <div className="mb-4 flex justify-center">
                        <img 
                          src={capturedImage} 
                          alt="Captured Plate" 
                          className="max-h-48 rounded-lg border-2 border-gray-200 shadow-md object-contain"
                        />
                      </div>
                    )}

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

      {/* Navigation Modal */}
      {navigationSpot && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-2">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">車位已確認！</h2>
              <p className="text-gray-600 text-lg">
                請依照路線前往 <span className="font-bold text-blue-600 text-xl">{navigationSpot.label}</span>
              </p>
            </div>
            
            <div className="transform scale-95">
              <ParkingMap 
                spots={spots} 
                onSelectSpot={() => {}} 
                navigationTargetId={navigationSpot.id}
              />
            </div>

            <button
              onClick={handleFinishNavigation}
              className="w-full py-4 bg-blue-600 text-white text-xl font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg active:scale-95"
            >
              完成導航
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientView;