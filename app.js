"use strict";

// All interactions are browser-local; the site has no backend or runtime CDN.
const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  navigation.classList.toggle("is-open", open);
});
navigation.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  menuButton.setAttribute("aria-expanded", "false");
  navigation.classList.remove("is-open");
}));

document.querySelectorAll("[data-tabs]").forEach(group => {
  const tabs = Array.from(group.querySelectorAll('[role="tab"]'));
  const activate = tab => {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(item.getAttribute("aria-controls"));
      panel.hidden = !selected;
    });
    document.dispatchEvent(new Event("higum:tabchange"));
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", event => {
      let target;
      if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") target = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") target = tabs[0];
      if (event.key === "End") target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); activate(target); target.focus(); }
    });
  });
});

document.getElementById("copy-citation").addEventListener("click", async event => {
  const button = event.currentTarget;
  const code = document.getElementById("bibtex");
  const status = document.getElementById("copy-status");
  let copied = false;
  try { await navigator.clipboard.writeText(code.textContent); copied = true; }
  catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges(); selection.addRange(range);
    try { copied = document.execCommand("copy"); } catch { copied = false; }
    if (copied) selection.removeAllRanges();
  }
  status.textContent = copied ? "Citation copied." : "The citation is selected. Use your browser’s Copy command.";
  button.textContent = copied ? "Copied ✓" : "Copy BibTeX";
  window.setTimeout(() => { button.textContent = "Copy BibTeX"; }, 2400);
});

