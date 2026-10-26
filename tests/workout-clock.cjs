const assert=require('assert/strict'),esbuild=require('esbuild'),path=require('path'),os=require('os');
const out=path.join(os.tmpdir(),'mfd-workout-clock.cjs');esbuild.buildSync({entryPoints:['frontend/domain/workoutClock.ts'],bundle:true,platform:'node',format:'cjs',outfile:out});
const {clockValue}=require(out);const timer={mode:'timer',durationSec:75,valueMs:75000,startedAt:1000};
assert.equal(clockValue(timer,31000),45000);assert.equal(clockValue(timer,100000),0);assert.equal(clockValue({...timer,valueMs:45000,startedAt:null},999999),45000);assert.equal(clockValue({...timer,valueMs:45000,startedAt:100000},110000),35000);assert.equal(clockValue({...timer,mode:'stopwatch',valueMs:2000},6000),7000);
console.log('PASS independent clock: background elapsed time, expiry, pause, resume and stopwatch');
