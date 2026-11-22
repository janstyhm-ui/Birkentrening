const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const storageKey = 'birken-2027-logg-v1';
const tabs = [
  ['oversikt', 'Oversikt', 'home'], ['kalender', 'Kalender', 'calendar'],
  ['styrke', 'Styrke', 'strength'], ['statistikk', 'Statistikk', 'stats'],
  ['innstillinger', 'Innstillinger', 'settings']
];
const types = {
  interval: '10–20–30-intervall', long: 'Rolig langtur', run: 'Løping',
  strength: 'Styrke', floorball: 'Innebandy', other: 'Annen trening'
};
const statuses = {planned: 'Planlagt', done: 'Gjennomført', partial: 'Delvis gjennomført', moved: 'Flyttet', skipped: 'Hoppet over'};
const isRun = type => ['interval', 'long', 'run'].includes(type);
const icon = name => `<svg aria-hidden="true"><use href="#${name}"/></svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const format = (date, options) => new Intl.DateTimeFormat('nb-NO', options).format(parse(date));
const shortDate = date => format(date, {day:'numeric', month:'short'});
const fullDate = date => format(date, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const number = value => new Intl.NumberFormat('nb-NO', {maximumFractionDigits: 2}).format(value);
const iso = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
  .map((part, i) => String(part).padStart(i ? 2 : 4, '0')).join('-');
const dateParts = date => date.split('-').map((value, i) => Number(value) - (i === 1 ? 1 : 0));
const parse = date => new Date(`${date}T12:00:00`);
const shift = (date, days) => {
  const shifted = parse(date);
  shifted.setDate(shifted.getDate() + days);
  return iso(shifted);
};
const weekday = date => (parse(date).getDay() + 6) % 7;
const today = () => iso(new Date());
const validDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value) && iso(parse(value)) === value;
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const numeric = (value, min = 0, max = Infinity, integer = false) =>
  value == null || (Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
const validSession = s => record(s) && typeof s.id === 'string' && s.id.length > 0 &&
  validDate(s.date) && Object.hasOwn(types, s.type) && typeof s.title === 'string' &&
  numeric(s.targetKm) && numeric(s.week, 1, 53, true) &&
  (s.time == null || typeof s.time === 'string') && (s.floorball == null || typeof s.floorball === 'boolean') &&
  (s.description == null || typeof s.description === 'string') &&
  (s.program == null || ['A','B'].includes(s.program)) && (s.type !== 'strength' || !!s.program);
const validState = s => validSession(s) && Object.hasOwn(statuses, s.status) &&
  (s.loggedAt == null || (typeof s.loggedAt === 'string' && Number.isFinite(Date.parse(s.loggedAt)))) &&
  record(s.results) && numeric(s.results.shoulder, 0, 10, true) &&
  ['comment','discomfort'].every(key => s.results[key] == null || typeof s.results[key] === 'string') &&
  (s.results.replacements == null || record(s.results.replacements) && Object.values(s.results.replacements).every(v => typeof v === 'string')) && numeric(s.results.distance) && numeric(s.results.minutes) &&
  numeric(s.results.effort, 1, 10, true) &&
  (s.results.sets == null || (record(s.results.sets) && Object.values(s.results.sets).every(sets =>
    Array.isArray(sets) && sets.every(set => record(set) && numeric(set.weight) && numeric(set.reps, 0, Infinity, true) && (set.done == null || typeof set.done === 'boolean') && (set.warmup == null || typeof set.warmup === 'boolean'))
  )));
const validBackup = data => record(data) && data.version === 1 && (data.weights == null || Array.isArray(data.weights) &&
  data.weights.every(w => record(w) && validDate(w.date) && Number.isFinite(w.kg) && w.kg > 0)) && Array.isArray(data.entries) &&
  new Set(data.entries.map(e => e?.origin?.id)).size === data.entries.length &&
  data.entries.every(e => record(e) && validSession(e.origin) && validState(e.current) &&
    e.origin.id === e.current.id && Array.isArray(e.history) &&
    e.history.every(h => record(h) && ['Endret', 'Byttet til innebandy', 'Gjenopprettet intervall', 'Hoppet over', 'Åpnet igjen', 'Resultat lagret', 'Gjennomført', 'Delvis gjennomført', 'Flyttet'].includes(h.action) &&
      typeof h.at === 'string' && Number.isFinite(Date.parse(h.at)) && validState(h.before) && h.before.id === e.origin.id));
const validProgram = data => record(data) && validDate(data.start) && validDate(data.end) &&
  data.start <= data.end && Array.isArray(data.sessions) && record(data.strength) &&
  new Set(data.sessions.map(s => s?.id)).size === data.sessions.length &&
  data.sessions.every(s => validSession(s) && s.date >= data.start && s.date <= data.end) &&
  ['A', 'B'].every(key => {
    const exercises = data.strength[key];
    return Array.isArray(exercises) && new Set(exercises.map(e => e?.id)).size === exercises.length &&
      exercises.every(e => record(e) && typeof e.id === 'string' && e.id &&
        typeof e.name === 'string' && typeof e.description === 'string' &&
        Number.isInteger(e.sets) && e.sets > 0 && e.sets <= 50 &&
        (typeof e.reps === 'string' || Number.isInteger(e.reps)) &&
        (e.image == null || /^assets\/[\w./-]+$/.test(e.image) && !e.image.includes('..')));
  });

let entries = new Map();
let weights = [];
let calendarMode = 'month';
let timer;
let storageReadable = true;
let program;
let chosen;
let month;
let installPrompt;
let noticeTimer;
function flash(message) {
  notice.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 5000);
}
function backup(source = entries, bodyWeights = weights) {
  return {version: 1, entries: [...source.values()], weights: bodyWeights};
}
try {
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    const saved = JSON.parse(raw);
    if (!validBackup(saved)) throw new Error('Ugyldig logg');
    entries = new Map(saved.entries.map(e => [e.origin.id, e]));
    weights = saved.weights ?? [];
  }
} catch {
  storageReadable = false;
  flash('Kunne ikke lese den lokale loggen. En gyldig sikkerhetskopi kan gjenopprette den.');
}
function persist(next, restoring = false, bodyWeights = weights) {
  try {
    if (!storageReadable && !restoring) throw new Error('Loggen kan ikke overskrives');
    localStorage.setItem(storageKey, JSON.stringify(backup(next, bodyWeights)));
    entries = next;
    weights = bodyWeights;
    storageReadable = true;
    return true;
  } catch {
    flash('Kunne ikke lagre loggen på enheten.');
    return false;
  }
}
function initial(s) {
  return {...s, status:'planned', results:{}};
}
function allSessions() {
  const sessions = new Map(program.sessions.map(s => [s.id, initial(s)]));
  for (const [id, entry] of entries) sessions.set(id, entry.current);
  return [...sessions.values()].sort((a,b) => a.date.localeCompare(b.date) || (a.type === 'strength' ? 0 : 1) - (b.type === 'strength' ? 0 : 1) || a.title.localeCompare(b.title, 'nb'));
}
function updateSession(session, current, action) {
  const previous = entries.get(session.id);
  const origin = previous?.origin ?? program.sessions.find(s => s.id === session.id) ?? session;
  const next = new Map(entries);
  next.set(session.id, {
    origin, current,
    history: [...(previous?.history ?? []), {action, at:new Date().toISOString(), before:session}]
  });
  return persist(next);
}
const heading = (title, subtitle) => `<div class="heading"><h1>${title}</h1><p class="muted">${subtitle}</p></div>`;
const tile = name => `<span class="icon-tile">${icon(name)}</span>`;
const list = sessions => `<div class="session-list">${sessions.map(s => `
  <button type="button" class="session" data-type="${s.type}" data-session="${escape(s.id)}">
    ${tile(s.status === 'done' ? 'check' : s.type === 'strength' ? 'strength' : 'calendar')}
    <span><strong>${escape(s.title)}</strong><small>${shortDate(s.date)}${s.time ? ' · ' + escape(s.time) : ''} · ${statuses[s.status]}</small></span>
    ${icon('next')}
  </button>`).join('')}</div>`;
const empty = (title, description = '') => `<div class="empty"><strong>${title}</strong>${description ? `<p>${description}</p>` : ''}</div>`;

function overview(sessions) {
  const current = today();
  const monday = shift(current, -weekday(current));
  const week = sessions.filter(s => s.date >= monday && s.date <= shift(monday, 6));
  const done = week.filter(s => s.status === 'done').length;
  const todays = sessions.filter(s => s.date === current);
  const upcoming = sessions.filter(s => s.date > current && ['planned','moved'].includes(s.status)).slice(0, 4);
  const trainingWeek = current >= program.start && current <= program.end ?
    Math.floor((Date.UTC(...dateParts(current)) - Date.UTC(...dateParts(program.start))) / 604800000) + 1 : null;
  return `<section class="hero">
    <div><span class="tag">${trainingWeek ? `Uke ${trainingWeek} av 10` : '10-ukersprogram'}</span><h1>Birken 2027</h1><p>${format(program.start, {day:'numeric',month:'short',year:'numeric'})} – ${format(program.end, {day:'numeric',month:'short',year:'numeric'})}</p>
    <a class="button lime" href="#kalender">Se treningskalenderen ${icon('right')}</a></div>
  </section>
  <div class="grid">
    <section class="card"><div class="card-title"><div><h2>Dagens økt</h2><small>${fullDate(current)}</small></div>${tile('calendar')}</div>
      ${todays.length ? list(todays) : empty('Ingen økt i dag', current < program.start ? 'Treningsperioden starter ' + shortDate(program.start) + '.' : '')}</section>
    <section class="card"><div class="card-title"><h2>Ukens fremgang</h2>${tile('stats')}</div><span class="progress-number">${done}<small> / ${week.length} økter</small></span>
      <progress aria-label="Gjennomførte økter denne uken" max="${week.length || 1}" value="${done}"></progress>
      <p class="muted"><small>${shortDate(monday)} – ${shortDate(shift(monday, 6))}</small></p></section>
  </div>
  <section class="card"><div class="card-title"><h2>Kommende økter</h2><a class="button quiet" href="#kalender">Kalender ${icon('right')}</a></div>
  ${upcoming.length ? list(upcoming) : empty('Ingen kommende økter i kalenderen.')}</section>`;
}

function moveMonth(value, count) {
  const date = parse(`${value}-01`);
  date.setMonth(date.getMonth() + count);
  return iso(date).slice(0,7);
}
function calendar(sessions) {
  const weekStart = shift(chosen, -weekday(chosen));
  const weekEnd = shift(weekStart, 6);
  const first = calendarMode === 'week' ? weekStart : `${month}-01`;
  const min = [program.start, ...sessions.map(s => s.date)].sort()[0];
  const max = [program.end, ...sessions.map(s => s.date)].sort().at(-1);
  const days = [];
  const offset = calendarMode === 'week' ? 0 : weekday(first);
  for (let i = 0; i < offset; i++) days.push('<span aria-hidden="true"></span>');
  const byDate = Map.groupBy ? Map.groupBy(sessions, s => s.date) : sessions.reduce((map,s) => {
    map.set(s.date, [...(map.get(s.date) ?? []), s]);
    return map;
  }, new Map());
  for (let date = first; (calendarMode === 'week' ? date <= weekEnd : date.startsWith(month)); date = shift(date, 1)) {
    const daySessions = byDate.get(date) ?? [];
    const count = daySessions.length;
    days.push(`<button class="day" data-date="${date}" aria-label="${fullDate(date)}${count ? `, ${count} økter` : ''}"
      aria-pressed="${date === chosen}" ${date === today() ? 'aria-current="date"' : ''}
      ${date < min || date > max ? 'disabled' : ''}>${parse(date).getDate()}${count ? `<span class="dots">${daySessions.map(s => `<i data-type="${s.type}" title="${statuses[s.status]}">${s.status === 'done' ? '✓' : ''}</i>`).join('')}</span>` : ''}</button>`);
  }
  const daily = byDate.get(chosen) ?? [];
  return heading('Kalender', `${fullDate(program.start)} – ${fullDate(program.end)}`) + `
    <section class="card">
      <div class="view-switch" aria-label="Kalendervisning">
        <button class="button secondary" data-mode="week" aria-pressed="${calendarMode === 'week'}">Uke</button>
        <button class="button secondary" data-mode="month" aria-pressed="${calendarMode === 'month'}">Måned</button>
      </div><div class="calendar-header">
        <button class="icon-button" data-month="-1" aria-label="Forrige måned" ${(calendarMode === 'week' ? weekStart <= min : month <= min.slice(0,7)) ? 'disabled' : ''}>${icon('prev')}</button>
        <h2>${calendarMode === 'week' ? shortDate(first) + ' – ' + shortDate(weekEnd) : format(first, {month:'long', year:'numeric'})}</h2>
        <button class="icon-button" data-month="1" aria-label="Neste måned" ${(calendarMode === 'week' ? weekEnd >= max : month >= max.slice(0,7)) ? 'disabled' : ''}>${icon('next')}</button>
      </div>
      <div class="legend"><span data-type="run">Løping</span><span data-type="strength">Styrke</span><span data-type="floorball">Innebandy</span></div><div class="days">${['Man','Tir','Ons','Tor','Fre','Lør','Søn'].map(day => `<span class="weekday">${day}</span>`).join('')}${days.join('')}</div>
    </section>
    <section class="card stacked"><h2>${fullDate(chosen)}</h2>${daily.length ? list(daily) : empty('Ingen planlagte økter denne dagen.')}</section>`;
}

function exerciseInfo(e, sets = e.sets) {
  return `<h3>${escape(e.name)}</h3><small>${sets} arbeidssett × ${escape(e.reps)} ${e.unit} · ${e.rest_seconds} sek pause</small>
    <p class="muted"><small>${escape(e.muscle_groups)} · ${escape(e.equipment)}${e.rir_target ? ' · ' + escape(e.rir_target) + ' RIR' : ''}</small></p>
    ${e.image ? `<img src="${escape(e.image)}" alt="Illustrasjon av ${escape(e.name)}" loading="lazy">` : ''}
    <p class="muted description">${escape(e.description)}</p>
    ${e.alternative_exercise ? `<p class="muted"><small>Alternativ: ${escape(e.alternative_exercise)}</small></p>` : ''}`;
}
function strength() {
  return heading('Styrke', 'To styrkeprogram i treningsperioden.') + ['A','B'].map((key,i) => `
    <section class="card stacked"><div class="card-title"><div><h2>Program ${key}</h2><small>${i ? 'Torsdag' : 'Mandag'}</small></div>${tile('strength')}</div>
    ${program.strength[key].length ? program.strength[key].map(e => `<div class="card exercise">${exerciseInfo(e)}</div>`).join('') : empty('Øvelsene er ikke lagt inn ennå.')}</section>`).join('');
}

const ordered = sessions => [...sessions].sort((a,b) =>
  b.date.localeCompare(a.date) || (b.loggedAt ?? '').localeCompare(a.loggedAt ?? ''));
function statistics(sessions) {
  const done = sessions.filter(s => s.status === 'done');
  const runs = ordered(sessions.filter(s => ['done','partial'].includes(s.status) && isRun(s.type)));
  const strengthDone = ordered(done.filter(s => s.type === 'strength'));
  const distance = runs.reduce((sum,s) => sum + (s.results.distance ?? 0), 0);
  const metric = (value,label) => `<div class="card"><span class="metric">${value}</span><small>${label}</small></div>`;
  const rows = ['A','B'].flatMap(key => program.strength[key].flatMap(e => {
    const seconds = e.unit === 'sekunder';
    const unit = seconds ? 'sek' : e.per_dumbbell ? 'kg/stk' : 'kg';
    const results = ordered(sessions.filter(s => s.type === 'strength' && s.program === key &&
      ['done','partial'].includes(s.status) && !s.results.replacements?.[e.id]));
    const values = results.flatMap(s => {
      const sets = (s.results.sets?.[e.id] ?? []).filter(set => !set.warmup);
      const measurements = sets.map(set => seconds ? set.reps : set.weight).filter(Number.isFinite);
      return measurements.length ? [{date:s.date, value:Math.max(...measurements), sets}] : [];
    });
    if (!values.length) return [];
    const latest = values[0];
    const diff = latest.value - values.at(-1).value;
    const progress = values.length > 1 ? ` · ${diff > 0 ? '+' : ''}${number(diff)} ${unit} siden første økt` : '';
    return `<div class="card exercise"><h3>${escape(e.name)} · ${key}</h3>
      <small>${number(latest.value)} ${unit} maks i siste logg (${shortDate(latest.date)})${progress}</small>
      <details><summary>Se utvikling</summary><ul class="history">${values.map(v => {
        const setValues = v.sets.filter(set => set.reps != null || set.weight != null).map(set =>
          [!seconds && set.weight != null ? number(set.weight) + ' ' + unit : '',
            set.reps != null ? set.reps + (seconds ? ' sek' : ' reps') : ''].filter(Boolean).join(' × '));
        return `<li>${shortDate(v.date)} · ${setValues.join(' / ')}</li>`;
      }).join('')}</ul></details></div>`;
  }));
  return heading('Statistikk', 'Resultater fra gjennomførte og delvis gjennomførte økter.') +
    `<div class="stats">${metric(done.length,'Gjennomførte økter')}${metric(number(distance) + ' km','Løpedistanse')}${metric(strengthDone.length,'Styrkeøkter')}</div>
    ${runningStats(runs, done)}${weightView()}
    <section class="card bottom-space"><h2>Styrkeprogresjon</h2>
    ${rows.length ? rows.join('') : empty('Ingen styrkeresultater ennå.', 'Registrerte sett vises her når du fullfører hele eller deler av en styrkeøkt.')}</section>
    <section class="card stacked"><h2>Gjennomførte økter</h2>${done.length ? list(ordered(done)) : empty('Ingen gjennomførte økter ennå.')}</section>`;
}
function settings() {
  return heading('Innstillinger', 'Administrer den lokale treningsloggen.') + `
    <section class="card"><h2>Sikkerhetskopi</h2><p class="muted">Last ned treningsresultater og øktendringer som én fil. Du kan importere den på nytt eller flytte loggen til en annen enhet.</p>
    <div class="actions"><button class="button" data-export>Eksporter sikkerhetskopi</button></div>
    <div class="bottom-space"><label class="file">Importer sikkerhetskopi<input type="file" accept=".json,application/json" id="backup-file"></label></div></section>
    <section class="card stacked"><h2>Installer på telefonen</h2><p class="muted">Åpne appens HTTPS-adresse i Chrome på Android. Velg «Installer app» eller «Legg til på startskjermen» i menyen.</p>
    ${installPrompt ? '<div class="actions"><button class="button secondary" data-install>Installer app</button></div>' : ''}</section>`;
}

function render() {
  const active = tabs.find(([key]) => location.hash === '#' + key) ?? tabs[0];
  document.querySelector('#section-name').textContent = active[1];
  document.querySelector('#nav').innerHTML = tabs.map(([id,label,image]) =>
    `<a href="#${id}" class="nav-item" ${id === active[0] ? 'aria-current="page"' : ''}>${icon(image)}<span>${label}</span></a>`).join('');
  if (!program) return;
  const views = {oversikt:overview, kalender:calendar, styrke:strength, statistikk:statistics, innstillinger:settings};
  main.innerHTML = views[active[0]](allSessions());
}

const speed = ({distance,minutes}) => distance > 0 && minutes > 0 ? distance * 60 / minutes : null;
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
function runningStats(runs, done) {
  const baseline = program.baseline;
  const measured = runs.filter(s => speed(s.results));
  const longest = runs.reduce((max,s) => Math.max(max, s.results.distance ?? 0), 0);
  const test = measured.find(s => s.id === 'w10-son-run');
  const goal = program.goal;
  const weekly = Array.from({length:10}, (_, i) => {
    const from = shift(program.start, i * 7);
    return done.filter(s => s.date >= from && s.date <= shift(from, 6)).length;
  });
  return `<section class="card bottom-space"><h2>Løpsutvikling</h2>
    <p>Lengste registrerte tur i programmet <strong>${longest ? number(longest) + ' km' : '—'}</strong></p>
    <details open><summary>Gjennomsnittshastighet</summary>
    <ul class="history">${measured.map(s => `<li>${shortDate(s.date)} · ${escape(s.title)} · ${number(speed(s.results))} km/t</li>`).join('')}
    ${baseline ? `<li>${shortDate(baseline.date)} · Referansetur · ${number(baseline.distance)} km på ${clock(Math.round(baseline.minutes * 60))} · ${number(speed(baseline))} km/t</li>` : ''}</ul></details>
    ${goal ? `<h3>Halvmaraton under to timer</h3><p class="muted">Målfart ca. 5:41 min/km (${number(goal.speed)} km/t).
    ${test ? `Testløpet: ${number(speed(test.results))} km/t (${number(speed(test.results) / goal.speed * 100)} % av målfarten på testen).` : 'Registrer testløpet for å sammenligne farten med målet.'}</p>` : ''}</section>
    <section class="card stacked"><h2>Gjennomført per uke</h2><div class="week-counts">${weekly.map((count,i) => `<span><small>Uke ${i+1}</small><strong>${count}</strong></span>`).join('')}</div></section>`;
}
function weightView() {
  return `<section class="card stacked"><h2>Kroppsvekt</h2>
    <form id="weight-form"><div class="fields"><label>Dato<input type="date" name="date" value="${today()}" required></label>
      ${field('kg','Vekt (kg)',null,'min="0.1" step="0.1" required')}</div><div class="actions"><button class="button">Lagre vekt</button></div></form>
    ${weights.length ? `<ul class="history">${[...weights].sort((a,b)=>b.date.localeCompare(a.date)).map(w => `<li>${shortDate(w.date)} · ${number(w.kg)} kg</li>`).join('')}</ul>` : ''}</section>`;
}

function field(name,label,value,attributes) {
  return `<label>${label}<input type="number" name="${name}" value="${escape(value)}" ${attributes}></label>`;
}
const fieldText = (name,label,value) => `<label>${label}<textarea name="${name}" maxlength="2000">${escape(value)}</textarea></label>`;
function planSets(s,e) {
  const volume = program.strengthVolume;
  if (s.week <= volume?.intro?.throughWeek) return Math.min(volume.intro.setsPerExercise,e.sets);
  if (s.week === volume?.taper?.week) return volume.taper.setsByExercise[e.id] ?? e.sets;
  return e.sets;
}
function setRow(e, set, i, replacement = '') {
  const warmup = !!set.warmup;
  return `<div class="set" data-set data-warmup="${warmup}">
    <span>${warmup ? 'Oppv.' : 'Sett ' + i}</span>
    ${field('weight',e.per_dumbbell && !replacement ? 'Kg/stk' : 'Kg', set.weight, 'min="0" step="0.01" inputmode="decimal"')}
    ${field('reps', e.unit === 'sekunder' && !replacement ? 'Sek' : 'Reps', set.reps, 'min="0" step="1" inputmode="numeric"')}
    <label>Ferdig<input type="checkbox" name="setDone" ${set.done ? 'checked' : ''}></label>
    <button type="button" class="icon-button" data-remove-set aria-label="Fjern sett">${icon('close')}</button>
  </div>`;
}
function strengthFields(s, sessions) {
  return program.strength[s.program].map(e => {
    const current = s.results.sets?.[e.id];
    const replacement = s.results.replacements?.[e.id] ?? '';
    const previous = ordered(sessions.filter(other => other.id !== s.id && other.date <= s.date &&
      ['done','partial'].includes(other.status) && other.type === 'strength' && other.program === s.program &&
      !other.results.replacements?.[e.id] &&
      other.results.sets?.[e.id]?.some(set => !set.warmup && (set.weight != null || set.reps != null))))[0];
    const prior = previous?.results.sets[e.id].filter(set => !set.warmup && (set.weight != null || set.reps != null));
    const count = planSets(s,e);
    const rows = current ?? [
      ...Array.from({length:e.warmup_sets}, () => ({warmup:true})),
      ...Array.from({length:count}, () => ({}))
    ];
    let i = 0;
    return `<section class="card exercise" data-exercise="${escape(e.id)}">
      ${exerciseInfo(e,count)}
      ${prior ? `<p class="muted"><small>Forrige økt (${shortDate(previous.date)}) · ${prior.map(set =>
      [set.weight == null ? '' : number(set.weight) + (e.per_dumbbell ? ' kg/stk' : ' kg'), set.reps == null ? '' : set.reps + (e.unit === 'sekunder' ? ' sek' : ' reps')].filter(Boolean).join(' × ')).join(' · ')}</small></p>` : ''}
      <details ${replacement ? 'open' : ''}><summary>Bytt øvelse i denne økten</summary>
        <label>Navn på alternativ øvelse<input name="replacement" value="${escape(replacement)}" maxlength="120" placeholder="${escape(e.alternative_exercise ?? '')}"></label>
      </details>
      <div class="sets">${rows.map(set => setRow(e,set,set.warmup ? 0 : ++i,replacement)).join('')}</div>
      <div class="actions"><button class="button secondary" type="button" data-add-set>Legg til sett</button>
        <button class="button secondary" type="button" data-add-set="warmup">+ Oppvarming</button>
        <button class="button secondary" type="button" data-rest="${e.rest_seconds}">Start pause</button></div>
      <output class="rest-clock" aria-live="off"></output>
    </section>`;
  }).join('');
}
function openSession(id) {
  const sessions = allSessions();
  const s = sessions.find(item => item.id === id);
  if (!s) return;
  const entry = entries.get(id);
  const origin = entry?.origin ?? s;
  const timeSeconds = Math.round((s.results.minutes ?? 0) * 60);
  dialog.dataset.id = id;
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">${escape(s.title)}</h2>
    <small>${fullDate(s.date)}${s.time ? ' · ' + escape(s.time) : ''} · ${statuses[s.status]}</small></div>
    <button class="icon-button" type="button" data-close aria-label="Lukk">${icon('close')}</button></div>
    ${entry && origin.date !== s.date ? `<p class="muted"><small>Opprinnelig dato ${shortDate(origin.date)}</small></p>` : ''}
    ${s.targetKm != null ? `<p><strong>Distansemål ${number(s.targetKm)} km</strong></p>` : ''}
    <p class="description">${escape(s.description)}</p>
    <form id="result-form">
      ${s.type === 'strength' ? `<button type="button" class="button secondary" data-jump-log>Gå til øktregistrering</button>${strengthFields(s,sessions)}` : ''}
      <div id="session-summary" class="fields" tabindex="-1">
        ${isRun(s.type) ? field('distance','Distanse (km)',s.results.distance,'min="0" step="0.01" inputmode="decimal"') : ''}
        ${field('minutes','Tid (min)',s.results.minutes == null ? null : Math.floor(timeSeconds/60),'min="0" step="1" inputmode="numeric"')}
        ${field('seconds','Sekunder',s.results.minutes == null ? null : timeSeconds%60,'min="0" max="59" step="1" inputmode="numeric"')}
        ${field('effort','Anstrengelse (1–10)',s.results.effort,'min="1" max="10" step="1" inputmode="numeric"')}
        ${s.type === 'strength' ? field('shoulder','Skuldersmerte (0–10)',s.results.shoulder,'min="0" max="10" step="1" inputmode="numeric"') : ''}
      </div>
      ${isRun(s.type) ? '<p><output id="running-speed"></output></p>' : ''}
      <div class="edit-fields bottom-space">${fieldText('discomfort','Smerter, stølhet eller annet ubehag',s.results.discomfort)}${fieldText('comment','Kommentar',s.results.comment)}</div>
      <div class="actions">
        <button class="button" value="done">Marker gjennomført</button>
        <button class="button secondary" value="partial">Delvis gjennomført</button>
        <button class="button secondary" value="save">Lagre registrering</button>
      </div>
    </form>
    <details><summary>Endre eller flytt økten</summary>
      <form id="edit-form" class="edit-fields">
        <label>Dato<input type="date" name="date" value="${s.date}" min="1900-01-01" max="2100-12-31" required></label>
        <label>Tittel<input name="title" value="${escape(s.title)}" maxlength="120" required></label>
        <label>Tidspunkt<input name="time" value="${escape(s.time)}" maxlength="50"></label>
        ${isRun(s.type) ? field('targetKm','Distansemål (km)',s.targetKm,'min="0" step="0.1" inputmode="decimal"') : ''}
        ${fieldText('description','Øktbeskrivelse',s.description)}
        <div class="actions"><button class="button">Lagre endringer</button></div>
      </form>
    </details>
    <div class="actions">
      ${origin.floorball ? `<button class="button secondary" type="button" data-swap>${s.type === 'floorball' ? 'Bytt tilbake til intervaller' : 'Bytt til innebandy'}</button>` : ''}
      ${['planned','moved'].includes(s.status) ? '<button class="button secondary danger" type="button" data-state="skipped">Hopp over økten</button>' :
      '<button class="button secondary" type="button" data-state="planned">Åpne økten igjen</button>'}
    </div>
    ${entry?.history.length ? `<details><summary>Endringshistorikk</summary><ul class="history">${[...entry.history].reverse().map(h => `
      <li>${h.action} · ${new Date(h.at).toLocaleDateString('nb-NO')}<br>Før: ${escape(h.before.title)} · ${shortDate(h.before.date)} · ${statuses[h.before.status]}
      ${h.before.results.distance == null ? '' : ' · ' + number(h.before.results.distance) + ' km'}
      ${h.before.results.minutes == null ? '' : ' · ' + clock(Math.round(h.before.results.minutes*60))}
      ${h.before.results.effort == null ? '' : ' · Anstrengelse ' + h.before.results.effort + '/10'}
      ${h.before.results.shoulder == null ? '' : ' · Skulder ' + h.before.results.shoulder + '/10'}
      ${h.before.results.discomfort ? '<br>' + escape(h.before.results.discomfort) : ''}
      ${h.before.results.comment ? '<br>' + escape(h.before.results.comment) : ''}
      ${historicalSets(h.before)}</li>`).join('')}</ul></details>` : ''}`;
  refreshSpeed();
  if (!dialog.open) dialog.showModal();
}
function historicalSets(s) {
  if (s.type !== 'strength' || !s.results.sets) return '';
  return Object.entries(s.results.sets).map(([id, sets]) => {
    const exercise = program.strength[s.program].find(e => e.id === id);
    const label = s.results.replacements?.[id] || exercise?.name || id;
    const values = sets.filter(set => set.weight != null || set.reps != null).map(set =>
      [set.warmup ? 'oppv.' : '', set.weight == null ? '' : number(set.weight) + ' kg', set.reps == null ? '' : set.reps + (exercise?.unit === 'sekunder' && !s.results.replacements?.[id] ? ' sek' : ' reps')].filter(Boolean).join(' '));
    return values.length ? '<br>' + escape(label) + ' · ' + values.join(' / ') : '';
  }).join('');
}
const val = (form, name) => form.elements.namedItem(name)?.value.trim() ?? '';
const num = (form, name) => val(form,name) === '' ? null : Number(val(form,name));
function duration(form) {
  const m = num(form,'minutes');
  const s = num(form,'seconds');
  return m == null && s == null ? null : (m ?? 0) + (s ?? 0) / 60;
}
function refreshSpeed() {
  const output = dialog.querySelector('#running-speed');
  if (!output) return;
  const form = dialog.querySelector('#result-form');
  const value = speed({distance:num(form,'distance'),minutes:duration(form)});
  output.value = value ? `Gjennomsnittshastighet ${number(value)} km/t` : '';
}
function collectResults(form) {
  const sets = {};
  const replacements = {};
  for (const card of form.querySelectorAll('[data-exercise]')) {
    const id = card.dataset.exercise;
    const replacement = card.querySelector('[name=replacement]').value.trim();
    if (replacement) Object.defineProperty(replacements, id, {value:replacement, enumerable:true});
    const values = [...card.querySelectorAll('[data-set]')].map(row => {
      const get = name => {
        const value = row.querySelector(`[name=${name}]`).value;
        return value === '' ? null : Number(value);
      };
      return {weight:get('weight'), reps:get('reps'), done:row.querySelector('[name=setDone]').checked,
        warmup:row.dataset.warmup === 'true'};
    });
    Object.defineProperty(sets, id, {value:values, enumerable:true});
  }
  return {distance:num(form,'distance'), minutes:duration(form), effort:num(form,'effort'), shoulder:num(form,'shoulder'),
    comment:val(form,'comment'), discomfort:val(form,'discomfort'), sets, replacements};
}
function closeSaved(s, next, action) {
  if (!updateSession(s,next,action)) return;
  if (s.date !== next.date) {
    chosen = next.date;
    month = chosen.slice(0,7);
  }
  dialog.close();
  render();
  flash(action === 'Endret' ? 'Endringene er lagret.' : action);
}
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const s = allSessions().find(item => item.id === dialog.dataset.id);
  if (!s) return;
  if (form.id === 'edit-form') {
    const date = val(form,'date');
    const title = val(form,'title');
    if (!validDate(date) || !title) return flash('Skriv inn en gyldig dato og tittel.');
    const moved = date !== s.date;
    const status = moved && ['planned','moved'].includes(s.status) ? 'moved' : s.status;
    const resultForm = dialog.querySelector('#result-form');
    if (!resultForm.reportValidity()) return;
    closeSaved(s,{...s,date,title,status,time:val(form,'time'),description:val(form,'description'),targetKm:num(form,'targetKm'),results:collectResults(resultForm)},
      moved ? 'Flyttet' : 'Endret');
  } else if (form.id === 'result-form') {
    const status = event.submitter?.value === 'done' ? 'done' : event.submitter?.value === 'partial' ? 'partial' : s.status;
    const action = event.submitter?.value === 'done' ? 'Gjennomført' : event.submitter?.value === 'partial' ? 'Delvis gjennomført' : 'Resultat lagret';
    closeSaved(s,{...s,status,results:collectResults(form),loggedAt:new Date().toISOString()},action);
  }
});
dialog.addEventListener('input', refreshSpeed);
dialog.addEventListener('close', () => clearInterval(timer));
dialog.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) return dialog.close();
  if (button.hasAttribute('data-jump-log')) return dialog.querySelector('#session-summary').focus();
  const s = allSessions().find(item => item.id === dialog.dataset.id);
  if (!s) return;
  const form = dialog.querySelector('#result-form');
  if (button.dataset.state) {
    if (!form.reportValidity()) return;
    const status = button.dataset.state === 'planned' && s.date !== (entries.get(s.id)?.origin.date ?? s.date) ? 'moved' : button.dataset.state;
    return closeSaved(s,{...s,status,results:collectResults(form)},status === 'skipped' ? 'Hoppet over' : 'Åpnet igjen');
  }
  if (button.hasAttribute('data-swap')) {
    if (!form.reportValidity()) return;
    const latestInterval = [...(entries.get(s.id)?.history ?? [])].reverse().find(h => h.before.type === 'interval')?.before;
    const results = collectResults(form);
    if (s.type === 'floorball' && latestInterval) {
      const before = {...s,results};
      return closeSaved(before,{...latestInterval,date:s.date,time:s.time,status:['planned','moved'].includes(latestInterval.status) && s.date !== (entries.get(s.id)?.origin.date ?? s.date) ? 'moved' : latestInterval.status},'Gjenopprettet intervall');
    }
    return closeSaved({...s,results},{...s,type:'floorball',title:'Innebandy',targetKm:null,
      description:'Innebandy erstatter denne intervalløkten.',status:s.date === (entries.get(s.id)?.origin.date ?? s.date) ? 'planned' : 'moved',results:{},loggedAt:null},'Byttet til innebandy');
  }
  const card = button.closest('[data-exercise]');
  if (!card) return;
  const e = program.strength[s.program].find(e => e.id === card.dataset.exercise);
  const sets = card.querySelector('.sets');
  if (button.hasAttribute('data-remove-set')) button.closest('[data-set]').remove();
  if (button.hasAttribute('data-add-set')) {
    const warmup = button.dataset.addSet === 'warmup';
    const fragment = document.createRange().createContextualFragment(setRow(e,{warmup},0,card.querySelector('[name=replacement]').value.trim()));
    const row = fragment.firstElementChild;
    const firstWorkSet = sets.querySelector('[data-warmup=false]');
    sets.insertBefore(fragment,warmup ? firstWorkSet : null);
    row.querySelector('input').focus();
  }
  sets.querySelectorAll('[data-warmup=false] > span').forEach((label,i) => { label.textContent = `Sett ${i+1}`; });
  if (button.dataset.rest) {
    clearInterval(timer);
    dialog.querySelectorAll('.rest-clock').forEach(output => { output.value = ''; });
    const output = card.querySelector('.rest-clock');
    const until = Date.now() + Number(button.dataset.rest)*1000;
    const tick = () => {
      const remaining = Math.max(0,Math.ceil((until-Date.now())/1000));
      output.value = remaining ? clock(remaining) : 'Pausen er ferdig';
      if (!remaining) {
        clearInterval(timer);
        navigator.vibrate?.(150);
      }
    };
    tick();
    timer = setInterval(tick, 250);
  }
});
dialog.addEventListener('input', event => {
  if (event.target.name !== 'replacement') return;
  const card = event.target.closest('[data-exercise]');
  const s = allSessions().find(item => item.id === dialog.dataset.id);
  const e = program.strength[s.program].find(e => e.id === card.dataset.exercise);
  const replacement = event.target.value.trim();
  for (const row of card.querySelectorAll('[data-set]')) {
    const weight = row.querySelector('[name=weight]');
    const reps = row.querySelector('[name=reps]');
    weight.previousSibling.textContent = e.per_dumbbell && !replacement ? 'Kg/stk' : 'Kg';
    reps.previousSibling.textContent = e.unit === 'sekunder' && !replacement ? 'Sek' : 'Reps';
  }
});

