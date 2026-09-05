from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


app_path = Path("app.js")
app = app_path.read_text()

app = replace_once(app, "const APP_VERSION = '1.3.0';", "const APP_VERSION = '1.4.0';", "app version")
app = replace_once(
    app,
    "  activeManagerGroupId: null,\n  groups: [],",
    "  activeManagerGroupId: null,\n  subgroupDrafts: [],\n  subgroupUnassignedIds: new Set(),\n  groups: [],",
    "subgroup state",
)
app = replace_once(
    app,
    "  categoryPane: $('#category-pane'), subgroupPane: $('#subgroup-pane'), subgroupParentName: $('#subgroup-parent-name'),\n  subgroupFirstName: $('#subgroup-first-name'), subgroupSecondName: $('#subgroup-second-name'),\n  subgroupSentenceList: $('#subgroup-sentence-list'), subgroupError: $('#subgroup-error'),\n  subgroupBackButton: $('#subgroup-back-button'), categorySubmitButton: $('#category-submit-button'),\n  subgroupManagerDialog: $('#subgroup-manager-dialog'), subgroupManagerTitle: $('#subgroup-manager-title'),\n  subgroupManagerCopy: $('#subgroup-manager-copy'), subgroupManagerList: $('#subgroup-manager-list'),\n  removeSubgroupsButton: $('#remove-subgroups-button'),",
    "  categoryPane: $('#category-pane'), subgroupPane: $('#subgroup-pane'), subgroupParentName: $('#subgroup-parent-name'),\n  subgroupName: $('#subgroup-name'), subgroupAddButton: $('#subgroup-add-button'),\n  subgroupDraftList: $('#subgroup-draft-list'), subgroupProgress: $('#subgroup-progress'),\n  subgroupSentenceList: $('#subgroup-sentence-list'), subgroupError: $('#subgroup-error'),\n  subgroupBackButton: $('#subgroup-back-button'), categorySubmitButton: $('#category-submit-button'),\n  subgroupManagerDialog: $('#subgroup-manager-dialog'), subgroupManagerTitle: $('#subgroup-manager-title'),\n  subgroupManagerCopy: $('#subgroup-manager-copy'), subgroupManagerList: $('#subgroup-manager-list'),\n  groupManagerCategoriesButton: $('#group-manager-categories-button'),\n  groupManagerSubgroupsButton: $('#group-manager-subgroups-button'), undoGroupButton: $('#undo-group-button'),\n  removeSubgroupsButton: $('#remove-subgroups-button'),",
    "subgroup element refs",
)
app = replace_once(
    app,
    "          chip.dataset.openGroup = group.id;\n          chip.setAttribute('aria-label', `Open categories for ${group.name}`);",
    "          chip.dataset.scriptureGroup = group.id;\n          chip.setAttribute('aria-label', isSubgroup(group) ? `Open categories for ${group.name}` : `Manage ${group.name}`);",
    "scripture group chips",
)
app = replace_once(
    app,
    "  els.categorySubmitButton.textContent = 'Save categories';\n  els.subgroupError.hidden = true;",
    "  els.categorySubmitButton.textContent = 'Save categories';\n  els.categorySubmitButton.disabled = false;\n  els.subgroupError.hidden = true;",
    "category pane reset",
)

