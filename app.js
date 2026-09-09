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

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function escAttr(s) {
    return esc(s).replace(/"/g, '&quot;');
  }

  function isSafeUrl(url) {
    return /^https?:\/\//i.test(url || '');
  }

  var allPoints = [];

  var centroids = {};
  var loadedCountries = {};
  var ZOOM_ALTITUDE_THRESHOLD = 0.5;

  fetch('data/country-centroids.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { centroids = data; })
    .catch(function (err) { console.error('Failed to load data/country-centroids.json', err); });

  function haversineDistance(lat1, lng1, lat2, lng2) {
    var toRad = function (d) { return d * Math.PI / 180; };
    var R = 6371;
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestCountry(lat, lng) {
    var nearest = null;
    var minDist = Infinity;
    Object.keys(centroids).forEach(function (code) {
      var c = centroids[code];
      var d = haversineDistance(lat, lng, c.lat, c.lng);
      if (d < minDist) { minDist = d; nearest = code; }
    });
    return nearest;
  }

  function mergeById(existing, incoming) {
    var map = {};
    existing.forEach(function (r) { map[r.id] = r; });
    incoming.forEach(function (r) { map[r.id] = r; });
    return Object.keys(map).map(function (id) { return map[id]; });
  }

  function loadCountryData(countryCode) {
    if (!countryCode || loadedCountries[countryCode]) return;
    loadedCountries[countryCode] = true;
    fetch('data/facilities/' + countryCode + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (records) {
        allPoints = mergeById(allPoints, records);
        world.pointsData(allPoints);
        updatePointCount();
      })
      .catch(function (err) {
        console.error('Failed to load facilities for', countryCode, err);
        delete loadedCountries[countryCode];
      });
  }

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
    .pointLabel(function (d) { return d.name_ja ? esc(d.name_ja) + ' / ' + esc(d.name) : esc(d.name); })
    .pointsMerge(false);

  world.pointOfView({ lat: 20, lng: 40, altitude: 2.3 }, 0);

  var controls = world.controls();
  if (controls) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
  }

  world.onZoom(function (pov) {
    if (pov.altitude < ZOOM_ALTITUDE_THRESHOLD) {
      loadCountryData(nearestCountry(pov.lat, pov.lng));
    }
  });

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

  function commonsUrl(filename) {
    return 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(filename);
  }

  function formatCoord(lat, lng) {
    var ns = lat >= 0 ? 'N' : 'S';
    var ew = lng >= 0 ? 'E' : 'W';
    return Math.abs(lat).toFixed(4) + '°' + ns + ', ' + Math.abs(lng).toFixed(4) + '°' + ew;
  }

  var panel = document.getElementById('detailPanel');
  var panelScroll = document.getElementById('panelScroll');
  var panelClose = document.getElementById('panelClose');

  function openPanel(d) {
    var html = '';
    html += '<p class="panel-eyebrow">' + esc(d.country || '—') + ' · ' + esc(d.id) + '</p>';
    html += '<h2 class="panel-title">' + esc(d.name) + '</h2>';
    if (d.name_ja) html += '<p class="panel-title-ja">' + esc(d.name_ja) + '</p>';

    if (d.website && isSafeUrl(d.website)) {
      html += '<a class="image-link" href="' + escAttr(d.website) + '" target="_blank" rel="noopener">';
      html += '<span class="icon">🌐</span>';
      html += '<span class="meta"><span class="t">公式サイト / Official site</span><span class="s">' + esc(d.website.replace(/^https?:\/\//, '')) + '</span></span>';
      html += '<span class="arrow">↗</span></a>';
    }

    if (d.image_url) {
      html += '<a class="image-link" href="' + esc(commonsUrl(d.image_url)) + '" target="_blank" rel="noopener">';
      html += '<span class="icon">📷</span>';
      html += '<span class="meta"><span class="t">画像を見る / View image</span><span class="s">' + esc(d.image_url) + '</span></span>';
      html += '<span class="arrow">↗</span></a>';
    }

    var na = '不明 / Unknown';
    html += '<div class="stat-grid">';
    html += '<div class="stat-cell"><div class="k">収容人数 CAPACITY</div><div class="v">' + (d.capacity ? esc(Number(d.capacity).toLocaleString('en-US')) : esc(na)) + '</div></div>';
    html += '<div class="stat-cell"><div class="k">開場年 OPENED</div><div class="v">' + esc(d.opened_year || na) + '</div></div>';
    html += '<div class="stat-cell wide"><div class="k">座標 COORDINATES</div><div class="v">' + esc(formatCoord(d.lat, d.lng)) + '</div></div>';
    html += '</div>';

    html += '<div class="teams"><div class="heading">使用チーム — HOME OF</div>';
    if (d.teams && d.teams.length) {
      html += '<div class="team-list">';
      d.teams.forEach(function (t) {
        var tag = (t.url && isSafeUrl(t.url)) ? 'a' : 'span';
        var hrefAttr = (t.url && isSafeUrl(t.url)) ? ' href="' + escAttr(t.url) + '" target="_blank" rel="noopener"' : '';
        html += '<' + tag + ' class="team-chip"' + hrefAttr + '><span class="swatch"></span>' + esc(t.name) + '</' + tag + '>';
      });
      html += '</div>';
    } else {
      html += '<p class="no-teams">情報なし / No data</p>';
    }
    html += '</div>';

    html += '<div class="events"><div class="heading">開催イベント — HELD HERE</div>';
    if (d.events && d.events.length) {
      d.events.forEach(function (ev) {
        html += '<div class="event-row"><span class="year">' + esc(ev.year || '—') + '</span><span class="name">' + esc(ev.name) + '</span></div>';
      });
    } else {
      html += '<p class="no-events">情報なし / No data</p>';
    }
    html += '</div>';

    html += '<div class="sources"><div class="heading">出典 — SOURCES</div>';
    if (d.wikidata_url) html += '<a class="source-link" href="' + escAttr(d.wikidata_url) + '" target="_blank" rel="noopener">Wikidata <span class="arrow">↗</span></a>';
    else html += '<a class="source-link" href="' + escAttr('https://www.wikidata.org/wiki/' + d.id) + '" target="_blank" rel="noopener">Wikidata <span class="arrow">↗</span></a>';
    if (d.wikipedia_url) html += '<a class="source-link" href="' + escAttr(d.wikipedia_url) + '" target="_blank" rel="noopener">Wikipedia <span class="arrow">↗</span></a>';
    html += '</div>';

    panelScroll.innerHTML = html;
    panel.classList.add('open');

    world.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.15 }, 900);
    if (controls) controls.autoRotate = false;
  }

  panelClose.addEventListener('click', function () {
    panel.classList.remove('open');
  });

  world.onPointClick(openPanel);

  window.__venueAtlas = {
    world: world,
    getAllPoints: function () { return allPoints; },
    loadCountryData: loadCountryData,
    nearestCountry: nearestCountry
  };
})();
