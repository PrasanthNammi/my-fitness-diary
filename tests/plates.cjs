// Plate calculator: per-side plates, exact and inexact targets, under the bar, fractional plates without
// rounding drift, the saved setup only for its own unit, and defaults otherwise.
const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-plates.cjs');
esbuild.buildSync({entryPoints:['frontend/domain/plates.ts'],bundle:true,platform:'node',format:'cjs',outfile:out});
const {loadBar,plateSetup,PLATE_DEFAULTS}=require(out);
const kg=PLATE_DEFAULTS.kg,lb=PLATE_DEFAULTS.lb;

let r=loadBar(100,kg);assert.deepEqual(r.perSide,[{plate:25,count:1},{plate:15,count:1}]);assert.equal(r.loaded,100);assert.equal(r.short,0);
r=loadBar(142.5,kg);assert.deepEqual(r.perSide,[{plate:25,count:2},{plate:10,count:1},{plate:1.25,count:1}]);assert.equal(r.loaded,142.5);
r=loadBar(22.5,kg);assert.deepEqual(r.perSide,[{plate:1.25,count:1}]);assert.equal(r.loaded,22.5);
r=loadBar(20,kg);assert.deepEqual(r.perSide,[]);assert.equal(r.short,0);assert.equal(r.underBar,false);
r=loadBar(15,kg);assert.equal(r.underBar,true);assert.deepEqual(r.perSide,[]);
r=loadBar(101,kg);assert.equal(r.loaded,100);assert.equal(r.short,1,'1 kg cannot be split into available plates');
r=loadBar(225,lb);assert.deepEqual(r.perSide,[{plate:45,count:2}]);
r=loadBar(185,lb);assert.deepEqual(r.perSide,[{plate:45,count:1},{plate:25,count:1}]);
// Many small plates: no floating-point drift.
r=loadBar(20+1.25*2*7,{unit:'kg',bar:20,plates:[1.25]});assert.deepEqual(r.perSide,[{plate:1.25,count:7}]);assert.equal(r.short,0);
// Custom bar and plates, duplicates and zero ignored.
r=loadBar(60,{unit:'kg',bar:15,plates:[10,10,0,2.5]});assert.deepEqual(r.perSide,[{plate:10,count:2},{plate:2.5,count:1}]);assert.equal(r.loaded,60);
assert.equal(loadBar(NaN,kg).underBar,true);
// Setup: the saved one applies only to its unit.
const saved={unit:'kg',bar:15,plates:[2.5,20]};
assert.deepEqual(plateSetup({weightUnit:'kg',plates:saved}),{unit:'kg',bar:15,plates:[20,2.5]});
assert.deepEqual(plateSetup({weightUnit:'lb',plates:saved}),lb);
assert.deepEqual(plateSetup({weightUnit:'kg'}),kg);
assert.deepEqual(plateSetup({weightUnit:'kg',plates:{unit:'kg',bar:20,plates:[]}}),kg,'empty plate list falls back');
console.log('PASS plates: per-side plates heaviest first, exact and short targets, under the bar, no rounding drift, custom setups, saved setup per unit');
