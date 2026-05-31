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
  imports: [],
  importsTotal: 0,
  importsLimit: 5,
  importsOffset: 0,
  availableMonths: [],
  defaultMonth: '',
  selectedMonthFrom: '',
  selectedMonthTo: '',
};

const manualPaymentMethods = [
  'Apple Pay',
  'Apple Pay QUICPay',
  'Apple Pay タッチ決済',
  'PayPayカード ゴールド',
  'PayPayクレジット',
  'タッチ決済',
  '銀行口座',
  '現金',
];
const manualReceivingMethods = [
  '現金',
  '銀行口座',
];
const nonCardPaymentMethods = new Set(['銀行口座', '現金']);
const manualInstallmentCounts = [2, 3, 5, 6, 10, 12, 15, 18, 20, 24, 30, 36, 48];
const maxIntegerAmount = 2147483647;

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
  elements.resetFiltersButton = $('#resetFiltersButton');
  elements.summaryIncomeAmount = $('#summaryIncomeAmount');
  elements.summaryExpenseAmount = $('#summaryExpenseAmount');
  elements.incomeResultCount = $('#incomeResultCount');
  elements.expenseResultCount = $('#expenseResultCount');
  elements.incomeTransactionsBody = $('#incomeTransactionsBody');
  elements.expenseTransactionsBody = $('#expenseTransactionsBody');
}

function bindAdminElements() {
  elements.adminContent = $('#adminContent');
  elements.openManualDialogButton = $('#openManualDialogButton');
  elements.manualEntryDialog = $('#manualEntryDialog');
  elements.manualEntryForm = $('#manualEntryForm');
  elements.cancelManualEntryButton = $('#cancelManualEntryButton');
  elements.manualTransactionType = [...document.querySelectorAll('input[name="transaction_type"]')];
  elements.manualUsedOnLabel = $('#manualUsedOnLabel');
  elements.manualUsedOn = $('#manualUsedOn');
  elements.manualMerchantLabel = $('#manualMerchantLabel');
  elements.manualMerchant = $('#manualMerchant');
  elements.manualPaymentMethodLabel = $('#manualPaymentMethodLabel');
  elements.manualPaymentMethod = $('#manualPaymentMethod');
  elements.manualAmount = $('#manualAmount');
  elements.manualCardDetails = $('#manualCardDetails');
  elements.manualStatementPaymentOn = $('#manualStatementPaymentOn');
  elements.manualInstallmentControls = $('#manualInstallmentControls');
  elements.manualInstallmentCount = $('#manualInstallmentCount');
  elements.manualInstallmentNumber = $('#manualInstallmentNumber');
  elements.manualContinue = $('#manualContinue');
  elements.manualPaymentCategoryMode = [...document.querySelectorAll('input[name="payment_category_mode"]')];
  elements.manualErrors = {
    transactionType: $('#manualTransactionTypeError'),
    usedOn: $('#manualUsedOnError'),
    merchant: $('#manualMerchantError'),
    paymentMethod: $('#manualPaymentMethodError'),
    amount: $('#manualAmountError'),
    statementPaymentOn: $('#manualStatementPaymentOnError'),
    paymentCategory: $('#manualPaymentCategoryError'),
  };
  elements.importForm = $('#importForm');
  elements.csvFile = $('#csvFile');
  elements.importSubmitButton = $('#importSubmitButton');
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

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
  );
}

function normalizeManualAmount(value) {
  const amount = String(value || '').trim().replace(/[,\s\u3000]/g, '');
  if (!/^\d+$/.test(amount)) {
    return null;
  }

  const withoutLeadingZeroes = amount.replace(/^0+/, '');
  if (withoutLeadingZeroes === '') {
    return null;
  }

  if (
    withoutLeadingZeroes.length > 10
    || (withoutLeadingZeroes.length === 10 && withoutLeadingZeroes > String(maxIntegerAmount))
  ) {
    return null;
  }

  return Number(withoutLeadingZeroes);
}

function isManualCardPaymentMethod(paymentMethod) {
  return manualPaymentMethods.includes(paymentMethod) && !nonCardPaymentMethods.has(paymentMethod);
}

