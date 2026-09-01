// ============ DATA LOAD ============
// In the single-file version this data was embedded inline; here it's fetched from data/*.json
// so the files stay diffable/reviewable in git. Populated by loadBaseData() before init runs.
let ATT = [];
let SAT = [];
let ORIGINAL_ATT = []; // frozen copy of the data shipped in data/*.json, used by "Restaurar datos originales"
let ORIGINAL_SAT = [];
let attSourceName = null; // filename of last uploaded attendance file, or null = original
let satSourceName = null;
let loadedFromSnapshot = false; // true if ATT/SAT were restored from this browser's autosave at init

async function loadBaseData(){
  const [attRes, satRes] = await Promise.all([
    fetch('data/attendance.json'),
    fetch('data/satisfaction.json')
  ]);
  if(!attRes.ok || !satRes.ok) throw new Error(`HTTP ${attRes.status}/${satRes.status}`);
  ATT = await attRes.json();
  SAT = await satRes.json();
  ORIGINAL_ATT = JSON.parse(JSON.stringify(ATT));
  ORIGINAL_SAT = JSON.parse(JSON.stringify(SAT));
}

const BLUE = ['#1B6FC9', '#5BB0FF', '#0F3E7A', '#8FC7FF', '#2E86E0', '#B9DBFF'];
const ACCENT = { green: '#1FA97F', amber: '#E0A429', red: '#D9534F', ink:'#16283F', muted:'#5B7089' };

Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#5B7089';
Chart.register(ChartDataLabels);

// ============ STATE ============
const state = { periodo: '', facultad: '', carrera: '', sede: '', curso: '' };
let charts = {}; // registry to destroy on re-render

function destroyCharts(){
  Object.values(charts).forEach(c => { try{ c.destroy(); }catch(e){} });
  charts = {};
}

// ============ FILTER UI SETUP ============
// Rebuildable: called once at init and again every time ATT/SAT are replaced by an uploaded file,
// so the Facultad/Carrera/Sede/Curso options always reflect whatever data is currently loaded.
function rebuildFilters(){
  const perSel = document.getElementById('fPeriodo');
  const facSel = document.getElementById('fFacultad');
  const carSel = document.getElementById('fCarrera');
  const sedeWrap = document.getElementById('fSede');
  const cursoWrap = document.getElementById('fCurso');

  perSel.innerHTML = '<option value="">Todos los periodos</option>';
  facSel.innerHTML = '<option value="">Todas</option>';
  carSel.innerHTML = '<option value="">Todas</option>';
  sedeWrap.innerHTML = '';
  cursoWrap.innerHTML = '';

  const periodos = [...new Set([...ATT.map(r=>r.periodo), ...SAT.map(r=>r.periodo)].filter(Boolean))].sort();
  periodos.forEach(p=>{
    const o = document.createElement('option'); o.value=p; o.textContent=p; perSel.appendChild(o);
  });
  perSel.value = periodos.includes(state.periodo) ? state.periodo : '';
  if(!periodos.includes(state.periodo)) state.periodo = '';
  perSel.onchange = ()=>{ state.periodo = perSel.value; render(); };

  const facultades = [...new Set(ATT.map(r=>r.facultad).filter(Boolean))].sort();
  facultades.forEach(f=>{
    const o = document.createElement('option'); o.value=f; o.textContent=f; facSel.appendChild(o);
  });
  facSel.value = facultades.includes(state.facultad) ? state.facultad : '';
  if(!facultades.includes(state.facultad)) state.facultad = '';

  function refreshCarreras(){
    carSel.innerHTML = '<option value="">Todas</option>';
    const pool = ATT.filter(r => !state.facultad || r.facultad === state.facultad);
    const carreras = [...new Set(pool.map(r=>r.carrera).filter(Boolean))].sort();
    carreras.forEach(c=>{
      const o = document.createElement('option'); o.value=c; o.textContent=c; carSel.appendChild(o);
    });
    carSel.value = carreras.includes(state.carrera) ? state.carrera : '';
    if(!carreras.includes(state.carrera)) state.carrera = '';
  }
  refreshCarreras();

  facSel.onchange = ()=>{ state.facultad = facSel.value; refreshCarreras(); render(); };
  carSel.onchange = ()=>{ state.carrera = carSel.value; render(); };

  const sedes = [...new Set([...ATT.map(r=>r.sede), ...SAT.map(r=>r.sede)].filter(Boolean))].sort();
  sedes.forEach(s=>{
    const b = document.createElement('button');
    b.className='pill'+(state.sede===s?' active':''); b.textContent=s; b.dataset.val=s;
    b.addEventListener('click', ()=>{
      state.sede = state.sede === s ? '' : s;
      [...sedeWrap.children].forEach(p=>p.classList.toggle('active', p.dataset.val===state.sede));
      render();
    });
    sedeWrap.appendChild(b);
  });
  if(!sedes.includes(state.sede)) state.sede = '';

  const cursos = [...new Set([...ATT.map(r=>r.curso), ...SAT.map(r=>r.curso)].filter(Boolean))].sort();
  cursos.forEach(c=>{
    const b = document.createElement('button');
    b.className='pill'+(state.curso===c?' active':''); b.textContent=c; b.dataset.val=c;
    b.addEventListener('click', ()=>{
      state.curso = state.curso === c ? '' : c;
      [...cursoWrap.children].forEach(p=>p.classList.toggle('active', p.dataset.val===state.curso));
      render();
    });
    cursoWrap.appendChild(b);
  });
  if(!cursos.includes(state.curso)) state.curso = '';

  document.getElementById('resetFilters').onclick = ()=>{
    state.facultad=''; state.carrera=''; state.sede=''; state.curso='';
    facSel.value=''; refreshCarreras();
    [...sedeWrap.children].forEach(p=>p.classList.remove('active'));
    [...cursoWrap.children].forEach(p=>p.classList.remove('active'));
    render();
  };
}

function applyFilters(rows){
  return rows.filter(r =>
    (!state.periodo || r.periodo === state.periodo) &&
    (!state.facultad || r.facultad === state.facultad) &&
    (!state.carrera || r.carrera === state.carrera) &&
    (!state.sede || r.sede === state.sede) &&
    (!state.curso || r.curso === state.curso)
  );
}

// Comparativo is inherently multi-period, so it ignores the Periodo académico filter
// (it still respects Facultad/Carrera/Sede/Curso).
function applyFiltersExceptPeriodo(rows){
  return rows.filter(r =>
    (!state.facultad || r.facultad === state.facultad) &&
    (!state.carrera || r.carrera === state.carrera) &&
    (!state.sede || r.sede === state.sede) &&
    (!state.curso || r.curso === state.curso)
  );
}

// ============ TABS ============
const PAGES = ['participantes','asistencia','rendimiento','satisfaccion','comparativo'];
function setupTabs(){
  document.getElementById('tabs').addEventListener('click', e=>{
    const btn = e.target.closest('button[data-page]');
    if(!btn) return;
    document.querySelectorAll('#tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentPage = btn.dataset.page;
    render();
  });
}
let currentPage = 'participantes';

// ============ HELPERS ============
function fmtPct(x, d=2){ return (x==null || isNaN(x)) ? '—' : x.toFixed(d)+'%'; }
function fmtNum(x, d=2){ return (x==null || isNaN(x)) ? '—' : x.toFixed(d); }
function avg(arr){ const v = arr.filter(x=>x!=null && !isNaN(x)); return v.length? v.reduce((a,b)=>a+b,0)/v.length : null; }
function sum(arr){ return arr.filter(x=>x!=null && !isNaN(x)).reduce((a,b)=>a+b,0); }
function groupBy(rows, key){
  const m = new Map();
  rows.forEach(r=>{
    const k = r[key] ?? '—';
    if(!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  });
  return m;
}
function topN(map, n, valueFn, desc=true){
  return [...map.entries()].map(([k,v])=>({label:k, value:valueFn(v)}))
    .sort((a,b)=> desc ? b.value-a.value : a.value-b.value).slice(0,n);
}
function el(tag, attrs={}, ...children){
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(k==='class') e.className=v;
    else if(k==='html') e.innerHTML=v;
    else e.setAttribute(k,v);
  });
  children.forEach(c=> e.appendChild(typeof c==='string'? document.createTextNode(c): c));
  return e;
}

function barChart(ctx, labels, data, opts={}){
  const horizontal = !!opts.horizontal;
  const valueAxis = horizontal ? 'x' : 'y';
  const categoryAxis = horizontal ? 'y' : 'x';
  const scales = {};
  scales[valueAxis] = {
    grid:{ color:'#EEF3FA' },
    ticks:{ callback: v=> opts.isPct ? v+'%': v },
    beginAtZero:true, max: opts.max
  };
  scales[categoryAxis] = { grid:{ display: !horizontal, color:'#EEF3FA' } };

  return new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor: opts.color || BLUE[0], borderRadius:4, barThickness: opts.thick || 22 }]},
    options:{
      indexAxis: horizontal ? 'y':'x',
      responsive: opts.responsive !== false, maintainAspectRatio:false,
      layout:{ padding: horizontal ? {right:38} : {top:22} },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label: c => opts.isPct ? c.raw.toFixed(2)+'%' : c.raw } },
        datalabels:{
          display:true,
          color: ACCENT.ink, font:{weight:'700', size: opts.labelSize || 10},
          anchor:'end', align: horizontal ? 'right' : 'top', offset:2,
          formatter: v => v==null ? '' : (opts.isPct ? v.toFixed(1)+'%' : (Number.isInteger(v) ? v : v.toFixed(1)))
        }
      },
      scales
    }
  });
}

function lineChart(ctx, labels, datasets, opts={}){
  return new Chart(ctx,{
    type:'line',
    data:{ labels, datasets: datasets.map((d,i)=>({
      label:d.label, data:d.data, borderColor: d.color || BLUE[i%BLUE.length],
      backgroundColor:(d.color||BLUE[i%BLUE.length])+'22', tension:.35, fill:!!opts.fill,
      pointRadius:3, borderWidth:2
    }))},
    options:{ responsive: opts.responsive !== false, maintainAspectRatio:false,
      layout:{ padding:{top:22} },
      plugins:{
        legend:{ display: datasets.length>1, position:'top', labels:{boxWidth:10,font:{size:10}} },
        datalabels:{
          display:true, color: ACCENT.ink, font:{weight:'700', size:10},
          anchor:'end', align:'top',
          formatter: v => v==null ? '' : (opts.isPct ? v.toFixed(1)+'%' : v.toFixed(1))
        }
      },
      scales:{ y:{ grid:{color:'#EEF3FA'}, ticks:{ callback:v=> opts.isPct? v+'%':v } }, x:{ grid:{display:false} } }
    }
  });
}

// mode:'share' -> data are raw counts, labels show % of the total (e.g. Condición del estudiante)
// mode:'raw'   -> data are already percentages, labels show the value as-is (e.g. Asistencia por sede)
function donutChart(ctx, labels, data, colors, opts={}){
  const mode = opts.mode || 'share';
  return new Chart(ctx,{
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor: colors || BLUE, borderWidth:2, borderColor:'#fff' }]},
    options:{ responsive: opts.responsive !== false, maintainAspectRatio:false, cutout:'62%',
      plugins:{
        legend:{ position:'bottom', labels:{boxWidth:10,font:{size:10.5}} },
        tooltip:{ callbacks:{ label: c => {
          if(mode==='raw') return `${c.label}: ${(c.raw||0).toFixed(1)}%`;
          const total = c.dataset.data.reduce((a,b)=>a+b,0);
          const pct = total ? (c.raw/total*100) : 0;
          return `${c.label}: ${c.raw} (${pct.toFixed(1)}%)`;
        }}},
        datalabels:{
          display:true, color:'#fff', font:{weight:'700', size:11},
          formatter: (value, ctx2) => {
            if(mode==='raw') return (value||0).toFixed(1)+'%';
            const arr = ctx2.chart.data.datasets[0].data;
            const total = arr.reduce((a,b)=>a+b,0);
            const pct = total ? (value/total*100) : 0;
            return pct.toFixed(1)+'%';
          }
        }
      }
    }
  });
}

