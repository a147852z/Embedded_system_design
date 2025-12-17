import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ParkingSpot, SpotStatus, LogEntry } from './types';
import ClientView from './pages/ClientView';
import AdminView from './pages/AdminView';
import AdminLogin, { ADMIN_AUTH_KEY } from './pages/AdminLogin';
import { AbnormalAlertOverlay } from './components/Shared';
import { api } from './services/api';

const App: React.FC = () => {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showAbnormalOverlay, setShowAbnormalOverlay] = useState(false);
  const lastAbnormalKey = useRef('');

  // 簡單的 admin 是否登入檢查
  const isAdminAuthed = () => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ADMIN_AUTH_KEY) === 'true';
  };

  // Fetch latest data from backend
  const refreshData = useCallback(async () => {
    try {
      const [fetchedSpots, fetchedLogs] = await Promise.all([
        api.fetchSpots(),
        api.fetchLogs()
      ]);
      setSpots(fetchedSpots);
      setLogs(fetchedLogs);
    } catch (error) {
      console.error("Failed to fetch data", error);
    }
  }, []);

  // Initial load and Polling (every 5 seconds)
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Monitor abnormalities locally for the Overlay
  useEffect(() => {
    const abnormalSpots = spots.filter(s => s.status === SpotStatus.ABNORMAL);
    // Build a stable key from abnormal spot ids (empty string if none)
    const key = abnormalSpots.map(s => s.id).sort().join(',');

    if (abnormalSpots.length > 0) {
      // Only show overlay when the abnormal set changes (transition to a new abnormal event)
      if (lastAbnormalKey.current !== key) {
        lastAbnormalKey.current = key;
        setShowAbnormalOverlay(true);
      }
    } else {
      // No abnormalities now — clear last key so future abnormalities will re-trigger
      lastAbnormalKey.current = '';
    }
  }, [spots]);

  return (
    <Router>
      <div className="font-sans text-gray-900">
        {/* Global Warning Overlay */}
        {showAbnormalOverlay && (
          <AbnormalAlertOverlay 
            spots={spots} 
            onClose={() => setShowAbnormalOverlay(false)} 
          />
        )}

        <Routes>
          {/* 根路徑一律導向 /client */}
          <Route path="/" element={<Navigate to="/client" replace />} />

          {/* Client View */}
          <Route 
            path="/client" 
            element={
              <ClientView 
                spots={spots} 
                onRefresh={refreshData} 
              />
            } 
          />

          {/* Admin Login */}
          <Route path="/admin/login" element={<AdminLogin />} />
          
          {/* Admin Dashboard，未登入則轉跳到 /admin/login */}
          <Route 
            path="/admin" 
            element={
              isAdminAuthed() ? (
                <AdminView 
                  spots={spots} 
                  logs={logs} 
                  onRefresh={refreshData} 
                />
              ) : (
                <Navigate to="/admin/login" replace />
              )
            } 
          />

          {/* 未知路由也導回 /client，避免 404 */}
          <Route path="*" element={<Navigate to="/client" replace />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;