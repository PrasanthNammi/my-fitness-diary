export type Clock={mode:'timer'|'stopwatch';durationSec:number;valueMs:number;startedAt:number|null};
/** Wall-clock timestamps prevent drift while the tab sleeps or the panel is closed. */
export function clockValue(clock:Clock,now:number){const elapsed=clock.startedAt===null?0:Math.max(0,now-clock.startedAt);return clock.mode==='timer'?Math.max(0,clock.valueMs-elapsed):clock.valueMs+elapsed}
