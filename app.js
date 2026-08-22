const APP_VERSION = '1.1.0';
const LOCAL_KEY = 'matthew-verse-mapper-v1';
const CONNECTION_KEY = 'matthew-verse-mapper-supabase';
const LOCAL_BACKUP_PREFIX = 'matthew-verse-mapper-imported-backup';
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
  user: null,
  userId: null,
  mode: 'local',
  connectionUrl: '',
  connectionKey: '',
  authSubscription: null,
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
  accountBadge: $('#account-badge'), accountStatus: $('#account-status'), anonymousAccountActions: $('#anonymous-account-actions'),
  accountEmail: $('#account-email'), accountHelp: $('#account-help'), upgradeAccountButton: $('#upgrade-account-button'),
  signinLinkButton: $('#signin-link-button'), signedInAccount: $('#signed-in-account'), signedInEmail: $('#signed-in-email'),
  signoutButton: $('#signout-button'),
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

function isAnonymousUser(user = state.user) {
  return Boolean(user?.is_anonymous);
}

function savedGroupsBySentence() {
  const map = new Map();
  state.groups.forEach((group) => {
    (group.sentence_keys || []).forEach((id) => {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(group);
    });
  });
  return map;
}

function updateConnectionStatus() {
  if (state.mode !== 'supabase') {
    setSyncStatus('local', 'Local mode');
  } else if (isAnonymousUser()) {
    setSyncStatus('temporary', 'Device account');
  } else {
    setSyncStatus('online', 'Synced account');
  }
}