function gaugeChart(ctx, value, max, color){
  const pct = Math.max(0, Math.min(1, value/max));
  return new Chart(ctx,{
    type:'doughnut',
    data:{ datasets:[{ data:[pct, 1-pct], backgroundColor:[color||BLUE[0], '#E9F0FA'], borderWidth:0 }]},
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'72%',
      rotation:-90, circumference:180,
      plugins:{ legend:{display:false}, tooltip:{enabled:false}, datalabels:{display:false} }
    }
  });
}

function gaugeCard(id, label, value, max, fmt, color){
  const wrap = el('div',{class:'gauge-wrap'});
  const c = el('canvas',{id, height:'110'});
  wrap.appendChild(c);
  const vEl = el('div',{class:'gval'}, fmt(value));
  const lEl = el('div',{class:'glabel'}, label);
  wrap.appendChild(vEl); wrap.appendChild(lEl);
  requestAnimationFrame(()=>{ charts[id] = gaugeChart(c.getContext('2d'), value||0, max, color); });
  return wrap;
}

// ============ RENDER ROUTER ============
function render(){
  destroyCharts();
  const main = document.getElementById('main');
  main.innerHTML = '';
  updatePeriodTag();
  if(currentPage==='comparativo'){
    renderComparativo(main, applyFiltersExceptPeriodo(ATT));
    return;
  }
  const rows = applyFilters(ATT);
  if(currentPage==='participantes') renderParticipantes(main, rows);
  else if(currentPage==='asistencia') renderAsistencia(main, rows);
  else if(currentPage==='rendimiento') renderRendimiento(main, rows);
  else if(currentPage==='satisfaccion') renderSatisfaccion(main);
}

function kpi(label, value, sub){
  const k = el('div',{class:'kpi'});
  k.appendChild(el('div',{class:'label'}, label));
  k.appendChild(el('div',{class:'value'}, String(value)));
  if(sub) k.appendChild(el('div',{class:'sub'}, sub));
  return k;
}
function card(title){
  const c = el('div',{class:'card'});
  c.appendChild(el('div',{class:'head'}, title));
  c.appendChild(el('div',{class:'body'}));
  return c;
}
function grid(cols, style){
  const g = el('div',{});
  g.setAttribute('style', `display:grid;grid-template-columns:${cols};gap:14px;margin-bottom:14px;${style||''}`);
  return g;
}
function chartCard(title, canvasId, opts={}){
  const c = card(title);
  const wrap = el('div',{class:'chart-wrap'+(opts.tall?' tall':'')});
  wrap.appendChild(el('canvas',{id:canvasId}));
  c.querySelector('.body').appendChild(wrap);
  return c;
}

// Data doesn't include an explicit "Retirado" / "No matriculado" status field (the REGISTRO sheet
// only lists students who ARE enrolled and "Activo en Programa"), so these are shown as 0 with a note
// rather than guessed — they'll populate correctly if a future export adds that column.
function computeRetirados(rows){ return 0; }
function computeNoMatriculados(rows){ return 0; }

// Shown on Participantes/Asistencia/Rendimiento when nothing has been loaded yet (fresh start,
// no sample data). Points the user at the upload panel instead of showing an all-zero dashboard.
function noDataBanner(main){
  main.appendChild(el('div',{class:'empty-state'},
    '📂 Todavía no hay datos cargados. Sube el archivo de asistencia y calificaciones (GIE-DCB-FOR-01) — y, si lo tienes, el de satisfacción (GIE-DCB-FOR-02) — en el panel de arriba para empezar.'));
}

// ============ PAGE: PARTICIPANTES ============
function renderParticipantes(main, rows){
  main.appendChild(el('div',{class:'page-title'},'Participantes en el programa de nivelación'));
  if(ATT.length === 0){ noDataBanner(main); return; }

  const matriculas = rows.length;
  const estudiantesUnicos = new Set(rows.map(r=>r.id)).size;
  const participantesRows = rows.filter(r=>r.condicion==='Participante');
  const estudiantesParticipantes = new Set(participantesRows.map(r=>r.id)).size;
  const estudiantesNoPart = estudiantesUnicos - estudiantesParticipantes;
  const retirados = computeRetirados(rows);
  const noMatriculados = computeNoMatriculados(rows);

  const kpis = el('div',{class:'grid kpi-row'});
  kpis.appendChild(kpi('Nro de estudiantes', estudiantesUnicos));
  kpis.appendChild(kpi('Matriculados', matriculas));
  kpis.appendChild(kpi('Participaron en el programa', estudiantesParticipantes));
  kpis.appendChild(kpi('No participaron en el programa', estudiantesNoPart));
  kpis.appendChild(kpi('Retirados del programa', retirados));
  kpis.appendChild(kpi('No matriculados', noMatriculados));
  main.appendChild(kpis);
  main.appendChild(el('div',{class:'note'}, '* "Retirados del programa" y "No matriculados" requieren un campo de estado que el formato actual no registra; se muestran en 0 hasta que esa columna esté disponible.'));

  const grid1 = grid('1.3fr 1fr');
  grid1.appendChild(chartCard('Participación de estudiantes por curso', 'p_curso'));
  grid1.appendChild(chartCard('Condición del estudiante (%)', 'p_condicion'));
  main.appendChild(grid1);

  const carreraMap = groupBy(participantesRows, 'carrera');
  const topCarreras = topN(carreraMap, 15, v=> new Set(v.map(r=>r.id)).size);
  main.appendChild(chartCard('Participación de estudiantes por carrera (top 15)', 'p_carrera', {tall:true}));

  // table
  const uniqueStudents = [...new Map(rows.map(r=>[r.id, r])).values()]
    .sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||''));
  const tc = card(`Listado de estudiantes (${uniqueStudents.length})`);
  const tscroll = el('div',{class:'table-scroll'});
  const table = el('table');
  table.appendChild(el('thead',{},el('tr',{},
    el('th',{},'ID'), el('th',{},'Apellidos y Nombres'), el('th',{},'Curso'),
    el('th',{},'Carrera'), el('th',{},'Sede'), el('th',{},'Condición')
  )));
  const tbody = el('tbody');
  rows.slice(0,400).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'')).forEach(r=>{
    tbody.appendChild(el('tr',{},
      el('td',{}, String(r.id)), el('td',{}, r.nombre||''), el('td',{}, r.curso||''),
      el('td',{}, r.carrera||''), el('td',{}, r.sede||''),
      el('td',{}, el('span',{class:'badge '+(r.condicion==='Participante'?'ok':'no')}, r.condicion))
    ));
  });
  table.appendChild(tbody);
  tscroll.appendChild(table);
  tc.querySelector('.body').appendChild(tscroll);
  if(rows.length>400) tc.appendChild(el('div',{class:'note'},`Mostrando 400 de ${rows.length} registros. Usa los filtros para acotar.`));
  main.appendChild(tc);

  requestAnimationFrame(()=>{
    const cursoMap = groupBy(rows, 'curso');
    const cursoLabels = [...cursoMap.keys()];
    const cursoVals = cursoLabels.map(k=> new Set(cursoMap.get(k).filter(r=>r.condicion==='Participante').map(r=>r.id)).size);
    charts.p_curso = barChart(document.getElementById('p_curso'), cursoLabels, cursoVals, {color:BLUE[0]});

    charts.p_condicion = donutChart(document.getElementById('p_condicion'),
      ['Participante','No participante'], [estudiantesParticipantes, estudiantesNoPart], [BLUE[1], BLUE[2]], {mode:'share'});

    charts.p_carrera = barChart(document.getElementById('p_carrera'),
      topCarreras.map(t=>t.label), topCarreras.map(t=>t.value), {horizontal:true, thick:14});
  });
}

// ============ PAGE: ASISTENCIA ============
function renderAsistencia(main, rows){
  main.appendChild(el('div',{class:'page-title'},'Asistencia en el programa de nivelación'));
  if(ATT.length === 0){ noDataBanner(main); return; }

  const participantes = rows.filter(r=>r.condicion==='Participante');
  const asistGeneral = avg(participantes.map(r=>r.pctAsist));
  const retirados = computeRetirados(rows);

  const kpis = el('div',{class:'grid kpi-row'});
  kpis.appendChild(kpi('Asistencia general', fmtPct(asistGeneral)));
  kpis.appendChild(kpi('Estudiantes participantes', new Set(participantes.map(r=>r.id)).size));
  kpis.appendChild(kpi('Estudiantes con condición de retirado', retirados));
  main.appendChild(kpis);
  main.appendChild(el('div',{class:'note'}, '* "Estudiantes con condición de retirado" requiere un campo de estado que el formato actual no registra; se muestra en 0 hasta que esa columna esté disponible.'));

  const g1 = grid('1fr 1fr');
  g1.appendChild(chartCard('Asistencia promedio por sede (%)', 'a_sede'));
  g1.appendChild(chartCard('Asistencia promedio por curso (%)', 'a_curso'));
  main.appendChild(g1);

  const g2 = grid('1fr 1fr');
  g2.appendChild(chartCard('Asistencia promedio por sesión — S1 a S7 (%)', 'a_sesion'));
  g2.appendChild(chartCard('Asistencia promedio por sección — top 10 (%)', 'a_seccion'));
  main.appendChild(g2);

  main.appendChild(chartCard('Asistencia promedio por facultad (%)', 'a_facultad'));
  main.appendChild(chartCard('Asistencia promedio por carrera — top 15 (%)', 'a_carrera', {tall:true}));

  // detail table
  const sess = ['s1','s2','s3','s4','s5','s6','s7'];
  const tc = card(`Detalle de asistencia por estudiante (${rows.length})`);
  const tscroll = el('div',{class:'table-scroll'});
  const table = el('table');
  table.appendChild(el('thead',{}, el('tr',{},
    el('th',{},'ID'), el('th',{},'Apellidos y Nombres'), el('th',{},'Carrera'), el('th',{},'Curso a nivelar'),
    el('th',{},'S1'), el('th',{},'S2'), el('th',{},'S3'), el('th',{},'S4'), el('th',{},'S5'), el('th',{},'S6'), el('th',{},'S7'),
    el('th',{},'Asistencia'), el('th',{},'% de asistencia')
  )));
  const tbody = el('tbody');
  rows.slice().sort((a,b)=>(b.pctAsist||0)-(a.pctAsist||0)).slice(0,400).forEach(r=>{
    tbody.appendChild(el('tr',{},
      el('td',{}, String(r.id)), el('td',{}, r.nombre||''), el('td',{}, r.carrera||''), el('td',{}, r.curso||''),
      ...sess.map(s=> el('td',{}, r[s]==null ? '—' : String(r[s]))),
      el('td',{}, String(r.asistencias)), el('td',{}, fmtPct(r.pctAsist))
    ));
  });
  table.appendChild(tbody); tscroll.appendChild(table);
  tc.querySelector('.body').appendChild(tscroll);
  if(rows.length>400) tc.appendChild(el('div',{class:'note'},`Mostrando 400 de ${rows.length} registros. Usa los filtros para acotar.`));
  main.appendChild(tc);

  requestAnimationFrame(()=>{
    const sedeMap = groupBy(participantes, 'sede');
    const sedeLabels = [...sedeMap.keys()];
    charts.a_sede = donutChart(document.getElementById('a_sede'), sedeLabels,
      sedeLabels.map(k=> avg(sedeMap.get(k).map(r=>r.pctAsist))||0), BLUE, {mode:'raw'});

    const cursoMap = groupBy(participantes, 'curso');
    const cursoLabels = [...cursoMap.keys()];
    charts.a_curso = barChart(document.getElementById('a_curso'), cursoLabels,
      cursoLabels.map(k=> avg(cursoMap.get(k).map(r=>r.pctAsist))||0), {isPct:true, max:100});

    const sesionLabels = ['S1','S2','S3','S4','S5','S6','S7'];
    const sesionVals = sess.map(s=>{
      const vals = participantes.map(r=>r[s]).filter(v=>v!=null);
      return vals.length ? (sum(vals)/vals.length*100) : null;
    });
    charts.a_sesion = lineChart(document.getElementById('a_sesion'), sesionLabels,
      [{label:'Asistencia', data: sesionVals}], {isPct:true});

    const seccionMap = groupBy(participantes, 'seccion');
    const topSecciones = topN(seccionMap, 10, v=> avg(v.map(r=>r.pctAsist))||0);
    charts.a_seccion = barChart(document.getElementById('a_seccion'),
      topSecciones.map(t=>t.label), topSecciones.map(t=>t.value), {horizontal:true, isPct:true, max:100, thick:14});

    const facMap = groupBy(participantes, 'facultad');
    const facEntries = topN(facMap, 20, v=> avg(v.map(r=>r.pctAsist))||0);
    charts.a_facultad = barChart(document.getElementById('a_facultad'),
      facEntries.map(t=>t.label), facEntries.map(t=>t.value), {isPct:true, max:100});

    const carMap = groupBy(participantes, 'carrera');
    const carEntries = topN(carMap, 15, v=> avg(v.map(r=>r.pctAsist))||0);
    charts.a_carrera = barChart(document.getElementById('a_carrera'),
      carEntries.map(t=>t.label), carEntries.map(t=>t.value), {horizontal:true, isPct:true, max:100, thick:14});
  });
}

