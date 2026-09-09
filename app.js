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

  // Equirectangular projection matching globe.gl's globeImageUrl texture mapping:
  // lng -180..180 -> x 0..512, lat +90..-90 -> y 0..256 (canvas is 512x256).
  function project(lng, lat) {
    return [(lng + 180) / 360 * 512, (90 - lat) / 180 * 256];
  }

  // Simplified, but genuinely coastline-derived, continent/island outlines.
  // Each entry has an `outer` ring of [lng, lat] vertex pairs (first point
  // not repeated) and an optional `holes` array of further rings (same
  // format) representing enclosed seas/lakes that should read as ocean even
  // though they sit entirely inside the outer ring. Anchored on real
  // reference coordinates (capitals, capes, straits) rather than arbitrary
  // shapes - see project README/commit message for the point-in-polygon
  // self-check that validates this data.
  var CONTINENTS = [
    { name: 'Eurasia', outer: [
      [-9.5, 38.7], [-4.5, 48.4], [3.0, 51.5], [8.5, 56.5], [5.3, 60.4],
      [25.8, 71.2], [40.0, 68.0], [70.0, 72.0], [105.0, 77.5], [170.0, 66.0],
      [160.0, 56.0], [135.0, 55.0], [125.0, 40.0],
      // Korean peninsula: route the ring out around the real coastline
      // instead of jumping straight from the Shandong area to Shanghai.
      [128.5, 39.0], [129.9, 37.5], [129.5, 35.1], [127.5, 34.3], [126.0, 33.0], [124.5, 31.5],
      [122.0, 31.0], [108.0, 20.0],
      [105.5, 10.5], [104.0, 1.3], [98.0, 12.0], [92.0, 22.0], [80.3, 13.0],
      [77.5, 8.1], [72.0, 19.0], [67.0, 24.8], [60.0, 25.5], [58.5, 23.6],
      [45.0, 12.8], [43.0, 15.0], [39.2, 21.5], [35.0, 28.0], [34.8, 31.5],
      [36.0, 36.5], [29.0, 41.0], [23.0, 39.5], [19.0, 42.0], [18.0, 40.0],
      [15.6, 38.1], [14.2, 40.8], [12.5, 41.9], [9.0, 44.4], [7.0, 43.5],
      [2.2, 41.4], [-5.4, 36.1]
    ], holes: [
      // Caspian Sea
      [[50.5, 47.0], [53.5, 44.0], [54.0, 41.0], [52.0, 37.5], [49.5, 36.5], [47.0, 39.0], [46.5, 43.0], [48.0, 46.0]],
      // Black Sea
      [[34.0, 46.5], [39.5, 45.5], [41.5, 43.0], [40.0, 41.5], [35.0, 41.0], [29.5, 41.5], [27.5, 43.5], [30.0, 46.0]],
      // Baltic Sea
      [[19.0, 65.5], [27.0, 60.5], [30.0, 59.5], [24.0, 54.0], [14.0, 53.5], [9.5, 56.0], [12.0, 60.0], [16.0, 63.5]],
      // Persian Gulf
      [[51.0, 30.5], [56.5, 27.0], [55.0, 25.0], [52.0, 24.0], [48.5, 24.5], [47.5, 27.0], [48.5, 29.5], [50.0, 30.3]]
    ] },
    { name: 'Africa', outer: [
      [10.0, 37.0],
      // Tunisia/Libya coast (Cap Bon / Gulf of Gabes / Tripoli / Gulf of Sirte /
      // Benghazi / Tobruk): pulled south to follow the real coastline instead
      // of a straight line that bulged north into the Mediterranean.
      [11.5, 36.5], [11.0, 34.5],
      [13.2, 32.9], [15.1, 32.4], [16.6, 31.2], [20.1, 32.3], [23.9, 32.3], [25.2, 31.5],
      [30.0, 31.2], [34.0, 29.0], [37.0, 19.0], [43.0, 12.0],
      [51.3, 11.8], [45.3, 2.0], [39.6, -4.0], [35.0, -18.0], [31.0, -29.9],
      [18.4, -34.4], [12.0, -23.0], [13.0, -9.0], [9.0, 0.0], [3.4, 6.5],
      [-4.0, 5.0], [-10.8, 6.3], [-17.4, 14.7], [-16.5, 20.8], [-9.5, 32.0],
      [-7.6, 33.6]
    ] },
    { name: 'Madagascar', outer: [
      [49.3, -12.3], [50.3, -16.0], [47.5, -24.9], [45.0, -23.0], [43.3, -16.0], [45.5, -13.5]
    ] },
    { name: 'Iceland', outer: [
      [-21.9, 66.4], [-16.5, 66.3], [-13.5, 65.3], [-14.5, 63.4], [-19.0, 63.4],
      [-22.5, 63.8], [-24.0, 65.0], [-22.0, 66.0]
    ] },
    { name: 'North America', outer: [
      [-168.0, 65.7], [-156.0, 71.3], [-110.0, 70.0], [-85.0, 66.0], [-85.0, 60.0],
      [-82.0, 55.0], [-78.0, 58.0], [-65.0, 60.0], [-60.0, 55.0], [-53.0, 48.0],
      [-63.0, 45.0], [-68.0, 44.0], [-73.0, 40.6], [-76.0, 35.0], [-80.1, 25.1],
      [-85.0, 30.0], [-90.0, 29.2], [-97.0, 26.0], [-96.0, 19.2], [-88.0, 21.5],
      [-84.0, 9.5], [-83.0, 8.0], [-87.0, 11.5], [-97.0, 16.0], [-106.0, 23.2],
      [-110.0, 22.9], [-115.0, 28.0], [-117.2, 32.6], [-122.4, 37.8], [-124.0, 44.0],
      [-127.0, 49.0], [-135.0, 57.0], [-150.0, 61.0], [-160.0, 55.0]
    ], holes: [
      // Great Lakes (Superior/Michigan/Huron/Erie/Ontario combined, simplified)
      [[-84.5, 49.0], [-76.5, 44.0], [-79.0, 42.0], [-83.0, 41.3], [-87.5, 41.5], [-92.5, 46.5], [-89.5, 48.5], [-86.0, 48.8]]
    ] },
    { name: 'South America', outer: [
      [-77.0, 8.5], [-71.0, 11.5], [-60.0, 8.0], [-50.0, 0.5], [-35.0, -7.5],
      [-38.5, -12.5], [-43.2, -22.9], [-48.5, -26.5], [-53.0, -33.0], [-57.5, -36.5],
      [-62.0, -41.0], [-65.3, -45.0], [-68.5, -52.5], [-67.0, -55.9], [-72.5, -52.0],
      [-74.5, -45.0], [-73.5, -37.0], [-71.6, -33.0], [-70.3, -20.0], [-70.3, -18.3],
      [-81.1, -4.5], [-80.0, 0.2], [-77.5, 3.8]
    ] },
    { name: 'Australia', outer: [
      [142.5, -10.7], [145.8, -16.9], [150.0, -22.0], [153.0, -27.5], [152.0, -33.8],
      [147.0, -38.0], [144.9, -38.3], [140.0, -38.0], [138.6, -34.9], [131.0, -31.5],
      [124.0, -33.0], [115.9, -32.0], [114.0, -22.0], [122.0, -18.0], [130.8, -12.4],
      [135.0, -16.0], [139.0, -17.5], [141.5, -13.0]
    ] },
    { name: 'Greenland', outer: [
      [-43.9, 59.8], [-51.7, 64.2], [-56.0, 70.0], [-65.0, 76.0], [-60.0, 82.0],
      [-40.0, 83.0], [-22.0, 76.0], [-25.0, 70.0], [-35.0, 65.0]
    ] },
    { name: 'Great Britain', outer: [
      [-5.7, 50.1], [-3.0, 50.7], [1.4, 51.4], [1.7, 53.0], [-1.5, 55.5],
      [-3.0, 58.6], [-6.0, 56.8], [-5.0, 53.4]
    ] },
    { name: 'Ireland', outer: [
      [-8.0, 51.5], [-10.0, 52.5], [-8.5, 55.2], [-6.0, 54.5], [-6.0, 52.3]
    ] },
    { name: 'Japan', outer: [
      [130.5, 31.2], [131.5, 33.5], [133.9, 34.2], [135.9, 33.5], [137.0, 34.7],
      [138.9, 34.7], [139.9, 35.3], [140.9, 35.9], [140.9, 37.3], [141.5, 38.3],
      [141.9, 39.6], [141.4, 40.9], [140.1, 39.7], [139.0, 37.9], [136.6, 36.6],
      [135.5, 35.5], [131.5, 34.2]
    ] },
    { name: 'Hokkaido', outer: [
      [140.7, 41.8], [140.0, 43.8], [141.5, 45.4], [145.3, 43.8], [142.5, 42.3]
    ] },
    { name: 'New Zealand North Island', outer: [
      [172.7, -34.4], [178.3, -37.7], [176.9, -39.9], [174.8, -38.0], [174.3, -36.0]
    ] },
    { name: 'New Zealand South Island', outer: [
      [173.3, -40.5], [174.3, -41.3], [173.9, -43.6], [170.5, -46.0], [166.5, -45.5], [171.0, -42.0]
    ] },
    { name: 'Indonesia', outer: [
      [95.3, 5.5], [104.0, -1.0], [106.8, -6.2], [114.5, -8.0], [117.0, -3.5], [110.0, 7.0], [100.0, 5.9]
    ] },
    { name: 'Philippines', outer: [
      [121.5, 18.5], [122.2, 12.5], [125.5, 9.0], [123.5, 6.5], [120.0, 7.5], [119.8, 13.0], [120.3, 16.5]
    ] }
  ];

  // Traces one ring (outer boundary or hole) of [lng, lat] pairs onto the
  // current path via its own moveTo/lineTo/closePath run.
  function traceRing(ctx, ring) {
    var p0 = project(ring[0][0], ring[0][1]);
    ctx.moveTo(p0[0], p0[1]);
    for (var j = 1; j < ring.length; j++) {
      var p = project(ring[j][0], ring[j][1]);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  }

  // Fills the real continent/island outlines above onto a 2D canvas context
  // already sized/positioned for the equirectangular texture (512x256).
  // Each landmass's outer ring and any hole rings (enclosed seas/lakes) are
  // traced into a single path and filled with the even-odd rule, so the
  // holes punch through to the ocean color already painted underneath.
  function drawContinents(ctx, landColor) {
    ctx.fillStyle = landColor;
    for (var i = 0; i < CONTINENTS.length; i++) {
      var land = CONTINENTS[i];
      ctx.beginPath();
      traceRing(ctx, land.outer);
      if (land.holes) {
        for (var h = 0; h < land.holes.length; h++) {
          traceRing(ctx, land.holes[h]);
        }
      }
      ctx.fill('evenodd');
    }
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
          drawContinents(ctx, '#3c8c5a');
          // Subtle decorative highlight overlay on top of the real land shapes
          // (kept from the original theme for visual character; purely cosmetic,
          // does not define land/ocean boundaries).
          var rnd = mulberry32(7);
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
          drawContinents(ctx, '#7fcaa0');
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
  var existingOnly = true;

  // Treat is_existing !== false as "counts as existing": undefined (not yet
  // backfilled by the nightly collection cycle) and true both count.
  function getVisiblePoints() {
    if (!existingOnly) return allPoints;
    return allPoints.filter(function (r) { return r.is_existing !== false; });
  }

  var centroids = {};
  var loadedCountries = {};
  var ZOOM_ALTITUDE_THRESHOLD = 0.5;
  var NEARBY_RADIUS_KM = 500;
  // 6, not 4: verified against the real data/country-centroids.json that Paris
  // has 4 small-territory centroids (BE, LU, JE, GG) strictly closer than FR's
  // own (407km) centroid, so a cap of 4 would still exclude FR for the exact
  // case this fix targets. 6 is the smallest cap that includes FR for Paris
  // while leaving the Munich/Barcelona/Marseille cases (already covered at 4) unchanged.
  var MAX_NEARBY_COUNTRIES = 6;

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

  function nearestCountries(lat, lng) {
    var distances = Object.keys(centroids)
      .filter(function (code) { return code !== 'UNKNOWN'; })
      .map(function (code) {
        var c = centroids[code];
        return { code: code, dist: haversineDistance(lat, lng, c.lat, c.lng) };
      })
      .sort(function (a, b) { return a.dist - b.dist; });

    var nearby = distances.filter(function (entry) { return entry.dist <= NEARBY_RADIUS_KM; });

    if (nearby.length === 0) {
      return distances.length ? [distances[0].code] : [];
    }

    return nearby.slice(0, MAX_NEARBY_COUNTRIES).map(function (entry) { return entry.code; });
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
    fetch('data/facilities-web/' + countryCode + '.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (records) {
        allPoints = mergeById(allPoints, records);
        world.pointsData(getVisiblePoints());
        updatePointCount();
        if (listPanel.classList.contains('open')) renderList();
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
    .pointsData(getVisiblePoints())
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
      nearestCountries(pov.lat, pov.lng).forEach(loadCountryData);
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
    document.getElementById('pointCount').textContent = getVisiblePoints().length;
  }

  fetch('data/summary.json')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      allPoints = data;
      world.pointsData(getVisiblePoints());
      updatePointCount();
      if (listPanel.classList.contains('open')) renderList();
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
      html += '<a class="image-link" href="' + escAttr(commonsUrl(d.image_url)) + '" target="_blank" rel="noopener">';
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
    if (d.wikidata_url) {
      if (isSafeUrl(d.wikidata_url)) html += '<a class="source-link" href="' + escAttr(d.wikidata_url) + '" target="_blank" rel="noopener">Wikidata <span class="arrow">↗</span></a>';
    } else {
      var wikidataFallbackUrl = 'https://www.wikidata.org/wiki/' + d.id;
      if (isSafeUrl(wikidataFallbackUrl)) html += '<a class="source-link" href="' + escAttr(wikidataFallbackUrl) + '" target="_blank" rel="noopener">Wikidata <span class="arrow">↗</span></a>';
    }
    if (d.wikipedia_url && isSafeUrl(d.wikipedia_url)) html += '<a class="source-link" href="' + escAttr(d.wikipedia_url) + '" target="_blank" rel="noopener">Wikipedia <span class="arrow">↗</span></a>';
    // d.res_url is pipeline-constructed (fixed https://equipements.sports.gouv.fr/
    // prefix from normalize.js), not raw external user input, so it doesn't need
    // isSafeUrl scheme-gating the way d.website/t.url do -- but still needs escAttr
    // for the href, matching d.wikidata_url's treatment above.
    if (d.res_url) html += '<a class="source-link" href="' + escAttr(d.res_url) + '" target="_blank" rel="noopener">RES (仏政府) <span class="arrow">↗</span></a>';
    html += '</div>';

    panelScroll.innerHTML = html;
    panel.classList.add('open');
    if (listPanel) listPanel.classList.remove('open');

    world.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.15 }, 900);
    if (controls) controls.autoRotate = false;
  }

  panelClose.addEventListener('click', function () {
    panel.classList.remove('open');
  });

  world.onPointClick(openPanel);

  // --- Existing-only toggle ---------------------------------------------

  var existingToggle = document.getElementById('existingToggle');

  existingToggle.addEventListener('click', function () {
    existingOnly = !existingOnly;
    existingToggle.classList.toggle('active', existingOnly);
    existingToggle.setAttribute('aria-pressed', String(existingOnly));
    world.pointsData(getVisiblePoints());
    updatePointCount();
    if (listPanel.classList.contains('open')) renderList();
  });

  // --- List panel ----------------------------------------------------------

  var listPanel = document.getElementById('listPanel');
  var listPanelClose = document.getElementById('listPanelClose');
  var listOpenBtn = document.getElementById('listOpenBtn');
  var listRows = document.getElementById('listRows');
  var sortKeySelect = document.getElementById('sortKey');
  var sortDirBtn = document.getElementById('sortDir');

  var sortState = { key: 'capacity', dir: 'desc' };
  var currentListData = [];

  // Numeric comparator: null/undefined always sort last, regardless of
  // direction. Non-null values compare per `dir`.
  function compareNullsLast(a, b, dir) {
    var an = (a === null || a === undefined || isNaN(a));
    var bn = (b === null || b === undefined || isNaN(b));
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    var cmp = a < b ? -1 : (a > b ? 1 : 0);
    return dir === 'asc' ? cmp : -cmp;
  }

  function sortRecords(records) {
    var key = sortState.key;
    var dir = sortState.dir;
    var copy = records.slice();
    copy.sort(function (a, b) {
      if (key === 'name') {
        var an = a.name_ja || a.name || '';
        var bn = b.name_ja || b.name || '';
        var cmp = String(an).localeCompare(String(bn));
        return dir === 'asc' ? cmp : -cmp;
      }
      if (key === 'opened_year') {
        return compareNullsLast(
          a.opened_year == null ? null : Number(a.opened_year),
          b.opened_year == null ? null : Number(b.opened_year),
          dir
        );
      }
      // default: capacity
      return compareNullsLast(
        a.capacity == null ? null : Number(a.capacity),
        b.capacity == null ? null : Number(b.capacity),
        dir
      );
    });
    return copy;
  }

  function renderListRows(records) {
    if (records.length === 0) {
      listRows.innerHTML = '<div class="list-empty">条件に一致する施設がありません<br>No facilities match the current filter.</div>';
      return;
    }
    var html = '';
    records.forEach(function (d) {
      var name = (d.name_ja && d.name) ? (esc(d.name_ja) + ' / ' + esc(d.name)) : esc(d.name_ja || d.name);
      var country = esc(d.country || '—');
      var capacity = d.capacity ? esc(Number(d.capacity).toLocaleString('en-US')) : '—';
      var opened = (d.opened_year != null && d.opened_year !== '') ? esc(d.opened_year) : '—';
      html += '<div class="list-row" data-id="' + escAttr(d.id) + '">';
      html += '<div class="lr-name">' + name + '</div>';
      html += '<div class="lr-meta"><span class="lr-country">' + country + '</span><span class="lr-capacity">' + capacity + '</span><span class="lr-year">' + opened + '</span></div>';
      html += '</div>';
    });
    listRows.innerHTML = html;
  }

  function renderList() {
    currentListData = sortRecords(getVisiblePoints());
    renderListRows(currentListData);
  }

  sortKeySelect.value = sortState.key;
  sortDirBtn.textContent = sortState.dir === 'desc' ? '↓' : '↑';
  sortDirBtn.setAttribute('data-dir', sortState.dir);

  sortKeySelect.addEventListener('change', function () {
    sortState.key = sortKeySelect.value;
    renderList();
  });

  sortDirBtn.addEventListener('click', function () {
    sortState.dir = sortState.dir === 'desc' ? 'asc' : 'desc';
    sortDirBtn.textContent = sortState.dir === 'desc' ? '↓' : '↑';
    sortDirBtn.setAttribute('data-dir', sortState.dir);
    renderList();
  });

  listOpenBtn.addEventListener('click', function () {
    renderList();
    listPanel.classList.add('open');
    if (panel) panel.classList.remove('open');
  });

  listPanelClose.addEventListener('click', function () {
    listPanel.classList.remove('open');
  });

  listRows.addEventListener('click', function (e) {
    var row = e.target.closest('.list-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var record = currentListData.filter(function (r) { return String(r.id) === id; })[0];
    if (!record) return;
    listPanel.classList.remove('open');
    world.pointOfView({ lat: record.lat, lng: record.lng, altitude: 1.15 }, 900);
    openPanel(record);
  });

  // --- Full-dataset name search --------------------------------------------

  var searchBox = document.getElementById('searchBox');
  var searchInput = document.getElementById('searchInput');
  var searchDropdown = document.getElementById('searchDropdown');

  var SEARCH_DEBOUNCE_MS = 180;
  var SEARCH_RESULT_CAP = 20;

  // Lazy-loaded, fetched at most once, cached in memory for the session.
  var searchIndexData = null;
  var searchIndexFetchPromise = null;
  var currentSearchResults = [];
  var searchDebounceTimer = null;

  function ensureSearchIndexLoaded() {
    if (searchIndexData) return Promise.resolve(searchIndexData);
    if (searchIndexFetchPromise) return searchIndexFetchPromise;
    searchIndexFetchPromise = fetch('data/search-index.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        searchIndexData = data;
        return data;
      })
      .catch(function (err) {
        console.error('Failed to load data/search-index.json', err);
        searchIndexFetchPromise = null;
        throw err;
      });
    return searchIndexFetchPromise;
  }

  function recordMatchesQuery(record, lowerQuery) {
    var name = (record.name || '').toLowerCase();
    if (name.indexOf(lowerQuery) !== -1) return true;
    var nameJa = record.name_ja ? String(record.name_ja).toLowerCase() : '';
    return nameJa !== '' && nameJa.indexOf(lowerQuery) !== -1;
  }

  // Case-insensitive substring match against name/name_ja, sorted by
  // capacity descending with nulls last, capped at SEARCH_RESULT_CAP.
  function searchFacilities(records, query) {
    var q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    var matches = records.filter(function (r) { return recordMatchesQuery(r, q); });
    matches.sort(function (a, b) {
      return compareNullsLast(
        a.capacity == null ? null : Number(a.capacity),
        b.capacity == null ? null : Number(b.capacity),
        'desc'
      );
    });
    return matches.slice(0, SEARCH_RESULT_CAP);
  }

  function renderSearchResults(records) {
    var html = '';
    records.forEach(function (d) {
      var name = (d.name_ja && d.name) ? (esc(d.name_ja) + ' / ' + esc(d.name)) : esc(d.name_ja || d.name);
      var country = esc(d.country || '—');
      var capacity = d.capacity ? esc(Number(d.capacity).toLocaleString('en-US')) : '—';
      html += '<div class="search-result-row" data-id="' + escAttr(d.id) + '">';
      html += '<div class="sr-name">' + name + '</div>';
      html += '<div class="sr-meta"><span class="sr-country">' + country + '</span><span class="sr-capacity">' + capacity + '</span></div>';
      html += '</div>';
    });
    searchDropdown.innerHTML = html;
    searchDropdown.hidden = false;
  }

  function closeSearchDropdown() {
    searchDropdown.hidden = true;
    searchDropdown.innerHTML = '';
  }

  function showSearchLoading() {
    searchDropdown.innerHTML = '<div class="search-loading">読み込み中... Loading...</div>';
    searchDropdown.hidden = false;
  }

  function showSearchEmpty() {
    searchDropdown.innerHTML = '<div class="search-empty">見つかりません / No results</div>';
    searchDropdown.hidden = false;
  }

  function runSearch() {
    var query = searchInput.value;
    if (query.trim().length < 2) {
      currentSearchResults = [];
      closeSearchDropdown();
      return;
    }
    if (!searchIndexData) {
      if (searchIndexFetchPromise) showSearchLoading();
      else closeSearchDropdown();
      return;
    }
    currentSearchResults = searchFacilities(searchIndexData, query);
    if (currentSearchResults.length === 0) showSearchEmpty();
    else renderSearchResults(currentSearchResults);
  }

  searchInput.addEventListener('focus', function () {
    ensureSearchIndexLoaded()
      .then(function () {
        if (searchInput.value.trim().length >= 2) runSearch();
      })
      .catch(function () { /* already logged in ensureSearchIndexLoaded */ });
  });

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearchDropdown();
  });

  document.addEventListener('click', function (e) {
    if (!searchBox.contains(e.target)) closeSearchDropdown();
  });

  searchDropdown.addEventListener('click', function (e) {
    var row = e.target.closest('.search-result-row');
    if (!row) return;
    var id = row.getAttribute('data-id');
    var record = currentSearchResults.filter(function (r) { return String(r.id) === id; })[0];
    if (!record) return;
    // Leave the typed query in the input (not cleared) so the user can
    // reopen the same result set by refocusing; only the dropdown closes.
    closeSearchDropdown();
    world.pointOfView({ lat: record.lat, lng: record.lng, altitude: 1.15 }, 900);
    loadCountryData(record.country);
    openPanel(record);
  });

  window.__venueAtlas = {
    world: world,
    getAllPoints: function () { return allPoints; },
    getVisiblePoints: getVisiblePoints,
    loadCountryData: loadCountryData,
    nearestCountries: nearestCountries
  };
})();
