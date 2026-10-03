// Exercise the actual inline waveform generator without a WebGL/DOM dependency.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `Missing source section: ${start}`);
  return source.slice(a, b);
}
const context = vm.createContext({
  assert, console, performance: {now:()=>0},
  setTimeout:()=>{}, buildEcgGrid:()=>{}, resizeEcgCanvases:()=>{},
  buildInfarct:()=>{}, updateInfoPane:()=>{},
});
vm.runInContext([
  section('const LEADS_12 =', '//  LEAD INFO DATABASE'),
  section("let currentScenario = 'normal';", '//  THREE.JS SCENE SETUP'),
  'let writeHead = 0;',
  section('const BEAT_SAMPLES =', '//  RENDERER RESIZE'),
  section('function applyScenario(name)', '//  QUIZ MODE'),
  `
  const rmsDifference = (a,b) => Math.sqrt(a.reduce((sum,x,i)=>sum+(x-b[i])**2,0)/a.length);
  let previous = generateBeat('II','normal',512);
  isPaused = true;
  for(let n=0;n<30;n++) {
    generateVariation();
    assert.equal(bpm,75); assert.equal(speed,.5); assert.equal(isPaused,true);
    const next = generateBeat('II','normal',512);
    assert(rmsDifference(previous,next)>.015, 'Shape must change at fixed BPM');
    previous=next;
    for(const lead of LEADS_12) {
      assert(beatTemplates[lead].every(Number.isFinite));
      assert(ecgBuffers[lead].every(Number.isFinite));
      assert.deepEqual(Array.from(ecgBuffers[lead]),Array.from(healthyBuffers[lead]),'Normal reference must match varied subject');
      assert.equal(activeVariation.stMul[lead],1,'Normal variation must not add ST shift');
    }
    for(const lead of ['I','II','aVF']) assert(beatTemplates[lead][Math.round(PH.Ppeak*512)]>0);
    assert(beatTemplates.aVR[Math.round(PH.Ppeak*512)]<0);
    assert(Math.abs(recordingVariation('II',.2).offset)<=.033);
    assert.notEqual(recordingVariation('II',.2).offset,recordingVariation('II',1).offset,'Baseline must not loop with every beat');
  }
  currentScenario='inferior'; generateVariation();
  for(const lead of ['II','III','aVF']) {
    const i=Math.round(.42*512);
    assert(beatTemplates[lead][i]-healthyBeatTemplates[lead][i]>.1,'Injury shift must remain visible');
    assert(Math.abs(beatTemplates[lead][Math.round(.12*512)]-healthyBeatTemplates[lead][Math.round(.12*512)])<1e-6,'Reference must share P morphology');
  }
  for(const scenario of ['afib','vfib']) {
    currentScenario=scenario; generateVariation();
    assert(ecgBuffers.II.every(Number.isFinite));
    assert(healthyBuffers.II.every(x=>x===0));
  }
  applyScenario('normal');
  assert.equal(activeVariation,null);
  assert.deepEqual(Array.from(beatTemplates.II),Array.from(healthyBeatTemplates.II));
  assert.equal(isPaused,true);
  console.log('PASS: 30 distinct fixed-rate profiles, sinus P polarity, matched references, bounded nonrepeating baseline, MI shifts, arrhythmia buffers, paused refresh and scenario reset.');
  `,
].join('\n'), context);
