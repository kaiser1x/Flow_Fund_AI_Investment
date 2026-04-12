import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MarketAnalysis from './pages/MarketAnalysis';
import ProfilePage from './pages/ProfilePage';
import AlertSettingsPage from './pages/AlertSettingsPage';
import InvestmentReadinessPage from './pages/InvestmentReadinessPage';
import GoalsPage from './pages/GoalsPage';
import SimulationsPage from './pages/SimulationsPage';
import AdminSimulationPage from './pages/AdminSimulationPage';
import { scheduleSessionExpiry } from './utils/session';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const token = localStorage.getItem('token');
  if (token) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  useEffect(() => {
    scheduleSessionExpiry();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/market"
        element={
          <ProtectedRoute>
            <MarketAnalysis />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/alerts"
        element={
          <ProtectedRoute>
            <AlertSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/investment-readiness"
        element={
          <ProtectedRoute>
            <InvestmentReadinessPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/goals"
        element={
          <ProtectedRoute>
            <GoalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/simulations"
        element={
          <ProtectedRoute>
            <SimulationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/sim"
        element={
          <ProtectedRoute>
            <AdminSimulationPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
