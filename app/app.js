import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');

const acked = new Map(); // incident id -> { id, ackedAt, receipt }
const pending = new Set(); // incident ids with an ack in flight
let incidents = null; // null until the first answer (R3)

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

function rowHtml(i) {
  const done = acked.get(i.id);
  const action = done
    ? `<span data-testid="acked" class="acked" title="${esc(done.ackedAt)}">acked</span>`
    : `<button type="button" data-testid="ack" class="ack"${pending.has(i.id) ? ' disabled' : ''}>Ack</button>`;
  return `<li data-testid="incident-row" data-id="${esc(i.id)}" class="row ${esc(i.severity)}${done ? ' is-acked' : ''}">
        <span class="id">${esc(i.id)}</span>
        <span class="sev">${esc(i.severity)}</span>
        <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
        <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
        ${action}
      </li>`;
}

function render() {
  if (incidents === null) return; // still loading: the loader stays
  board.querySelector('[data-testid="loader"]')?.remove();
  let empty = board.querySelector('[data-testid="empty"]');
  if (incidents.length === 0) {
    if (!empty) {
      empty = document.createElement('p');
      empty.dataset.testid = 'empty';
      empty.className = 'empty';
      empty.textContent = 'No incidents tonight.';
      board.insertBefore(empty, list);
    }
  } else {
    empty?.remove();
  }
  // R1: newest first, whatever order the answer came in.
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  list.innerHTML = sorted.map(rowHtml).join('');
}

// R2: Ack acts on the row that was clicked.
list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  const id = button.closest('[data-testid="incident-row"]')?.dataset.id;
  if (!id || acked.has(id) || pending.has(id)) return;
  pending.add(id);
  render();
  try {
    acked.set(id, await ack(id));
  } catch (error) {
    console.error(error);
  } finally {
    pending.delete(id);
    render();
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    incidents = page.incidents ?? [];
    render();
  } catch (error) {
    console.error(error); // keep what is on screen; the next tick retries
  }
}

async function loop() {
  await refresh();
  setTimeout(loop, REFRESH_MS);
}
loop();
