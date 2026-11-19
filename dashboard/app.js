'use strict';

/* =========================================================================
   1. CONFIGURACIÓN DEL NODO
   Lo que hay que tocar para adaptar el dashboard a otro nodo o sensor.
   ========================================================================= */
const NODO = {
  equipo: 'Grupo 3',
  nombre: 'siniestro',                 // nodo asignado
  sector: 'lab-hardware',         // sector de la escuela
  sensorDestacado: 'gases',       // la tarjeta que se resalta como "Sensor del equipo"
  sensorTexto: 'MQ-2 (gases) + DHT22'
};

/* Niveles del semáforo: siempre se muestran con texto + ícono + color */
const NIVELES = {
  ok:   { texto: 'Normal',   icono: 'i-check' },
  warn: { texto: 'Atención', icono: 'i-triangulo' },
  bad:  { texto: 'Alerta',   icono: 'i-octogono' }
};
const ORDEN = { ok: 0, warn: 1, bad: 2 };   // menor = mejor

/* =========================================================================
   2. VARIABLES Y UMBRALES
   Temperatura y humedad: apartado 13 de la plantilla (valores escolares).
   Gases: el MQ-2 entrega una lectura cruda (0-4095), no ppm de CO. Los límites
   coinciden con el Arduino: Alerta por encima de 700 (UMBRAL_GAS) y Atención desde
   550, que es donde el Arduino suelta la alerta (700 - HISTERESIS_GAS de 150).
   Si cambian esos números en el Arduino, hay que cambiarlos acá también, y
   justificarlos con fuentes.
   Cada zona va de "a" a "b". En el límite compartido gana el mejor nivel
   (por ejemplo 18 °C es Normal). excluyeB deja afuera el valor "b".
   ========================================================================= */
const VARIABLES = {
  temperatura: {
    etiqueta: 'Temperatura', icono: 'i-termometro', unidad: '°C', dec: 1, tipo: 'num',
    color: 'var(--dato-temperatura)', escala: [10, 40], paso: 5,
    zonas: [
      { a: 10, b: 16, nivel: 'bad' },
      { a: 16, b: 18, nivel: 'warn' },
      { a: 18, b: 26, nivel: 'ok' },
      { a: 26, b: 30, nivel: 'warn' },
      { a: 30, b: 40, nivel: 'bad' }
    ]
  },
  humedad: {
    etiqueta: 'Humedad', icono: 'i-gota', unidad: '%', dec: 1, tipo: 'num',
    color: 'var(--dato-humedad)', escala: [0, 100], paso: 20,
    zonas: [
      { a: 0,  b: 30,  nivel: 'bad' },
      { a: 30, b: 40,  nivel: 'warn' },
      { a: 40, b: 60,  nivel: 'ok' },
      { a: 60, b: 70,  nivel: 'warn' },
      { a: 70, b: 100, nivel: 'bad' }
    ]
  },
  gases: {
    etiqueta: 'Gases', icono: 'i-gas', unidad: 'ADC', dec: 0, tipo: 'num',
    color: 'var(--dato-gases)', escala: [0, 1400], paso: 350,
    zonas: [
      { a: 0,   b: 550,  nivel: 'ok', excluyeB: true },
      { a: 550, b: 700,  nivel: 'warn' },
      { a: 700, b: 1400, nivel: 'bad' }
    ]
  },
  presencia: {
    etiqueta: 'Presencia', icono: 'i-persona', unidad: '', tipo: 'bin',
    color: 'var(--dato-presencia)', textos: ['Sin movimiento', 'Movimiento detectado'], nivelSi: 'warn'
  },
  llama: {
    etiqueta: 'Llama', icono: 'i-llama', unidad: '', tipo: 'bin',
    color: 'var(--dato-llama)', textos: ['Sin llama', '¡Fuego detectado!'], nivelSi: 'bad'
  }
};
const CLAVES = Object.keys(VARIABLES);

/* Nombres alternativos aceptados dentro del mensaje JSON */
const ALIAS = {
  temperatura: 'temperatura', temp: 'temperatura',
  humedad: 'humedad', hum: 'humedad', humidity: 'humedad',
  gases: 'gases', gas: 'gases',
  presencia: 'presencia', motion: 'presencia',
  llama: 'llama', flame: 'llama',
  posicion: 'posicion',           // aceleración en g (la usa el ESP32 y de ahí se deduce la presencia)
  rssi: 'rssi', uptime: 'uptime'
};

const CLAVE_CFG = 'dashNodoCfg_g3';
const CLAVE_HIST = 'dashNodoHist_g3';
const HORA_MS = 3600 * 1000;
const DIA_MS = 24 * HORA_MS;
const MAX_RECIENTES = 30;      // puntos de la mini tendencia
const UMBRAL_MOVIMIENTO_G = 0.25;   // igual que UMBRAL_MOVIMIENTO del Arduino (2,5 m/s² ≈ 0,25 g)

const POR_DEFECTO = {
  fuente: 'simulado',          // 'simulado' o 'mqtt'
  host: '',      // broker Mosquitto (la IP que usa el Arduino)
  puerto: '9001',              // puerto WebSocket del broker (no es el 1883)
  ruta: '',
  usuario: '',
  clave: '',
  topicoJson: 'campus/' + NODO.sector + '/' + NODO.nombre + '/telemetria',
  prefijo: '6to_info/A/G3'     // tópicos sueltos que hoy publica el Arduino (vacío = no usar)
};

