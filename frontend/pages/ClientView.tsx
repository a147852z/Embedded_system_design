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
    const startTime = Date.now();
    console.log('[前端] 開始掃描車牌流程', new Date().toISOString());
    
    setScanning(true);
    setPlate(null);
    setCapturedImage(null);
    setIsConfirmed(false);
    setSelectedSpot(null);

    try {
      // 1. Get snapshot from backend camera
      const snapshotStartTime = Date.now();
      console.log('[前端] 發送相機快照請求...');
      const imageBase64 = await api.getCameraSnapshot();
      const snapshotTime = Date.now() - snapshotStartTime;
      console.log(`[前端] 相機快照完成，耗時: ${snapshotTime}ms`);
      setCapturedImage(imageBase64);

      // 2. Recognize plate from the snapshot
      const recognizeStartTime = Date.now();
      console.log('[前端] 發送車牌識別請求到後端...');
      const recognizedPlate = await recognizeLicensePlate(imageBase64);
      const recognizeTime = Date.now() - recognizeStartTime;
      console.log(`[前端] 車牌識別完成，耗時: ${recognizeTime}ms，結果: ${recognizedPlate}`);
      
      const totalTime = Date.now() - startTime;
      console.log(`[前端] 總流程耗時: ${totalTime}ms`);
      
      if (recognizedPlate === 'UNKNOWN') {
        alert("無法辨識車牌，請重新掃描一次");
        setPlate(null);
      } else {
        setPlate(recognizedPlate);
      }
    } catch (error) {
      console.error("[前端] 掃描失敗:", error);
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

      {/* Stats Bar - 優化後的統計欄 */}
      <div className="bg-white mx-4 mt-4 rounded-2xl shadow-md overflow-hidden">
        <div className="grid grid-cols-3 gap-4 p-4">
          <div className="text-center">
            <span className="block text-3xl font-bold text-green-600 mb-1">{availableCount}</span>
            <span className="text-xs text-gray-600 font-medium">剩餘車位</span>
          </div>
          <div className="text-center border-x border-gray-100">
            <span className="block text-3xl font-bold text-blue-600 mb-1">{spots.length}</span>
            <span className="text-xs text-gray-600 font-medium">總車位</span>
          </div>
          <div className="text-center">
            <button 
              onClick={handleCaptureAndRecognize}
              disabled={scanning}
              className="w-full flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl bg-gradient-to-br from-park-primary to-park-secondary text-white hover:from-blue-700 hover:to-blue-500 active:scale-95 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ScanLine className="w-6 h-6"/>
              <span className="text-xs font-bold">掃描車牌</span>
            </button>
          </div>
        </div>
      </div>

      {/* License Plate Recognition & Confirmation Modal - 優化後的車牌識別卡片 */}
      {(scanning || plate) && (
        <div className="mx-4 mt-4 mb-4 bg-white rounded-2xl p-5 shadow-lg border border-gray-100 animate-in fade-in slide-in-from-top-4">
           {scanning ? (
             <div className="flex flex-col items-center justify-center gap-4 py-6">
               <div className="w-12 h-12 border-4 border-park-primary border-t-transparent rounded-full animate-spin"></div>
               <div className="text-center">
                 <span className="block text-lg font-bold text-gray-800 mb-1">AI 辨識車牌中</span>
                 <span className="text-sm text-gray-500">請稍候...</span>
               </div>
             </div>
           ) : (
             <div className="space-y-4">
                {!isConfirmed ? (
                  <>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-3 font-medium">辨識結果 (請確認)</p>
                      
                      {/* Display Captured Image */}
                      {capturedImage && (
                        <div className="mb-4 flex justify-center">
                          <div className="relative rounded-xl overflow-hidden border-2 border-gray-200 shadow-lg">
                            <img 
                              src={capturedImage} 
                              alt="Captured Plate" 
                              className="max-h-48 object-contain bg-gray-50"
                            />
                          </div>
                        </div>
                      )}

                      <div className="inline-block mb-4">
                        <div className="text-5xl font-mono font-black text-gray-900 bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-2xl border-2 border-gray-300 shadow-inner tracking-widest">
                          {plate}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3">
                      <button 
                        onClick={handleRescan}
                        className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 active:scale-95 transition-all"
                      >
                        <RotateCcw size={18} />
                        重新掃描
                      </button>
                      <button 
                        onClick={handleConfirmPlate}
                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-park-primary to-park-secondary text-white py-3 rounded-xl font-bold hover:from-blue-700 hover:to-blue-500 shadow-md active:scale-95 transition-all"
                      >
                        <Check size={18} />
                        確認正確
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 text-green-600 font-bold mb-3 p-3 bg-green-50 rounded-xl">
                       <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                         <Check size={18} className="text-white" />
                       </div>
                       <span className="text-lg">車牌已確認: <span className="font-mono text-xl">{plate}</span></span>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-gray-800 font-bold text-base mb-1">
                        👇 請點擊下方地圖選擇您的車位
                      </p>
                    </div>
                    
                    {selectedSpot && selectedSpot.status === SpotStatus.AVAILABLE && (
                      <div className="mt-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-bottom-2">
                        <button 
                          onClick={handleConfirmParking}
                          className="w-full bg-gradient-to-r from-park-secondary to-park-primary text-white py-4 rounded-xl font-bold hover:from-blue-500 hover:to-blue-700 shadow-lg text-lg active:scale-95 transition-all"
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
      <div className="px-4 mt-2">
        <ParkingMap spots={spots} onSelectSpot={handleSpotClick} selectedSpotId={selectedSpot?.id} />
      </div>

      {/* Persistent Bottom Sheet - 優化後的底部卡片 */}
      {selectedSpot && !plate && (
        <div className="fixed bottom-0 left-0 w-full bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] rounded-t-3xl z-40 transform transition-transform duration-300">
          <div className="p-5">
            {/* Handle bar */}
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>
            
            <div className="flex justify-between items-start mb-5">
              <div className="flex-1">
                 <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                   車位 {selectedSpot.label}
                 </h3>
                 <div className="flex items-center gap-2 text-gray-600">
                   <span className="text-sm">📍 距離入口約</span>
                   <span className="text-base font-bold text-park-primary">{selectedSpot.distanceRaw} 公尺</span>
                 </div>
              </div>
              <StatusBadge status={selectedSpot.status} />
            </div>
            <button 
              onClick={() => setSelectedSpot(null)}
              className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-bold hover:bg-gray-200 active:scale-95 transition-all"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {/* Navigation Modal - 優化後的導航模態框 */}
      {navigationSpot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl p-5 md:p-6 space-y-5 md:space-y-6 shadow-2xl my-auto">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-2 shadow-lg">
                <Check className="w-8 h-8 md:w-10 md:h-10 text-white" strokeWidth={3} />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">車位已確認！</h2>
              <p className="text-gray-600 text-base md:text-lg">
                請依照路線前往 
                <span className="font-bold text-park-primary text-lg md:text-xl ml-1">{navigationSpot.label}</span>
              </p>
            </div>
            
            <div className="w-full rounded-2xl overflow-hidden border-2 border-gray-200 shadow-inner">
              <ParkingMap 
                spots={spots} 
                onSelectSpot={() => {}} 
                navigationTargetId={navigationSpot.id}
              />
            </div>

            <button
              onClick={handleFinishNavigation}
              className="w-full py-4 md:py-5 bg-gradient-to-r from-park-secondary to-park-primary text-white text-lg md:text-xl font-bold rounded-xl hover:from-blue-500 hover:to-blue-700 transition-all shadow-lg active:scale-95"
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