builder_code = r'''function updateSubgroupBuilderButtons() {
  const selectedCount = $$('[data-subgroup-sentence]:checked').length;
  const hasName = Boolean(els.subgroupName.value.trim());
  els.subgroupAddButton.disabled = !selectedCount || !hasName;
  els.categorySubmitButton.disabled = state.subgroupDrafts.length < 2 || state.subgroupUnassignedIds.size > 0;
}

function renderSubgroupBuilder(group) {
  const parentIds = (group.sentence_keys || []).slice().sort(compareSentenceIds);
  const assignedCount = parentIds.length - state.subgroupUnassignedIds.size;
  els.subgroupProgress.textContent = `${assignedCount} of ${parentIds.length} sentences assigned · ${state.subgroupUnassignedIds.size} remaining`;

  els.subgroupDraftList.replaceChildren();
  state.subgroupDrafts.forEach((draft, index) => {
    const item = document.createElement('div');
    item.className = 'subgroup-draft-item';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = draft.name;
    const detail = document.createElement('small');
    detail.textContent = `${formatReferences(draft.sentenceKeys)} · ${draft.sentenceKeys.length} sentence${draft.sentenceKeys.length === 1 ? '' : 's'}`;
    copy.append(name, detail);
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'text-button danger-text compact-draft-button';
    undo.dataset.removeSubgroupDraft = String(index);
    undo.textContent = 'Undo';
    item.append(copy, undo);
    els.subgroupDraftList.append(item);
  });

  els.subgroupSentenceList.replaceChildren();
  parentIds.filter((id) => state.subgroupUnassignedIds.has(id)).forEach((id) => {
    const sentence = sentenceById.get(id);
    if (!sentence) return;
    const label = document.createElement('label');
    label.className = 'subgroup-sentence-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.dataset.subgroupSentence = id;
    const copy = document.createElement('span');
    const ref = document.createElement('strong');
    ref.textContent = `${sentence.chapter}:${sentence.verse}`;
    copy.append(ref, document.createTextNode(sentence.text));
    label.append(checkbox, copy);
    els.subgroupSentenceList.append(label);
  });

  const nextPart = state.subgroupDrafts.length + 1;
  els.subgroupName.value = state.subgroupUnassignedIds.size ? `${group.name} — part ${nextPart}` : '';
  els.subgroupName.disabled = state.subgroupUnassignedIds.size === 0;
  els.subgroupAddButton.hidden = state.subgroupUnassignedIds.size === 0;
  updateSubgroupBuilderButtons();
}

function addSubgroupDraft(group) {
  const name = els.subgroupName.value.trim();
  const selectedIds = $$('[data-subgroup-sentence]:checked').map((checkbox) => checkbox.value).sort(compareSentenceIds);
  if (!name) throw new Error('Give this subgroup a name.');
  if (!selectedIds.length) throw new Error('Select at least one sentence for this subgroup.');
  if (state.subgroupDrafts.some((draft) => draft.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('Use a different name for each subgroup.');
  }
  if (!state.subgroupDrafts.length && selectedIds.length === state.subgroupUnassignedIds.size) {
    throw new Error('Leave at least one sentence for a second subgroup.');
  }
  state.subgroupDrafts.push({ name, sentenceKeys: selectedIds });
  selectedIds.forEach((id) => state.subgroupUnassignedIds.delete(id));
  els.subgroupError.hidden = true;
  renderSubgroupBuilder(group);
}

function removeSubgroupDraft(index, group) {
  const [draft] = state.subgroupDrafts.splice(index, 1);
  if (!draft) return;
  draft.sentenceKeys.forEach((id) => state.subgroupUnassignedIds.add(id));
  els.subgroupError.hidden = true;
  renderSubgroupBuilder(group);
}

function showSubgroupPane(group) {
  if ((group.sentence_keys || []).length < 2) {
    toast('A passage group needs at least two sentences before it can be split.', 'error');
    return;
  }
  els.categoryPane.hidden = true;
  els.subgroupPane.hidden = false;
  els.categorySubmitButton.textContent = 'Create subgroups';
  els.subgroupParentName.textContent = group.name;
  state.subgroupDrafts = [];
  state.subgroupUnassignedIds = new Set((group.sentence_keys || []).slice().sort(compareSentenceIds));
  els.subgroupError.hidden = true;
  renderSubgroupBuilder(group);
}'''

app, count = re.subn(
    r"function showSubgroupPane\(group\) \{.*?\n\}\n\nfunction openCategoryDialog\(groupId\) \{",
    builder_code + "\n\nfunction openCategoryDialog(groupId) {",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"subgroup builder replacement: expected 1 match, found {count}")

