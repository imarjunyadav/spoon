/**
 * SPOON ADMIN V2 - DASHBOARD LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // GLOBALS & STATE
    // ---------------------------------------------------------
    const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    let ordersList = [];
    let systemSettings = {
        max_prepared_slots: 10,
        no_show_timeout_minutes: 10
    };
    
    // Auth Token for our API
    const token = localStorage.getItem('spoon_admin_token') || sessionStorage.getItem('spoon_admin_token');
    if (!token) {
        window.location.href = '/admin/login.html';
        return;
    }

    // ---------------------------------------------------------
    // DOM ELEMENTS
    // ---------------------------------------------------------
    const dom = {
        pendingList: document.getElementById('pending-list'),
        preparedList: document.getElementById('prepared-list'),
        queueList: document.getElementById('queue-overflow-list'),
        btnQueue: document.getElementById('btn-queue'),
        modalContainer: document.getElementById('modal-container'),
        modalSettings: document.getElementById('modal-settings'),
        modalQueue: document.getElementById('modal-queue'),
        inputMaxSlots: document.getElementById('setting-max-slots'),
        inputTimeout: document.getElementById('setting-timeout'),
        indicator: document.getElementById('live-indicator')
    };

    // ---------------------------------------------------------
    // UTILITIES
    // ---------------------------------------------------------
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        if(!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerText = msg;
        container.appendChild(toast);
        // fade in
        setTimeout(() => toast.style.opacity = 1, 10);
        // remove
        setTimeout(() => {
            toast.style.opacity = 0;
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
        const diffInMinutes = Math.floor(diffInSeconds / 60);

        if (diffInMinutes < 1) return 'just now';
        return `${diffInMinutes}m`;
    }

    // ---------------------------------------------------------
    // API CALLS
    // ---------------------------------------------------------
    async function fetchOrders() {
        try {
            const res = await fetch(`${config.apiUrl}/orders/admin`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                ordersList = json.orders;
                render();
            } else if (res.status === 401 || res.status === 403) {
                window.location.href = '/admin/login.html';
            }
        } catch (err) {
            console.error('Failed to load orders', err);
        }
    }

    async function fetchSettings() {
        try {
            const res = await fetch(`${config.apiUrl}/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success && json.settings) {
                let changed = false;
                json.settings.forEach(s => {
                    if (s.key === 'max_prepared_slots' && systemSettings.max_prepared_slots !== Number(s.value)) { systemSettings.max_prepared_slots = Number(s.value); changed = true; }
                    if (s.key === 'no_show_timeout_minutes' && systemSettings.no_show_timeout_minutes !== Number(s.value)) { systemSettings.no_show_timeout_minutes = Number(s.value); changed = true; }
                });
                dom.inputMaxSlots.value = systemSettings.max_prepared_slots;
                dom.inputTimeout.value = systemSettings.no_show_timeout_minutes;
                if (changed) render();
            }
        } catch (err) {
            console.error('Failed to load settings', err);
        }
    }

    // Action Helpers
    async function apiAction(orderId, actionPath) {
        if (window.isActionInFlight) return;
        window.isActionInFlight = true;
        document.body.style.pointerEvents = 'none'; // Disable all clicks globally during action
        document.body.style.opacity = '0.7';

        try {
            const res = await fetch(`${config.apiUrl}/orders/${orderId}/${actionPath}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) {
                showToast(data.error || 'Action failed', 'error');
            }
            // Realtime subscription will re-fetch or we can force render
            await fetchOrders();
        } catch (err) {
            console.error(err);
            showToast('Network error', 'error');
        } finally {
            window.isActionInFlight = false;
            document.body.style.pointerEvents = 'auto';
            document.body.style.opacity = '1';
        }
    }

    // ---------------------------------------------------------
    // RENDER LOGIC
    // ---------------------------------------------------------
    function generateItemsHTML(items) {
        if (!items || !items.length) return '<span>1× Unknown</span>';
        return items.map(item => `<span>${item.quantity}× ${item.name || item.title}</span>`).join('');
    }

    function renderPending(order) {
        // Red + for pending
        // Yellow ready for kitchen
        const isKitchen = order.status === 'kitchen';
        const displayTime = timeAgo(order.created_at);
        const actionBtn = isKitchen 
            ? `<button class="btn-ready" onclick="window.markPrepared('${order.id}')">ready</button>`
            : `<button class="btn-plus" onclick="window.sendToKitchen('${order.id}')"><i class="fas fa-plus"></i></button>`;

        return `
            <div class="order-card" data-id="${order.id}">
                <div class="order-items">
                    ${generateItemsHTML(order.items)}
                </div>
                <div class="order-meta">
                    <span class="time-elapsed">${displayTime}</span>
                    ${actionBtn}
                </div>
            </div>
        `;
    }

    function renderPrepared(order) {
        const prepTime = new Date(order.prepared_at).getTime();
        const now = new Date().getTime();
        const diffMinutes = (now - prepTime) / (1000 * 60);

        // Check if timed out
        const isTimedOut = diffMinutes >= systemSettings.no_show_timeout_minutes && !order.arrived_at;
        
        let actionBtn;
        if (isTimedOut) {
            actionBtn = `<button class="slot-badge btn-cancel" onclick="window.cancelNoShow('${order.id}')"><i class="fas fa-times"></i></button>`;
        } else {
            // Shows slot number (e.g. "1") and handles completion
            actionBtn = `<button class="slot-badge" onclick="window.completeOrder('${order.id}')">${order.slot_number}</button>`;
        }

        return `
             <div class="order-card" data-id="${order.id}" style="${order.arrived_at ? 'border-color: #2196F3; border-width: 2px;' : ''}">
                <div class="order-items">
                    ${generateItemsHTML(order.items)}
                </div>
                <div class="order-meta">
                    <span class="time-elapsed">${timeAgo(order.prepared_at)}</span>
                    ${actionBtn}
                </div>
            </div>
        `;
    }

    function render() {
        // Separate orders
        const pendings = ordersList.filter(o => o.status === 'pending' || o.status === 'kitchen');
        const prepared = ordersList.filter(o => o.status === 'prepared').sort((a,b) => a.slot_number - b.slot_number);

        // Populate PENDING column (max 10, or max_prepared_slots default)
        dom.pendingList.innerHTML = '';
        dom.queueList.innerHTML = '';
        const limit = systemSettings.max_prepared_slots;
        
        if (pendings.length === 0) {
            dom.pendingList.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">No active orders</div>';
            dom.btnQueue.classList.add('hidden');
        } else {
            pendings.slice(0, limit).forEach(o => dom.pendingList.insertAdjacentHTML('beforeend', renderPending(o)));
            
            // Populate QUEUE (remaining)
            const remaining = pendings.slice(limit);
            if (remaining.length > 0) {
                dom.btnQueue.classList.remove('hidden');
                dom.btnQueue.innerText = `QUEUE (${remaining.length}) ...`;
                remaining.forEach(o => dom.queueList.insertAdjacentHTML('beforeend', renderPending(o)));
            } else {
                dom.btnQueue.classList.add('hidden');
            }
        }

        // Populate PREPARED column
        dom.preparedList.innerHTML = '';
        if (prepared.length === 0) {
            dom.preparedList.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">No prepared orders</div>';
        } else {
            prepared.forEach(o => dom.preparedList.insertAdjacentHTML('beforeend', renderPrepared(o)));
        }
    }

    // Interval to refresh timestamps and check timeouts
    setInterval(render, 30000); 

    // ---------------------------------------------------------
    // WINDOW HELPERS & SHORTCUTS
    // ---------------------------------------------------------
    window.sendToKitchen = (id) => apiAction(id, 'send-to-kitchen');
    window.markPrepared = (id) => apiAction(id, 'mark-prepared');
    window.completeOrder = (id) => apiAction(id, 'complete');
    window.cancelNoShow = (id) => {
        if(confirm("Are you sure you want to cancel this order as a no-show and refund the user?")) {
            apiAction(id, 'cancel-no-show');
        }
    };

    // Keyboard Shortcuts for slots 1-9
    window.addEventListener('keydown', (e) => {
        // Ignore if typing in an input
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        const num = parseInt(e.key);
        if (num >= 1 && num <= 9) {
            // Find prepared order with this slot
            const order = ordersList.find(o => o.status === 'prepared' && o.slot_number === num);
            if (order) {
                // Ensure it's not timed out before allowing completion via shortcut
                const prepTime = new Date(order.prepared_at).getTime();
                const now = new Date().getTime();
                const isTimedOut = ((now - prepTime) / 60000) >= systemSettings.no_show_timeout_minutes && !order.arrived_at;
                
                if(!isTimedOut) {
                    window.completeOrder(order.id);
                }
            }
        }
    });

    // ---------------------------------------------------------
    // EVENT LISTENERS & MODALS
    // ---------------------------------------------------------
    function openModal(el) {
        dom.modalContainer.classList.remove('hidden');
        el.classList.remove('hidden');
    }
    
    function closeAllModals() {
        dom.modalContainer.classList.add('hidden');
        document.querySelectorAll('.modal-content').forEach(m => m.classList.add('hidden'));
    }

    document.querySelectorAll('.modal-close, .modal-overlay').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target === btn || e.currentTarget === btn) closeAllModals();
        });
    });
    
    // Header Buttons
    document.getElementById('btn-settings').addEventListener('click', () => openModal(dom.modalSettings));
    document.getElementById('btn-queue').addEventListener('click', () => openModal(dom.modalQueue));
    
    // Redirects for placeholder buttons
    document.getElementById('btn-cancelled').addEventListener('click', () => window.location.href = '#');
    document.getElementById('btn-stock').addEventListener('click', () => window.location.href = '#');
    document.getElementById('btn-profile').addEventListener('click', () => {
        localStorage.removeItem('spoon_admin_token');
        sessionStorage.removeItem('spoon_admin_token');
        window.location.href = '/admin/login.html';
    });

    // Save Settings
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const slots = dom.inputMaxSlots.value;
        const timeo = dom.inputTimeout.value;
        
        try {
            await fetch(`${config.apiUrl}/settings/max_prepared_slots`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ value: slots })
            });
            await fetch(`${config.apiUrl}/settings/no_show_timeout_minutes`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ value: timeo })
            });
            showToast('Settings saved successfully', 'success');
            await fetchSettings();
            closeAllModals();
        } catch(err) {
            showToast('Failed to save settings', 'error');
        }
    });

    // ---------------------------------------------------------
    // REALTIME SUBSCRIPTION
    // ---------------------------------------------------------
    function setupRealtime() {
        supabase.channel('admin-dashboard-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                fetchOrders(); // Easiest way to sync state is re-fetching. Or could mutate ordersList linearly.
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, (payload) => {
                fetchSettings();
            })
            .subscribe((status) => {
                if(status === 'SUBSCRIBED') {
                    dom.indicator.style.color = 'var(--success-green)';
                } else {
                    dom.indicator.style.color = 'var(--text-secondary)';
                }
            });
    }

    // ---------------------------------------------------------
    // IGNITION
    // ---------------------------------------------------------
    fetchSettings();
    fetchOrders().then(() => {
        setupRealtime();
    });
});