main.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.session) return openSession(button.dataset.session);
  if (button.dataset.date) {
    chosen = button.dataset.date;
    month = chosen.slice(0,7);
    render();
    main.querySelector(`[data-date="${chosen}"]`)?.focus();
  }
  if (button.dataset.mode) {
    calendarMode = button.dataset.mode;
    render();
    main.querySelector(`[data-mode="${calendarMode}"]`)?.focus();
  }
  if (button.dataset.month) {
    const count = Number(button.dataset.month);
    const bounds = [program.start, program.end, ...allSessions().map(s => s.date)].sort();
    const min = bounds[0];
    const max = bounds.at(-1);
    const target = calendarMode === 'week' ? shift(chosen, count*7) : moveMonth(month,count) + '-01';
    chosen = target < min ? min : target > max ? max : target;
    month = chosen.slice(0,7);
    render();
    main.querySelector(`[data-month="${count}"]:not(:disabled)`)?.focus();
  }
  if (button.hasAttribute('data-export')) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup(), null, 2)], {type:'application/json'}));
    const link = Object.assign(document.createElement('a'), {href:url, download:`birken-sikkerhetskopi-${today()}.json`});
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (button.hasAttribute('data-install') && installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    render();
  }
});
main.addEventListener('submit', event => {
  if (event.target.id !== 'weight-form') return;
  event.preventDefault();
  const date = val(event.target,'date');
  const kg = num(event.target,'kg');
  if (!validDate(date) || !Number.isFinite(kg) || kg <= 0) return flash('Skriv inn en gyldig dato og vekt.');
  const bodyWeights = [...weights.filter(w => w.date !== date), {date,kg}];
  if (persist(entries,false,bodyWeights)) {
    render();
    flash('Vekten er lagret.');
  }
});
main.addEventListener('change', async event => {
  const input = event.target;
  if (input.id !== 'backup-file' || !input.files[0]) return;
  try {
    const data = JSON.parse(await input.files[0].text());
    if (!validBackup(data)) throw new Error('Ugyldig sikkerhetskopi');
    if (entries.size || weights.length || !storageReadable) {
      if (!confirm('Erstatte treningsloggen og kroppsvektene på denne enheten med sikkerhetskopien?')) return;
    }
    if (persist(new Map(data.entries.map(e => [e.origin.id,e])), true, data.weights ?? [])) {
      flash('Sikkerhetskopien er importert.');
      render();
    }
  } catch {
    flash('Filen kunne ikke importeres. Velg en gyldig sikkerhetskopi fra Treningsloggen.');
  } finally {
    input.value = '';
  }
});
window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  render();
  window.scrollTo(0,0);
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (location.hash === '#innstillinger') render();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  if (location.hash === '#innstillinger') render();
});

async function loadJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Filen er utilgjengelig');
  return response.json();
}
async function start() {
  try {
    const [plan, library] = await Promise.all([loadJSON('./program.json'), loadJSON('./exercises.json')]);
    plan.strength = Object.fromEntries(['A','B'].map(key => [key,library[key].map(e => ({
      ...e, id:e.exercise_id, description:e.instructions, reps:`${e.rep_min}–${e.rep_max}`
    }))]));
    if (!validProgram(plan)) throw new Error('Ugyldig treningsprogram');
    program = plan;
    const now = today();
    chosen = now < plan.start ? plan.start : now > plan.end ? plan.end : now;
    month = chosen.slice(0,7);
    render();
    navigator.serviceWorker?.register('./sw.js').catch(console.warn);
  } catch (error) {
    console.error(error);
    main.innerHTML = heading('Kunne ikke åpne treningsprogrammet', 'Last inn siden på nytt for å prøve igjen.');
  }
}
start();