manager_code = r'''function openSubgroupManager(groupId) {
  const group = state.groups.find((item) => String(item.id) === String(groupId));
  const children = subgroupsFor(groupId);
  if (!group) return;
  state.activeManagerGroupId = String(group.id);
  els.subgroupManagerTitle.textContent = group.name;
  els.subgroupManagerCopy.textContent = children.length
    ? 'This passage group now gets its categories from the subgroups below. Choose a subgroup to change its categories.'
    : 'Choose what you want to do with this saved passage group.';
  els.subgroupManagerList.replaceChildren();
  children.forEach((child) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'subgroup-manager-item';
    button.dataset.managerOpenSubgroup = child.id;
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = child.name;
    const ref = document.createElement('small');
    ref.textContent = visibleGroupReference(child);
    copy.append(name, ref);
    const categories = document.createElement('span');
    categories.className = 'manager-category-summary';
    const categoryNames = state.columns
      .filter((column) => state.cells.has(`${child.id}:${column.id}`))
      .map((column) => column.name);
    categories.textContent = categoryNames.length ? categoryNames.join(', ') : 'No categories yet';
    button.append(copy, categories);
    els.subgroupManagerList.append(button);
  });
  els.groupManagerCategoriesButton.hidden = children.length > 0;
  els.groupManagerSubgroupsButton.hidden = children.length > 0 || (group.sentence_keys || []).length < 2;
  els.removeSubgroupsButton.hidden = children.length < 2;
  els.undoGroupButton.hidden = false;
  els.subgroupManagerDialog.showModal();
}

function openScriptureGroup(groupId) {
  const group = state.groups.find((item) => String(item.id) === String(groupId));
  if (!group) return;
  if (isSubgroup(group)) {
    openCategoryDialog(group.id);
    return;
  }
  openSubgroupManager(group.id);
}'''

app, count = re.subn(
    r"function openSubgroupManager\(groupId\) \{.*?\n\}\n\nasync function saveCategoryAssignments",
    manager_code + "\n\nasync function saveCategoryAssignments",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"group manager replacement: expected 1 match, found {count}")

