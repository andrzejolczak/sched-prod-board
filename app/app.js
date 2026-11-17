import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const panelSlot = document.querySelector('.panel-slot');

const acked = new Map(); // incident id -> { id, ackedAt, receipt }
const pending = new Set(); // incident ids with an ack in flight
const failed = new Map(); // incident id -> last ack error
const rows = new Map(); // incident id -> its <li>, kept for the life of the page
let incidents = null; // null until the first answer (R3)
let selected = null; // id of the incident the panel shows

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// R5: the viewer's own zone and their locale's own order (dd/mm for EU locales, mm/dd for en-US).
const timeFormat = new Intl.DateTimeFormat(navigator.languages?.length ? [...navigator.languages] : undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFormat.format(d);
}

function rowInner(i) {
  return `<span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        ${acked.has(i.id) ? '<span data-testid="acked" class="acked">acked</span>' : '<span class="open-hint" aria-hidden="true">›</span>'}`;
}

// The list is updated in place: a row is created once and never rebuilt, so what is under the
// pointer changes only when a new incident really arrives (R1), not on every refresh.
function renderList() {
  if (incidents === null) return; // still loading: the loader stays
  board.querySelector('[data-testid="loader"]')?.remove();
  let empty = board.querySelector('[data-testid="empty"]');
  if (incidents.length === 0) {
    if (!empty) {
      empty = document.createElement('p');
      empty.dataset.testid = 'empty';
      empty.className = 'empty';
      empty.textContent = 'No incidents tonight.';
      list.before(empty);
    }
  } else {
    empty?.remove();
  }
  // R1: newest first, whatever order the answer came in.
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const current = new Set(sorted.map((i) => i.id));
  for (const [id, li] of rows) {
    if (!current.has(id)) {
      li.remove();
      rows.delete(id);
    }
  }
  let at = list.firstElementChild;
  for (const i of sorted) {
    let li = rows.get(i.id);
    if (!li) {
      li = document.createElement('li');
      li.dataset.testid = 'incident-row';
      li.dataset.id = i.id;
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      rows.set(i.id, li);
    }
    const state = `${i.severity}|${i.service}|${i.region}|${i.summary}|${i.openedAt}|${acked.has(i.id)}`;
    if (li.dataset.state !== state) {
      li.dataset.state = state;
      li.innerHTML = rowInner(i);
    }
    li.className = `row ${i.severity}${acked.has(i.id) ? ' is-acked' : ''}${selected === i.id ? ' is-selected' : ''}`;
    li.setAttribute('aria-label', `Open ${i.id}`);
    li.setAttribute('aria-expanded', String(selected === i.id));
    if (li !== at) list.insertBefore(li, at);
    else at = at.nextElementSibling;
  }
}

// The incident panel (product's decision): Ack lives here, on a panel that names its incident and
// does not move when the list does.
function renderPanel() {
  const i = selected && incidents?.find((x) => x.id === selected);
  if (!i) {
    panelSlot.innerHTML = '';
    return;
  }
  const done = acked.get(i.id);
  const error = failed.get(i.id);
  panelSlot.innerHTML = `<aside data-testid="incident-panel" data-id="${esc(i.id)}" class="panel ${esc(i.severity)}" aria-label="Incident ${esc(i.id)}">
        <button type="button" class="panel-close" aria-label="Close panel">×</button>
        <h2 class="panel-id">${esc(i.id)}</h2>
        <p class="panel-summary">${esc(i.summary)}</p>
        <dl>
          <dt>Severity</dt><dd class="sev">${esc(i.severity)}</dd>
          <dt>Service</dt><dd>${esc(i.service)}</dd>
          <dt>Region</dt><dd>${esc(i.region)}</dd>
          <dt>Opened</dt><dd><time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time></dd>
        </dl>
        ${
          done
            ? `<p class="panel-acked">acked · <time datetime="${esc(done.ackedAt)}">${esc(localTime(done.ackedAt))}</time></p>`
            : `<button type="button" data-testid="panel-ack" class="panel-ack"${pending.has(i.id) ? ' disabled' : ''}>Ack ${esc(i.id)}</button>`
        }
        ${error ? `<p class="panel-error" role="alert">Ack failed. Try again.</p>` : ''}
      </aside>`;
}

function select(id) {
  selected = id;
  renderList();
  renderPanel();
}

function openFromEvent(event) {
  const row = event.target.closest('[data-testid="incident-row"]');
  if (row) select(row.dataset.id);
}
list.addEventListener('click', openFromEvent);
list.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openFromEvent(event);
});

// R2: Ack acts on the incident the panel names, never on a row position.
panelSlot.addEventListener('click', async (event) => {
  if (event.target.closest('.panel-close')) return select(null);
  if (!event.target.closest('[data-testid="panel-ack"]')) return;
  const id = panelSlot.querySelector('[data-testid="incident-panel"]')?.dataset.id;
  if (!id || acked.has(id) || pending.has(id)) return;
  pending.add(id);
  failed.delete(id);
  renderPanel();
  try {
    acked.set(id, await ack(id));
  } catch (error) {
    console.error(error);
    failed.set(id, error);
  } finally {
    pending.delete(id);
    renderList();
    renderPanel();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selected) select(null);
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    incidents = page.incidents ?? [];
    renderList();
    if (selected && !incidents.some((i) => i.id === selected)) select(null);
  } catch (error) {
    console.error(error); // keep what is on screen; the next tick retries
  }
}

async function loop() {
  await refresh();
  setTimeout(loop, REFRESH_MS);
}
loop();
