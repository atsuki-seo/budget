const page = document.body.dataset.page || 'transactions';
const appRootUrl = new URL('../', import.meta.url);
const pageUrls = {
  transactions: new URL('./', appRootUrl),
  admin: new URL('admin/', appRootUrl),
};

const state = {
  page,
  csrfToken: '',
  loggedIn: false,
  transactions: [],
  total: 0,
  limit: 100,
  offset: 0,
  imports: [],
  importsTotal: 0,
  importsLimit: 5,
  importsOffset: 0,
  availableMonths: [],
  defaultMonth: '',
  selectedMonthFrom: '',
  selectedMonthTo: '',
  filtersExpanded: true,
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
  if (!elements.toast) {
    return;
  }

  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function apiUrl(path) {
  return new URL(path, appRootUrl).toString();
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

  const response = await fetch(apiUrl(path), init);
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
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

function formatCurrency(value) {
  return yen.format(Number(value || 0));
}

function formatDate(value) {
  return value || '-';
}

function navigateTo(url) {
  window.location.assign(url.toString());
}

function bindCommonElements() {
  elements.loginButton = $('#loginButton');
  elements.adminButton = $('#adminButton');
  elements.transactionsButton = $('#transactionsButton');
  elements.logoutButton = $('#logoutButton');
  elements.loginDialog = $('#loginDialog');
  elements.loginForm = $('#loginForm');
  elements.loginPassword = $('#loginForm input[name="password"]');
  elements.cancelLoginButton = $('#cancelLoginButton');
  elements.toast = $('#toast');
}

function bindTransactionsElements() {
  elements.filtersForm = $('#filtersForm');
  elements.monthFromSelect = $('#filtersForm select[name="date_from_month"]');
  elements.monthToSelect = $('#filtersForm select[name="date_to_month"]');
  elements.filtersToggleButton = $('#filtersToggleButton');
  elements.resetFiltersButton = $('#resetFiltersButton');
  elements.summaryAmount = $('#summaryAmount');
  elements.resultCount = $('#resultCount');
  elements.transactionsBody = $('#transactionsBody');
  elements.prevPageButton = $('#prevPageButton');
  elements.nextPageButton = $('#nextPageButton');
}

function bindAdminElements() {
  elements.adminContent = $('#adminContent');
  elements.importForm = $('#importForm');
  elements.importsBody = $('#importsBody');
  elements.importsResultCount = $('#importsResultCount');
  elements.prevImportsPageButton = $('#prevImportsPageButton');
  elements.nextImportsPageButton = $('#nextImportsPageButton');
}

function showLoginDialog() {
  elements.loginForm.reset();
  if (elements.loginDialog.open) {
    elements.loginPassword.focus();
    return;
  }

  if (typeof elements.loginDialog.showModal === 'function') {
    elements.loginDialog.showModal();
  } else {
    elements.loginDialog.setAttribute('open', '');
  }
  window.requestAnimationFrame(() => {
    elements.loginPassword.focus();
  });
}

function closeLoginDialog() {
  if (typeof elements.loginDialog.close === 'function' && elements.loginDialog.open) {
    elements.loginDialog.close();
    return;
  }

  elements.loginDialog.removeAttribute('open');
}

function bindCommonEvents() {
  if (elements.loginButton) {
    elements.loginButton.addEventListener('click', showLoginDialog);
  }

  if (elements.adminButton) {
    elements.adminButton.addEventListener('click', () => navigateTo(pageUrls.admin));
  }

  if (elements.transactionsButton) {
    elements.transactionsButton.addEventListener('click', () => navigateTo(pageUrls.transactions));
  }

  elements.cancelLoginButton.addEventListener('click', () => {
    if (state.page === 'admin') {
      navigateTo(pageUrls.transactions);
      return;
    }

    closeLoginDialog();
  });

  elements.loginDialog.addEventListener('cancel', (event) => {
    if (state.page !== 'admin') {
      return;
    }

    event.preventDefault();
    navigateTo(pageUrls.transactions);
  });

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    try {
      if (!state.csrfToken) {
        await loadSession();
      }

      const data = await api('api/session.php', {
        method: 'POST',
        json: { password: formData.get('password') || '' },
      });
      state.loggedIn = Boolean(data.logged_in);
      state.csrfToken = data.csrf_token || state.csrfToken;
      closeLoginDialog();

      if (state.page === 'transactions') {
        navigateTo(pageUrls.admin);
        return;
      }

      renderAuth();
      await loadImports();
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.logoutButton.addEventListener('click', async () => {
    try {
      await api('api/session.php', { method: 'DELETE' });
      state.loggedIn = false;
      state.csrfToken = '';

      if (state.page === 'admin') {
        navigateTo(pageUrls.transactions);
        return;
      }

      await loadSession();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function bindTransactionsEvents() {
  bindFiltersToggle();

  elements.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  elements.filtersForm.addEventListener('change', async (event) => {
    event.preventDefault();
    updateSelectedMonthsFromControls(event.target);
    renderMonthFilters();
    state.offset = 0;
    await refreshData();
  });

  elements.resetFiltersButton.addEventListener('click', async () => {
    resetMonthFilters();
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
}

function bindAdminEvents() {
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
      state.importsOffset = 0;
      await loadImports();
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.prevImportsPageButton.addEventListener('click', async () => {
    state.importsOffset = Math.max(0, state.importsOffset - state.importsLimit);
    await loadImports();
  });

  elements.nextImportsPageButton.addEventListener('click', async () => {
    state.importsOffset += state.importsLimit;
    await loadImports();
  });
}

function bindFiltersToggle() {
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  state.filtersExpanded = !mobileQuery.matches;

  elements.filtersToggleButton.addEventListener('click', () => {
    state.filtersExpanded = !state.filtersExpanded;
    renderFiltersPanel(mobileQuery.matches);
  });

  const handleViewportChange = (event) => {
    renderFiltersPanel(event.matches);
  };

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', handleViewportChange);
  } else {
    mobileQuery.addListener(handleViewportChange);
  }

  renderFiltersPanel(mobileQuery.matches);
}

function renderFiltersPanel(isMobile) {
  elements.filtersToggleButton.hidden = !isMobile;

  const expanded = !isMobile || state.filtersExpanded;
  elements.filtersForm.hidden = !expanded;
  elements.filtersToggleButton.setAttribute('aria-expanded', String(expanded));
  elements.filtersToggleButton.textContent = expanded ? '条件を隠す' : '条件を表示';
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
  if (state.page === 'transactions') {
    elements.loginButton.hidden = state.loggedIn;
    elements.adminButton.hidden = !state.loggedIn;
    elements.logoutButton.hidden = !state.loggedIn;
    return;
  }

  elements.adminContent.hidden = !state.loggedIn;
  elements.logoutButton.hidden = !state.loggedIn;
}

function isMonthValue(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function monthToDateFrom(month) {
  return `${month}-01`;
}

function monthToDateTo(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(year, monthNumber, 0).getDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

function selectedMonthRangeDates() {
  if (!isMonthValue(state.selectedMonthFrom) || !isMonthValue(state.selectedMonthTo)) {
    return null;
  }

  return {
    dateFrom: monthToDateFrom(state.selectedMonthFrom),
    dateTo: monthToDateTo(state.selectedMonthTo),
  };
}

function queryParams({ includePaging = false, includeGroupBy = false } = {}) {
  const params = new URLSearchParams();
  params.set('amount_basis', 'billing');

  const range = selectedMonthRangeDates();
  if (range !== null) {
    params.set('date_from', range.dateFrom);
    params.set('date_to', range.dateTo);
  }

  if (includeGroupBy) {
    params.set('group_by', 'month');
  }

  if (includePaging) {
    params.set('limit', String(state.limit));
    params.set('offset', String(state.offset));
  }

  return params;
}

function setDefaultMonthSelection() {
  state.selectedMonthFrom = state.defaultMonth;
  state.selectedMonthTo = state.defaultMonth;
}

function resetMonthFilters() {
  setDefaultMonthSelection();
  renderMonthFilters();
}

function ensureSelectedMonthRange() {
  if (state.availableMonths.length === 0) {
    state.selectedMonthFrom = '';
    state.selectedMonthTo = '';
    return;
  }

  if (
    !state.availableMonths.includes(state.selectedMonthFrom)
    || !state.availableMonths.includes(state.selectedMonthTo)
    || state.selectedMonthFrom > state.selectedMonthTo
  ) {
    setDefaultMonthSelection();
  }
}

function updateSelectedMonthsFromControls(changedControl) {
  if (state.availableMonths.length === 0) {
    ensureSelectedMonthRange();
    return;
  }

  let monthFrom = elements.monthFromSelect.value;
  let monthTo = elements.monthToSelect.value;

  if (!state.availableMonths.includes(monthFrom)) {
    monthFrom = state.defaultMonth;
  }
  if (!state.availableMonths.includes(monthTo)) {
    monthTo = state.defaultMonth;
  }

  if (monthFrom > monthTo) {
    if (changedControl === elements.monthToSelect) {
      monthFrom = monthTo;
    } else {
      monthTo = monthFrom;
    }
  }

  state.selectedMonthFrom = monthFrom;
  state.selectedMonthTo = monthTo;
}

function renderMonthSelect(select, months, selectedMonth) {
  if (months.length === 0) {
    select.replaceChildren(createElement('option', { text: 'データなし', attrs: { value: '' } }));
    select.value = '';
    select.disabled = true;
    return;
  }

  const options = months.map((month) => createElement('option', { text: month, attrs: { value: month } }));
  select.replaceChildren(...options);
  select.value = selectedMonth;
  select.disabled = false;
}

function renderMonthFilters() {
  ensureSelectedMonthRange();

  if (state.availableMonths.length === 0) {
    renderMonthSelect(elements.monthFromSelect, [], '');
    renderMonthSelect(elements.monthToSelect, [], '');
    elements.resetFiltersButton.hidden = true;
    return;
  }

  const monthsForStart = state.availableMonths.filter((month) => month <= state.selectedMonthTo);
  const monthsForEnd = state.availableMonths.filter((month) => month >= state.selectedMonthFrom);

  renderMonthSelect(elements.monthFromSelect, monthsForStart, state.selectedMonthFrom);
  renderMonthSelect(elements.monthToSelect, monthsForEnd, state.selectedMonthTo);
  elements.resetFiltersButton.hidden = (
    state.selectedMonthFrom === state.defaultMonth
    && state.selectedMonthTo === state.defaultMonth
  );
}

async function loadAvailableMonths() {
  try {
    const params = new URLSearchParams({
      amount_basis: 'billing',
      group_by: 'month',
    });
    const data = await api(`api/summary.php?${params.toString()}`);
    const months = (data.items || [])
      .map((item) => String(item.period_start || '').slice(0, 7))
      .filter(isMonthValue)
      .filter((month, index, all) => all.indexOf(month) === index)
      .sort();

    const previousMonthFrom = state.selectedMonthFrom;
    const previousMonthTo = state.selectedMonthTo;
    state.availableMonths = months;
    state.defaultMonth = months.length === 0 ? '' : months[months.length - 1];

    if (
      months.includes(previousMonthFrom)
      && months.includes(previousMonthTo)
      && previousMonthFrom <= previousMonthTo
    ) {
      state.selectedMonthFrom = previousMonthFrom;
      state.selectedMonthTo = previousMonthTo;
    } else {
      setDefaultMonthSelection();
    }

    renderMonthFilters();
  } catch (error) {
    state.availableMonths = [];
    state.defaultMonth = '';
    setDefaultMonthSelection();
    renderMonthFilters();
    showToast(error.message);
  }
}

async function refreshData() {
  if (state.availableMonths.length === 0) {
    state.offset = 0;
    state.transactions = [];
    state.total = 0;
    renderSummary([]);
    renderTransactions();
    return;
  }

  await Promise.all([loadSummary(), loadTransactions()]);
}

async function loadSummary() {
  try {
    const params = queryParams({ includeGroupBy: true });
    const data = await api(`api/summary.php?${params.toString()}`);
    renderSummary(data.items || []);
  } catch (error) {
    showToast(error.message);
  }
}

function renderSummary(items) {
  const totalAmount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  elements.summaryAmount.textContent = formatCurrency(totalAmount);
}

async function loadTransactions() {
  try {
    if (state.availableMonths.length === 0) {
      state.transactions = [];
      state.total = 0;
      state.offset = 0;
      renderTransactions();
      return;
    }

    const params = queryParams({ includePaging: true });
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

function appendCell(row, label, text, className) {
  const cell = createElement('td', {
    text: text ?? '-',
    attrs: { 'data-label': label },
  });
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
    const cell = createElement('td', { className: 'empty', text: '明細なし', attrs: { colspan: 14 } });
    row.append(cell);
    elements.transactionsBody.replaceChildren(row);
    return;
  }

  const rows = state.transactions.map((transaction) => {
    const row = createElement('tr');
    appendCell(row, '利用日', formatDate(transaction.used_on));
    appendCell(row, '店名', transaction.merchant, 'merchant');
    appendCell(row, '利用者', transaction.card_user);
    appendCell(row, '決済方法', transaction.payment_method);
    appendCell(row, '支払区分', transaction.payment_category);
    appendCell(row, '利用金額', formatCurrency(transaction.usage_amount), 'number');
    appendCell(row, '手数料', formatCurrency(transaction.fee_amount), 'number');
    appendCell(row, '支払総額', formatCurrency(transaction.total_amount), 'number');
    appendCell(row, '当月支払', formatCurrency(transaction.billing_amount), 'number');
    appendCell(row, '繰越', formatCurrency(transaction.carried_forward_amount), 'number');
    appendCell(row, '調整', formatCurrency(transaction.adjustment_amount), 'number');
    appendCell(row, '当月お支払日', formatDate(transaction.statement_payment_on));
    appendCell(row, '計上日', formatDate(transaction.budget_date));
    appendCell(row, '計上額', formatCurrency(transaction.budget_amount), 'number');
    return row;
  });

  elements.transactionsBody.replaceChildren(...rows);
}

async function loadImports() {
  try {
    const params = new URLSearchParams({
      limit: String(state.importsLimit),
      offset: String(state.importsOffset),
    });
    const data = await api(`api/imports.php?${params.toString()}`);
    state.imports = data.items || [];
    state.importsTotal = Number(data.total || 0);
    state.importsLimit = Number(data.limit || state.importsLimit);
    state.importsOffset = Number(data.offset || state.importsOffset);

    if (state.imports.length === 0 && state.importsTotal > 0 && state.importsOffset >= state.importsTotal) {
      state.importsOffset = Math.max(0, state.importsOffset - state.importsLimit);
      await loadImports();
      return;
    }

    renderImports();
  } catch (error) {
    if (error.status === 401) {
      state.loggedIn = false;
      renderAuth();
      showLoginDialog();
      return;
    }

    showToast(error.message);
  }
}

function renderImports() {
  const start = state.importsTotal === 0 ? 0 : state.importsOffset + 1;
  const end = Math.min(state.importsTotal, state.importsOffset + state.imports.length);
  elements.importsResultCount.textContent = `${start}-${end} / ${state.importsTotal}件`;
  elements.prevImportsPageButton.disabled = state.importsOffset <= 0;
  elements.nextImportsPageButton.disabled = state.importsOffset + state.importsLimit >= state.importsTotal;

  if (state.imports.length === 0) {
    const row = createElement('tr');
    const cell = createElement('td', { className: 'empty', text: '取込履歴なし', attrs: { colspan: 9 } });
    row.append(cell);
    elements.importsBody.replaceChildren(row);
    return;
  }

  const rows = state.imports.map((item) => {
    const row = createElement('tr');
    appendCell(row, '取込日時', item.imported_at);
    appendCell(row, '支払日', item.statement_payment_on);
    appendCell(row, 'CSV', item.source_filename, 'wrap-cell');
    appendCell(row, '件数', item.row_count, 'number');
    appendCell(row, '追加', item.inserted_count, 'number');
    appendCell(row, '更新', item.updated_count, 'number');
    appendCell(row, '差替', item.superseded_count, 'number');
    const statusCell = createElement('td', { attrs: { 'data-label': '状態' } });
    statusCell.append(createElement('span', {
      className: 'status',
      text: '有効',
    }));
    row.append(statusCell);

    const actionCell = createElement('td', { attrs: { 'data-label': '操作' } });
    const button = createElement('button', {
      className: 'danger',
      text: '削除',
      attrs: { type: 'button' },
    });
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
    await loadImports();
  } catch (error) {
    showToast(error.message);
  }
}

async function initTransactionsPage() {
  bindTransactionsElements();
  bindTransactionsEvents();
  await loadSession();
  await loadAvailableMonths();
  await refreshData();
}

async function initAdminPage() {
  bindAdminElements();
  bindAdminEvents();
  await loadSession();

  if (state.loggedIn) {
    await loadImports();
  } else {
    showLoginDialog();
  }
}

async function init() {
  bindCommonElements();
  bindCommonEvents();

  if (state.page === 'admin') {
    await initAdminPage();
  } else {
    await initTransactionsPage();
  }
}

init();
