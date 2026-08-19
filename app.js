const APP_VERSION = '1.0.3';
const LOCAL_KEY = 'matthew-verse-mapper-v1';
const CONNECTION_KEY = 'matthew-verse-mapper-supabase';
const SUPABASE_MODULE = 'https://esm.sh/@supabase/supabase-js@2.102.0';
const scripture = window.MATTHEW_DATA;

if (!scripture?.chapters?.length) throw new Error('Matthew data failed to load.');

const allSentences = scripture.chapters.flatMap((chapter) => chapter.verses.flatMap((verse) => verse.sentences));
const sentenceById = new Map(allSentences.map((sentence) => [sentence.id, sentence]));
const sentenceOrder = new Map(allSentences.map((sentence, index) => [sentence.id, index]));

const state = {
  chapter: 1,
  view: 'scripture',
  selected: new Set(),
  expanded: new Set(),
  groups: [],
  columns: [],
  cells: new Set(),
  supabase: null,
  userId: null,
  mode: 'local',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  chapterSelect: $('#chapter-select'), chapterList: $('#chapter-list'), chapterNumber: $('#chapter-number'),
  sentenceList: $('#sentence-list'), previousChapter: $('#previous-chapter'), nextChapter: $('#next-chapter'),
  selectionTray: $('#selection-tray'), selectionCount: $('#selection-count'), selectionReference: $('#selection-reference'),
  clearSelection: $('#clear-selection'), createGroupButton: $('#create-group-button'), groupCountBadge: $('#group-count-badge'),
  matrixHeadRow: $('#matrix-head-row'), matrixBody: $('#matrix-body'), matrixWrap: $('#matrix-wrap'), matrixEmpty: $('#matrix-empty'),
  addColumnButton: $('#add-column-button'), groupDialog: $('#group-dialog'), groupForm: $('#group-form'), groupName: $('#group-name'),
  groupDialogReference: $('#group-dialog-reference'), columnDialog: $('#column-dialog'), columnForm: $('#column-form'),
  columnName: $('#column-name'), settingsDialog: $('#settings-dialog'), settingsForm: $('#settings-form'),
  settingsButton: $('#settings-button'), supabaseUrl: $('#supabase-url'), supabaseKey: $('#supabase-key'),
  disconnectButton: $('#disconnect-button'), syncStatus: $('#sync-status'), toastRegion: $('#toast-region'),
};

