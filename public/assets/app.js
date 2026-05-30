const state = {
  csrfToken: '',
  loggedIn: false,
  labels: [],
  transactions: [],
  imports: [],
  total: 0,
  limit: 50,
  offset: 0,
};

const yen = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

const elements = {};

function $(selector) {
  return document.querySelector(selector);
}

function createElement(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = String(options.text);
  }
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, String(value));
    }
  }
  return node;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  const method = (options.method || 'GET').toUpperCase();
  const init = {
    method,
    credentials: 'same-origin',
    headers,
  };

  if (method !== 'GET' && state.csrfToken) {
    headers.set('X-CSRF-Token', state.csrfToken);
  }

  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(options.json);
  } else if (options.body !== undefined) {
    init.body = options.body;
  }

  const response = await fetch(path, init);
  const text = await response.text();
  let data = {};
  if (text.trim() !== '') {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('API response is not JSON.');
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

function formatCurrency(value) {
  return yen.format(Number(value || 0));
}

function formatDate(value) {
  return value || '-';
}

function formatPeriod(value, groupBy) {
  if (!value) {
    return '-';
  }
  if (groupBy === 'month') {
    return value.slice(0, 7);
  }
  if (groupBy === 'week') {
    return `${value}週`;
  }
  return value;
}

function bindElements() {
  elements.sessionStatus = $('#sessionStatus');
  elements.loginButton = $('#loginButton');
  elements.logoutButton = $('#logoutButton');
  elements.loginDialog = $('#loginDialog');
  elements.loginForm = $('#loginForm');
  elements.cancelLoginButton = $('#cancelLoginButton');
  elements.filtersForm = $('#filtersForm');
  elements.resetFiltersButton = $('#resetFiltersButton');
  elements.labelFilter = $('#labelFilter');
  elements.includeDeletedLabel = $('#includeDeletedLabel');
  elements.summaryAmount = $('#summaryAmount');
  elements.summaryCount = $('#summaryCount');
  elements.summaryPeriods = $('#summaryPeriods');
  elements.summaryChart = $('#summaryChart');
  elements.adminPanel = $('#adminPanel');
  elements.importForm = $('#importForm');
  elements.importsBody = $('#importsBody');
  elements.labelForm = $('#labelForm');
  elements.labelsList = $('#labelsList');
  elements.resultCount = $('#resultCount');
  elements.transactionsBody = $('#transactionsBody');
  elements.prevPageButton = $('#prevPageButton');
  elements.nextPageButton = $('#nextPageButton');
  elements.adminHeader = $('#adminHeader');
  elements.toast = $('#toast');
}

function bindEvents() {
  elements.loginButton.addEventListener('click', () => {
    elements.loginForm.reset();
    if (typeof elements.loginDialog.showModal === 'function') {
      elements.loginDialog.showModal();
    } else {
      elements.loginDialog.setAttribute('open', '');
    }
  });

  elements.cancelLoginButton.addEventListener('click', () => {
    elements.loginDialog.close();
  });

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    try {
      const data = await api('api/session.php', {
        method: 'POST',
        json: { password: formData.get('password') || '' },
      });
      state.loggedIn = Boolean(data.logged_in);
      state.csrfToken = data.csrf_token || state.csrfToken;
      elements.loginDialog.close();
      renderAuth();
      await refreshAll();
      showToast('ログインしました。');
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.logoutButton.addEventListener('click', async () => {
    try {
      await api('api/session.php', { method: 'DELETE' });
      state.loggedIn = false;
      state.csrfToken = '';
      state.offset = 0;
      renderAuth();
      await refreshAll();
      showToast('ログアウトしました。');
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.filtersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.offset = 0;
    await refreshData();
  });

  elements.resetFiltersButton.addEventListener('click', async () => {
    elements.filtersForm.reset();
    state.offset = 0;
    await refreshData();
  });

  elements.prevPageButton.addEventListener('click', async () => {
    state.offset = Math.max(0, state.offset - state.limit);
    await loadTransactions();
  });

  elements.nextPageButton.addEventListener('click', async () => {
    state.offset += state.limit;
    await loadTransactions();
  });

  elements.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.importForm);
    const file = formData.get('csv');
    if (!(file instanceof File) || file.name === '') {
      showToast('CSVファイルを選択してください。');
      return;
    }

    try {
      await api('api/imports.php', {
        method: 'POST',
        body: formData,
      });
      elements.importForm.reset();
      state.offset = 0;
      await refreshAll();
      showToast('CSVを取り込みました。');
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.labelForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.labelForm);
    try {
      await api('api/labels.php', {
        method: 'POST',
        json: {
          name: formData.get('name') || '',
          color: formData.get('color') || '#2563eb',
        },
      });
      elements.labelForm.reset();
      await refreshAll();
      showToast('ラベルを追加しました。');
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function loadSession() {
  try {
    const data = await api('api/session.php');
    state.loggedIn = Boolean(data.logged_in);
    state.csrfToken = data.csrf_token || '';
  } catch (error) {
    state.loggedIn = false;
    state.csrfToken = '';
    showToast(error.message);
  }
  renderAuth();
}

function renderAuth() {
  elements.sessionStatus.textContent = state.loggedIn ? '管理モード' : '公開閲覧モード';
  elements.loginButton.hidden = state.loggedIn;
  elements.logoutButton.hidden = !state.loggedIn;
  elements.adminPanel.hidden = !state.loggedIn;
  elements.includeDeletedLabel.hidden = !state.loggedIn;
  elements.adminHeader.hidden = !state.loggedIn;
}

function queryParams(includePaging) {
  const formData = new FormData(elements.filtersForm);
  const params = new URLSearchParams();

  for (const key of ['amount_basis', 'date_from', 'date_to', 'q', 'label_id']) {
    const value = formData.get(key);
    if (value !== null && String(value) !== '') {
      params.set(key, String(value));
    }
  }

  if (formData.get('include_deleted') === '1' && state.loggedIn) {
    params.set('include_deleted', '1');
  }

  if (includePaging) {
    params.set('limit', String(state.limit));
    params.set('offset', String(state.offset));
  }

  return params;
}

async function refreshAll() {
  await loadLabels();
  await refreshData();
  if (state.loggedIn) {
    await loadImports();
  } else {
    state.imports = [];
    renderImports();
  }
}

async function refreshData() {
  await Promise.all([loadSummary(), loadTransactions()]);
}

async function loadLabels() {
  try {
    const selected = elements.labelFilter.value;
    const data = await api('api/labels.php');
    state.labels = data.items || [];
    renderLabelFilter(selected);
    renderLabelsList();
  } catch (error) {
    showToast(error.message);
  }
}

function renderLabelFilter(selected) {
  const options = [createElement('option', { text: 'すべて', attrs: { value: '' } })];
  for (const label of state.labels) {
    const option = createElement('option', {
      text: `${label.name} (${label.transaction_count})`,
      attrs: { value: label.id },
    });
    if (String(label.id) === String(selected)) {
      option.selected = true;
    }
    options.push(option);
  }
  elements.labelFilter.replaceChildren(...options);
}

async function loadSummary() {
  try {
    const params = queryParams(false);
    const groupBy = new FormData(elements.filtersForm).get('group_by') || 'month';
    params.set('group_by', String(groupBy));
    const data = await api(`api/summary.php?${params.toString()}`);
    renderSummary(data.items || [], String(groupBy));
  } catch (error) {
    showToast(error.message);
  }
}

function renderSummary(items, groupBy) {
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalCount = items.reduce((sum, item) => sum + Number(item.transaction_count || 0), 0);
  const maxAmount = Math.max(1, ...items.map((item) => Math.abs(Number(item.amount || 0))));

  elements.summaryAmount.textContent = formatCurrency(totalAmount);
  elements.summaryCount.textContent = `${totalCount}件`;
  elements.summaryPeriods.textContent = `${items.length}件`;

  if (items.length === 0) {
    elements.summaryChart.replaceChildren(createElement('div', { className: 'empty', text: '集計なし' }));
    return;
  }

  const rows = items.map((item) => {
    const row = createElement('div', { className: 'bar-row' });
    const label = createElement('span', { text: formatPeriod(item.period_start, groupBy) });
    const track = createElement('div', { className: 'bar-track' });
    const fill = createElement('div', { className: 'bar-fill' });
    fill.style.width = `${Math.max(2, Math.round((Math.abs(Number(item.amount || 0)) / maxAmount) * 100))}%`;
    track.append(fill);
    const amount = createElement('span', { className: 'number', text: formatCurrency(item.amount) });
    row.append(label, track, amount);
    return row;
  });

  elements.summaryChart.replaceChildren(...rows);
}

async function loadTransactions() {
  try {
    const params = queryParams(true);
    const data = await api(`api/transactions.php?${params.toString()}`);
    state.transactions = data.items || [];
    state.total = Number(data.total || 0);
    state.limit = Number(data.limit || state.limit);
    state.offset = Number(data.offset || state.offset);
    renderTransactions();
  } catch (error) {
    showToast(error.message);
  }
}

function appendCell(row, text, className) {
  const cell = createElement('td', { text: text ?? '-' });
  if (className) {
    cell.className = className;
  }
  row.append(cell);
  return cell;
}

function renderTransactions() {
  const start = state.total === 0 ? 0 : state.offset + 1;
  const end = Math.min(state.total, state.offset + state.transactions.length);
  elements.resultCount.textContent = `${start}-${end} / ${state.total}件`;
  elements.prevPageButton.disabled = state.offset <= 0;
  elements.nextPageButton.disabled = state.offset + state.limit >= state.total;

  if (state.transactions.length === 0) {
    const row = createElement('tr');
    const cell = createElement('td', { className: 'empty', text: '明細なし', attrs: { colspan: state.loggedIn ? 16 : 15 } });
    row.append(cell);
    elements.transactionsBody.replaceChildren(row);
    return;
  }

  const rows = state.transactions.map((transaction) => {
    const row = createElement('tr');
    appendCell(row, formatDate(transaction.used_on));
    appendCell(row, transaction.merchant, 'merchant');
    appendCell(row, transaction.card_user);
    appendCell(row, transaction.payment_method);
    appendCell(row, transaction.payment_category);
    appendCell(row, formatCurrency(transaction.usage_amount), 'number');
    appendCell(row, formatCurrency(transaction.fee_amount), 'number');
    appendCell(row, formatCurrency(transaction.total_amount), 'number');
    appendCell(row, formatCurrency(transaction.billing_amount), 'number');
    appendCell(row, formatCurrency(transaction.carried_forward_amount), 'number');
    appendCell(row, formatCurrency(transaction.adjustment_amount), 'number');
    appendCell(row, formatDate(transaction.statement_payment_on));
    appendCell(row, formatDate(transaction.budget_date));
    appendCell(row, formatCurrency(transaction.budget_amount), 'number');

    const labelsCell = createElement('td');
    labelsCell.append(renderTransactionLabels(transaction));
    row.append(labelsCell);

    if (state.loggedIn) {
      const adminCell = createElement('td');
      adminCell.append(renderTransactionAdmin(transaction));
      row.append(adminCell);
    }

    return row;
  });

  elements.transactionsBody.replaceChildren(...rows);
}

function renderTransactionLabels(transaction) {
  const container = createElement('div', { className: 'chips' });
  const labels = transaction.labels || [];
  if (labels.length === 0) {
    container.append(createElement('span', { className: 'muted', text: '-' }));
    return container;
  }

  for (const label of labels) {
    const chip = createElement('span', { className: 'chip' });
    chip.style.color = label.color || '#2563eb';
    chip.append(createElement('span', { text: label.name }));

    if (state.loggedIn) {
      const removeButton = createElement('button', {
        text: '×',
        attrs: { type: 'button', 'aria-label': `${label.name}を外す` },
      });
      removeButton.addEventListener('click', () => unassignLabel(transaction.id, label.id));
      chip.append(removeButton);
    }

    container.append(chip);
  }

  return container;
}

function renderTransactionAdmin(transaction) {
  const container = createElement('div', { className: 'admin-cell' });
  const statuses = [];
  if (transaction.deleted_at) {
    statuses.push(['削除済み', 'deleted']);
  }
  if (transaction.superseded_at) {
    statuses.push(['差替済み', 'superseded']);
  }
  if (transaction.import_deleted_at) {
    statuses.push(['取込削除', 'deleted']);
  }
  if (statuses.length === 0) {
    statuses.push(['有効', '']);
  }

  for (const [text, modifier] of statuses) {
    const status = createElement('span', { className: modifier ? `status ${modifier}` : 'status', text });
    container.append(status);
  }

  const assignRow = createElement('div', { className: 'admin-cell' });
  const select = createElement('select');
  select.append(createElement('option', { text: 'ラベルを選択', attrs: { value: '' } }));
  for (const label of state.labels) {
    select.append(createElement('option', { text: label.name, attrs: { value: label.id } }));
  }
  const assignButton = createElement('button', { text: '付与', attrs: { type: 'button' } });
  assignButton.disabled = state.labels.length === 0;
  assignButton.addEventListener('click', () => {
    if (select.value) {
      assignLabel(transaction.id, select.value);
    }
  });
  assignRow.append(select, assignButton);
  container.append(assignRow);

  const actionButton = createElement('button', {
    className: transaction.deleted_at ? 'secondary' : 'danger',
    text: transaction.deleted_at ? '復元' : '削除',
    attrs: { type: 'button' },
  });
  actionButton.addEventListener('click', () => {
    if (transaction.deleted_at) {
      restoreTransaction(transaction.id);
    } else {
      deleteTransaction(transaction.id);
    }
  });
  container.append(actionButton);

  return container;
}

async function assignLabel(transactionId, labelId) {
  try {
    await api('api/labels.php?action=assign', {
      method: 'POST',
      json: { transaction_id: transactionId, label_id: labelId },
    });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function unassignLabel(transactionId, labelId) {
  try {
    await api(`api/labels.php?action=unassign&transaction_id=${encodeURIComponent(transactionId)}&label_id=${encodeURIComponent(labelId)}`, {
      method: 'DELETE',
    });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteTransaction(id) {
  if (!window.confirm('この明細を削除しますか。')) {
    return;
  }

  try {
    await api(`api/transactions.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function restoreTransaction(id) {
  try {
    await api(`api/transactions.php?action=restore&id=${encodeURIComponent(id)}`, { method: 'POST' });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadImports() {
  try {
    const data = await api('api/imports.php');
    state.imports = data.items || [];
    renderImports();
  } catch (error) {
    showToast(error.message);
  }
}

function renderImports() {
  if (!state.loggedIn || state.imports.length === 0) {
    const row = createElement('tr');
    const cell = createElement('td', { className: 'empty', text: '取込履歴なし', attrs: { colspan: 9 } });
    row.append(cell);
    elements.importsBody.replaceChildren(row);
    return;
  }

  const rows = state.imports.map((item) => {
    const row = createElement('tr');
    appendCell(row, item.imported_at);
    appendCell(row, item.statement_payment_on);
    appendCell(row, item.source_filename);
    appendCell(row, item.row_count, 'number');
    appendCell(row, item.inserted_count, 'number');
    appendCell(row, item.updated_count, 'number');
    appendCell(row, item.superseded_count, 'number');
    const statusCell = createElement('td');
    statusCell.append(createElement('span', {
      className: item.deleted_at ? 'status deleted' : 'status',
      text: item.deleted_at ? '削除済み' : '有効',
    }));
    row.append(statusCell);

    const actionCell = createElement('td');
    const button = createElement('button', {
      className: 'danger',
      text: '削除',
      attrs: { type: 'button' },
    });
    button.disabled = Boolean(item.deleted_at);
    button.addEventListener('click', () => deleteImport(item.id));
    actionCell.append(button);
    row.append(actionCell);
    return row;
  });

  elements.importsBody.replaceChildren(...rows);
}

async function deleteImport(id) {
  if (!window.confirm('この取込を削除しますか。')) {
    return;
  }

  try {
    await api(`api/imports.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

function renderLabelsList() {
  if (!state.loggedIn) {
    elements.labelsList.replaceChildren();
    return;
  }

  if (state.labels.length === 0) {
    elements.labelsList.replaceChildren(createElement('div', { className: 'empty', text: 'ラベルなし' }));
    return;
  }

  const rows = state.labels.map((label) => {
    const row = createElement('div', { className: 'label-row' });
    const name = createElement('input', { attrs: { type: 'text', maxlength: '80' } });
    name.value = label.name;
    const color = createElement('input', { attrs: { type: 'color' } });
    color.value = label.color || '#2563eb';
    const count = createElement('span', { className: 'status', text: `${label.transaction_count}件` });
    const save = createElement('button', { text: '保存', attrs: { type: 'button' } });
    save.addEventListener('click', () => updateLabel(label.id, name.value, color.value));
    const remove = createElement('button', { className: 'danger', text: '削除', attrs: { type: 'button' } });
    remove.addEventListener('click', () => deleteLabel(label.id));
    row.append(name, color, count, save, remove);
    return row;
  });

  elements.labelsList.replaceChildren(...rows);
}

async function updateLabel(id, name, color) {
  try {
    await api(`api/labels.php?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      json: { name, color },
    });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteLabel(id) {
  if (!window.confirm('このラベルを削除しますか。')) {
    return;
  }

  try {
    await api(`api/labels.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshAll();
  } catch (error) {
    showToast(error.message);
  }
}

async function init() {
  bindElements();
  bindEvents();
  await loadSession();
  await refreshAll();
}

init();
