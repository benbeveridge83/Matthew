const LOCAL_KEY = 'matthew-verse-mapper-v1';
const CONNECTION_KEY = 'matthew-verse-mapper-supabase';
const SUPABASE_MODULE = 'https://esm.sh/@supabase/supabase-js@2.102.0';

let activeGroupId = null;
let client = null;
let categoryMeta = [];
let groupMeta = [];
let observer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { groups: [], columns: [], cells: [] }; }
  catch { return { groups: [], columns: [], cells: [] }; }
}

function writeLocal(snapshot) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshot));
}

function toast(message, error = false) {
  const region = $('#toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast${error ? ' is-error' : ''}`;
  item.textContent = message;
  region.append(item);
  setTimeout(() => item.remove(), 3400);
}

async function getClient() {
  if (client) return client;
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(CONNECTION_KEY)) || {}; } catch {}
  const config = window.MATTHEW_CONFIG || {};
  const url = config.supabaseUrl || stored.url;
  const key = config.supabasePublishableKey || stored.key;
  if (!url || !key) return null;
  const { createClient } = await import(SUPABASE_MODULE);
  client = createClient(url, key);
  return client;
}

async function loadMeta() {
  const sb = await getClient();
  if (sb) {
    const [{ data: columns, error: cError }, { data: groups, error: gError }] = await Promise.all([
      sb.from('category_columns').select('id,name,parent_column_id,sort_order,created_at').order('sort_order').order('created_at'),
      sb.from('verse_groups').select('id,parent_group_id,name,completed'),
    ]);
    if (!cError && columns) categoryMeta = columns;
    if (!gError && groups) groupMeta = groups;
    if (!cError && !gError) return;
  }
  const local = readLocal();
  categoryMeta = (local.columns || []).map((column) => ({ ...column, parent_column_id: column.parent_column_id || null }));
  groupMeta = (local.groups || []).map((group) => ({ ...group, completed: Boolean(group.completed) }));
}

function metaForCategory(id) {
  return categoryMeta.find((item) => String(item.id) === String(id));
}

function metaForGroup(id) {
  return groupMeta.find((item) => String(item.id) === String(id));
}

function childrenOfCategory(id) {
  return categoryMeta.filter((item) => String(item.parent_column_id || '') === String(id));
}

function captureActiveGroup(event) {
  const opener = event.target.closest?.('[data-open-group], [data-manager-open-subgroup], [data-scripture-group]');
  if (!opener) return;
  activeGroupId = opener.dataset.openGroup || opener.dataset.managerOpenSubgroup || opener.dataset.scriptureGroup || activeGroupId;
}

async function renameCategory(id, currentName) {
  const name = window.prompt('Category name', currentName || '');
  if (!name || name.trim() === currentName) return;
  const trimmed = name.trim();
  const sb = await getClient();
  if (sb) {
    const result = await sb.from('category_columns').update({ name: trimmed }).eq('id', id).select('id').maybeSingle();
    if (result.error) throw result.error;
  } else {
    const local = readLocal();
    local.columns = (local.columns || []).map((item) => String(item.id) === String(id) ? { ...item, name: trimmed } : item);
    writeLocal(local);
  }
  const meta = metaForCategory(id);
  if (meta) meta.name = trimmed;
  toast(`Renamed category to “${trimmed}”.`);
  location.reload();
}

async function addSubcategory(parentId, parentName) {
  const name = window.prompt(`New subcategory under “${parentName}”`);
  if (!name?.trim()) return;
  const trimmed = name.trim();
  const sb = await getClient();
  if (sb) {
    const maxOrder = categoryMeta.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error('Please reconnect your study, then try again.');
    const result = await sb.from('category_columns').insert({
      user_id: userId,
      name: trimmed,
      parent_column_id: parentId,
      sort_order: maxOrder + 1,
    }).select().single();
    if (result.error) throw result.error;
    categoryMeta.push(result.data);
  } else {
    const local = readLocal();
    const maxOrder = (local.columns || []).reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
    const row = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      user_id: 'local',
      name: trimmed,
      parent_column_id: parentId,
      sort_order: maxOrder + 1,
      created_at: new Date().toISOString(),
    };
    local.columns = [...(local.columns || []), row];
    writeLocal(local);
    categoryMeta.push(row);
  }
  toast(`Added subcategory “${trimmed}”.`);
  location.reload();
}

