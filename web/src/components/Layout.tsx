import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { OPERATORS } from '../engine';
import { LANG_LABEL } from '../i18n';
import type { Lang } from '../types';
import AlertBanner from './AlertBanner';
import VoiceButton from './VoiceButton';
import SafetyMonitor from './a/SafetyMonitor';
import './layout.css';

const NAV = ['dashboard', 'safety', 'replay', 'insights', 'training', 'summary', 'supervisor'] as const;

export default function Layout() {
  const { t } = useTranslation();
  const { operatorId, machineId, lang, setLang, logout } = useStore();
  const op = OPERATORS.find((o) => o.id === operatorId);
  return (
    <div className="shell">
      <header className="top">
        <span className="display brand">ONYX</span>
        <span className="muted who">{op?.name}<span className="full"> · {operatorId} · {machineId}</span></span>
        <span className="spacer" />
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('login.language')}>
          {Object.entries(LANG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="ghost" onClick={logout}>⏻</button>
      </header>
      <div className="hazard" />
      <AlertBanner />
      <nav className="nav">
        {NAV.map((n) => <NavLink key={n} to={`/${n}`}>{t(`nav.${n}`)}</NavLink>)}
      </nav>
      <main className="page"><Outlet /></main>
      <VoiceButton />
      <SafetyMonitor />
    </div>
  );
}