create_code = r'''async function createSubgroups(parentId, drafts) {
  const parent = state.groups.find((item) => String(item.id) === String(parentId));
  if (!parent || isSubgroup(parent) || isSplitGroup(parent)) throw new Error('This passage group cannot be split again.');
  const parentIds = (parent.sentence_keys || []).slice().sort(compareSentenceIds);
  const parentIdSet = new Set(parentIds);
  const normalized = (drafts || []).map((draft) => ({
    name: String(draft.name || '').trim(),
    sentenceKeys: (draft.sentenceKeys || []).slice().sort(compareSentenceIds),
  }));
  if (normalized.length < 2) throw new Error('Create at least two subgroups.');
  if (normalized.some((draft) => !draft.name)) throw new Error('Give every subgroup a name.');
  const nameKeys = normalized.map((draft) => draft.name.toLowerCase());
  if (new Set(nameKeys).size !== nameKeys.length) throw new Error('Use a different name for each subgroup.');
  if (normalized.some((draft) => !draft.sentenceKeys.length)) throw new Error('Every subgroup needs at least one sentence.');

  const assigned = normalized.flatMap((draft) => draft.sentenceKeys);
  if (assigned.some((id) => !parentIdSet.has(id))) throw new Error('A subgroup contains a sentence outside this passage group.');
  if (new Set(assigned).size !== assigned.length) throw new Error('Each sentence can belong to only one subgroup.');
  if (assigned.length !== parentIds.length || parentIds.some((id) => !assigned.includes(id))) {
    throw new Error('Assign every sentence before creating the subgroups.');
  }

  const parentCategoryIds = [...categoryIdsForGroup(parent.id)];
  let children;
  if (state.mode === 'supabase') {
    const rows = normalized.map((draft) => ({
      user_id: state.userId,
      parent_group_id: parent.id,
      name: draft.name,
      reference_text: formatReferences(draft.sentenceKeys),
      sentence_keys: draft.sentenceKeys,
    }));
    const result = await state.supabase.from('verse_groups').insert(rows).select();
    if (result.error) {
      if (/parent_group_id/i.test(result.error.message || '')) throw new Error('Run the included Supabase v1.3.0 SQL update first, then try again.');
      throw result.error;
    }
    children = result.data || [];
    try {
      const copiedCells = children.flatMap((child) => parentCategoryIds.map((columnId) => ({
        group_id: child.id, column_id: columnId, user_id: state.userId,
      })));
      if (copiedCells.length) {
        const copyResult = await state.supabase.from('group_category_cells').insert(copiedCells);
        if (copyResult.error) throw copyResult.error;
      }
      if (parentCategoryIds.length) {
        const removeResult = await state.supabase.from('group_category_cells').delete().eq('group_id', parent.id);
        if (removeResult.error) throw removeResult.error;
      }
    } catch (error) {
      if (children.length) await state.supabase.from('verse_groups').delete().in('id', children.map((child) => child.id));
      throw error;
    }
  } else {
    const createdAt = new Date().toISOString();
    children = normalized.map((draft) => ({
      id: localId(), user_id: 'local', parent_group_id: parent.id, name: draft.name,
      reference_text: formatReferences(draft.sentenceKeys), sentence_keys: draft.sentenceKeys, created_at: createdAt,
    }));
  }
  state.groups.push(...children);
  parentCategoryIds.forEach((columnId) => {
    state.cells.delete(`${parent.id}:${columnId}`);
    children.forEach((child) => state.cells.add(`${child.id}:${columnId}`));
  });
  if (state.mode === 'local') saveLocal();
  renderMatrix();
  renderChapter();
  renderAccountPanel();
  toast(`Created ${children.length} subgroups under “${parent.name}”.`);
}'''