/* =========================================================================
   3. ESTADO Y UTILIDADES
   ========================================================================= */
const estado = {
  cfg: null, cliente: null, timerSim: null,
  valores: {}, recientes: {}, hist: {},
  ultimoDato: 0, ultimoMuestreo: 0, marcas: [],
  nivelPrevio: {}, alertas: [],
  rssi: null, uptimeBase: null,
  presenciaDirecta: false, posicion: null,
  varGrafico: NODO.sensorDestacado
};

const $ = (id) => document.getElementById(id);
const fmt = (v, d) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const hora = (t) => new Date(t).toLocaleTimeString('es-AR', { hourCycle: 'h23' });
const limitar = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function svgIcono(id, clase) {
  return '<svg class="icon ' + (clase || '') + '" aria-hidden="true" focusable="false"><use href="#' + id + '"></use></svg>';
}
function cambiarIcono(svg, id) { svg.querySelector('use').setAttribute('href', '#' + id); }

function duracion(seg) {
  seg = Math.max(0, Math.floor(seg));
  const d = Math.floor(seg / 86400), h = Math.floor((seg % 86400) / 3600),
        m = Math.floor((seg % 3600) / 60), s = seg % 60;
  if (d > 0) return d + ' d ' + h + ' h';
  if (h > 0) return h + ' h ' + m + ' min';
  return m + ' min ' + String(s).padStart(2, '0') + ' s';
}

/* Nivel de una lectura según los umbrales de la variable */
function nivelDe(k, v) {
  const c = VARIABLES[k];
  if (c.tipo === 'bin') return v ? c.nivelSi : 'ok';
  const x = limitar(v, c.escala[0], c.escala[1]);
  let mejor = null;
  for (const z of c.zonas) {
    const dentro = x >= z.a && (z.excluyeB ? x < z.b : x <= z.b);
    if (dentro && (mejor === null || ORDEN[z.nivel] < ORDEN[mejor])) mejor = z.nivel;
  }
  return mejor || 'bad';
}

/* =========================================================================
   4. CONFIGURACIÓN GUARDADA (formulario "Conexión y datos")
   ========================================================================= */
function cargarCfg() {
  try {
    const s = localStorage.getItem(CLAVE_CFG);
    return Object.assign({}, POR_DEFECTO, s ? JSON.parse(s) : {});
  } catch (e) { return Object.assign({}, POR_DEFECTO); }
}
function guardarCfg(c) {
  try { localStorage.setItem(CLAVE_CFG, JSON.stringify(c)); } catch (e) { /* sin almacenamiento */ }
}

function llenarFormulario(c) {
  $('cfg-fuente').value = c.fuente;
  $('cfg-host').value = c.host;
  $('cfg-puerto').value = c.puerto;
  $('cfg-ruta').value = c.ruta;
  $('cfg-usuario').value = c.usuario;
  $('cfg-clave').value = c.clave;
  $('cfg-topico').value = c.topicoJson;
  $('cfg-prefijo').value = c.prefijo;
  $('conexion').setAttribute('data-fuente', c.fuente);
}
function leerFormulario() {
  let ruta = $('cfg-ruta').value.trim();
  if (ruta && ruta.charAt(0) !== '/') ruta = '/' + ruta;
  return {
    fuente: $('cfg-fuente').value,
    host: $('cfg-host').value.trim(),
    puerto: $('cfg-puerto').value.trim(),
    ruta: ruta,
    usuario: $('cfg-usuario').value,
    clave: $('cfg-clave').value,
    topicoJson: $('cfg-topico').value.trim(),
    prefijo: $('cfg-prefijo').value.trim().replace(/\/+$/, '')
  };
}

/* =========================================================================
   5. REGISTRO DE MENSAJES
   ========================================================================= */
function agregarLog(topico, valor, sistema) {
  const fila = document.createElement('div');
  fila.className = 'log__fila' + (sistema ? ' log__fila--sis' : '');
  [['log__hora', hora(Date.now())], ['log__topico', topico], ['log__valor', valor]].forEach(function (p) {
    const s = document.createElement('span');
    s.className = p[0];
    s.textContent = p[1];
    fila.appendChild(s);
  });
  const log = $('log');
  log.insertBefore(fila, log.firstChild);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}
const logSis = (msg) => agregarLog('sistema', msg, true);

/* =========================================================================
   6. CONSTRUCCIÓN DE LA INTERFAZ (se arma una sola vez)
   ========================================================================= */
