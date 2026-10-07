// Owns: motion for the Today mockups — entrances, count-ups, line draws, loops and pointer effects. Driven by data-*
// attributes and run once from a component's mount with the Web Animations API, so a re-render never restarts them.
//   data-a="rise|fall|left|right|fade|pop|zoom|blur|flip|swing|growx|growy|wipe|wipeup|mask"  data-d delay  data-t ms
//   data-stagger="70" data-sa="rise" data-sd="base delay"   → children enter one after another
//   data-loop="float|bob|pulse|ping|spin|unspin|drift|breathe|twinkle|blink|sway|marquee|shimmer|hue|march|eq|orbit"
//             data-ld delay  data-ldur ms
//   data-count (counts the element's own number up)  data-draw (SVG stroke draws to its final dasharray)
//   data-bar (width grows to its inline width)  data-type (types its text)  data-tilt  data-spot  data-magnet
//   data-burst="#hex,#hex" (confetti on click)
(function () {
  if (window.DCAnim) return;
  var RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var E = {
    out: 'cubic-bezier(.16,1,.3,1)',
    soft: 'cubic-bezier(.22,1,.36,1)',
    spring: 'cubic-bezier(.34,1.56,.64,1)',
    inout: 'cubic-bezier(.65,0,.35,1)',
    linear: 'linear'
  };
  var IN = {
    rise: [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
    fall: [{ opacity: 0, transform: 'translateY(-26px)' }, { opacity: 1, transform: 'none' }],
    left: [{ opacity: 0, transform: 'translateX(-36px)' }, { opacity: 1, transform: 'none' }],
    right: [{ opacity: 0, transform: 'translateX(36px)' }, { opacity: 1, transform: 'none' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    pop: [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'none' }],
    zoom: [{ opacity: 0, transform: 'scale(1.14)' }, { opacity: 1, transform: 'none' }],
    blur: [{ opacity: 0, filter: 'blur(16px)', transform: 'translateY(12px)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }],
    flip: [{ opacity: 0, transform: 'perspective(900px) rotateX(-80deg)' }, { opacity: 1, transform: 'perspective(900px) rotateX(0deg)' }],
    swing: [{ opacity: 0, transform: 'rotate(-10deg) scale(.8)' }, { opacity: 1, transform: 'none' }],
    growx: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
    growy: [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    wipeup: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }],
    mask: [{ transform: 'translateY(110%)' }, { transform: 'none' }]
  };
  var SPRUNG = { pop: 1, swing: 1, flip: 1 };
  var LOOP = {
    float: [{ transform: 'translateY(0px)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0px)' }],
    bob: [{ transform: 'translateY(0px) rotate(0deg)' }, { transform: 'translateY(-6px) rotate(-5deg)' }, { transform: 'translateY(0px) rotate(0deg)' }],
    pulse: [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
    ping: [{ transform: 'scale(1)', opacity: 0.65 }, { transform: 'scale(2.8)', opacity: 0 }],
    spin: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    unspin: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }],
    drift: [{ transform: 'translate(0%,0%) scale(1)' }, { transform: 'translate(9%,-11%) scale(1.15)' }, { transform: 'translate(-8%,7%) scale(.92)' }, { transform: 'translate(0%,0%) scale(1)' }],
    breathe: [{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }],
    twinkle: [{ opacity: 0.15, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }, { opacity: 0.15, transform: 'scale(.6)' }],
    blink: [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.52 }, { opacity: 0 }],
    sway: [{ transform: 'rotate(-5deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(-5deg)' }],
    marquee: [{ transform: 'translateX(0%)' }, { transform: 'translateX(-50%)' }],
    shimmer: [{ backgroundPosition: '0% 50%' }, { backgroundPosition: '200% 50%' }],
    hue: [{ filter: 'hue-rotate(0deg)' }, { filter: 'hue-rotate(360deg)' }],
    march: [{ strokeDashoffset: 0 }, { strokeDashoffset: -48 }],
    eq: [{ transform: 'scaleY(.35)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(.55)' }, { transform: 'scaleY(.9)' }, { transform: 'scaleY(.35)' }],
    orbit: [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }]
  };
  var LOOP_MS = { float: 6000, bob: 3200, pulse: 2600, ping: 2200, spin: 24000, unspin: 30000, drift: 22000, breathe: 4200, twinkle: 3200, blink: 1100, sway: 4200, marquee: 32000, shimmer: 5000, hue: 14000, march: 1400, eq: 1200, orbit: 40000 };
  var LINEAR = { spin: 1, unspin: 1, marquee: 1, shimmer: 1, hue: 1, march: 1, orbit: 1 };
  var ADD = { float: 1, bob: 1, pulse: 1, spin: 1, unspin: 1, drift: 1, sway: 1, marquee: 1, orbit: 1 };

  var sets = {};
  function once(kind, el) { var s = sets[kind] || (sets[kind] = new WeakSet()); if (s.has(el)) return false; s.add(el); return true; }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }
  function each(root, sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn); }
  function textNode(el) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) if (/\d/.test(n.nodeValue)) return n;
    return null;
  }

  function enter(el, preset, delay, dur, ease) {
    var k = IN[preset];
    if (!k || RM) return;
    el.animate(k, { duration: dur, delay: delay, easing: E[ease] || (SPRUNG[preset] ? E.spring : E.out), fill: 'backwards' });
  }
  function loop(el) {
    if (RM) return;
    var name = el.dataset.loop, k = LOOP[name];
    if (!k) return;
    var opts = { duration: num(el.dataset.ldur, LOOP_MS[name]), delay: num(el.dataset.ld, 0), iterations: Infinity, easing: LINEAR[name] ? 'linear' : 'ease-in-out' };
    if (ADD[name]) opts.composite = 'add';
    try { el.animate(k, opts); } catch (e) { delete opts.composite; el.animate(k, opts); }
  }
  function count(el) {
    var tn = textNode(el);
    if (!tn || RM) return;
    var raw = tn.nodeValue, m = raw.match(/[−-]?\d[\d,]*(\.\d+)?/);
    if (!m) return;
    var s = m[0], neg = /^[−-]/.test(s), sign = s.charAt(0) === '−' ? '−' : '-';
    var clean = s.replace(/[−,-]/g, ''), dec = (clean.split('.')[1] || '').length, target = parseFloat(clean);
    var pre = raw.slice(0, m.index), post = raw.slice(m.index + s.length);
    var fmt = new Intl.NumberFormat('en-CA', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: s.indexOf(',') > -1 });
    var from = num(el.dataset.from, 0), dur = num(el.dataset.t, 1600), delay = num(el.dataset.d, 0), last, t0 = null;
    function put(v) { last = pre + (neg ? sign : '') + fmt.format(v) + post; tn.nodeValue = last; }
    function frame(ts) {
      if (tn.nodeValue !== last) return; // the template changed it: hands off
      if (t0 === null) t0 = ts;
      var p = Math.min(1, Math.max(0, (ts - t0 - delay) / dur));
      var e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      if (p >= 1) { tn.nodeValue = raw; return; }
      put(from + (target - from) * e);
      requestAnimationFrame(frame);
    }
    put(from);
    requestAnimationFrame(frame);
    setTimeout(function () { if (tn.nodeValue === last) tn.nodeValue = raw; }, delay + dur + 400);
  }
  function draw(el) {
    if (RM || !el.getTotalLength) return;
    var len = 0;
    try { len = el.getTotalLength(); } catch (e) { return; }
    if (!len) return;
    var cs = getComputedStyle(el).strokeDasharray;
    var fin = cs && cs !== 'none' ? cs : len + 'px ' + len + 'px';
    el.animate([{ strokeDasharray: '0px ' + (len + 4) + 'px' }, { strokeDasharray: fin }], { duration: num(el.dataset.t, 1800), delay: num(el.dataset.d, 0), easing: E.out, fill: 'backwards' });
  }
  function bar(el) {
    if (RM) return;
    var prop = el.dataset.bar === 'h' ? 'height' : 'width';
    var fin = el.style[prop] || getComputedStyle(el)[prop];
    var k = [{}, {}];
    k[0][prop] = '0%';
    k[1][prop] = fin;
    el.animate(k, { duration: num(el.dataset.t, 1500), delay: num(el.dataset.d, 0), easing: E.out, fill: 'backwards' });
  }
  function type(el) {
    if (RM) return;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
    for (var n = w.nextNode(); n; n = w.nextNode()) nodes.push({ n: n, full: n.nodeValue });
    if (!nodes.length) return;
    el.style.minHeight = el.offsetHeight + 'px';
    nodes.forEach(function (x) { x.n.nodeValue = ''; });
    var speed = num(el.dataset.speed, 18), i = 0, j = 0;
    setTimeout(function tick() {
      var cur = nodes[i];
      if (!cur) return;
      j += 1;
      cur.n.nodeValue = cur.full.slice(0, j);
      if (j >= cur.full.length) { i += 1; j = 0; }
      if (i < nodes.length) setTimeout(tick, speed);
    }, num(el.dataset.d, 0));
  }
  function tilt(el) {
    var s = num(el.dataset.tilt, 7);
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transition = 'transform .18s ease-out';
      el.style.transform = 'perspective(900px) rotateX(' + (-y * s).toFixed(2) + 'deg) rotateY(' + (x * s).toFixed(2) + 'deg) translateY(-3px)';
    });
    el.addEventListener('pointerleave', function () { el.style.transition = 'transform .6s cubic-bezier(.34,1.56,.64,1)'; el.style.transform = ''; });
  }
  function spot(el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', e.clientX - r.left + 'px');
      el.style.setProperty('--my', e.clientY - r.top + 'px');
      el.style.setProperty('--mo', '1');
    });
    el.addEventListener('pointerleave', function () { el.style.setProperty('--mo', '0'); });
  }
  function magnet(el) {
    var s = num(el.dataset.magnet, 10);
    el.style.transition = (el.style.transition ? el.style.transition + ', ' : '') + 'translate .35s cubic-bezier(.22,1,.36,1)';
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.translate = ((e.clientX - r.left) / r.width - 0.5) * s * 2 + 'px ' + ((e.clientY - r.top) / r.height - 0.5) * s * 2 + 'px';
    });
    el.addEventListener('pointerleave', function () { el.style.translate = '0px 0px'; });
  }
  function burst(el, colors) {
    if (RM || !el) return;
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    colors = colors && colors.length ? colors : ['#FF5A36', '#FFC83D', '#2F5BFF', '#B6FF3B', '#B79CFF', '#FF6FB5'];
    for (var i = 0; i < 26; i++) {
      var p = document.createElement('div'), size = 5 + Math.random() * 8, round = Math.random() > 0.45;
      p.style.cssText = 'position:fixed;left:' + cx + 'px;top:' + cy + 'px;width:' + size + 'px;height:' + (round ? size : size * 0.45) + 'px;border-radius:' + (round ? '50%' : '2px') + ';background:' + colors[i % colors.length] + ';pointer-events:none;z-index:99999';
      document.body.appendChild(p);
      var a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 110, dx = Math.cos(a) * d, dy = Math.sin(a) * d - 40;
      var an = p.animate([
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx * 0.8 + 'px), calc(-50% + ' + dy * 0.8 + 'px)) scale(1) rotate(' + Math.random() * 200 + 'deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + (dy + 70) + 'px)) scale(.4) rotate(' + Math.random() * 560 + 'deg)', opacity: 0 }
      ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)' });
      an.onfinish = (function (node) { return function () { node.remove(); }; })(p);
    }
  }

  function run(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    each(root, '[data-stagger]', function (p) {
      if (!once('stagger', p)) return;
      var step = num(p.dataset.stagger, 70), base = num(p.dataset.sd, 0), preset = p.dataset.sa || 'rise', dur = num(p.dataset.st, 900);
      Array.prototype.forEach.call(p.children, function (c, i) { if (!c.dataset.a) enter(c, preset, base + i * step, dur, p.dataset.se); });
    });
    each(root, '[data-a]', function (el) { if (once('a', el)) enter(el, el.dataset.a, num(el.dataset.d, 0), num(el.dataset.t, 900), el.dataset.e); });
    each(root, '[data-loop]', function (el) { if (once('loop', el)) loop(el); });
    each(root, '[data-count]', function (el) { if (once('count', el)) count(el); });
    each(root, '[data-draw]', function (el) { if (once('draw', el)) draw(el); });
    each(root, '[data-bar]', function (el) { if (once('bar', el)) bar(el); });
    each(root, '[data-type]', function (el) { if (once('type', el)) type(el); });
    each(root, '[data-tilt]', function (el) { if (once('tilt', el)) tilt(el); });
    each(root, '[data-spot]', function (el) { if (once('spot', el)) spot(el); });
    each(root, '[data-magnet]', function (el) { if (once('magnet', el)) magnet(el); });
    each(root, '[data-burst]', function (el) {
      if (!once('burst', el)) return;
      el.addEventListener('click', function () { burst(el, (el.dataset.burst || '').split(',').filter(Boolean)); });
    });
  }

  /** data-fit="1440": lay the page out at that width and zoom it down to fit a narrower container (never up). */
  function fit(el) {
    var w = num(el.dataset.fit, 0), host = el.parentElement;
    if (!w || !window.ResizeObserver) return;
    while (host && host.clientWidth === 0) host = host.parentElement;
    if (!host) return;
    var apply = function () {
      var z = Math.max(0.3, Math.min(1, host.clientWidth / w));
      el.style.zoom = z < 0.999 ? String(z) : '';
    };
    new ResizeObserver(apply).observe(host);
    apply();
  }

  /** Called from a DC's componentDidMount: hides the root until this file has loaded, then plays everything once. */
  function mount(el) {
    if (!el) return;
    fit(el);
    run(el);
    el.style.opacity = '';
  }

  window.DCAnim = { run: run, mount: mount, burst: burst, easing: E, reduced: RM };
})();
