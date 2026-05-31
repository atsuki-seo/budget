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
  manualTransactions: [],
  manualTransactionsTotal: 0,
  manualTransactionsLimit: 5,
  manualTransactionsOffset: 0,
  manualTransactionsType: 'expense',
  availableMonths: [],
  defaultMonth: '',
  selectedMonthFrom: '',
  selectedMonthTo: '',
  tableFilters: {
    income: {
      payment_method: new Set(),
    },
    expense: {
      card_user: new Set(),
      payment_method: new Set(),
      payment_category: new Set(),
    },
  },
  openTableFilter: null,
  editingTransaction: null,
};

const defaultManualPaymentMethod = 'PayPayカード ゴールド';
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
const manualCardUsers = [
  '本人',
  '家族',
];
const nonCardPaymentMethods = new Set(['銀行口座', '現金']);
const manualInstallmentCounts = [2, 3, 5, 6, 10, 12, 15, 18, 20, 24, 30, 36, 48];
const maxIntegerAmount = 2147483647;
const tableFilterDefinitions = {
  income: [
    {
      key: 'payment_method',
      label: '受取方法',
      value: (transaction) => normalizeFilterValue(transaction.payment_method),
    },
  ],
  expense: [
    {
      key: 'card_user',
      label: '利用者',
      value: (transaction) => normalizeCardUserFilterValue(transaction.card_user),
    },
    {
      key: 'payment_method',
      label: '決済方法',
      value: (transaction) => normalizeFilterValue(transaction.payment_method),
    },
    {
      key: 'payment_category',
      label: '支払区分',
      value: (transaction) => normalizePaymentCategoryFilterValue(transaction.payment_category),
      sort: (a, b) => ['1回', '分割'].indexOf(a) - ['1回', '分割'].indexOf(b),
    },
  ],
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
  elements.closeLoginDialogButton = $('#closeLoginDialogButton');
  elements.transactionDialog = $('#transactionDialog');
  elements.transactionForm = $('#transactionForm');
  elements.closeTransactionDialogButton = $('#closeTransactionDialogButton');
  elements.cancelTransactionButton = $('#cancelTransactionButton');
  elements.saveTransactionButton = $('#saveTransactionButton');
  elements.deleteTransactionButton = $('#deleteTransactionButton');
  elements.transactionDialogTitle = $('#transactionDialogTitle');
  elements.transactionReadonlyNotice = $('#transactionReadonlyNotice');
  elements.transactionStatementPaymentOnLabel = $('#transactionStatementPaymentOnLabel');
  elements.transactionStatementPaymentOn = $('#transactionStatementPaymentOn');
  elements.transactionUsedOnGroup = $('#transactionUsedOnGroup');
  elements.transactionUsedOn = $('#transactionUsedOn');
  elements.transactionMerchantLabel = $('#transactionMerchantLabel');
  elements.transactionMerchant = $('#transactionMerchant');
  elements.transactionCardUser = $('#transactionCardUser');
  elements.transactionPaymentMethodLabel = $('#transactionPaymentMethodLabel');
  elements.transactionPaymentMethod = $('#transactionPaymentMethod');
  elements.transactionPaymentCategoryGroup = $('#transactionPaymentCategoryGroup');
  elements.transactionPaymentCategory = $('#transactionPaymentCategory');
  elements.transactionBillingAmountLabel = $('#transactionBillingAmountLabel');
  elements.transactionBillingAmount = $('#transactionBillingAmount');
  elements.transactionUsageAmountGroup = $('#transactionUsageAmountGroup');
  elements.transactionUsageAmount = $('#transactionUsageAmount');
  elements.transactionCarriedForwardAmountGroup = $('#transactionCarriedForwardAmountGroup');
  elements.transactionCarriedForwardAmount = $('#transactionCarriedForwardAmount');
  elements.transactionAdjustmentAmountGroup = $('#transactionAdjustmentAmountGroup');
  elements.transactionAdjustmentAmount = $('#transactionAdjustmentAmount');
  elements.transactionErrors = {
    statementPaymentOn: $('#transactionStatementPaymentOnError'),
    usedOn: $('#transactionUsedOnError'),
    merchant: $('#transactionMerchantError'),
    cardUser: $('#transactionCardUserError'),
    paymentMethod: $('#transactionPaymentMethodError'),
    paymentCategory: $('#transactionPaymentCategoryError'),
    billingAmount: $('#transactionBillingAmountError'),
    usageAmount: $('#transactionUsageAmountError'),
    carriedForwardAmount: $('#transactionCarriedForwardAmountError'),
    adjustmentAmount: $('#transactionAdjustmentAmountError'),
  };
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
  elements.tableFilterMenu = $('#tableFilterMenu');
  elements.tableFilterResetButtons = [...document.querySelectorAll('[data-table-filter-reset]')];
}