function construirTarjetas() {
  const cont = $('tarjetas');
  cont.innerHTML = '';
  CLAVES.forEach(function (k) {
    const c = VARIABLES[k];
    const dest = k === NODO.sensorDestacado;
    const art = document.createElement('article');
    art.className = 'tarjeta' + (dest ? ' tarjeta--destacada' : '');
    art.id = 'card-' + k;
    art.dataset.nivel = 'sin';
    art.setAttribute('aria-labelledby', 'card-t-' + k);
    art.innerHTML =
      '<div class="tarjeta__cab">' +
        '<span style="color:' + c.color + '">' + svgIcono(c.icono) + '</span>' +
        '<h3 id="card-t-' + k + '">' + c.etiqueta + '</h3>' +
        (dest ? '<span class="insignia">Sensor del equipo</span>' : '') +
      '</div>' +
      '<p class="tarjeta__valor"><span class="valor' + (c.tipo === 'bin' ? ' valor--texto' : '') + '" id="v-' + k + '">--</span>' +
        (c.unidad ? '<span class="unidad">' + c.unidad + '</span>' : '') + '</p>' +
      '<svg class="spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
        '<polyline id="sp-' + k + '" points="" style="stroke:' + c.color + '"></polyline></svg>' +
      '<p class="tarjeta__estado txt-sin" id="e-' + k + '">' + svgIcono('i-reloj', 'icon--sm') + '<span>Sin datos</span></p>' +
      '<p class="tarjeta__cmp" id="c-' + k + '">' + svgIcono('i-igual', 'icon--sm') + '<span>Sin dato de hace 1 h</span></p>';
    cont.appendChild(art);
  });
}

/* Texto de la leyenda de un medidor: "Normal 18–26 °C", "Atención 16–18 y 26–30 °C"... */
function rangoTexto(c, z) {
  if (z.a <= c.escala[0]) return '< ' + fmt(z.b, 0);
  if (z.b >= c.escala[1]) return '> ' + fmt(z.a, 0);
  return fmt(z.a, 0) + '–' + fmt(z.b, 0);
}

function construirMedidores() {
  const cont = $('medidores');
  cont.innerHTML = '';
  CLAVES.filter(function (k) { return VARIABLES[k].tipo === 'num'; }).forEach(function (k) {
    const c = VARIABLES[k];
    const min = c.escala[0], span = c.escala[1] - c.escala[0];

    const segmentos = c.zonas.map(function (z) {
      return '<span class="zona zona--' + z.nivel + '" style="flex:' + ((z.b - z.a) / span) + ' 1 0"></span>';
    }).join('');

    const limites = Array.from(new Set(c.zonas.reduce(function (acc, z) { return acc.concat([z.a, z.b]); }, [])))
      .sort(function (x, y) { return x - y; });
    const ticks = limites.map(function (b, i) {
      const cls = i === 0 ? ' tick--ini' : (i === limites.length - 1 ? ' tick--fin' : '');
      return '<span class="tick' + cls + '" style="left:' + ((b - min) / span * 100) + '%">' + fmt(b, 0) + '</span>';
    }).join('');

    const leyenda = ['ok', 'warn', 'bad'].map(function (n) {
      const rangos = c.zonas.filter(function (z) { return z.nivel === n; }).map(function (z) { return rangoTexto(c, z); });
      return '<li class="txt-' + n + '">' + svgIcono(NIVELES[n].icono) + '<span>' + NIVELES[n].texto + ': ' +
             rangos.join(' y ') + ' ' + c.unidad + '</span></li>';
    }).join('');

    const div = document.createElement('div');
    div.className = 'medidor';
    div.innerHTML =
      '<div class="medidor__cab">' +
        '<span class="medidor__nombre"><span style="color:' + c.color + '">' + svgIcono(c.icono) + '</span>' + c.etiqueta + '</span>' +
        '<span class="chip chip--neutro" id="mc-' + k + '">' + svgIcono('i-reloj', 'icon--sm') + '<span>Sin datos</span></span>' +
      '</div>' +
      '<div class="medidor__barra" id="mb-' + k + '" role="meter" aria-label="' + c.etiqueta + '" ' +
        'aria-valuemin="' + c.escala[0] + '" aria-valuemax="' + c.escala[1] + '">' +
        segmentos + '<div class="marcador" id="mk-' + k + '" hidden></div></div>' +
      '<div class="medidor__ticks" aria-hidden="true">' + ticks + '</div>' +
      '<ul class="leyenda">' + leyenda + '</ul>';
    cont.appendChild(div);
  });
}

function construirBinarios() {
  const cont = $('binarios');
  cont.innerHTML = '';
  CLAVES.filter(function (k) { return VARIABLES[k].tipo === 'bin'; }).forEach(function (k) {
    const c = VARIABLES[k];
    const div = document.createElement('div');
    div.className = 'binario';
    div.innerHTML =
      '<span class="binario__nombre"><span style="color:' + c.color + '">' + svgIcono(c.icono) + '</span>' + c.etiqueta + '</span>' +
      '<span class="chip chip--neutro" id="bc-' + k + '">' + svgIcono('i-reloj', 'icon--sm') + '<span>Sin datos</span></span>';
    cont.appendChild(div);
  });
}

