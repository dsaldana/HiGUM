const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path'),site=path.resolve(__dirname,'..');
const kinds=['sources','binary','wrf','voxels','octree','dynamics','nmpc','fleet4','fleet5'];
let draws=0,frame;const resizes=[];
const context=new Proxy({}, {get(t,k){return t[k]??((...args)=>{for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),`Nonfinite canvas value: ${k}`);draws++;});},set(t,k,v){t[k]=v;return true;}});
function element(){return {handlers:{},value:'0',textContent:'',clientWidth:600,clientHeight:375,hidden:false,addEventListener(e,cb){this.handlers[e]=cb;},setAttribute(){},closest(){return null;},setPointerCapture(){}};}
const hosts=kinds.map(kind=>{const h=element();h.dataset={animation:kind,label:kind};h.children={canvas:element(),'.native-play':element(),'.native-reset':element(),input:element(),'.native-status':element(),'.native-next':element()};h.children.canvas.getContext=()=>context;h.querySelector=s=>h.children[s];return h;});
const sandbox={window:{},devicePixelRatio:1,console,document:{hidden:false,querySelectorAll:()=>hosts,getElementById:()=>element(),addEventListener(){}},requestAnimationFrame:cb=>{frame=cb;},ResizeObserver:class{constructor(cb){this.cb=cb;resizes.push(cb);}observe(){this.cb();}},IntersectionObserver:class{constructor(cb){this.cb=cb;}observe(){this.cb([{isIntersecting:true}]);}}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(site,'assets/data/animations.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(path.join(site,'animations.js'),'utf8'),sandbox);
for(const width of [360,600,1200])for(const host of hosts){host.children.canvas.clientWidth=width;resizes.forEach(cb=>cb());for(const p of [0,100,333,500,750,999,1000]){const input=host.children.input;input.value=String(p);input.handlers.input();frame(1000+p);assert(host.children['.native-status'].textContent.length>0);}host.children['.native-reset'].handlers.click();host.children['.native-play'].handlers.click();frame(3000);frame(3050);assert.equal(host.children['.native-play'].textContent,'Pause');host.children['.native-play'].handlers.click();}
const d=sandbox.window.HIGUM_ANIMATIONS;
for(const [level,fleet] of Object.entries(d.fleets))for(const vehicle of fleet.vehicles){assert.equal(vehicle.accepted.length,vehicle.route.length);assert.equal(vehicle.accepted.at(-1),vehicle.trajectory.length-1);vehicle.accepted.forEach((index,i)=>assert(Math.hypot(vehicle.trajectory[index][0]-vehicle.route[i][0],vehicle.trajectory[index][1]-vehicle.route[i][1])<3));}
console.log('All 9 scenes render without nonfinite geometry; start, intermediate, final, reset and play states pass. Exact fleet acceptance events pass. Drawing calls:',draws);
const model=d.dynamics;
assert(model && model.states.length===model.controls.length+1);
model.controls.forEach((delta,i)=>{
  const before=model.states[i],after=model.states[i+1];
  const increment=[model.dt*model.speed*Math.cos(before[2]),model.dt*model.speed*Math.sin(before[2]),model.dt*model.speed/model.length*Math.tan(delta)];
  increment.forEach((expected,j)=>assert(Math.abs(after[j]-before[j]-expected)<1e-8));
  assert(Math.abs(delta)<=model.steeringLimit);
});
const deck=fs.readFileSync(path.join(site,'slides.html'),'utf8');
const navigation=deck.match(/<script id="higum-click-navigation">([\s\S]*?)<\/script>/)[1];
let advances=0,paused=false,configuration;
const video={duration:30,currentTime:8,ended:false,pause(){paused=true;}};
let note='Every colored node has now been accepted';
const nav={document:{addEventListener(){}},Reveal:{isOverview:()=>false,isPaused:()=>false,getCurrentSlide:()=>({querySelector:()=>({textContent:note}),slideBackgroundContentElement:{querySelector:()=>video}}),next(){advances++;},configure(c){configuration=c;},addKeyBinding(){}}};
vm.createContext(nav);vm.runInContext(navigation,nav);nav.higumAdvance();assert(paused);assert.equal(advances,0);assert(video.currentTime>29.9);nav.higumAdvance();assert.equal(advances,1);assert.equal(configuration.autoSlide,false);
console.log('Exact Euler state equations and finish-then-hold trajectory navigation pass.');