function bindAdminElements() {
  elements.adminContent = $('#adminContent');
  elements.openManualDialogButton = $('#openManualDialogButton');
  elements.manualEntryDialog = $('#manualEntryDialog');
  elements.manualEntryForm = $('#manualEntryForm');
  elements.cancelManualEntryButton = $('#cancelManualEntryButton');
  elements.closeManualEntryDialogButton = $('#closeManualEntryDialogButton');
  elements.manualTransactionType = [...document.querySelectorAll('input[name="transaction_type"]')];
  elements.manualUsedOnLabel = $('#manualUsedOnLabel');
  elements.manualUsedOn = $('#manualUsedOn');
  elements.manualMerchantLabel = $('#manualMerchantLabel');
  elements.manualMerchant = $('#manualMerchant');
  elements.manualPaymentMethodLabel = $('#manualPaymentMethodLabel');
  elements.manualPaymentMethod = $('#manualPaymentMethod');
  elements.manualCardUser = $('#manualCardUser');
  elements.manualAmount = $('#manualAmount');
  elements.manualCardDetails = $('#manualCardDetails');
  elements.manualStatementPaymentOn = $('#manualStatementPaymentOn');
  elements.manualInstallmentControls = $('#manualInstallmentControls');
  elements.manualInstallmentCount = $('#manualInstallmentCount');
  elements.manualInstallmentNumber = $('#manualInstallmentNumber');
  elements.manualContinue = $('#manualContinue');
  elements.manualPaymentCategoryMode = [...document.querySelectorAll('input[name="payment_category_mode"]')];
  elements.manualListTransactionType = [...document.querySelectorAll('input[name="manual_list_transaction_type"]')];
  elements.manualTransactionsHead = $('#manualTransactionsHead');
  elements.manualTransactionsBody = $('#manualTransactionsBody');
  elements.manualTransactionsResultCount = $('#manualTransactionsResultCount');
  elements.prevManualTransactionsPageButton = $('#prevManualTransactionsPageButton');
  elements.nextManualTransactionsPageButton = $('#nextManualTransactionsPageButton');
  elements.manualErrors = {
    transactionType: $('#manualTransactionTypeError'),
    usedOn: $('#manualUsedOnError'),
    merchant: $('#manualMerchantError'),
    cardUser: $('#manualCardUserError'),
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

function normalizeSignedIntegerAmount(value) {
  const amount = String(value ?? '').trim().replace(/[,\s\u3000]/g, '');
  if (!/^-?\d+$/.test(amount)) {
    return null;
  }

  const number = Number(amount);
  if (
    !Number.isInteger(number)
    || number < -2147483648
    || number > maxIntegerAmount
  ) {
    return null;
  }

  return Object.is(number, -0) ? 0 : number;
}

function isManualCardPaymentMethod(paymentMethod) {
  return manualPaymentMethods.includes(paymentMethod) && !nonCardPaymentMethods.has(paymentMethod);
}

function normalizeCardUserInputValue(value) {
  const text = String(value ?? '').trim().replace(/\s*\*+$/u, '').trim();
  return manualCardUsers.includes(text) ? text : manualCardUsers[0];
}

function optionsWithCurrent(values, currentValue) {
  const current = String(currentValue ?? '').trim();
  if (current === '' || values.includes(current)) {
    return values;
  }

  return [current, ...values];
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

function setManualListTransactionType(transactionType) {
  state.manualTransactionsType = transactionType === 'income' ? 'income' : 'expense';
  for (const input of elements.manualListTransactionType) {
    input.checked = input.value === state.manualTransactionsType;
  }
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
  const fallbackPaymentMethod = isIncome ? options[0] : defaultManualPaymentMethod;
  replaceSelectOptions(
    elements.manualPaymentMethod,
    options,
    options.includes(currentPaymentMethod) ? currentPaymentMethod : fallbackPaymentMethod
  );
  updateManualPaymentMethodControls();
}

function initializeManualEntryControls() {
  replaceSelectOptions(elements.manualPaymentMethod, manualPaymentMethods, defaultManualPaymentMethod);
  replaceSelectOptions(elements.manualCardUser, manualCardUsers, manualCardUsers[0]);
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
    elements.manualCardUser,
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
    cardUser: elements.manualCardUser,
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
  const fields = [
    'transactionType',
    'paymentMethod',
    'cardUser',
    'usedOn',
    'merchant',
    'amount',
    'statementPaymentOn',
    'paymentCategory',
  ];
  const fieldInputs = {
    transactionType: elements.manualTransactionType[0],
    usedOn: elements.manualUsedOn,
    merchant: elements.manualMerchant,
    cardUser: elements.manualCardUser,
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
  const cardUser = elements.manualCardUser.value;
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

  if (!manualCardUsers.includes(cardUser)) {
    errors.cardUser = '利用者を選択してください。';
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
      card_user: cardUser,
      receiving_method: paymentMethod,
      amount,
    };
  }

  return {
    transaction_type: 'expense',
    used_on: usedOn,
    merchant,
    card_user: cardUser,
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
  elements.manualPaymentMethod.value = defaultManualPaymentMethod;
  elements.manualCardUser.value = manualCardUsers[0];
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
    setManualListTransactionType(payload.transaction_type);
    state.manualTransactionsOffset = 0;
    state.importsOffset = 0;
    await Promise.all([
      loadManualTransactions(),
      loadImports(),
    ]);
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

function transactionFormInputs() {
  return [
    elements.transactionStatementPaymentOn,
    elements.transactionUsedOn,
    elements.transactionMerchant,
    elements.transactionCardUser,
    elements.transactionPaymentMethod,
    elements.transactionPaymentCategory,
    elements.transactionBillingAmount,
    elements.transactionUsageAmount,
    elements.transactionCarriedForwardAmount,
    elements.transactionAdjustmentAmount,
  ].filter(Boolean);
}

function clearTransactionErrors() {
  for (const error of Object.values(elements.transactionErrors || {})) {
    if (error) {
      error.textContent = '';
    }
  }

  for (const input of transactionFormInputs()) {
    input.removeAttribute('aria-invalid');
  }
}

function renderTransactionErrors(errors) {
  clearTransactionErrors();

  const fieldInputs = {
    statementPaymentOn: elements.transactionStatementPaymentOn,
    usedOn: elements.transactionUsedOn,
    merchant: elements.transactionMerchant,
    cardUser: elements.transactionCardUser,
    paymentMethod: elements.transactionPaymentMethod,
    paymentCategory: elements.transactionPaymentCategory,
    billingAmount: elements.transactionBillingAmount,
    usageAmount: elements.transactionUsageAmount,
    carriedForwardAmount: elements.transactionCarriedForwardAmount,
    adjustmentAmount: elements.transactionAdjustmentAmount,
  };

  for (const [field, message] of Object.entries(errors)) {
    if (elements.transactionErrors[field]) {
      elements.transactionErrors[field].textContent = message;
    }
    if (fieldInputs[field]) {
      fieldInputs[field].setAttribute('aria-invalid', 'true');
    }
  }
}

function focusFirstTransactionError(errors) {
  const fields = [
    'statementPaymentOn',
    'usedOn',
    'merchant',
    'cardUser',
    'paymentMethod',
    'paymentCategory',
    'billingAmount',
    'usageAmount',
    'carriedForwardAmount',
    'adjustmentAmount',
  ];
  const fieldInputs = {
    statementPaymentOn: elements.transactionStatementPaymentOn,
    usedOn: elements.transactionUsedOn,
    merchant: elements.transactionMerchant,
    cardUser: elements.transactionCardUser,
    paymentMethod: elements.transactionPaymentMethod,
    paymentCategory: elements.transactionPaymentCategory,
    billingAmount: elements.transactionBillingAmount,
    usageAmount: elements.transactionUsageAmount,
    carriedForwardAmount: elements.transactionCarriedForwardAmount,
    adjustmentAmount: elements.transactionAdjustmentAmount,
  };
  const firstField = fields.find((field) => errors[field]);
  if (firstField && fieldInputs[firstField]) {
    fieldInputs[firstField].focus();
  }
}

function setTransactionFormDisabled(disabled) {
  for (const input of transactionFormInputs()) {
    input.disabled = disabled;
  }
}

function populateTransactionDialog(transaction) {
  const isIncome = transaction.transaction_type === 'income';
  const canSave = state.loggedIn;
  const paymentMethod = String(transaction.payment_method ?? '').trim();
  const cardUser = normalizeCardUserInputValue(transaction.card_user);
  const paymentOptions = isIncome ? manualReceivingMethods : manualPaymentMethods;

  clearTransactionErrors();
  elements.transactionDialogTitle.textContent = isIncome ? '収入明細' : '支出明細';
  elements.transactionReadonlyNotice.hidden = canSave;
  elements.saveTransactionButton.hidden = !canSave;
  elements.deleteTransactionButton.hidden = !canSave;
  elements.cancelTransactionButton.textContent = canSave ? 'キャンセル' : '閉じる';

  elements.transactionStatementPaymentOnLabel.textContent = isIncome ? '受取日' : '支払日';
  elements.transactionMerchantLabel.textContent = isIncome ? '摘要' : '店名・商品名';
  elements.transactionPaymentMethodLabel.textContent = isIncome ? '受取方法' : '決済方法';
  elements.transactionBillingAmountLabel.textContent = isIncome ? '金額' : '当月支払';

  elements.transactionUsedOnGroup.hidden = isIncome;
  elements.transactionPaymentCategoryGroup.hidden = isIncome;
  elements.transactionUsageAmountGroup.hidden = isIncome;
  elements.transactionCarriedForwardAmountGroup.hidden = isIncome;
  elements.transactionAdjustmentAmountGroup.hidden = isIncome;

  replaceSelectOptions(elements.transactionCardUser, manualCardUsers, cardUser);
  replaceSelectOptions(
    elements.transactionPaymentMethod,
    optionsWithCurrent(paymentOptions, paymentMethod),
    paymentMethod
  );

  elements.transactionStatementPaymentOn.value = transaction.statement_payment_on || '';
  elements.transactionUsedOn.value = transaction.used_on || transaction.statement_payment_on || '';
  elements.transactionMerchant.value = transaction.merchant || '';
  elements.transactionPaymentCategory.value = transaction.payment_category || '';
  elements.transactionBillingAmount.value = String(transaction.billing_amount ?? '');
  elements.transactionUsageAmount.value = String(transaction.usage_amount ?? '');
  elements.transactionCarriedForwardAmount.value = String(transaction.carried_forward_amount ?? '');
  elements.transactionAdjustmentAmount.value = String(transaction.adjustment_amount ?? '');

  setTransactionFormDisabled(!canSave);
}

function validateTransactionForm() {
  const transaction = state.editingTransaction;
  if (!transaction) {
    return null;
  }

  const errors = {};
  const isIncome = transaction.transaction_type === 'income';
  const statementPaymentOn = elements.transactionStatementPaymentOn.value;
  const usedOn = elements.transactionUsedOn.value;
  const merchant = elements.transactionMerchant.value.trim();
  const cardUser = elements.transactionCardUser.value;
  const paymentMethod = elements.transactionPaymentMethod.value.trim();
  const paymentCategory = elements.transactionPaymentCategory.value.trim();
  const billingAmount = isIncome
    ? normalizeManualAmount(elements.transactionBillingAmount.value)
    : normalizeSignedIntegerAmount(elements.transactionBillingAmount.value);

  if (!isValidDateValue(statementPaymentOn)) {
    errors.statementPaymentOn = isIncome
      ? '有効な受取日を入力してください。'
      : '有効な支払日を入力してください。';
  }

  if (!isIncome && !isValidDateValue(usedOn)) {
    errors.usedOn = '有効な利用日を入力してください。';
  }

  if (merchant === '') {
    errors.merchant = isIncome ? '摘要を入力してください。' : '店名・商品名を入力してください。';
  } else if (merchant.length > 255) {
    errors.merchant = isIncome ? '摘要は255文字以内で入力してください。' : '店名・商品名は255文字以内で入力してください。';
  }

  if (!manualCardUsers.includes(cardUser)) {
    errors.cardUser = '利用者を選択してください。';
  }

  if (paymentMethod === '') {
    errors.paymentMethod = isIncome ? '受取方法を入力してください。' : '決済方法を入力してください。';
  } else if (paymentMethod.length > 100) {
    errors.paymentMethod = isIncome ? '受取方法は100文字以内で入力してください。' : '決済方法は100文字以内で入力してください。';
  }

  if (billingAmount === null) {
    errors.billingAmount = isIncome ? '1円以上の整数を入力してください。' : '整数を入力してください。';
  }

  if (isIncome) {
    if (Object.keys(errors).length > 0) {
      renderTransactionErrors(errors);
      focusFirstTransactionError(errors);
      return null;
    }

    clearTransactionErrors();
    return {
      transaction_type: 'income',
      received_on: statementPaymentOn,
      description: merchant,
      card_user: cardUser,
      receiving_method: paymentMethod,
      amount: billingAmount,
    };
  }

  const usageAmount = normalizeSignedIntegerAmount(elements.transactionUsageAmount.value);
  const carriedForwardAmount = normalizeSignedIntegerAmount(elements.transactionCarriedForwardAmount.value);
  const adjustmentAmount = normalizeSignedIntegerAmount(elements.transactionAdjustmentAmount.value);

  if (paymentCategory === '') {
    errors.paymentCategory = '支払区分を入力してください。';
  } else if (paymentCategory.length > 100) {
    errors.paymentCategory = '支払区分は100文字以内で入力してください。';
  }
  if (usageAmount === null) {
    errors.usageAmount = '整数を入力してください。';
  }
  if (carriedForwardAmount === null) {
    errors.carriedForwardAmount = '整数を入力してください。';
  }
  if (adjustmentAmount === null) {
    errors.adjustmentAmount = '整数を入力してください。';
  }

  if (Object.keys(errors).length > 0) {
    renderTransactionErrors(errors);
    focusFirstTransactionError(errors);
    return null;
  }

  clearTransactionErrors();
  return {
    transaction_type: 'expense',
    statement_payment_on: statementPaymentOn,
    used_on: usedOn,
    merchant,
    card_user: cardUser,
    payment_method: paymentMethod,
    payment_category: paymentCategory,
    billing_amount: billingAmount,
    usage_amount: usageAmount,
    carried_forward_amount: carriedForwardAmount,
    adjustment_amount: adjustmentAmount,
  };
}

function showTransactionDialog(transaction) {
  if (!elements.transactionDialog) {
    return;
  }

  state.editingTransaction = transaction;
  populateTransactionDialog(transaction);

  if (elements.transactionDialog.open) {
    elements.transactionStatementPaymentOn.focus();
    return;
  }

  if (typeof elements.transactionDialog.showModal === 'function') {
    elements.transactionDialog.showModal();
  } else {
    elements.transactionDialog.setAttribute('open', '');
  }

  window.requestAnimationFrame(() => {
    (state.loggedIn ? elements.transactionStatementPaymentOn : elements.cancelTransactionButton).focus();
  });
}

function closeTransactionDialog() {
  if (typeof elements.transactionDialog.close === 'function' && elements.transactionDialog.open) {
    elements.transactionDialog.close();
  } else {
    elements.transactionDialog.removeAttribute('open');
  }
  state.editingTransaction = null;
  clearTransactionErrors();
}

async function reloadAfterTransactionUpdate() {
  if (state.page === 'transactions') {
    await loadAvailableMonths();
    await refreshData();
    return;
  }

  await Promise.all([
    loadManualTransactions(),
    loadImports(),
  ]);
}

async function submitTransactionEdit(event) {
  event.preventDefault();
  if (!state.loggedIn || !state.editingTransaction) {
    closeTransactionDialog();
    return;
  }

  const payload = validateTransactionForm();
  if (payload === null) {
    return;
  }

  const transactionId = state.editingTransaction.id;
  elements.saveTransactionButton.disabled = true;
  elements.deleteTransactionButton.disabled = true;
  try {
    await api(`api/transactions.php?id=${encodeURIComponent(transactionId)}`, {
      method: 'PUT',
      json: payload,
    });
    closeTransactionDialog();
    await reloadAfterTransactionUpdate();
    showToast('更新しました。');
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.saveTransactionButton.disabled = false;
    elements.deleteTransactionButton.disabled = false;
  }
}

async function deleteCurrentTransaction() {
  const transaction = state.editingTransaction;
  if (!state.loggedIn || !transaction) {
    closeTransactionDialog();
    return;
  }

  if (!window.confirm('この明細を削除しますか。')) {
    return;
  }

  elements.saveTransactionButton.disabled = true;
  elements.deleteTransactionButton.disabled = true;
  try {
    await api(`api/transactions.php?id=${encodeURIComponent(transaction.id)}`, {
      method: 'DELETE',
    });
    closeTransactionDialog();
    await reloadAfterTransactionUpdate();
    showToast('削除しました。');
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.saveTransactionButton.disabled = false;
    elements.deleteTransactionButton.disabled = false;
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

  const cancelLogin = () => {
    if (state.page === 'admin') {
      navigateTo(pageUrls.transactions);
      return;
    }

    closeLoginDialog();
  };

  elements.cancelLoginButton.addEventListener('click', cancelLogin);
  elements.closeLoginDialogButton.addEventListener('click', cancelLogin);

  if (elements.transactionForm) {
    elements.transactionForm.addEventListener('submit', submitTransactionEdit);
    elements.cancelTransactionButton.addEventListener('click', closeTransactionDialog);
    elements.closeTransactionDialogButton.addEventListener('click', closeTransactionDialog);
    elements.deleteTransactionButton.addEventListener('click', deleteCurrentTransaction);
    elements.transactionDialog.addEventListener('close', () => {
      state.editingTransaction = null;
      clearTransactionErrors();
    });
  }

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
      await Promise.all([
        loadImports(),
        loadManualTransactions(),
      ]);
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

  for (const button of elements.tableFilterResetButtons) {
    button.addEventListener('click', () => {
      clearTableFilters(button.dataset.tableFilterReset);
      closeTableFilterMenu();
      renderTransactions();
    });
  }

  elements.tableFilterMenu.addEventListener('change', handleTableFilterMenuChange);
  document.addEventListener('click', handleTableFilterDocumentClick);
  document.addEventListener('keydown', handleTableFilterKeydown);
  window.addEventListener('resize', positionOpenTableFilterMenu);
  window.addEventListener('scroll', positionOpenTableFilterMenu, true);
}

function bindAdminEvents() {
  initializeManualEntryControls();
  updateImportSubmitState();

  elements.openManualDialogButton.addEventListener('click', showManualEntryDialog);

  elements.cancelManualEntryButton.addEventListener('click', closeManualEntryDialog);
  elements.closeManualEntryDialogButton.addEventListener('click', closeManualEntryDialog);

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

  for (const input of elements.manualListTransactionType) {
    input.addEventListener('change', async () => {
      setManualListTransactionType(input.value);
      state.manualTransactionsOffset = 0;
      await loadManualTransactions();
    });
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
      state.manualTransactionsOffset = 0;
      await Promise.all([
        loadImports(),
        loadManualTransactions(),
      ]);
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

  elements.prevManualTransactionsPageButton.addEventListener('click', async () => {
    state.manualTransactionsOffset = Math.max(0, state.manualTransactionsOffset - state.manualTransactionsLimit);
    await loadManualTransactions();
  });

  elements.nextManualTransactionsPageButton.addEventListener('click', async () => {
    state.manualTransactionsOffset += state.manualTransactionsLimit;
    await loadManualTransactions();
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
    renderTransactions();
    return;
  }

  await loadTransactions();
}

function renderSummaryTotals(incomeTransactions, expenseTransactions) {
  const incomeAmount = incomeTransactions.reduce((sum, item) => sum + Number(item.billing_amount || 0), 0);
  const expenseAmount = expenseTransactions.reduce((sum, item) => sum + Number(item.billing_amount || 0), 0);
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

function normalizeFilterValue(value) {
  const text = String(value ?? '').trim();
  return text === '' ? '未設定' : text;
}

function normalizeCardUserFilterValue(value) {
  const text = String(value ?? '').trim().replace(/\*+$/, '');
  return text === '' ? '未設定' : text;
}

function normalizePaymentCategoryFilterValue(value) {
  return String(value ?? '').trim() === '1回' ? '1回' : '分割';
}

function tableFilterDefinition(group, key) {
  return (tableFilterDefinitions[group] || []).find((definition) => definition.key === key) || null;
}

function selectedTableFilterValues(group, key) {
  return state.tableFilters[group]?.[key] || new Set();
}

function transactionTableGroup(transaction) {
  return transaction.transaction_type === 'income' ? 'income' : 'expense';
}

function transactionsForTableGroup(group) {
  return state.transactions.filter((transaction) => transactionTableGroup(transaction) === group);
}

function compareFilterValues(a, b) {
  return a.localeCompare(b, 'ja-JP', { numeric: true });
}

function tableFilterOptions(transactions, definition) {
  const seen = new Set();
  const options = [];

  for (const transaction of transactions) {
    const value = definition.value(transaction);
    if (!seen.has(value)) {
      seen.add(value);
      options.push(value);
    }
  }

  return options.sort(definition.sort || compareFilterValues);
}

function tableFilterOptionsByKey(group, transactions) {
  return Object.fromEntries(
    (tableFilterDefinitions[group] || []).map((definition) => [
      definition.key,
      tableFilterOptions(transactions, definition),
    ])
  );
}

function pruneTableFilters(group, optionsByKey) {
  for (const definition of tableFilterDefinitions[group] || []) {
    const selected = selectedTableFilterValues(group, definition.key);
    const available = new Set(optionsByKey[definition.key] || []);
    for (const value of [...selected]) {
      if (!available.has(value)) {
        selected.delete(value);
      }
    }
  }
}

function hasActiveTableFilter(group, key) {
  return selectedTableFilterValues(group, key).size > 0;
}

function hasActiveTableFilters(group) {
  return (tableFilterDefinitions[group] || []).some((definition) => hasActiveTableFilter(group, definition.key));
}

function transactionMatchesTableFilters(transaction, group) {
  return (tableFilterDefinitions[group] || []).every((definition) => {
    const selected = selectedTableFilterValues(group, definition.key);
    return selected.size === 0 || selected.has(definition.value(transaction));
  });
}

function filterTableTransactions(transactions, group) {
  return transactions.filter((transaction) => transactionMatchesTableFilters(transaction, group));
}

function clearTableFilters(group) {
  for (const selected of Object.values(state.tableFilters[group] || {})) {
    selected.clear();
  }
}

function updateTableFilterExpandedStates() {
  const openGroup = state.openTableFilter?.group || '';
  const openKey = state.openTableFilter?.key || '';

  for (const trigger of document.querySelectorAll('[data-table-filter-trigger]')) {
    const isOpen = !elements.tableFilterMenu.hidden
      && trigger.dataset.filterGroup === openGroup
      && trigger.dataset.filterKey === openKey;
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

function updateTableFilterControls(optionsByGroup) {
  for (const trigger of document.querySelectorAll('[data-table-filter-trigger]')) {
    const group = trigger.dataset.filterGroup;
    const key = trigger.dataset.filterKey;
    const definition = tableFilterDefinition(group, key);
    const options = optionsByGroup[group]?.[key] || [];

    if (definition === null) {
      trigger.disabled = true;
      continue;
    }

    const selectedCount = selectedTableFilterValues(group, key).size;
    trigger.textContent = selectedCount === 0 ? definition.label : `${definition.label} (${selectedCount})`;
    trigger.disabled = options.length === 0;
    trigger.classList.toggle('is-active', selectedCount > 0);
    trigger.setAttribute(
      'aria-label',
      selectedCount === 0 ? `${definition.label}フィルター` : `${definition.label}フィルター ${selectedCount}件選択中`
    );
  }

  for (const button of elements.tableFilterResetButtons) {
    button.hidden = !hasActiveTableFilters(button.dataset.tableFilterReset);
  }

  updateTableFilterExpandedStates();
}

function closeTableFilterMenu() {
  if (!elements.tableFilterMenu) {
    return;
  }

  elements.tableFilterMenu.hidden = true;
  elements.tableFilterMenu.replaceChildren();
  elements.tableFilterMenu.style.left = '';
  elements.tableFilterMenu.style.top = '';
  state.openTableFilter = null;
  updateTableFilterExpandedStates();
}

function positionTableFilterMenu(trigger = state.openTableFilter?.trigger) {
  if (!trigger || !elements.tableFilterMenu || elements.tableFilterMenu.hidden) {
    return;
  }

  const margin = 8;
  const rect = trigger.getBoundingClientRect();
  const menuWidth = elements.tableFilterMenu.offsetWidth;
  const menuHeight = elements.tableFilterMenu.offsetHeight;
  const maxLeft = window.innerWidth - menuWidth - margin;
  const maxTop = window.innerHeight - menuHeight - margin;
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left > maxLeft) {
    left = maxLeft;
  }
  if (top > maxTop && rect.top - menuHeight - 6 >= margin) {
    top = rect.top - menuHeight - 6;
  }

  elements.tableFilterMenu.style.left = `${Math.max(margin, left)}px`;
  elements.tableFilterMenu.style.top = `${Math.max(margin, Math.min(top, maxTop))}px`;
}

function positionOpenTableFilterMenu() {
  positionTableFilterMenu();
}

function renderTableFilterMenu() {
  if (!state.openTableFilter || !elements.tableFilterMenu) {
    return;
  }

  const { group, key } = state.openTableFilter;
  const definition = tableFilterDefinition(group, key);
  if (definition === null) {
    closeTableFilterMenu();
    return;
  }

  const options = tableFilterOptions(transactionsForTableGroup(group), definition);
  const selected = selectedTableFilterValues(group, key);
  const title = createElement('p', { className: 'table-filter-menu-title', text: definition.label });

  if (options.length === 0) {
    const empty = createElement('p', { className: 'table-filter-menu-empty', text: '候補なし' });
    elements.tableFilterMenu.replaceChildren(title, empty);
    elements.tableFilterMenu.hidden = false;
    updateTableFilterExpandedStates();
    positionTableFilterMenu();
    return;
  }

  const list = createElement('div', { className: 'table-filter-options' });
  const optionNodes = options.map((value, index) => {
    const id = `table-filter-${group}-${key}-${index}`;
    const label = createElement('label', { className: 'table-filter-option', attrs: { for: id } });
    const input = createElement('input', {
      attrs: {
        id,
        type: 'checkbox',
        value,
        'data-table-filter-value': value,
      },
    });
    input.checked = selected.has(value);
    label.append(input, createElement('span', { text: value }));
    return label;
  });
  list.replaceChildren(...optionNodes);

  elements.tableFilterMenu.replaceChildren(title, list);
  elements.tableFilterMenu.hidden = false;
  updateTableFilterExpandedStates();
  positionTableFilterMenu();
}

function toggleTableFilterMenu(trigger) {
  const group = trigger.dataset.filterGroup;
  const key = trigger.dataset.filterKey;
  const isSameFilter = state.openTableFilter
    && state.openTableFilter.group === group
    && state.openTableFilter.key === key
    && !elements.tableFilterMenu.hidden;

  if (isSameFilter) {
    closeTableFilterMenu();
    return;
  }

  state.openTableFilter = { group, key, trigger };
  renderTableFilterMenu();
}

function handleTableFilterDocumentClick(event) {
  const trigger = event.target.closest('[data-table-filter-trigger]');
  if (trigger) {
    event.preventDefault();
    toggleTableFilterMenu(trigger);
    return;
  }

  if (
    elements.tableFilterMenu
    && !elements.tableFilterMenu.hidden
    && !elements.tableFilterMenu.contains(event.target)
  ) {
    closeTableFilterMenu();
  }
}

function handleTableFilterKeydown(event) {
  if (event.key !== 'Escape' || !elements.tableFilterMenu || elements.tableFilterMenu.hidden) {
    return;
  }

  const trigger = state.openTableFilter?.trigger;
  closeTableFilterMenu();
  trigger?.focus();
}

function handleTableFilterMenuChange(event) {
  const input = event.target.closest('input[data-table-filter-value]');
  if (!input || !state.openTableFilter) {
    return;
  }

  const { group, key } = state.openTableFilter;
  const selected = selectedTableFilterValues(group, key);
  if (input.checked) {
    selected.add(input.value);
  } else {
    selected.delete(input.value);
  }

  renderTransactions();
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

function makeTransactionRowInteractive(row, transaction) {
  row.classList.add('clickable-row');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  row.setAttribute('aria-label', '明細を開く');
  row.addEventListener('click', () => showTransactionDialog(transaction));
  row.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    showTransactionDialog(transaction);
  });
}

function renderEmptyRow(body, message, colspan) {
  const row = createElement('tr');
  const cell = createElement('td', { className: 'empty', text: message, attrs: { colspan } });
  row.append(cell);
  body.replaceChildren(row);
}

function renderTransactionCount(element, visibleCount, totalCount, isFiltered) {
  element.textContent = isFiltered ? `${visibleCount} / ${totalCount}件` : `${totalCount}件`;
}

function renderIncomeTransactions(transactions, totalCount, isFiltered) {
  renderTransactionCount(elements.incomeResultCount, transactions.length, totalCount, isFiltered);

  if (transactions.length === 0) {
    renderEmptyRow(
      elements.incomeTransactionsBody,
      isFiltered && totalCount > 0 ? '条件に一致する明細なし' : '収入明細なし',
      4
    );
    return;
  }

  const rows = transactions.map((transaction) => {
    const row = createElement('tr');
    appendCell(row, '受取日', formatDate(transaction.statement_payment_on));
    appendCell(row, '摘要', transaction.merchant, 'merchant');
    appendCell(row, '受取方法', transaction.payment_method);
    appendCell(row, '金額', formatCurrency(transaction.billing_amount), 'number');
    makeTransactionRowInteractive(row, transaction);
    return row;
  });

  elements.incomeTransactionsBody.replaceChildren(...rows);
}

function renderExpenseTransactions(transactions, totalCount, isFiltered) {
  renderTransactionCount(elements.expenseResultCount, transactions.length, totalCount, isFiltered);

  if (transactions.length === 0) {
    renderEmptyRow(
      elements.expenseTransactionsBody,
      isFiltered && totalCount > 0 ? '条件に一致する明細なし' : '支出明細なし',
      9
    );
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
    makeTransactionRowInteractive(row, transaction);
    return row;
  });

  elements.expenseTransactionsBody.replaceChildren(...rows);
}

function renderTransactions() {
  const incomeTransactions = state.transactions.filter((transaction) => transaction.transaction_type === 'income');
  const expenseTransactions = state.transactions.filter((transaction) => transaction.transaction_type !== 'income');
  const optionsByGroup = {
    income: tableFilterOptionsByKey('income', incomeTransactions),
    expense: tableFilterOptionsByKey('expense', expenseTransactions),
  };

  pruneTableFilters('income', optionsByGroup.income);
  pruneTableFilters('expense', optionsByGroup.expense);

  const filteredIncomeTransactions = filterTableTransactions(incomeTransactions, 'income');
  const filteredExpenseTransactions = filterTableTransactions(expenseTransactions, 'expense');
  const isIncomeFiltered = hasActiveTableFilters('income');
  const isExpenseFiltered = hasActiveTableFilters('expense');

  renderSummaryTotals(filteredIncomeTransactions, filteredExpenseTransactions);
  renderIncomeTransactions(filteredIncomeTransactions, incomeTransactions.length, isIncomeFiltered);
  renderExpenseTransactions(filteredExpenseTransactions, expenseTransactions.length, isExpenseFiltered);
  updateTableFilterControls(optionsByGroup);

  if (state.openTableFilter) {
    renderTableFilterMenu();
  }
}

async function loadImports() {
  try {
    const params = new URLSearchParams({
      limit: String(state.importsLimit),
      offset: String(state.importsOffset),
      source_types: 'csv,bank_csv',
    });
    const data = await api(`api/imports.php?${params.toString()}`);
    state.imports = data.items || [];
    state.importsTotal = Number(data.total || 0);
    state.importsLimit = Number(data.limit ?? state.importsLimit);
    state.importsOffset = Number(data.offset ?? state.importsOffset);

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

async function loadManualTransactions() {
  try {
    const params = new URLSearchParams({
      transaction_type: state.manualTransactionsType,
      limit: String(state.manualTransactionsLimit),
      offset: String(state.manualTransactionsOffset),
    });
    const data = await api(`api/manual_transactions.php?${params.toString()}`);
    state.manualTransactions = data.items || [];
    state.manualTransactionsTotal = Number(data.total || 0);
    state.manualTransactionsLimit = Number(data.limit ?? state.manualTransactionsLimit);
    state.manualTransactionsOffset = Number(data.offset ?? state.manualTransactionsOffset);
    setManualListTransactionType(data.transaction_type);

    if (
      state.manualTransactions.length === 0
      && state.manualTransactionsTotal > 0
      && state.manualTransactionsOffset >= state.manualTransactionsTotal
    ) {
      state.manualTransactionsOffset = Math.max(0, state.manualTransactionsOffset - state.manualTransactionsLimit);
      await loadManualTransactions();
      return;
    }

    renderManualTransactions();
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

function renderManualTransactionsHead() {
  const isIncome = state.manualTransactionsType === 'income';
  const headers = isIncome
    ? [
      ['受取日'],
      ['摘要'],
      ['受取方法'],
      ['金額', 'number'],
      ['操作'],
    ]
    : [
      ['支払日'],
      ['店名'],
      ['決済方法'],
      ['支払区分'],
      ['金額', 'number'],
      ['操作'],
    ];
  const row = createElement('tr');
  row.replaceChildren(...headers.map(([text, className]) => createElement('th', { text, className })));
  elements.manualTransactionsHead.replaceChildren(row);
}

function renderManualTransactions() {
  const isIncome = state.manualTransactionsType === 'income';
  const start = state.manualTransactionsTotal === 0 ? 0 : state.manualTransactionsOffset + 1;
  const end = Math.min(state.manualTransactionsTotal, state.manualTransactionsOffset + state.manualTransactions.length);
  elements.manualTransactionsResultCount.textContent = `${start}-${end} / ${state.manualTransactionsTotal}件`;
  elements.prevManualTransactionsPageButton.disabled = state.manualTransactionsOffset <= 0;
  elements.nextManualTransactionsPageButton.disabled = (
    state.manualTransactionsOffset + state.manualTransactionsLimit >= state.manualTransactionsTotal
  );

  renderManualTransactionsHead();

  if (state.manualTransactions.length === 0) {
    renderEmptyRow(
      elements.manualTransactionsBody,
      isIncome ? '手入力の収入なし' : '手入力の支出なし',
      isIncome ? 5 : 6
    );
    return;
  }

  const rows = state.manualTransactions.map((item) => {
    const row = createElement('tr');
    if (isIncome) {
      appendCell(row, '受取日', formatDate(item.statement_payment_on));
      appendCell(row, '摘要', item.merchant, 'merchant');
      appendCell(row, '受取方法', item.payment_method);
      appendCell(row, '金額', formatCurrency(item.billing_amount), 'number');
    } else {
      appendCell(row, '支払日', formatDate(item.statement_payment_on));
      appendCell(row, '店名', item.merchant, 'merchant');
      appendCell(row, '決済方法', item.payment_method);
      appendCell(row, '支払区分', item.payment_category);
      appendCell(row, '金額', formatCurrency(item.billing_amount), 'number');
    }

    const actionCell = createElement('td', { attrs: { 'data-label': '操作' } });
    const actionGroup = createElement('div', { className: 'row-actions' });
    const editButton = createElement('button', {
      className: 'secondary',
      text: '変更',
      attrs: { type: 'button' },
    });
    const deleteButton = createElement('button', {
      className: 'danger',
      text: '削除',
      attrs: { type: 'button' },
    });
    editButton.addEventListener('click', (event) => {
      event.stopPropagation();
      showTransactionDialog(item);
    });
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteManualTransaction(item.import_id);
    });
    actionGroup.append(editButton, deleteButton);
    actionCell.append(actionGroup);
    row.append(actionCell);
    makeTransactionRowInteractive(row, item);
    return row;
  });

  elements.manualTransactionsBody.replaceChildren(...rows);
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

async function deleteManualTransaction(importId) {
  if (!window.confirm('この手入力データを削除しますか。')) {
    return;
  }

  try {
    await api(`api/imports.php?id=${encodeURIComponent(importId)}`, { method: 'DELETE' });
    await Promise.all([
      loadManualTransactions(),
      loadImports(),
    ]);
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
    await Promise.all([
      loadImports(),
      loadManualTransactions(),
    ]);
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
