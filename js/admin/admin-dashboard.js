/**
 * SPOON ADMIN V2 - DASHBOARD LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // GLOBALS & STATE
    // ---------------------------------------------------------
    let ordersList = [];
    let stockItemsList = [];
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

    const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        global: {
            headers: { Authorization: `Bearer ${token}` }
        }
    });

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
        modalStock: document.getElementById('modal-stock'),
        inputMaxSlots: document.getElementById('setting-max-slots'),
        inputTimeout: document.getElementById('setting-timeout'),
        indicator: document.getElementById('live-indicator'),
        stockItemsList: document.getElementById('stock-items-list'),
        stockSearch: document.getElementById('stock-search'),
        modalCancelled: document.getElementById('modal-cancelled'),
        cancelledItemsList: document.getElementById('cancelled-items-list')
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

    async function fetchCancelledOrders() {
        try {
            const res = await fetch(`${config.apiUrl}/orders/admin/cancelled`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success) {
                renderCancelledOrders(json.orders);
            }
        } catch (err) {
            console.error('Failed to load cancelled orders', err);
            dom.cancelledItemsList.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">Failed to load</div>';
        }
    }

    function renderCancelledOrders(orders) {
        if (!orders || orders.length === 0) {
            dom.cancelledItemsList.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">No cancelled orders found</div>';
            return;
        }

        let html = '';
        orders.forEach(order => {
            const timeStr = new Date(order.cancelled_at || order.created_at).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
            const isRefunded = order.refund_amount != null && order.refund_amount > 0;
            const refundInfo = isRefunded 
                ? `<span style="color:#d9534f; font-weight:600; font-size:13px;">Refunded: 🪙 ${order.refund_amount}</span>`
                : `<span style="color:#999; font-size:13px;">No refund</span>`;
            const reasonInfo = order.cancel_reason === 'no_show' 
                ? `<span style="color:#666; font-size:12px; font-weight:500;">(No-Show)</span>` 
                : '';

            html += `
            <div style="padding:16px; border-bottom:1px solid #eee; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div style="font-weight:600; font-size:15px; margin-bottom:4px;">${order.customer_email || 'Unknown User'}</div>
                        <div style="font-size:12px; color:#999;">${timeStr} ${reasonInfo}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-weight:700; font-size:16px;">₹${order.total}</div>
                        ${refundInfo}
                    </div>
                </div>
                <div style="font-size:13px; color:#555; background:#f9f9f9; padding:8px 12px; border-radius:6px;">
                    ${generateItemsHTML(order.items)}
                </div>
            </div>`;
        });
        dom.cancelledItemsList.innerHTML = html;
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

    async function fetchMenuItems() {
        try {
            const { data, error } = await supabase
                .from('menu_items')
                .select('id, name, is_available, category')
                .order('name');
            if (error) throw error;
            stockItemsList = data || [];
            renderStockItems();
        } catch (err) {
            console.error('Failed to load menu items', err);
            showToast('Failed to load menu items', 'error');
        }
    }

    let pendingStockToggles = new Set(); // Guard against realtime overwrite during in-flight toggles

    window.toggleStock = async (itemId, isAvailable) => {
        try {
            const stringId = String(itemId);
            
            // Optimistic local data update (strict equality fix: DB id is integer, HTML passes string)
            const itemIndex = stockItemsList.findIndex(i => String(i.id) === stringId);
            if (itemIndex > -1) {
                stockItemsList[itemIndex].is_available = isAvailable;
            }

            // Targeted DOM update: just toggle the row class (CSS handles visual via :checked)
            // No full re-render needed — the checkbox already visually flipped via CSS :checked
            const row = dom.stockItemsList.querySelector(`input[onchange*="'${stringId}'"]`);
            if (row) {
                const itemRow = row.closest('.stock-item-row');
                if (itemRow) {
                    itemRow.classList.toggle('out-of-stock', !isAvailable);
                }
            }

            // Update tab badges without full re-render
            renderStockTabs();

            pendingStockToggles.add(stringId);

            const res = await fetch(`${config.apiUrl}/admin/stock/${stringId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ is_available: isAvailable })
            });
            const data = await res.json();
                
            if (!res.ok || !data.success) throw new Error(data.message || 'Update failed');
            showToast('Stock updated', 'success');
        } catch (err) {
            console.error('Stock toggle failed', err);
            showToast('Stock update failed', 'error');
            await fetchMenuItems(); // Full revert on error
        } finally {
            pendingStockToggles.delete(String(itemId));
        }
    };


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
            actionBtn = `<button class="slot-badge btn-cancel" onclick="window.cancelNoShow('${order.id}')" title="Cancel Timeout"><i class="fas fa-times"></i></button>`;
        } else if (!order.arrived_at) {
            // User hasn't clicked "I am available". Hide slot number and show nothing.
            actionBtn = ``;
        } else {
            // User has arrived! Show slot number (e.g. "1") and handle completion
            actionBtn = `<button class="slot-badge" style="background:#4caf50; color:#fff;" onclick="window.completeOrder('${order.id}')" title="Slot ${order.slot_number} - Complete Order">${order.slot_number}</button>`;
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

    let activeStockCategory = 'all';
    let stockSearchDebounce = null;

    function renderStockTabs() {
        const tabsContainer = dom.stockItemsList.querySelector('.stock-tabs-bar');
        if (!tabsContainer) return; // tabs not rendered yet, will be created in renderStockItems

        const categories = [...new Set(stockItemsList.map(i => i.category || 'Uncategorized'))].sort();
        const outOfStockCounts = {};
        stockItemsList.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!item.is_available) outOfStockCounts[cat] = (outOfStockCounts[cat] || 0) + 1;
        });
        const totalOos = stockItemsList.filter(i => !i.is_available).length;

        let html = `<button class="stock-tab ${activeStockCategory === 'all' ? 'active' : ''}" onclick="window.setStockCategory('all')">All${totalOos > 0 ? ` <span class="oos-badge">${totalOos}</span>` : ''}</button>`;
        categories.forEach(cat => {
            const oos = outOfStockCounts[cat] || 0;
            html += `<button class="stock-tab ${activeStockCategory === cat ? 'active' : ''}" onclick="window.setStockCategory('${cat}')">${cat}${oos > 0 ? ` <span class="oos-badge">${oos}</span>` : ''}</button>`;
        });
        tabsContainer.innerHTML = html;
    }

    function renderStockItems() {
        if (!dom.stockItemsList) return;

        const searchQuery = (dom.stockSearch?.value || '').trim().toLowerCase();

        let filteredItems = stockItemsList;

        if (searchQuery) {
            filteredItems = filteredItems.filter(item =>
                item.name.toLowerCase().includes(searchQuery)
            );
        }

        // Build category tabs
        const categories = [...new Set(stockItemsList.map(i => i.category || 'Uncategorized'))].sort();
        const outOfStockCounts = {};
        stockItemsList.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!item.is_available) outOfStockCounts[cat] = (outOfStockCounts[cat] || 0) + 1;
        });
        const totalOos = stockItemsList.filter(i => !i.is_available).length;

        let tabsHtml = `<div class="stock-tabs-bar" style="display:flex; gap:6px; overflow-x:auto; padding-bottom:12px; border-bottom:1px solid #eee; margin-bottom:8px; flex-shrink:0;">`;
        tabsHtml += `<button class="stock-tab ${activeStockCategory === 'all' ? 'active' : ''}" onclick="window.setStockCategory('all')">All${totalOos > 0 ? ` <span class="oos-badge">${totalOos}</span>` : ''}</button>`;
        categories.forEach(cat => {
            const oos = outOfStockCounts[cat] || 0;
            tabsHtml += `<button class="stock-tab ${activeStockCategory === cat ? 'active' : ''}" onclick="window.setStockCategory('${cat}')">${cat}${oos > 0 ? ` <span class="oos-badge">${oos}</span>` : ''}</button>`;
        });
        tabsHtml += `</div>`;

        // Filter by active category
        if (activeStockCategory !== 'all') {
            filteredItems = filteredItems.filter(i => (i.category || 'Uncategorized') === activeStockCategory);
        }

        // Group by category for section labels
        const grouped = {};
        filteredItems.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });
        const sortedCats = Object.keys(grouped).sort();

        let itemsHtml = '';
        if (filteredItems.length === 0) {
            itemsHtml = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">No items found</div>';
        } else {
            sortedCats.forEach(category => {
                itemsHtml += `<div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#999; letter-spacing:0.5px; padding:12px 0 6px;">${category}</div>`;
                grouped[category].forEach(item => {
                    itemsHtml += `
                    <div class="stock-item-row ${!item.is_available ? 'out-of-stock' : ''}">
                        <span class="item-name">${item.name}</span>
                        <label class="stock-toggle">
                            <input type="checkbox" onchange="window.toggleStock('${item.id}', this.checked)" ${item.is_available ? 'checked' : ''}>
                            <span class="toggle-track"></span>
                            <span class="toggle-knob"></span>
                        </label>
                    </div>`;
                });
            });
        }

        dom.stockItemsList.innerHTML = tabsHtml + `<div class="stock-items-scroll" style="overflow-y:auto; max-height:350px; padding-right:4px;">` + itemsHtml + `</div>`;
    }

    window.setStockCategory = (cat) => {
        activeStockCategory = cat;
        renderStockItems();
    };

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

    // Only close modal via X button
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllModals();
        });
    });

    // Clicking on the dark overlay background (not the modal content) closes the modal
    dom.modalContainer.addEventListener('click', (e) => {
        if (e.target === dom.modalContainer) closeAllModals();
    });

    // Prevent clicks inside modal content from bubbling to overlay
    document.querySelectorAll('.modal-content').forEach(mc => {
        mc.addEventListener('click', (e) => e.stopPropagation());
    });
    
    // Header Buttons
    document.getElementById('btn-settings').addEventListener('click', () => openModal(dom.modalSettings));
    document.getElementById('btn-queue').addEventListener('click', () => openModal(dom.modalQueue));
    document.getElementById('btn-stock').addEventListener('click', () => {
        openModal(dom.modalStock);
        fetchMenuItems(); // Fetch latest stock when opened
    });
    
    // Search logic for Stock Modal (debounced)
    dom.stockSearch?.addEventListener('input', () => {
        clearTimeout(stockSearchDebounce);
        stockSearchDebounce = setTimeout(renderStockItems, 150);
    });

    // Action Buttons
    document.getElementById('btn-cancelled').addEventListener('click', () => {
        openModal(dom.modalCancelled);
        dom.cancelledItemsList.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding: 24px;">Loading...</div>';
        fetchCancelledOrders();
    });
    document.getElementById('btn-profile').addEventListener('click', () => {
        localStorage.removeItem('spoon_admin_token');
        sessionStorage.removeItem('spoon_admin_token');
        window.location.href = '/admin/login.html';
    });

    // Save Settings
    document.getElementById('btn-save-settings').addEventListener('click', async (e) => {
        const slots = dom.inputMaxSlots.value;
        const timeo = dom.inputTimeout.value;
        const btn = e.target;
        
        const originalText = btn.innerText;
        btn.innerText = 'SAVING...';
        btn.style.opacity = '0.7';
        btn.disabled = true;
        
        try {
            // Run both updates in parallel
            const [slotsRes, timeoRes] = await Promise.all([
                fetch(`${config.apiUrl}/settings/max_prepared_slots`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ value: slots })
                }),
                fetch(`${config.apiUrl}/settings/no_show_timeout_minutes`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ value: timeo })
                })
            ]);
            
            const slotsData = await slotsRes.json();
            const timeoData = await timeoRes.json();
            
            if (!slotsRes.ok || !slotsData.success) throw new Error(slotsData.error || 'Failed to update slots');
            if (!timeoRes.ok || !timeoData.success) throw new Error(timeoData.error || 'Failed to update timeout');
            
            showToast('Settings saved successfully', 'success');
            await fetchSettings();
            closeAllModals();
        } catch(err) {
            console.error('Settings save error:', err);
            showToast(err.message || 'Failed to save settings', 'error');
            // If it failed due to capacity error, reset input to actual value
            dom.inputMaxSlots.value = systemSettings.max_prepared_slots;
        } finally {
            btn.innerText = originalText;
            btn.style.opacity = '1';
            btn.disabled = false;
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
                // Only refresh if modal is open AND no toggles are in-flight (prevents overwriting optimistic state)
                if (!dom.modalStock.classList.contains('hidden') && pendingStockToggles.size === 0) {
                    fetchMenuItems();
                }
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