function construirTabs() {
  const cont = $('tabs-grafico');
  cont.innerHTML = '';
  CLAVES.filter(function (k) { return VARIABLES[k].tipo === 'num'; }).forEach(function (k) {
    const c = VARIABLES[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.id = 'tab-' + k;
    b.innerHTML = '<span style="color:' + c.color + '">' + svgIcono(c.icono) + '</span>' + c.etiqueta;
    b.setAttribute('aria-pressed', k === estado.varGrafico ? 'true' : 'false');
    b.addEventListener('click', function () {
      estado.varGrafico = k;
      cont.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-pressed', t === b ? 'true' : 'false'); });
      dibujarGrafico();
    });
    cont.appendChild(b);
  });
}

/* =========================================================================
   7. ACTUALIZACIÓN DE LA INTERFAZ
   ========================================================================= */
function puntosSpark(k) {
  const arr = estado.recientes[k] || [];
  if (arr.length < 2) return '';
  let lo, hi;
  if (VARIABLES[k].tipo === 'bin') { lo = 0; hi = 1; }
  else {
    lo = Math.min.apply(null, arr); hi = Math.max.apply(null, arr);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  }
  return arr.map(function (v, i) {
    const x = i / (arr.length - 1) * 120;
    const y = 30 - (v - lo) / (hi - lo) * 28;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
}

/* Valor que había hace una hora (con margen de 10 min), o null si todavía no hay datos de esa hora */
function valorHace1h(k, ahora) {
  const h = estado.hist[k];
  if (!h || !h.length) return null;
  const objetivo = ahora - HORA_MS;
  let mejor = null, dist = Infinity;
  h.forEach(function (p) {
    const d = Math.abs(p[0] - objetivo);
    if (d < dist) { dist = d; mejor = p; }
  });
  return dist <= 10 * 60 * 1000 ? mejor[1] : null;
}

function actualizarTarjeta(k) {
  const c = VARIABLES[k], v = estado.valores[k], ahora = Date.now();
  const card = $('card-' + k), est = $('e-' + k), cmp = $('c-' + k);
  if (v === undefined) return;

  const n = nivelDe(k, v);
  card.dataset.nivel = n;
  $('v-' + k).textContent = c.tipo === 'bin' ? c.textos[v ? 1 : 0] : fmt(v, c.dec);

  est.className = 'tarjeta__estado txt-' + n;
  cambiarIcono(est.querySelector('svg'), NIVELES[n].icono);
  est.querySelector('span').textContent = NIVELES[n].texto;

  $('sp-' + k).setAttribute('points', puntosSpark(k));

  const viejo = valorHace1h(k, ahora);
  let icono = 'i-igual', texto;
  if (viejo === null) {
    texto = 'Sin dato de hace 1 h';
  } else if (c.tipo === 'bin') {
    texto = 'Hace 1 h: ' + c.textos[viejo ? 1 : 0];
  } else {
    const d = v - viejo;
    if (Math.abs(d) < Math.pow(10, -c.dec) / 2) {
      texto = 'Sin cambio vs. hace 1 h';
    } else {
      icono = d > 0 ? 'i-sube' : 'i-baja';
      texto = (d > 0 ? '+' : '−') + fmt(Math.abs(d), c.dec) + (c.unidad ? ' ' + c.unidad : '') + ' vs. hace 1 h';
    }
  }
  cambiarIcono(cmp.querySelector('svg'), icono);
  cmp.querySelector('span').textContent = texto;
}

function ponerChip(el, nivel, texto) {
  el.className = 'chip chip--' + nivel;
  cambiarIcono(el.querySelector('svg'), NIVELES[nivel].icono);
  el.querySelector('span').textContent = texto;
}

function actualizarMedidor(k) {
  const c = VARIABLES[k], v = estado.valores[k];
  if (v === undefined) return;
  const n = nivelDe(k, v);
  const x = limitar(v, c.escala[0], c.escala[1]);
  const marcador = $('mk-' + k);
  marcador.hidden = false;
  marcador.style.left = ((x - c.escala[0]) / (c.escala[1] - c.escala[0]) * 100) + '%';

  const valorTxt = fmt(v, c.dec) + ' ' + c.unidad;
  ponerChip($('mc-' + k), n, NIVELES[n].texto + ' · ' + valorTxt);
  const barra = $('mb-' + k);
  barra.setAttribute('aria-valuenow', x);
  barra.setAttribute('aria-valuetext', valorTxt + ', ' + NIVELES[n].texto);
}

function actualizarBinario(k) {
  const c = VARIABLES[k], v = estado.valores[k];
  if (v === undefined) return;
  const n = nivelDe(k, v);
  ponerChip($('bc-' + k), n, c.textos[v ? 1 : 0] + ' · ' + NIVELES[n].texto);
}

/* ---- Gráfico de 24 h, dibujado con SVG propio ---- */
function dibujarGrafico() {
  const k = estado.varGrafico, c = VARIABLES[k], cont = $('grafico');
  const W = Math.max(300, Math.floor(cont.clientWidth) || 760);
  const H = W < 520 ? 250 : 290;
  const m = { l: 48, r: 12, t: 14, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const ahora = Date.now(), t0 = ahora - DIA_MS;
  const ymin = c.escala[0], ymax = c.escala[1];
  const X = (t) => m.l + (t - t0) / DIA_MS * iw;
  const Y = (v) => m.t + (1 - (limitar(v, ymin, ymax) - ymin) / (ymax - ymin)) * ih;

  const pts = (estado.hist[k] || []).filter(function (p) { return p[0] >= t0; }).map(function (p) { return [p[0], p[1]]; });
  if (estado.valores[k] !== undefined) pts.push([ahora, estado.valores[k]]);

  let s = '';

  /* Franjas de umbral de fondo */
  c.zonas.forEach(function (z) {
    const y1 = Y(z.b), y2 = Y(z.a);
    s += '<rect class="banda banda--' + z.nivel + '" x="' + m.l + '" y="' + y1.toFixed(1) + '" width="' + iw + '" height="' + (y2 - y1).toFixed(1) + '"></rect>';
    if (y2 - y1 >= 18) {
      s += '<text class="banda-txt banda-txt--' + z.nivel + '" x="' + (m.l + iw - 6) + '" y="' + (y1 + 14).toFixed(1) + '" text-anchor="end">' + NIVELES[z.nivel].texto + '</text>';
    }
  });

  /* Grilla suave y ejes */
  for (let v = ymin; v <= ymax + 1e-9; v += c.paso) {
    const y = Y(v).toFixed(1);
    s += '<line class="grilla" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y + '" y2="' + y + '"></line>';
    s += '<text class="eje-txt" x="' + (m.l - 8) + '" y="' + (Number(y) + 4) + '" text-anchor="end">' + fmt(v, 0) + '</text>';
  }
  for (let i = 0; i <= 4; i++) {
    const x = (m.l + iw * i / 4).toFixed(1);
    s += '<line class="grilla" x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"></line>';
    const anc = i === 0 ? 'start' : (i === 4 ? 'end' : 'middle');
    s += '<text class="eje-txt" x="' + x + '" y="' + (H - 8) + '" text-anchor="' + anc + '">' + (i === 4 ? 'ahora' : '−' + (24 - 6 * i) + ' h') + '</text>';
  }

  let resumen = 'Todavía no hay datos para graficar.';
  let aria = 'Histórico de 24 horas de ' + c.etiqueta + ': sin datos todavía.';

  if (pts.length) {
    const d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' ');
    s += '<path class="linea" d="' + d + '" style="stroke:' + c.color + '"></path>';

    /* Último punto resaltado */
    const ult = pts[pts.length - 1];
    const ux = X(ult[0]), uy = Y(ult[1]);
    s += '<circle class="punto-halo" cx="' + ux.toFixed(1) + '" cy="' + uy.toFixed(1) + '" r="9" style="fill:' + c.color + '"></circle>';
    s += '<circle class="punto" cx="' + ux.toFixed(1) + '" cy="' + uy.toFixed(1) + '" r="5" style="fill:' + c.color + '"></circle>';
    const etiqueta = fmt(ult[1], c.dec) + ' ' + c.unidad;
    const ty = uy < m.t + 30 ? uy + 24 : uy - 14;
    s += '<text class="punto-txt" x="' + (ux - 12).toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="end">' + etiqueta + '</text>';

    const vals = pts.map(function (p) { return p[1]; });
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    const horas = (ahora - pts[0][0]) / HORA_MS;
    resumen = 'Último: ' + etiqueta + ' · Mínimo: ' + fmt(mn, c.dec) + ' · Máximo: ' + fmt(mx, c.dec) + ' ' + c.unidad +
              ' · Datos acumulados: ' + (horas >= 1 ? fmt(Math.min(horas, 24), 1) + ' h' : Math.max(1, Math.round(horas * 60)) + ' min');
    aria = 'Histórico de 24 horas de ' + c.etiqueta + '. Último valor ' + etiqueta + ', mínimo ' + fmt(mn, c.dec) + ', máximo ' + fmt(mx, c.dec) + '.';
  }

  cont.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + aria + '">' + s + '</svg>';
  $('grafico-resumen').textContent = resumen;
}

/* ---- Alertas ---- */
function evaluarAlerta(k, v, ahora) {
  const c = VARIABLES[k];
  const n = nivelDe(k, v);
  const previo = estado.nivelPrevio[k];
  estado.nivelPrevio[k] = n;
  if (n === previo) return;

  if (n === 'ok') {
    estado.alertas.forEach(function (a) { if (a.k === k && !a.resuelta) a.resuelta = ahora; });
    return;
  }
  const motivo = c.tipo === 'bin'
    ? c.textos[1]
    : c.etiqueta + ' en zona ' + NIVELES[n].texto + ': ' + fmt(v, c.dec) + ' ' + c.unidad;
  estado.alertas.unshift({ t: ahora, nivel: n, k: k, motivo: motivo, resuelta: null });
  if (estado.alertas.length > 20) estado.alertas.pop();
}

function dibujarAlertas() {
  const lista = $('alertas'), vacio = $('alertas-vacio');
  lista.innerHTML = '';
  vacio.hidden = estado.alertas.length > 0;
  estado.alertas.slice(0, 8).forEach(function (a) {
    const li = document.createElement('li');
    li.className = 'alerta';
    li.innerHTML =
      '<span class="chip chip--' + a.nivel + '">' + svgIcono(NIVELES[a.nivel].icono, 'icon--sm') + '<span>' + NIVELES[a.nivel].texto + '</span></span>' +
      '<time></time><span class="alerta__motivo"></span>';
    li.querySelector('time').textContent = hora(a.t);
    const motivo = li.querySelector('.alerta__motivo');
    motivo.textContent = a.motivo;
    if (a.resuelta) {
      const r = document.createElement('span');
      r.className = 'alerta__resuelta';
      r.textContent = 'Resuelta a las ' + hora(a.resuelta);
      motivo.appendChild(r);
    }
    lista.appendChild(li);
  });
}

function actualizarTodo() {
  CLAVES.forEach(function (k) {
    actualizarTarjeta(k);
    if (VARIABLES[k].tipo === 'num') actualizarMedidor(k); else actualizarBinario(k);
  });
  dibujarGrafico();
  dibujarAlertas();
  relojYSalud();
}

/* ---- Encabezado y salud del nodo (se refresca cada segundo) ---- */
function relojYSalud() {
  const ahora = Date.now();
  const tiene = estado.ultimoDato > 0;
  const edadMin = tiene ? (ahora - estado.ultimoDato) / 60000 : null;

  /* Estado del nodo, según el apartado 13: < 2 min En línea, 2–5 min Atención, > 5 min Desconectado */
  let nivel, texto;
  if (!tiene) { nivel = 'neutro'; texto = 'Sin datos'; }
  else if (edadMin < 2) { nivel = 'ok'; texto = 'En línea'; }
  else if (edadMin <= 5) { nivel = 'warn'; texto = 'Datos con retraso'; }
  else { nivel = 'bad'; texto = 'Desconectado'; }

  const chip = $('estado-nodo');
  if (chip.dataset.k !== nivel + '|' + texto) {
    chip.dataset.k = nivel + '|' + texto;
    chip.className = 'chip chip--' + nivel;
    cambiarIcono(chip.querySelector('svg'), nivel === 'neutro' ? 'i-reloj' : NIVELES[nivel].icono);
    chip.querySelector('span').textContent = texto;
  }

  $('h-ultimo').textContent = tiene ? hora(estado.ultimoDato) : '--:--:--';
  $('h-hace').textContent = tiene ? '(hace ' + Math.round((ahora - estado.ultimoDato) / 1000) + ' s)' : '';

  /* RSSI: valores de referencia habituales en WiFi (no vienen de la guía) */
  const r = $('s-rssi');
  if (estado.rssi === null) {
    r.textContent = 'Sin dato (el nodo debe enviar "rssi")';
    r.className = 'txt-sin';
  } else {
    const n = estado.rssi >= -60 ? 'ok' : (estado.rssi >= -75 ? 'warn' : 'bad');
    r.textContent = estado.rssi + ' dBm · ' + (n === 'ok' ? 'Buena' : (n === 'warn' ? 'Regular' : 'Débil'));
    r.className = 'txt-' + n;
  }

  $('s-uptime').textContent = estado.uptimeBase
    ? duracion(estado.uptimeBase.valor + (ahora - estado.uptimeBase.t) / 1000)
    : 'Sin dato (el nodo debe enviar "uptime")';

  estado.marcas = estado.marcas.filter(function (t) { return ahora - t < 60000; });
  $('s-mpm').textContent = String(estado.marcas.length);

  $('s-topico').textContent = estado.cfg.fuente === 'simulado'
    ? estado.cfg.topicoJson + ' (simulado)'
    : estado.cfg.topicoJson;
}

/* =========================================================================
   8. ENTRADA DE DATOS (la usan tanto MQTT como la simulación)
   ========================================================================= */
function normalizar(obj) {
  const out = {};
  Object.keys(obj).forEach(function (nombre) {
    const k = ALIAS[nombre.toLowerCase()];
    if (!k) return;
    const vv = obj[nombre];
    let n;
    if (typeof vv === 'boolean') n = vv ? 1 : 0;
    else if (typeof vv === 'string') {
      const t = vv.trim().toLowerCase();
      if (t === 'true' || t === 'on' || t === 'si' || t === 'sí') n = 1;
      else if (t === 'false' || t === 'off' || t === 'no') n = 0;
      else n = parseFloat(t.replace(',', '.'));
    } else n = Number(vv);
    if (!isFinite(n)) return;
    if (VARIABLES[k] && VARIABLES[k].tipo === 'bin') n = n ? 1 : 0;
    out[k] = n;
  });
  return out;
}

/* Guarda un punto por minuto para el histórico de 24 h y la comparación con hace 1 h */
function muestrear(ahora) {
  if (ahora - estado.ultimoMuestreo < 60000) return;
  estado.ultimoMuestreo = ahora;
  CLAVES.forEach(function (k) {
    if (estado.valores[k] === undefined) return;
    if (!estado.hist[k]) estado.hist[k] = [];
    estado.hist[k].push([ahora, estado.valores[k]]);
    const lim = ahora - DIA_MS;
    while (estado.hist[k].length && estado.hist[k][0][0] < lim) estado.hist[k].shift();
  });
  if (estado.cfg.fuente === 'mqtt') {
    try { localStorage.setItem(CLAVE_HIST, JSON.stringify(estado.hist)); } catch (e) { /* sin almacenamiento */ }
  }
}

function cargarHistGuardado() {
  try {
    const o = JSON.parse(localStorage.getItem(CLAVE_HIST) || '{}');
    const lim = Date.now() - DIA_MS;
    CLAVES.forEach(function (k) {
      if (!Array.isArray(o[k])) return;
      estado.hist[k] = o[k].filter(function (p) { return Array.isArray(p) && p[0] >= lim && isFinite(p[1]); });
      if (estado.hist[k].length) estado.ultimoMuestreo = Math.max(estado.ultimoMuestreo, estado.hist[k][estado.hist[k].length - 1][0]);
    });
  } catch (e) { /* sin historial guardado */ }
}

function ingresar(p) {
  const ahora = Date.now();
  let hubo = false;

  /* Presencia: si el nodo la manda directamente, se usa tal cual. Si solo manda "posicion"
     (aceleración en g), se deduce: hay movimiento si se aleja de 1 g más que el umbral. */
  if (p.presencia !== undefined) estado.presenciaDirecta = true;
  else if (p.posicion !== undefined && !estado.presenciaDirecta) {
    p.presencia = Math.abs(p.posicion - 1) > UMBRAL_MOVIMIENTO_G ? 1 : 0;
  }
  CLAVES.forEach(function (k) {
    if (p[k] === undefined) return;
    estado.valores[k] = p[k];
    if (!estado.recientes[k]) estado.recientes[k] = [];
    estado.recientes[k].push(p[k]);
    if (estado.recientes[k].length > MAX_RECIENTES) estado.recientes[k].shift();
    evaluarAlerta(k, p[k], ahora);
    hubo = true;
  });
  if (p.posicion !== undefined) { estado.posicion = p.posicion; hubo = true; }
  if (p.rssi !== undefined) { estado.rssi = Math.round(p.rssi); hubo = true; }
  if (p.uptime !== undefined) { estado.uptimeBase = { valor: p.uptime, t: ahora }; hubo = true; }
  if (!hubo) return;

  estado.ultimoDato = ahora;
  estado.marcas.push(ahora);
  muestrear(ahora);
  actualizarTodo();
}

/* =========================================================================
   9. FUENTE 1: DATOS SIMULADOS
   Se actualizan cada 3 s, como llegarían por MQTT.
   ========================================================================= */
const sim = { temp: 23, hum: 52, gas: 320, evento: 0, presTicks: 0, inicio: 0 };

function rellenarHistorialSim() {
  const ahora = Date.now();
  estado.hist = {};
  CLAVES.forEach(function (k) { estado.hist[k] = []; });
  for (let i = 288; i >= 1; i--) {              // 24 h, un punto cada 5 min
    const t = ahora - i * 300000;
    const d = new Date(t);
    const h = d.getHours() + d.getMinutes() / 60;
    const ciclo = Math.sin(2 * Math.PI * (h - 9) / 24);
    const episodio = (i >= 150 && i <= 160) ? 290 + (i % 3) * 10 : 0;   // un episodio de Atención hace ~13 h
    estado.hist.temperatura.push([t, +(22.5 + 2.5 * ciclo + (Math.random() - 0.5) * 0.5).toFixed(1)]);
    estado.hist.humedad.push([t, +(54 - 6 * ciclo + (Math.random() - 0.5) * 1.5).toFixed(1)]);
    estado.hist.gases.push([t, Math.round(280 + 60 * ciclo + (Math.random() - 0.5) * 50 + episodio)]);
    estado.hist.presencia.push([t, Math.random() < 0.2 ? 1 : 0]);
    estado.hist.llama.push([t, 0]);
  }
  estado.ultimoMuestreo = ahora;
}

function tickSim() {
  const ev = sim.evento > 0;
  if (ev) sim.evento--;
  sim.temp += ((ev ? 32 : 23) - sim.temp) * (ev ? 0.25 : 0.06) + (Math.random() - 0.5) * 0.3;
  sim.hum += ((ev ? 44 : 52) - sim.hum) * 0.06 + (Math.random() - 0.5) * 1;
  sim.gas = Math.max(0, sim.gas + ((ev ? 1500 : 320) - sim.gas) * (ev ? 0.35 : 0.1) + (Math.random() - 0.5) * 35);

  let pres = 0;
  if (sim.presTicks > 0) { sim.presTicks--; pres = 1; }
  else if (Math.random() < 0.04) { sim.presTicks = 2; pres = 1; }

  ingresar({
    temperatura: +sim.temp.toFixed(1),
    humedad: +sim.hum.toFixed(1),
    gases: Math.round(sim.gas),
    presencia: pres,
    llama: (ev && sim.evento < 4) ? 1 : 0,
    rssi: -62 + Math.round((Math.random() - 0.5) * 6),
    uptime: Math.floor((Date.now() - sim.inicio) / 1000)
  });
}

function iniciarSimulado() {
  Object.assign(sim, { temp: 23, hum: 52, gas: 320, evento: 0, presTicks: 0, inicio: Date.now() - (3 * HORA_MS + 17 * 60000) });
  rellenarHistorialSim();
  $('conexion-estado').textContent = 'Fuente: datos simulados (se actualizan cada 3 s). Para usar el nodo real, elegí MQTT.';
  tickSim();
  estado.timerSim = setInterval(tickSim, 3000);
}

/* =========================================================================
   10. FUENTE 2: MQTT POR WEBSOCKETS
   Acepta dos formas de publicar:
   - un mensaje JSON en el tópico del nodo (campus/sector/nodo/telemetria), o
   - los tópicos sueltos que hoy publica el Arduino (prefijo/temperatura, ...).
   ========================================================================= */
function textoConexion(t) { $('conexion-estado').textContent = t; }

function alMensaje(topico, payload) {
  const c = estado.cfg;
  const texto = payload.toString().trim();
  agregarLog(topico, texto, false);

  if (topico === c.topicoJson) {
    let obj;
    try { obj = JSON.parse(texto); } catch (e) { logSis('El mensaje de ' + topico + ' no es un JSON válido.'); return; }
    if (obj && typeof obj === 'object') ingresar(normalizar(obj));
    return;
  }
  if (c.prefijo && topico.indexOf(c.prefijo + '/') === 0) {
    const nombre = topico.slice(c.prefijo.length + 1);
    if (VARIABLES[nombre] || nombre === 'posicion') { const o = {}; o[nombre] = texto; ingresar(normalizar(o)); }
  }
}

function iniciarMqtt() {
  const c = estado.cfg;
  cargarHistGuardado();
  actualizarTodo();

  if (typeof mqtt === 'undefined') {
    logSis('No se cargó la librería MQTT. La PC necesita internet para bajarla de cdn.jsdelivr.net.');
    textoConexion('Error: no se cargó la librería MQTT.');
    return;
  }
  if (location.protocol === 'https:') {
    logSis('Aviso: esta página está en https y el navegador va a bloquear ws://. Hace falta un broker con wss:// o abrir el archivo desde la PC.');
  }

  const url = 'ws://' + c.host + ':' + c.puerto + c.ruta;
  logSis('Conectando a ' + url + ' …');
  textoConexion('Conectando a ' + url + ' …');
  let falloAvisado = false;

  try {
    estado.cliente = mqtt.connect(url, {
      username: c.usuario || undefined,
      password: c.clave || undefined,
      clientId: 'web_dash_g3_' + Math.random().toString(16).slice(2, 8),
      reconnectPeriod: 3000,
      connectTimeout: 5000,
      clean: true
    });
  } catch (e) {
    logSis('Error al iniciar la conexión: ' + e.message);
    textoConexion('Error: ' + e.message);
    return;
  }
  const cli = estado.cliente;

  cli.on('connect', function () {
    falloAvisado = false;
    logSis('Conectado al broker.');
    textoConexion('Conectado al broker ' + c.host + '.');
    const topicos = [];
    if (c.topicoJson) topicos.push(c.topicoJson);
    if (c.prefijo) CLAVES.concat(['posicion']).forEach(function (k) { topicos.push(c.prefijo + '/' + k); });
    cli.subscribe(topicos, { qos: 0 }, function (err, granted) {
      if (err) { logSis('Error al suscribirse: ' + err.message); return; }
      const rechazados = (granted || []).filter(function (g) { return g.qos === 128; });
      if (rechazados.length) {
        logSis('El broker rechazó la suscripción a: ' + rechazados.map(function (g) { return g.topic; }).join(', ') + ' (¿permisos del usuario?)');
      } else {
        logSis('Suscrito a ' + topicos.length + ' tópicos. Esperando mensajes del nodo…');
      }
    });
  });

  cli.on('message', alMensaje);

  cli.on('close', function () {
    if (!falloAvisado) {
      logSis('Sin conexión con ' + url + '. Revisá la IP y el puerto, y que el broker tenga WebSockets habilitado. Reintentando cada 3 s…');
      textoConexion('Sin conexión con el broker. Reintentando…');
      falloAvisado = true;
    }
  });

  cli.on('error', function (err) {
    if (err && err.message && !falloAvisado) logSis('Error: ' + err.message);
  });
}

/* =========================================================================
   11. CONTROL DE LA FUENTE Y EVENTOS DE LA INTERFAZ
   ========================================================================= */
function detener() {
  if (estado.timerSim) { clearInterval(estado.timerSim); estado.timerSim = null; }
  if (estado.cliente) { try { estado.cliente.end(true); } catch (e) { /* nada */ } estado.cliente = null; }
}

function iniciarFuente() {
  detener();
  Object.assign(estado, {
    valores: {}, recientes: {}, hist: {}, ultimoDato: 0, ultimoMuestreo: 0, marcas: [],
    nivelPrevio: {}, alertas: [], rssi: null, uptimeBase: null,
    presenciaDirecta: false, posicion: null
  });
  construirTarjetas();
  construirMedidores();
  construirBinarios();
  actualizarTodo();
  if (estado.cfg.fuente === 'mqtt') iniciarMqtt(); else iniciarSimulado();
}

function aplicar() {
  estado.cfg = leerFormulario();
  guardarCfg(estado.cfg);
  $('conexion').setAttribute('data-fuente', estado.cfg.fuente);
  iniciarFuente();
}

function arrancar() {
  $('h-equipo').textContent = 'Dashboard del nodo · ' + NODO.equipo;
  $('h-nodo').textContent = NODO.nombre.charAt(0).toUpperCase() + NODO.nombre.slice(1);
  $('h-sector').textContent = NODO.sector;
  $('h-sensor').textContent = NODO.sensorTexto;

  estado.cfg = cargarCfg();
  llenarFormulario(estado.cfg);
  construirTabs();

  $('cfg-fuente').addEventListener('change', function () {
    $('conexion').setAttribute('data-fuente', $('cfg-fuente').value);
  });
  $('form-cfg').addEventListener('submit', function (e) { e.preventDefault(); aplicar(); });
  $('btn-restaurar').addEventListener('click', function () {
    llenarFormulario(POR_DEFECTO);
    aplicar();
  });
  $('btn-evento').addEventListener('click', function () {
    sim.evento = 10;     // 30 s con gas alto, temperatura en subida y fuego al final
    logSis('Evento simulado: aumento de gas y temperatura.');
  });

  let pendiente = null;
  window.addEventListener('resize', function () {
    clearTimeout(pendiente);
    pendiente = setTimeout(dibujarGrafico, 150);
  });

  setInterval(relojYSalud, 1000);
  iniciarFuente();
}

arrancar();