// ============ PAGE: RENDIMIENTO ============
function renderRendimiento(main, rows){
  main.appendChild(el('div',{class:'page-title'},'Rendimiento en el programa de nivelación'));
  if(ATT.length === 0){ noDataBanner(main); return; }

  const participantes = rows.filter(r=>r.condicion==='Participante');
  const ed = avg(participantes.map(r=>r.ed));
  const ec1 = avg(participantes.map(r=>r.ec1));
  const ep = avg(participantes.map(r=>r.ep));
  const avanceObt = sum(participantes.map(r=>r.avanceObt));
  const avanceIdeal = sum(participantes.map(r=>r.avanceIdeal));
  const rendGeneral = avanceIdeal ? (avanceObt/avanceIdeal*7.6) : 0;
  const eficaciaPct = avg(participantes.map(r=>r.eficacia*100));
  const aprobados = participantes.filter(r=> (r.ec1!=null && r.ec1>=11) || (r.ep!=null && r.ep>=11)).length;
  const participantesActivos = new Set(participantes.map(r=>r.id)).size;

  const gaugeRow = el('div',{}); gaugeRow.setAttribute('style','display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:14px;');
  const gcard1 = card('Rendimiento general'); gcard1.querySelector('.body').appendChild(gaugeCard('g_rend','sobre 7.60', rendGeneral, 7.6, v=>v.toFixed(2), BLUE[0]));
  const gcard2 = card('Promedio ED'); gcard2.querySelector('.body').appendChild(gaugeCard('g_ed','sobre 20', ed||0, 20, v=>v.toFixed(2), BLUE[2]));
  const gcard3 = card('Promedio EC1'); gcard3.querySelector('.body').appendChild(gaugeCard('g_ec1','sobre 20', ec1||0, 20, v=>v.toFixed(2), BLUE[1]));
  const gcard4 = card('Promedio EP'); gcard4.querySelector('.body').appendChild(gaugeCard('g_ep','sobre 20', ep||0, 20, v=>v.toFixed(2), BLUE[4]));
  [gcard1,gcard2,gcard3,gcard4].forEach(c=>gaugeRow.appendChild(c));
  main.appendChild(gaugeRow);

  const kpis = el('div',{class:'grid kpi-row'});
  kpis.appendChild(kpi('Participantes activos en el programa de nivelación', participantesActivos));
  kpis.appendChild(kpi('Eficacia promedio', fmtPct(eficaciaPct)));
  kpis.appendChild(kpi('Estudiantes con primeras evaluaciones aprobadas', aprobados));
  kpis.appendChild(kpi('Avance obtenido (total)', fmtNum(avanceObt)));
  kpis.appendChild(kpi('Avance ideal (total)', fmtNum(avanceIdeal)));
  main.appendChild(kpis);

  const g1 = grid('1fr 1fr');
  g1.appendChild(chartCard('Rendimiento (eficacia) promedio por curso (%)', 'r_curso'));
  g1.appendChild(chartCard('Rendimiento (eficacia) promedio por facultad (%)', 'r_facultad'));
  main.appendChild(g1);

  main.appendChild(chartCard('Rendimiento promedio por carrera — top 15 (%)', 'r_carrera', {tall:true}));

  const g2 = grid('1fr 1fr 1fr');
  g2.appendChild(chartCard('Rendimiento en ED por carrera — top 12', 'r_ed_carrera', {tall:true}));
  g2.appendChild(chartCard('Rendimiento en EC1 por carrera — top 12', 'r_ec1_carrera', {tall:true}));
  g2.appendChild(chartCard('Rendimiento en EP por carrera — top 12', 'r_ep_carrera', {tall:true}));
  main.appendChild(g2);

  // detail table
  const tc = card('Detalle de rendimiento por estudiante (ordenado por rendimiento)');
  const tscroll = el('div',{class:'table-scroll'});
  const table = el('table');
  table.appendChild(el('thead',{}, el('tr',{},
    el('th',{},'ID'), el('th',{},'Apellidos y Nombres'), el('th',{},'Carrera'), el('th',{},'Curso a nivelar'),
    el('th',{},'ED'), el('th',{},'EC1'), el('th',{},'EP'),
    el('th',{},'Avance obtenido'), el('th',{},'Avance ideal'), el('th',{},'Rendimiento')
  )));
  const tbody = el('tbody');
  participantes.slice().sort((a,b)=> (b.eficacia||0)-(a.eficacia||0)).slice(0,300).forEach(r=>{
    tbody.appendChild(el('tr',{},
      el('td',{}, String(r.id)), el('td',{}, r.nombre||''), el('td',{}, r.carrera||''), el('td',{}, r.curso||''),
      el('td',{}, fmtNum(r.ed,1)), el('td',{}, fmtNum(r.ec1,1)), el('td',{}, fmtNum(r.ep,1)),
      el('td',{}, fmtNum(r.avanceObt,2)), el('td',{}, fmtNum(r.avanceIdeal,2)),
      el('td',{}, fmtPct((r.eficacia||0)*100))
    ));
  });
  table.appendChild(tbody); tscroll.appendChild(table);
  tc.querySelector('.body').appendChild(tscroll);
  if(participantes.length>300) tc.appendChild(el('div',{class:'note'},`Mostrando 300 de ${participantes.length} registros. Usa los filtros para acotar.`));
  main.appendChild(tc);

  requestAnimationFrame(()=>{
    const cursoMap = groupBy(participantes, 'curso');
    const cursoLabels = [...cursoMap.keys()];
    charts.r_curso = barChart(document.getElementById('r_curso'), cursoLabels,
      cursoLabels.map(k=> (avg(cursoMap.get(k).map(r=>r.eficacia))||0)*100), {isPct:true, max:100});

    const facMap = groupBy(participantes, 'facultad');
    const facEntries = topN(facMap, 20, v=> (avg(v.map(r=>r.eficacia))||0)*100);
    charts.r_facultad = barChart(document.getElementById('r_facultad'),
      facEntries.map(t=>t.label), facEntries.map(t=>t.value), {isPct:true, max:100});

    const carMap = groupBy(participantes, 'carrera');
    const carEntries = topN(carMap, 15, v=> (avg(v.map(r=>r.eficacia))||0)*100);
    charts.r_carrera = barChart(document.getElementById('r_carrera'),
      carEntries.map(t=>t.label), carEntries.map(t=>t.value), {horizontal:true, isPct:true, max:100, thick:14});

    const edEntries = topN(carMap, 12, v=> avg(v.map(r=>r.ed))||0);
    charts.r_ed_carrera = barChart(document.getElementById('r_ed_carrera'),
      edEntries.map(t=>t.label), edEntries.map(t=>t.value), {horizontal:true, max:20, thick:12, labelSize:9});

    const ec1Entries = topN(carMap, 12, v=> avg(v.map(r=>r.ec1))||0);
    charts.r_ec1_carrera = barChart(document.getElementById('r_ec1_carrera'),
      ec1Entries.map(t=>t.label), ec1Entries.map(t=>t.value), {horizontal:true, max:20, thick:12, labelSize:9});

    const epEntries = topN(carMap, 12, v=> avg(v.map(r=>r.ep))||0);
    charts.r_ep_carrera = barChart(document.getElementById('r_ep_carrera'),
      epEntries.map(t=>t.label), epEntries.map(t=>t.value), {horizontal:true, max:20, thick:12, labelSize:9});
  });
}

// ============ PAGE: SATISFACCIÓN ============
const PREGUNTAS = {
  p1:'¿El docente desarrolla los temas y actividades propuestas?',
  p2:'¿El docente explica claramente el resultado de aprendizaje y las competencias en cada clase?',
  p3:'¿El docente es puntual y cumple con el horario establecido?',
  p4:'¿El docente cuenta con un ambiente de clase apropiado (sonido, lugar, conexión wifi, iluminación)?',
  p5:'¿El docente domina el tema que enseña?',
  p6:'¿El docente gestiona adecuadamente el tiempo de su clase?',
  p7:'¿El docente utiliza ejemplos, casos y/o actividades que refuerzan la competencia de la asignatura?',
  p8:'¿El docente utiliza recursos tecnológicos que facilitan la comprensión de los contenidos?',
  p9:'¿El docente realiza actividades prácticas que refuerzan lo aprendido en clase?',
  p10:'¿El docente responde consultas, preguntas y/o comentarios de manera respetuosa y oportuna?',
  p11:'¿El docente promueve la participación e interés por aprender?',
  p12:'¿El docente retroalimenta oportunamente los resultados de los ejercicios propuestos?',
  p13:'¿El aula virtual del curso presenta materiales educativos que ayudan a la comprensión?',
  p14:'¿El curso contribuye a comprender mejor los temas desarrollados en los cursos regulares?'
};