app, count = re.subn(
    r"async function createSubgroups\(parentId, firstName, secondName, firstSentenceIds\) \{.*?\n\}\n\nasync function removeSubgroups",
    create_code + "\n\nasync function removeSubgroups",
    app,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit(f"createSubgroups replacement: expected 1 match, found {count}")

app = replace_once(
    app,
    "    const groupChip = event.target.closest('[data-open-group]');\n    if (groupChip) {\n      event.stopPropagation();\n      openCategoryDialog(groupChip.dataset.openGroup);\n      return;\n    }",
    "    const groupChip = event.target.closest('[data-scripture-group]');\n    if (groupChip) {\n      event.stopPropagation();\n      openScriptureGroup(groupChip.dataset.scriptureGroup);\n      return;\n    }",
    "scripture group click handler",
)
app = replace_once(
    app,
    "  els.subgroupBackButton.addEventListener('click', showCategoryPane);",
    "  els.subgroupBackButton.addEventListener('click', showCategoryPane);\n  els.subgroupName.addEventListener('input', updateSubgroupBuilderButtons);\n  els.subgroupSentenceList.addEventListener('change', updateSubgroupBuilderButtons);\n  els.subgroupAddButton.addEventListener('click', () => {\n    const group = state.groups.find((item) => String(item.id) === String(state.activeCategoryGroupId));\n    if (!group) return;\n    try { addSubgroupDraft(group); }\n    catch (error) { els.subgroupError.textContent = error.message || 'Could not add this subgroup.'; els.subgroupError.hidden = false; }\n  });\n  els.subgroupDraftList.addEventListener('click', (event) => {\n    const button = event.target.closest('[data-remove-subgroup-draft]');\n    if (!button) return;\n    const group = state.groups.find((item) => String(item.id) === String(state.activeCategoryGroupId));\n    if (group) removeSubgroupDraft(Number(button.dataset.removeSubgroupDraft), group);\n  });",
    "subgroup builder events",
)
app = replace_once(
    app,
    "        const firstIds = new Set($$('[data-subgroup-sentence]:checked').map((checkbox) => checkbox.value));\n        await createSubgroups(group.id, els.subgroupFirstName.value.trim(), els.subgroupSecondName.value.trim(), firstIds);",
    "        await createSubgroups(group.id, state.subgroupDrafts);",
    "subgroup submit",
)
app = replace_once(
    app,
    "  els.subgroupManagerList.addEventListener('click', (event) => {",
    "  els.groupManagerCategoriesButton.addEventListener('click', () => {\n    const group = state.groups.find((item) => String(item.id) === String(state.activeManagerGroupId));\n    if (!group) return;\n    els.subgroupManagerDialog.close();\n    openCategoryDialog(group.id);\n  });\n  els.groupManagerSubgroupsButton.addEventListener('click', () => {\n    const group = state.groups.find((item) => String(item.id) === String(state.activeManagerGroupId));\n    if (!group || isSplitGroup(group)) return;\n    els.subgroupManagerDialog.close();\n    openCategoryDialog(group.id);\n    showSubgroupPane(group);\n  });\n  els.undoGroupButton.addEventListener('click', async () => {\n    const groupId = state.activeManagerGroupId;\n    try {\n      await deleteGroup(groupId);\n      if (!state.groups.some((item) => String(item.id) === String(groupId)) && els.subgroupManagerDialog.open) els.subgroupManagerDialog.close();\n    } catch (error) { toast(error.message || 'Could not undo the group.', 'error'); }\n  });\n  els.subgroupManagerList.addEventListener('click', (event) => {",
    "group manager events",
)

app_path.write_text(app)

index_path = Path("index.html")
index = index_path.read_text()
index = replace_once(index, 'styles.css?v=1.3.0', 'styles.css?v=1.4.0', 'styles version')
index = replace_once(
    index,
    '<p>Split every sentence into two complete subgroups. After that, categories are assigned only to the subgroups.</p>',
    '<p>Split this passage into as many complete subgroups as you need. After that, categories are assigned only to the subgroups.</p>',
    'subgroup callout copy',
)
old_pane = '''      <section id="subgroup-pane" class="subgroup-pane" hidden>
        <button id="subgroup-back-button" class="text-button back-button" type="button">← Back to categories</button>
        <div class="subgroup-instructions">
          <strong>Split “<span id="subgroup-parent-name"></span>” into two</strong>
          <p>Check the sentences for the first subgroup. Every unchecked sentence automatically goes into the second subgroup, so the entire passage remains covered.</p>
        </div>
        <div class="subgroup-name-grid">
          <label for="subgroup-first-name">First subgroup name</label>
          <input id="subgroup-first-name" maxlength="100" />
          <label for="subgroup-second-name">Second subgroup name</label>
          <input id="subgroup-second-name" maxlength="100" />
        </div>
        <p class="subgroup-list-label">Sentences in the first subgroup</p>
        <div id="subgroup-sentence-list" class="subgroup-sentence-list"></div>
      </section>'''
new_pane = '''      <section id="subgroup-pane" class="subgroup-pane" hidden>
        <button id="subgroup-back-button" class="text-button back-button" type="button">← Back to categories</button>
        <div class="subgroup-instructions">
          <strong>Build subgroups for “<span id="subgroup-parent-name"></span>”</strong>
          <p>Select the sentences for one subgroup, name it, and add it. Repeat as many times as you need until every sentence is assigned. At least two subgroups are required.</p>
        </div>
        <div class="subgroup-name-grid">
          <label for="subgroup-name">Subgroup name</label>
          <input id="subgroup-name" maxlength="100" />
        </div>
        <p id="subgroup-progress" class="subgroup-progress"></p>
        <p class="subgroup-list-label">Select sentences for this subgroup</p>
        <div id="subgroup-sentence-list" class="subgroup-sentence-list"></div>
        <div class="subgroup-builder-actions">
          <button id="subgroup-add-button" class="secondary-button" type="button">＋ Add this subgroup</button>
        </div>
        <div class="subgroup-drafts-wrap">
          <p class="subgroup-list-label">Subgroups ready to create</p>
          <div id="subgroup-draft-list" class="subgroup-draft-list"></div>
        </div>
      </section>'''
index = replace_once(index, old_pane, new_pane, 'subgroup pane markup')
index = replace_once(
    index,
    '''      <p id="subgroup-manager-copy" class="dialog-copy"></p>
      <div id="subgroup-manager-list" class="subgroup-manager-list"></div>
      <div class="dialog-actions split-manager-actions">
        <button id="remove-subgroups-button" class="text-button danger-text" type="button">Remove subgroups</button>
        <button class="secondary-button" value="cancel" type="button" data-close-dialog>Close</button>
      </div>''',
    '''      <p id="subgroup-manager-copy" class="dialog-copy"></p>
      <div class="group-manager-actions">
        <button id="group-manager-categories-button" class="secondary-button" type="button">Assign categories</button>
        <button id="group-manager-subgroups-button" class="primary-button" type="button">Make subgroups</button>
      </div>
      <div id="subgroup-manager-list" class="subgroup-manager-list"></div>
      <div class="dialog-actions split-manager-actions">
        <button id="undo-group-button" class="text-button danger-text" type="button">Undo group</button>
        <button id="remove-subgroups-button" class="text-button danger-text" type="button">Remove subgroups</button>
        <button class="secondary-button" value="cancel" type="button" data-close-dialog>Close</button>
      </div>''',
    'group manager markup',
)
index = replace_once(index, 'v1.3.0 · 28 chapters · 1,067 supplied verses', 'v1.4.0 · 28 chapters · 1,067 supplied verses', 'footer version')
index = replace_once(index, 'app.js?v=1.3.0', 'app.js?v=1.4.0', 'app script version')
index_path.write_text(index)

styles_path = Path("styles.css")
styles = styles_path.read_text()
styles += r'''

/* v1.4.0 flexible subgroup builder */
.subgroup-name-grid { grid-template-columns: 1fr; }
.subgroup-name-grid label:first-of-type,
.subgroup-name-grid input:first-of-type { grid-column: 1; grid-row: auto; }
.subgroup-name-grid input { width: 100%; }
.subgroup-progress { margin: 10px 0 0; color: var(--sage); font-size: 11px; font-weight: 700; }
.subgroup-builder-actions { display: flex; justify-content: flex-end; margin-top: 10px; }
.subgroup-drafts-wrap { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.subgroup-draft-list { display: grid; gap: 7px; }
.subgroup-draft-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 11px; border: 1px solid #cbd6c5; border-radius: 9px; background: #edf2ea; }
.subgroup-draft-item span, .subgroup-draft-item strong, .subgroup-draft-item small { display: block; min-width: 0; }
.subgroup-draft-item strong { font-size: 12px; }
.subgroup-draft-item small { margin-top: 3px; color: var(--muted); font-size: 10px; line-height: 1.4; }
.compact-draft-button { min-height: 32px; padding: 4px 7px; font-size: 11px; }
.group-manager-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin: 12px 0 14px; }
.group-manager-actions [hidden], .split-manager-actions [hidden] { display: none; }
@media (max-width: 620px) {
  .subgroup-builder-actions { justify-content: stretch; }
  .subgroup-builder-actions button { width: 100%; }
  .group-manager-actions { grid-template-columns: 1fr; }
  .subgroup-draft-item { grid-template-columns: 1fr; }
  .compact-draft-button { justify-self: start; }
}
'''
styles_path.write_text(styles)

print('Applied flexible subgroup builder and Scripture group actions.')
