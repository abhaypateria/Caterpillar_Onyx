import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MACHINES, OPERATORS } from '../engine';
import { LANG_LABEL } from '../i18n';
import { useStore } from '../store';
import type { Lang } from '../types';
import { term } from '../i18n/term';

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { login, setMachine, machineId } = useStore();
  const [lang, setLang] = useState<Lang>('en');
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="display" style={{ fontSize: 64, color: 'var(--cat)', marginTop: 24 }}>ONYX</h1>
      <p className="muted">{t('app.tagline')}</p>
      <div className="row" style={{ margin: '16px 0' }}>
        {(Object.keys(LANG_LABEL) as Lang[]).map((l) => (
          <button key={l} className={l === lang ? '' : 'ghost'} onClick={() => setLang(l)}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <label className="row">{t('login.machine')}
        <select value={machineId} onChange={(e) => setMachine(e.target.value)}>
          {MACHINES.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.model}</option>)}
        </select>
      </label>
      <h2 style={{ marginTop: 24 }}>{t('login.title')}</h2>
      <div className="grid">
        {OPERATORS.map((o) => (
          <button key={o.id} className="ghost" style={{ height: 96, textAlign: 'left' }}
            onClick={() => { login(o.id, lang); nav('/dashboard'); }}>
            <div style={{ fontSize: 22 }}>{o.name}</div>
            <div className="muted">{o.id} · {term(t, 'skill', o.skill)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
