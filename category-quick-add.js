let activeGroupId = null;
let returnGroupId = null;
let assignmentStateBefore = new Map();
let assignmentCountBefore = 0;
let quickAddInProgress = false;

function captureGroupId(event) {
  const summary = event.target.closest?.('[data-open-group]');
  if (summary?.dataset.openGroup) activeGroupId = String(summary.dataset.openGroup);

  const subgroup = event.target.closest?.('[data-manager-open-subgroup]');
  if (subgroup?.dataset.managerOpenSubgroup) activeGroupId = String(subgroup.dataset.managerOpenSubgroup);
}

function findGroupOpener(groupId) {
  if (!groupId) return null;
  const candidates = [
    ...document.querySelectorAll('#matrix-body [data-open-group]'),
    ...document.querySelectorAll('#sentence-list [data-open-group]'),
  ];
  return candidates.find((item) => String(item.dataset.openGroup) === String(groupId)) || null;
}

function rememberCurrentAssignments() {
  const boxes = [...document.querySelectorAll('#category-assignment-list [data-category-assignment]')];
  assignmentStateBefore = new Map(boxes.map((box) => [String(box.value), box.checked]));
  assignmentCountBefore = boxes.length;
}

function restoreAssignmentsAndSelectNew() {
  const boxes = [...document.querySelectorAll('#category-assignment-list [data-category-assignment]')];
  boxes.forEach((box) => {
    const id = String(box.value);
    if (assignmentStateBefore.has(id)) box.checked = assignmentStateBefore.get(id);
  });

  if (boxes.length > assignmentCountBefore) {
    const newBoxes = boxes.filter((box) => !assignmentStateBefore.has(String(box.value)));
    const newest = newBoxes[newBoxes.length - 1] || boxes[boxes.length - 1];
    if (newest) {
      newest.checked = true;
      newest.closest('label')?.classList.add('category-quick-added');
      newest.closest('label')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setTimeout(() => newest.closest('label')?.classList.remove('category-quick-added'), 1200);
    }
  }
}

function reopenCategoryDialog(groupId) {
  const opener = findGroupOpener(groupId);
  if (!opener) return;
  activeGroupId = String(groupId);
  opener.click();
  requestAnimationFrame(() => requestAnimationFrame(restoreAssignmentsAndSelectNew));
}

function installStyles() {
  if (document.querySelector('#category-quick-add-styles')) return;
  const style = document.createElement('style');
  style.id = 'category-quick-add-styles';
  style.textContent = `
    .category-quick-add-wrap {
      display: flex;
      justify-content: flex-start;
      margin: -2px 0 10px;
    }
    .category-quick-add-button {
      min-height: 38px;
      padding: 7px 12px;
      border: 1px dashed var(--accent);
      border-radius: 9px;
      background: #fff8f2;
      color: var(--accent-dark);
      font-weight: 700;
      cursor: pointer;
    }
    .category-quick-add-button:hover {
      background: var(--accent-soft);
      border-style: solid;
    }
    .category-quick-added {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
      animation: category-quick-added-pulse .65s ease-out;
    }
    @keyframes category-quick-added-pulse {
      from { transform: scale(.985); background: var(--accent-soft); }
      to { transform: scale(1); }
    }
    @media (max-width: 720px) {
      .category-quick-add-wrap { display: grid; }
      .category-quick-add-button { width: 100%; min-height: 46px; font-size: 14px; }
    }
  `;
  document.head.append(style);
}

function install() {
  const categoryDialog = document.querySelector('#category-dialog');
  const categoryPane = document.querySelector('#category-pane');
  const assignmentList = document.querySelector('#category-assignment-list');
  const columnDialog = document.querySelector('#column-dialog');
  const addColumnButton = document.querySelector('#add-column-button');
  if (!categoryDialog || !categoryPane || !assignmentList || !columnDialog || !addColumnButton) return;
  if (categoryPane.dataset.quickAddInstalled) return;
  categoryPane.dataset.quickAddInstalled = 'true';

  installStyles();

  document.querySelector('#matrix-body')?.addEventListener('click', captureGroupId, true);
  document.querySelector('#sentence-list')?.addEventListener('click', captureGroupId, true);
  document.querySelector('#subgroup-manager-list')?.addEventListener('click', captureGroupId, true);

  const wrap = document.createElement('div');
  wrap.className = 'category-quick-add-wrap';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'category-quick-add-button';
  button.textContent = '+ Add new category';
  button.setAttribute('aria-label', 'Add a new category and return to this passage group');
  wrap.append(button);
  assignmentList.before(wrap);

  button.addEventListener('click', () => {
    rememberCurrentAssignments();
    returnGroupId = activeGroupId;
    quickAddInProgress = true;
    categoryDialog.close();
    setTimeout(() => addColumnButton.click(), 0);
  });

  columnDialog.addEventListener('close', () => {
    if (!quickAddInProgress) return;
    quickAddInProgress = false;
    const groupId = returnGroupId;
    returnGroupId = null;
    if (!groupId) return;
    setTimeout(() => reopenCategoryDialog(groupId), 30);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
