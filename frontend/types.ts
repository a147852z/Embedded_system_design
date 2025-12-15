export enum SpotStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED', // Yellow in PDF
  ABNORMAL = 'ABNORMAL', // Red Lightning in PDF
}

export interface ParkingSpot {
  id: string; // e.g., "A-01"
  label: string; // Display number
  status: SpotStatus;
  // isEv and isPriority removed — no longer tracked on frontend
  distanceRaw: number; // For sorting
  floor: number;
  section: string;
  plateNumber?: string; // If occupied
  parkedTime?: Date;
  abnormalReason?: string; // e.g., "Parking over line"
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'ENTRY' | 'EXIT' | 'ABNORMAL' | 'SYSTEM';
  message: string;
  plateNumber?: string;
  spotId?: string;
}

export interface RouteInfo {
  start: string;
  steps: string[];
  end: string;
}