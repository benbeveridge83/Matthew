const LOCAL_KEY = 'matthew-verse-mapper-v1';
const CONNECTION_KEY = 'matthew-verse-mapper-supabase';
const SUPABASE_MODULE = 'https://esm.sh/@supabase/supabase-js@2.102.0';
const ENHANCEMENT_VERSION = '1.3.2';

const scripture = window.MATTHEW_DATA;
const allSentences = scripture?.chapters?.flatMap((chapter) => chapter.verses.flatMap((verse) => verse.sentences)) || [];
const sentenceById = new Map(allSentences.map((sentence) => [String(sentence.id), sentence]));
const sentenceOrder = new Map(allSentences.map((sentence, index) => [String(sentence.id), index]));
const expandedGroupIds = new Set();
let groupsCache = [];
let refreshPromise = null;

function compareSentenceIds(a, b) {
  return (sentenceOrder.get(String(a)) ?? Number.MAX_SAFE_INTEGER) - (sentenceOrder.get(String(b)) ?? Number.MAX_SAFE_INTEGER);
}

function localGroups() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
    return saved.groups || [];
  } catch {
    return [];
  }
}

async function syncedGroups() {
  let connection = {};
  try { connection = JSON.parse(localStorage.getItem(CONNECTION_KEY)) || {}; } catch { connection = {}; }
  if (!connection.url || !connection.key) return null;
  try {
    const { createClient } = await import(SUPABASE_MODULE);
    const client = createClient(connection.url, connection.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData?.session) return null;
    const { data, error } = await client.from('verse_groups').select('*').order('created_at', { ascending: true });
    if (error) return null;
    return data || [];
  } catch {
    return null;
  }
}

async function refreshGroups() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const remote = await syncedGroups();
    groupsCache = remote ?? localGroups();
    return groupsCache;
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}

function groupById(groupId) {
  return groupsCache.find((group) => String(group.id) === String(groupId));
}

function childrenFor(groupId) {
  return groupsCache.filter((group) => String(group.parent_group_id || '') === String(groupId));
}

