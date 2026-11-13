// Boot: build sprites, create the game, wire up resize/touch and run the loop.
'use strict';
function boot() {
  const loading = document.getElementById('loading');
  if (loading) loading.remove();
  const canvas = document.getElementById('game');
  canvas.width = VIEW_W * RES; canvas.height = VIEW_H * RES;
  buildSprites();
  const game = new Game(canvas);
  window.GAME = game;

  function fit() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const s = Math.min(ww / VIEW_W, wh / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * s) + 'px';
    canvas.style.height = Math.floor(VIEW_H * s) + 'px';
  }
  window.addEventListener('resize', fit); fit();

  // pause when tab hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

  // touch controls
  const touch = document.getElementById('touch');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touch.classList.add('on');
  touch.querySelectorAll('[data-a]').forEach(btn => {
    const a = btn.dataset.a;
    const on = (ev) => { ev.preventDefault(); AUDIO.init(); Input.press(a); btn.classList.add('down'); };
    const off = (ev) => { ev.preventDefault(); Input.release(a); btn.classList.remove('down'); };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
    btn.addEventListener('mousedown', on); btn.addEventListener('mouseup', off); btn.addEventListener('mouseleave', off);
  });
  canvas.addEventListener('pointerdown', () => AUDIO.init());

  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update();
      Input.endFrame();
      acc -= STEP; steps++;
    }
    const t0 = performance.now();
    game.render();
    game.notePerf(performance.now() - t0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
// let the browser paint the loading message before the sprites are generated
requestAnimationFrame(() => setTimeout(boot, 20));
