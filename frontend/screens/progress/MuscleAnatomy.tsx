import type {Counts,Muscle} from '../../domain/muscleStats';
import {MUSCLES} from '../../domain/muscleStats';
// Regions aligned to the neutral 1254px illustration in a normalized 1000px coordinate system.
const front:[Muscle,string][]=[
 ['chest','M307 190 C277 181 241 195 221 225 C236 259 264 286 302 275 C309 252 309 216 307 190Z'],
 ['shoulders','M222 182 C191 174 174 195 170 224 L174 261 C190 245 201 219 224 207Z'],
 ['biceps','M175 255 C188 264 195 279 192 299 L181 328 L163 338 C165 304 166 279 175 255Z'],
 ['triceps','M166 267 L159 301 L157 337 L167 330 L177 293Z'],
 ['forearms','M159 337 C172 333 178 343 170 365 L143 422 L125 466 L119 463 L139 391Z'],
 ['abdominals','M305 281 L276 288 L277 316 L299 320 L277 325 L277 350 L300 352 L278 358 L281 384 L302 387 L282 393 L288 427 L306 448Z'],
 ['abdominals','M269 287 L246 300 L231 369 L234 413 L274 447 L269 393 L260 352Z'],
 ['quadriceps','M244 454 C228 477 221 517 222 547 L236 621 L253 646 C266 626 272 594 270 565 L277 492Z'],
 ['adductors','M280 477 L302 506 L295 575 L280 626 L270 603 L273 544Z'],
 ['abductors','M241 447 L233 468 L228 506 L240 499 L256 473Z'],
 ['calves','M240 675 C228 709 225 750 235 779 L245 838 L253 854 L254 799 L265 745 L259 686Z'],
 ['neck','M303 125 L292 145 L299 178 L307 183Z']
];
const back:[Muscle,string][]=[
 ['traps','M683 131 L673 160 L642 178 L606 191 L635 201 L665 216 L682 256Z'],
 ['upper_back','M682 213 L648 196 L626 205 L628 234 L647 263 L679 282Z'],
 ['lats','M638 264 L606 270 L608 323 L628 357 L679 402 L680 285Z'],
 ['lower_back','M678 340 L654 368 L639 408 L645 435 L681 401Z'],
 ['shoulders','M606 190 C576 190 561 219 561 257 L582 237 L613 216 L625 210Z'],
 ['triceps','M565 251 L553 277 L544 306 L546 336 L565 342 L582 300 L579 267Z'],
 ['forearms','M544 339 L535 365 L520 413 L508 468 L524 475 L539 433 L554 390 L561 351Z'],
 ['glutes','M647 417 C621 422 603 445 603 483 L605 511 C630 527 661 512 678 492 L683 449 L679 410Z'],
 ['hamstrings','M609 522 L601 564 L606 624 L619 670 L632 672 L642 609 L654 545 L669 515Z'],
 ['adductors','M672 510 L661 546 L648 621 L644 668 L657 646 L675 566Z'],
 ['calves','M617 684 C593 717 581 762 596 783 L615 794 L627 760 L632 714Z'],
 ['neck','M682 116 L668 139 L671 168 L683 182Z']
];
export function MuscleAnatomy({counts,selected,onSelect}:{counts:Counts;selected:Muscle|null;onSelect:(m:Muscle)=>void}){const max=Math.max(1,...Object.values(counts));return <figure className="muscle-anatomy"><svg viewBox="0 0 1000 1000" role="img" aria-label="Front and back muscle anatomy, highlighted by weighted working sets"><title>Logged muscle distribution</title><image href="/legacy/anatomy/muscles-neutral.svg" width="1000" height="1000"/>{[[front,310],[back,687]].map(([data,c],view)=>(data as typeof front).flatMap(([m,d],i)=>[false,true].map(mirror=><path key={`${view}-${i}-${mirror}`} d={d} transform={mirror?`translate(${Number(c)*2} 0) scale(-1 1)`:undefined} fill="#157a47" fillOpacity={counts[m]>0?.16+.48*counts[m]/max:0} stroke={selected===m?'#0e5a34':'none'} strokeWidth={selected===m?2:0} style={{mixBlendMode:'multiply'}} onClick={()=>onSelect(m)}><title>{MUSCLES[m]}: {counts[m]} weighted sets</title></path>)))}<text x="310" y="988" textAnchor="middle">Front</text><text x="687" y="988" textAnchor="middle">Back</text></svg><figcaption className="muscle-scale"><span>Fewer sets</span><i/><span>More sets</span></figcaption></figure>}
