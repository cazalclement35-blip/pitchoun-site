// Apple Watch / Apple Santé — il n'existe aucune API web pour lire
// HealthKit. On reçoit à la place les données poussées par une app tierce
// sur l'iPhone (ex. "Health Auto Export" ou "Health Webhook"), pilotée par
// une automatisation Raccourcis qui envoie un POST JSON régulièrement.
//
// Format attendu (celui de Health Auto Export, stable depuis des années) :
// { "data": { "metrics": [ { "name": "step_count", "data": [
//     { "date": "2026-08-17 00:00:00 +0200", "qty": 6543 }, ... ] } ] } }
//
// ⚠️ IMPORTANT : configure l'automatisation en mode "cumulatif" (le total
// de pas depuis minuit à chaque envoi), pas en mode "delta". On garde le
// MAX des valeurs reçues pour une date donnée, ce qui n'est correct que si
// chaque envoi contient déjà le cumul du jour.

export const id = 'apple';
export const label = 'Apple Watch';

export function extractStepsByDate(payload) {
  const metrics = payload?.data?.metrics || payload?.metrics || [];
  const stepsMetric = metrics.find(m => /step/i.test(m.name || ''));
  if (!stepsMetric || !Array.isArray(stepsMetric.data)) return {};

  const byDate = {};
  for (const entry of stepsMetric.data) {
    const rawDate = entry.date || entry.day || '';
    const dateStr = String(rawDate).slice(0, 10); // "YYYY-MM-DD"
    const qty = Number(entry.qty ?? entry.value ?? 0);
    if (!dateStr || Number.isNaN(qty)) continue;
    byDate[dateStr] = Math.max(byDate[dateStr] || 0, qty);
  }
  return byDate;
}
