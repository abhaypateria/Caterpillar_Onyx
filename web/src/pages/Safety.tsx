import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { breakDue, heatIndex, wbgt, weatherFromCode, type Ground, type Light } from '../engine';
import { fetchWeather } from '../api/client';
import type { IncidentType, Severity, Weather } from '../types';
import Proximity from '../components/a/Proximity';
import '../components/a/a.css';
import { term } from '../i18n/term';

export default function Safety() {
  const { t } = useTranslation();
  const { machine, setMachineState, conditions, setConditions, incidents, addIncident, operatorId, machineId, clearAlert } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [weatherNote, setWeatherNote] = useState('');
  const [form, setForm] = useState<{ type: IncidentType; severity: Severity; description: string }>({ type: 'near_miss', severity: 'medium', description: '' });
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const toggleEngine = () => setMachineState({ engineOn: !machine.engineOn, unbeltedSince: !machine.belted && !machine.engineOn ? Date.now() : machine.unbeltedSince });
  const toggleBelt = () => setMachineState({ belted: !machine.belted, unbeltedSince: machine.belted ? Date.now() : null });

  const continuous = machine.engineOn ? (now - machine.lastBreak) / 60000 : 0;
  const b = breakDue(conditions.tempC, conditions.humidity, continuous);
  const w = wbgt(conditions.tempC, conditions.humidity);

  async function loadWeather() {
    setWeatherNote('…');
    const cur = await fetchWeather();
    if (!cur) { setWeatherNote(t('safety.weatherOffline')); return; }
    setConditions({ tempC: Math.round(cur.temperature_2m), humidity: Math.round(cur.relative_humidity_2m),
      weather: weatherFromCode(cur.weather_code, cur.wind_speed_10m), light: cur.is_day ? 'Day' : 'Night' });
    setWeatherNote(t('safety.weatherLive'));
  }

  const beltBad = machine.engineOn && !machine.belted;
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section className="grid">
        <div className="card">
          <h3>{t('safety.machine')}</h3>
          <div className="statusgrid">
            <button className={`bigtoggle ${machine.engineOn ? 'okstate' : 'offstate'}`} onClick={toggleEngine}>
              <span style={{ fontSize: 30 }}>⚙</span>{t('safety.engine')}: {machine.engineOn ? t('safety.on') : t('safety.off')}
            </button>
            <button className={`bigtoggle ${beltBad ? 'stopstate' : machine.belted ? 'okstate' : 'offstate'}`} onClick={toggleBelt}>
              <span style={{ fontSize: 30 }}>{machine.belted ? '🔒' : '🔓'}</span>{t('safety.seatbelt')}: {machine.belted ? t('safety.fastened') : t('safety.unfastened')}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{t('safety.interlockNote')}</p>
          <h3 style={{ marginTop: 16 }}>{t('safety.breakTitle')}</h3>
          <div className={`pill ${b.due ? 'warn' : 'ok'}`} style={{ fontSize: 16 }}>
            {b.due ? t('safety.breakNow') : t('safety.breakIn', { min: Math.max(0, Math.round(b.limitMin - continuous)) })}
          </div>
          <p className="muted mono" style={{ fontSize: 13 }}>
            WBGT ≈ {w.toFixed(1)}°C · {t(`heat.${b.level}`)} · {b.workMin}/{b.restMin} {t('safety.workRest')} · {t('safety.continuous')} {Math.round(continuous)} {t('common.minutes')}
          </p>
          <div className="row">
            <button className="ghost" onClick={() => { setMachineState({ lastBreak: Date.now() }); clearAlert('safety.breakNow'); }}>☕ {t('safety.tookBreak')}</button>
            <button className="ghost" onClick={() => setMachineState({ lastBreak: machine.lastBreak - 30 * 60000 })}>⏩ +30 {t('common.minutes')}</button>
          </div>
        </div>

        <Proximity />

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{t('safety.conditions')}</h3>
            <button className="ghost" onClick={loadWeather}>⟳ {t('safety.liveWeather')}</button>
          </div>
          {weatherNote && <p className="muted" style={{ fontSize: 13 }}>{weatherNote}</p>}
          <div className="fields" style={{ marginTop: 12 }}>
            <label className="field">{t('safety.weather')}
              <select value={conditions.weather} onChange={(e) => setConditions({ weather: e.target.value as Weather })}>
                {['Sunny', 'Cloudy', 'Windy', 'Rainy'].map((x) => <option key={x} value={x}>{term(t, 'weather', x)}</option>)}
              </select></label>
            <label className="field">°C<input type="number" value={conditions.tempC} onChange={(e) => setConditions({ tempC: +e.target.value })} /></label>
            <label className="field">RH %<input type="number" value={conditions.humidity} onChange={(e) => setConditions({ humidity: +e.target.value })} /></label>
            <label className="field">{t('safety.ground')}
              <select value={conditions.ground} onChange={(e) => setConditions({ ground: e.target.value as Ground })}>
                {['Firm', 'Muddy', 'Slope'].map((x) => <option key={x} value={x}>{term(t, 'ground', x)}</option>)}
              </select></label>
            <label className="field">{t('safety.light')}
              <select value={conditions.light} onChange={(e) => setConditions({ light: e.target.value as Light })}>
                {['Day', 'Dusk', 'Night'].map((x) => <option key={x} value={x}>{term(t, 'light', x)}</option>)}
              </select></label>
            <label className="field">{t('safety.dust')}
              <select value={conditions.dust ? 'y' : 'n'} onChange={(e) => setConditions({ dust: e.target.value === 'y' })}>
                <option value="n">—</option><option value="y">✓</option>
              </select></label>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>{t('safety.heatIndex')}: {heatIndex(conditions.tempC, conditions.humidity).toFixed(0)}°C</p>
        </div>
      </section>

      <section className="grid">
        <form className="card" onSubmit={(e) => {
          e.preventDefault();
          if (!form.description.trim()) return;
          addIncident({ ...form, operatorId: operatorId ?? '', machineId, auto: false,
            snapshot: { engineOn: machine.engineOn, seatbelt: machine.belted, tempC: conditions.tempC } });
          setForm({ ...form, description: '' });
        }}>
          <h3>{t('incident.title')}</h3>
          <div className="fields">
            <label className="field">{t('incident.type')}
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as IncidentType })}>
                {(['near_miss', 'seatbelt', 'proximity', 'damage', 'injury', 'other'] as const).map((x) => <option key={x} value={x}>{t(`incident.types.${x}`)}</option>)}
              </select></label>
            <label className="field">{t('incident.severity')}
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as Severity })}>
                {(['low', 'medium', 'high'] as const).map((x) => <option key={x} value={x}>{t(`severity.${x}`)}</option>)}
              </select></label>
          </div>
          <textarea rows={3} style={{ width: '100%', marginTop: 10 }} placeholder={t('incident.describe')}
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button style={{ marginTop: 10 }}>{t('incident.save')}</button>
        </form>

        <div className="card">
          <h3>{t('incident.log')} ({incidents.length})</h3>
          <ul className="tasklist" style={{ maxHeight: 360, overflow: 'auto' }}>
            {incidents.length === 0 && <li className="muted empty">{t('incident.none')}</li>}
            {incidents.map((i) => (
              <li key={i.id} style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span className={`pill ${i.severity === 'high' ? 'stop' : i.severity === 'medium' ? 'warn' : ''}`}>{t(`severity.${i.severity}`)}</span>
                <span><b>{t(`incident.types.${i.type}`)}</b> {i.auto && <span className="pill">{t('incident.auto')}</span>}
                  <br /><small className="muted">{new Date(i.at).toLocaleTimeString()} · {i.machineId}</small><br />{i.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
