import { useTranslation } from 'react-i18next';
import { useStore } from '../store';

/** Shows the most urgent active alert. Alerts are pushed via useStore().pushAlert(). */
export default function AlertBanner() {
  const { t } = useTranslation();
  const alerts = useStore((s) => s.alerts);
  const clear = useStore((s) => s.clearAlert);
  if (!alerts.length) return null;
  const order = { critical: 0, warning: 1, info: 2 };
  const a = [...alerts].sort((x, y) => order[x.priority] - order[y.priority])[0];
  return (
    <div className={`alertbar ${a.priority}`} role="alert">
      <span>⚠ {t(a.key, a.params)}</span>
      <span className="spacer" style={{ flex: 1 }} />
      {a.priority !== 'critical' && <button className="ghost" onClick={() => clear(a.key)}>✕</button>}
    </div>
  );
}
