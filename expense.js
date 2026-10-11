// expense.js - 費用申請（預支／報銷）
//
// 員工在「費用」分頁送出申請、看自己的紀錄；管理員在管理員分頁審核。
// 後端見 GS/Expense.gs。報銷的發票走附件系統，記錄鍵是 expense:申請ID。

let expenseFormBound = false;

const EXPENSE_STATUS_STYLE = {
    PENDING: { key: 'EXPENSE_STATUS_PENDING', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
    APPROVED: { key: 'EXPENSE_STATUS_APPROVED', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
    REJECTED: { key: 'EXPENSE_STATUS_REJECTED', cls: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' }
};

function expenseTypeLabel(type) {
    return type === 'advance' ? t('EXPENSE_TYPE_ADVANCE') : t('EXPENSE_TYPE_REIMBURSEMENT');
}

function formatExpenseAmount(amount) {
    return '$' + (Number(amount) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// 後端回的 code 有翻譯就用翻譯，沒有才顯示後端的中文訊息
function expenseErrorText(res, fallbackKey) {
    if (res && res.code) {
        const text = t(res.code);
        if (text !== res.code) return text;
    }
    return (res && res.msg) || t(fallbackKey);
}

// ==================== 員工：費用分頁 ====================

async function initExpenseTab() {
    if (!expenseFormBound) {
        expenseFormBound = true;

        const dateInput = document.getElementById('expense-date');
        if (dateInput && !dateInput.value) {
            const now = new Date();
            dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }

        document.getElementById('expense-type')?.addEventListener('change', updateExpenseFormFields);
        document.getElementById('submit-expense-btn')?.addEventListener('click', handleExpenseSubmit);

        const receipt = document.getElementById('expense-receipt');
        if (receipt && typeof ATTACHMENT_ACCEPT !== 'undefined') receipt.accept = ATTACHMENT_ACCEPT;
    }

    updateExpenseFormFields();
    await loadMyExpenses();
}

// 發票號碼與發票照片只有報銷才需要
function updateExpenseFormFields() {
    const isReimbursement = document.getElementById('expense-type')?.value === 'reimbursement';
    document.querySelectorAll('.expense-reimbursement-only').forEach(el => {
        el.style.display = isReimbursement ? '' : 'none';
    });
}

async function handleExpenseSubmit() {
    const button = document.getElementById('submit-expense-btn');
    const type = document.getElementById('expense-type')?.value || 'advance';
    const date = document.getElementById('expense-date')?.value || '';
    const amount = Number(document.getElementById('expense-amount')?.value);
    const reason = (document.getElementById('expense-reason')?.value || '').trim();
    const invoiceNumber = (document.getElementById('expense-invoice')?.value || '').trim();
    const note = (document.getElementById('expense-note')?.value || '').trim();
    const receiptInput = document.getElementById('expense-receipt');
    const receipt = type === 'reimbursement' && receiptInput?.files ? receiptInput.files[0] : null;

    if (!date) {
        showNotification(t('EXPENSE_DATE_REQUIRED'), 'error');
        return;
    }
    if (!isFinite(amount) || amount <= 0) {
        showNotification(t('EXPENSE_INVALID_AMOUNT'), 'error');
        return;
    }
    if (!reason) {
        showNotification(t('EXPENSE_REASON_REQUIRED'), 'error');
        return;
    }
    // 先擋掉過大的檔案，免得申請送出了發票卻傳不上去
    if (receipt && typeof ATTACHMENT_MAX_MB !== 'undefined' && receipt.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
        showNotification(t('ATTACHMENT_TOO_LARGE', { max: ATTACHMENT_MAX_MB }), 'error');
        return;
    }

    generalButtonState(button, 'processing', t('LOADING'));

    try {
        const res = await callApifetch(
            `submitExpense&type=${encodeURIComponent(type)}` +
            `&date=${encodeURIComponent(date)}` +
            `&amount=${encodeURIComponent(amount)}` +
            `&reason=${encodeURIComponent(reason)}` +
            `&invoiceNumber=${encodeURIComponent(type === 'reimbursement' ? invoiceNumber : '')}` +
            `&note=${encodeURIComponent(note)}`
        );

        if (!res.ok) {
            showNotification(expenseErrorText(res, 'EXPENSE_SUBMIT_FAILED'), 'error');
            return;
        }

        let receiptFailed = false;
        if (receipt && typeof uploadAttachmentFile === 'function') {
            try {
                const upload = await uploadAttachmentFile('expense', buildAttachmentKey('expense', { id: res.id }), receipt);
                receiptFailed = !upload.ok;
            } catch (error) {
                console.error('上傳發票失敗:', error);
                receiptFailed = true;
            }
        }

        showNotification(
            receiptFailed ? t('EXPENSE_RECEIPT_UPLOAD_FAILED') : t('EXPENSE_SUBMITTED'),
            receiptFailed ? 'warning' : 'success'
        );

        ['expense-amount', 'expense-reason', 'expense-invoice', 'expense-note'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        if (receiptInput) receiptInput.value = '';

        await loadMyExpenses();
    } catch (error) {
        console.error('送出費用申請失敗:', error);
        showNotification(t('EXPENSE_SUBMIT_FAILED'), 'error');
    } finally {
        generalButtonState(button, 'idle');
    }
}

async function loadMyExpenses() {
    const list = document.getElementById('expense-records-list');
    const empty = document.getElementById('expense-records-empty');
    if (!list) return;

    list.innerHTML = `<li class="text-center text-gray-500 dark:text-gray-400 py-4">${escapeHtml(t('LOADING'))}</li>`;
    if (empty) empty.style.display = 'none';

    try {
        const res = await callApifetch('getMyExpenses');
        if (!res.ok) {
            list.innerHTML = `<li class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(expenseErrorText(res, 'EXPENSE_LOAD_FAILED'))}</li>`;
            return;
        }

        const records = res.records || [];
        list.innerHTML = '';
        if (records.length === 0) {
            if (empty) empty.style.display = 'block';
            return;
        }

        await renderExpenseList(list, records, { review: false });
    } catch (error) {
        console.error('載入費用申請失敗:', error);
        list.innerHTML = `<li class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(t('EXPENSE_LOAD_FAILED'))}</li>`;
    }
}

// ==================== 管理員：待審核 ====================

async function loadPendingExpenses() {
    if (typeof loadAdminPendingCounts === 'function') loadAdminPendingCounts();  // 管理員頁「審核」的數字跟著更新
    const list = document.getElementById('pending-expense-list');
    const empty = document.getElementById('expense-pending-empty');
    if (!list) return;

    list.innerHTML = `<li class="text-center text-gray-500 dark:text-gray-400 py-4">${escapeHtml(t('LOADING'))}</li>`;
    if (empty) empty.style.display = 'none';

    try {
        const res = await callApifetch('getPendingExpenses', null);
        if (!res.ok) {
            list.innerHTML = `<li class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(expenseErrorText(res, 'EXPENSE_LOAD_FAILED'))}</li>`;
            return;
        }

        const records = res.records || [];
        list.innerHTML = '';
        if (records.length === 0) {
            if (empty) empty.style.display = 'block';
            return;
        }

        await renderExpenseList(list, records, { review: true });
    } catch (error) {
        console.error('載入待審核費用申請失敗:', error);
        list.innerHTML = `<li class="text-center text-red-600 dark:text-red-400 py-4">${escapeHtml(t('EXPENSE_LOAD_FAILED'))}</li>`;
    }
}

async function handleExpenseReview(button, id, reviewAction) {
    let comment = '';
    if (reviewAction === 'reject') {
        const input = prompt(t('EXPENSE_REJECT_PROMPT'));
        if (input === null) return;  // 按取消就不駁回
        comment = input;
    }

    const item = button.closest('li');
    const buttons = item ? item.querySelectorAll('button.expense-review-btn') : [button];
    buttons.forEach(btn => { btn.disabled = true; });

    try {
        const res = await callApifetch(
            `reviewExpense&id=${encodeURIComponent(id)}` +
            `&reviewAction=${encodeURIComponent(reviewAction)}` +
            `&comment=${encodeURIComponent(comment)}`, null);

        if (!res.ok) {
            showNotification(expenseErrorText(res, 'EXPENSE_REVIEW_FAILED'), 'error');
            buttons.forEach(btn => { btn.disabled = false; });
            return;
        }

        showNotification(t(reviewAction === 'approve' ? 'EXPENSE_APPROVED_MSG' : 'EXPENSE_REJECTED_MSG'), 'success');

        if (item) item.remove();
        const list = document.getElementById('pending-expense-list');
        const empty = document.getElementById('expense-pending-empty');
        if (list && list.children.length === 0 && empty) empty.style.display = 'block';
    } catch (error) {
        console.error('審核費用申請失敗:', error);
        showNotification(t('EXPENSE_REVIEW_FAILED'), 'error');
        buttons.forEach(btn => { btn.disabled = false; });
    }
}

// ==================== 共用清單 ====================

/**
 * @param {HTMLElement} list
 * @param {Array} records
 * @param {{review: boolean}} options review=true 時顯示申請人與審核按鈕（管理員用）
 */
async function renderExpenseList(list, records, options) {
    const review = options && options.review;

    // 報銷的發票一次抓完，不要每筆各打一次 API
    const reimbursements = records.filter(r => r.type === 'reimbursement');
    if (reimbursements.length > 0 && typeof prefetchAttachments === 'function') {
        await prefetchAttachments('expense', reimbursements.map(r => buildAttachmentKey('expense', r)));
    }

    records.forEach(record => {
        const li = document.createElement('li');
        li.className = 'p-4 bg-gray-50 dark:bg-gray-700 rounded-lg';

        const style = EXPENSE_STATUS_STYLE[record.status] || { key: record.status, cls: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' };
        const heading = review
            ? `${escapeHtml(record.employeeName)} · ${escapeHtml(expenseTypeLabel(record.type))}`
            : escapeHtml(expenseTypeLabel(record.type));

        li.innerHTML = `
            <div class="flex justify-between items-start gap-2 mb-1">
                <div>
                    <p class="font-semibold text-gray-800 dark:text-white">${heading}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(record.date)}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg text-gray-800 dark:text-white">${escapeHtml(formatExpenseAmount(record.amount))}</p>
                    ${review ? '' : `<span class="px-2 py-1 text-xs font-semibold rounded ${style.cls}">${escapeHtml(t(style.key))}</span>`}
                </div>
            </div>
            <p class="text-sm text-gray-700 dark:text-gray-300 break-words">${escapeHtml(record.reason)}</p>
            ${record.invoiceNumber ? `<p class="text-sm text-gray-600 dark:text-gray-400">${escapeHtml(t('EXPENSE_INVOICE_NUMBER', { number: record.invoiceNumber }))}</p>` : ''}
            ${record.note ? `<p class="text-sm text-gray-500 dark:text-gray-400 break-words">${escapeHtml(record.note)}</p>` : ''}
            ${record.reviewComment ? `<p class="text-sm text-gray-500 dark:text-gray-400 italic mt-1">${escapeHtml(t('EXPENSE_REVIEW_COMMENT', { comment: record.reviewComment }))}</p>` : ''}
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">${escapeHtml(t('EXPENSE_APPLIED_AT', { time: record.createdAt }))}</p>
        `;

        if (record.type === 'reimbursement' && typeof renderAttachments === 'function') {
            const box = document.createElement('div');
            box.className = 'mt-2';
            li.appendChild(box);
            renderAttachments(box, 'expense', buildAttachmentKey('expense', record), {
                canUpload: !review && record.status === 'PENDING'
            });
        }

        if (review) {
            const actions = document.createElement('div');
            actions.className = 'flex space-x-2 mt-3';
            [['approve', 'ADMIN_APPROVE_BUTTON', 'btn-primary'], ['reject', 'ADMIN_REJECT_BUTTON', 'btn-warning']]
                .forEach(([action, key, cls]) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = `expense-review-btn flex-1 px-3 py-2 rounded-md text-sm font-bold ${cls}`;
                    btn.textContent = t(key);
                    btn.addEventListener('click', () => handleExpenseReview(btn, record.id, action));
                    actions.appendChild(btn);
                });
            li.appendChild(actions);
        }

        list.appendChild(li);
    });
}
