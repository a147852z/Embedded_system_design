import React from 'react';
import { ParkingSpot, SpotStatus } from '../types';
import { Car, AlertTriangle, CheckCircle, ArrowDown, ArrowUp } from 'lucide-react';

interface ParkingMapProps {
  spots: ParkingSpot[];
  onSelectSpot: (spot: ParkingSpot) => void;
  selectedSpotId?: string;
  navigationTargetId?: string;
}

const ParkingMap: React.FC<ParkingMapProps> = ({ spots, onSelectSpot, selectedSpotId, navigationTargetId }) => {
  // Layout: 4 Spots in a row at the top.
  // Visual Order (Left to Right): 4, 3, 2, 1.
  // Data Order: 1 (Index 0), 2, 3, 4.
  // CSS `flex-row-reverse` will achieve the [4][3][2][1] visual layout.

  // Helper to get X position percentage for a spot index (0-based from data array)
  // Index 0 (Spot 1) is rightmost (~88%)
  // Index 3 (Spot 4) is leftmost (~12%)
  const getSpotXPercent = (index: number) => {
    // Total 4 spots.
    // 0 -> 88
    // 1 -> 63
    // 2 -> 38
    // 3 -> 13
    return 88 - (index * 25);
  };

  const renderRouteOverlay = () => {
    if (!navigationTargetId) return null;

    const targetIndex = spots.findIndex(s => s.id === navigationTargetId);
    if (targetIndex === -1) return null;

    const targetX = getSpotXPercent(targetIndex);
    const startX = 90; // Entry X
    const startY = 90; // Entry Y (bottom area)
    const laneY = 60;  // Driving lane Y
    const spotY = 25;  // Spot center Y

    // Path: Start -> Up to Lane -> Left/Right to Spot X -> Up to Spot
    const pathData = `
      M ${startX} ${startY}
      L ${startX} ${laneY}
      L ${targetX} ${laneY}
      L ${targetX} ${spotY}
    `;

    return (
      <div className="absolute inset-0 pointer-events-none z-30">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
              <polygon points="0 0, 4 2, 0 4" fill="#3b82f6" />
            </marker>
          </defs>
          {/* Glow effect */}
          <path d={pathData} fill="none" stroke="#60a5fa" strokeWidth="2" strokeOpacity="0.5" />
          {/* Main path */}
          <path 
            d={pathData} 
            fill="none" 
            stroke="#2563eb" 
            strokeWidth="1" 
            strokeDasharray="2 2"
            markerEnd="url(#arrowhead)"
            className="animate-dash"
          />
          {/* Start point dot */}
          <circle cx={startX} cy={startY} r="1.5" fill="#2563eb" />
        </svg>
        <style>{`
          @keyframes dash {
            to {
              stroke-dashoffset: -20;
            }
          }
          .animate-dash {
            animation: dash 1s linear infinite;
          }
        `}</style>
      </div>
    );
  };

  const renderSpot = (spot: ParkingSpot) => {
    let bgColor = 'bg-white';
    let borderColor = 'border-gray-400';
    let icon = null;

    if (selectedSpotId === spot.id) {
      borderColor = 'border-blue-600 ring-4 ring-blue-300 z-10';
    }

    switch (spot.status) {
      case SpotStatus.OCCUPIED:
        bgColor = 'bg-yellow-400'; // PDF: Occupied is Yellow X
        // --- 修改重點開始：將 Icon 包裝成包含車牌的結構 ---
        icon = (
          <div className="flex flex-col items-center justify-center w-full">
            <Car className="w-8 h-8 text-gray-800" />
            {/* 車牌顯示區域 */}
            <div className="mt-1 px-1.5 py-0.5 bg-white/40 rounded text-[11px] font-mono font-black tracking-tighter leading-tight text-gray-900 max-w-[90%] overflow-hidden text-ellipsis whitespace-nowrap shadow-sm border border-black/10">
              {spot.plateNumber || '車牌辨識中'}
            </div>
          </div>
        );
        // --- 修改重點結束 ---
        break;
      case SpotStatus.ABNORMAL:
        bgColor = 'bg-red-500 animate-pulse'; // PDF: Abnormal is Red/Lightning
        icon = <AlertTriangle className="w-8 h-8 text-white" />;
        break;
      // RESERVED removed — treat as AVAILABLE by default (no special icon)
      case SpotStatus.AVAILABLE:
      default:
        bgColor = 'bg-green-50';
        break;
    }

    // Extract just the number from "A-1" -> "1"
    const displayNumber = spot.label.split('-')[1] || spot.label;

    return (
      <button
        key={spot.id}
        onClick={() => onSelectSpot(spot)}
        className={`relative flex-1 h-full rounded-lg border-4 ${borderColor} ${bgColor} flex flex-col items-center justify-center transition-all shadow-md active:scale-95`}
      >
        <span className="absolute top-2 left-2 text-2xl font-black text-gray-500/30 select-none">
            {displayNumber}
        </span>
        
        {/* 這裡會渲染我們上面定義的 icon (包含車牌) */}
        {icon}

        {spot.status === SpotStatus.AVAILABLE && selectedSpotId === spot.id && (
           <CheckCircle className="absolute bottom-1 right-2 w-6 h-6 text-blue-600" />
        )}
      </button>
    );
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-gray-600 rounded-3xl shadow-2xl relative border-8 border-gray-700 aspect-[5/4] flex flex-col p-[4%]">
      
      {/* Top Row: Spots 4-3-2-1 */}
      {/* flex-row-reverse makes [1,2,3,4] render as [4][3][2][1] */}
      <div className="flex flex-row-reverse gap-[2%] h-[45%] w-full z-10">
        {spots.map(renderSpot)}
      </div>

      {/* Spacer for Gap */}
      <div className="h-[11%] w-full"></div>

      {/* Driveway Area */}
      <div className="relative h-[39%] w-full">
         
         {/* Exit Label & Arrow (Left Bottom) */}
         <div className="absolute bottom-[10%] left-[10%] flex flex-col items-center">
            {/* Exit arrow above gate */}
            <div className="absolute left-0 -top-[200%] flex flex-col items-center">
              <ArrowDown className="w-8 h-8 md:w-10 md:h-10 text-white animate-bounce" strokeWidth={4} />
            </div>
         </div>

         {/* Entrance Label & Arrow (Right Bottom) */}
         <div className="absolute bottom-[10%] right-[10%] flex flex-col items-center">
            {/* Entry arrow above gate */}
            <div className="absolute right-0 -top-[200%] flex flex-col items-center">
              <ArrowUp className="w-8 h-8 md:w-10 md:h-10 text-white animate-bounce" strokeWidth={4} />
            </div>
         </div>
      </div>

      {/* EXIT / ENTRY labels */}
      <div className="absolute bottom-[-4%] left-[6%] z-20">
        <div className="flex items-center gap-2 bg-gray-800/90 p-1.5 rounded-full border border-gray-500 shadow-lg">
          <span className="text-white font-bold px-2 text-[10px] md:text-xs tracking-widest whitespace-nowrap">出口 EXIT</span>
        </div>
      </div>

      <div className="absolute bottom-[-4%] right-[6%] z-20">
        <div className="flex items-center gap-2 bg-gray-800/90 p-1.5 rounded-full border border-gray-500 shadow-lg">
          <span className="text-white font-bold px-2 text-[10px] md:text-xs tracking-widest whitespace-nowrap">入口 ENTRY</span>
        </div>
      </div>

      {/* Bottom Gate/Structure (Center) */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-[40%] h-[8%] bg-gray-800 border-4 border-gray-600 rounded-lg flex items-center justify-center shadow-xl z-10">
          <div className="w-full h-1 bg-yellow-500/50 mx-2 rounded-full"></div>
      </div>

      {renderRouteOverlay()}
    </div>
  );
};

export default ParkingMap;