async function setCompleted(groupId, completed) {
  const sb = await getClient();
  if (sb) {
    const result = await sb.from('verse_groups').update({ completed }).eq('id', groupId).select('id').maybeSingle();
    if (result.error) throw result.error;
  } else {
    const local = readLocal();
    local.groups = (local.groups || []).map((item) => String(item.id) === String(groupId) ? { ...item, completed } : item);
    writeLocal(local);
  }
  const meta = metaForGroup(groupId);
  if (meta) meta.completed = completed;
  toast(completed ? 'Marked complete.' : 'Marked incomplete.');
  decorateCompletion();
}

function categoryDepth(category) {
  let depth = 0;
  let current = category;
  const seen = new Set();
  while (current?.parent_column_id && !seen.has(String(current.parent_column_id))) {
    seen.add(String(current.parent_column_id));
    current = metaForCategory(current.parent_column_id);
    depth += 1;
    if (depth > 8) break;
  }
  return depth;
}

function enhanceAssignmentList() {
  const list = $('#category-assignment-list');
  if (!list || !categoryMeta.length) return;
  const labels = [...list.querySelectorAll('label')];
  if (!labels.length) return;

  const byId = new Map(labels.map((label) => {
    const box = label.querySelector('[data-category-assignment]');
    return [String(box?.value || ''), label];
  }));

  const ordered = [];
  const roots = categoryMeta.filter((item) => !item.parent_column_id);
  const walk = (item) => {
    ordered.push(item);
    childrenOfCategory(item.id).forEach(walk);
  };
  roots.forEach(walk);
  categoryMeta.filter((item) => !ordered.includes(item)).forEach((item) => ordered.push(item));

  ordered.forEach((category) => {
    const label = byId.get(String(category.id));
    if (!label) return;
    const depth = categoryDepth(category);
    label.classList.toggle('is-subcategory-assignment', depth > 0);
    label.style.setProperty('--category-depth', depth);
    const text = label.querySelector('span');
    if (text) text.textContent = category.name;
    let tools = label.querySelector('.category-inline-tools');
    if (!tools) {
      tools = document.createElement('span');
      tools.className = 'category-inline-tools';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'category-mini-button';
      edit.textContent = 'Edit';
      edit.dataset.categoryEdit = category.id;
      edit.setAttribute('aria-label', `Edit ${category.name}`);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'category-mini-button';
      add.textContent = '+ Subcategory';
      add.dataset.categoryAddChild = category.id;
      add.setAttribute('aria-label', `Add a subcategory under ${category.name}`);
      tools.append(edit, add);
      label.append(tools);
    }
    list.append(label);
  });

  if (!list.dataset.hierarchyEvents) {
    list.dataset.hierarchyEvents = 'true';
    list.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-category-edit]');
      const add = event.target.closest('[data-category-add-child]');
      if (!edit && !add) return;
      event.preventDefault();
      event.stopPropagation();
      try {
        if (edit) {
          const item = metaForCategory(edit.dataset.categoryEdit);
          await renameCategory(item?.id, item?.name);
        } else {
          const item = metaForCategory(add.dataset.categoryAddChild);
          await addSubcategory(item?.id, item?.name);
        }
      } catch (error) {
        toast(error.message || 'Could not update the category.', true);
      }
    });
  }
}

function addCompleteButton() {
  const form = $('#category-form');
  const actions = form?.querySelector('.sticky-dialog-actions');
  if (!actions || actions.querySelector('#passage-complete-button')) return;
  const button = document.createElement('button');
  button.id = 'passage-complete-button';
  button.type = 'button';
  button.className = 'complete-button';
  actions.insertBefore(button, actions.lastElementChild);
  button.addEventListener('click', async () => {
    if (!activeGroupId) return;
    const group = metaForGroup(activeGroupId);
    try {
      await setCompleted(activeGroupId, !group?.completed);
      syncCompleteButton();
    } catch (error) {
      toast(error.message || 'Could not change completion status.', true);
    }
  });
}

function syncCompleteButton() {
  const button = $('#passage-complete-button');
  if (!button) return;
  const group = metaForGroup(activeGroupId);
  const completed = Boolean(group?.completed);
  button.textContent = completed ? '✓ Complete' : 'Complete';
  button.classList.toggle('is-complete', completed);
  button.setAttribute('aria-pressed', completed ? 'true' : 'false');
}