function escapeId(value) {
  return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function summaryFor(groupId) {
  return document.querySelector(`#matrix-body [data-open-group="${escapeId(groupId)}"]`);
}

function detailRowFor(groupId) {
  const wanted = String(groupId);
  return [...document.querySelectorAll('#matrix-body tr[data-expanded-detail-for]')]
    .find((row) => row.dataset.expandedDetailFor === wanted) || null;
}

function setArrowState(groupId, expanded) {
  const summary = summaryFor(groupId);
  const arrow = summary?.querySelector('.open-icon');
  if (!arrow) return;
  arrow.textContent = expanded ? '▾' : '›';
  arrow.setAttribute('role', 'button');
  arrow.setAttribute('tabindex', '0');
  arrow.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  arrow.setAttribute('aria-label', expanded ? 'Hide passage sentences' : 'Show passage sentences');
  arrow.title = expanded ? 'Hide sentences' : 'Show sentences';
}

function makeActionButton(label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button matrix-detail-action';
  button.textContent = label;
  button.dataset.matrixDetailAction = action;
  button.disabled = disabled;
  return button;
}

function makeDetail(group) {
  const detail = document.createElement('div');
  detail.className = 'passage-detail matrix-expanded-passage-detail';

  const heading = document.createElement('div');
  heading.className = 'matrix-expanded-heading';
  const title = document.createElement('strong');
  title.textContent = 'Sentences in this passage group';
  const count = document.createElement('span');
  const ids = (group.sentence_keys || []).slice().sort(compareSentenceIds);
  count.textContent = `${ids.length} sentence${ids.length === 1 ? '' : 's'}`;
  heading.append(title, count);
  detail.append(heading);

  const sentences = document.createElement('div');
  sentences.className = 'matrix-expanded-sentences';
  ids.forEach((id) => {
    const sentence = sentenceById.get(String(id));
    if (!sentence) return;
    const p = document.createElement('p');
    const ref = document.createElement('span');
    ref.textContent = `${sentence.chapter}:${sentence.verse}`;
    p.append(ref, document.createTextNode(sentence.text));
    sentences.append(p);
  });
  if (!sentences.childElementCount) {
    const empty = document.createElement('p');
    empty.textContent = 'The saved sentence text could not be loaded for this group.';
    sentences.append(empty);
  }
  detail.append(sentences);

  const actions = document.createElement('div');
  actions.className = 'matrix-expanded-actions';
  const editCategories = makeActionButton('Edit categories', 'categories');
  editCategories.dataset.groupId = group.id;
  actions.append(editCategories);

  if (!group.parent_group_id) {
    const children = childrenFor(group.id);
    const subgroupLabel = children.length ? 'Manage subgroups' : 'Break into subgroups';
    const subgroupButton = makeActionButton(subgroupLabel, 'subgroups', !children.length && ids.length < 2);
    subgroupButton.dataset.groupId = group.id;
    if (subgroupButton.disabled) subgroupButton.title = 'At least two sentences are required to make subgroups.';
    actions.append(subgroupButton);
  }
  detail.append(actions);
  return detail;
}

function removeDetail(groupId) {
  const row = detailRowFor(groupId);
  if (row) row.remove();
  setArrowState(groupId, false);
}

function insertDetail(groupId) {
  const summary = summaryFor(groupId);
  const row = summary?.closest('tr');
  const group = groupById(groupId);
  if (!row || !group) return false;

  const existing = detailRowFor(groupId);
  if (existing && existing.previousElementSibling === row) {
    setArrowState(groupId, true);
    return true;
  }
  if (existing) existing.remove();

  const detailRow = document.createElement('tr');
  detailRow.className = 'matrix-expanded-detail-row';
  detailRow.dataset.expandedDetailFor = String(groupId);
  const cell = document.createElement('td');
  cell.colSpan = Math.max(1, row.children.length);
  cell.className = 'matrix-expanded-detail-cell';
  cell.append(makeDetail(group));
  detailRow.append(cell);
  row.after(detailRow);
  setArrowState(groupId, true);
  return true;
}

async function toggleDetail(groupId) {
  const id = String(groupId);
  if (expandedGroupIds.has(id)) {
    expandedGroupIds.delete(id);
    removeDetail(id);
    return;
  }
  await refreshGroups();
  if (!groupById(id)) return;
  expandedGroupIds.add(id);
  insertDetail(id);
}

function openExistingCategoryDialog(groupId) {
  const summary = summaryFor(groupId);
  if (!summary) return;
  summary.click();
}

function openExistingSubgroupFlow(groupId) {
  const hasChildren = childrenFor(groupId).length > 0;
  const summary = summaryFor(groupId);
  if (!summary) return;
  summary.click();
  if (hasChildren) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const button = document.querySelector('#start-subgroups-button');
      if (button && !button.hidden && !button.disabled) button.click();
    });
  });
}

function decorateArrows() {
  document.querySelectorAll('#matrix-body .passage-summary').forEach((summary) => {
    const groupId = summary.dataset.openGroup;
    const arrow = summary.querySelector('.open-icon');
    if (!groupId || !arrow) return;
    arrow.dataset.matrixExpandGroup = groupId;
    setArrowState(groupId, expandedGroupIds.has(String(groupId)));
  });
}

function restoreExpandedRows() {
  decorateArrows();
  expandedGroupIds.forEach((groupId) => {
    if (!detailRowFor(groupId)) insertDetail(groupId);
  });
}