function renderSatisfaccion(main){
  main.appendChild(el('div',{class:'page-title'},'Satisfacción en el programa de nivelación'));

  let rows = SAT.filter(r=> !state.carrera || r.carrera===state.carrera)
                .filter(r=> !state.sede || r.sede===state.sede)
                .filter(r=> !state.curso || r.curso===state.curso)
                .filter(r=> !state.periodo || r.periodo===state.periodo);

  if(rows.length===0){
    main.appendChild(el('div',{class:'empty-state'}, 'No hay encuestas de satisfacción para los filtros seleccionados.'));
    return;
  }

  const qkeys = Object.keys(PREGUNTAS);
  function avgQ(k, subset){ return avg(subset.map(r=>r[k])); }
  const overall = avg(qkeys.flatMap(k=> rows.map(r=>r[k])));
  const overallPct = overall!=null ? overall*10 : null; // scale 0-10 to %

  const kpis = el('div',{class:'grid kpi-row'});
  kpis.appendChild(kpi('Encuestas ejecutadas', rows.length));
  kpis.appendChild(kpi('Satisfacción general', fmtPct(overallPct)));
  main.appendChild(kpis);

  const gc = card('Nivel de satisfacción por pregunta');
  const gBody = el('div',{});
  gBody.setAttribute('style','display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;');
  qkeys.forEach(k=>{
    const v = avgQ(k, rows);
    const pct = v!=null ? v*10 : 0;
    const mini = el('div',{});
    mini.setAttribute('style','text-align:center;padding:6px 4px;');
    mini.appendChild(gaugeCard('sat_'+k, k.toUpperCase(), pct, 100, x=>fmtPct(x,1), BLUE[0]));
    gBody.appendChild(mini);
  });
  gc.querySelector('.body').appendChild(gBody);
  main.appendChild(el('div',{style:'margin-bottom:14px;'}, gc));

  const g1 = grid('1fr 1fr');
  g1.appendChild(chartCard('Encuestas ejecutadas por curso', 's_curso_n'));
  g1.appendChild(chartCard('Nivel de satisfacción por curso (%)', 's_curso_pct'));
  main.appendChild(g1);

  const g2 = grid('1fr 1fr');
  g2.appendChild(chartCard('Encuestas ejecutadas por carrera — top 15', 's_carrera_n', {tall:true}));
  g2.appendChild(chartCard('Nivel de satisfacción por carrera — top 15 (%)', 's_carrera_pct', {tall:true}));
  main.appendChild(g2);

  const qc = card('Preguntas de la encuesta de satisfacción');
  const qbody = qc.querySelector('.body');
  const qlist = el('div',{});
  qlist.setAttribute('style','font-size:11.5px;line-height:1.8;color:#5B7089;column-count:2;column-gap:20px;');
  qkeys.forEach(k=>{ qlist.appendChild(el('div',{}, `${k.toUpperCase()}: ${PREGUNTAS[k]}`)); });
  qbody.appendChild(qlist);
  main.appendChild(qc);

  requestAnimationFrame(()=>{
    const cursoMap = groupBy(rows, 'curso');
    const cursoLabels = [...cursoMap.keys()];
    charts.s_curso_n = barChart(document.getElementById('s_curso_n'), cursoLabels,
      cursoLabels.map(k=> cursoMap.get(k).length), {color:BLUE[1]});
    charts.s_curso_pct = barChart(document.getElementById('s_curso_pct'), cursoLabels,
      cursoLabels.map(k=>{
        const subset = cursoMap.get(k);
        const v = avg(qkeys.flatMap(qk=> subset.map(r=>r[qk])));
        return v!=null? v*10 : 0;
      }), {isPct:true, max:100});

    const carMap = groupBy(rows, 'carrera');
    const carEntriesN = topN(carMap, 15, v=> v.length);
    charts.s_carrera_n = barChart(document.getElementById('s_carrera_n'),
      carEntriesN.map(t=>t.label), carEntriesN.map(t=>t.value), {horizontal:true, thick:14, color:BLUE[1]});

    const carEntriesPct = topN(carMap, 15, v=>{
      const val = avg(qkeys.flatMap(qk=> v.map(r=>r[qk])));
      return val!=null ? val*10 : 0;
    });
    charts.s_carrera_pct = barChart(document.getElementById('s_carrera_pct'),
      carEntriesPct.map(t=>t.label), carEntriesPct.map(t=>t.value), {horizontal:true, isPct:true, max:100, thick:14});
  });
}

// ============ PAGE: COMPARATIVO (histórico por periodo) ============
function renderComparativo(main, rows){
  main.appendChild(el('div',{class:'page-title'},'Comparativo por periodo del programa de nivelación'));

  if(state.periodo){
    main.appendChild(el('div',{class:'note'},
      `ℹ️ Esta pestaña siempre muestra todos los periodos cargados, independientemente del filtro "Periodo académico" (actualmente en "${state.periodo}"). Los demás filtros (Facultad, Carrera, Sede, Curso) sí se aplican.`));
  }

  const periods = [...new Set(rows.map(r=>r.periodo).filter(Boolean))].sort();

  if(periods.length < 2){
    main.appendChild(el('div',{class:'empty-state'},
      periods.length === 0
        ? '📂 Todavía no hay datos cargados. Sube el archivo GIE-DCB-FOR-01 (y GIE-DCB-FOR-02) en el panel de arriba para empezar.'
        : 'Solo hay datos de un periodo cargado. Sube archivos GIE-DCB-FOR-01 / GIE-DCB-FOR-02 de otros semestres en el panel superior — se acumulan automáticamente y esta pestaña se activa con 2 o más periodos.'));
    return;
  }

  const kpis = el('div',{class:'grid kpi-row'});
  kpis.appendChild(kpi('Periodos cargados', periods.length));
  kpis.appendChild(kpi('Rango', `${periods[0]} — ${periods[periods.length-1]}`));
  main.appendChild(kpis);

  main.appendChild(chartCard('Participantes por semestre', 'cp_participantes'));
  main.appendChild(chartCard('Asistencia promedio por semestre (%)', 'cp_asistencia'));

  const g1 = grid('1fr 1fr');
  g1.appendChild(chartCard('Participación en los cursos por semestre', 'cp_curso_part'));
  g1.appendChild(chartCard('Asistencia en los cursos por semestre (%)', 'cp_curso_asist'));
  main.appendChild(g1);

  main.appendChild(chartCard('Rendimiento de evaluaciones por semestre (ED / EC1 / EP)', 'cp_rendimiento'));
  main.appendChild(chartCard('Avance obtenido vs. avance ideal por semestre (%)', 'cp_avance'));

  // Satisfaction uses its own filter pool (same fields as the Satisfacción tab)
  const satRows = SAT.filter(r=> !state.carrera || r.carrera===state.carrera)
                      .filter(r=> !state.sede || r.sede===state.sede)
                      .filter(r=> !state.curso || r.curso===state.curso);
  const satPeriods = [...new Set(satRows.map(r=>r.periodo).filter(Boolean))].sort();

  const g2 = grid('1fr 1fr');
  g2.appendChild(chartCard('Encuestas ejecutadas por semestre', 'cp_encuestas'));
  g2.appendChild(chartCard('Satisfacción por semestre (%)', 'cp_satisfaccion'));
  main.appendChild(g2);

  if(satPeriods.length){
    main.appendChild(chartCard('Satisfacción en los cursos por semestre (%)', 'cp_curso_sat'));
  }

  requestAnimationFrame(()=>{
    const partVals = periods.map(p =>
      new Set(rows.filter(r=>r.periodo===p && r.condicion==='Participante').map(r=>r.id)).size);
    charts.cp_participantes = lineChart(document.getElementById('cp_participantes'), periods,
      [{label:'Participantes', data: partVals}]);

    const asistVals = periods.map(p => {
      const subset = rows.filter(r=>r.periodo===p && r.condicion==='Participante');
      return avg(subset.map(r=>r.pctAsist));
    });
    charts.cp_asistencia = lineChart(document.getElementById('cp_asistencia'), periods,
      [{label:'Asistencia', data: asistVals}], {isPct:true});

    const cursos = [...new Set(rows.map(r=>r.curso).filter(Boolean))];
    const cpCursoPart = cursos.map((c,i)=>({
      label:c, color: BLUE[i%BLUE.length],
      data: periods.map(p => new Set(rows.filter(r=>r.periodo===p && r.curso===c && r.condicion==='Participante').map(r=>r.id)).size)
    }));
    charts.cp_curso_part = lineChart(document.getElementById('cp_curso_part'), periods, cpCursoPart);

    const cpCursoAsist = cursos.map((c,i)=>({
      label:c, color: BLUE[i%BLUE.length],
      data: periods.map(p => {
        const subset = rows.filter(r=>r.periodo===p && r.curso===c && r.condicion==='Participante');
        return avg(subset.map(r=>r.pctAsist));
      })
    }));
    charts.cp_curso_asist = lineChart(document.getElementById('cp_curso_asist'), periods, cpCursoAsist, {isPct:true});

    const rendDatasets = [
      {label:'ED', color:BLUE[2], data: periods.map(p=> avg(rows.filter(r=>r.periodo===p && r.condicion==='Participante').map(r=>r.ed)))},
      {label:'EC1', color:BLUE[1], data: periods.map(p=> avg(rows.filter(r=>r.periodo===p && r.condicion==='Participante').map(r=>r.ec1)))},
      {label:'EP', color:BLUE[4], data: periods.map(p=> avg(rows.filter(r=>r.periodo===p && r.condicion==='Participante').map(r=>r.ep)))}
    ];
    charts.cp_rendimiento = lineChart(document.getElementById('cp_rendimiento'), periods, rendDatasets);

    const avanceVals = periods.map(p => {
      const subset = rows.filter(r=>r.periodo===p && r.condicion==='Participante');
      const obt = sum(subset.map(r=>r.avanceObt));
      const ideal = sum(subset.map(r=>r.avanceIdeal));
      return ideal ? (obt/ideal*100) : null;
    });
    charts.cp_avance = lineChart(document.getElementById('cp_avance'), periods,
      [{label:'Avance', data: avanceVals}], {isPct:true});

    const encVals = satPeriods.map(p => satRows.filter(r=>r.periodo===p).length);
    charts.cp_encuestas = barChart(document.getElementById('cp_encuestas'), satPeriods, encVals, {color:BLUE[1]});

    const qkeys = Object.keys(PREGUNTAS);
    const satVals = satPeriods.map(p => {
      const subset = satRows.filter(r=>r.periodo===p);
      const v = avg(qkeys.flatMap(qk=> subset.map(r=>r[qk])));
      return v!=null ? v*10 : null;
    });
    charts.cp_satisfaccion = lineChart(document.getElementById('cp_satisfaccion'), satPeriods,
      [{label:'Satisfacción', data: satVals}], {isPct:true});

    if(satPeriods.length){
      const satCursos = [...new Set(satRows.map(r=>r.curso).filter(Boolean))];
      const cpCursoSat = satCursos.map((c,i)=>({
        label:c, color: BLUE[i%BLUE.length],
        data: satPeriods.map(p => {
          const subset = satRows.filter(r=>r.periodo===p && r.curso===c);
          const v = avg(qkeys.flatMap(qk=> subset.map(r=>r[qk])));
          return v!=null ? v*10 : null;
        })
      }));
      charts.cp_curso_sat = lineChart(document.getElementById('cp_curso_sat'), satPeriods, cpCursoSat, {isPct:true});
    }
  });
}

// ============ EXCEL UPLOAD & PARSING ============
// Mirrors the same logic used to build the data bundled with this dashboard (see project notebook),
// so uploading a fresh export of GIE-DCB-FOR-01 / GIE-DCB-FOR-02 keeps the exact same field names.

function normHeader(v){
  if(v==null) return '';
  return String(v).replace(/\r?\n/g,' ').replace(/\s+/g,' ').trim();
}

function cleanNum(x){
  if(x==null || x==='') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
  return (n==null || isNaN(n) || !isFinite(n)) ? null : n;
}

function renameCurso(v){
  const s = normHeader(v).toUpperCase();
  if(s === 'NIVELACIÓN LENGUA Y COM.' || s === 'NIVELACION LENGUA Y COM.') return 'COMUNICACIÓN - NIVELACIÓN';
  if(s === 'NIVELACIÓN MATEMÁTICA' || s === 'NIVELACION MATEMATICA') return 'MATEMATICA - NIVELACIÓN';
  return normHeader(v) || null;
}

// Finds the row index (0-based) of the header row in a raw matrix, i.e. the first row
// that contains ALL of the given normalized header labels.
function findHeaderRow(matrix, requiredHeaders){
  for(let i=0;i<matrix.length;i++){
    const row = matrix[i] || [];
    const norm = row.map(normHeader);
    if(requiredHeaders.every(req => norm.includes(req))) return i;
  }
  return -1;
}

