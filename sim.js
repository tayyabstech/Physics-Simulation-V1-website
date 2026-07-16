/* ============================================================
   Interactive nuclear simulation — two modes
   A) Fission chain reaction (U-235 / U-238 / Pu-239, control
      rods, moderator, enrichment)
   B) D–T fusion plasma (temperature vs Coulomb barrier,
      magnetic confinement)
   A simplified 2-D model — limitations stated on the page.
   ============================================================ */
(function () {
  const canvas = document.getElementById('simCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const readout = document.getElementById('simReadout');
  const MEV_TO_J = 1.602e-13;

  let mode = 'fission';
  let running = false;
  let rafId = null;
  let frame = 0;

  /* ---------------- FISSION STATE ---------------- */
  const F = {
    nuclei: [], neutrons: [], fragments: [], flashes: [],
    fissions: 0, puBred: 0, energyMeV: 0,
    rodInsert: 0.4, enrich: 0.04, moderator: true, autoSource: false,
    popHistory: [], // neutron population samples for k estimate
  };
  const RODS_X = [176, 352, 528, 704]; // 4 control rods
  const ROD_W = 13;

  function buildCore() {
    F.nuclei = []; F.neutrons = []; F.fragments = []; F.flashes = [];
    F.fissions = 0; F.puBred = 0; F.energyMeV = 0; F.popHistory = [];
    const cols = 13, rows = 7;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = 62 + c * ((W - 120) / (cols - 1)) + (Math.random() - 0.5) * 18;
        const y = 66 + r * ((H - 130) / (rows - 1)) + (Math.random() - 0.5) * 16;
        // keep lattice clear of the rod channels
        const type = Math.random() < F.enrich ? 'U235' : 'U238';
        F.nuclei.push({ x, y, r: 13, type });
      }
    }
  }

  function fireNeutron() {
    F.neutrons.push({
      x: 8, y: 60 + Math.random() * (H - 120),
      vx: 1.6 + Math.random() * 0.6, vy: (Math.random() - 0.5) * 1.2,
      fast: false,
    });
  }

  function spawnFission(nuc) {
    nuc.type = 'SPENT';
    F.fissions++; F.energyMeV += 200;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0); // 2–3 neutrons
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      F.neutrons.push({ x: nuc.x, y: nuc.y, vx: Math.cos(a) * 4.2, vy: Math.sin(a) * 4.2, fast: true });
    }
    const a0 = Math.random() * Math.PI * 2; // two fragments, opposite directions
    for (const a of [a0, a0 + Math.PI]) {
      F.fragments.push({ x: nuc.x, y: nuc.y, vx: Math.cos(a) * 2.6, vy: Math.sin(a) * 2.6, life: 26 });
    }
    F.flashes.push({ x: nuc.x, y: nuc.y, r: 4, life: 14 });
  }

  function rodRects() {
    const depth = F.rodInsert * (H - 30);
    return RODS_X.map(x => ({ x: x - ROD_W / 2, y: 0, w: ROD_W, h: depth }));
  }

  function stepFission() {
    const rods = rodRects();
    if (F.autoSource && frame % 34 === 0) fireNeutron();
    if (F.neutrons.length > 420) F.neutrons.length = 420; // perf cap

    for (let i = F.neutrons.length - 1; i >= 0; i--) {
      const nt = F.neutrons[i];
      nt.x += nt.vx * (nt.fast ? 1 : 0.55);
      nt.y += nt.vy * (nt.fast ? 1 : 0.55);
      // leave the core
      if (nt.x < -10 || nt.x > W + 10 || nt.y < -10 || nt.y > H + 10) { F.neutrons.splice(i, 1); continue; }
      // control rod absorption
      let absorbed = false;
      for (const rr of rods) {
        if (nt.x > rr.x && nt.x < rr.x + rr.w && nt.y > rr.y && nt.y < rr.y + rr.h) {
          F.flashes.push({ x: nt.x, y: nt.y, r: 2, life: 8 });
          F.neutrons.splice(i, 1); absorbed = true; break;
        }
      }
      if (absorbed) continue;
      // moderation: fast neutrons scatter off water and slow down
      if (F.moderator && nt.fast && Math.random() < 0.02) {
        nt.fast = false;
        const s = Math.hypot(nt.vx, nt.vy) || 1;
        nt.vx = nt.vx / s * 2.2; nt.vy = nt.vy / s * 2.2;
        nt.vx += (Math.random() - 0.5); nt.vy += (Math.random() - 0.5);
      }
      // nucleus collisions
      for (const nuc of F.nuclei) {
        if (nuc.type === 'SPENT') continue;
        const dx = nt.x - nuc.x, dy = nt.y - nuc.y;
        if (dx * dx + dy * dy > (nuc.r + 3) * (nuc.r + 3)) continue;
        if (nuc.type === 'U235') {
          // thermal neutrons fission U-235 readily; fast ones rarely do
          if (!nt.fast || Math.random() < 0.12) { spawnFission(nuc); F.neutrons.splice(i, 1); }
          break;
        } else if (nuc.type === 'U238') {
          // neutron capture -> (beta, beta) -> Pu-239  [slide 9]
          const p = nt.fast ? 0.1 : 0.25;
          if (Math.random() < p) {
            nuc.type = 'PU239'; F.puBred++;
            F.flashes.push({ x: nuc.x, y: nuc.y, r: 3, life: 10 });
            F.neutrons.splice(i, 1);
          }
          break;
        } else if (nuc.type === 'PU239') {
          // Pu-239 fissions with fast AND slow neutrons
          if (Math.random() < 0.85) { spawnFission(nuc); F.neutrons.splice(i, 1); }
          break;
        }
      }
    }
    for (let i = F.fragments.length - 1; i >= 0; i--) {
      const f = F.fragments[i];
      f.x += f.vx; f.y += f.vy; f.life--;
      if (f.life <= 0) F.fragments.splice(i, 1);
    }
    for (let i = F.flashes.length - 1; i >= 0; i--) {
      const fl = F.flashes[i];
      fl.r += 1.6; fl.life--;
      if (fl.life <= 0) F.flashes.splice(i, 1);
    }
    if (frame % 30 === 0) {
      F.popHistory.push(F.neutrons.length);
      if (F.popHistory.length > 8) F.popHistory.shift();
    }
  }

  const NUC_COLOR = { U235: '#d95926', U238: '#4d5a6b', PU239: '#9085e9', SPENT: '#232a35' };

  function drawFission() {
    ctx.fillStyle = F.moderator ? '#0d1420' : '#0d1117';
    ctx.fillRect(0, 0, W, H);
    if (F.moderator) { // faint water tint
      ctx.fillStyle = 'rgba(57,135,229,0.045)'; ctx.fillRect(0, 0, W, H);
    }
    // rods
    for (const rr of rodRects()) {
      ctx.fillStyle = '#8fa0b3';
      ctx.beginPath(); ctx.roundRect(rr.x, rr.y - 6, rr.w, rr.h + 6, 6); ctx.fill();
    }
    // nuclei
    for (const nuc of F.nuclei) {
      ctx.beginPath(); ctx.arc(nuc.x, nuc.y, nuc.r, 0, 7);
      ctx.fillStyle = NUC_COLOR[nuc.type]; ctx.fill();
      if (nuc.type === 'PU239') { ctx.strokeStyle = '#c9c2ff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // fragments
    for (const f of F.fragments) {
      ctx.globalAlpha = f.life / 26;
      ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, 7); ctx.fillStyle = '#f4a261'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    // neutrons
    for (const nt of F.neutrons) {
      ctx.beginPath(); ctx.arc(nt.x, nt.y, nt.fast ? 3.4 : 4.2, 0, 7);
      ctx.fillStyle = nt.fast ? '#e9c46a' : '#dfe7f0'; ctx.fill();
    }
    // flashes
    for (const fl of F.flashes) {
      ctx.globalAlpha = fl.life / 14 * 0.8;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, 7);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawLegend([
      ['#d95926', 'U-235'], ['#4d5a6b', 'U-238'], ['#9085e9', 'Pu-239 (bred)'],
      ['#232a35', 'spent'], ['#e9c46a', 'fast n'], ['#dfe7f0', 'slow n'],
    ]);
  }

  function drawLegend(items) {
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    let x = 14;
    const y = H - 16;
    ctx.fillStyle = 'rgba(13,17,23,0.72)';
    ctx.fillRect(6, y - 14, 8 + items.reduce((a, it) => a + 26 + ctx.measureText(it[1]).width, 0), 24);
    for (const [color, label] of items) {
      ctx.beginPath(); ctx.arc(x + 5, y - 3, 5, 0, 7); ctx.fillStyle = color; ctx.fill();
      ctx.fillStyle = '#aab5c4'; ctx.fillText(label, x + 14, y + 1);
      x += 26 + ctx.measureText(label).width;
    }
    ctx.restore();
  }

  function kStatus() {
    const h = F.popHistory;
    if (F.neutrons.length === 0) return ['idle', 'k-sub'];
    if (h.length < 2) return ['starting…', 'k-sub'];
    const a = h[h.length - 2], b = h[h.length - 1];
    if (a === 0) return ['starting…', 'k-sub'];
    const k = b / a;
    if (F.neutrons.length >= 420) return ['SUPERCRITICAL (k > 1)', 'k-super'];
    if (k > 1.15) return ['supercritical (k > 1)', 'k-super'];
    if (k < 0.85) return ['subcritical (k < 1)', 'k-sub'];
    return ['≈ critical (k ≈ 1)', 'k-crit'];
  }

  /* ---------------- FUSION STATE ---------------- */
  const U = {
    ions: [], neutronsOut: [], flashes: [], refill: [],
    fusions: 0, energyMeV: 0,
    tempM: 20, magOn: true, cooled: false,
  };
  const CX = W / 2, CY = H / 2, RING_R = 225;

  function tempSpeed() { return 0.16 * Math.sqrt(U.tempM); }

  function buildPlasma() {
    U.ions = []; U.neutronsOut = []; U.flashes = []; U.refill = [];
    U.fusions = 0; U.energyMeV = 0; U.cooled = false;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * (RING_R - 30);
      const va = Math.random() * Math.PI * 2, s = tempSpeed() * (0.6 + Math.random() * 0.8);
      U.ions.push({
        x: CX + Math.cos(a) * rr, y: CY + Math.sin(a) * rr,
        vx: Math.cos(va) * s, vy: Math.sin(va) * s,
        kind: i % 2 === 0 ? 'D' : 'T', // deuterium / tritium
      });
    }
  }

  function retune() {
    // rescale speeds toward the new temperature (heating/cooling)
    const target = tempSpeed();
    for (const p of U.ions) {
      if (p.kind === 'He') continue;
      const s = Math.hypot(p.vx, p.vy) || 0.01;
      const ns = s + (target * (0.6 + Math.random() * 0.8) - s) * 0.5;
      p.vx = p.vx / s * ns; p.vy = p.vy / s * ns;
    }
  }

  function stepFusion() {
    U.cooled = false;
    // spawn queued replacement fuel
    for (let i = U.refill.length - 1; i >= 0; i--) {
      if (--U.refill[i].t <= 0) {
        const kind = U.refill[i].kind;
        const a = Math.random() * Math.PI * 2;
        const s = tempSpeed() * (0.6 + Math.random() * 0.8);
        U.ions.push({
          x: CX + Math.cos(a) * (RING_R - 40), y: CY + Math.sin(a) * (RING_R - 40),
          vx: Math.cos(a + Math.PI) * s, vy: Math.sin(a + Math.PI) * s, kind,
        });
        U.refill.splice(i, 1);
      }
    }
    for (const p of U.ions) {
      p.x += p.vx; p.y += p.vy;
      if (U.magOn) {
        // reflect off the magnetic "wall" (torus cross-section)
        const dx = p.x - CX, dy = p.y - CY, d = Math.hypot(dx, dy);
        if (d > RING_R - 8) {
          const nx = dx / d, ny = dy / d;
          const dot = p.vx * nx + p.vy * ny;
          if (dot > 0) { p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny; }
          p.x = CX + nx * (RING_R - 8); p.y = CY + ny * (RING_R - 8);
        }
      } else {
        // no confinement: plasma hits the vessel wall and cools
        if (p.x < 10 || p.x > W - 10) { p.vx *= -1; p.vx *= 0.45; p.vy *= 0.45; U.cooled = true; }
        if (p.y < 10 || p.y > H - 10) { p.vy *= -1; p.vx *= 0.45; p.vy *= 0.45; U.cooled = true; }
        p.x = Math.min(Math.max(p.x, 10), W - 10);
        p.y = Math.min(Math.max(p.y, 10), H - 10);
      }
    }
    // pair interactions
    for (let i = 0; i < U.ions.length; i++) {
      for (let j = i + 1; j < U.ions.length; j++) {
        const a = U.ions[i], b = U.ions[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 196) continue; // within 14 px
        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const rel2 = rvx * rvx + rvy * rvy;
        const isDT = (a.kind === 'D' && b.kind === 'T') || (a.kind === 'T' && b.kind === 'D');
        // fusion needs a D–T pair AND enough kinetic energy to tunnel
        // through the Coulomb barrier (threshold ~ tens of millions of K)
        if (isDT && rel2 > 4.6 && Math.random() < (rel2 - 4.6) * 0.06) {
          U.fusions++; U.energyMeV += 17.6;
          U.flashes.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 4, life: 16 });
          // products: He-4 ash (3.5 MeV) + fast neutron (14.1 MeV) that escapes
          const na = Math.atan2(rvy, rvx);
          U.neutronsOut.push({ x: a.x, y: a.y, vx: Math.cos(na) * 7, vy: Math.sin(na) * 7 });
          a.kind = 'He'; a.vx = Math.cos(na + Math.PI) * 1.1; a.vy = Math.sin(na + Math.PI) * 1.1;
          U.ions.splice(j, 1);
          U.refill.push({ kind: 'D', t: 130 }, { kind: 'T', t: 190 });
        } else {
          // Coulomb repulsion: like charges bounce apart (elastic)
          const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
          const dot = rvx * nx + rvy * ny;
          if (dot < 0) {
            a.vx += dot * nx; a.vy += dot * ny;
            b.vx -= dot * nx; b.vy -= dot * ny;
          }
        }
      }
    }
    for (let i = U.neutronsOut.length - 1; i >= 0; i--) {
      const n = U.neutronsOut[i];
      n.x += n.vx; n.y += n.vy;
      if (n.x < -10 || n.x > W + 10 || n.y < -10 || n.y > H + 10) U.neutronsOut.splice(i, 1);
    }
    for (let i = U.flashes.length - 1; i >= 0; i--) {
      const fl = U.flashes[i];
      fl.r += 1.8; fl.life--;
      if (fl.life <= 0) U.flashes.splice(i, 1);
    }
  }

  const ION_STYLE = { D: ['#3987e5', 6], T: ['#1c5cab', 7], He: ['#199e70', 8] };

  function drawFusion() {
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, W, H);
    // plasma glow ~ temperature
    const glow = Math.min(U.tempM / 300, 1);
    const g = ctx.createRadialGradient(CX, CY, 30, CX, CY, RING_R);
    g.addColorStop(0, 'rgba(126,60,220,' + (0.10 + glow * 0.22) + ')');
    g.addColorStop(1, 'rgba(30,20,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY, RING_R, 0, 7); ctx.fill();
    // magnetic confinement ring
    if (U.magOn) {
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(57,135,229,0.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY, RING_R, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#7d8794'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('magnetic confinement (tokamak cross-section)', CX, CY - RING_R - 12);
      ctx.textAlign = 'left';
    } else {
      ctx.strokeStyle = '#37404d'; ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, W - 8, H - 8);
      ctx.fillStyle = '#7d8794'; ctx.font = '12px system-ui, sans-serif';
      ctx.fillText('vessel wall: plasma touching it cools instantly', 16, 24);
    }
    // ions
    for (const p of U.ions) {
      const [color, r] = ION_STYLE[p.kind];
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fillStyle = color; ctx.fill();
    }
    // escaping neutrons
    for (const n of U.neutronsOut) {
      ctx.beginPath(); ctx.arc(n.x, n.y, 3.5, 0, 7); ctx.fillStyle = '#e9c46a'; ctx.fill();
      ctx.strokeStyle = 'rgba(233,196,106,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(n.x - n.vx * 3, n.y - n.vy * 3); ctx.lineTo(n.x, n.y); ctx.stroke();
    }
    for (const fl of U.flashes) {
      ctx.globalAlpha = fl.life / 16 * 0.9;
      ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, 7);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawLegend([
      ['#3987e5', 'deuterium'], ['#1c5cab', 'tritium'], ['#199e70', 'He-4 (ash)'], ['#e9c46a', 'neutron (14.1 MeV)'],
    ]);
  }

  /* ---------------- READOUTS ---------------- */
  function renderReadout() {
    if (mode === 'fission') {
      const [kTxt, kCls] = kStatus();
      readout.innerHTML =
        ro(F.neutrons.length, 'neutrons in core') +
        ro(F.fissions, 'fissions') +
        ro(F.puBred, 'Pu-239 bred') +
        ro(F.energyMeV.toLocaleString() + ' MeV', 'energy released (' + (F.energyMeV * MEV_TO_J).toExponential(2) + ' J)') +
        '<div class="ro"><span class="ro-val ' + kCls + '">' + kTxt + '</span><span class="ro-label">chain reaction status</span></div>';
    } else {
      const active = U.flashes.length > 0;
      const status = U.cooled && !U.magOn ? ['plasma cooling on wall, fusion stopped', 'k-sub']
        : U.tempM < 45 ? ['too cold to fuse, Coulomb barrier winning', 'k-sub']
        : active ? ['FUSION ACTIVE', 'k-crit']
        : ['near threshold…', 'k-crit'];
      readout.innerHTML =
        ro(U.tempM + ' M K', 'plasma temperature') +
        ro(U.fusions, 'fusion reactions') +
        ro(U.energyMeV.toFixed(1) + ' MeV', 'energy released (' + (U.energyMeV * MEV_TO_J).toExponential(2) + ' J)') +
        '<div class="ro"><span class="ro-val ' + status[1] + '">' + status[0] + '</span><span class="ro-label">status</span></div>';
    }
  }
  function ro(val, label) {
    return '<div class="ro"><span class="ro-val">' + val + '</span><span class="ro-label">' + label + '</span></div>';
  }

  /* ---------------- LOOP & WIRING ---------------- */
  function loop() {
    frame++;
    if (mode === 'fission') { stepFission(); drawFission(); }
    else { stepFusion(); drawFusion(); }
    if (frame % 12 === 0) renderReadout();
    rafId = requestAnimationFrame(loop);
  }

  window.SIM = {
    start() { if (!running) { running = true; rafId = requestAnimationFrame(loop); renderReadout(); } },
    stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; },
  };

  // tabs
  const tabF = document.getElementById('tabFission');
  const tabU = document.getElementById('tabFusion');
  function setMode(m) {
    mode = m;
    tabF.classList.toggle('active', m === 'fission');
    tabU.classList.toggle('active', m === 'fusion');
    tabF.setAttribute('aria-selected', m === 'fission');
    tabU.setAttribute('aria-selected', m === 'fusion');
    document.querySelectorAll('.ctrl-group').forEach(g => { g.hidden = g.dataset.mode !== m; });
    renderReadout();
  }
  tabF.addEventListener('click', () => setMode('fission'));
  tabU.addEventListener('click', () => setMode('fusion'));

  // fission controls
  document.getElementById('fireBtn').addEventListener('click', fireNeutron);
  document.getElementById('autoSource').addEventListener('change', e => {
    F.autoSource = e.target.checked;
    document.getElementById('srcState').textContent = F.autoSource ? 'on' : 'off';
  });
  document.getElementById('rodSlider').addEventListener('input', e => {
    F.rodInsert = e.target.value / 100;
    document.getElementById('rodVal').textContent = e.target.value + '%';
  });
  document.getElementById('enrichSlider').addEventListener('input', e => {
    F.enrich = e.target.value / 100;
    document.getElementById('enrichVal').textContent = e.target.value + '%';
  });
  document.getElementById('moderator').addEventListener('change', e => {
    F.moderator = e.target.checked;
    document.getElementById('modState').textContent = F.moderator ? 'on' : 'off';
  });
  document.getElementById('resetFission').addEventListener('click', buildCore);

  // fusion controls
  document.getElementById('tempSlider').addEventListener('input', e => {
    U.tempM = +e.target.value;
    document.getElementById('tempVal').textContent = U.tempM + ' million K';
    retune();
  });
  document.getElementById('magField').addEventListener('change', e => {
    U.magOn = e.target.checked;
    document.getElementById('magState').textContent = U.magOn ? 'on' : 'off';
    if (U.magOn) retune(); // re-heating the plasma
  });
  document.getElementById('resetFusion').addEventListener('click', buildPlasma);

  buildCore();
  buildPlasma();
  // if the page loaded straight onto the simulation (deep link), start now —
  // app.js ran before this script defined window.SIM
  if (!document.getElementById('simPage').hidden) window.SIM.start();
})();