function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function escapeSelector(value) {
  return window.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast${type === 'error' ? ' is-error' : ''}`;
  item.textContent = message;
  els.toastRegion.append(item);
  setTimeout(() => item.remove(), 3600);
}

function setSyncStatus(mode, label) {
  els.syncStatus.dataset.state = mode;
  els.syncStatus.querySelector('span').textContent = label;
}

function compareSentenceIds(a, b) {
  return (sentenceOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (sentenceOrder.get(b) ?? Number.MAX_SAFE_INTEGER);
}

function selectedSentenceIds() {
  return [...state.selected].sort(compareSentenceIds);
}

function formatReferences(ids) {
  const refs = ids.map((id) => sentenceById.get(id)).filter(Boolean)
    .map(({ chapter, verse }) => ({ chapter, verse }))
    .filter((ref, index, list) => !index || ref.chapter !== list[index - 1].chapter || ref.verse !== list[index - 1].verse);
  if (!refs.length) return 'No passage selected';
  const chunks = [];
  let start = refs[0];
  let end = refs[0];
  for (let i = 1; i <= refs.length; i += 1) {
    const next = refs[i];
    if (next && next.chapter === end.chapter && next.verse === end.verse + 1) {
      end = next;
      continue;
    }
    chunks.push(start.chapter === end.chapter
      ? `Matthew ${start.chapter}:${start.verse}${start.verse === end.verse ? '' : `–${end.verse}`}`
      : `Matthew ${start.chapter}:${start.verse}–${end.chapter}:${end.verse}`);
    start = next;
    end = next;
  }
  return chunks.join('; ');
}

function localSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { groups: [], columns: [], cells: [] };
  } catch {
    return { groups: [], columns: [], cells: [] };
  }
}

function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ groups: state.groups, columns: state.columns, cells: [...state.cells] }));
}

async function loadRecords() {
  if (state.mode === 'supabase') {
    const [groupsResult, columnsResult, cellsResult] = await Promise.all([
      state.supabase.from('verse_groups').select('*').order('created_at', { ascending: true }),
      state.supabase.from('category_columns').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      state.supabase.from('group_category_cells').select('group_id,column_id'),
    ]);
    const error = groupsResult.error || columnsResult.error || cellsResult.error;
    if (error) throw error;
    state.groups = groupsResult.data || [];
    state.columns = columnsResult.data || [];
    state.cells = new Set((cellsResult.data || []).map((cell) => `${cell.group_id}:${cell.column_id}`));
  } else {
    const saved = localSnapshot();
    state.groups = saved.groups || [];
    state.columns = saved.columns || [];
    state.cells = new Set(saved.cells || []);
  }
  renderMatrix();
}

async function connectSupabase(url, key, { silent = false } = {}) {
  if (!url || !key) return false;
  setSyncStatus('loading', 'Connecting…');
  try {
    const { createClient } = await import(SUPABASE_MODULE);
    const client = createClient(url.trim(), key.trim(), { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    let { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      const result = await client.auth.signInAnonymously();
      if (result.error) throw result.error;
      sessionData = result.data;
    }
    state.supabase = client;
    state.userId = sessionData.session?.user?.id || sessionData.user?.id;
    state.mode = 'supabase';
    localStorage.setItem(CONNECTION_KEY, JSON.stringify({ url: url.trim(), key: key.trim() }));
    await loadRecords();
    setSyncStatus('online', 'Supabase saved');
    if (!silent) toast('Connected to Supabase.');
    return true;
  } catch (error) {
    state.supabase = null;
    state.userId = null;
    state.mode = 'local';
    setSyncStatus('local', 'Local mode');
    await loadRecords();
    if (!silent) toast(error.message || 'Could not connect to Supabase.', 'error');
    return false;
  }
}

async function initializeConnection() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(CONNECTION_KEY)) || {}; } catch { stored = {}; }
  const config = window.MATTHEW_CONFIG || {};
  const url = config.supabaseUrl || stored.url || '';
  const key = config.supabasePublishableKey || stored.key || '';
  els.supabaseUrl.value = url;
  els.supabaseKey.value = key;
  if (url && key) await connectSupabase(url, key, { silent: true });
  else await loadRecords();
}

function renderChapterControls() {
  els.chapterSelect.replaceChildren();
  els.chapterList.replaceChildren();
  for (let chapter = 1; chapter <= 28; chapter += 1) {
    const option = document.createElement('option');
    option.value = chapter;
    option.textContent = `Matthew ${chapter}`;
    els.chapterSelect.append(option);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chapter-chip${chapter === state.chapter ? ' is-active' : ''}`;
    button.textContent = chapter;
    button.dataset.chapter = chapter;
    button.setAttribute('aria-label', `Matthew chapter ${chapter}`);
    els.chapterList.append(button);
  }
  els.chapterSelect.value = state.chapter;
}