// The hierarchy is exported from the same numerical NPZ bundle as the slides.
// Geometry is fitted before export, never invented in the browser.
(function initializeHierarchy() {
  const data = window.HIGUM_DATA;
  const canvas = document.getElementById("hierarchy-canvas");
  if (!data || !canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const stage = canvas.parentElement;
  const slider = document.getElementById("hierarchy-level");
  const output = document.getElementById("level-output");
  const play = document.getElementById("viewer-play");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let level = 3, previousLevel = 3, playing = !reducedMotion;
  let yaw = 0.67, pitch = 0.38, width = 0, height = 0;
  let visible = true, dirty = true, lastDraw = 0, lastChange = performance.now(), transition = 0;
  let pointer = null;
  const colors = [[75,66,124], [182,91,148], [245,144,103], [255,213,138]];
  const lo = Math.log10(Math.max(data.concentrationRange[0], 1e-12));
  const hi = Math.log10(data.concentrationRange[1]);
  const heat = value => {
    const t = Math.max(0, Math.min(1, (Math.log10(Math.max(value, 1e-12)) - lo) / (hi - lo))) * 3;
    const i = Math.min(2, Math.floor(t)), f = t - i;
    return `rgb(${colors[i].map((c, j) => Math.round(c + f * (colors[i+1][j] - c))).join(",")})`;
  };
  const transform = (node, sphere) => node.mean.map((mean, axis) => mean + node.basis[axis].reduce((sum, value, j) => sum + value * sphere[j], 0));
  const geometry = data.levels.map(nodes => nodes.map(node => {
    const rings = [];
    for (const latitude of [-Math.PI / 3, 0, Math.PI / 3]) {
      rings.push(Array.from({length: 37}, (_, i) => {
        const a = i / 36 * Math.PI * 2;
        return transform(node, [Math.cos(a)*Math.cos(latitude), Math.sin(a)*Math.cos(latitude), Math.sin(latitude)]);
      }));
    }
    for (const longitude of [0, Math.PI / 3, 2 * Math.PI / 3]) {
      rings.push(Array.from({length: 37}, (_, i) => {
        const a = i / 36 * Math.PI * 2;
        return transform(node, [Math.cos(a)*Math.cos(longitude), Math.cos(a)*Math.sin(longitude), Math.sin(a)]);
      }));
    }
    return { rings, color: heat(node.concentration) };
  }));
  const updateOutput = () => {
    slider.value = String(level);
    output.replaceChildren(document.createTextNode(String(level)), Object.assign(document.createElement("span"), { textContent: `/ ${2**level} ${level === 0 ? "Gaussian" : "Gaussians"}` }));
  };
  const setPlaying = value => {
    playing = value;
    play.textContent = playing ? "Pause animation" : "Play animation";
    play.setAttribute("aria-pressed", String(playing));
    lastChange = performance.now(); dirty = true;
  };
  const setLevel = value => {
    if (value === level) return;
    previousLevel = level; level = value; transition = performance.now(); lastChange = transition;
    updateOutput(); dirty = true;
  };
  const resize = () => {
    width = stage.clientWidth; height = stage.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); dirty = true;
  };
  const view = point => {
    const x = Math.cos(yaw)*point[0] - Math.sin(yaw)*point[1];
    const depth = Math.sin(yaw)*point[0] + Math.cos(yaw)*point[1];
    return [x, depth*Math.sin(pitch) + point[2]*Math.cos(pitch)];
  };
  const draw = now => {
    const projectedPoints = data.points.map(view);
    const selected = geometry[level].map(node => ({ color: node.color, rings: node.rings.map(ring => ring.map(view)) }));
    const fade = Math.min(1, (now - transition) / 850);
    const previous = fade < 1 && previousLevel !== level ? geometry[previousLevel].map(node => ({ color: node.color, rings: node.rings.map(ring => ring.map(view)) })) : [];
    const all = projectedPoints.concat(selected.flatMap(node => node.rings.flat()), previous.flatMap(node => node.rings.flat()));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    all.forEach(([x,y]) => { minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); });
    const scale = Math.min((width-42)/(maxX-minX), (height-66)/(maxY-minY)) * .91;
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
    const screen = ([x,y]) => [width/2+(x-cx)*scale, height*.47-(y-cy)*scale];
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = "#62d9e8"; ctx.globalAlpha = .82;
    projectedPoints.forEach(point => {
      const [x,y] = screen(point);
      ctx.beginPath(); ctx.arc(x,y,width<420 ? 1.05 : 1.25,0,Math.PI*2); ctx.fill();
    });
    const drawNodes = (nodes, alpha) => {
      ctx.globalAlpha = alpha; ctx.lineWidth = width < 420 ? .72 : .85;
      nodes.forEach(node => {
        ctx.strokeStyle = node.color;
        node.rings.forEach(ring => {
          ctx.beginPath(); ring.forEach((point,i) => { const [x,y] = screen(point); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y); }); ctx.stroke();
        });
      });
    };
    drawNodes(previous, .75*(1-fade)); drawNodes(selected, .8*(previous.length ? fade : 1));
    ctx.globalAlpha = .75; ctx.strokeStyle = "#9cadc2"; ctx.fillStyle = "#b5c4d4"; ctx.lineWidth = 1; ctx.font = "10px system-ui";
    const origin = [32,height-26];
    [["x",[1,0,0]],["y",[0,1,0]],["z",[0,0,1]]].forEach(([name, vector]) => {
      const [x,y] = view(vector), end = [origin[0]+x*22,origin[1]-y*22];
      ctx.beginPath(); ctx.moveTo(...origin); ctx.lineTo(...end); ctx.stroke();
      ctx.fillText(name,end[0]+(x>=0?3:-8),end[1]-2);
    });
    ctx.globalAlpha = 1;
  };
  const frame = now => {
    window.requestAnimationFrame(frame);
    if (!visible || document.hidden || now-lastDraw < 32) return;
    const activeTransition = now-transition < 900;
    if (!playing && !dirty && !activeTransition) return;
    if (playing) {
      yaw += Math.min(now-lastDraw,50)*.000035;
      if (now-lastChange > 4700) setLevel((level+1)%6);
    }
    draw(now); lastDraw = now; dirty = false;
  };
  slider.addEventListener("input", event => { setPlaying(false); setLevel(Number(event.target.value)); });
  play.addEventListener("click", () => setPlaying(!playing));
  document.getElementById("viewer-reset").addEventListener("click", () => {
    yaw=.67; pitch=.38; setPlaying(false); setLevel(3); dirty=true;
  });
  canvas.addEventListener("pointerdown", event => {
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY}; canvas.setPointerCapture(event.pointerId); setPlaying(false);
  });
  canvas.addEventListener("pointermove", event => {
    if (!pointer || pointer.id!==event.pointerId) return;
    yaw+=(event.clientX-pointer.x)*.006;
    pitch=Math.max(-.8,Math.min(1.25,pitch+(event.clientY-pointer.y)*.005));
    pointer.x=event.clientX; pointer.y=event.clientY; dirty=true;
  });
  ["pointerup","pointercancel"].forEach(name => canvas.addEventListener(name, () => { pointer=null; }));
  canvas.addEventListener("keydown", event => {
    const changes={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.09],ArrowDown:[0,-.09]};
    if (!changes[event.key]) return;
    event.preventDefault(); setPlaying(false); yaw+=changes[event.key][0];
    pitch=Math.max(-.8,Math.min(1.25,pitch+changes[event.key][1])); dirty=true;
  });
  if ("IntersectionObserver" in window) new IntersectionObserver(entries => {
    visible=entries[0].isIntersecting; if(visible)dirty=true;
  }, {threshold:.05}).observe(stage);
  document.getElementById("viewer-fallback").hidden=true;
  canvas.hidden=false; document.getElementById("viewer-controls").hidden=false;
  new ResizeObserver(resize).observe(stage);
  resize(); updateOutput(); setPlaying(playing); window.requestAnimationFrame(frame);
})();
