/* Native Canvas animations of the numerical slide data. No media playback. */
"use strict";
(() => {
  const data = window.HIGUM_ANIMATIONS;
  if (!data) return;
  const colors = ['#62d9e8','#ffb15b','#c78bfa','#96e6a1','#fa8caa','#e4db71','#93b5ff','#ee99de'];
  const players = [];
  let speed = 1;
  const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
  const mix = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
  const heat = (value, dataset) => {
    const f = dataset.log ? v=>Math.log10(Math.max(v,1e-12)) : v=>v;
    const t=clamp((f(value)-f(dataset.range[0]))/(f(dataset.range[1])-f(dataset.range[0]))) * 3;
    const stops=[[75,66,124],[182,91,148],[245,144,103],[255,213,138]], i=Math.min(2,Math.floor(t));
    return `rgb(${mix(stops[i],stops[i+1],t-i).map(Math.round).join(',')})`;
  };
  function rings(node) {
    const result=[];
    for(let plane=0;plane<3;plane++) for(const offset of [0,.55]) {
      result.push(Array.from({length:49},(_,i)=>{
        const a=i/48*Math.PI*2, p=[0,0,0];
        p[plane]=offset; p[(plane+1)%3]=Math.cos(a)*Math.sqrt(1-offset*offset); p[(plane+2)%3]=Math.sin(a)*Math.sqrt(1-offset*offset);
        return node.mean.map((v,j)=>v+node.basis[j].reduce((s,b,k)=>s+b*p[k],0));
      }));
    }
    return result;
  }
  const corners = c => Array.from({length:8},(_,i)=>c.lower.map((v,j)=>v+((i>>j)&1)*c.side[j]));
  const edges = [];
  for(let i=0;i<8;i++) for(let j=0;j<3;j++) if(!(i&(1<<j))) edges.push([i,i^(1<<j)]);

  class Player {
    constructor(host) {
      this.host=host; this.kind=host.dataset.animation; this.fleet=this.kind.startsWith('fleet');
      this.motion=this.fleet || this.kind==='dynamics'; this.is3d=!this.motion && this.kind!=='nmpc';
      this.progress=0; this.playing=false; this.visible=false; this.dirty=true; this.yaw=.65; this.pitch=.4;
      this.width=0; this.height=0; this.last=0;
      this.dataset=data.datasets[this.kind==='binary'?'fig2':this.kind==='wrf'?'wrf':'fig1'];
      if(this.is3d) {
        this.geometry=this.dataset.levels.map(l=>l.nodes.map(n=>({rings:rings(n),color:heat(n.concentration,this.dataset)})));
        this.stages=['Sample locations',...(this.kind==='voxels' || this.kind==='octree' ? this.dataset[this.kind].map(s=>s.name) : this.dataset.levels.map((_,i)=>`Level ${i} · ${2**i} ${i===0?'Gaussian':'Gaussians'}`))];
        this.bounds3d=this.kind==='voxels'||this.kind==='octree'?corners(this.dataset.root):this.dataset.points.concat(this.geometry.flatMap(level=>level.flatMap(n=>n.rings.flat())));
      } else if(this.kind==='nmpc') this.stages=['Measure current state','Optimize N future controls','Apply first control only','Measure again and repeat'];
      this.duration=this.motion?30:Math.max(1,this.stages.length-1)*4.8;
      this.host.innerHTML=`<canvas tabindex="0" role="img" aria-label="${host.dataset.label}${this.is3d?'. Drag or use arrow keys to rotate.':''}"></canvas><div class="native-toolbar"><button type="button" class="native-play" aria-pressed="false">Play</button><button type="button" class="native-reset" aria-label="Restart ${host.dataset.label}">↺</button><input class="native-timeline" type="range" min="0" max="1000" value="0" aria-label="${this.motion?'Animation progress':'Animation step'}"><button type="button" class="native-next">${this.motion?'Finish':'Next step'}</button></div><p class="native-status" role="status" aria-live="polite"></p>${this.is3d?'<p class="native-hint">Drag to rotate · Arrow keys rotate · Step through or press Play</p>':''}`;
      this.canvas=host.querySelector('canvas'); this.ctx=this.canvas.getContext('2d');
      this.playButton=host.querySelector('.native-play'); this.slider=host.querySelector('input'); this.status=host.querySelector('.native-status'); this.next=host.querySelector('.native-next');
      this.playButton.addEventListener('click',()=>{if(this.progress>=1)this.progress=0;this.setPlaying(!this.playing);});
      host.querySelector('.native-reset').addEventListener('click',()=>{this.setPlaying(false);this.setProgress(0);this.yaw=.65;this.pitch=.4;});
      this.slider.addEventListener('input',()=>{this.setPlaying(false);this.setProgress(Number(this.slider.value)/1000);});
      this.next.addEventListener('click',()=>{this.setPlaying(false);this.setProgress(this.motion?1:Math.min(1,(Math.floor(this.progress*(this.stages.length-1)+1e-6)+1)/(this.stages.length-1)));});
      if(this.is3d) {
        this.canvas.addEventListener('pointerdown',e=>{this.pointer=[e.clientX,e.clientY];this.canvas.setPointerCapture(e.pointerId);this.setPlaying(false);});
        this.canvas.addEventListener('pointermove',e=>{if(!this.pointer)return;this.yaw+=(e.clientX-this.pointer[0])*.006;this.pitch=clamp(this.pitch+(e.clientY-this.pointer[1])*.005,-.8,1.2);this.pointer=[e.clientX,e.clientY];this.dirty=true;});
        ['pointerup','pointercancel'].forEach(name=>this.canvas.addEventListener(name,()=>{this.pointer=null;}));
        this.canvas.addEventListener('keydown',e=>{const delta={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.1],ArrowDown:[0,-.1]}[e.key];if(delta){e.preventDefault();this.yaw+=delta[0];this.pitch=clamp(this.pitch+delta[1],-.8,1.2);this.dirty=true;}});
      }
      new ResizeObserver(()=>{const width=this.canvas.clientWidth;if(!width)return;this.width=width;this.height=this.canvas.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=width*dpr;this.canvas.height=this.height*dpr;this.ctx.setTransform(dpr,0,0,dpr,0,0);this.dirty=true;}).observe(this.canvas);
      new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;if(!this.visible)this.setPlaying(false);this.dirty=true;},{threshold:.05}).observe(host);
      this.setProgress(0); players.push(this);
    }
    setPlaying(value) { if(value)players.forEach(p=>{if(p!==this)p.setPlaying(false);});this.playing=value;this.playButton.textContent=value?'Pause':'Play';this.playButton.setAttribute('aria-pressed',String(value));this.last=0;this.dirty=true; }
    setProgress(value) { this.progress=clamp(value);this.slider.value=String(Math.round(this.progress*1000));this.next.disabled=this.progress>=1;this.dirty=true; }
    text(value,x,y,size=13,color='#b5c4d4',align='left') {const c=this.ctx;c.font=`${size}px system-ui`;c.fillStyle=color;c.textAlign=align;c.fillText(value,x,y);}
    line(points,color,width=1,alpha=1,dash=[]) {if(points.length<2)return;const c=this.ctx;c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.globalAlpha=alpha;c.setLineDash(dash);points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();c.globalAlpha=1;c.setLineDash([]);}
    dot(p,color,r=2,fill=true){const c=this.ctx;c.beginPath();c.arc(...p,r,0,Math.PI*2);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1.7;fill?c.fill():c.stroke();}
    statusText(text){if(this.status.textContent!==text)this.status.textContent=text;this.slider.setAttribute('aria-valuetext',text);}
    project3d(points) {
      const rotate=p=>{const x=Math.cos(this.yaw)*p[0]-Math.sin(this.yaw)*p[1],d=Math.sin(this.yaw)*p[0]+Math.cos(this.yaw)*p[1];return [x,d*Math.sin(this.pitch)+p[2]*Math.cos(this.pitch)];};
      const all=points.map(rotate), xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
      const lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
      const scale=Math.min((this.width-54)/(hi[0]-lo[0]),(this.height-70)/(hi[1]-lo[1]))*.94;
      return p=>{const a=rotate(p);return [this.width/2+(a[0]-(lo[0]+hi[0])/2)*scale,this.height*.5-(a[1]-(lo[1]+hi[1])/2)*scale];};
    }
    smoke() {
      const index=Math.min(this.stages.length-1,Math.floor(this.progress*(this.stages.length-1)+1e-6));
      const d=this.dataset, cellsMode=this.kind==='voxels'||this.kind==='octree';
      const geometry=cellsMode?[]:this.geometry[Math.max(0,index-1)];
      // Use one stable view across refinement steps so a camera resize cannot imply shape change.
      const project=this.project3d(this.bounds3d);
      const phase=this.progress*(this.stages.length-1)-index;
      const fade=this.playing&&index>0?clamp(phase*5):1;
      if(cellsMode) {const v=corners(d.root).map(project);edges.forEach(([a,b])=>this.line([v[a],v[b]],'#9cadc2',.7,.22));}
      if(cellsMode && index>0) d[this.kind][index-1].cells.forEach(cell=>{const vertices=corners(cell).map(project);edges.forEach(([a,b])=>this.line([vertices[a],vertices[b]],heat(cell.concentration,d),1,.7*fade));});
      const labels=index>0&&!cellsMode&&this.kind==='binary'?d.levels[index-1].labels:null;
      this.ctx.globalAlpha=cellsMode&&index>0?.65:.9;
      d.points.forEach((p,i)=>this.dot(project(p),labels?colors[labels[i]%colors.length]:'#79efff',this.width<450?1.3:1.6));this.ctx.globalAlpha=1;
      if(index>1&&!cellsMode&&fade<1) this.geometry[index-2].forEach((node,i)=>node.rings.forEach(r=>this.line(r.map(project),this.kind==='binary'?colors[i%colors.length]:node.color,1.2,.9*(1-fade))));
      if(index>0&&!cellsMode) geometry.forEach((node,i)=>node.rings.forEach(r=>this.line(r.map(project),this.kind==='binary'?colors[i%colors.length]:node.color,1.2,.9*fade)));
      this.text(this.stages[index],22,28,14,'#edf2f7');
      this.text(cellsMode?'Color: mean concentration':this.kind==='binary'?'Color: disjoint sample subsets':'Ellipsoids: 2 standard deviations',22,this.height-17,11);
      this.statusText(this.stages[index]);
    }
    project2d(points) {const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),lo=[Math.min(...xs)-1,Math.min(...ys)-1],hi=[Math.max(...xs)+1,Math.max(...ys)+1];const scale=Math.min((this.width-92)/(hi[0]-lo[0]),(this.height-94)/(hi[1]-lo[1]));return {lo,hi,project:p=>[this.width/2+(p[0]-(lo[0]+hi[0])/2)*scale,this.height/2+8-(p[1]-(lo[1]+hi[1])/2)*scale]};}
    aircraft(position,yaw,color,size=12) {
      const outline=[[.95,0],[.25,.12],[-.2,.9],[-.45,.9],[-.22,.12],[-.75,.1],[-.95,.4],[-1.1,.4],[-1,0],[-1.1,-.4],[-.95,-.4],[-.75,-.1],[-.22,-.12],[-.45,-.9],[-.2,-.9],[.25,-.12]];
      const c=this.ctx;c.save();c.translate(...position);c.rotate(-yaw);c.beginPath();outline.forEach(([x,y],i)=>i?c.lineTo(x*size,y*size):c.moveTo(x*size,y*size));c.closePath();c.fillStyle=color;c.strokeStyle='#edf2f7';c.lineWidth=.6;c.fill();c.stroke();c.restore();
    }
    fleetScene() {
      const fleet=data.fleets[this.kind.slice(-1)],max=Math.max(...fleet.vehicles.map(v=>v.trajectory.length-1)),time=this.progress*max;
      const bounds=data.smokeXY.concat(fleet.vehicles.flatMap(v=>v.trajectory));
      const {lo,hi,project}=this.project2d(bounds);
      for(let axis=0;axis<2;axis++)for(let tick=Math.ceil(lo[axis]/10)*10;tick<=hi[axis];tick+=10){const a=lo.slice(),b=hi.slice();a[axis]=b[axis]=tick;this.line([project(a),project(b)],'#9cadc2',.6,.2);const p=project(a);this.text(String(tick),p[0]-(axis?12:0),p[1]+(axis?4:17),10,'#9cadc2',axis?'right':'center');}
      data.smokeXY.forEach(p=>this.dot(project(p),'#315968',1));
      let accepted=0,total=0;
      fleet.vehicles.forEach((vehicle,j)=>{
        const color=colors[j],route=vehicle.route,track=vehicle.trajectory,idx=Math.min(time,track.length-1),k=Math.min(Math.floor(idx),track.length-2),f=idx-k;
        const state=mix(track[k],track[k+1],f),yaw=track[k][2]+f*Math.atan2(Math.sin(track[k+1][2]-track[k][2]),Math.cos(track[k+1][2]-track[k][2]));
        this.line([fleet.depot,...route].map(project),color,1,.32,[4,5]);
        this.line([...track.slice(0,k+1),state].map(project),color,2.2);
        const target=vehicle.accepted.findIndex(sample=>idx<sample);
        route.slice(0,-1).forEach((point,n)=>{const done=idx>=vehicle.accepted[n];if(done)accepted++;total++;this.dot(project(point),color,4,done);if(n===target){this.dot(project(point),color,9,false);this.line([project(state),project(point)],color,.8,.6);}});
        this.aircraft(project(state),yaw,color,this.width<500?7:10);
        this.text(`UAV ${j+1}`,22+j*(this.width-44)/fleet.vehicles.length,29,12,color);
      });
      const depot=project(fleet.depot);this.line([[depot[0]-6,depot[1]],[depot[0]+6,depot[1]]],'#edf2f7',2);this.line([[depot[0],depot[1]-6],[depot[0],depot[1]+6]],'#edf2f7',2);
      this.text('x / y in km · common depot +',22,this.height-15,11);
      this.statusText(`${accepted} / ${total} assigned waypoints accepted · ${Math.round(this.progress*100)}% playback`);
    }
    dynamics() {
      const poses=data.dubins.poses,{project}=this.project2d(poses),idx=this.progress*(poses.length-1),k=Math.min(Math.floor(idx),poses.length-2),f=idx-k,state=mix(poses[k],poses[k+1],f);
      this.line(poses.map(project),'#9cadc2',2,.45,[5,5]);
      this.line([...poses.slice(0,k+1),state].map(project),'#62d9e8',3);
      data.dubins.joins.forEach(t=>this.dot(project(poses[Math.round(t*(poses.length-1))]),'#ffb15b',4,false));
      this.aircraft(project(state),state[2],'#ffb15b',this.width<500?13:18);
      this.text('Left → straight → right',22,29,14,'#edf2f7');
      this.text('Start',...mix(project(poses[0]),[project(poses[0])[0],project(poses[0])[1]+27],1),12);
      const end=project(poses.at(-1));this.dot(end,'#edf2f7',4,false);this.text('Goal pose',end[0],end[1]-20,12,'#edf2f7','center');
      this.text('Constant speed · bounded curvature',22,this.height-16,12);
      const phase=this.progress<data.dubins.joins[0]?'Left turn':this.progress<data.dubins.joins[1]?'Straight flight':'Right turn';
      this.statusText(`${phase} · ${Math.round(this.progress*100)}% of Dubins path`);
    }
    nmpc() {
      const active=Math.min(3,Math.floor(this.progress*3+1e-6)), c=this.ctx,w=this.width,h=this.height;
      const boxes=[[w*.08,h*.25],[w*.55,h*.25],[w*.55,h*.64],[w*.08,h*.64]],bw=w*.37,bh=h*.2;
      const centers=boxes.map(([x,y])=>[x+bw/2,y+bh/2]);
      for(let i=0;i<4;i++){const a=centers[i],b=centers[(i+1)%4];this.line([a,b],i===active?'#62d9e8':'#516176',2,.8);const tip=mix(a,b,.6),angle=Math.atan2(b[1]-a[1],b[0]-a[0]);this.line([[tip[0]-7*Math.cos(angle-.5),tip[1]-7*Math.sin(angle-.5)],tip,[tip[0]-7*Math.cos(angle+.5),tip[1]-7*Math.sin(angle+.5)]],'#9cadc2',2);}
      boxes.forEach(([x,y],i)=>{c.fillStyle=i===active?'#153c4a':'#122237';c.strokeStyle=i===active?'#62d9e8':'#42536b';c.lineWidth=1.5;c.fillRect(x,y,bw,bh);c.strokeRect(x,y,bw,bh);this.text(['1 · Measure','2 · Optimize','3 · Apply first input','4 · Measure again'][i],x+bw/2,y+bh*.43,w<430?11:14,i===active?'#79efff':'#edf2f7','center');this.text(['Current state ŝ','N steering commands','Execute δ₀ only','Recede and repeat'][i],x+bw/2,y+bh*.73,w<430?9:11,'#b5c4d4','center');});
      this.text('Nonlinear MPC feedback loop',w/2,32,14,'#edf2f7','center');
      this.text('Minimize waypoint error + steering effort',w/2,h-18,w<430?11:13,'#9cadc2','center');
      this.statusText(this.stages[active]);
    }
    draw() {if(!this.width || !this.height)return;this.ctx.clearRect(0,0,this.width,this.height);if(this.is3d)this.smoke();else if(this.fleet)this.fleetScene();else if(this.kind==='dynamics')this.dynamics();else this.nmpc();this.dirty=false;}
    frame(now) {
      if(!this.visible||this.host.closest('[hidden]')||document.hidden){this.last=0;return;}
      if(this.playing&&this.last&&now-this.last<32)return;
      if(this.playing){if(this.last){const elapsed=Math.min(now-this.last,100);this.setProgress(this.progress+elapsed/1000/this.duration*speed);if(this.is3d)this.yaw+=elapsed*.00004*speed;}if(this.progress>=1)this.setPlaying(false);}
      if(this.dirty)this.draw();this.last=now;
    }
  }
  document.querySelectorAll('[data-animation]').forEach(host=>new Player(host));
  document.getElementById('animation-speed').addEventListener('change',e=>{speed=Number(e.target.value);});
  document.addEventListener('higum:tabchange',()=>players.forEach(p=>{if(p.host.closest('[hidden]'))p.setPlaying(false);p.dirty=true;}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)players.forEach(p=>p.setPlaying(false));});
  function frame(now){players.forEach(p=>p.frame(now));requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
