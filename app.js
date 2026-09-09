(function () {
  function makeTexture(painter) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    var ctx = c.getContext('2d');
    painter(ctx, c.width, c.height);
    return c.toDataURL();
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var THEMES = {
    real: {
      bg: '#050a14',
      pointColor: '#52e0c4',
      atmosphere: '#3fd6c0',
      atmosphereAlt: 0.22,
      graticules: false,
      texture: function () {
        return makeTexture(function (ctx, w, h) {
          var g = ctx.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, '#0c3d52');
          g.addColorStop(0.5, '#0e5a67');
          g.addColorStop(1, '#0a3448');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
          var rnd = mulberry32(7);
          ctx.fillStyle = 'rgba(60, 140, 90, 0.55)';
          for (var i = 0; i < 46; i++) {
            var x = rnd() * w, y = h * 0.15 + rnd() * h * 0.7;
            var rx = 10 + rnd() * 34, ry = 6 + rnd() * 16;
            ctx.beginPath();
            ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          for (var j = 0; j < 10; j++) {
            var cx = rnd() * w, cy = rnd() * h * 0.5;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 50 + rnd() * 60, 8 + rnd() * 10, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    },
    flat: {
      bg: '#eef1f6',
      pointColor: '#0d7a6e',
      atmosphere: '#8fb8ff',
      atmosphereAlt: 0.08,
      graticules: false,
      texture: function () {
        return makeTexture(function (ctx, w, h) {
          ctx.fillStyle = '#bfe0ec';
          ctx.fillRect(0, 0, w, h);
          var rnd = mulberry32(23);
          var palette = ['#8fd3b6', '#6fc19c', '#a9dfc4'];
          for (var i = 0; i < 60; i++) {
            var x = rnd() * w, y = h * 0.12 + rnd() * h * 0.76;
            var s = 14 + rnd() * 26;
            ctx.fillStyle = palette[i % palette.length];
            ctx.beginPath();
            ctx.moveTo(x, y - s);
            ctx.lineTo(x + s, y);
            ctx.lineTo(x, y + s);
            ctx.lineTo(x - s, y);
            ctx.closePath();
            ctx.fill();
          }
        });
      }
    },
    dark: {
      bg: '#020306',
      pointColor: '#ffb454',
      atmosphere: '#3a4a6b',
      atmosphereAlt: 0.16,
      graticules: true,
      texture: function () {
        return makeTexture(function (ctx, w, h) {
          ctx.fillStyle = '#050710';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(82, 224, 196, 0.08)';
          var rnd = mulberry32(41);
          for (var i = 0; i < 40; i++) {
            var x = rnd() * w, y = rnd() * h;
            ctx.beginPath();
            ctx.arc(x, y, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }
  };

  var allPoints = [];

  var globeEl = document.getElementById('globeViz');
  var world = Globe()(globeEl)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(THEMES.real.texture())
    .showAtmosphere(true)
    .atmosphereColor(THEMES.real.atmosphere)
    .atmosphereAltitude(THEMES.real.atmosphereAlt)
    .showGraticules(false)
    .pointsData(allPoints)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor(function () { return THEMES.real.pointColor; })
    .pointAltitude(0.012)
    .pointRadius(function (d) { return 0.32 + Math.min(d.capacity || 0, 200000) / 200000 * 0.55; })
    .pointLabel(function (d) { return d.name_ja ? d.name_ja + ' / ' + d.name : d.name; })
    .pointsMerge(false);

  world.pointOfView({ lat: 20, lng: 40, altitude: 2.3 }, 0);

  var controls = world.controls();
  if (controls) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
  }

  function applyTheme(key) {
    var t = THEMES[key];
    world
      .globeImageUrl(t.texture())
      .atmosphereColor(t.atmosphere)
      .atmosphereAltitude(t.atmosphereAlt)
      .showGraticules(t.graticules)
      .pointColor(function () { return t.pointColor; });
  }

  var switcher = document.getElementById('themeSwitcher');
  switcher.addEventListener('click', function (e) {
    var btn = e.target.closest('.theme-btn');
    if (!btn) return;
    Array.prototype.forEach.call(switcher.querySelectorAll('.theme-btn'), function (b) {
      b.classList.toggle('active', b === btn);
    });
    applyTheme(btn.getAttribute('data-theme'));
  });

  function updatePointCount() {
    document.getElementById('pointCount').textContent = allPoints.length;
  }

  fetch('data/summary.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allPoints = data;
      world.pointsData(allPoints);
      updatePointCount();
    })
    .catch(function (err) { console.error('Failed to load data/summary.json', err); });

  window.addEventListener('resize', function () {
    world.width(globeEl.clientWidth).height(globeEl.clientHeight);
  });

  window.__venueAtlas = { world: world, getAllPoints: function () { return allPoints; } };
})();
