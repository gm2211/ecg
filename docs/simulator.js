/* Shared activation clock: tissue colors, pathways, vector and ECG cursor. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const api = window.EPSimModel;
  if (!api) { document.body.dataset.workspace = 'explorer'; return; }
  const nav = document.createElement('header');
  nav.className = 'workspace-nav';
  nav.innerHTML = `<div class="workspace-brand">ECG <span>Studio</span></div><nav aria-label="Workspace"><button data-workspace="simulator" aria-pressed="true">Simulator</button><button data-workspace="explorer" aria-pressed="false">Lead explorer</button></nav><span class="workspace-note">Anatomy → activation → ECG</span>`;
  document.body.prepend(nav);
  const root = document.createElement('main');
  root.id = 'simulator';
  let quiz=null, studySnapshot=null, priorStudyPage='simulation';
  const quizBlind=()=>!!quiz&&!quiz.answered&&!quiz.complete;
  root.innerHTML = `
    <header class="sim-intro"><div><div class="sim-kicker">The electrical heart</div><h1>Follow the impulse.</h1><p>Change the conduction. See why the ECG changes.</p></div><p class="sim-intro-note">One clock. Three perspectives.<br>Heart activation · conduction path · lead voltage</p></header>
    <div class="sim-layout">
      <aside class="sim-scenarios" aria-label="Conduction mechanisms"><div class="sim-kicker">Choose a mechanism</div><div class="sim-scenario-note">Start with normal conduction.<br>Then change the path and follow the difference.</div></aside>
      <section class="sim-stage" data-view="anatomy" aria-label="Electrical activation">
        <div id="sim-viewport"></div><div id="sim-labels"></div>
        <svg id="sim-map" viewBox="-145 -115 290 254" role="img" aria-labelledby="sim-map-title sim-map-description"></svg>
        <div class="sim-stage-head"><div role="group" aria-label="Electrical view"><button data-sim-view="anatomy" aria-pressed="true">Anatomy</button><button data-sim-view="heart" aria-pressed="false">Electrical model</button><button data-sim-view="map" aria-pressed="false">Map</button></div><label class="sim-overlay-toggle"><input id="sim-overlay" type="checkbox" checked> Electrical overlay</label></div>
        <div id="sim-anatomy-status" role="status" aria-live="polite">Loading textured heart…</div>
        <a class="sim-heart-credit" href="https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089" target="_blank" rel="noopener noreferrer">Heart by neshallads · CC BY 4.0</a>
        <div class="sim-stage-hint" id="sim-view-hint">Drag to rotate · scroll to zoom · R / L are patient sides</div>
        <div class="sim-stage-bottom"><div class="sim-legend"><span>Resting</span><span class="active">Depolarizing</span><span class="depolarized">Depolarized</span><span class="recover">Repolarizing</span></div><button id="sim-reset-view">Reset view</button></div>
      </section>
      <section class="sim-traces" aria-label="Synchronized ECG traces">
        <div class="sim-trace-head"><div><h2>The same beat, on the ECG.</h2><p>Click a trace to inspect that instant</p></div><label for="sim-lead">View <select id="sim-lead">${['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'].map(l=>`<option ${l==='II'?'selected':''}>${l}</option>`).join('')}</select></label></div>
        <div class="sim-strip"><canvas id="sim-ecg-0" aria-label="Lead II simulated ECG"></canvas><span class="sim-strip-name" id="sim-selected-lead">II · inferior view</span></div>
        <div class="sim-strip"><canvas id="sim-ecg-1" aria-label="Lead V1 simulated ECG"></canvas><span class="sim-strip-name">V1 · right precordial</span></div>
        <div class="sim-strip"><canvas id="sim-ecg-2" aria-label="Lead V6 simulated ECG"></canvas><span class="sim-strip-name">V6 · left lateral</span></div>
        <div class="sim-trace-foot"><span class="sim-trace-key">Current</span><label class="sim-trace-key baseline"><input type="checkbox" id="sim-compare" checked> Normal reference</label><span>100 ms / large box · schematic mV</span></div>
      </section>
      <section class="sim-player" aria-label="Beat playback">
        <div class="sim-transport"><button id="sim-play" class="sim-play">Ⅱ Pause</button><button id="sim-step" class="sim-step" title="Pause and advance 10 milliseconds">+10 ms</button><output id="sim-time" class="sim-time">0 ms</output><input id="sim-scrub" type="range" min="0" max="800" value="0" step="1" aria-label="Time within beat"><label for="sim-speed">Speed <select id="sim-speed"><option value="0.1">0.1×</option><option value="0.25" selected>0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option></select></label></div>
        <div id="sim-events" class="sim-events" aria-label="Jump to an electrical event"></div>
      </section>
    </div>
    <section class="sim-explain" aria-label="Mechanism and controls">
      <div><div class="sim-phase-copy"><div class="sim-kicker" id="sim-phase-kicker">At this instant</div><h2 id="sim-phase-title"></h2><p id="sim-phase-description"></p></div><h2 id="sim-mechanism-title"></h2><p id="sim-mechanism-copy"></p></div>
      <div class="sim-parameters"><div class="sim-param-title"><h3>Experiment with conduction</h3><button id="sim-reset">Reset values</button></div>
        <div class="sim-parameter"><label for="sim-rate">Heart rate</label><input id="sim-rate" type="range" min="50" max="120" step="5"><output id="sim-rate-out"></output></div>
        <div class="sim-parameter" id="sim-av-row"><label for="sim-av">P onset → His</label><input id="sim-av" type="range" min="110" max="190" step="5"><output id="sim-av-out"></output></div>
        <div class="sim-parameter" id="sim-branch-row"><label for="sim-branch">Extra ventricular delay</label><input id="sim-branch" type="range" min="30" max="100" step="5"><output id="sim-branch-out"></output></div>
        <div class="sim-parameter" id="sim-accessory-row"><label for="sim-accessory">Bypass breakthrough</label><input id="sim-accessory" type="range" min="60" max="110" step="5"><output id="sim-accessory-out"></output></div>
        <p class="sim-param-hint" id="sim-param-hint">P onset → His includes atrial and AV conduction. It is not AV-node delay alone.</p><div class="sim-measures"><div><span id="sim-pr-label">PR</span><strong id="sim-pr"></strong></div><div>QRS<strong id="sim-qrs"></strong></div><div>Cycle<strong id="sim-cycle"></strong></div></div>
      </div>
    </section>
    <details class="sim-footnote"><summary>Educational model · assumptions & sources</summary><p>This is an educational conduction simulator, not a clinically validated ECG solver. A shared regional activation schedule drives the 3D wavefront, conduction map, electrical vector and schematic lead projections. Geometry, dipole weights, recovery and voltages are simplified; the model does not solve cellular ion currents or a torso volume conductor. Color shows electrical state, not muscle contraction. The purple arrow shows the net electrical vector; its projection toward a lead's positive pole gives an upward deflection.</p><p>WPW shows one illustrative left free-wall pathway. Actual pathway locations and ECG patterns vary. Orthodromic AVRT is a steady re-entry loop; its P wave represents retrograde atrial activation. The normal reference uses the same cycle length for comparison, not a diagnosis.</p><div class="sim-source-links"><a href="https://www.ncbi.nlm.nih.gov/books/NBK354/" target="_blank" rel="noopener noreferrer">Clinical Methods: ECG</a><a href="https://www.jacc.org/doi/10.1016/j.jacc.2008.12.013" target="_blank" rel="noopener noreferrer">AHA / ACCF / HRS: conduction disturbances</a><a href="https://www.ncbi.nlm.nih.gov/books/NBK554437/" target="_blank" rel="noopener noreferrer">WPW & re-entry mechanisms</a></div></details>`;
  nav.after(root);
  // Bounded workspace: content changes by tabs/pages, never by document scroll.
  root.dataset.page='simulation'; root.dataset.observe='heart';
  root.querySelector('.sim-intro h1').textContent='Electrical simulator';
  const scenarioPicker=document.createElement('label'); scenarioPicker.className='sim-scenario-picker';
  scenarioPicker.innerHTML=`<span>Mechanism</span> <select id="sim-scenario-select" aria-label="Conduction mechanism">${api.scenarios.map(s=>`<option value="${s.id}">${s.label}</option>`).join('')}</select>`;
  root.querySelector('.sim-intro').append(scenarioPicker);
  const tabs=document.createElement('div'); tabs.className='sim-tabs';
  tabs.innerHTML=`<div class="sim-page-tabs" role="tablist" aria-label="Simulator pages">${[['simulation','Simulation'],['quiz','Quiz'],['mechanism','Mechanism'],['controls','Controls'],['sources','Sources']].map(([id,label])=>`<button id="sim-tab-${id}" role="tab" data-sim-page-tab="${id}" aria-controls="sim-page-${id}" aria-selected="${id==='simulation'}" tabindex="${id==='simulation'?0:-1}">${label}</button>`).join('')}</div><div class="sim-mobile-views" role="group" aria-label="Simulation panel"><button data-observe="heart" aria-pressed="true">Heart</button><button data-observe="ecg" aria-pressed="false">ECG</button></div>`;
  root.querySelector('.sim-intro').after(tabs);
  const content=document.createElement('div'); content.className='sim-content'; tabs.after(content);
  function page(element,id) {
    element.classList.add('sim-page'); element.dataset.simPage=id; element.id=`sim-page-${id}`;
    element.setAttribute('role','tabpanel'); element.setAttribute('aria-labelledby',`sim-tab-${id}`);
    element.hidden=id!=='simulation'; content.append(element); return element;
  }
  const layout=root.querySelector('.sim-layout'),player=root.querySelector('.sim-player');
  root.append(player); page(layout,'simulation');
  const exitQuiz=document.createElement('button');exitQuiz.id='sim-quiz-exit';exitQuiz.className='sim-quiz-secondary';exitQuiz.textContent='Back to study';exitQuiz.hidden=true;root.querySelector('.sim-intro').append(exitQuiz);
  const quizPage=document.createElement('section');quizPage.className='sim-quiz-page';
  quizPage.innerHTML=`
    <div id="sim-quiz-welcome" class="sim-quiz-card"><div class="sim-kicker">Simulator quiz</div><h2>Follow the beat. Find the mechanism.</h2><p>Inspect the heart, conduction map, and ECG. Then choose the mechanism that explains what you see.</p><p class="sim-quiz-muted">Six cases · shuffled order · explanations after every answer</p><button id="sim-quiz-start" class="sim-quiz-primary">Start quiz</button></div>
    <form id="sim-quiz-question" class="sim-quiz-card" hidden><div class="sim-quiz-heading"><span id="sim-quiz-progress" class="sim-kicker"></span><span id="sim-quiz-score"></span></div><fieldset><legend>Which mechanism explains this beat?</legend><p class="sim-quiz-muted">Use Inspect to replay, rotate, or scrub before answering.</p><div class="sim-quiz-choices">${api.scenarios.map(s=>`<label><input type="radio" name="sim-quiz-answer" value="${s.id}" required><span>${s.label}</span></label>`).join('')}</div></fieldset><button id="sim-quiz-submit" class="sim-quiz-primary" disabled>Check answer</button></form>
    <div id="sim-quiz-feedback" class="sim-quiz-card" hidden><div id="sim-quiz-result" class="sim-kicker" role="status"></div><h2 id="sim-quiz-answer-title"></h2><p id="sim-quiz-selection" class="sim-quiz-muted"></p><p id="sim-quiz-reason"></p><div class="sim-quiz-actions"><button id="sim-quiz-explain" class="sim-quiz-secondary">Why this answer?</button><button id="sim-quiz-next" class="sim-quiz-primary">Next case →</button></div></div>
    <div id="sim-quiz-finish" class="sim-quiz-card" hidden><div class="sim-kicker">Round complete</div><h2 id="sim-quiz-total"></h2><p>Six conduction mechanisms, one shared electrical clock. Try another round or return to study to experiment.</p><div class="sim-quiz-actions"><button id="sim-quiz-again" class="sim-quiz-primary">Practice again</button><button id="sim-quiz-finish-exit" class="sim-quiz-secondary">Back to study</button></div></div>`;
  page(quizPage,'quiz');
  const quizDock=document.createElement('div');quizDock.id='sim-quiz-dock';quizDock.hidden=true;
  quizDock.innerHTML='<span id="sim-quiz-dock-status"></span><button id="sim-quiz-open">Choose answer →</button>';player.append(quizDock);
  tabs.querySelector('.sim-mobile-views').before($('sim-quiz-open'));
  root.querySelector('.sim-scenario-note').textContent='';
  const explanation=root.querySelector('.sim-explain');
  const mechanismPage=document.createElement('section'); mechanismPage.className='sim-detail-page';
  const mechanismCard=document.createElement('div'); mechanismCard.className='sim-mechanism-card';
  mechanismCard.append($('sim-mechanism-title'),$('sim-mechanism-copy'));
  const nowCard=root.querySelector('.sim-phase-copy');
  mechanismPage.append(nowCard,mechanismCard); page(mechanismPage,'mechanism');
  page(root.querySelector('.sim-parameters'),'controls'); explanation.remove();
  const sourcesPage=document.createElement('section'); sourcesPage.className='sim-detail-page';
  const sourceContent=[
    ['Model assumptions','This educational simulator uses one regional activation schedule for the electrical animation, vector, and schematic ECG. It is not a clinically validated ECG solver. Geometry, voltages, dipole weights and recovery are simplified; cellular ion currents and a torso volume conductor are not solved.'],
    ['Reading the animation','The textured heart is an unsegmented sculpt. Its surface regions are approximate illustrations of the electrical schedule, not measured chamber boundaries. Use Electrical model or Map to inspect the conduction sequence. Color shows electrical state, not contraction. The purple vector in Electrical model projects onto each lead axis to produce the trace.'],
    ['Pathway examples','WPW shows one illustrative left free-wall pathway; actual locations and ECG patterns vary. Orthodromic AVRT is a steady re-entry loop, so its P wave represents returning atrial activation. The normal reference uses the same cycle length for comparison.'],
  ];
  const sourceCards=sourceContent.map(([title,copy])=>{const card=document.createElement('div');card.className='sim-source-card';card.innerHTML=`<h2>${title}</h2><p>${copy}</p>`;sourcesPage.append(card);return card;});
  const references=document.createElement('div');references.className='sim-source-card';references.innerHTML='<h2>Sources & credits</h2>';
  references.append(root.querySelector('.sim-source-links'));
  const credit=root.querySelector('.sim-heart-credit').cloneNode(true);credit.className='sim-source-credit';references.append(credit);
  sourcesPage.append(references);sourceCards.push(references);page(sourcesPage,'sources');
  root.querySelector('.sim-footnote').remove();
  function paginate(container,cards,names) {
    let index=0;const pager=document.createElement('div');pager.className='sim-page-pager';
    pager.innerHTML='<button type="button" aria-label="Previous explanation page">← Previous</button><output aria-live="polite"></output><button type="button" aria-label="Next explanation page">Next →</button>';
    container.append(pager);const buttons=pager.querySelectorAll('button');
    function show(){cards.forEach((card,i)=>card.hidden=i!==index);pager.querySelector('output').textContent=`${index+1} / ${cards.length} · ${names[index]}`;buttons[0].disabled=index===0;buttons[1].disabled=index===cards.length-1;}
    buttons[0].addEventListener('click',()=>{index--;show();});buttons[1].addEventListener('click',()=>{index++;show();});show();
  }
  paginate(mechanismPage,[nowCard,mechanismCard],['At this instant','Mechanism']);
  paginate(sourcesPage,sourceCards,['Assumptions','Animation','Pathways','Sources']);
  function showPage(id) {
    if(quiz&&((id==='controls')||(quizBlind()&&['mechanism','sources'].includes(id))))return;
    if(!quiz&&id==='quiz'&&root.dataset.page!=='quiz')priorStudyPage=root.dataset.page;
    root.dataset.page=id;content.querySelectorAll('[data-sim-page]').forEach(p=>p.hidden=p.dataset.simPage!==id);
    tabs.querySelectorAll('[role="tab"]').forEach(b=>{const selected=b.dataset.simPageTab===id;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    resize();
  }
  const pageButtons=Array.from(tabs.querySelectorAll('[role="tab"]'));
  pageButtons.forEach(b=>{
    b.addEventListener('click',()=>showPage(b.dataset.simPageTab));
    b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const visible=pageButtons.filter(button=>!button.hidden),i=visible.indexOf(b);const next=e.key==='Home'?0:e.key==='End'?visible.length-1:(i+(e.key==='ArrowRight'?1:-1)+visible.length)%visible.length;visible[next].focus();showPage(visible[next].dataset.simPageTab);});
  });
  tabs.querySelectorAll('[data-observe]').forEach(b=>b.addEventListener('click',()=>{root.dataset.observe=b.dataset.observe;tabs.querySelectorAll('[data-observe]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));resize();}));
  $('sim-events').className='sim-event-pager';
  $('sim-events').innerHTML='<button id="sim-prev-event" aria-label="Previous electrical event">‹</button><label for="sim-event-select">Event</label><select id="sim-event-select" aria-label="Electrical event"></select><button id="sim-next-event" aria-label="Next electrical event">›</button>';
  let currentEvents=[];
  const state = {scenario:'normal', time:0, playing:!matchMedia('(prefers-reduced-motion: reduce)').matches, speed:.25, lead:'II', compare:true, inspectedEvent:null};
  let model, normal, params, lastFrame = 0, phaseId = '', traceCache = [];
  const choices = {
    normal:['Normal sinus','The usual route'], rbbb:['Right bundle block','Late right ventricle'],
    lbbb:['Left bundle block','Late left ventricle'], wpw:['WPW pattern','An early shortcut'],
    avblock:['1° AV block','A longer pause'], avrt:['Orthodromic AVRT','An electrical loop']
  };
  const scenarios = Array.isArray(api.scenarios) ? api.scenarios : Object.values(api.scenarios);
  for (const sc of scenarios) {
    const b = document.createElement('button'); b.className = 'sim-scenario'; b.dataset.scenario = sc.id;
    b.setAttribute('aria-pressed',sc.id===state.scenario?'true':'false');
    b.innerHTML = `<strong>${choices[sc.id][0]}</strong><span>${choices[sc.id][1]}</span>`;
    b.addEventListener('click',()=>setScenario(sc.id)); root.querySelector('.sim-scenario-note').before(b);
  }
  $('sim-scenario-select').addEventListener('change',e=>setScenario(e.target.value));
  const canvases = [0,1,2].map(i=>$(`sim-ecg-${i}`));
  const stage = root.querySelector('.sim-stage');
  function syncQuizUI() {
    const active=!!quiz,blind=quizBlind();root.dataset.mode=active?'quiz':'study';root.dataset.quizBlind=String(blind);
    scenarioPicker.hidden=active;root.querySelector('.sim-scenarios').hidden=active;root.querySelector('.sim-intro-note').hidden=active;exitQuiz.hidden=!active;
    $('sim-tab-simulation').textContent=active?'Inspect':'Simulation';$('sim-tab-quiz').textContent=active?'Answer':'Quiz';
    $('sim-tab-mechanism').textContent=active?'Explanation':'Mechanism';$('sim-tab-mechanism').hidden=blind;$('sim-tab-sources').hidden=blind;$('sim-tab-controls').hidden=active;
    $('sim-events').hidden=active;quizDock.hidden=!active;$('sim-quiz-open').hidden=!active;$('sim-compare').closest('label').hidden=blind;
    root.querySelector('.sim-intro h1').textContent=active?(quiz.complete?'Quiz complete':`Case ${quiz.index+1} of ${quiz.total}`):'Electrical simulator';
    root.querySelector('.sim-intro > div > p').textContent=active?'Inspect the activation. Identify the mechanism.':'Change the conduction. See why the ECG changes.';
    $('sim-quiz-welcome').hidden=active;$('sim-quiz-question').hidden=!active||quiz.answered||quiz.complete;
    $('sim-quiz-feedback').hidden=!active||!quiz.answered||quiz.complete;$('sim-quiz-finish').hidden=!active||!quiz.complete;
    if(!active)return;
    const completed=quiz.complete?quiz.total:quiz.index+(quiz.answered?1:0);
    $('sim-quiz-progress').textContent=`Case ${quiz.index+1} of ${quiz.total}`;
    $('sim-quiz-score').textContent=`${quiz.score} / ${completed} correct`;
    $('sim-quiz-dock-status').textContent=`${quiz.score} / ${completed} correct${quiz.complete?' · Round complete':` · Case ${quiz.index+1} of ${quiz.total}`}`;
    $('sim-quiz-open').textContent=quiz.complete?'View score →':quiz.answered?'View result →':'Choose answer →';
  }
  function startQuiz() {
    if(!quiz)studySnapshot={state:{...state},params:{...params},page:priorStudyPage,view:stage.dataset.view,observe:root.dataset.observe,camera:simCamera?.position.clone(),target:orbit?.target.clone()};
    quiz=window.EPSimQuiz.createSession(scenarios.map(s=>s.id));loadQuizCase();
  }
  function loadQuizCase() {
    $('sim-quiz-question').reset();$('sim-quiz-submit').disabled=true;
    state.compare=false;$('sim-compare').checked=false;state.playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    setScenario(quiz.currentId);syncQuizUI();syncPlayback();showPage('simulation');$('sim-tab-simulation').focus();
  }
  function finishQuiz() {
    if(!quiz||!studySnapshot)return;
    const saved=studySnapshot;quiz=null;studySnapshot=null;
    setScenario(saved.state.scenario);params={...saved.params};rebuild();Object.assign(state,saved.state);
    $('sim-lead').value=state.lead;$('sim-speed').value=state.speed;$('sim-compare').checked=state.compare;
    root.dataset.observe=saved.observe;tabs.querySelectorAll('[data-observe]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.observe===saved.observe)));
    setView(saved.view);if(simCamera&&saved.camera){simCamera.position.copy(saved.camera);orbit.target.copy(saved.target);orbit.update();}
    syncQuizUI();syncLead();phaseId='';update();syncPlayback();showPage(saved.page);$(`sim-tab-${saved.page}`).focus();
  }
  $('sim-quiz-start').addEventListener('click',startQuiz);$('sim-quiz-again').addEventListener('click',startQuiz);
  exitQuiz.addEventListener('click',finishQuiz);$('sim-quiz-finish-exit').addEventListener('click',finishQuiz);
  $('sim-quiz-open').addEventListener('click',()=>{showPage('quiz');$('sim-tab-quiz').focus();});
  $('sim-quiz-question').addEventListener('change',()=>{$('sim-quiz-submit').disabled=!quiz||quiz.answered||!root.querySelector('[name="sim-quiz-answer"]:checked');});
  $('sim-quiz-question').addEventListener('submit',e=>{
    e.preventDefault();const selected=root.querySelector('[name="sim-quiz-answer"]:checked');if(!quiz||!selected)return;
    const result=quiz.submit(selected.value);if(!result)return;
    state.playing=false;syncPlayback();const answer=scenarios.find(s=>s.id===result.answer);
    $('sim-quiz-result').textContent=result.correct?'Correct':'Not quite';$('sim-quiz-feedback').dataset.correct=String(result.correct);
    $('sim-quiz-answer-title').textContent=answer.label;$('sim-quiz-reason').textContent=answer.summary;
    $('sim-quiz-selection').textContent=result.correct?'Your answer matches the activation pattern.':`You chose ${scenarios.find(s=>s.id===result.selected).label}.`;
    $('sim-quiz-next').textContent=quiz.index===quiz.total-1?'See score →':'Next case →';
    syncQuizUI();rebuildPaths();drawTraces();$('sim-quiz-next').focus();
  });
  $('sim-quiz-explain').addEventListener('click',()=>{if(!quiz?.answered)return;showPage('mechanism');mechanismPage.querySelector('[aria-label="Next explanation page"]').click();$('sim-tab-mechanism').focus();});
  $('sim-quiz-next').addEventListener('click',()=>{
    if(!quiz?.next())return;
    if(quiz.complete){state.playing=false;syncPlayback();syncQuizUI();$('sim-quiz-total').textContent=`${quiz.score} of ${quiz.total} correct`;showPage('quiz');$('sim-quiz-again').focus();}
    else loadQuizCase();
  });
  const shellColors = {rest:new THREE.Color('#384d70'), active:new THREE.Color('#f4c76c'), depolarized:new THREE.Color('#88769c'), recovery:new THREE.Color('#60d3c2')};
  let simRenderer, simScene, simCamera, orbit, heartGroup, anatomyGroup, pathwayGroup, vectorArrow, leadArrow;
  const anatomyFields=[];
  const anatomyUniforms={activationTime:{value:0},activationCycle:{value:800},activationStrength:{value:1}};
  let anatomyLoading=false;
  const tissue = [], labels = [], pathways = [], mapPaths = [], mapChambers = [];
  const chamberDefs = [
    {id:'RA', center:[-.48,.57,0], radius:[.43,.38,.31]},
    {id:'LA', center:[.45,.65,-.12], radius:[.4,.34,.31]},
    {id:'RV', center:[-.38,-.35,.16], radius:[.43,.68,.38]},
    {id:'LV', center:[.4,-.4,0], radius:[.44,.75,.43]},
    {id:'septum', center:[.015,-.35,.05], radius:[.065,.56,.32]}
  ];
  const v3 = p => new THREE.Vector3(...p);
  // Both vectors share a point inside the schematic septum. Visibility is a
  // rendering concern; shifting arrows toward the camera breaks rotated views.
  const electricalOrigin = v3([0,-.18,.08]);
  function createLabel(text,position,kind='node') {
    const el = document.createElement('span'); el.className = `sim-pin ${kind}`; el.textContent = text; $('sim-labels').append(el);
    const label = {el,position:v3(position)}; labels.push(label); return label;
  }
  let selectedLeadLabel, mechanismLabel;
  function initialize3d() {
    try {
      simRenderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
      simRenderer.setPixelRatio(Math.min(devicePixelRatio,2)); simRenderer.outputEncoding = THREE.sRGBEncoding;
      simRenderer.toneMapping=THREE.ACESFilmicToneMapping; simRenderer.toneMappingExposure=.92; simRenderer.physicallyCorrectLights=true;
      simRenderer.domElement.setAttribute('aria-label','3D electrical activation of right and left atria and ventricles. Drag to rotate.');
      $('sim-viewport').append(simRenderer.domElement);
      simScene = new THREE.Scene(); simCamera = new THREE.PerspectiveCamera(36,1,.1,50);
      orbit = new THREE.OrbitControls(simCamera,simRenderer.domElement); orbit.enableDamping = true; orbit.enablePan = false; orbit.minDistance = 3.5; orbit.maxDistance = 8; orbit.rotateSpeed = .6;
      const environment=new THREE.PMREMGenerator(simRenderer);
      const roomEnvironment=new THREE.RoomEnvironment();
      simScene.environment=environment.fromScene(roomEnvironment,.03).texture; environment.dispose();
      for(const [color,intensity,position] of [[0xffe2d5,2.2,[-3,4,5]],[0xffece4,1.25,[3,-1,3]],[0xffe9d9,1.6,[1,3,-3]]]) {
        const light=new THREE.DirectionalLight(color,intensity); light.position.set(...position); simScene.add(light);
      }
      simScene.add(new THREE.HemisphereLight(0xc4d6fa,0x352333,.45));
      anatomyGroup=new THREE.Group(); simScene.add(anatomyGroup);
      heartGroup = new THREE.Group(); simScene.add(heartGroup);
      heartGroup.visible=false;
      for(const ch of chamberDefs) {
        const g = new THREE.SphereGeometry(1,44,32);
        const positions = g.attributes.position; const coords = [], colors = new Float32Array(positions.count*3);
        for(let i=0;i<positions.count;i++) {
          const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i); coords.push([x,y,z]);
          // Gentle ventricular taper leaves the apex legible, without pretending to exact anatomy.
          const taper = ch.id.endsWith('V') ? .82+.18*(y+1)/2 : 1;
          positions.setXYZ(i,ch.center[0]+x*ch.radius[0]*taper+(ch.id==='LV'?.075*(-y):0),ch.center[1]+y*ch.radius[1],ch.center[2]+z*ch.radius[2]*taper);
          shellColors.rest.toArray(colors,i*3);
        }
        g.setAttribute('color',new THREE.BufferAttribute(colors,3)); g.computeVertexNormals();
        const mat = new THREE.MeshPhongMaterial({vertexColors:true,transparent:true,opacity:.49,shininess:28,side:THREE.DoubleSide,depthWrite:false});
        const mesh = new THREE.Mesh(g,mat); heartGroup.add(mesh);
        const points = new THREE.Points(g,new THREE.PointsMaterial({vertexColors:true,size:.013,transparent:true,opacity:.85,depthWrite:false})); heartGroup.add(points);
        tissue.push({id:ch.id,geometry:g,coords,arrivals:[]});
        if(ch.id!=='septum')createLabel(ch.id,[ch.center[0]+(ch.center[0]<0?-.32:.32),ch.center[1]-.02,.52],'chamber');
      }
      pathwayGroup = new THREE.Group(); heartGroup.add(pathwayGroup);
      vectorArrow = new THREE.ArrowHelper(v3([1,0,0]),electricalOrigin,.3,0xc7bcff,.10,.05); heartGroup.add(vectorArrow);
      leadArrow = new THREE.ArrowHelper(v3([.5,-.8,0]).normalize(),electricalOrigin,1.05,0x93bce8,.07,.025); heartGroup.add(leadArrow);
      [leadArrow,vectorArrow].forEach((arrow,i)=>{
        for(const part of [arrow.line,arrow.cone]) {
          part.material.transparent=true;part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=8+i;
        }
      });
      createLabel('SA',[-.7,.97,.26]); createLabel('AV',[-.19,.21,.4]); createLabel('His',[.16,.015,.45]);
      selectedLeadLabel=createLabel('II +',electricalOrigin.toArray(),'lead');
      mechanismLabel=createLabel('',[.85,.15,.5]);
      loadAnatomy();
      resetView();
    } catch(error) {
      const el=document.createElement('p'); el.className='sim-error'; el.textContent='3D is unavailable on this device. Use the animated conduction map below.'; $('sim-viewport').append(el);
      setView('map'); $('sim-reset-view').disabled=true;
      console.warn('Simulator 3D unavailable:',error.message);
    }
  }
  function resetView() {
    if(!simCamera) return;
    const anatomical=stage.dataset.view==='anatomy';
    simCamera.position.set(anatomical?.35:0,anatomical?.22:.10,anatomical?5.1:4.9);
    orbit.target.set(0,anatomical?.04:-.04,0); orbit.update();
  }
  function setView(view) {
    stage.dataset.view=view;
    if(anatomyGroup)anatomyGroup.visible=view==='anatomy';
    if(heartGroup)heartGroup.visible=view==='heart';
    root.querySelectorAll('[data-sim-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.simView===view)));
    $('sim-view-hint').textContent=view==='map'?'Same activation clock · pathways shown schematically':view==='anatomy'?'Drag to rotate · scroll to zoom · surface regions are approximate':'Drag to rotate · scroll to zoom · R / L are patient sides';
    resetView();
  }
  root.querySelectorAll('[data-sim-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.simView)));
  $('sim-reset-view').addEventListener('click',resetView);
  $('sim-overlay').addEventListener('change',e=>anatomyUniforms.activationStrength.value=e.target.checked?1:0);
  // The source is one unsegmented sculpt. Coarse surface zones illustrate the
  // existing activation schedule; they are not registered chamber boundaries.
  function surfaceZone(x,y,z) {
    const ventricular=y<.02;
    const chamber=ventricular?(x<.08?'RV':'LV'):(x<-.1?'RA':'LA');
    const cx=chamber==='RV'?-.3:chamber==='LV'?.29:chamber==='RA'?-.43:.2;
    const cy=ventricular?-.49:.2;
    const coords=[(x-cx)/(ventricular?.38:.32),(y-cy)/(ventricular?.62:.29),z/.43];
    // Fade at the great-vessel roots rather than animating the aorta as muscle.
    const mask=Math.max(0,Math.min(1,(.5-y)/.17));
    return {chamber,coords,mask};
  }
  function refreshAnatomyTiming() {
    if(!model)return;
    for(const field of anatomyFields) {
      const timing=field.geometry.attributes.activationSchedule;
      field.zones.forEach((zone,i)=>{
        const a=model.activation(zone.chamber,...zone.coords);
        timing.setXYZW(i,a.onset,a.recovery,a.recoveryDuration||48,zone.mask);
      });
      timing.needsUpdate=true;
    }
    anatomyUniforms.activationCycle.value=model.cycleMs;
  }
  function loadAnatomy() {
    if(anatomyLoading)return; anatomyLoading=true;
    const status=$('sim-anatomy-status'); status.hidden=false; status.textContent='Loading textured heart…';
    stage.dataset.anatomyState='loading';
    new THREE.GLTFLoader().load('assets/heart.glb',gltf=>{
      gltf.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const scale=2.3/Math.max(size.x,size.y,size.z);
      gltf.scene.traverse(node=>{
        if(!node.isMesh)return;
        const geometry=node.geometry.clone(); geometry.applyMatrix4(node.matrixWorld); geometry.translate(-center.x,-center.y,-center.z); geometry.scale(scale,scale,scale);
        const positions=geometry.attributes.position,zones=[];
        for(let i=0;i<positions.count;i++)zones.push(surfaceZone(positions.getX(i),positions.getY(i),positions.getZ(i)));
        geometry.setAttribute('activationSchedule',new THREE.BufferAttribute(new Float32Array(positions.count*4),4));
        anatomyFields.push({geometry,zones});
        const source=node.material;
        const material=new THREE.MeshPhysicalMaterial({map:source.map,normalMap:source.normalMap,normalScale:new THREE.Vector2(.8,.8),roughnessMap:source.roughnessMap,roughness:.88,metalness:0,envMapIntensity:.52,clearcoat:.12,clearcoatRoughness:.34,side:THREE.DoubleSide});
        [material.map,material.normalMap,material.roughnessMap].forEach(texture=>{if(texture){texture.anisotropy=Math.min(8,simRenderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;}});
        material.onBeforeCompile=shader=>{
          Object.assign(shader.uniforms,anatomyUniforms);
          shader.vertexShader='attribute vec4 activationSchedule; varying vec4 vActivationSchedule;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvActivationSchedule = activationSchedule;');
          shader.fragmentShader='varying vec4 vActivationSchedule; uniform float activationTime; uniform float activationCycle; uniform float activationStrength;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
            float depolAge = mod(activationTime - vActivationSchedule.x + 2.0 * activationCycle, activationCycle);
            float recoveryAge = mod(activationTime - vActivationSchedule.y + 2.0 * activationCycle, activationCycle);
            float front = 1.0 - smoothstep(0.0, 10.0, abs(depolAge - 6.0));
            front *= 1.0 - step(16.0, depolAge);
            float recovery = sin(clamp(recoveryAge / vActivationSchedule.z, 0.0, 1.0) * 3.14159265);
            float plateau = step(22.0, depolAge) * (1.0 - step(mod(vActivationSchedule.y - vActivationSchedule.x + activationCycle, activationCycle), depolAge));
            vec3 electricalGlow = vec3(1.0, 0.52, 0.075) * front * 0.32 + vec3(0.04, 0.55, 0.4) * recovery * 0.14 + vec3(0.2, 0.08, 0.25) * plateau * 0.035;
            totalEmissiveRadiance += electricalGlow * vActivationSchedule.w * activationStrength;`);
        };
        const mesh=new THREE.Mesh(geometry,material); mesh.name='Textured anatomical heart with electrical overlay'; anatomyGroup.add(mesh);
      });
      anatomyLoading=false; status.hidden=true; stage.dataset.anatomyState='ready'; refreshAnatomyTiming();
    },undefined,()=>{
      anatomyLoading=false; stage.dataset.anatomyState='error';
      status.innerHTML='Textured heart could not load. <button type="button">Retry</button>';
      status.querySelector('button').addEventListener('click',loadAnatomy);
    });
  }
  function pathColor(path) { return path.blocked ? '#ad6a7f' : path.accessory ? '#ed98ab' : '#aeb8ee'; }
  function rebuildPaths() {
    if(mechanismLabel) {
      mechanismLabel.el.hidden=!['rbbb','lbbb','wpw','avrt'].includes(state.scenario);
      mechanismLabel.el.textContent=quizBlind()?'':({rbbb:'RBB blocked',lbbb:'LBB blocked',wpw:'Bypass ↓',avrt:'Return ↑'}[state.scenario]||'');
      mechanismLabel.position.set(state.scenario==='rbbb'?-.53:.86,state.scenario==='rbbb'||state.scenario==='lbbb'?-.17:.22,.5);
    }
    if(pathwayGroup) {
      while(pathwayGroup.children.length) {
        const child=pathwayGroup.children[0]; pathwayGroup.remove(child); child.geometry?.dispose(); child.material?.dispose();
      }
      pathways.length=0;
      for(const path of model.paths) {
        const pts=path.points.map(v3); const curve=new THREE.CatmullRomCurve3(pts);
        const mat=new THREE.MeshBasicMaterial({color:pathColor(path),transparent:true,opacity:path.blocked?.23:.46,depthTest:false});
        const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,36,.009,5,false),mat); mesh.renderOrder=5; pathwayGroup.add(mesh);
        const dot=new THREE.Mesh(new THREE.SphereGeometry(.026,10,8),new THREE.MeshBasicMaterial({color:path.accessory?0xed98ab:0xffd784,depthTest:false})); dot.renderOrder=6; pathwayGroup.add(dot);
        pathways.push({path,curve,dot,mat});
        if(path.blocked) {
          const p=curve.getPoint(.4); const crossG=new THREE.BufferGeometry().setFromPoints([p.clone().add(v3([-.05,-.05,.025])),p.clone().add(v3([.05,.05,.025])),p.clone().add(v3([-.05,.05,.025])),p.clone().add(v3([.05,-.05,.025]))]);
          const cross=new THREE.LineSegments(crossG,new THREE.LineBasicMaterial({color:0xf59dac,depthTest:false})); cross.renderOrder=7; pathwayGroup.add(cross);
        }
      }
      for(const field of tissue) field.arrivals=field.coords.map(c=>model.activation(field.id,...c));
    }
    buildMap();
    refreshAnatomyTiming();
  }
  function buildMap() {
    // Curves use the same control points and parameter as the 3D pathways.
    // Contours are a schematic cutaway, not registered anatomical boundaries.
    const contours = {
      RA:'M -68 -92 C -92 -94 -104 -69 -97 -40 C -95 -21 -77 -12 -56 -16 C -36 -20 -21 -20 -13 -30 C -15 -54 -30 -80 -68 -92 Z',
      LA:'M 12 -73 C 30 -91 57 -98 76 -80 C 90 -65 91 -43 80 -30 C 63 -19 32 -24 12 -28 C 4 -41 2 -59 12 -73 Z',
      RV:'M -85 -9 C -66 -5 -41 -14 -20 -14 C -9 -1 -14 19 -10 42 C -7 60 -7 79 5 98 C -20 91 -59 70 -75 44 C -86 25 -93 3 -85 -9 Z',
      LV:'M 13 -15 C 35 -10 61 -12 80 -17 C 98 9 86 57 60 90 C 52 103 44 112 35 115 C 17 100 5 79 5 52 C 4 27 -1 2 13 -15 Z'
    };
    const outline='M -68 -100 C -102 -103 -115 -60 -106 -27 C -102 29 -73 82 -20 104 L 34 125 C 70 107 98 65 104 24 C 113 -21 97 -83 76 -94 C 49 -111 22 -91 3 -70 C -18 -87 -41 -103 -68 -100 Z';
    mapPaths.length=0; mapChambers.length=0;
    const routes=model.paths.map((path,i)=>{
      const curve=new THREE.CatmullRomCurve3(path.points.map(v3));
      const points=curve.getPoints(80); const distances=[0];
      for(let j=1;j<points.length;j++)distances.push(distances[j-1]+Math.hypot(points[j].x-points[j-1].x,points[j].y-points[j-1].y)*100);
      const d=points.map((p,j)=>`${j?'L':'M'}${(p.x*100).toFixed(2)} ${(-p.y*100).toFixed(2)}`).join(' ');
      mapPaths.push({path,curve,distances});
      const block=curve.getPoint(.4);
      return `<g class="sim-map-route ${path.blocked?'is-blocked':''} ${path.accessory?'is-accessory':''} ${path.id==='myocardial-spread'?'is-myocardial':''}">
        <path class="sim-map-track-shadow" d="${d}"/><path id="sim-map-path-${i}" class="sim-map-track" d="${d}"/>
        <path id="sim-map-trail-${i}" class="sim-map-trail" d="${d}"/>
        <g id="sim-map-dot-${i}" class="sim-map-impulse"><circle r="6" class="sim-map-glow"/><circle r="2.1"/><circle r=".85" fill="#fff9df"/></g>
        ${path.blocked?`<g class="sim-map-block" transform="translate(${block.x*100} ${-block.y*100})"><circle r="5.6"/><path d="M -2 -2 L 2 2 M 2 -2 L -2 2"/></g>`:''}
      </g>`;
    }).join('');
    const anomaly=quizBlind()?null:({rbbb:['RBB blocked',-48,12],lbbb:['LBB blocked',49,12],wpw:['Accessory ↓',106,-58],avrt:['Return ↑',108,-58]}[state.scenario]);
    $('sim-map').innerHTML=`<title id="sim-map-title">Cardiac conduction map</title><desc id="sim-map-description">Schematic four-chamber cutaway. Gold pulses follow the shared electrical clock through smooth conduction pathways. Patient right is on the left of the drawing.</desc>
      <defs>
        <linearGradient id="sim-map-wall" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#405469"/><stop offset=".45" stop-color="#293a51"/><stop offset="1" stop-color="#405068"/></linearGradient>
        <linearGradient id="sim-map-right" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#284a60"/><stop offset="1" stop-color="#1c2c42"/></linearGradient>
        <linearGradient id="sim-map-left" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#45435b"/><stop offset="1" stop-color="#252c43"/></linearGradient>
        <filter id="sim-map-bloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5"/></filter>
      </defs>
      <path class="sim-map-silhouette" d="${outline}"/>
      <g class="sim-map-chambers">${Object.entries(contours).map(([id,d])=>`<path class="sim-map-chamber" d="${d}" fill="url(#sim-map-${id.startsWith('R')?'right':'left'})"/><path id="sim-map-field-${id}" d="${d}" opacity="0"/>`).join('')}</g>
      <g class="sim-map-valves"><path d="M -80 -12 Q -50 -7 -23 -18 M 19 -19 Q 40 -9 75 -21"/><path d="M -66 -11 L -50 2 L -30 -14 M 29 -16 L 47 -2 L 65 -17"/></g>
      <g class="sim-map-arbor">
        <path d="M -48 54 Q -64 43 -70 18 M -48 54 Q -49 70 -22 80 M -48 54 Q -69 50 -70 30 M -48 54 Q -30 70 -18 52"/>
        <path d="M 45 67 Q 70 53 75 14 M 45 67 Q 61 77 38 100 M 45 67 Q 29 79 20 51 M 45 67 Q 70 70 79 40"/>
      </g>
      <g class="sim-map-routes">${routes}</g>
      <g class="sim-map-nodes"><circle cx="-69" cy="-82" r="3.1"/><circle cx="-7" cy="-18" r="3.6"/><circle cx="0" cy="-1" r="2.3"/></g>
      <g class="sim-map-node-labels">
        <path d="M -74 -83 L -104 -96 L -134 -96 M -12 -20 L -33 -33 M 5 -1 L 23 -1"/>
        <text x="-134" y="-101">SA node</text><text x="-35" y="-37">AV node</text><text x="26" y="2">His</text>
      </g>
      <g class="sim-map-chamber-labels"><text x="-70" y="-43">RA</text><text x="49" y="-43">LA</text><text x="-50" y="30">RV</text><text x="49" y="30">LV</text></g>
      <g class="sim-map-orientation"><text x="-84" y="138">PATIENT RIGHT</text><text x="63" y="138">PATIENT LEFT</text></g>
      ${anomaly?`<text class="sim-map-anomaly" x="${anomaly[1]}" y="${anomaly[2]}" text-anchor="middle">${anomaly[0]}</text>`:''}`;
    mapPaths.forEach((item,i)=>Object.assign(item,{dot:$(`sim-map-dot-${i}`),trail:$(`sim-map-trail-${i}`)}));
    Object.keys(contours).forEach(id=>mapChambers.push({el:$(`sim-map-field-${id}`),regions:model.regions.filter(r=>r.chamber===id)}));
  }
  function leadDirection() {
    return v3(api.leadAxes[state.lead]).normalize();
  }
  function syncLead() {
    const caption={I:'left lateral',II:'inferior view',III:'inferior view',aVR:'right shoulder',aVL:'left lateral',aVF:'inferior view',V1:'right precordial',V2:'septal view',V3:'anterior view',V4:'anterior view',V5:'left lateral',V6:'left lateral'};
    $('sim-selected-lead').textContent=`${state.lead} · ${caption[state.lead]}`; canvases[0].setAttribute('aria-label',`Lead ${state.lead} simulated ECG`);
    if(leadArrow) { const dir=leadDirection(); leadArrow.setDirection(dir); selectedLeadLabel.position.copy(electricalOrigin).addScaledVector(dir,1.16); selectedLeadLabel.el.textContent=`${state.lead} +`;selectedLeadLabel.el.title=`Lead ${state.lead}: positive sensing direction`; }
    buildTraceCache();
  }
  function setScenario(id) {
    state.scenario=id; const sc=scenarios.find(s=>s.id===id); params={...sc.defaults,scenario:id}; state.time=0; state.inspectedEvent=null;
    $('sim-scenario-select').value=id;
    root.querySelectorAll('[data-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scenario===id)));
    $('sim-rate').min=id==='avrt'?150:50; $('sim-rate').max=id==='avrt'?200:120;
    $('sim-av').min=id==='avblock'?200:110; $('sim-av').max=id==='avblock'?240:190;
    $('sim-av-row').hidden=id==='avrt'; $('sim-branch-row').hidden=!['rbbb','lbbb'].includes(id); $('sim-accessory-row').hidden=id!=='wpw';
    $('sim-param-hint').textContent=id==='avrt'?'Rate and forward conduction time are linked to close the re-entry loop. The accessory pathway carries activation back to the atria.':id==='wpw'?'One left free-wall bypass. Earlier breakthrough increases pre-excitation before normal conduction catches up.':'P onset → His includes atrial and AV conduction. It is not AV-node delay alone.';
    $('sim-mechanism-title').textContent=choices[id][0];
    $('sim-mechanism-copy').textContent=[sc.mechanism,sc.ecg].filter(Boolean).join(' ');
    rebuild(); syncLead();
  }
  function rebuild() {
    state.inspectedEvent=null;
    model=api.createModel(params); params={...params,...model.params};
    normal=api.createModel({scenario:'normal',bpm:params.bpm,avDelay:150});
    state.time=Math.min(state.time,model.cycleMs-1); $('sim-scrub').max=Math.floor(model.cycleMs-1);
    for(const [control,param,unit] of [['rate','bpm','bpm'],['av','avDelay','ms'],['branch','branchDelay','ms'],['accessory','accessory','ms']]) {
      const value=params[param]??0; $(`sim-${control}`).value=value; $(`sim-${control}-out`).textContent=`${Math.round(value)} ${unit}`;
      $(`sim-${control}`).setAttribute('aria-valuetext',`${Math.round(value)} ${unit}`);
    }
    $('sim-pr-label').textContent=state.scenario==='avrt'?'RP':'PR';
    $('sim-pr').textContent=state.scenario==='avrt'?'100 ms':`${Math.round(model.prMs)} ms`;
    $('sim-qrs').textContent=`${Math.round(model.qrsMs)} ms`; $('sim-cycle').textContent=`${Math.round(model.cycleMs)} ms`;
    currentEvents=model.events.map(e=>({...e,time:e.time%model.cycleMs})).sort((a,b)=>a.time-b.time);
    $('sim-event-select').innerHTML='<option value="rest" disabled>Quiet interval</option>'+currentEvents.map(e=>`<option value="${e.id}">${e.label} · ${Math.round(e.time)} ms</option>`).join('');
    phaseId=''; rebuildPaths(); buildTraceCache(); update();
  }
  function syncPlayback() { $('sim-play').textContent=state.playing?'Ⅱ Pause':'▶ Play'; $('sim-play').setAttribute('aria-label',state.playing?'Pause electrical simulation':'Play electrical simulation'); }
  function seek(t,eventId=null) { state.playing=false; state.inspectedEvent=eventId; phaseId=''; state.time=Math.max(0,Math.min(model.cycleMs-1,t)); syncPlayback(); update(); drawTraces(); }
  function seekEvent(id){const event=currentEvents.find(e=>e.id===id);if(event)seek(event.time,event.id);}
  $('sim-event-select').addEventListener('change',e=>seekEvent(e.target.value));
  $('sim-prev-event').addEventListener('click',()=>{const next=[...currentEvents].reverse().find(e=>e.time<state.time-.5)||currentEvents[currentEvents.length-1];seekEvent(next.id);});
  $('sim-next-event').addEventListener('click',()=>{const next=currentEvents.find(e=>e.time>state.time+.5)||currentEvents[0];seekEvent(next.id);});
  $('sim-play').addEventListener('click',()=>{state.playing=!state.playing;state.inspectedEvent=null;syncPlayback();});
  $('sim-step').addEventListener('click',()=>seek((state.time+10)%model.cycleMs));
  $('sim-scrub').addEventListener('input',e=>seek(Number(e.target.value)));
  $('sim-speed').addEventListener('change',e=>state.speed=Number(e.target.value));
  $('sim-lead').addEventListener('change',e=>{state.lead=e.target.value;syncLead();drawTraces();});
  $('sim-compare').addEventListener('change',e=>{state.compare=e.target.checked;drawTraces();});
  $('sim-reset').addEventListener('click',()=>setScenario(state.scenario));
  for(const [control,param] of [['rate','bpm'],['av','avDelay'],['branch','branchDelay'],['accessory','accessory']]) $( `sim-${control}`).addEventListener('input',e=>{params[param]=Number(e.target.value);rebuild();});
  const tempColor=new THREE.Color();
  function periodicAge(t,onset) { return ((t-onset)%model.cycleMs+model.cycleMs)%model.cycleMs; }
  function update() {
    if(!model) return;
    anatomyUniforms.activationTime.value=state.time;
    $('sim-time').textContent=`${Math.floor(state.time)} ms`; $('sim-scrub').value=state.time;
    const phase=model.events.find(e=>e.id===state.inspectedEvent)||model.phase(state.time);
    const concurrent=model.events.filter(e=>e.id!==phase.id&&periodicAge(state.time,e.time)<e.end-e.time);
    const key=phase.id+concurrent.map(e=>e.id).join();
    if(phaseId!==key) {
      phaseId=key; $('sim-phase-title').textContent=phase.label; $('sim-phase-description').textContent=phase.description+(concurrent.length?' Also occurring: '+concurrent.map(e=>e.label.toLowerCase()).join('; ')+'.':'');
      $('sim-event-select').value=phase.id;
    }
    if(simRenderer) {
      for(const field of tissue) {
        const colors=field.geometry.attributes.color;
        for(let i=0;i<field.arrivals.length;i++) {
          const a=field.arrivals[i]; const age=periodicAge(state.time,a.onset); const recoveryAge=periodicAge(state.time,a.recovery);
          tempColor.copy(shellColors.rest);
          const duration=(a.recovery-a.onset+model.cycleMs)%model.cycleMs;
          if(age<20) tempColor.lerp(shellColors.active,Math.sin(Math.PI*age/20));
          else if(age<duration) tempColor.lerp(shellColors.depolarized,.68);
          const recoveryDuration=a.recoveryDuration||48;
          if(recoveryAge<recoveryDuration) tempColor.lerp(shellColors.recovery,Math.sin(Math.PI*recoveryAge/recoveryDuration)*.95);
          colors.setXYZ(i,tempColor.r,tempColor.g,tempColor.b);
        }
        colors.needsUpdate=true;
      }
      for(const item of pathways) {
        const progress=(state.time-item.path.start)/(item.path.end-item.path.start);
        item.dot.visible=!item.path.blocked&&progress>=0&&progress<=1;
        if(item.dot.visible)item.dot.position.copy(item.curve.getPoint(Math.min(1,Math.max(0,progress))));
        item.mat.opacity=item.dot.visible?.85:item.path.blocked?.2:.4;
      }
      const vector=v3(model.vector(state.time)); const magnitude=vector.length(); vectorArrow.visible=magnitude>.025;
      if(vectorArrow.visible){vectorArrow.setDirection(vector.normalize());vectorArrow.setLength(Math.min(.95,magnitude*.7),.10,.045);}
    }
    for(const {path,curve,distances,dot,trail} of mapPaths) {
      const progress=(state.time-path.start)/(path.end-path.start);
      const active=!path.blocked&&progress>=0&&progress<=1;
      dot.style.display=trail.style.display=active?'':'none';
      if(!active)continue;
      const point=curve.getPoint(progress), sample=progress*(distances.length-1), index=Math.min(distances.length-2,Math.floor(sample));
      const head=distances[index]+(distances[index+1]-distances[index])*(sample-index), tail=Math.min(12,head);
      dot.setAttribute('transform',`translate(${point.x*100} ${-point.y*100})`);
      trail.setAttribute('stroke-dasharray',`${tail} ${distances[distances.length-1]+1}`);
      trail.setAttribute('stroke-dashoffset',-(head-tail));
    }
    for(const {el,regions} of mapChambers) {
      let activation=0,recovery=0,plateau=0;
      for(const region of regions) {
        const age=periodicAge(state.time,region.onset), recoverAge=periodicAge(state.time,region.recoveryStart);
        if(age<region.duration)activation=Math.max(activation,Math.sin(Math.PI*age/region.duration));
        else if(age<region.recoveryStart-region.onset)plateau=.12;
        if(recoverAge<region.recoveryEnd-region.recoveryStart)recovery=Math.max(recovery,Math.sin(Math.PI*recoverAge/(region.recoveryEnd-region.recoveryStart)));
      }
      el.setAttribute('fill',recovery>.1?'#60d3c2':activation>.1?'#f4c76c':'#88769c');
      el.setAttribute('opacity',Math.max(activation*.25,recovery*.2,plateau));
    }
  }
  function buildTraceCache() {
    if(!model)return; const leads=[state.lead,'V1','V6'];
    traceCache=leads.map(lead=>{
      const n=Math.ceil(model.cycleMs);const current=new Float32Array(n+1),reference=new Float32Array(n+1);
      for(let t=0;t<=n;t++){current[t]=model.sample(lead,Math.min(t,model.cycleMs-.001));reference[t]=normal.sample(lead,Math.min(t,normal.cycleMs-.001));}
      return {current,reference};
    });
  }
  function drawTraces() {
    if(!model||!traceCache.length)return;
    canvases.forEach((canvas,idx)=>{
      const ctx=canvas.getContext('2d'), w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
      const dpr=Math.min(devicePixelRatio,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#fffdfd';ctx.fillRect(0,0,w,h);
      const left=16,right=w-12, span=right-left, zero=h*.55, scale=h*.28;
      const toX=t=>left+t/model.cycleMs*span;
      for(let t=0;t<=model.cycleMs;t+=20){ctx.strokeStyle=t%100===0?'#ecd9df':'#f5e9ec';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(toX(t),0);ctx.lineTo(toX(t),h);ctx.stroke();}
      for(let y=zero%7;y<h;y+=7){ctx.strokeStyle='#f3e7eb';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      if(!quizBlind()){ctx.fillStyle='#f2cd7220';ctx.fillRect(toX(model.prMs),0,model.qrsMs/model.cycleMs*span,h);}
      function line(values,color,width,dash=[]) {
        ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();
        for(let x=0;x<=span;x++){const t=x/span*model.cycleMs;const ix=Math.min(values.length-1,Math.floor(t));const y=zero-values[ix]*scale;if(x===0)ctx.moveTo(left+x,y);else ctx.lineTo(left+x,y);}
        ctx.stroke();ctx.setLineDash([]);
      }
      if(state.compare&&state.scenario!=='normal')line(traceCache[idx].reference,'#aab5c9',1,[3,3]);
      line(traceCache[idx].current,'#3f527e',1.65);
      const cursor=toX(state.time);ctx.strokeStyle='#cc9c39';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cursor,0);ctx.lineTo(cursor,h);ctx.stroke();
      const value=model.sample([state.lead,'V1','V6'][idx],state.time);ctx.fillStyle='#c99530';ctx.beginPath();ctx.arc(cursor,zero-value*scale,3.1,0,2*Math.PI);ctx.fill();
      ctx.fillStyle='#939bac';ctx.font='8px -apple-system,sans-serif';ctx.textAlign='right';ctx.fillText(`${Math.round(model.cycleMs)} ms`,w-8,h-5);
      if(idx===0&&!quizBlind()){ctx.textAlign='left';ctx.fillText('QRS',Math.min(w-30,toX(model.prMs)+3),h-5);}
    });
  }
  canvases.forEach(canvas=>canvas.addEventListener('pointerdown',e=>{const rect=canvas.getBoundingClientRect();seek((e.clientX-rect.left-16)/(rect.width-28)*model.cycleMs);}));
  function resize() {
    if(simRenderer){const w=$('sim-viewport').clientWidth,h=$('sim-viewport').clientHeight;if(w&&h){simRenderer.setSize(w,h,false);simCamera.aspect=w/h;simCamera.updateProjectionMatrix();}}
    drawTraces();
  }
  new ResizeObserver(resize).observe(root);
  function workspace(value) {
    document.body.dataset.workspace=value;
    nav.querySelectorAll('[data-workspace]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspace===value)));
    if(value==='explorer') { if(typeof resizeRenderer==='function')resizeRenderer();if(typeof resizeEcgCanvases==='function')resizeEcgCanvases(); }
    else resize();
  }
  nav.querySelectorAll('button[data-workspace]').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.workspace;workspace(b.dataset.workspace);}));
  addEventListener('hashchange',()=>workspace(location.hash==='#explorer'?'explorer':'simulator'));
  document.addEventListener('keydown',e=>{
    if(document.body.dataset.workspace!=='simulator'||/INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName))return;
    if(e.code==='Space'){e.preventDefault();state.playing=!state.playing;state.inspectedEvent=null;syncPlayback();}
    else if(e.code==='ArrowRight'){e.preventDefault();seek((state.time+10)%model.cycleMs);}
    else if(e.code==='ArrowLeft'){e.preventDefault();seek((state.time-10+model.cycleMs)%model.cycleMs);}
  });
  initialize3d();setScenario('normal');setView(simRenderer?'anatomy':'map');syncQuizUI();syncPlayback();workspace(location.hash==='#explorer'?'explorer':'simulator');
  function frame(now) {
    const dt=lastFrame?Math.min(now-lastFrame,80):0;lastFrame=now;
    if(document.body.dataset.workspace==='simulator'&&!document.hidden){
      if(state.playing)state.time=(state.time+dt*state.speed)%model.cycleMs;
      update();drawTraces();
      if(simRenderer&&stage.dataset.view!=='map'){
        orbit.update();simRenderer.render(simScene,simCamera);
        for(const l of labels){const p=l.position.clone().project(simCamera);l.el.style.left=`${(p.x+1)*.5*stage.clientWidth}px`;l.el.style.top=`${Math.min(l===selectedLeadLabel?stage.clientHeight-95:stage.clientHeight,(1-p.y)*.5*stage.clientHeight)}px`;l.el.hidden=p.z>1||(l===mechanismLabel&&!l.el.textContent);}
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