function renderChapter() {
  const chapter = scripture.chapters.find((item) => item.chapter === state.chapter);
  els.chapterNumber.textContent = state.chapter;
  els.chapterSelect.value = state.chapter;
  $$('.chapter-chip').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.chapter) === state.chapter));
  els.previousChapter.disabled = state.chapter === 1;
  els.nextChapter.disabled = state.chapter === 28;
  els.sentenceList.replaceChildren();
  chapter.verses.forEach((verse) => {
    verse.sentences.forEach((sentence) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sentence-block${state.selected.has(sentence.id) ? ' is-selected' : ''}`;
      button.dataset.sentenceId = sentence.id;
      button.setAttribute('aria-pressed', state.selected.has(sentence.id) ? 'true' : 'false');
      const ref = document.createElement('span');
      ref.className = 'sentence-reference';
      ref.textContent = `${sentence.chapter}:${sentence.verse}${verse.sentences.length > 1 ? ` · ${sentence.sentence}` : ''}`;
      const text = document.createElement('span');
      text.className = 'sentence-text';
      text.textContent = sentence.text;
      const check = document.createElement('span');
      check.className = 'selection-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      button.append(ref, text, check);
      els.sentenceList.append(button);
    });
  });
}

function updateSelectionTray() {
  const ids = selectedSentenceIds();
  els.selectionTray.hidden = ids.length === 0;
  els.selectionCount.textContent = `${ids.length} sentence${ids.length === 1 ? '' : 's'} selected`;
  els.selectionReference.textContent = formatReferences(ids);
}

function setView(view) {
  state.view = view;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.id === `${view}-view`));
  $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.view === view));
  if (view === 'matrix') renderMatrix();
  window.location.hash = view;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function makePassageDetail(group) {
  const detail = document.createElement('div');
  detail.className = 'passage-detail';
  detail.hidden = !state.expanded.has(String(group.id));
  (group.sentence_keys || []).slice().sort(compareSentenceIds).forEach((id) => {
    const sentence = sentenceById.get(id);
    if (!sentence) return;
    const p = document.createElement('p');
    const ref = document.createElement('span');
    ref.textContent = `${sentence.chapter}:${sentence.verse}`;
    p.append(ref, document.createTextNode(sentence.text));
    detail.append(p);
  });
  return detail;
}

function renderMatrix() {
  els.groupCountBadge.textContent = state.groups.length;
  els.matrixHeadRow.replaceChildren();
  const passageHeader = document.createElement('th');
  passageHeader.className = 'passage-column';
  passageHeader.textContent = 'Passage group';
  els.matrixHeadRow.append(passageHeader);
  state.columns.forEach((column) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = column.name;
    els.matrixHeadRow.append(th);
  });
  els.matrixBody.replaceChildren();
  state.groups.forEach((group) => {
    const row = document.createElement('tr');
    const passageCell = document.createElement('td');
    const summary = document.createElement('div');
    const expanded = state.expanded.has(String(group.id));
    summary.className = 'passage-summary';
    summary.dataset.groupId = group.id;
    summary.setAttribute('role', 'button');
    summary.setAttribute('tabindex', '0');
    summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const expand = document.createElement('span');
    expand.className = 'expand-icon';
    expand.textContent = '›';
    const labels = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'passage-name';
    name.textContent = group.name;
    const ref = document.createElement('div');
    ref.className = 'passage-ref';
    ref.textContent = group.reference_text || formatReferences(group.sentence_keys || []);
    labels.append(name, ref);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-group';
    remove.dataset.deleteGroup = group.id;
    remove.setAttribute('aria-label', `Delete ${group.name}`);
    remove.title = 'Delete passage group';
    remove.textContent = '×';
    summary.append(expand, labels, remove);
    passageCell.append(summary, makePassageDetail(group));
    row.append(passageCell);
    state.columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.className = 'matrix-cell';
      const key = `${group.id}:${column.id}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `cell-toggle${state.cells.has(key) ? ' is-on' : ''}`;
      toggle.dataset.groupId = group.id;
      toggle.dataset.columnId = column.id;
      toggle.setAttribute('aria-pressed', state.cells.has(key) ? 'true' : 'false');
      toggle.setAttribute('aria-label', `${state.cells.has(key) ? 'Remove' : 'Add'} ${group.name} ${state.cells.has(key) ? 'from' : 'to'} ${column.name}`);
      toggle.textContent = '✓';
      cell.append(toggle);
      row.append(cell);
    });
    els.matrixBody.append(row);
  });
  const empty = state.groups.length === 0;
  els.matrixEmpty.hidden = !empty;
  els.matrixWrap.hidden = empty;
}

async function createGroup(name) {
  const ids = selectedSentenceIds();
  const reference = formatReferences(ids);
  let group;
  if (state.mode === 'supabase') {
    const result = await state.supabase.from('verse_groups').insert({ user_id: state.userId, name, reference_text: reference, sentence_keys: ids }).select().single();
    if (result.error) throw result.error;
    group = result.data;
  } else {
    group = { id: localId(), user_id: 'local', name, reference_text: reference, sentence_keys: ids, created_at: new Date().toISOString() };
    state.groups.push(group);
    saveLocal();
  }
  if (state.mode === 'supabase') state.groups.push(group);
  state.selected.clear();
  renderChapter();
  updateSelectionTray();
  renderMatrix();
  toast(`Saved “${name}”.`);
}

async function createColumn(name) {
  let column;
  if (state.mode === 'supabase') {
    const result = await state.supabase.from('category_columns').insert({ user_id: state.userId, name, sort_order: state.columns.length }).select().single();
    if (result.error) throw result.error;
    column = result.data;
  } else {
    column = { id: localId(), user_id: 'local', name, sort_order: state.columns.length, created_at: new Date().toISOString() };
    state.columns.push(column);
    saveLocal();
  }
  if (state.mode === 'supabase') state.columns.push(column);
  renderMatrix();
  toast(`Added “${name}” column.`);
}

async function toggleCell(groupId, columnId) {
  const key = `${groupId}:${columnId}`;
  const wasOn = state.cells.has(key);
  if (state.mode === 'supabase') {
    const query = wasOn
      ? state.supabase.from('group_category_cells').delete().eq('group_id', groupId).eq('column_id', columnId)
      : state.supabase.from('group_category_cells').insert({ group_id: groupId, column_id: columnId, user_id: state.userId });
    const result = await query;
    if (result.error) throw result.error;
  }
  if (wasOn) state.cells.delete(key); else state.cells.add(key);
  if (state.mode === 'local') saveLocal();
  renderMatrix();
}