function renderAccountPanel() {
  const local = localSnapshot();
  const localCount = local.groups?.length || 0;
  const syncedCount = state.groups.length;
  const connected = state.mode === 'supabase' && state.supabase;
  const temporary = connected && isAnonymousUser();

  els.accountBadge.className = 'account-badge';
  els.anonymousAccountActions.hidden = !temporary;
  els.signedInAccount.hidden = !connected || temporary;

  if (!connected) {
    els.accountBadge.textContent = 'Not connected';
    els.accountStatus.textContent = localCount
      ? `${localCount} saved passage group${localCount === 1 ? ' is' : 's are'} only on this device. Connect Supabase above to move them into a shared account.`
      : 'Connect Supabase above to set up cross-device access.';
    return;
  }

  if (temporary) {
    els.accountBadge.classList.add('is-temporary');
    els.accountBadge.textContent = 'Device only';
    els.accountStatus.textContent = syncedCount
      ? `${syncedCount} passage group${syncedCount === 1 ? ' is' : 's are'} attached to this temporary device account. Add your email to keep them and use them everywhere.`
      : 'This is a temporary device account. If another device already has your categories, upgrade that device first, then return here and open the existing study.';
    els.upgradeAccountButton.textContent = syncedCount
      ? `Keep ${syncedCount} categor${syncedCount === 1 ? 'y' : 'ies'} from this device`
      : 'Create shared study from this device';
    els.accountHelp.textContent = syncedCount
      ? 'We will email a confirmation link. Opening it keeps this account and all of its categories.'
      : 'Use “Open my existing study” only after the device with your saved categories has been upgraded.';
    return;
  }

  els.accountBadge.classList.add('is-synced');
  els.accountBadge.textContent = 'Synced';
  els.accountStatus.textContent = `${syncedCount} passage group${syncedCount === 1 ? '' : 's'} will load on every device signed in with this email.`;
  els.signedInEmail.textContent = state.user?.email || 'Signed-in account';
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

function sameSentenceKeys(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = a.slice().sort(compareSentenceIds);
  const right = b.slice().sort(compareSentenceIds);
  return left.every((value, index) => value === right[index]);
}

async function importLocalRecords() {
  if (state.mode !== 'supabase' || !state.userId) return { groups: 0, columns: 0, cells: 0 };
  const local = localSnapshot();
  if (!(local.groups?.length || local.columns?.length || local.cells?.length)) return { groups: 0, columns: 0, cells: 0 };

  const [groupsResult, columnsResult, cellsResult] = await Promise.all([
    state.supabase.from('verse_groups').select('*').order('created_at', { ascending: true }),
    state.supabase.from('category_columns').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    state.supabase.from('group_category_cells').select('group_id,column_id'),
  ]);
  const readError = groupsResult.error || columnsResult.error || cellsResult.error;
  if (readError) throw readError;

  const remoteGroups = groupsResult.data || [];
  const remoteColumns = columnsResult.data || [];
  const remoteCells = new Set((cellsResult.data || []).map((cell) => `${cell.group_id}:${cell.column_id}`));
  const groupIdMap = new Map();
  const columnIdMap = new Map();
  let groupsImported = 0;
  let columnsImported = 0;
  let cellsImported = 0;

  for (const localGroup of local.groups || []) {
    let remoteGroup = remoteGroups.find((group) => group.name === localGroup.name && sameSentenceKeys(group.sentence_keys || [], localGroup.sentence_keys || []));
    if (!remoteGroup) {
      const result = await state.supabase.from('verse_groups').insert({
        user_id: state.userId,
        name: localGroup.name,
        reference_text: localGroup.reference_text || formatReferences(localGroup.sentence_keys || []),
        sentence_keys: localGroup.sentence_keys || [],
      }).select().single();
      if (result.error) throw result.error;
      remoteGroup = result.data;
      remoteGroups.push(remoteGroup);
      groupsImported += 1;
    }
    groupIdMap.set(String(localGroup.id), remoteGroup.id);
  }

  for (const localColumn of local.columns || []) {
    let remoteColumn = remoteColumns.find((column) => column.name === localColumn.name && Number(column.sort_order || 0) === Number(localColumn.sort_order || 0));
    if (!remoteColumn) {
      const result = await state.supabase.from('category_columns').insert({
        user_id: state.userId,
        name: localColumn.name,
        sort_order: Number(localColumn.sort_order || 0),
      }).select().single();
      if (result.error) throw result.error;
      remoteColumn = result.data;
      remoteColumns.push(remoteColumn);
      columnsImported += 1;
    }
    columnIdMap.set(String(localColumn.id), remoteColumn.id);
  }

  for (const localCell of local.cells || []) {
    const divider = String(localCell).indexOf(':');
    if (divider < 1) continue;
    const localGroupId = String(localCell).slice(0, divider);
    const localColumnId = String(localCell).slice(divider + 1);
    const groupId = groupIdMap.get(localGroupId);
    const columnId = columnIdMap.get(localColumnId);
    if (!groupId || !columnId || remoteCells.has(`${groupId}:${columnId}`)) continue;
    const result = await state.supabase.from('group_category_cells').insert({ group_id: groupId, column_id: columnId, user_id: state.userId });
    if (result.error) throw result.error;
    remoteCells.add(`${groupId}:${columnId}`);
    cellsImported += 1;
  }

  localStorage.setItem(`${LOCAL_BACKUP_PREFIX}-${Date.now()}`, JSON.stringify(local));
  localStorage.removeItem(LOCAL_KEY);
  return { groups: groupsImported, columns: columnsImported, cells: cellsImported };
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
  renderChapter();
  updateSelectionTray();
  renderAccountPanel();
}

async function connectSupabase(url, key, { silent = false } = {}) {
  if (!url || !key) return false;
  const normalizedUrl = url.trim().replace(/\/+$/, '');
  const normalizedKey = key.trim();
  setSyncStatus('loading', 'Connecting…');
  try {
    let client = state.supabase;
    if (!client || state.connectionUrl !== normalizedUrl || state.connectionKey !== normalizedKey) {
      state.authSubscription?.unsubscribe();
      const { createClient } = await import(SUPABASE_MODULE);
      client = createClient(normalizedUrl, normalizedKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
        state.user = session?.user || null;
        state.userId = session?.user?.id || null;
        updateConnectionStatus();
        renderAccountPanel();
        if (event !== 'INITIAL_SESSION' && session) {
          setTimeout(() => loadRecords().catch((error) => toast(error.message || 'Could not refresh synced data.', 'error')), 0);
        }
      });
      state.authSubscription = authListener.subscription;
      state.connectionUrl = normalizedUrl;
      state.connectionKey = normalizedKey;
    }
    let { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session) {
      const result = await client.auth.signInAnonymously();
      if (result.error) throw result.error;
      sessionData = { session: result.data.session, user: result.data.user };
    }
    state.supabase = client;
    state.user = sessionData.session?.user || sessionData.user || null;
    state.userId = state.user?.id || null;
    state.mode = 'supabase';
    localStorage.setItem(CONNECTION_KEY, JSON.stringify({ url: normalizedUrl, key: normalizedKey }));
    const imported = await importLocalRecords();
    await loadRecords();
    updateConnectionStatus();
    const importedTotal = imported.groups + imported.columns + imported.cells;
    if (importedTotal) toast(`Moved ${imported.groups} saved passage group${imported.groups === 1 ? '' : 's'} from this device into Supabase.`);
    else if (!silent) toast('Connected to Supabase.');
    return true;
  } catch (error) {
    state.supabase = null;
    state.user = null;
    state.userId = null;
    state.mode = 'local';
    state.connectionUrl = '';
    state.connectionKey = '';
    updateConnectionStatus();
    await loadRecords();
    if (!silent) toast(error.message || 'Could not connect to Supabase.', 'error');
    return false;
  }
}

function authRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function accountEmail() {
  const email = els.accountEmail.value.trim();
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address.');
  return email;
}

async function upgradeCurrentAccount() {
  if (!state.supabase || state.mode !== 'supabase') throw new Error('Connect Supabase first.');
  if (!isAnonymousUser()) throw new Error('This device is already using a synced account.');
  const imported = await importLocalRecords();
  if (imported.groups || imported.columns || imported.cells) await loadRecords();
  const email = accountEmail();
  const result = await state.supabase.auth.updateUser({ email }, { emailRedirectTo: authRedirectUrl() });
  if (result.error) throw result.error;
  toast('Confirmation sent. Open the email link to keep this study and enable cross-device sync.');
}

async function sendExistingStudyLink() {
  if (!state.supabase || state.mode !== 'supabase') throw new Error('Connect Supabase first.');
  const localCount = localSnapshot().groups?.length || 0;
  if (localCount) throw new Error('This device has unsynced categories. Use “Keep this device’s categories” first.');
  const email = accountEmail();
  const result = await state.supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl() },
  });
  if (result.error) throw result.error;
  toast('Sign-in link sent. Open it on this device to load your existing study.');
}

async function signOutAccount() {
  if (!state.supabase || !window.confirm('Sign out on this device? Your synced categories will remain in your account.')) return;
  const result = await state.supabase.auth.signOut();
  if (result.error) throw result.error;
  const anonymous = await state.supabase.auth.signInAnonymously();
  if (anonymous.error) throw anonymous.error;
  state.user = anonymous.data.user;
  state.userId = anonymous.data.user?.id || null;
  state.mode = 'supabase';
  await loadRecords();
  updateConnectionStatus();
  toast('Signed out. This device is now using a temporary account.');
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
  const savedMap = savedGroupsBySentence();
  els.chapterNumber.textContent = state.chapter;
  els.chapterSelect.value = state.chapter;
  $$('.chapter-chip').forEach((button) => button.classList.toggle('is-active', Number(button.dataset.chapter) === state.chapter));
  els.previousChapter.disabled = state.chapter === 1;
  els.nextChapter.disabled = state.chapter === 28;
  els.sentenceList.replaceChildren();
  chapter.verses.forEach((verse) => {
    verse.sentences.forEach((sentence) => {
      const savedGroups = savedMap.get(sentence.id) || [];
      const selected = state.selected.has(sentence.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sentence-block${savedGroups.length ? ' is-saved' : ''}${selected ? ' is-selected' : ''}`;
      button.dataset.sentenceId = sentence.id;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      if (savedGroups.length) button.title = `Saved in: ${savedGroups.map((group) => group.name).join(', ')}`;
      const ref = document.createElement('span');
      ref.className = 'sentence-reference';
      ref.textContent = `${sentence.chapter}:${sentence.verse}${verse.sentences.length > 1 ? ` · ${sentence.sentence}` : ''}`;
      const content = document.createElement('span');
      content.className = 'sentence-content';
      const text = document.createElement('span');
      text.className = 'sentence-text';
      text.textContent = sentence.text;
      content.append(text);
      if (savedGroups.length) {
        const savedList = document.createElement('span');
        savedList.className = 'saved-group-list';
        const savedLabel = document.createElement('span');
        savedLabel.className = 'saved-label';
        savedLabel.textContent = 'Saved in';
        savedList.append(savedLabel);
        savedGroups.forEach((group) => {
          const chip = document.createElement('span');
          chip.className = 'saved-group-chip';
          chip.textContent = group.name;
          savedList.append(chip);
        });
        content.append(savedList);
      }
      const check = document.createElement('span');
      check.className = 'selection-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');
      button.append(ref, content, check);
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
  renderAccountPanel();
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
  renderChapter();
  renderAccountPanel();
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
  els.settingsButton.addEventListener('click', () => { renderAccountPanel(); els.settingsDialog.showModal(); });
  els.settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const connected = await connectSupabase(els.supabaseUrl.value, els.supabaseKey.value);
    if (connected && !isAnonymousUser()) els.settingsDialog.close();
    else if (connected) setTimeout(() => els.accountEmail.focus(), 50);
  });
  els.upgradeAccountButton.addEventListener('click', async () => {
    try {
      els.upgradeAccountButton.disabled = true;
      await upgradeCurrentAccount();
    } catch (error) {
      toast(error.message || 'Could not create the shared account.', 'error');
    } finally {
      els.upgradeAccountButton.disabled = false;
    }
  });
  els.signinLinkButton.addEventListener('click', async () => {
    try {
      els.signinLinkButton.disabled = true;
      await sendExistingStudyLink();
    } catch (error) {
      toast(error.message || 'Could not send the sign-in link.', 'error');
    } finally {
      els.signinLinkButton.disabled = false;
    }
  });
  els.signoutButton.addEventListener('click', async () => {
    try { await signOutAccount(); } catch (error) { toast(error.message || 'Could not sign out.', 'error'); }
  });
  els.disconnectButton.addEventListener('click', async () => {
    localStorage.removeItem(CONNECTION_KEY);
    state.authSubscription?.unsubscribe();
    state.authSubscription = null;
    state.supabase = null; state.user = null; state.userId = null; state.mode = 'local';
    state.connectionUrl = ''; state.connectionKey = '';
    updateConnectionStatus();
    await loadRecords();
    els.settingsDialog.close();
    toast('Using local browser storage.');
  });
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  window.addEventListener('focus', () => {
    if (state.mode === 'supabase') loadRecords().catch((error) => toast(error.message || 'Could not refresh synced data.', 'error'));
  });
}

async function init() {
  renderChapterControls();
  renderChapter();
  updateSelectionTray();
  renderAccountPanel();
  bindEvents();
  await initializeConnection();
  const requestedView = location.hash.replace('#', '');
  if (requestedView === 'matrix') setView('matrix');
  console.info(`Matthew Verse Mapper v${APP_VERSION}: ${scripture.chapterCount} chapters, ${scripture.verseCount} supplied verses, ${scripture.sentenceCount} sentence blocks.`);
}

init().catch((error) => { console.error(error); toast(error.message || 'The app could not start.', 'error'); });
