import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { ParkingSpot, SpotStatus, LogEntry } from './types';
import ClientView from './pages/ClientView';
import AdminView from './pages/AdminView';
import { AbnormalAlertOverlay } from './components/Shared';
import { api } from './services/api';

const App: React.FC = () => {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showAbnormalOverlay, setShowAbnormalOverlay] = useState(false);
  const lastAbnormalKey = useRef('');

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
          {/* User Client View */}
          <Route 
            path="/" 
            element={
              <ClientView 
                spots={spots} 
                onRefresh={refreshData} 
              />
            } 
          />
          
          {/* Admin Dashboard */}
          <Route 
            path="/admin" 
            element={
              <AdminView 
                spots={spots} 
                logs={logs} 
                onRefresh={refreshData} 
              />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
};

export default App;