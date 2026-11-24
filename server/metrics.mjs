// Journaux structurés (une ligne JSON par événement) et compteurs exposés en JSON et au format Prometheus.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export function createMetrics({ now = () => Date.now(), level = 'info', sink = null } = {}) {
  const counters = new Map();
  const started = now();
  const min = LEVELS[level] ?? LEVELS.info;
  const write = sink ?? ((line, lvl) => (lvl === 'error' ? process.stderr : process.stdout).write(`${line}\n`));
  return {
    inc(name, n = 1) { counters.set(name, (counters.get(name) ?? 0) + n); },
    counters: () => Object.fromEntries(counters),
    uptimeSec: () => Math.round((now() - started) / 1000),
    /** Une ligne JSON : { ts, level, event, ...champs }. Jamais de mot de passe, de jeton ni de contenu de partie dans les champs. */
    log(lvl, event, fields = {}) {
      if ((LEVELS[lvl] ?? 20) < min) return;
      write(JSON.stringify({ ts: new Date(now()).toISOString(), level: lvl, event, ...fields }), lvl);
    },
    /** Format texte Prometheus : compteurs `mythomytho_<nom>_total` et jauges `mythomytho_<nom>`. */
    prometheus(gauges) {
      const out = [];
      for (const [k, v] of counters) { out.push(`# TYPE mythomytho_${k}_total counter`, `mythomytho_${k}_total ${v}`); }
      for (const [k, v] of Object.entries(gauges)) { out.push(`# TYPE mythomytho_${k} gauge`, `mythomytho_${k} ${v}`); }
      return `${out.join('\n')}\n`;
    },
  };
}