function installStyles() {
  if (document.querySelector('#matrix-expand-styles')) return;
  const style = document.createElement('style');
  style.id = 'matrix-expand-styles';
  style.textContent = `
    #matrix-body .open-icon { cursor: pointer; user-select: none; background: var(--white); }
    #matrix-body .open-icon:hover { border-color: var(--accent); background: #faf3e8; }
    .matrix-expanded-detail-row td { background: #faf5ec !important; }
    .matrix-expanded-detail-cell { padding: 0 12px 14px !important; position: static !important; }
    .matrix-expanded-passage-detail { margin: 0; padding: 14px; border-left: 3px solid var(--accent-soft); border-radius: 0 0 9px 9px; }
    .matrix-expanded-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .matrix-expanded-heading strong { font: 700 14px/1.3 "Libre Caslon Text", Georgia, serif; }
    .matrix-expanded-heading > span { color: var(--muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    .matrix-expanded-sentences { display: grid; gap: 8px; }
    .matrix-expanded-sentences p { margin: 0; padding: 8px 0; border-bottom: 1px solid rgba(217,208,190,.65); font: 400 13px/1.55 "Libre Caslon Text", Georgia, serif; }
    .matrix-expanded-sentences p:last-child { border-bottom: 0; }
    .matrix-expanded-sentences p > span { color: var(--accent); font: 700 9px "DM Sans", sans-serif; margin-right: 8px; }
    .matrix-expanded-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
    .matrix-detail-action { min-height: 36px; padding: 7px 11px; font-size: 11px; }
    .matrix-detail-action:disabled { opacity: .45; cursor: not-allowed; }
    @media (max-width: 720px) {
      .matrix-expanded-detail-cell { padding: 0 8px 10px !important; }
      .matrix-expanded-passage-detail { padding: 12px; }
      .matrix-expanded-actions { display: grid; grid-template-columns: 1fr; }
      .matrix-detail-action { width: 100%; }
    }
  `;
  document.head.append(style);
}

function install() {
  const matrixBody = document.querySelector('#matrix-body');
  if (!matrixBody || matrixBody.dataset.matrixExpansionInstalled) return;
  matrixBody.dataset.matrixExpansionInstalled = 'true';
  installStyles();
  refreshGroups().then(restoreExpandedRows).catch(() => decorateArrows());

  matrixBody.addEventListener('click', async (event) => {
    const arrow = event.target.closest('.open-icon');
    if (arrow) {
      const summary = arrow.closest('[data-open-group]');
      const groupId = summary?.dataset.openGroup;
      if (!groupId) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await toggleDetail(groupId);
      return;
    }

    const actionButton = event.target.closest('[data-matrix-detail-action]');
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const groupId = actionButton.dataset.groupId;
    if (!groupId) return;
    await refreshGroups();
    if (actionButton.dataset.matrixDetailAction === 'categories') openExistingCategoryDialog(groupId);
    if (actionButton.dataset.matrixDetailAction === 'subgroups') openExistingSubgroupFlow(groupId);
  }, true);

  matrixBody.addEventListener('keydown', async (event) => {
    const arrow = event.target.closest('.open-icon');
    if (!arrow || (event.key !== 'Enter' && event.key !== ' ')) return;
    const groupId = arrow.closest('[data-open-group]')?.dataset.openGroup;
    if (!groupId) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    await toggleDetail(groupId);
  }, true);

  const observer = new MutationObserver((mutations) => {
    const changedByMainMatrix = mutations.some((mutation) => {
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
      return nodes.some((node) => node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains('matrix-expanded-detail-row'));
    });
    if (!changedByMainMatrix) return;

    clearTimeout(observer._restoreTimer);
    observer._restoreTimer = setTimeout(() => {
      refreshGroups().then(restoreExpandedRows).catch(() => decorateArrows());
    }, 30);
  });
  observer.observe(matrixBody, { childList: true, subtree: false });
  decorateArrows();

  const footer = document.querySelector('.site-footer');
  if (footer) footer.innerHTML = footer.innerHTML.replace(/v1\.3\.[01]/, `v${ENHANCEMENT_VERSION}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