function decorateCompletion() {
  $$('[data-open-group], [data-scripture-group], [data-manager-open-subgroup]').forEach((node) => {
    const id = node.dataset.openGroup || node.dataset.scriptureGroup || node.dataset.managerOpenSubgroup;
    const group = metaForGroup(id);
    node.classList.toggle('is-passage-complete', Boolean(group?.completed));
    let mark = node.querySelector('.passage-complete-mark');
    if (group?.completed && !mark) {
      mark = document.createElement('span');
      mark.className = 'passage-complete-mark';
      mark.textContent = '✓ Complete';
      node.append(mark);
    } else if (!group?.completed && mark) {
      mark.remove();
    }
  });
}

function enhanceMatrixHeaders() {
  const headers = $$('#matrix-head-row th').slice(1);
  if (!headers.length || !categoryMeta.length) return;
  headers.forEach((th) => {
    const label = th.querySelector('.column-heading > span:first-child');
    const name = label?.textContent?.trim();
    if (!name) return;
    const candidates = categoryMeta.filter((item) => item.name === name);
    if (candidates.length !== 1) return;
    const category = candidates[0];
    if (!category.parent_column_id) return;
    const parent = metaForCategory(category.parent_column_id);
    if (!parent) return;
    th.classList.add('subcategory-column');
    let parentLabel = th.querySelector('.subcategory-parent-label');
    if (!parentLabel) {
      parentLabel = document.createElement('small');
      parentLabel.className = 'subcategory-parent-label';
      th.querySelector('.column-heading')?.prepend(parentLabel);
    }
    parentLabel.textContent = parent.name;
  });
}

function replaceTerminology(root = document.body) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.parentElement?.closest('script,style')) return;
    node.nodeValue = node.nodeValue
      .replace(/Passage groups/g, 'Passages')
      .replace(/passage groups/g, 'passages')
      .replace(/Passage group/g, 'Passage')
      .replace(/passage group/g, 'passage')
      .replace(/Subgroups/g, 'Sub-passages')
      .replace(/subgroups/g, 'sub-passages')
      .replace(/Subgroup/g, 'Sub-passage')
      .replace(/subgroup/g, 'sub-passage');
  });
}

function installStyles() {
  if ($('#category-hierarchy-styles')) return;
  const style = document.createElement('style');
  style.id = 'category-hierarchy-styles';
  style.textContent = `
    .category-assignment-option { gap: 9px; }
    .category-assignment-option.is-subcategory-assignment { margin-left: calc(var(--category-depth, 1) * 18px); border-left: 3px solid #e2e8f0; }
    .category-assignment-option.is-subcategory-assignment > span:not(.category-inline-tools)::before { content: '↳ '; opacity: .58; }
    .category-inline-tools { margin-left: auto; display: inline-flex; gap: 5px; align-items: center; }
    .category-mini-button { border: 1px solid #d5d9df; background: #fff; border-radius: 7px; padding: 4px 7px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .category-mini-button:hover { border-color: var(--accent); }
    .complete-button { min-height: 40px; border: 1px solid #94a3b8; background: #fff; border-radius: 9px; padding: 8px 13px; font-weight: 800; cursor: pointer; }
    .complete-button.is-complete { background: #e9f9ee; border-color: #50a66b; color: #22673a; }
    .is-passage-complete { position: relative; }
    .passage-complete-mark { display: inline-flex; margin-left: 8px; border-radius: 999px; padding: 2px 7px; background: #e9f9ee; color: #22673a; font-size: 11px; font-weight: 800; white-space: nowrap; }
    .subcategory-column { background-image: linear-gradient(to bottom, rgba(15,23,42,.035), rgba(15,23,42,0)); }
    .subcategory-parent-label { display: block; width: 100%; font-size: 10px; opacity: .62; font-weight: 700; margin-bottom: 2px; }
    @media (max-width: 720px) {
      .category-assignment-option { align-items: flex-start; flex-wrap: wrap; }
      .category-inline-tools { width: 100%; margin-left: 29px; }
      .category-mini-button { min-height: 34px; font-size: 12px; }
      .complete-button { flex: 1 1 100%; }
    }
  `;
  document.head.append(style);
}

async function refreshEnhancements() {
  await loadMeta();
  replaceTerminology();
  enhanceAssignmentList();
  addCompleteButton();
  syncCompleteButton();
  decorateCompletion();
  enhanceMatrixHeaders();
}

function scheduleRefresh() {
  clearTimeout(scheduleRefresh.timer);
  scheduleRefresh.timer = setTimeout(() => refreshEnhancements().catch(() => {}), 30);
}

async function install() {
  installStyles();
  document.addEventListener('click', captureActiveGroup, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-group], [data-manager-open-subgroup], [data-scripture-group]')) scheduleRefresh();
  }, true);
  await refreshEnhancements();
  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
