document.addEventListener('DOMContentLoaded', () => {
    const monthFilter = document.getElementById('month-filter');
    const operationsTable = document.getElementById('operations-table');
    const tableBody = document.getElementById('operations-table-body');
    const totalCell = document.getElementById('operations-table-total');
    const emptyState = document.getElementById('operations-empty-state');
    const summary = document.getElementById('operations-summary');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmAcceptBtn = document.getElementById('confirm-accept-btn');
    const expenseDescriptionModal = document.getElementById('expense-description-modal');
    const expenseDescriptionForm = document.getElementById('expense-description-form');
    const expenseDescriptionInput = document.getElementById('expense-description-input');
    const expenseDescriptionCancelBtn = document.getElementById('expense-description-cancel');
    const expenseEditModal = document.getElementById('expense-edit-modal');
    const expenseEditForm = document.getElementById('expense-edit-form');
    const expenseEditAmountInput = document.getElementById('expense-edit-amount');
    const expenseEditCategoryInput = document.getElementById('expense-edit-category');
    const expenseEditDateInput = document.getElementById('expense-edit-date');
    const expenseEditDescriptionInput = document.getElementById('expense-edit-description');
    const expenseEditCancelBtn = document.getElementById('expense-edit-cancel');
    const addExpenseBtn = document.getElementById('operations-add-expense-btn');
    const expenseCreateModal = document.getElementById('expense-create-modal');
    const expenseCreateForm = document.getElementById('expense-create-form');
    const expenseCreateAmountInput = document.getElementById('expense-create-amount');
    const expenseCreateCategoryInput = document.getElementById('expense-create-category');
    const expenseCreateDateInput = document.getElementById('expense-create-date');
    const expenseCreateDescriptionInput = document.getElementById('expense-create-description');
    const expenseCreateCancelBtn = document.getElementById('expense-create-cancel');

    const DEFAULT_CATEGORIES = [
        { title: 'Cibo', color: '#ff9900', emoji: '🍽️' },
        { title: 'Trasporti', color: '#007dff', emoji: '🚗' },
        { title: 'Spesa', color: '#2bcbba', emoji: '🛍️' }
    ];

    let pendingConfirmAction = null;
    let editingExpenseId = null;
    let describingExpenseId = null;

    function generateId(prefix = 'item') {
        if (window.crypto?.randomUUID) {
            return `${prefix}-${window.crypto.randomUUID()}`;
        }

        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function formatToday(date = new Date()) {
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    function normalizeText(value) {
        return (value || '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function normalizeAmount(value, fallbackText = '') {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Number(value.toFixed(2));
        }

        const candidate = `${value || ''} ${fallbackText || ''}`
            .replace(/\s+/g, ' ')
            .replace(/,/g, '.');

        const match = candidate.match(/(\d+(?:\.\d{1,2})?)/);
        if (!match) return null;

        const amount = parseFloat(match[1]);
        if (!Number.isFinite(amount) || amount <= 0) return null;

        return Number(amount.toFixed(2));
    }

    function normalizeDate(value, fallbackDate = new Date()) {
        const fallback = formatToday(fallbackDate);
        if (!value) return fallback;

        const raw = value.toString().trim();
        const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
            const [, day, month, year] = slashMatch;
            const fullYear = year.length === 2 ? `20${year}` : year;
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${fullYear}`;
        }

        const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }

        return fallback;
    }

    function getCategoryAliases(title) {
        const normalizedTitle = normalizeText(title);
        const aliases = {
            cibo: ['cibo', 'mangiare', 'ristorante', 'pizza', 'pranzo', 'cena', 'colazione', 'bar', 'caffe', 'aperitivo'],
            trasporti: ['trasporti', 'trasporto', 'benzina', 'diesel', 'carburante', 'metro', 'treno', 'bus', 'autobus', 'taxi', 'uber', 'parcheggio', 'casello'],
            spesa: ['spesa', 'supermercato', 'alimentari', 'spesone', 'market']
        };

        return aliases[normalizedTitle] || [normalizedTitle];
    }

    function resolveCategory(rawCategory, userText, categories) {
        if (!Array.isArray(categories) || categories.length === 0) {
            return rawCategory || 'Altro';
        }

        const normalizedRaw = normalizeText(rawCategory);
        const normalizedUserText = normalizeText(userText);

        if (normalizedRaw) {
            const exactMatch = categories.find(category => normalizeText(category.title) === normalizedRaw);
            if (exactMatch) return exactMatch.title;

            const includedMatch = categories.find(category => {
                const normalizedTitle = normalizeText(category.title);
                return normalizedRaw.includes(normalizedTitle) || normalizedTitle.includes(normalizedRaw);
            });
            if (includedMatch) return includedMatch.title;
        }

        let bestMatch = null;
        let bestScore = 0;

        categories.forEach(category => {
            const aliasScore = getCategoryAliases(category.title).reduce((score, alias) => {
                const normalizedAlias = normalizeText(alias);
                if (!normalizedAlias) return score;
                if (normalizedRaw === normalizedAlias) return score + 6;
                if (normalizedRaw.includes(normalizedAlias) || normalizedAlias.includes(normalizedRaw)) return score + 4;
                if (normalizedUserText.includes(normalizedAlias)) return score + 3;
                return score;
            }, 0);

            if (aliasScore > bestScore) {
                bestScore = aliasScore;
                bestMatch = category;
            }
        });

        if (bestMatch) return bestMatch.title;
        if (!normalizedUserText && rawCategory) return rawCategory.toString().trim();
        return categories[0].title;
    }

    function getSortableDateKey(dateValue) {
        const normalizedDate = normalizeDate(dateValue);
        const [day, month, year] = normalizedDate.split('/');
        return `${year}${month}${day}`;
    }

    function normalizeDescription(value) {
        return (value || '').toString().replace(/\s+/g, ' ').trim();
    }

    function parseDateString(dateValue) {
        const [day, month, year] = normalizeDate(dateValue).split('/');
        return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    }

    function normalizeCreatedAt(value, fallbackDate = new Date()) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return value.toISOString();
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return new Date(value).toISOString();
        }

        if (typeof value === 'string') {
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }

        return fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())
            ? fallbackDate.toISOString()
            : new Date().toISOString();
    }

    function sortExpensesByDate(expenses) {
        return [...expenses].sort((a, b) => {
            const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (createdAtDiff !== 0) return createdAtDiff;
            return getSortableDateKey(b.date).localeCompare(getSortableDateKey(a.date));
        });
    }

    function getMonthValue(dateValue) {
        const [, month, year] = normalizeDate(dateValue).split('/');
        return `${year}-${month}`;
    }

    function formatMonthLabel(monthValue) {
        if (!monthValue) return 'Tutti i mesi';

        const [year, month] = monthValue.split('-');
        const formatter = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
        const label = formatter.format(new Date(Number(year), Number(month) - 1, 1));
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function getTrashIconMarkup() {
        return `
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M9.25 3.25C8.00736 3.25 7 4.25736 7 5.5V6H4.75C4.33579 6 4 6.33579 4 6.75V7.25C4 7.66421 4.33579 8 4.75 8H19.25C19.6642 8 20 7.66421 20 7.25V6.75C20 6.33579 19.6642 6 19.25 6H17V5.5C17 4.25736 15.9926 3.25 14.75 3.25H9.25ZM15 6V5.75C15 5.33579 14.6642 5 14.25 5H9.75C9.33579 5 9 5.33579 9 5.75V6H15ZM6.79984 9.25C6.36063 9.25 6.01503 9.62634 6.0524 10.0639L6.75175 18.2474C6.86188 19.536 7.94026 20.525 9.23354 20.525H14.7665C16.0597 20.525 17.1381 19.536 17.2483 18.2474L17.9476 10.0639C17.985 9.62634 17.6394 9.25 17.2002 9.25H6.79984ZM9.25 11.25C9.66421 11.25 10 11.5858 10 12V17C10 17.4142 9.66421 17.75 9.25 17.75C8.83579 17.75 8.5 17.4142 8.5 17V12C8.5 11.5858 8.83579 11.25 9.25 11.25ZM12 11.25C12.4142 11.25 12.75 11.5858 12.75 12V17C12.75 17.4142 12.4142 17.75 12 17.75C11.5858 17.75 11.25 17.4142 11.25 17V12C11.25 11.5858 11.5858 11.25 12 11.25ZM15.5 12C15.5 11.5858 15.1642 11.25 14.75 11.25C14.3358 11.25 14 11.5858 14 12V17C14 17.4142 14.3358 17.75 14.75 17.75C15.1642 17.75 15.5 17.4142 15.5 17V12Z"/>
            </svg>
        `;
    }

    function createCategoryCellElement(category) {
        const wrapper = document.createElement('div');
        wrapper.className = 'category-cell';

        const main = document.createElement('div');
        main.className = 'category-cell-main';

        const emoji = document.createElement('span');
        emoji.textContent = category.emoji;
        const title = document.createElement('span');
        title.textContent = category.title;

        main.appendChild(emoji);
        main.appendChild(title);
        wrapper.appendChild(main);
        return wrapper;
    }

    function createExpenseCategoryCellElement(category, description = '') {
        const wrapper = createCategoryCellElement(category);
        const normalized = normalizeDescription(description);
        if (normalized) {
            const descriptionEl = document.createElement('span');
            descriptionEl.className = 'expense-description-preview';
            descriptionEl.textContent = normalized;
            wrapper.appendChild(descriptionEl);
        }
        return wrapper;
    }

    function createActionButton(className, datasetKey, datasetValue, label, iconMarkup) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `table-action-btn ${className}`;
        button.dataset[datasetKey] = datasetValue;
        button.setAttribute('aria-label', label);
        button.innerHTML = iconMarkup;
        return button;
    }

    function getEditIconMarkup() {
        return `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 20h4.25L18.5 9.75a1.5 1.5 0 0 0 0-2.121l-2.129-2.129a1.5 1.5 0 0 0-2.121 0L4 15.75V20Z" fill="currentColor"/>
                <path d="M12.75 6.75 17.25 11.25" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }

    function getDescriptionIconMarkup() {
        return `
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 5.75C5.75736 5.75 4.75 6.75736 4.75 8V16C4.75 17.2426 5.75736 18.25 7 18.25H17C18.2426 18.25 19.25 17.2426 19.25 16V8C19.25 6.75736 18.2426 5.75 17 5.75H7Z" stroke="currentColor" stroke-width="1.8"/>
                <path d="M8.5 9.5H15.5M8.5 12H15.5M8.5 14.5H12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
        `;
    }

    function createExpenseDescriptionButton(expenseId, label) {
        return createActionButton('table-description-btn', 'expenseDescription', expenseId, label, getDescriptionIconMarkup());
    }

    function createExpenseEditButton(expenseId, label) {
        return createActionButton('table-edit-btn', 'expenseEdit', expenseId, label, getEditIconMarkup());
    }

    function createExpenseDeleteButton(expenseId, label) {
        return createActionButton('table-delete-btn', 'expenseDelete', expenseId, label, getTrashIconMarkup());
    }

    function loadData() {
        const rawExpenses = localStorage.getItem('finn_expenses') || localStorage.getItem('expenses');
        const rawCategories = localStorage.getItem('finn_categories') || localStorage.getItem('categories');

        let categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
        try { if (rawCategories) categories = JSON.parse(rawCategories); } catch (e) {}

        let expenses = [];
        try { expenses = rawExpenses ? JSON.parse(rawExpenses) : []; } catch (e) { expenses = []; }
        if (!Array.isArray(expenses)) expenses = [];

        let shouldPersistExpenses = false;
        expenses = expenses
            .map((expense, index) => {
                const amount = normalizeAmount(expense?.amount);
                if (amount === null) {
                    shouldPersistExpenses = true;
                    return null;
                }

                const fallbackCreatedAt = new Date(parseDateString(expense?.date || formatToday()).getTime() + index);

                const normalizedExpense = {
                    id: expense?.id || generateId('expense'),
                    amount,
                    category: resolveCategory(expense?.category, '', categories),
                    date: normalizeDate(expense?.date),
                    description: normalizeDescription(expense?.description),
                    createdAt: normalizeCreatedAt(expense?.createdAt, fallbackCreatedAt)
                };

                if (
                    !expense?.id ||
                    normalizedExpense.amount !== expense?.amount ||
                    normalizedExpense.category !== expense?.category ||
                    normalizedExpense.date !== expense?.date ||
                    normalizedExpense.description !== expense?.description ||
                    normalizedExpense.createdAt !== expense?.createdAt
                ) {
                    shouldPersistExpenses = true;
                }

                return normalizedExpense;
            })
            .filter(Boolean);

        if (shouldPersistExpenses) {
            localStorage.setItem('finn_expenses', JSON.stringify(expenses));
        }

        return { expenses, categories };
    }

    function saveExpenses(expenses) {
        localStorage.setItem('finn_expenses', JSON.stringify(expenses));
        renderPage();
    }

    function createExpense(expense) {
        const { expenses } = loadData();
        const nextExpenses = [
            ...expenses,
            {
                id: expense.id || generateId('expense'),
                amount: expense.amount,
                category: expense.category,
                date: expense.date,
                description: normalizeDescription(expense.description),
                createdAt: expense.createdAt || new Date().toISOString()
            }
        ];
        saveExpenses(nextExpenses);
    }

    function deleteExpenseById(expenseId) {
        const { expenses } = loadData();
        saveExpenses(expenses.filter(expense => expense.id !== expenseId));
    }

    function updateExpenseById(expenseId, updates) {
        const { expenses } = loadData();
        const nextExpenses = expenses.map(expense =>
            expense.id === expenseId
                ? {
                    ...expense,
                    amount: updates.amount ?? expense.amount,
                    category: updates.category ?? expense.category,
                    date: updates.date ?? expense.date,
                    description: updates.description !== undefined ? normalizeDescription(updates.description) : expense.description
                }
                : expense
        );
        saveExpenses(nextExpenses);
    }

    function findExpenseById(expenseId) {
        const { expenses } = loadData();
        return expenses.find(expense => expense.id === expenseId) || null;
    }

    function formatDateForInput(dateValue) {
        const [day, month, year] = normalizeDate(dateValue).split('/');
        return `${year}-${month}-${day}`;
    }

    function populateExpenseCategoryOptions(selectedCategory = '') {
        const { categories } = loadData();
        expenseEditCategoryInput.innerHTML = '';

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.title;
            option.textContent = `${category.emoji} ${category.title}`;
            if (category.title === selectedCategory) option.selected = true;
            expenseEditCategoryInput.appendChild(option);
        });
    }

    function populateCreateExpenseCategoryOptions(selectedCategory = '') {
        const { categories } = loadData();
        expenseCreateCategoryInput.innerHTML = '';

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.title;
            option.textContent = `${category.emoji} ${category.title}`;
            if (category.title === selectedCategory) option.selected = true;
            expenseCreateCategoryInput.appendChild(option);
        });
    }

    function openExpenseDescriptionModal(expenseId) {
        const expense = findExpenseById(expenseId);
        if (!expense || !expenseDescriptionModal) return;
        describingExpenseId = expense.id;
        expenseDescriptionInput.value = expense.description || '';
        expenseDescriptionModal.classList.remove('hidden');
        expenseDescriptionModal.setAttribute('aria-hidden', 'false');
        expenseDescriptionInput.focus();
        expenseDescriptionInput.select();
    }

    function closeExpenseDescriptionModal() {
        if (!expenseDescriptionModal) return;
        expenseDescriptionModal.classList.add('hidden');
        expenseDescriptionModal.setAttribute('aria-hidden', 'true');
        describingExpenseId = null;
    }

    function openExpenseEditModal(expenseId) {
        const expense = findExpenseById(expenseId);
        if (!expense || !expenseEditModal) return;
        editingExpenseId = expense.id;
        populateExpenseCategoryOptions(expense.category);
        expenseEditAmountInput.value = expense.amount.toFixed(2);
        expenseEditDateInput.value = formatDateForInput(expense.date);
        expenseEditDescriptionInput.value = expense.description || '';
        expenseEditModal.classList.remove('hidden');
        expenseEditModal.setAttribute('aria-hidden', 'false');
        expenseEditAmountInput.focus();
        expenseEditAmountInput.select();
    }

    function closeExpenseEditModal() {
        if (!expenseEditModal) return;
        expenseEditModal.classList.add('hidden');
        expenseEditModal.setAttribute('aria-hidden', 'true');
        editingExpenseId = null;
    }

    function openExpenseCreateModal() {
        if (!expenseCreateModal) return;
        populateCreateExpenseCategoryOptions();
        expenseCreateAmountInput.value = '';
        expenseCreateDateInput.value = formatDateForInput(formatToday());
        expenseCreateDescriptionInput.value = '';
        expenseCreateModal.classList.remove('hidden');
        expenseCreateModal.setAttribute('aria-hidden', 'false');
        expenseCreateAmountInput.focus();
    }

    function closeExpenseCreateModal() {
        if (!expenseCreateModal) return;
        expenseCreateModal.classList.add('hidden');
        expenseCreateModal.setAttribute('aria-hidden', 'true');
    }

    function openConfirmModal({ title, message, confirmLabel = 'Elimina', onConfirm }) {
        pendingConfirmAction = onConfirm || null;
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmAcceptBtn.textContent = confirmLabel;
        confirmModal.classList.remove('hidden');
        confirmModal.setAttribute('aria-hidden', 'false');
    }

    function closeConfirmModal() {
        confirmModal.classList.add('hidden');
        confirmModal.setAttribute('aria-hidden', 'true');
        pendingConfirmAction = null;
    }

    function renderFilterOptions(expenses, selectedValue) {
        const monthValues = [...new Set(expenses.map(expense => getMonthValue(expense.date)))]
            .sort((a, b) => b.localeCompare(a));

        monthFilter.innerHTML = '';

        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'Tutti i mesi';
        monthFilter.appendChild(allOption);

        monthValues.forEach(monthValue => {
            const option = document.createElement('option');
            option.value = monthValue;
            option.textContent = formatMonthLabel(monthValue);
            monthFilter.appendChild(option);
        });

        const nextValue = monthValues.includes(selectedValue) || selectedValue === 'all' ? selectedValue : 'all';
        monthFilter.value = nextValue;
        return nextValue;
    }

    function renderPage() {
        const { expenses, categories } = loadData();
        const sortedExpenses = sortExpensesByDate(expenses);
        const activeFilter = renderFilterOptions(sortedExpenses, monthFilter.value || 'all');
        const filteredExpenses = activeFilter === 'all'
            ? sortedExpenses
            : sortedExpenses.filter(expense => getMonthValue(expense.date) === activeFilter);

        tableBody.innerHTML = '';

        if (filteredExpenses.length === 0) {
            operationsTable?.classList.add('hidden');
            emptyState.classList.remove('hidden');
        } else {
            operationsTable?.classList.remove('hidden');
            emptyState.classList.add('hidden');
            filteredExpenses.forEach(expense => {
                const category = categories.find(item => item.title === expense.category) || { emoji: '💰', title: expense.category };
                const row = document.createElement('tr');

                const categoryTd = document.createElement('td');
                categoryTd.appendChild(createExpenseCategoryCellElement(category, expense.description));

                const dateTd = document.createElement('td');
                dateTd.textContent = expense.date;

                const amountTd = document.createElement('td');
                amountTd.textContent = `€ ${expense.amount.toFixed(2)}`;

                const actionTd = document.createElement('td');
                actionTd.className = 'table-action-col';
                const actions = document.createElement('div');
                actions.className = 'table-row-actions';
                actions.appendChild(createExpenseDescriptionButton(expense.id, `Aggiungi o modifica descrizione dell'operazione del ${expense.date}`));
                actions.appendChild(createExpenseEditButton(expense.id, `Modifica operazione del ${expense.date}`));
                actions.appendChild(createExpenseDeleteButton(expense.id, `Elimina operazione del ${expense.date}`));
                actionTd.appendChild(actions);

                row.appendChild(categoryTd);
                row.appendChild(dateTd);
                row.appendChild(amountTd);
                row.appendChild(actionTd);
                tableBody.appendChild(row);
            });
        }

        const total = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        totalCell.textContent = `€ ${total.toFixed(2)}`;

        if (filteredExpenses.length === 0) {
            summary.textContent = activeFilter === 'all'
                ? 'Nessuna operazione registrata'
                : `Nessuna operazione in ${formatMonthLabel(activeFilter)}`;
            return;
        }

        summary.textContent = activeFilter === 'all'
            ? `${filteredExpenses.length} operazioni registrate`
            : `${filteredExpenses.length} operazioni in ${formatMonthLabel(activeFilter)}`;
    }

    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    confirmAcceptBtn.addEventListener('click', () => {
        const action = pendingConfirmAction;
        closeConfirmModal();
        action?.();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
            closeConfirmModal();
        }
        if (e.key === 'Escape' && expenseDescriptionModal && !expenseDescriptionModal.classList.contains('hidden')) {
            closeExpenseDescriptionModal();
        }
        if (e.key === 'Escape' && expenseEditModal && !expenseEditModal.classList.contains('hidden')) {
            closeExpenseEditModal();
        }
        if (e.key === 'Escape' && expenseCreateModal && !expenseCreateModal.classList.contains('hidden')) {
            closeExpenseCreateModal();
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-confirm-close]')) {
            closeConfirmModal();
            return;
        }

        if (e.target.closest('[data-expense-description-close]')) {
            closeExpenseDescriptionModal();
            return;
        }

        if (e.target.closest('[data-expense-edit-close]')) {
            closeExpenseEditModal();
            return;
        }

        if (e.target.closest('[data-expense-create-close]')) {
            closeExpenseCreateModal();
            return;
        }

        const descriptionBtn = e.target.closest('[data-expense-description]');
        if (descriptionBtn) {
            openExpenseDescriptionModal(descriptionBtn.dataset.expenseDescription);
            return;
        }

        const editBtn = e.target.closest('[data-expense-edit]');
        if (editBtn) {
            openExpenseEditModal(editBtn.dataset.expenseEdit);
            return;
        }

        const deleteBtn = e.target.closest('[data-expense-delete]');
        if (!deleteBtn) return;

        openConfirmModal({
            title: 'Eliminare questa operazione?',
            message: 'Questa operazione verrà rimossa definitivamente. Non potrà essere ripristinata.',
            confirmLabel: 'Elimina operazione',
            onConfirm: () => deleteExpenseById(deleteBtn.dataset.expenseDelete)
        });
    });

    monthFilter.addEventListener('change', renderPage);

    addExpenseBtn?.addEventListener('click', openExpenseCreateModal);
    expenseDescriptionCancelBtn?.addEventListener('click', closeExpenseDescriptionModal);
    expenseEditCancelBtn?.addEventListener('click', closeExpenseEditModal);
    expenseCreateCancelBtn?.addEventListener('click', closeExpenseCreateModal);

    expenseDescriptionForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!describingExpenseId) return;
        updateExpenseById(describingExpenseId, { description: expenseDescriptionInput.value });
        closeExpenseDescriptionModal();
        renderPage();
    });

    expenseEditForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!editingExpenseId) return;

        const amount = normalizeAmount(expenseEditAmountInput.value);
        const category = expenseEditCategoryInput.value;
        const date = normalizeDate(expenseEditDateInput.value);

        if (amount === null || !category) {
            window.alert('Controlla importo e categoria della spesa.');
            return;
        }

        updateExpenseById(editingExpenseId, {
            amount,
            category,
            date,
            description: expenseEditDescriptionInput.value
        });
        closeExpenseEditModal();
        renderPage();
    });

    expenseCreateForm?.addEventListener('submit', (e) => {
        e.preventDefault();

        const amount = normalizeAmount(expenseCreateAmountInput.value);
        const category = expenseCreateCategoryInput.value;
        const date = normalizeDate(expenseCreateDateInput.value);

        if (amount === null || !category) {
            window.alert('Controlla importo e categoria della spesa.');
            return;
        }

        createExpense({
            amount,
            category,
            date,
            description: expenseCreateDescriptionInput.value
        });
        closeExpenseCreateModal();
        renderPage();
    });

    renderPage();
});
