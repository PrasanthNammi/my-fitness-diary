// The Progress tab and Cycle icons from the approved design (simple line icons, 24×24, currentColor).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const SummaryIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
export const ExercisesIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>;
export const BodyIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><g {...S}><circle cx="12" cy="5" r="2.5" /><path d="M5 10l7 1 7-1M12 11v5l-3 5M12 16l3 5" /></g></svg>;
export const StatsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><g {...S}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></g></svg>;
export const CycleIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><g {...S}><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 3c2.5 3 4 5.2 4 7.2A4 4 0 0 1 8 10.2C8 8.2 9.5 6 12 3z" /></g></svg>;
