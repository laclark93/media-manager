import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header/Header';
import { Shows } from './pages/Shows';
import { Movies } from './pages/Movies';
import { Issues } from './pages/Issues';
import { Anime } from './pages/Anime';
import { Settings } from './pages/Settings';
import { Log } from './pages/Log';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { ActivityLogContext, useActivityLogState } from './hooks/useActivityLog';
import { AuthContext, useAuthState } from './hooks/useAuth';
import './App.css';

function ProtectedApp() {
  const activityLog = useActivityLogState();
  return (
    <ActivityLogContext.Provider value={activityLog}>
      <Header />
      <div className="app-content">
        <Routes>
          <Route path="/shows" element={<Shows />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/anime" element={<Anime />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/log" element={<Log />} />
          <Route path="/" element={<Navigate to="/shows" replace />} />
        </Routes>
      </div>
    </ActivityLogContext.Provider>
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
          auth.configured ? <Navigate to="/shows" replace /> : <Setup />
        } />
        <Route path="/login" element={
          (auth.configured && auth.token) ? <Navigate to="/shows" replace /> : <Login />
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
