const API_KEY = "INSERISCI-QUI-LA-TUA-CHIAVE";
const GEMINI_MODEL = "gemini-2.5-flash";

document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM References ---
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const appContainer = document.getElementById('app-container');
    const chatHistory = document.getElementById('chat-history');
    const navHome = document.getElementById('nav-home');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmAcceptBtn = document.getElementById('confirm-accept-btn');
    const categoryEditModal = document.getElementById('category-edit-modal');
    const categoryEditForm = document.getElementById('category-edit-form');
    const categoryEditNameInput = document.getElementById('category-edit-name');
    const categoryEditColorInput = document.getElementById('category-edit-color');
    const categoryEditEmojiInput = document.getElementById('category-edit-emoji');
    const categoryEditCancelBtn = document.getElementById('category-edit-cancel');
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

    let hasStartedChatting = false;
    let botHasGreeted = false;
    let pendingConfirmAction = null;
    let isSendingMessage = false;
    let editingCategoryTitle = null;
    let editingExpenseId = null;
    let describingExpenseId = null;
    let pendingExpenseConfirmation = null;
    let pendingDeletionConfirmation = null;

    function setChatRequestState(isLoading) {
        isSendingMessage = isLoading;

        if (chatInput) {
            chatInput.disabled = isLoading;
        }

        if (sendBtn) {
            sendBtn.disabled = isLoading;
        }
    }

    // Funzione invio messaggio
    async function sendMessage() {
        if (isSendingMessage) return;

        const text = chatInput.value.trim();
        if (text === '') return;

        hasStartedChatting = true;
        document.body.classList.add('chat-started');

        // Nascondi elementi home
        document.getElementById('dashboard-section').classList.add('hidden');
        document.getElementById('hero-intro').classList.add('hidden');
        document.getElementById('nav-dati').classList.remove('active');
        navHome.classList.remove('active');

        // Trasforma l'interfaccia se è il primo messaggio
        if (!appContainer.classList.contains('chat-active')) {
            appContainer.classList.add('chat-active');
            chatHistory.classList.remove('hidden');
            document.getElementById('nav-chat').classList.add('active');
        }

        // Aggiungi messaggio Utente
        appendMessage('user', text);
        chatInput.value = '';

        if (pendingDeletionConfirmation) {
            if (isAffirmativeReply(text)) {
                let reply = "Perfetto, eliminazione completata.";

                if (pendingDeletionConfirmation.type === 'expense') {
                    deleteExpenseById(pendingDeletionConfirmation.expense.id);
                    reply = `Fatto, ho eliminato la spesa da ${formatCurrency(pendingDeletionConfirmation.expense.amount)} del ${pendingDeletionConfirmation.expense.date}.`;
                }

                if (pendingDeletionConfirmation.type === 'category') {
                    deleteCategoryByTitle(pendingDeletionConfirmation.category.title);
                    reply = `Categoria "${pendingDeletionConfirmation.category.title}" eliminata.`;
                }

                appendMessage('bot', reply);
                geminiHistory.push({ role: "user", parts: [{ text }] });
                geminiHistory.push({ role: "model", parts: [{ text: reply }] });
                pendingDeletionConfirmation = null;
                return;
            }

            if (isNegativeReply(text)) {
                const reply = "Tutto fermo, non elimino nulla.";
                appendMessage('bot', reply);
                geminiHistory.push({ role: "user", parts: [{ text }] });
                geminiHistory.push({ role: "model", parts: [{ text: reply }] });
                pendingDeletionConfirmation = null;
                return;
            }

            pendingDeletionConfirmation = null;
        }

        if (pendingExpenseConfirmation) {
            if (isAffirmativeReply(text)) {
                const savedData = saveExpenseBatch(pendingExpenseConfirmation.expenses);
                const reply = buildExpenseSavedMessage(pendingExpenseConfirmation.expenses, savedData);
                appendMessage('bot', reply);
                geminiHistory.push({ role: "user", parts: [{ text }] });
                geminiHistory.push({ role: "model", parts: [{ text: reply }] });
                pendingExpenseConfirmation = null;
                return;
            }

            if (isNegativeReply(text)) {
                const reply = "Ricevuto, non salvo nulla. Se vuoi, riscrivimi la spesa corretta e la preparo di nuovo.";
                appendMessage('bot', reply);
                geminiHistory.push({ role: "user", parts: [{ text }] });
                geminiHistory.push({ role: "model", parts: [{ text: reply }] });
                pendingExpenseConfirmation = null;
                return;
            }

            pendingExpenseConfirmation = null;
        }

        await sendMessageToGemini(text);
    }

    let geminiHistory = [];
    const DEFAULT_CATEGORIES = [
        { title: "Cibo", color: "#ff9900", emoji: "🍽️" },
        { title: "Trasporti", color: "#007dff", emoji: "🚗" },
        { title: "Spesa", color: "#2bcbba", emoji: "🛍️" }
    ];

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

    function extractJsonFromText(text) {
        if (!text) return null;

        const cleaned = text
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

        try {
            return JSON.parse(cleaned);
        } catch (error) {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');

            if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
                return null;
            }

            try {
                return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
            } catch (nestedError) {
                return null;
            }
        }
    }

    function safeParseJson(text) {
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
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
        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            return formatToday(value);
        }

        const fallback = typeof fallbackDate === 'string' ? normalizeDate(fallbackDate, new Date()) : formatToday(fallbackDate);
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

    function buildExpenseConfirmation(amount, category, date) {
        return `Ho registrato € ${amount.toFixed(2)} in ${category} per il ${date}.`;
    }

    function normalizeDescription(value) {
        return (value || '').toString().replace(/\s+/g, ' ').trim();
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

    function parseDateString(dateValue) {
        if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
            return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 12, 0, 0, 0);
        }

        const [day, month, year] = normalizeDate(dateValue).split('/');
        return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    }

    function addDays(date, days) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + days);
        return nextDate;
    }

    function getDaysUntil(dateValue, referenceDate = new Date()) {
        const targetDate = parseDateString(dateValue);
        const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
        const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
        return Math.round((end - start) / 86400000);
    }

    function formatCurrency(amount) {
        const numericAmount = Number(amount || 0);
        return `€ ${numericAmount.toFixed(2)}`;
    }

    function formatRelativeDays(days) {
        if (days === 0) return 'oggi';
        if (days === 1) return 'domani';
        if (days === -1) return 'ieri';
        if (days > 1) return `tra ${days} giorni`;
        return `${Math.abs(days)} giorni fa`;
    }

    function getDateRangeForPeriod(period, referenceDate = new Date()) {
        const baseDate = parseDateString(referenceDate);
        const start = new Date(baseDate);
        const end = new Date(baseDate);
        const normalizedPeriod = normalizeText(period);

        if (normalizedPeriod === 'weekly' || normalizedPeriod === 'settimanale' || normalizedPeriod === 'settimana') {
            const day = start.getDay() === 0 ? 7 : start.getDay();
            start.setDate(start.getDate() - day + 1);
            end.setDate(start.getDate() + 6);
            return { start, end, label: 'questa settimana' };
        }

        if (normalizedPeriod === 'monthly' || normalizedPeriod === 'mensile' || normalizedPeriod === 'mese') {
            start.setDate(1);
            end.setMonth(end.getMonth() + 1, 0);
            return { start, end, label: 'questo mese' };
        }

        return { start, end, label: 'oggi' };
    }

    function isDateInRange(dateValue, start, end) {
        const current = parseDateString(dateValue);
        return current >= start && current <= end;
    }

    function isFutureDateValue(dateValue, referenceDate = new Date()) {
        const targetDate = parseDateString(dateValue);
        const reference = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0, 0);
        return targetDate > reference;
    }

    function formatCategoryBreakdown(expenses) {
        if (!expenses.length) return 'Nessuna spesa registrata nel periodo.';

        const totals = {};
        expenses.forEach(expense => {
            totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
        });

        return Object.entries(totals)
            .sort((a, b) => b[1] - a[1])
            .map(([category, total]) => `${category}: ${formatCurrency(total)}`)
            .join(', ');
    }

    function sortExpensesByDate(expenses) {
        return [...expenses].sort((a, b) => {
            const createdAtDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            if (createdAtDiff !== 0) return createdAtDiff;
            return getSortableDateKey(b.date).localeCompare(getSortableDateKey(a.date));
        });
    }

    function sortPaymentsByDate(payments) {
        return [...payments].sort((a, b) => getSortableDateKey(a.dueDate).localeCompare(getSortableDateKey(b.dueDate)));
    }

    function buildPaymentReminderConfirmation(name, amount, dueDate) {
        const amountLabel = amount === null ? '' : ` di ${formatCurrency(amount)}`;
        return `Promemoria salvato: ${name}${amountLabel}, scadenza ${dueDate}.`;
    }

    function getCategoryMeta(categoryTitle, categories) {
        return categories.find(category => category.title === categoryTitle) || { title: categoryTitle, emoji: '💰' };
    }

    function isAffirmativeReply(value) {
        const normalized = normalizeText(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        return ['si', 'sì', 'ok', 'va bene', 'procedi', 'confermo', 'yes', 'certo', 'vai']
            .some(token => normalized === token || normalized.includes(token));
    }

    function isNegativeReply(value) {
        const normalized = normalizeText(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
        return ['no', 'annulla', 'stop', 'aspetta', 'non ancora', 'cancel']
            .some(token => normalized === token || normalized.includes(token));
    }

    function normalizeExpenseDrafts(rawDrafts, userText, categories, today) {
        const drafts = Array.isArray(rawDrafts) ? rawDrafts : [rawDrafts];

        return drafts
            .map(draft => {
                const amount = normalizeAmount(draft?.amount, userText);
                if (amount === null) return null;

                return {
                    amount,
                    category: resolveCategory(draft?.category, userText, categories),
                    date: normalizeDate(draft?.date, today),
                    description: normalizeDescription(draft?.description)
                };
            })
            .filter(Boolean);
    }

    function buildExpenseProposalMessage(expenses, categories) {
        const details = expenses
            .map(expense => {
                const category = getCategoryMeta(expense.category, categories);
                const descriptionLabel = expense.description ? `, nota: ${expense.description}` : '';
                return `${category.emoji} ${formatCurrency(expense.amount)} in "${expense.category}"${descriptionLabel}`;
            })
            .join('\n');

        const opener = expenses.length > 1
            ? 'Ricevuto, ho messo insieme il riepilogo delle spese di questo messaggio:'
            : 'Ricevuto, questa e la spesa che sto per segnare:';

        return `${opener}\n${details}\n\nConfermi l'inserimento?`;
    }

    function saveExpenseBatch(expensesToSave) {
        const currentData = loadData();
        const nextExpenses = [
            ...currentData.expenses,
            ...expensesToSave.map(expense => ({
                id: expense.id || generateId('expense'),
                amount: expense.amount,
                category: expense.category,
                date: expense.date,
                description: normalizeDescription(expense.description),
                createdAt: expense.createdAt || new Date().toISOString()
            }))
        ];

        window.saveData('finn_expenses', nextExpenses);
        return { ...currentData, expenses: nextExpenses };
    }

    function buildMonthlyCategoryInsight(expensesAdded, data) {
        if (!expensesAdded.length) return '';

        const targetExpense = [...expensesAdded].sort((a, b) => b.amount - a.amount)[0];
        const targetDate = parseDateString(targetExpense.date);
        const monthExpenses = data.expenses.filter(expense => {
            const expenseDate = parseDateString(expense.date);
            return expenseDate.getMonth() === targetDate.getMonth() && expenseDate.getFullYear() === targetDate.getFullYear();
        });

        const categoryTotal = monthExpenses
            .filter(expense => expense.category === targetExpense.category)
            .reduce((sum, expense) => sum + expense.amount, 0);
        const monthTotal = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);

        if (!monthTotal || !categoryTotal) return '';

        const share = categoryTotal / monthTotal;
        if (share >= 0.45 && categoryTotal >= 80) {
            return `Occhio solo a ${targetExpense.category}: questo mese pesa gia ${formatCurrency(categoryTotal)} sul totale.`;
        }

        if (share <= 0.25) {
            return `Per ora ${targetExpense.category} e sotto controllo: sei a ${formatCurrency(categoryTotal)} questo mese.`;
        }

        return `Questo mese in ${targetExpense.category} sei a ${formatCurrency(categoryTotal)}.`;
    }

    function buildExpenseSavedMessage(expensesAdded, data) {
        const totalAdded = expensesAdded.reduce((sum, expense) => sum + expense.amount, 0);
        const intro = expensesAdded.length > 1
            ? `Perfetto, ho registrato ${expensesAdded.length} spese per un totale di ${formatCurrency(totalAdded)}.`
            : `Perfetto, ho registrato la spesa da ${formatCurrency(totalAdded)}.`;
        const insight = buildMonthlyCategoryInsight(expensesAdded, data);
        return insight ? `${intro} ${insight}` : intro;
    }

    function getRoundedChartMax(values) {
        const numericValues = (values || []).filter(value => Number.isFinite(Number(value))).map(Number);
        const maxValue = numericValues.length ? Math.max(...numericValues) : 0;
        return Math.max(100, Math.ceil(maxValue / 100) * 100);
    }

    function getChartStepSize(maxValue) {
        if (maxValue <= 100) return 20;
        if (maxValue <= 200) return 50;
        return 100;
    }

    function findCategoryByName(categoryName, categories) {
        const normalizedTarget = normalizeText(categoryName);
        if (!normalizedTarget) return null;

        return categories.find(category => {
            const normalizedTitle = normalizeText(category.title);
            return normalizedTitle === normalizedTarget
                || normalizedTitle.includes(normalizedTarget)
                || normalizedTarget.includes(normalizedTitle);
        }) || null;
    }

    function buildExpenseDeletionProposalMessage(expense, categories) {
        const category = getCategoryMeta(expense.category, categories);
        const descriptionLabel = expense.description ? `, nota: ${expense.description}` : '';
        return `Sto per eliminare ${category.emoji} ${formatCurrency(expense.amount)} del ${expense.date} in "${expense.category}"${descriptionLabel}. Confermi?`;
    }

    function buildCategoryDeletionProposalMessage(category) {
        return `Sto per eliminare la categoria "${category.title}" ${category.emoji}. Confermi?`;
    }

    function buildSpendingSummary(period, referenceDateValue, expenses, payments) {
        const referenceDate = parseDateString(referenceDateValue || formatToday());
        const { start, end, label } = getDateRangeForPeriod(period, referenceDate);
        const expensesInRange = expenses.filter(expense => isDateInRange(expense.date, start, end));
        const paymentsInRange = payments.filter(payment => isDateInRange(payment.dueDate, start, end));
        const totalSpent = expensesInRange.reduce((sum, expense) => sum + expense.amount, 0);

        const lines = [
            `Resoconto ${label}: hai speso ${formatCurrency(totalSpent)}.`,
            `Per categoria: ${formatCategoryBreakdown(expensesInRange)}`
        ];

        if (paymentsInRange.length) {
            const paymentSummary = sortPaymentsByDate(paymentsInRange)
                .map(payment => {
                    const amountLabel = payment.amount === null ? '' : ` (${formatCurrency(payment.amount)})`;
                    return `${payment.name} il ${payment.dueDate}${amountLabel}`;
                })
                .join(', ');
            lines.push(`Pagamenti in scadenza nel periodo: ${paymentSummary}.`);
        } else {
            lines.push('Nessun pagamento imminente nel periodo richiesto.');
        }

        return lines.join(' ');
    }

    function buildUpcomingPaymentsMessage(payments, rangeDays = 7, referenceDate = new Date()) {
        const safeRange = Number.isFinite(Number(rangeDays)) ? Math.max(1, Number(rangeDays)) : 7;
        const upcoming = sortPaymentsByDate(payments).filter(payment => {
            const daysUntil = getDaysUntil(payment.dueDate, referenceDate);
            return daysUntil >= 0 && daysUntil <= safeRange;
        });

        if (!upcoming.length) {
            return `Non hai pagamenti imminenti nei prossimi ${safeRange} giorni.`;
        }

        const details = upcoming
            .map(payment => {
                const amountLabel = payment.amount === null ? '' : ` per ${formatCurrency(payment.amount)}`;
                return `${payment.name}${amountLabel}, scade ${payment.dueDate} (${formatRelativeDays(getDaysUntil(payment.dueDate, referenceDate))})`;
            })
            .join('; ');

        return `Nei prossimi ${safeRange} giorni devi ricordarti: ${details}.`;
    }

    function buildPaymentDueDateMessage(payments, paymentName, referenceDate = new Date()) {
        const normalizedTarget = normalizeText(paymentName);
        if (!normalizedTarget) {
            return buildUpcomingPaymentsMessage(payments, 30, referenceDate);
        }

        const match = sortPaymentsByDate(payments).find(payment => {
            const normalizedName = normalizeText(payment.name);
            return normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName);
        });

        if (!match) {
            return `Non trovo nessun promemoria di pagamento che corrisponda a "${paymentName}".`;
        }

        const daysUntil = getDaysUntil(match.dueDate, referenceDate);
        const amountLabel = match.amount === null ? '' : ` da ${formatCurrency(match.amount)}`;
        return `${match.name}${amountLabel} è previsto per il ${match.dueDate} (${formatRelativeDays(daysUntil)}).`;
    }

    function buildBotDataContext(data) {
        const recentExpenses = sortExpensesByDate(data.expenses)
            .slice(0, 20)
            .map(expense => {
                const descriptionLabel = expense.description ? ` | ${expense.description}` : '';
                return `${expense.date} | ${expense.category} | ${formatCurrency(expense.amount)}${descriptionLabel}`;
            })
            .join('\n') || 'Nessuna spesa registrata';

        const upcomingPayments = sortPaymentsByDate(data.payments)
            .slice(0, 20)
            .map(payment => {
                const amountLabel = payment.amount === null ? 'importo non specificato' : formatCurrency(payment.amount);
                return `${payment.name} | ${payment.dueDate} | ${amountLabel}`;
            })
            .join('\n') || 'Nessun pagamento imminente registrato';

        return `DATI UTENTE AGGIORNATI
Categorie attive: ${data.categories.map(category => category.title).join(', ')}
Spese registrate:
${recentExpenses}
Pagamenti imminenti:
${upcomingPayments}`;
    }

    function getTrashIconMarkup() {
        return `
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M9.25 3.25C8.00736 3.25 7 4.25736 7 5.5V6H4.75C4.33579 6 4 6.33579 4 6.75V7.25C4 7.66421 4.33579 8 4.75 8H19.25C19.6642 8 20 7.66421 20 7.25V6.75C20 6.33579 19.6642 6 19.25 6H17V5.5C17 4.25736 15.9926 3.25 14.75 3.25H9.25ZM15 6V5.75C15 5.33579 14.6642 5 14.25 5H9.75C9.33579 5 9 5.33579 9 5.75V6H15ZM6.79984 9.25C6.36063 9.25 6.01503 9.62634 6.0524 10.0639L6.75175 18.2474C6.86188 19.536 7.94026 20.525 9.23354 20.525H14.7665C16.0597 20.525 17.1381 19.536 17.2483 18.2474L17.9476 10.0639C17.985 9.62634 17.6394 9.25 17.2002 9.25H6.79984ZM9.25 11.25C9.66421 11.25 10 11.5858 10 12V17C10 17.4142 9.66421 17.75 9.25 17.75C8.83579 17.75 8.5 17.4142 8.5 17V12C8.5 11.5858 8.83579 11.25 9.25 11.25ZM12 11.25C12.4142 11.25 12.75 11.5858 12.75 12V17C12.75 17.4142 12.4142 17.75 12 17.75C11.5858 17.75 11.25 17.4142 11.25 17V12C11.25 11.5858 11.5858 11.25 12 11.25ZM15.5 12C15.5 11.5858 15.1642 11.25 14.75 11.25C14.3358 11.25 14 11.5858 14 12V17C14 17.4142 14.3358 17.75 14.75 17.75C15.1642 17.75 15.5 17.4142 15.5 17V12Z"/>
            </svg>
        `;
    }

    function openConfirmModal({ title, message, confirmLabel = 'Elimina', onConfirm }) {
        if (!confirmModal || !confirmModalTitle || !confirmModalMessage || !confirmAcceptBtn) {
            if (window.confirm(`${title}\n\n${message}`)) {
                onConfirm?.();
            }
            return;
        }

        pendingConfirmAction = onConfirm || null;
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmAcceptBtn.textContent = confirmLabel;
        confirmModal.classList.remove('hidden');
        confirmModal.setAttribute('aria-hidden', 'false');
    }

    function closeConfirmModal() {
        if (!confirmModal) return;
        confirmModal.classList.add('hidden');
        confirmModal.setAttribute('aria-hidden', 'true');
        pendingConfirmAction = null;
    }

    function persistExpense(expense) {
        const currentData = loadData();
        currentData.expenses.push({
            id: expense.id || generateId('expense'),
            amount: expense.amount,
            category: expense.category,
            date: expense.date,
            description: normalizeDescription(expense.description),
            createdAt: expense.createdAt || new Date().toISOString()
        });
        window.saveData('finn_expenses', currentData.expenses);
    }

    function getSortableDateKey(dateValue) {
        const normalizedDate = normalizeDate(dateValue);
        const [day, month, year] = normalizedDate.split('/');
        return `${year}${month}${day}`;
    }

    function deleteExpenseById(expenseId) {
        const { expenses } = loadData();
        const nextExpenses = expenses.filter(expense => expense.id !== expenseId);
        window.saveData('finn_expenses', nextExpenses);
    }

    function updateExpenseById(expenseId, updates) {
        const { expenses } = loadData();
        const nextExpenses = expenses.map(expense => {
            if (expense.id !== expenseId) return expense;

            return {
                ...expense,
                amount: updates.amount ?? expense.amount,
                category: updates.category ?? expense.category,
                date: updates.date ?? expense.date,
                description: updates.description !== undefined ? normalizeDescription(updates.description) : expense.description
            };
        });

        window.saveData('finn_expenses', nextExpenses);
    }

    function findExpenseById(expenseId) {
        const { expenses } = loadData();
        return expenses.find(expense => expense.id === expenseId) || null;
    }

    function findExpenseForDescriptionUpdate({ expenseId, amount, category, date }) {
        const { expenses } = loadData();
        if (expenseId) {
            return expenses.find(expense => expense.id === expenseId) || null;
        }

        const normalizedCategory = normalizeText(category);
        const normalizedDate = date ? normalizeDate(date) : '';
        const normalizedAmount = normalizeAmount(amount);

        return sortExpensesByDate(expenses).find(expense => {
            const amountMatches = normalizedAmount === null || expense.amount === normalizedAmount;
            const categoryMatches = !normalizedCategory || normalizeText(expense.category) === normalizedCategory;
            const dateMatches = !normalizedDate || expense.date === normalizedDate;
            return amountMatches && categoryMatches && dateMatches;
        }) || null;
    }

    function deletePaymentById(paymentId) {
        const { payments } = loadData();
        const nextPayments = payments.filter(payment => payment.id !== paymentId);
        window.saveData('finn_payments', nextPayments);
    }

    function deleteCategoryByTitle(categoryTitle) {
        const { categories } = loadData();
        const nextCategories = categories.filter(category => normalizeText(category.title) !== normalizeText(categoryTitle));
        window.saveData('finn_categories', nextCategories);
    }

    function updateCategoryByTitle(originalTitle, nextCategory) {
        const data = loadData();
        const normalizedOriginalTitle = normalizeText(originalTitle);
        const normalizedNextTitle = normalizeText(nextCategory.title);

        const duplicateCategory = data.categories.find(category =>
            normalizeText(category.title) === normalizedNextTitle &&
            normalizeText(category.title) !== normalizedOriginalTitle
        );

        if (duplicateCategory) {
            return { ok: false, reason: 'exists' };
        }

        const nextCategories = data.categories.map(category =>
            normalizeText(category.title) === normalizedOriginalTitle
                ? { ...category, ...nextCategory }
                : category
        );

        const nextExpenses = data.expenses.map(expense =>
            normalizeText(expense.category) === normalizedOriginalTitle
                ? { ...expense, category: nextCategory.title }
                : expense
        );

        localStorage.setItem('finn_categories', JSON.stringify(nextCategories));
        localStorage.setItem('finn_expenses', JSON.stringify(nextExpenses));
        updateDashboard();
        return { ok: true };
    }

    function createCategoryCellElement(category, description = '') {
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

        const normalizedDescription = normalizeDescription(description);
        if (normalizedDescription) {
            const descriptionEl = document.createElement('span');
            descriptionEl.className = 'expense-description-preview';
            descriptionEl.textContent = normalizedDescription;
            wrapper.appendChild(descriptionEl);
        }

        return wrapper;
    }

    function createExpenseActionButton(className, datasetKey, datasetValue, label, iconMarkup) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `table-action-btn ${className}`;
        button.dataset[datasetKey] = datasetValue;
        button.setAttribute('aria-label', label);
        button.innerHTML = iconMarkup;
        return button;
    }

    function createExpenseDescriptionButton(expenseId, label) {
        return createExpenseActionButton('table-description-btn', 'expenseDescription', expenseId, label, getDescriptionIconMarkup());
    }

    function createExpenseEditButton(expenseId, label) {
        return createExpenseActionButton('table-edit-btn', 'expenseEdit', expenseId, label, getEditIconMarkup());
    }

    function createExpenseDeleteButton(expenseId, label) {
        return createExpenseActionButton('table-delete-btn', 'expenseDelete', expenseId, label, getTrashIconMarkup());
    }

    function createPaymentDeleteButton(paymentId, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'payment-delete-btn';
        button.dataset.paymentDelete = paymentId;
        button.setAttribute('aria-label', label);
        button.innerHTML = getTrashIconMarkup();
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

    async function sendMessageToGemini(userText) {
        if (isSendingMessage) return;

        const dataSnapshot = loadData();
        const { categories, expenses, payments } = dataSnapshot;
        const categoryList = categories.map(c => c.title).join(', ');
        const today = new Date();
        const todayStr = formatToday(today);
        const dataContext = buildBotDataContext(dataSnapshot);
        const systemInstruction = `Sei Finn, un assistente per la gestione delle spese quotidiane. Non definirti mai coach finanziario e non parlare come se aiutassi l'utente a guadagnare soldi. Sei brillante, caldo, un po' carismatico, concreto e breve. Puoi dare piccoli consigli sulle abitudini di spesa solo se basati sui dati reali dell'utente, senza inventare numeri o fare morale. Analizza la richiesta dell'utente. Devi SEMPRE E SOLO rispondere con un oggetto JSON valido, senza markup markdown.

Categorie disponibili in questo momento: ${categoryList}.
Oggi è il ${todayStr}.

${dataContext}

Se l'utente ti chiede di registrare una o piu spese, NON salvarle direttamente: prepara sempre una proposta di conferma con:
{"action":"propose_expenses","expenses":[{"amount":10.50,"category":"[NOME CATEGORIA PIU' VICINA TRA QUELLE ESISTENTI]","date":"gg/mm/yyyy","description":"[facoltativa]"}],"message":"[breve riepilogo carismatico]"}

Se l'utente ti chiede di registrare un pagamento imminente o un promemoria, il JSON deve essere:
{"action":"add_payment","name":"[nome pagamento]","amount":49.99,"due_date":"gg/mm/yyyy","message":"Ho salvato il promemoria del pagamento."}

Se l'utente chiede un resoconto giornaliero, settimanale o mensile delle spese, il JSON deve essere:
{"action":"get_summary","period":"daily|weekly|monthly","reference_date":"gg/mm/yyyy"}

Se l'utente chiede se ci sono pagamenti in arrivo nei prossimi giorni, il JSON deve essere:
{"action":"get_upcoming_payments","range_days":7}

Se l'utente chiede quando deve pagare qualcosa di specifico, il JSON deve essere:
{"action":"get_payment_due_date","payment_name":"[nome pagamento]"}

Se l'utente chiede di aggiungere o aggiornare una descrizione a una spesa gia registrata, il JSON deve essere:
{"action":"set_expense_description","description":"[nuova descrizione]","amount":10.50,"category":"[categoria della spesa]","date":"gg/mm/yyyy","message":"Descrizione aggiornata."}

Se l'utente chiede di eliminare una spesa gia registrata, NON eliminarla subito: prepara sempre una conferma con:
{"action":"propose_delete_expense","amount":10.50,"category":"[categoria della spesa]","date":"gg/mm/yyyy","description":"[facoltativa]","message":"[breve riepilogo carismatico]"}

Se l'utente chiede di eliminare una categoria, NON eliminarla subito: prepara sempre una conferma con:
{"action":"propose_delete_category","category":"[nome categoria]","message":"[breve riepilogo carismatico]"}

Regole obbligatorie:
- "amount" deve essere un numero.
- "category" deve essere una sola categoria tra quelle disponibili.
- "date" e "due_date" devono essere sempre nel formato gg/mm/yyyy.
- "description" e facoltativa ma, se presente, deve essere una stringa breve e chiara.
- Se l'utente non specifica una data, usa ${todayStr}.
- Se la data della spesa e nel futuro, non proporre il salvataggio come spesa: rispondi con "chat" spiegando che puoi registrarla meglio nelle spese programmate.
- Quando l'utente elenca nuove spese da registrare, usa sempre "propose_expenses" anche se e una sola.
- Quando l'utente chiede di eliminare una spesa o una categoria, usa sempre una action di tipo "propose_delete_*" e aspetta la conferma.
- Se l'utente parla di pagamenti imminenti o promemoria, NON usare "add_expense": usa sempre "add_payment".
- Se l'utente chiede informazioni sui suoi dati o resoconti, usa una delle action strutturate sopra invece di "chat" quando possibile.

Se l'utente fa solo una domanda, restituisci:
{"action":"chat","message":"[tua risposta discorsiva]"}

Rispondi sempre e solo con JSON valido.`;

        geminiHistory.push({ role: "user", parts: [{ text: userText }] });
        setChatRequestState(true);

        const typingId = 'typing-' + Date.now();
        const wrapper = document.createElement('div');
        wrapper.classList.add('bot-msg-wrapper');
        wrapper.id = typingId;
        const pfp = document.createElement('img');
        pfp.src = `images/pfp.png?v=${new Date().getTime()}`;
        pfp.classList.add('bot-pfp');
        pfp.alt = 'Finn';
        const botMessage = document.createElement('div');
        botMessage.classList.add('msg', 'bot', 'typing');
        botMessage.innerText = "...";
        wrapper.appendChild(pfp);
        wrapper.appendChild(botMessage);
        chatHistory.appendChild(wrapper);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemInstruction }] },
                    contents: geminiHistory,
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });
            const rawResponseText = await response.text();
            const data = safeParseJson(rawResponseText);

            document.getElementById(typingId)?.remove();

            if (!response.ok) {
                const apiError = data?.error?.message || rawResponseText || "Impossibile contattare Gemini";
                appendMessage('bot', `Errore Gemini: ${apiError}`);
                return;
            }

            if (data?.candidates && data.candidates.length > 0) {
                const botReplyRaw = data.candidates[0]?.content?.parts?.[0]?.text || '';
                const actionData = extractJsonFromText(botReplyRaw);
                geminiHistory.push({ role: "model", parts: [{ text: botReplyRaw }] });

                if (!actionData) {
                    appendMessage('bot', "Non sono riuscito a interpretare bene la risposta. Riprova scrivendo importo e categoria.");
                    return;
                }

                if (actionData.action === "propose_expenses" || actionData.action === "add_expense") {
                    const normalizedExpenses = normalizeExpenseDrafts(
                        actionData.action === "propose_expenses" ? actionData.expenses : actionData,
                        userText,
                        categories,
                        today
                    );

                    if (!normalizedExpenses.length) {
                        appendMessage('bot', "Non ho capito bene le spese da registrare. Riprova scrivendo importo e categoria.");
                        return;
                    }

                    const futureExpenses = normalizedExpenses.filter(expense => isFutureDateValue(expense.date, today));
                    if (futureExpenses.length) {
                        const reply = futureExpenses.length === normalizedExpenses.length
                            ? "Quella spesa e nel futuro, quindi non la salvo tra le operazioni di oggi. Se vuoi, posso trattarla come spesa programmata."
                            : "Ho trovato anche una spesa con data futura, quindi non la inserisco nelle operazioni. Se vuoi, posso registrarla tra le spese programmate.";
                        appendMessage('bot', reply);
                        return;
                    }

                    pendingDeletionConfirmation = null;
                    pendingExpenseConfirmation = { expenses: normalizedExpenses };
                    appendMessage('bot', actionData.message || buildExpenseProposalMessage(normalizedExpenses, categories));
                    return;
                }

                if (actionData.action === "add_payment") {
                    const paymentName = (actionData.name || actionData.payment_name || actionData.title || 'Pagamento').toString().trim();
                    const amount = normalizeAmount(actionData.amount);
                    const dueDate = normalizeDate(actionData.due_date || actionData.date, today);

                    const currentData = loadData();
                    currentData.payments.push({
                        id: generateId('payment'),
                        name: paymentName,
                        amount,
                        dueDate
                    });
                    window.saveData('finn_payments', currentData.payments);

                    appendMessage('bot', actionData.message || buildPaymentReminderConfirmation(paymentName, amount, dueDate));
                    return;
                }

                if (actionData.action === "get_summary") {
                    appendMessage('bot', buildSpendingSummary(actionData.period, actionData.reference_date || todayStr, expenses, payments));
                    return;
                }

                if (actionData.action === "get_upcoming_payments") {
                    appendMessage('bot', buildUpcomingPaymentsMessage(payments, actionData.range_days || 7, today));
                    return;
                }

                if (actionData.action === "get_payment_due_date") {
                    appendMessage('bot', buildPaymentDueDateMessage(payments, actionData.payment_name || actionData.name || '', today));
                    return;
                }

                if (actionData.action === "set_expense_description") {
                    const targetExpense = findExpenseForDescriptionUpdate({
                        expenseId: actionData.expense_id,
                        amount: actionData.amount,
                        category: actionData.category ? resolveCategory(actionData.category, userText, categories) : '',
                        date: actionData.date ? normalizeDate(actionData.date, today) : ''
                    });
                    const description = normalizeDescription(actionData.description);

                    if (!targetExpense || !description) {
                        appendMessage('bot', "Non sono riuscito a capire a quale spesa aggiungere la descrizione. Indicami almeno importo, categoria o data.");
                        return;
                    }

                    updateExpenseById(targetExpense.id, { description });
                    appendMessage('bot', actionData.message || `Ho aggiunto la descrizione alla spesa del ${targetExpense.date}.`);
                    return;
                }

                if (actionData.action === "propose_delete_expense") {
                    const targetExpense = findExpenseForDescriptionUpdate({
                        expenseId: actionData.expense_id,
                        amount: actionData.amount,
                        category: actionData.category ? resolveCategory(actionData.category, userText, categories) : '',
                        date: actionData.date ? normalizeDate(actionData.date, today) : ''
                    });

                    if (!targetExpense) {
                        appendMessage('bot', "Non riesco a capire quale spesa eliminare. Dammi almeno importo, categoria o data.");
                        return;
                    }

                    pendingDeletionConfirmation = { type: 'expense', expense: targetExpense };
                    pendingExpenseConfirmation = null;
                    appendMessage('bot', actionData.message || buildExpenseDeletionProposalMessage(targetExpense, categories));
                    return;
                }

                if (actionData.action === "propose_delete_category") {
                    const targetCategory = findCategoryByName(actionData.category || actionData.category_title, categories);

                    if (!targetCategory) {
                        appendMessage('bot', "Non trovo la categoria da eliminare. Scrivimi il nome esatto e la preparo.");
                        return;
                    }

                    pendingDeletionConfirmation = { type: 'category', category: targetCategory };
                    pendingExpenseConfirmation = null;
                    appendMessage('bot', actionData.message || buildCategoryDeletionProposalMessage(targetCategory));
                    return;
                }

                appendMessage('bot', actionData.message || "Ci sono, dimmi pure.");
                return;
            }

            appendMessage('bot', "Gemini non ha restituito una risposta valida.");
        } catch (err) {
            document.getElementById(typingId)?.remove();
            appendMessage('bot', `Errore di connessione: ${err?.message || "richiesta non completata"}`);
        } finally {
            setChatRequestState(false);
            chatInput?.focus();
        }
    };

    const appendMessage = (sender, text) => {
        if (sender === 'bot') {
            const wrapper = document.createElement('div');
            wrapper.classList.add('bot-msg-wrapper');

            const pfp = document.createElement('img');
            pfp.src = `images/pfp.png?v=${new Date().getTime()}`;
            pfp.classList.add('bot-pfp');
            pfp.alt = 'Finn';

            const botMessage = document.createElement('div');
            botMessage.classList.add('msg', 'bot');
            botMessage.innerText = text;

            wrapper.appendChild(pfp);
            wrapper.appendChild(botMessage);
            chatHistory.appendChild(wrapper);
        } else {
            const msgDiv = document.createElement('div');
            msgDiv.className = `msg ${sender}`;
            msgDiv.innerText = text;
            chatHistory.appendChild(msgDiv);
        }
        chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll
    };

    // Event Listeners Chat
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    const navDati = document.getElementById('nav-dati');
    const dashboardSection = document.getElementById('dashboard-section');
    const heroIntro = document.getElementById('hero-intro');
    const navChat = document.getElementById('nav-chat');

    function openChatView({ focusInput = true, greet = true } = {}) {
        document.getElementById('dashboard-section').classList.add('hidden');
        heroIntro.classList.add('hidden');
        appContainer.classList.add('chat-active');
        chatHistory.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'auto' });

        navHome.classList.remove('active');
        navDati.classList.remove('active');
        navChat.classList.add('active');

        if (focusInput) {
            chatInput.focus();
        }

        if (greet && !botHasGreeted) {
            botHasGreeted = true;
            setTimeout(() => {
                appendMessage('bot', "Ciao! Sono Finn, il tuo assistente per tenere in ordine le spese quotidiane. Dimmi pure cosa hai segnato oggi.");
            }, 300);
        }
    }

    // Torna alla Home cliccando Home o il Logo
    const resetToHome = (e) => {
        e.preventDefault();
        appContainer.classList.remove('chat-active');
        
        // Return visibility to home elements
        document.getElementById('hero-intro').classList.remove('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        
        navHome.classList.add('active');
        document.getElementById('nav-chat').classList.remove('active');
        document.getElementById('nav-dati').classList.remove('active');

        if (!hasStartedChatting) {
            chatHistory.classList.add('hidden');
            document.body.classList.remove('chat-started');
        } else {
            document.body.classList.add('chat-started');
            chatHistory.classList.remove('hidden'); // Mostra cronologia chat nella home
        }

        requestAnimationFrame(() => {
            updateDashboard();
        });
        
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    navHome.addEventListener('click', resetToHome);
    document.getElementById('logo-link').addEventListener('click', resetToHome);

    navDati.addEventListener('click', (e) => {
        e.preventDefault();
        // Return to home interface if from chat
        if (appContainer.classList.contains('chat-active')) {
            resetToHome(e);
        }
        navHome.classList.remove('active');
        document.getElementById('nav-chat').classList.remove('active');
        navDati.classList.add('active');

        requestAnimationFrame(() => {
            updateDashboard();
        });
        
        // Scroll scorrevole alla dashboard sottostante
        dashboardSection.scrollIntoView({ behavior: 'smooth' });
    });

    navChat.addEventListener('click', (e) => {
        e.preventDefault();
        openChatView();
    });

    // Risposte rapide cliccabili
    const prompts = document.querySelectorAll('.prompt-box');
    prompts.forEach(prompt => {
        prompt.addEventListener('click', () => {
            chatInput.value = prompt.innerText.replace('→', '').trim();
            sendMessage();
        });
    });

    // 5. CANVAS 3D FISHEYE BACKGROUND
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    document.body.prepend(canvas);
    const bgCtx = canvas.getContext('2d');

    let mouse = { x: -1000, y: -1000 };
    let scroll = { x: 0, y: 0 };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });
    window.addEventListener('scroll', () => {
        scroll.x = window.scrollX;
        scroll.y = window.scrollY;
    });

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();

    function animateBg() {
        bgCtx.clearRect(0, 0, canvas.width, canvas.height);

        const spacing = 24;
        const effectRadius = 80; // smaller effect radius

        const parallaxX = mouse.x !== -1000 ? (mouse.x - canvas.width / 2) * 0.04 : 0;
        const parallaxY = mouse.y !== -1000 ? (mouse.y - canvas.height / 2) * 0.04 : 0;

        const offsetX = -((scroll.x + parallaxX) % spacing);
        const offsetY = -((scroll.y + parallaxY) % spacing);

        const cols = Math.ceil(canvas.width / spacing) + 2;
        const rows = Math.ceil(canvas.height / spacing) + 2;

        for (let i = -2; i <= cols + 2; i++) {
            for (let j = -2; j <= rows + 2; j++) {
                let cx = i * spacing + offsetX;
                let cy = j * spacing + offsetY;

                let dx = mouse.x - cx;
                let dy = mouse.y - cy;
                let distance = Math.sqrt(dx * dx + dy * dy);

                let drawX = cx;
                let drawY = cy;
                let drawRadius = 1.2;
                let dotColor = '#d1d5db';

                if (distance < effectRadius) {
                    let distRatio = distance / effectRadius;

                    let h = Math.pow(1 - distRatio, 1.4);
                    let pinchFactor = h * 0.35; // Evita di farli ammassare troppo

                    if (distance > 0.1) {
                        drawX = cx + dx * pinchFactor;
                        drawY = cy + dy * pinchFactor;
                    }

                    drawRadius = 1.2 + h * 0.2; // Nessun ingrandimento esagerato

                    // Colore blu (#007dff) fuso col grigio di base (#d1d5db) in base all'altezza (h)
                    let r = Math.round(209 + (0 - 209) * h);
                    let g = Math.round(213 + (125 - 213) * h);
                    let b = Math.round(219 + (255 - 219) * h);
                    dotColor = `rgb(${r}, ${g}, ${b})`;
                }

                bgCtx.beginPath();
                bgCtx.arc(drawX, drawY, drawRadius, 0, Math.PI * 2);
                bgCtx.fillStyle = dotColor;

                let alpha = 1;
                if (cy < 80) {
                    alpha = 0;
                } else if (cy < 180) {
                    alpha = (cy - 80) / 100; // Sfuma progressivamente da 80px a 180px
                }
                bgCtx.globalAlpha = alpha;

                bgCtx.fill();
            }
        }

        bgCtx.globalAlpha = 1; // Ripristina opacità base
        requestAnimationFrame(animateBg);
    }

    // --- LOCAL STORAGE DATABASE E DASHBOARD ---

    function loadData() {
        const rawExpenses = localStorage.getItem('finn_expenses') || localStorage.getItem('expenses');
        const rawCategories = localStorage.getItem('finn_categories') || localStorage.getItem('categories');
        const rawPayments = localStorage.getItem('finn_payments') || localStorage.getItem('future_payments');

        let categories = DEFAULT_CATEGORIES.map(category => ({ ...category }));
        try { if(rawCategories) categories = JSON.parse(rawCategories); } catch(e) {}

        let expenses = [];
        try { expenses = rawExpenses ? JSON.parse(rawExpenses) : []; } catch(e) { expenses = []; }
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

        let payments = [];
        try { payments = rawPayments ? JSON.parse(rawPayments) : []; } catch(e) {}
        if (!Array.isArray(payments)) payments = [];

        let shouldPersistPayments = false;
        payments = payments
            .map(payment => {
                const fallbackDueDate = Number.isFinite(Number(payment?.daysLeft))
                    ? formatToday(addDays(new Date(), Number(payment.daysLeft)))
                    : formatToday();
                const normalizedPayment = {
                    id: payment?.id || generateId('payment'),
                    name: (payment?.name || payment?.title || payment?.description || 'Pagamento').toString().trim(),
                    amount: normalizeAmount(payment?.amount),
                    dueDate: normalizeDate(payment?.dueDate || payment?.date, fallbackDueDate)
                };

                if (
                    !payment?.id ||
                    normalizedPayment.name !== payment?.name ||
                    normalizedPayment.amount !== payment?.amount ||
                    normalizedPayment.dueDate !== payment?.dueDate
                ) {
                    shouldPersistPayments = true;
                }

                return normalizedPayment;
            })
            .filter(payment => payment.name);

        if (shouldPersistPayments) {
            localStorage.setItem('finn_payments', JSON.stringify(payments));
        }

        return { expenses, categories, payments };
    }

    window.saveData = function (key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        if (typeof updateDashboard === 'function') updateDashboard();
    };

    window.loadData = loadData;

    window.getCategoriesForBot = function() {
        const { categories } = loadData();
        return categories.map(c => c.title).join(", ");
    };

    let barChartInstance = null;
    let pieChartInstance = null;
    let monthlyTrendChartInstance = null;

    function renderMonthlyTrendLegend() {
        const legend = document.getElementById('monthly-trend-legend');
        if (!legend) return;

        legend.innerHTML = `
            <span class="chart-legend-item">
                <span class="chart-legend-dot" aria-hidden="true"></span>
                <span>Totale mensile</span>
            </span>
            <span class="chart-legend-item">
                <span class="chart-legend-line" aria-hidden="true"></span>
                <span>Media</span>
            </span>
        `;
    }

    function updateDashboard() {
        const { expenses, categories, payments } = loadData();

        // 1. Categorie Pills
        const catListEl = document.getElementById('category-list');
        if (catListEl) {
            catListEl.innerHTML = '';
            categories.forEach(cat => {
                const pill = document.createElement('div');
                pill.className = 'cat-pill is-manageable';

                const main = document.createElement('div');
                main.className = 'cat-pill-main';

                const dot = document.createElement('div');
                dot.className = 'cat-color-dot';
                dot.style.backgroundColor = cat.color;

                const label = document.createElement('span');
                label.textContent = `${cat.emoji} ${cat.title}`;

                main.appendChild(dot);
                main.appendChild(label);
                pill.appendChild(main);

                const actions = document.createElement('div');
                actions.className = 'cat-pill-actions';

                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'cat-pill-action cat-pill-edit';
                editBtn.dataset.categoryEdit = cat.title;
                editBtn.setAttribute('aria-label', `Modifica categoria ${cat.title}`);
                editBtn.innerHTML = getEditIconMarkup();

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'cat-pill-action cat-pill-delete';
                deleteBtn.dataset.categoryDelete = cat.title;
                deleteBtn.setAttribute('aria-label', `Elimina categoria ${cat.title}`);
                deleteBtn.innerHTML = getTrashIconMarkup();

                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);
                pill.appendChild(actions);

                catListEl.appendChild(pill);
            });
        }

        // 2. Pagamenti Imminenti
        const payListEl = document.getElementById('payments-list');
        const payEmptyEl = document.getElementById('payments-empty-state');
        if (payListEl) {
            payListEl.innerHTML = '';
            const upcomingPayments = sortPaymentsByDate(payments).filter(payment => getDaysUntil(payment.dueDate) >= 0);

            if (!upcomingPayments.length) {
                payEmptyEl.classList.remove('hidden');
            } else {
                payEmptyEl.classList.add('hidden');
                upcomingPayments.slice(0, 6).forEach(pay => {
                    const daysUntil = getDaysUntil(pay.dueDate);
                    const amountLabel = pay.amount === null ? '' : ` • ${formatCurrency(pay.amount)}`;
                    const li = document.createElement('li');
                    li.className = 'payment-item';

                    const content = document.createElement('div');
                    content.className = 'payment-item-content';
                    content.textContent = `${pay.name}${amountLabel} • ${pay.dueDate} (${formatRelativeDays(daysUntil)})`;

                    const actions = document.createElement('div');
                    actions.className = 'payment-item-actions';
                    actions.appendChild(createPaymentDeleteButton(pay.id, `Elimina promemoria ${pay.name}`));

                    li.appendChild(content);
                    li.appendChild(actions);
                    payListEl.appendChild(li);
                });
            }
        }

        // 3. Tabella Spese Recenti
        const recentOperationsTable = document.getElementById('recent-operations-table');
        const tableBody = document.getElementById('table-body');
        const tableTotal = document.getElementById('table-total');
        const tableEmpty = document.getElementById('table-empty-state');
        
        if (tableBody) {
            tableBody.innerHTML = '';
            if (expenses.length === 0) {
                recentOperationsTable?.classList.add('hidden');
                tableEmpty?.classList.remove('hidden');
                if (tableTotal) tableTotal.innerText = '€ 0.00';
            } else {
                recentOperationsTable?.classList.remove('hidden');
                tableEmpty?.classList.add('hidden');
                let total = 0;
                const sorted = sortExpensesByDate(expenses).slice(0, 5);
                
                sorted.forEach(exp => {
                    const cat = categories.find(c => c.title === exp.category) || {emoji: "💰", title: exp.category};
                    const row = document.createElement('tr');

                    const categoryTd = document.createElement('td');
                    categoryTd.appendChild(createCategoryCellElement(cat, exp.description));

                    const dateTd = document.createElement('td');
                    dateTd.textContent = exp.date;

                    const amountTd = document.createElement('td');
                    amountTd.textContent = `€ ${parseFloat(exp.amount).toFixed(2)}`;

                    const actionTd = document.createElement('td');
                    actionTd.className = 'table-action-col';
                    const actions = document.createElement('div');
                    actions.className = 'table-row-actions';
                    actions.appendChild(createExpenseDescriptionButton(exp.id, `Aggiungi o modifica descrizione dell'operazione del ${exp.date}`));
                    actions.appendChild(createExpenseEditButton(exp.id, `Modifica operazione del ${exp.date}`));
                    actions.appendChild(createExpenseDeleteButton(exp.id, `Elimina operazione del ${exp.date}`));
                    actionTd.appendChild(actions);

                    row.appendChild(categoryTd);
                    row.appendChild(dateTd);
                    row.appendChild(amountTd);
                    row.appendChild(actionTd);
                    tableBody.appendChild(row);
                    total += parseFloat(exp.amount);
                });
                if (tableTotal) tableTotal.innerText = `€ ${total.toFixed(2)}`;
            }
        }

        // 4. Bar Chart (Mese Attuale)
        const barCanvas = document.getElementById('barChart');
        const barEmpty = document.getElementById('bar-empty-state');
        const barPlaceholder = document.getElementById('bar-chart-placeholder');
        if (barCanvas && typeof Chart !== 'undefined') {
            const ctx = barCanvas.getContext('2d');
            if (barChartInstance) barChartInstance.destroy();

            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const labels = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());
            const data = Array.from({ length: daysInMonth }, () => 0);
            const dailyCategoryBreakdown = new Map();

            let hasData = false;
            expenses.forEach(exp => {
                const [d, m, y] = normalizeDate(exp.date).split('/');
                if (parseInt(m) === now.getMonth() + 1 && parseInt(y) === now.getFullYear()) {
                    const dayIndex = parseInt(d) - 1;
                    data[dayIndex] += parseFloat(exp.amount);
                    const dayTotals = dailyCategoryBreakdown.get(dayIndex) || new Map();
                    dayTotals.set(exp.category, (dayTotals.get(exp.category) || 0) + parseFloat(exp.amount));
                    dailyCategoryBreakdown.set(dayIndex, dayTotals);
                    hasData = true;
                }
            });

            const yAxisMax = getRoundedChartMax(data);
            const yAxisStep = getChartStepSize(yAxisMax);

            if (!hasData) {
                barEmpty?.classList.remove('hidden');
                barPlaceholder?.classList.remove('hidden');
            } else {
                barEmpty?.classList.add('hidden');
                barPlaceholder?.classList.add('hidden');
                barChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels,
                        datasets: [{
                            label: 'Spesa (€)',
                            data,
                            backgroundColor: '#4b7bec',
                            borderRadius: {
                                topLeft: 4,
                                topRight: 4,
                                bottomLeft: 0,
                                bottomRight: 0
                            },
                            borderSkipped: false,
                            barPercentage: 0.88,
                            categoryPercentage: 0.94,
                            maxBarThickness: 22
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: yAxisMax,
                                ticks: {
                                    stepSize: yAxisStep,
                                    callback: (value) => `€ ${value}`
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    autoSkip: false,
                                    maxRotation: 0,
                                    minRotation: 0
                                }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (items) => `Giorno ${items[0].label}`,
                                    label: (context) => `Spesa: € ${Number(context.raw).toFixed(2)}`,
                                    afterLabel: (context) => {
                                        const dayTotals = dailyCategoryBreakdown.get(context.dataIndex);
                                        if (!dayTotals || !dayTotals.size) return [];

                                        return [...dayTotals.entries()]
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([category, total]) => `${category}: € ${total.toFixed(2)}`);
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        // 5. Pie Chart (Categorie)
        const pieCanvas = document.getElementById('pieChart');
        const pieEmpty = document.getElementById('pie-empty-state');
        const piePlaceholder = document.getElementById('pie-chart-placeholder');
        if (pieCanvas && typeof Chart !== 'undefined') {
            const ctx = pieCanvas.getContext('2d');
            if (pieChartInstance) pieChartInstance.destroy();

            const totals = {};
            expenses.forEach(exp => {
                totals[exp.category] = (totals[exp.category] || 0) + parseFloat(exp.amount);
            });

            const labels = Object.keys(totals);
            if (labels.length === 0) {
                pieEmpty?.classList.remove('hidden');
                piePlaceholder?.classList.remove('hidden');
            } else {
                pieEmpty?.classList.add('hidden');
                piePlaceholder?.classList.add('hidden');
                const dataset = labels.map(l => totals[l]);
                const colors = labels.map(l => categories.find(c => c.title === l)?.color || '#cbd5e1');

                pieChartInstance = new Chart(ctx, {
                    type: 'pie',
                    data: {
                        labels,
                        datasets: [{ data: dataset, backgroundColor: colors, borderWidth: 0 }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { 
                            legend: { position: 'bottom' },
                            tooltip: { callbacks: { label: (i) => ` € ${i.raw.toFixed(2)}` } }
                        }
                    }
                });
            }
        }

        // 6. Trend Mensile
        const monthlyTrendCanvas = document.getElementById('monthlyTrendChart');
        const monthlyTrendEmpty = document.getElementById('monthly-trend-empty-state');
        const monthlyTrendPlaceholder = document.getElementById('monthly-trend-placeholder');
        renderMonthlyTrendLegend();
        if (monthlyTrendCanvas && typeof Chart !== 'undefined') {
            const ctx = monthlyTrendCanvas.getContext('2d');
            if (monthlyTrendChartInstance) monthlyTrendChartInstance.destroy();

            const monthTotalsMap = new Map();
            expenses.forEach(expense => {
                const monthValue = getMonthValue(expense.date);
                monthTotalsMap.set(monthValue, (monthTotalsMap.get(monthValue) || 0) + expense.amount);
            });

            const monthEntries = [...monthTotalsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

            if (!monthEntries.length) {
                monthlyTrendEmpty?.classList.remove('hidden');
                monthlyTrendPlaceholder?.classList.add('hidden');
            } else {
                monthlyTrendEmpty?.classList.add('hidden');
                monthlyTrendPlaceholder?.classList.add('hidden');

                const labels = monthEntries.map(([monthValue]) => formatMonthLabel(monthValue));
                const totals = monthEntries.map(([, total]) => Number(total.toFixed(2)));
                const average = totals.reduce((sum, total) => sum + total, 0) / totals.length;
                const averageSeries = totals.map(() => Number(average.toFixed(2)));
                const yAxisMax = getRoundedChartMax([...totals, average]);
                const yAxisStep = getChartStepSize(yAxisMax);

                monthlyTrendChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels,
                        datasets: [
                            {
                                label: 'Totale mensile',
                                data: totals,
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.16)',
                                pointBackgroundColor: '#2563eb',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                pointHoverRadius: 6,
                                tension: 0.3,
                                fill: false
                            },
                            {
                                label: 'Media',
                                data: averageSeries,
                                borderColor: 'rgba(15, 23, 42, 0.55)',
                                borderDash: [8, 6],
                                pointRadius: 0,
                                tension: 0,
                                fill: false
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: yAxisMax,
                                ticks: {
                                    stepSize: yAxisStep,
                                    callback: (value) => `€ ${value}`
                                }
                            },
                            x: {
                                grid: { display: false }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: (context) => `${context.dataset.label}: € ${Number(context.raw).toFixed(2)}`
                                }
                            }
                        }
                    }
                });
            }
        }
    }

    // Emoji Picker Logic
    const categoryForm = document.getElementById('category-form');
    const catTitleInput = document.getElementById('cat-title');
    const catColorInput = document.getElementById('cat-color');

    function splitGraphemes(value) {
        if (window.Intl && typeof Intl.Segmenter === 'function') {
            return Array.from(
                new Intl.Segmenter('it', { granularity: 'grapheme' }).segment(value),
                ({ segment }) => segment
            );
        }

        return Array.from(value);
    }

    function isEmojiGrapheme(segment) {
        return /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u.test(segment);
    }

    function extractSingleEmoji(value) {
        const trimmed = value.trim();
        if (!trimmed) return '';
        return splitGraphemes(trimmed).find(isEmojiGrapheme) || '';
    }

    function setSelectedEmojiInWrapper(wrapper, value) {
        if (!wrapper) return;
        const selectedEmoji = extractSingleEmoji(value) || '🍽️';
        const toggleButton = wrapper.querySelector('.emoji-toggle-btn');
        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        const nativeInput = wrapper.querySelector('.emoji-native-input');

        if (toggleButton) {
            toggleButton.innerText = selectedEmoji;
        }
        if (hiddenInput) {
            hiddenInput.value = selectedEmoji;
        }
        if (nativeInput) {
            nativeInput.value = selectedEmoji;
        }
    }

    function closeAllEmojiPopovers(exceptWrapper = null) {
        document.querySelectorAll('.emoji-picker-wrapper').forEach(wrapper => {
            if (wrapper !== exceptWrapper) {
                wrapper.querySelector('.emoji-popover')?.classList.add('hidden');
            }
        });
    }

    function setupEmojiPicker(wrapper) {
        if (!wrapper) return;
        const toggleButton = wrapper.querySelector('.emoji-toggle-btn');
        const popover = wrapper.querySelector('.emoji-popover');
        const nativeInput = wrapper.querySelector('.emoji-native-input');

        if (!toggleButton || !popover) return;

        toggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const nextIsHidden = !popover.classList.contains('hidden');
            closeAllEmojiPopovers(nextIsHidden ? null : wrapper);
            popover.classList.toggle('hidden');
            if (!popover.classList.contains('hidden') && nativeInput) {
                nativeInput.focus();
                nativeInput.select();
            }
        });

        const emojis = popover.querySelectorAll('.emoji-grid span');
        emojis.forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                setSelectedEmojiInWrapper(wrapper, span.innerText);
                popover.classList.add('hidden');
            });
        });

        if (nativeInput) {
            const hiddenInput = wrapper.querySelector('input[type="hidden"]');
            nativeInput.value = hiddenInput?.value || '🍽️';

            nativeInput.addEventListener('input', () => {
                const selectedEmoji = extractSingleEmoji(nativeInput.value);
                if (selectedEmoji) {
                    setSelectedEmojiInWrapper(wrapper, selectedEmoji);
                } else {
                    nativeInput.value = hiddenInput?.value || '🍽️';
                }
            });

            nativeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    popover.classList.add('hidden');
                }
            });
        }
    }

    document.querySelectorAll('.emoji-picker-wrapper').forEach(setupEmojiPicker);

    document.addEventListener('click', (e) => {
        const openWrapper = e.target.closest('.emoji-picker-wrapper');
        closeAllEmojiPopovers(openWrapper);
    });

    function resetCategoryForm() {
        if (!categoryForm) return;
        catTitleInput.value = '';
        catColorInput.value = '#007dff';
        setSelectedEmojiInWrapper(categoryForm.querySelector('.emoji-picker-wrapper'), '🍽️');
    }

    function openCategoryEditModal(categoryTitle) {
        const { categories } = loadData();
        const category = categories.find(item => normalizeText(item.title) === normalizeText(categoryTitle));
        if (!category || !categoryEditModal || !categoryEditForm) return;

        editingCategoryTitle = category.title;
        categoryEditNameInput.value = category.title;
        categoryEditColorInput.value = category.color;
        setSelectedEmojiInWrapper(categoryEditForm.querySelector('.emoji-picker-wrapper'), category.emoji);
        categoryEditModal.classList.remove('hidden');
        categoryEditModal.setAttribute('aria-hidden', 'false');
        categoryEditNameInput.focus();
        categoryEditNameInput.select();
    }

    function closeCategoryEditModal() {
        if (!categoryEditModal) return;
        categoryEditModal.classList.add('hidden');
        categoryEditModal.setAttribute('aria-hidden', 'true');
        closeAllEmojiPopovers();
        editingCategoryTitle = null;
    }

    function formatDateForInput(dateValue) {
        const [day, month, year] = normalizeDate(dateValue).split('/');
        return `${year}-${month}-${day}`;
    }

    function populateExpenseCategoryOptions(selectedCategory = '') {
        if (!expenseEditCategoryInput) return;
        const { categories } = loadData();
        expenseEditCategoryInput.innerHTML = '';

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.title;
            option.textContent = `${category.emoji} ${category.title}`;
            if (category.title === selectedCategory) {
                option.selected = true;
            }
            expenseEditCategoryInput.appendChild(option);
        });
    }

    function openExpenseDescriptionModal(expenseId) {
        const expense = findExpenseById(expenseId);
        if (!expense || !expenseDescriptionModal || !expenseDescriptionInput) return;
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

    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', closeConfirmModal);
    }

    if (confirmAcceptBtn) {
        confirmAcceptBtn.addEventListener('click', () => {
            const action = pendingConfirmAction;
            closeConfirmModal();
            action?.();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && confirmModal && !confirmModal.classList.contains('hidden')) {
            closeConfirmModal();
        }
        if (e.key === 'Escape' && categoryEditModal && !categoryEditModal.classList.contains('hidden')) {
            closeCategoryEditModal();
        }
        if (e.key === 'Escape' && expenseDescriptionModal && !expenseDescriptionModal.classList.contains('hidden')) {
            closeExpenseDescriptionModal();
        }
        if (e.key === 'Escape' && expenseEditModal && !expenseEditModal.classList.contains('hidden')) {
            closeExpenseEditModal();
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-confirm-close]')) {
            closeConfirmModal();
            return;
        }

        if (e.target.closest('[data-category-edit-close]')) {
            closeCategoryEditModal();
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

        const expenseDeleteBtn = e.target.closest('[data-expense-delete]');
        if (expenseDeleteBtn) {
            const expenseId = expenseDeleteBtn.dataset.expenseDelete;
            openConfirmModal({
                title: 'Eliminare questa operazione?',
                message: 'Questa operazione verrà rimossa definitivamente. Non potrà essere ripristinata.',
                confirmLabel: 'Elimina operazione',
                onConfirm: () => deleteExpenseById(expenseId)
            });
            return;
        }

        const paymentDeleteBtn = e.target.closest('[data-payment-delete]');
        if (paymentDeleteBtn) {
            const paymentId = paymentDeleteBtn.dataset.paymentDelete;
            openConfirmModal({
                title: 'Eliminare questo pagamento imminente?',
                message: 'Il promemoria verrà rimosso definitivamente anche dalla memoria del bot e non potrà essere ripristinato.',
                confirmLabel: 'Elimina promemoria',
                onConfirm: () => deletePaymentById(paymentId)
            });
            return;
        }

        const expenseDescriptionBtn = e.target.closest('[data-expense-description]');
        if (expenseDescriptionBtn) {
            openExpenseDescriptionModal(expenseDescriptionBtn.dataset.expenseDescription);
            return;
        }

        const expenseEditBtn = e.target.closest('[data-expense-edit]');
        if (expenseEditBtn) {
            openExpenseEditModal(expenseEditBtn.dataset.expenseEdit);
            return;
        }

        const categoryEditBtn = e.target.closest('[data-category-edit]');
        if (categoryEditBtn) {
            openCategoryEditModal(categoryEditBtn.dataset.categoryEdit);
            return;
        }

        const categoryDeleteBtn = e.target.closest('[data-category-delete]');
        if (categoryDeleteBtn) {
            const categoryTitle = categoryDeleteBtn.dataset.categoryDelete;
            openConfirmModal({
                title: `Eliminare la categoria "${categoryTitle}"?`,
                message: 'La categoria verrà eliminata in modo definitivo e non potrà essere ripristinata.',
                confirmLabel: 'Elimina categoria',
                onConfirm: () => deleteCategoryByTitle(categoryTitle)
            });
        }
    });

    if (categoryForm) {
        categoryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = catTitleInput.value.trim();
            const color = catColorInput.value;
            const emoji = document.getElementById('cat-emoji').value.trim();

            if (title && emoji) {
                const { categories } = loadData();
                if (!categories.find(c => normalizeText(c.title) === normalizeText(title))) {
                    categories.push({ title, color, emoji });
                    window.saveData('finn_categories', categories);
                    resetCategoryForm();
                } else {
                    window.alert('Esiste gia una categoria con questo nome.');
                }
            }
        });
    }

    if (categoryEditCancelBtn) {
        categoryEditCancelBtn.addEventListener('click', closeCategoryEditModal);
    }

    if (expenseDescriptionCancelBtn) {
        expenseDescriptionCancelBtn.addEventListener('click', closeExpenseDescriptionModal);
    }

    if (expenseEditCancelBtn) {
        expenseEditCancelBtn.addEventListener('click', closeExpenseEditModal);
    }

    if (categoryEditForm) {
        categoryEditForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const title = categoryEditNameInput.value.trim();
            const color = categoryEditColorInput.value;
            const emoji = categoryEditEmojiInput.value.trim();

            if (!editingCategoryTitle || !title || !emoji) return;

            const result = updateCategoryByTitle(editingCategoryTitle, { title, color, emoji });
            if (!result.ok) {
                window.alert('Esiste gia una categoria con questo nome.');
                return;
            }

            closeCategoryEditModal();
        });
    }

    if (expenseDescriptionForm) {
        expenseDescriptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!describingExpenseId) return;

            updateExpenseById(describingExpenseId, {
                description: expenseDescriptionInput.value
            });
            closeExpenseDescriptionModal();
        });
    }

    if (expenseEditForm) {
        expenseEditForm.addEventListener('submit', (e) => {
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
        });
    }

    window.addEventListener('load', () => {
        updateDashboard();

        if (window.location.hash === '#chat') {
            openChatView({ focusInput: false, greet: true });
        }
    });

    animateBg();
});
