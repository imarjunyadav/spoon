/**
 * Spoon - Wallet Page Script
 * 
 * Handles logic for the dedicated Wallet page.
 * - Fetches and displays current balance.
 * - Fetches transaction history with pagination.
 * - Supports filtering (All, Credit, Debit).
 * - Handles pull-to-refresh (Refresh button).
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Authentication Check ---
    if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
        window.location.replace('login.html');
        return;
    }

    // --- State ---
    let state = {
        balance: 0,
        transactions: [],
        filter: 'all', // 'all', 'credit', 'debit'
        page: 1,
        limit: 20,
        isLoading: false,
        hasMore: true
    };

    // --- DOM Elements ---
    const balanceAmountEl = document.getElementById('wallet-balance-amount');
    const transactionsListEl = document.getElementById('transactions-list');
    const refreshBtn = document.getElementById('refresh-btn');
    const filterChips = document.querySelectorAll('.filter-chip');
    const loadMoreSentinel = document.getElementById('load-more-sentinel');

    // --- Helper Functions ---

    function getUserEmail() {
        const user = JSON.parse(localStorage.getItem('spoon-user'));
        return user ? (user.email || localStorage.getItem('spoon-user-email')) : null;
    }

    function getSessionToken() {
        return localStorage.getItem('spoon-session-token');
    }

    /**
     * Format date to friendly string (e.g., "12 Feb, 2:30 PM")
     */
    function formatTransactionDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });
    }

    // --- Core Functions ---

    /**
     * Fetch wallet balance.
     */
    async function fetchBalance() {
        const email = getUserEmail();
        if (!email) return;

        try {
            const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/wallet/balance?email=${encodeURIComponent(email)}`, {
                headers: {
                    'x-user-email': email,
                    'x-session-token': getSessionToken()
                }
            });
            const data = await res.json();

            if (data.success) {
                state.balance = data.balance;
                balanceAmountEl.textContent = state.balance;
            } else {
                balanceAmountEl.textContent = '--';
                console.error('Failed to fetch balance:', data.error);
            }
        } catch (err) {
            console.error('Error fetching balance:', err);
            balanceAmountEl.textContent = '--';
        }
    }

    /**
     * Fetch transactions based on current filter and page.
     * @param {boolean} reset - If true, clears existing list and resets pagination.
     */
    async function fetchTransactions(reset = false) {
        if (state.isLoading || (!state.hasMore && !reset)) return;

        state.isLoading = true;
        const email = getUserEmail();

        if (reset) {
            state.page = 1;
            state.hasMore = true;
            state.transactions = [];
            transactionsListEl.innerHTML = `
                <div class="transaction-loading">
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                    <div class="skeleton-item"></div>
                </div>
            `;
        }

        try {
            const queryParams = new URLSearchParams({
                email: email,
                limit: state.limit,
                offset: (state.page - 1) * state.limit
            });

            // Note: If backend supports filtering by type, add it here.
            // Currently backend returns all, so we filter client-side or assume backend improvement needed.
            // For this refactor, we'll fetch all and filter client-side for simplicity unless backend changes.
            // However, efficient pagination requires backend filtering.
            // Let's check backend capabilities later. For now, we fetch distinct pages.

            const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/wallet/transactions?${queryParams}`, {
                headers: {
                    'x-user-email': email,
                    'x-session-token': getSessionToken()
                }
            });
            const data = await res.json();

            if (data.success) {
                const newTransactions = data.transactions;

                if (newTransactions.length < state.limit) {
                    state.hasMore = false;
                }

                if (reset) {
                    state.transactions = newTransactions;
                    transactionsListEl.innerHTML = ''; // Clear skeleton
                } else {
                    state.transactions = [...state.transactions, ...newTransactions];
                }

                renderTransactions();
                state.page++;
            } else {
                console.error('Failed to fetch transactions:', data.error);
                if (reset) transactionsListEl.innerHTML = '<div class="no-transactions">Failed to load transactions</div>';
            }

        } catch (err) {
            console.error('Error fetching transactions:', err);
            if (reset) transactionsListEl.innerHTML = '<div class="no-transactions">Network error</div>';
        } finally {
            state.isLoading = false;
        }
    }

    /**
     * Render the filtered list of transactions.
     */
    function renderTransactions() {
        // Filter client-side for now
        let filtered = state.transactions;
        if (state.filter === 'credit') {
            filtered = filtered.filter(tx => tx.type === 'CREDIT');
        } else if (state.filter === 'debit') {
            filtered = filtered.filter(tx => tx.type === 'DEBIT');
        }

        if (filtered.length === 0) {
            if (state.isLoading) return; // Keep skeleton or empty
            transactionsListEl.innerHTML = '<div class="no-transactions">No transactions found</div>';
            return;
        }

        const html = filtered.map(tx => {
            const isCredit = tx.type === 'CREDIT';
            const iconClass = isCredit ? 'credit' : 'debit';
            // Icons: Down arrow for money in (credit), Up arrow for money out (debit)
            const icon = isCredit ? 'fa-arrow-down' : 'fa-arrow-up';
            const amountClass = isCredit ? 'credit' : 'debit';
            const sign = isCredit ? '+' : '-';

            // Format description
            let desc = tx.description || tx.reason;
            if (tx.reason === 'REFUND') desc = `Refund for Order #${safeSubstring(tx.reference_order_id, 8)}`;
            if (tx.reason === 'PAYMENT') desc = `Payment for Order #${safeSubstring(tx.reference_order_id, 8)}`;

            return `
                <div class="transaction-item">
                    <div class="transaction-icon ${iconClass}">
                        <i class="fa-solid ${icon}"></i>
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-desc">${escapeHtml(desc)}</div>
                        <div class="transaction-meta">
                            <span class="transaction-date">${formatTransactionDate(tx.created_at)}</span>
                            ${tx.reference_order_id ? `<span class="transaction-ref">#${safeSubstring(tx.reference_order_id, 8)}</span>` : ''}
                        </div>
                    </div>
                    <div class="transaction-amount ${amountClass}">
                        ${sign}₹${tx.amount}
                    </div>
                </div>
            `;
        }).join('');

        transactionsListEl.innerHTML = html;
    }

    function safeSubstring(str, len) {
        return str ? str.substring(0, len) : '...';
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Event Listeners ---

    // Filter Chips
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Update active state
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            // Update filter state
            state.filter = chip.dataset.filter;

            // Re-render (using existing data)
            renderTransactions();
        });
    });

    // Refresh Button
    refreshBtn.addEventListener('click', () => {
        // Add spin animation
        const icon = refreshBtn.querySelector('i');
        icon.classList.add('fa-spin');

        Promise.all([fetchBalance(), fetchTransactions(true)])
            .finally(() => {
                setTimeout(() => icon.classList.remove('fa-spin'), 500);
            });
    });

    // Infinite Scroll (Intersection Observer)
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !state.isLoading && state.hasMore) {
            fetchTransactions(false);
        }
    }, { threshold: 0.1 });

    if (loadMoreSentinel) {
        observer.observe(loadMoreSentinel);
    }

    // --- Initialization ---

    function init() {
        // Wait for config
        if (window.waitForConfig) {
            window.waitForConfig().then(() => {
                fetchBalance();
                fetchTransactions(true);
            });
        } else {
            // Fallback
            fetchBalance();
            fetchTransactions(true);
        }
    }

    init();
});
