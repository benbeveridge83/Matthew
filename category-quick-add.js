// Adds a quick "Add new category" path directly inside the category-assignment dialog.
// It reuses the app's existing category-column flow so the new category is saved globally.

const QUICK_ADD_VERSION = '1.0.0';
const categoryDialog = document.querySelector('#category-dialog');
const categoryTools = document.querySelector('#category-pane .category-dialog-tools');
const categoryEmpty = document.querySelector('#category-assignment-empty');
const addColumnButton = document.querySelector('#add-column-button');
const columnDialog = document.querySelector('#column-dialog');
const columnName = document.querySelector('#column-name');
let lastOpenedGroupId = null;
let pendingReturn = null;

const allOpenGroupElements = () => [...document.querySelectorAll('[data-open-group]')];
const groupElementById = (groupId) => allOpenGroupElements().find((element) => String(element.dataset.openGroup || '') === String(groupId || '')) || null;
const assignmentBoxes = () => [...document.querySelectorAll('#category-assignment-list [data-category-assignment]')];

function rememberCurrentGroupFromClick(event) {
  const group = event.target.closest?.('[data-open-group]');
  if (!group || event.target.closest?.('.open-icon')) return;
  if (group.dataset.openGroup) lastOpenedGroupId = String(group.dataset.openGroup);
}

function inferCurrentGroupId() {
  if (lastOpenedGroupId && groupElementById(lastOpenedGroupId)) return lastOpenedGroupId;
  const title = document.querySelector('#category-dialog-title')?.textContent?.trim();
  if (!title) return null;
  const match = allOpenGroupElements().find((element) => (element.textContent || '').replace(/[›▾]/g, '').includes(title));
  return match?.dataset.openGroup || null;
}

function restoreCategoryDialog(returnState) {
  const opener = groupElementById(returnState.groupId);
  if (!opener) return;
  opener.click();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const boxes = assignmentBoxes();
    const oldChecked = new Set(returnState.checkedIds);
    const oldIds = new Set(returnState.beforeIds);
    boxes.forEach((box) => { if (oldChecked.has(String(box.value))) box.checked = true; });
    const added = boxes.find((box) => !oldIds.has(String(box.value)));
    if (added) {
      added.checked = true;
      const label = added.closest('.category-assignment-option');
      if (label) {
        label.classList.add('quick-added-category');
        setTimeout(() => label.classList.remove('quick-added-category'), 1800);
        label.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }));
}

function openNewCategoryFromAssignmentDialog() {
  if (!categoryDialog?.open || !addColumnButton || !columnDialog) return;
  const groupId = inferCurrentGroupId();
  if (!groupId) return;
  const boxes = assignmentBoxes();
  pendingReturn = {
    groupId: String(groupId),
    beforeIds: boxes.map((box) => String(box.value)),
    checkedIds: boxes.filter((box) => box.checked).map((box) => String(box.value)),
  };
  categoryDialog.close();
  addColumnButton.click();
  requestAnimationFrame(() => { columnName?.focus(); columnName?.select(); });
}

function installQuickAddButton() {
  if (!categoryTools || document.querySelector('#quick-add-category-button')) return;
  const wrap = document.createElement('div');
  wrap.className = 'quick-category-add-wrap';
  const button = document.createElement('button');
  button.id = 'quick-add-category-button';
  button.className = 'secondary-button quick-category-add-button';
  button.type = 'button';
  button.textContent = '＋ Add new category';
  button.addEventListener('click', openNewCategoryFromAssignmentDialog);
  wrap.append(button);
  categoryTools.insertAdjacentElement('afterend', wrap);
  if (categoryEmpty) categoryEmpty.textContent = 'No categories exist yet. Use Add new category above to create one.';
}

function installStyles() {
  if (document.querySelector('#quick-category-add-styles')) return;
  const style = document.createElement('style');
  style.id = 'quick-category-add-styles';
  style.textContent = `
    .quick-category-add-wrap{margin:10px 0 12px}
    .quick-category-add-button{width:100%;min-height:46px;justify-content:center;font-weight:700;border-style:dashed}
    .quick-category-add-button:hover{border-color:var(--accent);background:#faf3e8}
    .category-assignment-option.quick-added-category{animation:quickCategoryFlash 1.8s ease}
    @keyframes quickCategoryFlash{0%,45%{box-shadow:0 0 0 3px rgba(177,79,50,.22);border-color:var(--accent)}100%{box-shadow:none}}
  `;
  document.head.append(style);
}

function install() {
  installStyles();
  installQuickAddButton();
  document.addEventListener('click', rememberCurrentGroupFromClick, true);
  columnDialog?.addEventListener('close', () => {
    if (!pendingReturn) return;
    const returnState = pendingReturn;
    pendingReturn = null;
    setTimeout(() => restoreCategoryDialog(returnState), 45);
  });
  const observer = new MutationObserver(() => installQuickAddButton());
  if (categoryDialog) observer.observe(categoryDialog, { childList: true, subtree: true });
  const footer = document.querySelector('.site-footer');
  if (footer) footer.dataset.quickCategoryAddVersion = QUICK_ADD_VERSION;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