// Builds {fieldName: columnIndex} by matching each field's accepted header variants
// against the normalized header row. Returns null for any field not found.
function mapColumns(headerRow, fieldDefs){
  const norm = headerRow.map(normHeader);
  const out = {};
  Object.entries(fieldDefs).forEach(([field, variants])=>{
    let idx = -1;
    for(const v of variants){
      idx = norm.findIndex(c => c.toUpperCase() === v.toUpperCase());
      if(idx !== -1) break;
    }
    out[field] = idx;
  });
  return out;
}

function sheetToMatrix(workbook, preferredNames){
  let sheetName = workbook.SheetNames.find(n => preferredNames.some(p => n.toUpperCase() === p.toUpperCase()));
  if(!sheetName) sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

const ATT_FIELD_DEFS = {
  id: ['ID'], nombre: ['Apellidos y Nombres'], carrera: ['Carrera'], facultad: ['Facultad'],
  sede: ['Sede'], seccion: ['Sección'], curso: ['Curso a nivelar'], periodo: ['Periodo académico'],
  s1:['S1'], s2:['S2'], s3:['S3'], s4:['S4'], s5:['S5'], s6:['S6'], s7:['S7'],
  asistencias: ['Asistencias'], pctAsist: ['% de asistencia'],
  ed: ['ED'], ec1: ['EC1'], ep: ['EP'],
  avanceObt: ['Avance obtenido'], avanceIdeal: ['Avance ideal'],
  eficacia: ['Eficacia (%)', 'Eficacia(%)', 'Eficacia %'],
  aprobado: ['Aprobado']
};
const ATT_REQUIRED = ['ID', 'Apellidos y Nombres', 'Carrera', 'Curso a nivelar', 'Asistencias'];

function parseAttendanceWorkbook(workbook){
  const matrix = sheetToMatrix(workbook, ['REGISTRO']);
  const headerIdx = findHeaderRow(matrix, ATT_REQUIRED);
  if(headerIdx === -1){
    throw new Error('No se encontró la fila de encabezados esperada (ID, Apellidos y Nombres, Carrera, Curso a nivelar, Asistencias). Verifica que sea el formato GIE-DCB-FOR-01.');
  }
  const cols = mapColumns(matrix[headerIdx], ATT_FIELD_DEFS);
  if(cols.id === -1) throw new Error('No se encontró la columna "ID".');

  const records = [];
  for(let i = headerIdx + 1; i < matrix.length; i++){
    const row = matrix[i];
    if(!row) continue;
    const idVal = cols.id !== -1 ? row[cols.id] : null;
    if(idVal == null || idVal === '') continue;
    const get = (f) => cols[f] !== -1 && cols[f] != null ? row[cols[f]] : null;

    const asistencias = Math.round(cleanNum(get('asistencias')) ?? 0);
    records.push({
      id: parseInt(idVal, 10),
      nombre: normHeader(get('nombre')) || null,
      carrera: normHeader(get('carrera')) || null,
      facultad: normHeader(get('facultad')) || null,
      sede: normHeader(get('sede')) || null,
      seccion: normHeader(get('seccion')) || null,
      curso: renameCurso(get('curso')),
      periodo: normHeader(get('periodo')) || null,
      s1: cleanNum(get('s1')), s2: cleanNum(get('s2')), s3: cleanNum(get('s3')), s4: cleanNum(get('s4')),
      s5: cleanNum(get('s5')), s6: cleanNum(get('s6')), s7: cleanNum(get('s7')),
      asistencias,
      pctAsist: (() => { const v = cleanNum(get('pctAsist')); return v==null ? null : Math.round(v*10000)/100; })(),
      ed: cleanNum(get('ed')), ec1: cleanNum(get('ec1')), ep: cleanNum(get('ep')),
      avanceObt: cleanNum(get('avanceObt')), avanceIdeal: cleanNum(get('avanceIdeal')),
      eficacia: cleanNum(get('eficacia')),
      aprobado: normHeader(get('aprobado')) || null,
      condicion: asistencias > 0 ? 'Participante' : 'No participante'
    });
  }
  return records;
}

const SAT_FIELD_DEFS = {
  carrera: ['Carrera'], ciclo: ['Ciclo'], periodo: ['Semestre'], sede: ['Sede'], curso: ['Curso'],
  p1:['P1'],p2:['P2'],p3:['P3'],p4:['P4'],p5:['P5'],p6:['P6'],p7:['P7'],p8:['P8'],
  p9:['P9'],p10:['P10'],p11:['P11'],p12:['P12'],p13:['P13'],p14:['P14']
};
const SAT_REQUIRED = ['Carrera', 'Semestre', 'Sede', 'Curso', 'P1'];

function parseSatisfactionWorkbook(workbook){
  const matrix = sheetToMatrix(workbook, ['REGISTRO']);
  const headerIdx = findHeaderRow(matrix, SAT_REQUIRED);
  if(headerIdx === -1){
    throw new Error('No se encontró la fila de encabezados esperada (Carrera, Semestre, Sede, Curso, P1…). Verifica que sea el formato GIE-DCB-FOR-02.');
  }
  const cols = mapColumns(matrix[headerIdx], SAT_FIELD_DEFS);

  const records = [];
  for(let i = headerIdx + 1; i < matrix.length; i++){
    const row = matrix[i];
    if(!row) continue;
    const carreraVal = cols.carrera !== -1 ? row[cols.carrera] : null;
    const cursoVal = cols.curso !== -1 ? row[cols.curso] : null;
    // Skip blank rows AND summary/total rows (e.g. "Nivel de satisfacción total") that only fill
    // the Carrera cell but have no actual Curso value — those aren't individual survey responses.
    if(carreraVal == null || carreraVal === '' || cursoVal == null || cursoVal === '') continue;
    const get = (f) => cols[f] !== -1 && cols[f] != null ? row[cols[f]] : null;

    const rec = {
      carrera: normHeader(get('carrera')) || null,
      ciclo: get('ciclo') ?? null,
      periodo: normHeader(get('periodo')) || null,
      sede: normHeader(get('sede')) || null,
      curso: renameCurso(get('curso'))
    };
    for(let q=1;q<=14;q++) rec['p'+q] = cleanNum(get('p'+q));
    records.push(rec);
  }
  return records;
}

// ---- Wiring the file inputs ----
function setFileStatus(id, msg, cls){
  const elx = document.getElementById(id);
  if(!elx) return;
  elx.textContent = msg;
  elx.className = 'dp-file-status' + (cls ? ' ' + cls : '');
}

function latestPeriod(){
  const periods = [...new Set([...ATT.map(r=>r.periodo), ...SAT.map(r=>r.periodo)].filter(Boolean))].sort();
  return periods.length ? periods[periods.length-1] : '';
}

function updatePeriodTag(){
  const tag = document.getElementById('periodoTag');
  if(!tag) return;
  const allPeriods = [...new Set([...ATT.map(r=>r.periodo), ...SAT.map(r=>r.periodo)].filter(Boolean))].sort();
  if(state.periodo){
    tag.textContent = `Mostrando: ${state.periodo}` + (allPeriods.length>1 ? ` (de ${allPeriods.length} periodos cargados)` : '');
  } else {
    tag.textContent = allPeriods.length ? `Mostrando: todos los periodos (${allPeriods.join(', ')})` : '';
  }
}

// ============ AUTOSAVE (IndexedDB) ============
// A static HTML file can't silently write to a real Excel file on disk (browsers block that for
// security), so instead we autosave the accumulated ATT/SAT dataset into this browser's local
// IndexedDB storage. Reopening THIS SAME HTML file in THIS SAME browser restores it automatically.
// Note: this storage is tied to the browser + exact file path, not portable — use "Descargar base
// de datos (.xlsx)" for a real, shareable/backup-able Excel copy.
const IDB_NAME = 'nivelacion_dashboard';
const IDB_STORE = 'snapshots';
const IDB_KEY = 'current';
let autosaveEnabled = (typeof indexedDB !== 'undefined');

function idbOpen(){
  return new Promise((resolve, reject)=>{
    if(!autosaveEnabled) { reject(new Error('IndexedDB no disponible')); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbPut(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}
async function idbGetKey(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbDeleteKey(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = ()=> resolve();
    tx.onerror = ()=> reject(tx.error);
  });
}

function setAutosaveStatus(msg, cls){
  const elx = document.getElementById('autosaveStatus');
  if(!elx) return;
  elx.textContent = msg;
  elx.className = 'dp-file-status' + (cls ? ' ' + cls : '');
}

async function saveSnapshot(){
  if(!autosaveEnabled) return;
  try{
    await idbPut(IDB_KEY, { att: ATT, sat: SAT, savedAt: new Date().toISOString() });
    const when = new Date().toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit' });
    setAutosaveStatus(`💾 Guardado automáticamente en este navegador — ${when}`, 'ok');
  }catch(err){
    console.error('Autosave failed:', err);
    setAutosaveStatus('⚠️ No se pudo autoguardar en este navegador.', 'err');
  }
}

async function loadSnapshot(){
  if(!autosaveEnabled) return null;
  try{ return await idbGetKey(IDB_KEY); }
  catch(err){ console.error('Autoload failed:', err); return null; }
}

async function clearSnapshot(){
  if(!autosaveEnabled) return;
  try{ await idbDeleteKey(IDB_KEY); }catch(err){ console.error('Clear snapshot failed:', err); }
}

// Merges an uploaded batch of records into the accumulated dataset by "periodo": any period
// present in `incoming` fully replaces that period's existing records (so re-uploading the same
// semester doesn't duplicate it), while records from OTHER periods are kept — this is what lets
// the "Comparativo" tab build a multi-semester history as the user uploads one file per semester.
function mergeByPeriodo(existing, incoming){
  const incomingPeriods = new Set(incoming.map(r=>r.periodo).filter(Boolean));
  const kept = existing.filter(r => !incomingPeriods.has(r.periodo));
  return kept.concat(incoming);
}

function afterDataChange(){
  state.facultad = ''; state.carrera = ''; state.sede = ''; state.curso = '';
  // Default to the most recently loaded period, so it's always clear which cycle is on screen —
  // the user can still switch to "Todos los periodos" via the filter, or use the Comparativo tab.
  state.periodo = latestPeriod();
  rebuildFilters();
  render();
  saveSnapshot();
}

function handleFile(inputEl, statusId, parseFn, onSuccess, summaryFn){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  setFileStatus(statusId, `Leyendo "${file.name}"…`, '');
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const records = parseFn(workbook);
      if(!records.length) throw new Error('El archivo no contiene registros con datos.');
      onSuccess(records, file.name);
      const msg = summaryFn ? summaryFn(records, file.name) : `✓ ${records.length} registros cargados de "${file.name}"`;
      setFileStatus(statusId, msg, 'ok');
    }catch(err){
      console.error(err);
      setFileStatus(statusId, `✗ ${err.message}`, 'err');
    }
  };
  reader.onerror = ()=> setFileStatus(statusId, '✗ Error al leer el archivo.', 'err');
  reader.readAsArrayBuffer(file);
}

function setupDataPanel(){
  const fileAtt = document.getElementById('fileAtt');
  const fileSat = document.getElementById('fileSat');
  const btnRestore = document.getElementById('btnRestore');

  fileAtt.addEventListener('change', ()=>{
    handleFile(fileAtt, 'attStatus', parseAttendanceWorkbook,
      (records, name)=>{
        ATT = mergeByPeriodo(ATT, records);
        attSourceName = name;
        afterDataChange();
      },
      (records, name)=>{
        const periods = [...new Set(ATT.map(r=>r.periodo).filter(Boolean))];
        return `✓ ${records.length} registros de "${name}" — total acumulado: ${ATT.length} registros en ${periods.length} periodo(s)`;
      });
  });
  fileSat.addEventListener('change', ()=>{
    handleFile(fileSat, 'satStatus', parseSatisfactionWorkbook,
      (records, name)=>{
        SAT = mergeByPeriodo(SAT, records);
        satSourceName = name;
        afterDataChange();
      },
      (records, name)=>{
        const periods = [...new Set(SAT.map(r=>r.periodo).filter(Boolean))];
        return `✓ ${records.length} registros de "${name}" — total acumulado: ${SAT.length} registros en ${periods.length} periodo(s)`;
      });
  });
  btnRestore.addEventListener('click', ()=>{
    ATT = JSON.parse(JSON.stringify(ORIGINAL_ATT));
    SAT = JSON.parse(JSON.stringify(ORIGINAL_SAT));
    attSourceName = null; satSourceName = null;
    fileAtt.value = ''; fileSat.value = '';
    setFileStatus('attStatus', `${ATT.length} registros (datos originales)`, '');
    setFileStatus('satStatus', `${SAT.length} registros (datos originales)`, '');
    clearSnapshot();
    setAutosaveStatus('Autoguardado borrado — se volvió a los datos originales.', '');
    afterDataChange();
  });

  const attLabel = loadedFromSnapshot ? `${ATT.length} registros (restaurados del autoguardado)` : `${ATT.length} registros (datos originales)`;
  const satLabel = loadedFromSnapshot ? `${SAT.length} registros (restaurados del autoguardado)` : `${SAT.length} registros (datos originales)`;
  setFileStatus('attStatus', attLabel, loadedFromSnapshot ? 'ok' : '');
  setFileStatus('satStatus', satLabel, loadedFromSnapshot ? 'ok' : '');
}

// ============ EXPORT REPORT ============
// Rebuilds the same "Informe del Programa de Nivelación" memo structure seen in the original
// report (header block, Conclusiones with Matriculados/Participación/%Asistencia/Rendimiento/
// Satisfacción tables, Recomendaciones, Acciones, firma) using whatever period + filters are
// currently active, and opens it in a new tab ready to print/save as PDF.

function aprobadoFlag(r){ return (r.ec1!=null && r.ec1>=11) || (r.ep!=null && r.ep>=11); }

// Renders a chart on a temporary, off-screen canvas using the SAME barChart/donutChart/lineChart
// helpers the live dashboard uses (so styling matches). Chart.js schedules its actual pixel
// painting through a shared requestAnimationFrame loop even with animation disabled, so capturing
// synchronously right after construction yields a blank canvas — this waits a couple of frames
// (batching every requested chart into the same wait) before reading each one back as a PNG.
function buildReportChartImages(d){
  return new Promise((resolve) => {
    const specs = [];
    const add = (key, width, height, buildFn) => specs.push({key, width, height, buildFn});

    const estudiantesNoPart = d.estudiantesUnicos - d.estudiantesParticipantes;
    if(d.estudiantesUnicos > 0){
      add('condicion', 420, 320, ctx =>
        donutChart(ctx, ['Participante','No participante'], [d.estudiantesParticipantes, estudiantesNoPart], [BLUE[1], BLUE[2]], {mode:'share', responsive:false}));
    }
    if(d.cursos.length){
      add('participacionCurso', 640, 300, ctx =>
        barChart(ctx, d.cursos, d.cursos.map(c => d.participacionMx.table[c].Total), {color: BLUE[0], responsive:false}));
    }
    if(d.asistenciaByCurso.length){
      add('asistenciaCurso', 640, 300, ctx =>
        barChart(ctx, d.asistenciaByCurso.map(a=>a.curso), d.asistenciaByCurso.map(a=>a.avg||0), {isPct:true, max:100, responsive:false}));
    }
    if(d.sesionAvg && d.sesionAvg.some(v=>v!=null)){
      add('asistenciaSesion', 640, 280, ctx =>
        lineChart(ctx, ['S1','S2','S3','S4','S5','S6','S7'], [{label:'Asistencia', data:d.sesionAvg}], {isPct:true, responsive:false}));
    }
    if(d.eficaciaByCurso && d.eficaciaByCurso.length){
      add('rendimientoCurso', 640, 300, ctx =>
        barChart(ctx, d.eficaciaByCurso.map(e=>e.curso), d.eficaciaByCurso.map(e=>e.avg||0), {isPct:true, max:100, responsive:false}));
    }
    if(d.encuestasTotal > 0 && d.cursos.length){
      add('satisfaccionCurso', 640, 300, ctx =>
        barChart(ctx, d.cursos, d.cursos.map(c => d.satMx[c].Total==null ? 0 : d.satMx[c].Total), {isPct:true, max:100, responsive:false}));
    }

    if(specs.length === 0){ resolve({}); return; }

    const built = specs.map(spec => {
      const canvas = document.createElement('canvas');
      canvas.width = spec.width; canvas.height = spec.height;
      canvas.style.position = 'fixed';
      canvas.style.left = '-9999px';
      canvas.style.top = '0';
      canvas.style.width = spec.width + 'px';
      canvas.style.height = spec.height + 'px';
      document.body.appendChild(canvas);
      let chart = null;
      try{ chart = spec.buildFn(canvas.getContext('2d')); }
      catch(err){ console.error('No se pudo construir el gráfico "'+spec.key+'":', err); }
      return { key: spec.key, canvas, chart };
    });

    // Two frames: one for Chart.js's internal layout pass, one for the actual paint.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const images = {};
      built.forEach(b => {
        if(b.chart){
          try{ images[b.key] = b.chart.toBase64Image('image/png', 1); }
          catch(err){ console.error('No se pudo capturar el gráfico "'+b.key+'":', err); }
          b.chart.destroy();
        }
        b.canvas.remove();
      });
      resolve(images);
    }));
  });
}

