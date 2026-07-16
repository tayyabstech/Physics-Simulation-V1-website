/* Slide navigation, progress, and chart tooltips */
(function () {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const nextBtn = document.getElementById('nextBtn');
  const prevBtn = document.getElementById('prevBtn');
  const skipBtn = document.getElementById('skipBtn');
  const navCorner = document.getElementById('navCorner');
  const homeBtn = document.getElementById('homeBtn');
  const counter = document.getElementById('slideCounter');
  const progressTrack = document.getElementById('progressTrack');
  const progressFill = document.getElementById('progressFill');
  const deck = document.getElementById('deck');
  const simPage = document.getElementById('simPage');
  let current = 0;
  let onSim = false;

  function render() {
    slides.forEach((s, i) => s.classList.toggle('active', i === current && !onSim));
    deck.hidden = onSim;
    simPage.hidden = !onSim;
    navCorner.style.display = onSim ? 'none' : 'flex';

    const onHero = current === 0;
    const onLast = current === slides.length - 1;
    prevBtn.hidden = onHero;
    skipBtn.hidden = onLast || onSim;
    nextBtn.textContent = onLast ? 'Open simulation →' : 'Next →';
    homeBtn.hidden = onHero && !onSim;
    counter.hidden = onHero;
    progressTrack.hidden = onHero;
    counter.textContent = 'Slide ' + current + ' / ' + (slides.length - 1) +
      ' · ' + (slides[current].dataset.title || '');
    progressFill.style.width = (100 * current / (slides.length - 1)) + '%';
    window.scrollTo(0, 0);
    try { // may throw on file:// in some browsers — navigation still works
      history.replaceState(null, '', onSim ? '#sim' : (current === 0 ? location.pathname : '#s' + current));
    } catch (e) { /* no-op */ }
    if (onSim && window.SIM) window.SIM.start(); else if (window.SIM) window.SIM.stop();
  }

  function next() {
    if (onSim) return;
    if (current === slides.length - 1) { onSim = true; }
    else current++;
    render();
  }
  function prev() {
    if (onSim) { onSim = false; current = slides.length - 1; }
    else if (current > 0) current--;
    render();
  }
  function goSim() { onSim = true; render(); }
  function goHome() { onSim = false; current = 0; render(); }

  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  skipBtn.addEventListener('click', goSim);
  homeBtn.addEventListener('click', goHome);
  document.getElementById('launchSimBtn').addEventListener('click', goSim);
  document.getElementById('backToSlides').addEventListener('click', function () {
    onSim = false; current = slides.length - 1; render();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); }
  });

  /* ------- tooltips for chart rows (data-tip) ------- */
  const tip = document.getElementById('tooltip');
  document.querySelectorAll('[data-tip]').forEach(function (el) {
    el.addEventListener('mousemove', function (e) {
      tip.hidden = false;
      tip.textContent = el.getAttribute('data-tip');
      const pad = 14;
      let x = e.clientX + pad, y = e.clientY + pad;
      const r = tip.getBoundingClientRect();
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - pad;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
    el.addEventListener('mouseleave', function () { tip.hidden = true; });
  });

  // deep links: #s5 jumps to slide 5, #sim jumps to the simulation
  const h = location.hash;
  if (h === '#sim') onSim = true;
  else if (/^#s\d+$/.test(h)) current = Math.min(Math.max(+h.slice(2), 0), slides.length - 1);
  render();
})();