async function deleteGroup(groupId) {
  const group = state.groups.find((item) => String(item.id) === String(groupId));
  if (!group || !window.confirm(`Delete the passage group “${group.name}”?`)) return;
  if (state.mode === 'supabase') {
    const result = await state.supabase.from('verse_groups').delete().eq('id', groupId);
    if (result.error) throw result.error;
  }
  state.groups = state.groups.filter((item) => String(item.id) !== String(groupId));
  state.cells = new Set([...state.cells].filter((key) => !key.startsWith(`${groupId}:`)));
  state.expanded.delete(String(groupId));
  if (state.mode === 'local') saveLocal();
  renderMatrix();
  toast('Passage group deleted.');
}

function bindEvents() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
  $$('[data-go-scripture]').forEach((button) => button.addEventListener('click', () => setView('scripture')));
  els.chapterSelect.addEventListener('change', () => { state.chapter = Number(els.chapterSelect.value); renderChapter(); });
  els.chapterList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-chapter]');
    if (!button) return;
    state.chapter = Number(button.dataset.chapter);
    renderChapter();
  });
  els.previousChapter.addEventListener('click', () => { if (state.chapter > 1) { state.chapter -= 1; renderChapter(); } });
  els.nextChapter.addEventListener('click', () => { if (state.chapter < 28) { state.chapter += 1; renderChapter(); } });
  els.sentenceList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sentence-id]');
    if (!button) return;
    const id = button.dataset.sentenceId;
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    button.classList.toggle('is-selected', state.selected.has(id));
    button.setAttribute('aria-pressed', state.selected.has(id) ? 'true' : 'false');
    updateSelectionTray();
  });
  els.clearSelection.addEventListener('click', () => { state.selected.clear(); renderChapter(); updateSelectionTray(); });
  els.createGroupButton.addEventListener('click', () => {
    els.groupDialogReference.textContent = formatReferences(selectedSentenceIds());
    els.groupName.value = '';
    els.groupDialog.showModal();
    setTimeout(() => els.groupName.focus(), 50);
  });
  els.groupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = els.groupName.value.trim();
    if (!name) return;
    try { await createGroup(name); els.groupDialog.close(); } catch (error) { toast(error.message || 'Could not save the group.', 'error'); }
  });
  els.addColumnButton.addEventListener('click', () => { els.columnName.value = ''; els.columnDialog.showModal(); setTimeout(() => els.columnName.focus(), 50); });
  els.columnForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = els.columnName.value.trim();
    if (!name) return;
    try { await createColumn(name); els.columnDialog.close(); } catch (error) { toast(error.message || 'Could not add the column.', 'error'); }
  });
  els.matrixBody.addEventListener('click', async (event) => {
    const remove = event.target.closest('[data-delete-group]');
    if (remove) { event.stopPropagation(); await deleteGroup(remove.dataset.deleteGroup); return; }
    const toggle = event.target.closest('.cell-toggle');
    if (toggle) {
      try { await toggleCell(toggle.dataset.groupId, toggle.dataset.columnId); } catch (error) { toast(error.message || 'Could not update the cell.', 'error'); }
      return;
    }
    const summary = event.target.closest('.passage-summary');
    if (summary) {
      const id = String(summary.dataset.groupId);
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      renderMatrix();
    }
  });
  els.matrixBody.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.passage-summary')) { event.preventDefault(); event.target.click(); }
  });
  els.settingsButton.addEventListener('click', () => els.settingsDialog.showModal());
  els.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const connected = await connectSupabase(els.supabaseUrl.value, els.supabaseKey.value);
    if (connected) els.settingsDialog.close();
  });
  els.disconnectButton.addEventListener('click', async () => {
    localStorage.removeItem(CONNECTION_KEY);
    state.supabase = null; state.userId = null; state.mode = 'local';
    setSyncStatus('local', 'Local mode');
    await loadRecords();
    els.settingsDialog.close();
    toast('Using local browser storage.');
  });
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
}

async function init() {
  renderChapterControls();
  renderChapter();
  updateSelectionTray();
  bindEvents();
  await initializeConnection();
  const requestedView = location.hash.replace('#', '');
  if (requestedView === 'matrix') setView('matrix');
  console.info(`Matthew Verse Mapper v${APP_VERSION}: ${scripture.chapterCount} chapters, ${scripture.verseCount} supplied verses, ${scripture.sentenceCount} sentence blocks.`);
}

init().catch((error) => { console.error(error); toast(error.message || 'The app could not start.', 'error'); });