function computeReportData(periodo){
  const scoped = ATT.filter(r =>
    r.periodo === periodo &&
    (!state.facultad || r.facultad === state.facultad) &&
    (!state.carrera || r.carrera === state.carrera) &&
    (!state.sede || r.sede === state.sede) &&
    (!state.curso || r.curso === state.curso)
  );
  const satScoped = SAT.filter(r =>
    r.periodo === periodo &&
    (!state.carrera || r.carrera === state.carrera) &&
    (!state.sede || r.sede === state.sede) &&
    (!state.curso || r.curso === state.curso)
  );

  const cursos = [...new Set(scoped.map(r=>r.curso).filter(Boolean))].sort();
  const sedes = [...new Set(scoped.map(r=>r.sede).filter(Boolean))].sort();
  const participantesRows = scoped.filter(r=>r.condicion==='Participante');

  const estudiantesUnicos = new Set(scoped.map(r=>r.id)).size;
  const estudiantesParticipantes = new Set(participantesRows.map(r=>r.id)).size;
  const pctParticipacion = estudiantesUnicos ? (estudiantesParticipantes/estudiantesUnicos*100) : 0;

  // Matriculados / Participación matrices: rows = curso, cols = sede (+ Total)
  function matrix(rowsSubset, uniqueBy){
    const val = (subset) => uniqueBy ? new Set(subset.map(r=>r[uniqueBy])).size : subset.length;
    const table = {};
    cursos.forEach(c=>{
      table[c] = {};
      sedes.forEach(s=>{ table[c][s] = val(rowsSubset.filter(r=>r.curso===c && r.sede===s)); });
      table[c].Total = val(rowsSubset.filter(r=>r.curso===c));
    });
    const totalRow = {};
    sedes.forEach(s=>{ totalRow[s] = val(rowsSubset.filter(r=>r.sede===s)); });
    totalRow.Total = val(rowsSubset);
    return { table, totalRow };
  }
  const matriculadosMx = matrix(scoped, null);
  const participacionMx = matrix(participantesRows, 'id');

  // % Asistencia by curso
  const asistenciaByCurso = cursos.map(c=>{
    const subset = participantesRows.filter(r=>r.curso===c);
    return { curso: c, avg: avg(subset.map(r=>r.pctAsist)) };
  });
  const asistenciaGeneral = avg(participantesRows.map(r=>r.pctAsist));

  // Rendimiento (Aprobó/Desaprobó) matrix
  const rendMx = {};
  cursos.forEach(c=>{
    rendMx[c] = {};
    sedes.forEach(s=>{
      const subset = participantesRows.filter(r=>r.curso===c && r.sede===s);
      const aprobo = subset.filter(aprobadoFlag).length;
      rendMx[c][s] = { aprobo, desaprobo: subset.length - aprobo };
    });
    const subsetC = participantesRows.filter(r=>r.curso===c);
    const aproboC = subsetC.filter(aprobadoFlag).length;
    rendMx[c].Total = { aprobo: aproboC, desaprobo: subsetC.length - aproboC };
  });
  const totalAprobados = participantesRows.filter(aprobadoFlag).length;
  const totalDesaprobados = participantesRows.length - totalAprobados;

  // Satisfacción matrix (from SAT data, may be sparse -> null shown as "SD")
  const qkeys = Object.keys(PREGUNTAS);
  function satPct(subset){ const v = avg(qkeys.flatMap(qk=> subset.map(r=>r[qk]))); return v!=null ? v*10 : null; }
  const satMx = {};
  cursos.forEach(c=>{
    satMx[c] = {};
    sedes.forEach(s=>{ const subset = satScoped.filter(r=>r.curso===c && r.sede===s); satMx[c][s] = subset.length ? satPct(subset) : null; });
    const subsetC = satScoped.filter(r=>r.curso===c);
    satMx[c].Total = subsetC.length ? satPct(subsetC) : null;
  });
  const satGeneral = satPct(satScoped);

  // Rendimiento (eficacia %) por curso — used for the report's chart image
  const eficaciaByCurso = cursos.map(c=>{
    const subset = participantesRows.filter(r=>r.curso===c);
    const v = avg(subset.map(r=>r.eficacia));
    return { curso: c, avg: v!=null ? v*100 : null };
  });

  // Asistencia promedio por sesión S1–S7 — used for the report's chart image
  const sessKeys = ['s1','s2','s3','s4','s5','s6','s7'];
  const sesionAvg = sessKeys.map(s=>{
    const vals = participantesRows.map(r=>r[s]).filter(v=>v!=null);
    return vals.length ? (sum(vals)/vals.length*100) : null;
  });

  return {
    periodo, cursos, sedes,
    totalMatriculados: scoped.length, estudiantesUnicos, estudiantesParticipantes, pctParticipacion,
    matriculadosMx, participacionMx,
    asistenciaByCurso, asistenciaGeneral, sesionAvg,
    rendMx, totalAprobados, totalDesaprobados, eficaciaByCurso,
    satMx, satGeneral, encuestasTotal: satScoped.length,
    carreraLabel: state.carrera || 'todas las carreras',
    facultadLabel: state.facultad || null,
    sedeLabel: state.sede || null,
    cursoLabel: state.curso || null
  };
}

function reportMatrixRows(mx, cursos, sedes, fmt){
  return cursos.map(c => `<tr><td>${c}</td>${sedes.map(s=>`<td>${fmt(mx.table[c][s])}</td>`).join('')}<td><strong>${fmt(mx.table[c].Total)}</strong></td></tr>`).join('')
    + `<tr class="totalrow"><td>TOTAL</td>${sedes.map(s=>`<td>${fmt(mx.totalRow[s])}</td>`).join('')}<td>${fmt(mx.totalRow.Total)}</td></tr>`;
}

