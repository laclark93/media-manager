import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header/Header';
import { Shows } from './pages/Shows';
import { Movies } from './pages/Movies';
import { Issues } from './pages/Issues';
import { Anime } from './pages/Anime';
import { Settings } from './pages/Settings';
import { Log } from './pages/Log';
import { Early } from './pages/Early';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { ActivityLogContext, useActivityLogState } from './hooks/useActivityLog';
import { SearchQueueContext, useSearchQueueState } from './hooks/useSearchQueue';
import { AuthContext, useAuthState } from './hooks/useAuth';
import { BackgroundLoadingContext, createBackgroundLoadingStore, useBackgroundLoading } from './hooks/useBackgroundLoading';
import { useMemo } from 'react';
import './App.css';

function BackgroundSpinner() {
  const loading = useBackgroundLoading();
  if (!loading) return null;
  return <div className="bg-loading-spinner" />;
}

function ProtectedApp() {
  const activityLog = useActivityLogState();
  const searchQueue = useSearchQueueState();
  const bgStore = useMemo(() => createBackgroundLoadingStore(), []);
  return (
    <BackgroundLoadingContext.Provider value={bgStore}>
      <ActivityLogContext.Provider value={activityLog}>
        <SearchQueueContext.Provider value={searchQueue}>
          <Header />
          <div className="app-content">
            <BackgroundSpinner />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/shows" element={<Shows />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/issues" element={<Issues />} />
              <Route path="/anime" element={<Anime />} />
              <Route path="/early" element={<Early />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/log" element={<Log />} />
            </Routes>
          </div>
        </SearchQueueContext.Provider>
      </ActivityLogContext.Provider>
    </BackgroundLoadingContext.Provider>
  );
}

function AppRouter() {
  const auth = useAuthState();

  if (auth.configured === null) {
    return <div className="auth-loading">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/setup" element={
          auth.configured ? <Navigate to="/" replace /> : <Setup />
        } />
        <Route path="/login" element={
          (auth.configured && auth.token) ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/*" element={
          !auth.configured
            ? <Navigate to="/setup" replace />
            : !auth.token
              ? <Navigate to="/login" replace />
              : <ProtectedApp />
        } />
      </Routes>
    </AuthContext.Provider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
