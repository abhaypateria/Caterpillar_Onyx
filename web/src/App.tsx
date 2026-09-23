import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import i18n from './i18n';
import { useStore } from './store';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Safety from './pages/Safety';
import Replay from './pages/Replay';
import Insights from './pages/Insights';
import Training from './pages/Training';
import Summary from './pages/Summary';
import Supervisor from './pages/Supervisor';

export default function App() {
  const operatorId = useStore((s) => s.operatorId);
  const lang = useStore((s) => s.lang);
  useEffect(() => { i18n.changeLanguage(lang); }, [lang]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={operatorId ? <Layout /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/replay" element={<Replay />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/training" element={<Training />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/supervisor" element={<Supervisor />} />
        </Route>
        <Route path="*" element={<Navigate to={operatorId ? '/dashboard' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
}