function replaceSelectOptions(select, values, selectedValue = '') {
  const options = values.map((value) => createElement('option', {
    text: value,
    attrs: { value },
  }));
  select.replaceChildren(...options);
  if (selectedValue !== '' && values.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function selectedManualTransactionType() {
  const selected = elements.manualTransactionType.find((input) => input.checked);
  return selected ? selected.value : 'expense';
}

function setManualTransactionType(transactionType) {
  for (const input of elements.manualTransactionType) {
    input.checked = input.value === transactionType;
  }
  updateManualTransactionTypeControls();
}

function selectedPaymentCategoryMode() {
  const selected = elements.manualPaymentCategoryMode.find((input) => input.checked);
  return selected ? selected.value : 'one_time';
}

function setPaymentCategoryMode(mode) {
  for (const input of elements.manualPaymentCategoryMode) {
    input.checked = input.value === mode;
  }
  updateManualPaymentCategoryControls();
}

function updateManualInstallmentNumbers() {
  const count = Number(elements.manualInstallmentCount.value || manualInstallmentCounts[0]);
  const currentNumber = Number(elements.manualInstallmentNumber.value || 1);
  const numbers = Array.from({ length: count }, (_, index) => String(index + 1));
  replaceSelectOptions(
    elements.manualInstallmentNumber,
    numbers,
    String(Math.min(Math.max(currentNumber, 1), count))
  );
}

function updateManualPaymentCategoryControls() {
  const isInstallment = selectedPaymentCategoryMode() === 'installment';
  elements.manualInstallmentControls.hidden = !isInstallment;
  if (isInstallment) {
    updateManualInstallmentNumbers();
  }
}

function updateManualPaymentMethodControls() {
  const isIncome = selectedManualTransactionType() === 'income';
  if (isIncome) {
    elements.manualUsedOnLabel.textContent = '受取日';
    elements.manualMerchantLabel.textContent = '摘要';
    elements.manualPaymentMethodLabel.textContent = '受取方法';
    elements.manualCardDetails.hidden = true;
    elements.manualStatementPaymentOn.disabled = true;
    elements.manualInstallmentCount.disabled = true;
    elements.manualInstallmentNumber.disabled = true;
    for (const input of elements.manualPaymentCategoryMode) {
      input.disabled = true;
    }
    elements.manualStatementPaymentOn.value = elements.manualUsedOn.value;
    setPaymentCategoryMode('one_time');
    return;
  }

  const isCard = isManualCardPaymentMethod(elements.manualPaymentMethod.value);
  elements.manualMerchantLabel.textContent = '店名・商品名';
  elements.manualPaymentMethodLabel.textContent = '決済方法';
  elements.manualUsedOnLabel.textContent = isCard ? '利用日' : '支払日';
  elements.manualCardDetails.hidden = !isCard;
  elements.manualStatementPaymentOn.disabled = !isCard;
  elements.manualInstallmentCount.disabled = !isCard;
  elements.manualInstallmentNumber.disabled = !isCard;
  for (const input of elements.manualPaymentCategoryMode) {
    input.disabled = !isCard;
  }

  if (!isCard) {
    elements.manualStatementPaymentOn.value = elements.manualUsedOn.value;
    setPaymentCategoryMode('one_time');
  } else {
    updateManualPaymentCategoryControls();
  }
}

function updateManualTransactionTypeControls() {
  const isIncome = selectedManualTransactionType() === 'income';
  const options = isIncome ? manualReceivingMethods : manualPaymentMethods;
  const currentPaymentMethod = elements.manualPaymentMethod.value;
  replaceSelectOptions(
    elements.manualPaymentMethod,
    options,
    options.includes(currentPaymentMethod) ? currentPaymentMethod : options[0]
  );
  updateManualPaymentMethodControls();
}

function initializeManualEntryControls() {
  replaceSelectOptions(elements.manualPaymentMethod, manualPaymentMethods, manualPaymentMethods[0]);
  replaceSelectOptions(
    elements.manualInstallmentCount,
    manualInstallmentCounts.map((value) => String(value)),
    String(manualInstallmentCounts[0])
  );
  updateManualInstallmentNumbers();
}

function clearManualErrors() {
  for (const error of Object.values(elements.manualErrors)) {
    error.textContent = '';
  }

  for (const input of [
    ...elements.manualTransactionType,
    elements.manualUsedOn,
    elements.manualMerchant,
    elements.manualPaymentMethod,
    elements.manualAmount,
    elements.manualStatementPaymentOn,
    elements.manualInstallmentCount,
    elements.manualInstallmentNumber,
  ]) {
    input.removeAttribute('aria-invalid');
  }
}

function setManualError(field, message) {
  elements.manualErrors[field].textContent = message;
}

function renderManualErrors(errors) {
  clearManualErrors();

  const fieldInputs = {
    transactionType: elements.manualTransactionType[0],
    usedOn: elements.manualUsedOn,
    merchant: elements.manualMerchant,
    paymentMethod: elements.manualPaymentMethod,
    amount: elements.manualAmount,
    statementPaymentOn: elements.manualStatementPaymentOn,
    paymentCategory: elements.manualInstallmentCount,
  };

  for (const [field, message] of Object.entries(errors)) {
    setManualError(field, message);
    if (fieldInputs[field]) {
      fieldInputs[field].setAttribute('aria-invalid', 'true');
    }
  }
}

function focusFirstManualError(errors) {
  const fields = ['transactionType', 'paymentMethod', 'usedOn', 'merchant', 'amount', 'statementPaymentOn', 'paymentCategory'];
  const fieldInputs = {
    transactionType: elements.manualTransactionType[0],
    usedOn: elements.manualUsedOn,
    merchant: elements.manualMerchant,
    paymentMethod: elements.manualPaymentMethod,
    amount: elements.manualAmount,
    statementPaymentOn: elements.manualStatementPaymentOn,
    paymentCategory: elements.manualInstallmentCount,
  };

  const firstField = fields.find((field) => errors[field]);
  if (firstField && fieldInputs[firstField]) {
    fieldInputs[firstField].focus();
  }
}

function manualPaymentCategoryValue() {
  if (selectedPaymentCategoryMode() !== 'installment') {
    return '1回';
  }

  return `均等 ${elements.manualInstallmentNumber.value}／${elements.manualInstallmentCount.value}`;
}

function validateManualEntryForm() {
  const errors = {};
  const transactionType = selectedManualTransactionType();
  const usedOn = elements.manualUsedOn.value;
  const merchant = elements.manualMerchant.value.trim();
  const paymentMethod = elements.manualPaymentMethod.value;
  const amount = normalizeManualAmount(elements.manualAmount.value);
  const isIncome = transactionType === 'income';
  const isCard = isManualCardPaymentMethod(paymentMethod);

  if (!['expense', 'income'].includes(transactionType)) {
    errors.transactionType = '種別を選択してください。';
  }

  if (!isValidDateValue(usedOn)) {
    errors.usedOn = isIncome
      ? '有効な受取日を入力してください。'
      : (isCard ? '有効な利用日を入力してください。' : '有効な支払日を入力してください。');
  }

  if (merchant === '') {
    errors.merchant = isIncome ? '摘要を入力してください。' : '店名・商品名を入力してください。';
  } else if (merchant.length > 255) {
    errors.merchant = isIncome ? '摘要は255文字以内で入力してください。' : '店名・商品名は255文字以内で入力してください。';
  }

  if (isIncome) {
    if (!manualReceivingMethods.includes(paymentMethod)) {
      errors.paymentMethod = '受取方法を選択してください。';
    }
  } else if (!manualPaymentMethods.includes(paymentMethod)) {
    errors.paymentMethod = '決済方法を選択してください。';
  }

  if (amount === null) {
    errors.amount = '1円以上の整数を入力してください。';
  }

  let statementPaymentOn = usedOn;
  let paymentCategory = '1回';
  if (!isIncome && isCard) {
    statementPaymentOn = elements.manualStatementPaymentOn.value;
    paymentCategory = manualPaymentCategoryValue();
    if (!isValidDateValue(statementPaymentOn)) {
      errors.statementPaymentOn = '有効な支払日を入力してください。';
    }

    if (selectedPaymentCategoryMode() === 'installment') {
      const installmentCount = Number(elements.manualInstallmentCount.value);
      const installmentNumber = Number(elements.manualInstallmentNumber.value);
      if (!manualInstallmentCounts.includes(installmentCount)) {
        errors.paymentCategory = '分割回数を選択してください。';
      } else if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > installmentCount) {
        errors.paymentCategory = '何回目は分割回数以内で選択してください。';
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    renderManualErrors(errors);
    focusFirstManualError(errors);
    return null;
  }

  clearManualErrors();
  if (isIncome) {
    return {
      transaction_type: 'income',
      received_on: usedOn,
      description: merchant,
      receiving_method: paymentMethod,
      amount,
    };
  }

  return {
    transaction_type: 'expense',
    used_on: usedOn,
    merchant,
    payment_method: paymentMethod,
    amount,
    statement_payment_on: statementPaymentOn,
    payment_category: paymentCategory,
  };
}

function resetManualEntryForm() {
  elements.manualEntryForm.reset();
  clearManualErrors();

  const today = localDateValue();
  elements.manualUsedOn.value = today;
  elements.manualStatementPaymentOn.value = today;
  setManualTransactionType('expense');
  elements.manualPaymentMethod.value = manualPaymentMethods[0];
  elements.manualInstallmentCount.value = String(manualInstallmentCounts[0]);
  updateManualInstallmentNumbers();
  setPaymentCategoryMode('one_time');
  updateManualPaymentMethodControls();
}

function showManualEntryDialog() {
  resetManualEntryForm();
  if (elements.manualEntryDialog.open) {
    elements.manualTransactionType[0].focus();
    return;
  }

  if (typeof elements.manualEntryDialog.showModal === 'function') {
    elements.manualEntryDialog.showModal();
  } else {
    elements.manualEntryDialog.setAttribute('open', '');
  }
  window.requestAnimationFrame(() => {
    elements.manualTransactionType[0].focus();
  });
}

function closeManualEntryDialog() {
  if (typeof elements.manualEntryDialog.close === 'function' && elements.manualEntryDialog.open) {
    elements.manualEntryDialog.close();
    return;
  }

  elements.manualEntryDialog.removeAttribute('open');
}

function prepareNextManualEntry() {
  clearManualErrors();
  elements.manualMerchant.value = '';
  elements.manualAmount.value = '';
  updateManualTransactionTypeControls();
  window.requestAnimationFrame(() => {
    elements.manualMerchant.focus();
  });
}

async function submitManualEntry(event) {
  event.preventDefault();
  const payload = validateManualEntryForm();
  if (payload === null) {
    return;
  }

  const submitButton = elements.manualEntryForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    await api('api/transactions.php', {
      method: 'POST',
      json: payload,
    });
    state.importsOffset = 0;
    await loadImports();
    showToast('追加しました。');

    if (elements.manualContinue.checked) {
      prepareNextManualEntry();
    } else {
      closeManualEntryDialog();
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

function updateImportSubmitState() {
  elements.importSubmitButton.disabled = elements.csvFile.files.length === 0;
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

  elements.loginPassword.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }

    event.preventDefault();
    if (typeof elements.loginForm.requestSubmit === 'function') {
      elements.loginForm.requestSubmit();
    } else {
      elements.loginForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
  elements.filtersForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  elements.filtersForm.addEventListener('change', async (event) => {
    event.preventDefault();
    updateSelectedMonthsFromControls(event.target);
    renderMonthFilters();
    await refreshData();
  });

  elements.resetFiltersButton.addEventListener('click', async () => {
    resetMonthFilters();
    await refreshData();
  });
}

function bindAdminEvents() {
  initializeManualEntryControls();
  updateImportSubmitState();

  elements.openManualDialogButton.addEventListener('click', showManualEntryDialog);

  elements.cancelManualEntryButton.addEventListener('click', closeManualEntryDialog);

  elements.manualEntryForm.addEventListener('submit', submitManualEntry);

  elements.manualUsedOn.addEventListener('change', () => {
    if (
      selectedManualTransactionType() === 'income'
      || !isManualCardPaymentMethod(elements.manualPaymentMethod.value)
    ) {
      elements.manualStatementPaymentOn.value = elements.manualUsedOn.value;
    }
  });

  for (const input of elements.manualTransactionType) {
    input.addEventListener('change', updateManualTransactionTypeControls);
  }

  elements.manualPaymentMethod.addEventListener('change', updateManualPaymentMethodControls);

  for (const input of elements.manualPaymentCategoryMode) {
    input.addEventListener('change', updateManualPaymentCategoryControls);
  }

  elements.manualInstallmentCount.addEventListener('change', updateManualInstallmentNumbers);

  elements.csvFile.addEventListener('change', updateImportSubmitState);

  elements.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.importForm);
    const file = formData.get('csv');
    if (!(file instanceof File) || file.name === '') {
      updateImportSubmitState();
      showToast('CSVファイルを選択してください。');
      return;
    }

    elements.importSubmitButton.disabled = true;
    try {
      await api('api/imports.php', {
        method: 'POST',
        body: formData,
      });
      elements.importForm.reset();
      updateImportSubmitState();
      state.importsOffset = 0;
      await loadImports();
    } catch (error) {
      updateImportSubmitState();
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

function queryParams() {
  const params = new URLSearchParams();

  const range = selectedMonthRangeDates();
  if (range !== null) {
    params.set('date_from', range.dateFrom);
    params.set('date_to', range.dateTo);
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
    const data = await api('api/summary.php');
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
    const params = queryParams();
    const data = await api(`api/summary.php?${params.toString()}`);
    renderSummary(data.items || []);
  } catch (error) {
    showToast(error.message);
  }
}

function renderSummary(items) {
  const incomeAmount = items.reduce((sum, item) => sum + Number(item.income_amount || 0), 0);
  const expenseAmount = items.reduce((sum, item) => sum + Number(item.expense_amount || 0), 0);
  elements.summaryIncomeAmount.textContent = formatCurrency(incomeAmount);
  elements.summaryExpenseAmount.textContent = formatCurrency(expenseAmount);
}

async function loadTransactions() {
  try {
    if (state.availableMonths.length === 0) {
      state.transactions = [];
      state.total = 0;
      renderTransactions();
      return;
    }

    const params = queryParams();
    const data = await api(`api/transactions.php?${params.toString()}`);
    state.transactions = data.items || [];
    state.total = Number(data.total || 0);
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

function renderEmptyRow(body, message, colspan) {
  const row = createElement('tr');
  const cell = createElement('td', { className: 'empty', text: message, attrs: { colspan } });
  row.append(cell);
  body.replaceChildren(row);
}

function renderIncomeTransactions(transactions) {
  elements.incomeResultCount.textContent = `${transactions.length}件`;

  if (transactions.length === 0) {
    renderEmptyRow(elements.incomeTransactionsBody, '収入明細なし', 4);
    return;
  }

  const rows = transactions.map((transaction) => {
    const row = createElement('tr');
    appendCell(row, '受取日', formatDate(transaction.statement_payment_on));
    appendCell(row, '摘要', transaction.merchant, 'merchant');
    appendCell(row, '受取方法', transaction.payment_method);
    appendCell(row, '金額', formatCurrency(transaction.billing_amount), 'number');
    return row;
  });

  elements.incomeTransactionsBody.replaceChildren(...rows);
}

function renderExpenseTransactions(transactions) {
  elements.expenseResultCount.textContent = `${transactions.length}件`;

  if (transactions.length === 0) {
    renderEmptyRow(elements.expenseTransactionsBody, '支出明細なし', 9);
    return;
  }

  const rows = transactions.map((transaction) => {
    const row = createElement('tr');
    appendCell(row, '支払日', formatDate(transaction.statement_payment_on));
    appendCell(row, '店名', transaction.merchant, 'merchant');
    appendCell(row, '利用者', transaction.card_user);
    appendCell(row, '決済方法', transaction.payment_method);
    appendCell(row, '支払区分', transaction.payment_category);
    appendCell(row, '当月支払', formatCurrency(transaction.billing_amount), 'number');
    appendCell(row, '利用金額', formatCurrency(transaction.usage_amount), 'number');
    appendCell(row, '繰越', formatCurrency(transaction.carried_forward_amount), 'number');
    appendCell(row, '調整', formatCurrency(transaction.adjustment_amount), 'number');
    return row;
  });

  elements.expenseTransactionsBody.replaceChildren(...rows);
}

function renderTransactions() {
  const incomeTransactions = state.transactions.filter((transaction) => transaction.transaction_type === 'income');
  const expenseTransactions = state.transactions.filter((transaction) => transaction.transaction_type !== 'income');
  renderIncomeTransactions(incomeTransactions);
  renderExpenseTransactions(expenseTransactions);
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
    const cell = createElement('td', { className: 'empty', text: '取込履歴なし', attrs: { colspan: 5 } });
    row.append(cell);
    elements.importsBody.replaceChildren(row);
    return;
  }

  const rows = state.imports.map((item) => {
    const row = createElement('tr');
    appendCell(row, '取込日時', item.imported_at);
    appendCell(row, '支払日', item.statement_payment_on);
    appendCell(row, 'データ元', item.source_filename, 'wrap-cell');
    appendCell(row, '件数', item.row_count, 'number');

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