function buildReportHTML(d, customText, chartImages){
  customText = customText || {};
  chartImages = chartImages || {};
  const fmtP = (x)=> x==null ? 'SD' : x.toFixed(1)+'%';
  const today = new Date().toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const carreraTxt = state.carrera || 'las carreras evaluadas';
  const filtrosTxt = [d.facultadLabel && `Facultad: ${d.facultadLabel}`, d.sedeLabel && `Sede: ${d.sedeLabel}`, d.cursoLabel && `Curso: ${d.cursoLabel}`].filter(Boolean).join(' · ');

  function chartImg(key, alt){
    return chartImages[key] ? `<img class="report-chart" src="${chartImages[key]}" alt="${alt}">` : '';
  }

  const rendRows = d.cursos.map(c => {
    const cells = d.sedes.map(s => `<td>${d.rendMx[c][s].aprobo}</td><td>${d.rendMx[c][s].desaprobo}</td>`).join('');
    return `<tr><td>${c}</td>${cells}<td><strong>${d.rendMx[c].Total.aprobo}</strong></td><td><strong>${d.rendMx[c].Total.desaprobo}</strong></td></tr>`;
  }).join('');

  const satRows = d.cursos.map(c => `<tr><td>${c}</td>${d.sedes.map(s=>`<td>${fmtP(d.satMx[c][s])}</td>`).join('')}<td><strong>${fmtP(d.satMx[c].Total)}</strong></td></tr>`).join('');

  const asistRows = d.asistenciaByCurso.map(a => `<tr><td>${a.curso}</td><td>${fmtP(a.avg)}</td></tr>`).join('');

  // Escape user-entered text before inserting as HTML, then turn paragraphs/lines into markup.
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function textToParagraphs(s){
    return String(s).split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');
  }
  function textToListItems(s){
    return String(s).split(/\n/).map(l => l.trim()).filter(Boolean)
      .map(l => `<li>${escapeHtml(l)}</li>`).join('');
  }

  const paraCargo = (customText.paraCargo || '').trim() || defaultParaCargo(d.carreraLabel);
  const paraNombre = (customText.paraNombre || '').trim();
  const deCargo = (customText.deCargo || '').trim() || DEFAULT_DE_CARGO;
  const deNombre = (customText.deNombre || '').trim();
  const paraHtml = paraNombre ? `${escapeHtml(paraNombre)}<br>${escapeHtml(paraCargo)}` : escapeHtml(paraCargo);
  const deHtml = deNombre ? `${escapeHtml(deNombre)}<br>${escapeHtml(deCargo)}` : escapeHtml(deCargo);

  const conclusionesExtra = (customText.conclusiones || '').trim();
  const conclusionesBlock = conclusionesExtra
    ? `<h3>Análisis adicional</h3>${textToParagraphs(conclusionesExtra)}`
    : '';

  const recomendacionesTxt = (customText.recomendaciones || '').trim() || DEFAULT_RECOMENDACIONES;
  const accionesTxt = (customText.acciones || '').trim() || DEFAULT_ACCIONES;
  const accionesItems = textToListItems(accionesTxt);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Informe Programa de Nivelación — ${d.periodo}</title>
<style>
  @page { size: A4; margin: 2cm 1.8cm; }
  body{ font-family: 'Calibri','Segoe UI',Arial,sans-serif; color:#16283F; font-size:12.5px; line-height:1.5; max-width:800px; margin:0 auto; padding:24px; }
  .toolbar{ position:sticky; top:0; background:#0F3E7A; padding:10px 16px; margin:-24px -24px 24px; display:flex; justify-content:space-between; align-items:center; }
  .toolbar button{ background:#fff; color:#0F3E7A; border:none; border-radius:6px; padding:8px 16px; font-weight:700; font-size:13px; cursor:pointer; }
  .toolbar span{ color:#fff; font-size:12px; }
  @media print{ .toolbar{ display:none; } body{ padding:0; max-width:100%; } }
  .brand{ display:flex; align-items:center; gap:10px; margin-bottom:18px; }
  .brand .logo{ width:36px;height:36px;border-radius:6px;background:#0F3E7A;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800; }
  .brand b{ font-size:14px; }
  h1{ font-size:15px; text-align:center; text-transform:uppercase; letter-spacing:.5px; margin:18px 0 4px; }
  .memoNo{ text-align:center; font-size:11px; color:#5B7089; margin-bottom:18px; }
  .memoRow{ display:grid; grid-template-columns:70px 1fr; gap:4px; margin-bottom:3px; font-size:12.5px; }
  .memoRow b{ }
  p{ text-align:justify; }
  h2{ font-size:13.5px; color:#0F3E7A; border-bottom:2px solid #0F3E7A; padding-bottom:3px; margin-top:22px; }
  h3{ font-size:12.5px; text-decoration:underline; margin:14px 0 6px; }
  table{ width:100%; border-collapse:collapse; margin:8px 0 14px; font-size:11.5px; }
  th,td{ border:1px solid #B9C9DC; padding:5px 7px; text-align:center; }
  th{ background:#E8F1FC; color:#0F3E7A; }
  td:first-child, th:first-child{ text-align:left; }
  tr.totalrow{ background:#F4F8FE; font-weight:700; }
  .chart-row{ display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 12px; }
  .chart-row.single{ justify-content:center; }
  .report-chart{ max-width:100%; border:1px solid #B9C9DC; border-radius:4px; background:#fff; }
  .chart-row .report-chart{ flex:1 1 260px; max-width:340px; }
  .chart-row.single .report-chart{ max-width:380px; }
  .sign{ margin-top:60px; text-align:center; }
  .sign .line{ border-top:1px solid #16283F; width:280px; margin:0 auto 4px; padding-top:6px; }
  ul{ margin:6px 0; padding-left:22px; }
  .note{ font-size:10.5px; color:#5B7089; font-style:italic; }
</style></head>
<body>
  <div class="toolbar">
    <span>Vista previa del informe — usa el botón para guardarlo como PDF</span>
    <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </div>

  <div class="brand"><div class="logo">UC</div><b>UNIVERSIDAD CIENTÍFICA DEL SUR</b></div>
  <h1>Informe del Programa de Nivelación</h1>
  <div class="memoNo">N° ____-DACB-U. CIENTÍFICA-${d.periodo.split('-')[0]}</div>

  <div class="memoRow"><b>Para</b><span>: ${paraHtml}</span></div>
  <div class="memoRow"><b>De</b><span>: ${deHtml}</span></div>
  <div class="memoRow"><b>Asunto</b><span>: Informe de resultados del programa de nivelación periodo ${d.periodo}</span></div>
  <div class="memoRow"><b>Fecha</b><span>: ${today}</span></div>

  <p style="margin-top:16px;">Es grato dirigirme a Ud. para comunicarle los resultados obtenidos del programa de nivelación, implementado por el Departamento Académico de Cursos Básicos, aplicado a los estudiantes de ${d.carreraLabel} durante el periodo ${d.periodo}${filtrosTxt ? ` (${filtrosTxt})` : ''}. A continuación, se muestran los siguientes resultados:</p>

  <h2>Conclusiones</h2>

  <h3>Participación</h3>
  <p>De los <strong>${d.totalMatriculados} matriculados</strong> (${d.estudiantesUnicos} estudiantes) inscritos en el programa, participaron ${d.estudiantesParticipantes} estudiantes, que corresponde a un <strong>${d.pctParticipacion.toFixed(1)}%</strong>.</p>
  <div class="chart-row">
    ${chartImg('condicion', 'Condición del estudiante')}
    ${chartImg('participacionCurso', 'Participación por curso')}
  </div>
  <table><thead><tr><th>Matriculados</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${reportMatrixRows(d.matriculadosMx, d.cursos, d.sedes, v=>v)}</tbody></table>
  <table><thead><tr><th>Participación</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${reportMatrixRows(d.participacionMx, d.cursos, d.sedes, v=>v)}</tbody></table>

  <h3>Asistencia</h3>
  <p>De los ${d.estudiantesParticipantes} estudiantes que participaron en el programa, en promedio asistieron al <strong>${fmtP(d.asistenciaGeneral)}</strong> de sus sesiones.</p>
  <div class="chart-row">
    ${chartImg('asistenciaCurso', 'Asistencia por curso')}
    ${chartImg('asistenciaSesion', 'Asistencia por sesión')}
  </div>
  <table><thead><tr><th>Curso</th><th>% Asistencia</th></tr></thead><tbody>${asistRows}</tbody></table>

  <h3>Rendimiento</h3>
  <p>De los ${d.estudiantesParticipantes} participantes, aprobaron sus primeras evaluaciones (EC1 y/o EP) <strong>${d.totalAprobados}</strong> estudiantes (${d.estudiantesParticipantes ? (d.totalAprobados/d.estudiantesParticipantes*100).toFixed(1) : '0.0'}%).</p>
  <div class="chart-row single">${chartImg('rendimientoCurso', 'Rendimiento por curso')}</div>
  <table><thead><tr><th rowspan="2">Curso</th>${d.sedes.map(s=>`<th colspan="2">${s}</th>`).join('')}<th colspan="2">Total</th></tr>
    <tr>${d.sedes.map(()=>'<th>Aprobó</th><th>Desaprobó</th>').join('')}<th>Aprobó</th><th>Desaprobó</th></tr></thead>
    <tbody>${rendRows}<tr class="totalrow"><td>TOTAL</td>${d.sedes.map(()=>'<td>—</td><td>—</td>').join('')}<td>${d.totalAprobados}</td><td>${d.totalDesaprobados}</td></tr></tbody></table>

  <h3>Satisfacción</h3>
  <p>${d.encuestasTotal ? `De los ${d.estudiantesParticipantes} participantes, ${d.encuestasTotal} contestaron las encuestas, con un porcentaje de satisfacción general del <strong>${fmtP(d.satGeneral)}</strong>.` : 'No se registraron encuestas de satisfacción para el periodo y filtros seleccionados (SD = sin datos).'}</p>
  <div class="chart-row single">${chartImg('satisfaccionCurso', 'Satisfacción por curso')}</div>
  <table><thead><tr><th>Satisfacción</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead><tbody>${satRows}</tbody></table>

  ${conclusionesBlock}

  <h2>Recomendaciones</h2>
  ${textToParagraphs(recomendacionesTxt)}

  <h3>Acciones que se tomarán en DACB para el siguiente ciclo:</h3>
  <ul>${accionesItems}</ul>

  <div class="sign">
    <div class="line">Director(a) del Departamento Académico de Cursos Básicos</div>
  </div>

  <p class="note">Informe generado automáticamente desde el dashboard del Programa de Nivelación a partir de los datos cargados (GIE-DCB-FOR-01 / GIE-DCB-FOR-02). Los campos "N°", "Para" y la firma quedan pendientes de completar manualmente.</p>
</body></html>`;
}

const DEFAULT_RECOMENDACIONES = 'Se recomienda que, a partir de los resultados obtenidos, el Decano y las autoridades de la carrera analicen y establezcan estrategias de seguimiento de sus estudiantes en sus respectivos programas de tutoría.';
const DEFAULT_ACCIONES = [
  'Mayor difusión de los programas en las sesiones regulares con la participación de docentes de CCBB, área de Admisión, Decanos, directores y tutores de carrera.',
  'Capacitaciones a los docentes que cubren el perfil de docentes que dictan nivelación.',
  'Motivar a los estudiantes que deben asistir al programa de nivelación incentivándolos con actividades lúdicas.'
].join('\n');

function defaultParaCargo(carreraLabel){
  return carreraLabel && carreraLabel !== 'todas las carreras'
    ? `Decano(a) de la Carrera de ${carreraLabel}`
    : 'Decano(a) de la(s) carrera(s) evaluada(s)';
}
const DEFAULT_DE_CARGO = 'Director(a) del Departamento Académico de Cursos Básicos';

// Text the user writes in the export modal is kept here so it survives closing/reopening the
// modal (and across periods) within the same session — it's only reset by "Restaurar textos".
const reportCustomText = {
  conclusiones: '', recomendaciones: '', acciones: '',
  paraNombre: '', paraCargo: '', deNombre: '', deCargo: ''
};

function buildPreviewTablesHTML(d){
  const fmtP = (x)=> x==null ? 'SD' : x.toFixed(1)+'%';

  const rendRows = d.cursos.map(c => {
    const cells = d.sedes.map(s => `<td>${d.rendMx[c][s].aprobo}</td><td>${d.rendMx[c][s].desaprobo}</td>`).join('');
    return `<tr><td>${c}</td>${cells}<td><strong>${d.rendMx[c].Total.aprobo}</strong></td><td><strong>${d.rendMx[c].Total.desaprobo}</strong></td></tr>`;
  }).join('');
  const satRows = d.cursos.map(c => `<tr><td>${c}</td>${d.sedes.map(s=>`<td>${fmtP(d.satMx[c][s])}</td>`).join('')}<td><strong>${fmtP(d.satMx[c].Total)}</strong></td></tr>`).join('');
  const asistRows = d.asistenciaByCurso.map(a => `<tr><td>${a.curso}</td><td>${fmtP(a.avg)}</td></tr>`).join('');
  const pctAprob = d.estudiantesParticipantes ? (d.totalAprobados/d.estudiantesParticipantes*100) : 0;

  return `
    <div class="preview-kpis">
      <div class="preview-kpi"><div class="k">Matriculados</div><div class="v">${d.totalMatriculados}</div></div>
      <div class="preview-kpi"><div class="k">Participantes</div><div class="v">${d.estudiantesParticipantes}</div></div>
      <div class="preview-kpi"><div class="k">% Participación</div><div class="v">${d.pctParticipacion.toFixed(1)}%</div></div>
      <div class="preview-kpi"><div class="k">Asistencia gral.</div><div class="v">${fmtP(d.asistenciaGeneral)}</div></div>
      <div class="preview-kpi"><div class="k">% Aprobados</div><div class="v">${pctAprob.toFixed(1)}%</div></div>
      <div class="preview-kpi"><div class="k">Satisfacción</div><div class="v">${fmtP(d.satGeneral)}</div></div>
    </div>

    <h4>Matriculados</h4>
    <table class="preview-table"><thead><tr><th>Curso</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${reportMatrixRows(d.matriculadosMx, d.cursos, d.sedes, v=>v)}</tbody></table>

    <h4>Participación</h4>
    <table class="preview-table"><thead><tr><th>Curso</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${reportMatrixRows(d.participacionMx, d.cursos, d.sedes, v=>v)}</tbody></table>

    <h4>% Asistencia por curso</h4>
    <table class="preview-table"><thead><tr><th>Curso</th><th>% Asistencia</th></tr></thead><tbody>${asistRows}</tbody></table>

    <h4>Rendimiento (primeras evaluaciones)</h4>
    <table class="preview-table"><thead><tr><th rowspan="2">Curso</th>${d.sedes.map(s=>`<th colspan="2">${s}</th>`).join('')}<th colspan="2">Total</th></tr>
      <tr>${d.sedes.map(()=>'<th>Apr.</th><th>Desapr.</th>').join('')}<th>Apr.</th><th>Desapr.</th></tr></thead>
      <tbody>${rendRows}</tbody></table>

    <h4>Satisfacción</h4>
    ${d.encuestasTotal
      ? `<table class="preview-table"><thead><tr><th>Curso</th>${d.sedes.map(s=>`<th>${s}</th>`).join('')}<th>Total</th></tr></thead><tbody>${satRows}</tbody></table>`
      : `<p class="preview-note">Sin encuestas registradas para este periodo/filtros (SD = sin datos).</p>`}
  `;
}

function openExportModal(){
  const periodo = state.periodo || latestPeriod();
  if(!periodo){
    alert('No hay datos cargados para generar el informe.');
    return;
  }
  const data = computeReportData(periodo);
  if(data.totalMatriculados === 0){
    alert(`No hay registros de asistencia/notas para el periodo "${periodo}" con los filtros actuales.`);
    return;
  }
  openExportModal._periodo = periodo;
  openExportModal._data = data;

  const hint = document.getElementById('modalHint');
  const filtros = [data.facultadLabel, state.carrera, data.sedeLabel, data.cursoLabel].filter(Boolean).join(' · ');
  hint.textContent = `Periodo: ${periodo}${filtros ? ' · ' + filtros : ''} — revisa los cuadros y luego redacta tus conclusiones y recomendaciones.`;

  document.getElementById('reportPreview').innerHTML = buildPreviewTablesHTML(data);

  document.getElementById('inParaNombre').value = reportCustomText.paraNombre;
  document.getElementById('inParaCargo').value = reportCustomText.paraCargo || defaultParaCargo(data.carreraLabel);
  document.getElementById('inDeNombre').value = reportCustomText.deNombre;
  document.getElementById('inDeCargo').value = reportCustomText.deCargo || DEFAULT_DE_CARGO;

  document.getElementById('taConclusiones').value = reportCustomText.conclusiones;
  document.getElementById('taRecomendaciones').value = reportCustomText.recomendaciones || DEFAULT_RECOMENDACIONES;
  document.getElementById('taAcciones').value = reportCustomText.acciones || DEFAULT_ACCIONES;

  document.getElementById('reportModalOverlay').classList.add('open');
}

function closeExportModal(){
  document.getElementById('reportModalOverlay').classList.remove('open');
}

function generateReportFromModal(){
  reportCustomText.paraNombre = document.getElementById('inParaNombre').value;
  reportCustomText.paraCargo = document.getElementById('inParaCargo').value;
  reportCustomText.deNombre = document.getElementById('inDeNombre').value;
  reportCustomText.deCargo = document.getElementById('inDeCargo').value;
  reportCustomText.conclusiones = document.getElementById('taConclusiones').value;
  reportCustomText.recomendaciones = document.getElementById('taRecomendaciones').value;
  reportCustomText.acciones = document.getElementById('taAcciones').value;

  const data = openExportModal._data;
  const btn = document.getElementById('btnGenerateReport');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando…';

  // Chart images must be captured BEFORE opening the report window: once a new tab/window opens,
  // this tab becomes a background tab and browsers throttle requestAnimationFrame there, so any
  // chart rendering started afterwards may never actually paint.
  const openAndWrite = (chartImages) => {
    const html = buildReportHTML(data, reportCustomText, chartImages);
    const w = window.open('', '_blank');
    btn.disabled = false;
    btn.textContent = originalLabel;
    if(!w){
      alert('El navegador bloqueó la ventana emergente. Habilita las ventanas emergentes para este sitio e inténtalo de nuevo.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    closeExportModal();
  };

  buildReportChartImages(data)
    .then(openAndWrite)
    .catch(err => {
      console.error('No se pudieron generar los gráficos del informe:', err);
      openAndWrite({});
    });
}

function setupExportModal(){
  document.getElementById('btnExportReport').addEventListener('click', openExportModal);
  document.getElementById('modalCloseBtn').addEventListener('click', closeExportModal);
  document.getElementById('reportModalOverlay').addEventListener('click', (e)=>{
    if(e.target.id === 'reportModalOverlay') closeExportModal();
  });
  document.getElementById('btnGenerateReport').addEventListener('click', generateReportFromModal);
  document.getElementById('btnResetText').addEventListener('click', ()=>{
    const carreraLabel = (openExportModal._data && openExportModal._data.carreraLabel) || 'todas las carreras';
    document.getElementById('inParaNombre').value = '';
    document.getElementById('inParaCargo').value = defaultParaCargo(carreraLabel);
    document.getElementById('inDeNombre').value = '';
    document.getElementById('inDeCargo').value = DEFAULT_DE_CARGO;
    document.getElementById('taConclusiones').value = '';
    document.getElementById('taRecomendaciones').value = DEFAULT_RECOMENDACIONES;
    document.getElementById('taAcciones').value = DEFAULT_ACCIONES;
  });
}

// ============ DOWNLOAD CONSOLIDATED DATABASE (.xlsx) ============
// Writes the full accumulated ATT/SAT dataset back out as two real, standalone .xlsx files using
// the exact header names the uploader already understands — so these downloads work as a genuine
// portable "database" backup, and can be re-uploaded later (here or on another computer) to
// restore everything, independent of this browser's autosave.

function downloadWorkbook(aoa, sheetName, filename){
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function exportConsolidatedExcel(){
  if(!ATT.length && !SAT.length){
    alert('No hay datos cargados para exportar.');
    return;
  }
  const today = new Date().toISOString().slice(0,10);

  if(ATT.length){
    const header = ['ID','Apellidos y Nombres','Carrera','Facultad','Sede','Sección','Curso a nivelar',
      'Periodo académico','S1','S2','S3','S4','S5','S6','S7','Asistencias','% de asistencia',
      'ED','EC1','EP','Avance obtenido','Avance ideal','Eficacia (%)','Aprobado'];
    const rows = ATT.map(r => [
      r.id, r.nombre, r.carrera, r.facultad, r.sede, r.seccion, r.curso, r.periodo,
      r.s1, r.s2, r.s3, r.s4, r.s5, r.s6, r.s7, r.asistencias,
      r.pctAsist==null ? null : r.pctAsist/100, // stored as %, uploader expects a 0–1 fraction
      r.ed, r.ec1, r.ep, r.avanceObt, r.avanceIdeal, r.eficacia, r.aprobado
    ]);
    downloadWorkbook([header, ...rows], 'REGISTRO', `nivelacion_asistencia_consolidado_${today}.xlsx`);
  }

  const dlSat = ()=>{
    if(!SAT.length) return;
    const header = ['Carrera','Ciclo','Semestre','Sede','Curso', ...Array.from({length:14},(_,i)=>'P'+(i+1))];
    const rows = SAT.map(r => [
      r.carrera, r.ciclo, r.periodo, r.sede, r.curso,
      ...Array.from({length:14},(_,i)=> r['p'+(i+1)])
    ]);
    downloadWorkbook([header, ...rows], 'REGISTRO', `nivelacion_satisfaccion_consolidado_${today}.xlsx`);
  };
  // Small delay between the two triggered downloads — some browsers only allow the first
  // download from a single click to fire immediately and queue/block a second one otherwise.
  if(ATT.length && SAT.length) setTimeout(dlSat, 300);
  else dlSat();
}


// ============ INIT ============
async function initApp(){
  try{
    await loadBaseData();
  }catch(err){
    console.error('loadBaseData failed:', err);
    document.getElementById('main').innerHTML = `<div class="empty-state">
      No se pudieron cargar los archivos <code>data/attendance.json</code> / <code>data/satisfaction.json</code> (${err.message}).<br><br>
      Si abriste <code>index.html</code> directamente haciendo doble clic (file://), los navegadores bloquean esa carga por seguridad.
      Sirve la carpeta con un servidor local — por ejemplo <code>python -m http.server</code> y abre <code>http://localhost:8000</code> —
      o publícala con GitHub Pages.
    </div>`;
    return;
  }

  const snapshot = await loadSnapshot();
  if(snapshot && Array.isArray(snapshot.att) && snapshot.att.length){
    ATT = snapshot.att;
    SAT = Array.isArray(snapshot.sat) ? snapshot.sat : [];
    loadedFromSnapshot = true;
    const when = snapshot.savedAt ? new Date(snapshot.savedAt).toLocaleString('es-PE', { dateStyle:'short', timeStyle:'short' }) : '';
    setAutosaveStatus(`💾 Datos restaurados automáticamente de tu última sesión en este navegador${when ? ' (' + when + ')' : ''}.`, 'ok');
  } else if(autosaveEnabled){
    setAutosaveStatus('Los cambios se guardarán automáticamente en este navegador.', '');
  } else {
    setAutosaveStatus('⚠️ Este navegador no admite autoguardado; usa "Descargar base de datos" para no perder tus cambios.', 'err');
  }

  state.periodo = latestPeriod();
  rebuildFilters();
  setupTabs();
  setupDataPanel();
  setupExportModal();
  document.getElementById('btnDownloadDb').addEventListener('click', exportConsolidatedExcel);
  render();
}
initApp();
