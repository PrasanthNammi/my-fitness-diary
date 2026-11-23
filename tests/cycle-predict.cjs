// The next-period estimate (frontend/domain/cyclePredict.ts) on synthetic data only: the generalized Poisson is
// correct; regular cycles give a narrow range, irregular ones a wide one; a forgotten period log doesn't pull the
// estimate; a long ongoing cycle never gives a range in the past; under 3 cycles there is no estimate; logs after
// today change nothing; and on 300 simulated people the 80% range holds the real start about 8 times in 10
// (calibration, as Urteaga et al. 2021 evaluated it). The measured numbers are printed (synthetic, not clinical).
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-cycle-predict.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/cyclePredict.ts'],bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'});
const P=require(out);
const add=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// Days logged as periods (4 days each) for the given cycle lengths, ending with the current cycle's start.
function history(lengths,start='2025-01-06'){const days=[];let s=start;for(const L of [...lengths,0]){for(let k=0;k<4;k++)days.push({id:add(s,k),date:add(s,k),bleeding:'period'});if(!L)break;s=add(s,L)}return {days,last:s}}

// 1. The distribution itself.
for(const [lambda,xi] of [[20,0],[20,0.3],[28,0.5]]){let t=0,m=0,v=0;for(let k=0;k<800;k++){const p=Math.exp(P.gpLogPmf(k,lambda,xi));t+=p;m+=k*p}
  for(let k=0;k<800;k++){const p=Math.exp(P.gpLogPmf(k,lambda,xi));v+=(k-m)**2*p}
  assert.ok(Math.abs(t-1)<1e-6,'sums to 1');assert.ok(Math.abs(m-lambda/(1-xi))<1e-3,'mean λ/(1−ξ)');assert.ok(Math.abs(v-lambda/(1-xi)**3)/v<1e-3,'variance λ/(1−ξ)³')}
for(const [lambda,xi] of [[56,-1],[84,-2],[112,-3]]){let t=0,m=0;for(let k=0;k<800;k++){const p=Math.exp(P.gpLogPmf(k,lambda,xi));t+=p;m+=k*p}
  assert.ok(Math.abs(t-1)<1e-9,'narrower than Poisson: normalised');assert.ok(Math.abs(m-lambda/(1-xi))<1.5,`mean near ${lambda/(1-xi)}: ${m}`)}
console.log('PASS generalized Poisson: probabilities sum to 1, mean λ/(1−ξ), variance λ/(1−ξ)³; narrower-than-Poisson settings normalised');

// 2–6. Behaviour.
const width=(e)=>(Date.parse(e.to)-Date.parse(e.from))/864e5;
let h=history([28,29,27,28,30,28]),today=add(h.last,5);let e=P.estimateNext(h.days,today);
assert.equal(e.state,'range');const med=(Date.parse(e.median)-Date.parse(h.last))/864e5;
assert.ok(med>=27&&med<=29,`regular: median ${med}`);assert.ok(width(e)<=10,`regular: narrow range ${width(e)} d`);
const regularWidth=width(e);
h=history([34,41,29,52,38,45,36]);e=P.estimateNext(h.days,add(h.last,5));
assert.ok(width(e)>=15,`irregular: wide range ${width(e)} d`);assert.ok(width(e)>regularWidth);
h=history([28,28,56,28,28,28]);e=P.estimateNext(h.days,add(h.last,3));
const skipMed=(Date.parse(e.median)-Date.parse(h.last))/864e5;assert.ok(skipMed>=26&&skipMed<=30,`a forgotten log doesn't pull the estimate: median ${skipMed}`);
h=history([28,27,29,28,28]);today=add(h.last,44);e=P.estimateNext(h.days,today);
assert.equal(e.state,'range');assert.ok(e.from>=today,'never a range in the past');
const longMed=(Date.parse(e.median)-Date.parse(h.last))/864e5;assert.ok(longMed>45,`long ongoing cycle: ${longMed}`);
h=history([30,31]);assert.equal(P.estimateNext(h.days,add(h.last,3)).state,'insufficient','under 3 cycles: not enough data');
assert.equal(P.estimateNext([],'2026-11-23').state,'insufficient');
h=history([28,29,27,28,30,28]);today=add(h.last,5);
const future=[...h.days,{id:add(today,3),date:add(today,3),bleeding:'period'},{id:add(today,4),date:add(today,4),bleeding:'period'}];
assert.deepEqual(P.estimateNext(future,today),P.estimateNext(h.days,today),'logs after today change nothing');
const tr=P.trackRecord([28,29,27,28,30,28]);assert.equal(tr.checked,3);assert.ok(tr.errors.every(x=>x>=0&&x<=3),'track record from earlier cycles only');
console.log(`PASS behaviour: regular range ${regularWidth} d, irregular wider; forgotten log ignored (median ${skipMed} d); long cycle never in the past; under 3 cycles none; future logs ignored`);

// 7. Calibration on simulated people (generated from the model's own family, with forgotten logs).
let seed=42;const rnd=()=>((seed=(seed*1103515245+12345)%2147483648)/2147483648);
function gpSample(lambda,xi){const u=rnd();let c=0;for(let k=0;k<1000;k++){c+=Math.exp(P.gpLogPmf(k,lambda,xi));if(c>=u)return k}return 999}
let inside=0,n=0,abs=0,within3=0,within7=0,widths=0;const t0=Date.now();
for(let i=0;i<300;i++){
  const m=29.3*Math.exp(0.15*(rnd()*2-1)*1.7),xi=rnd()<0.4?-2*rnd():0.5*rnd(),lambda=m*(1-xi),pi=0.05;   // 40% regular (narrow), 60% variable
  const cyc=()=>{let x=gpSample(lambda,xi);while(rnd()<pi)x+=gpSample(lambda,xi);return Math.max(10,x)};
  const past=Array.from({length:8},cyc),next=cyc();
  const dist=P.nextLengthDistribution(past,1),lo=P.quantile(dist,0.1),hi=P.quantile(dist,0.9),mid=P.quantile(dist,0.5);
  n++;if(next>=lo&&next<=hi)inside++;const err=Math.abs(next-mid);abs+=err;if(err<=3)within3++;if(err<=7)within7++;widths+=hi-lo;
}
const cov=inside/n;
console.log(`  synthetic evaluation (300 simulated people, 40% regular and 60% variable, 8 past cycles each, predicted on day 1): 80% range coverage ${(cov*100).toFixed(0)}%, mean absolute error ${(abs/n).toFixed(1)} d, within ±3 d ${(within3/n*100).toFixed(0)}%, within ±7 d ${(within7/n*100).toFixed(0)}%, mean range width ${(widths/n).toFixed(1)} d (${((Date.now()-t0)/n).toFixed(0)} ms each)`);
assert.ok(cov>=0.7&&cov<=0.92,`80% range is roughly calibrated (${cov})`);
console.log('PASS calibration: the 80% range holds the real start about 8 times in 10 on simulated people');
