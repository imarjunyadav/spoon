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
        no_show_timeout_minutes: 10,
        is_break_time: false
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
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        realtime: {
            params: {
                eventsPerSecond: 10,
                log_level: 'info'
            }
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
        inputBreakTime: document.getElementById('setting-break-time'),
        indicator: document.getElementById('live-indicator'),
        stockItemsList: document.getElementById('stock-items-list'),
        stockSearch: document.getElementById('stock-search'),
        modalCancelled: document.getElementById('modal-cancelled'),
        cancelledItemsList: document.getElementById('cancelled-items-list'),
        modalProfile: document.getElementById('modal-profile'),
        profileEmail: document.getElementById('admin-profile-email'),
        btnLogoutConfirm: document.getElementById('btn-logout-confirm'),
        audioToggle: document.getElementById('toggle-audio-notifications'),
        // Force Cancel elements
        btnForceCancel: document.getElementById('btn-force-cancel'),
        forceCancelBar: document.getElementById('force-cancel-bar'),
        fcSelectAllCheckbox: document.getElementById('fc-select-all-checkbox'),
        fcConfirmBtn: document.getElementById('fc-confirm-btn'),
        fcCountEl: document.getElementById('fc-count')
    };

    // Audio & Highlight State
    if (typeof window.audioEnabled === 'undefined') window.audioEnabled = true;

    let lastVisiblePendingIds = new Set();
    let isInitialLoad = true;
    let alarmPlayingForIds = new Set();
    let freezeAcknowledgeUntil = 0;
    let alarmMouseStartX = null;
    let alarmMouseStartY = null;

    // Built-in AudioContext Synthesizer — lazy-initialized on first user gesture
    let audioCtx = null;
    let audioUnlocked = false;
    let alarmIntervalId = null;

    /**
     * Unlock AudioContext on first user interaction.
     * Browsers block AudioContext creation until a user gesture occurs.
     */
    function unlockAudio() {
        if (audioUnlocked) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioUnlocked = true;
            // Remove one-time listeners after unlock
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        } catch(e) { console.error("Failed to create AudioContext", e); }
    }

    // Register one-time unlock listeners
    document.addEventListener('click', unlockAudio, { once: false });
    document.addEventListener('keydown', unlockAudio, { once: false });
    document.addEventListener('touchstart', unlockAudio, { once: false });

    function playBeep() {
        if (!audioCtx || !audioUnlocked) return;
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch ding A5
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start();
            gain.gain.setValueAtTime(1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.7);
            osc.stop(audioCtx.currentTime + 0.7);
        } catch(e) { /* silently ignore audio failures */ }
    }

    function startAlarmLoop() {
        if (!window.audioEnabled) return;
        if (!audioUnlocked) return; // Don't attempt before user gesture
        if (alarmIntervalId) return; // already playing
        playBeep();
        alarmIntervalId = setInterval(playBeep, 2000);
    }

    function stopAlarmLoop() {
        if (alarmIntervalId) {
            clearInterval(alarmIntervalId);
            alarmIntervalId = null;
        }
    }

    // Reset alarm on user interaction
    function acknowledgeAlarm(e) {
        if (Date.now() < freezeAcknowledgeUntil) return; // Protect against instant accidental triggers from mouse movement

        // Anti-jitter: Require at least 50px of mouse movement to trigger ack
        if (e && e.type === 'mousemove') {
            if (alarmMouseStartX === null || alarmMouseStartY === null) {
                alarmMouseStartX = e.clientX;
                alarmMouseStartY = e.clientY;
                return;
            }
            const dist = Math.hypot(e.clientX - alarmMouseStartX, e.clientY - alarmMouseStartY);
            if (dist < 50) return; // Ignore small twitches or sensor noise
        }

        if (alarmPlayingForIds.size > 0) {
            stopAlarmLoop();
            
            // Remove highlight class from acknowledged cards
            alarmPlayingForIds.forEach(id => {
                const card = document.querySelector(`.order-card[data-id="${id}"]`);
                if (card) card.classList.remove('new-order-highlight');
            });
            
            alarmPlayingForIds.clear();
            alarmMouseStartX = null;
            alarmMouseStartY = null;
        }
    }

    // Attach interaction listeners to acknowledge alarm
    window.addEventListener('keydown', (e) => { if (e.code === 'Space') acknowledgeAlarm(); });
    window.addEventListener('mousemove', acknowledgeAlarm, { once: false, passive: true });
    window.addEventListener('click', acknowledgeAlarm, { passive: true });
    window.addEventListener('touchstart', acknowledgeAlarm, { passive: true });

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
                    if (s.key === 'is_break_time' && systemSettings.is_break_time !== (s.value === 'true')) { systemSettings.is_break_time = (s.value === 'true'); changed = true; }
                });
                dom.inputMaxSlots.value = systemSettings.max_prepared_slots;
                dom.inputTimeout.value = systemSettings.no_show_timeout_minutes;
                dom.inputBreakTime.checked = systemSettings.is_break_time;
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
        
        // --- Optimistic UI Update ---
        const orderIndex = ordersList.findIndex(o => o.id === orderId);
        let originalOrder = null;
        
        if (orderIndex > -1) {
            originalOrder = { ...ordersList[orderIndex] }; // copy for rollback
            
            if (actionPath === 'send-to-kitchen') {
                ordersList[orderIndex].status = 'kitchen';
            } else if (actionPath === 'mark-prepared') {
                ordersList[orderIndex].status = 'prepared';
                ordersList[orderIndex].prepared_at = new Date().toISOString();
                ordersList[orderIndex].slot_number = 999; // temporary until background fetch syncs it
            } else if (actionPath === 'complete' || actionPath === 'cancel-no-show') {
                // Remove from local list
                ordersList.splice(orderIndex, 1);
            }
            
            // Re-render immediately (zero latency feel)
            render();
        } else {
            // Fallback if order not found locally
            document.body.style.pointerEvents = 'none';
            document.body.style.opacity = '0.7';
        }

        try {
            const res = await fetch(`${config.apiUrl}/orders/${orderId}/${actionPath}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Action failed');
            }
            
            // Silent background sync to get correct slot numbers, etc.
            fetchOrders(); 
        } catch (err) {
            console.error('API action error:', err);
            showToast(err.message || 'Network error', 'error');
            
            // Rollback optimistic update
            if (originalOrder) {
                if (actionPath === 'complete' || actionPath === 'cancel-no-show') {
                    ordersList.splice(orderIndex, 0, originalOrder);
                } else {
                    const idx = ordersList.findIndex(o => o.id === orderId);
                    if (idx > -1) ordersList[idx] = originalOrder;
                }
                render();
            }
            await fetchOrders(); // Force sync
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
        if (!items || !items.length) return '<div class="item-line"><span class="item-qty">1×</span><span class="item-name">Unknown</span></div>';
        return items.map(item => `
            <div class="item-line">
                <span class="item-qty">${item.quantity}×</span>
                <span class="item-name">${item.name || item.title}</span>
            </div>
        `).join('');
    }

    function renderPending(order) {
        // Red + for pending
        // Yellow ready for kitchen
        const isKitchen = order.status === 'kitchen';
        const displayTime = timeAgo(order.created_at);
        const actionBtn = isKitchen 
            ? `<button class="btn-action btn-ready" onclick="window.markPrepared('${order.id}')">READY</button>`
            : `<button class="btn-action btn-add" onclick="window.sendToKitchen('${order.id}')">ADD</button>`;

        // Add highlight class if this order is currently triggering the alarm
        const highlightClass = alarmPlayingForIds.has(order.id) ? 'new-order-highlight' : '';

        return `
            <div class="order-card ${highlightClass}${isFcSelectMode ? ' fc-selectable' : ''}${fcSelectedIds.has(order.id) ? ' fc-selected' : ''}" data-id="${order.id}">
                <div class="order-items">
                    ${generateItemsHTML(order.items)}
                </div>
                <div class="order-meta">
                    ${!isFcSelectMode ? actionBtn : ''}
                    <span class="time-elapsed">${displayTime}</span>
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
            actionBtn = `<button class="btn-action btn-cancel" onclick="window.cancelNoShow('${order.id}')" title="Cancel Timeout">X</button>`;
        } else if (!order.arrived_at) {
            // User hasn't clicked "I am available". Hide slot number and show nothing.
            actionBtn = `<div style="width: 90px; height: 48px;"></div>`; 
        } else {
            // User has arrived! Show slot number (e.g. "1") and handle completion
            actionBtn = `<button class="slot-badge" onclick="window.completeOrder('${order.id}')" title="Slot ${order.slot_number} - Complete Order">${order.slot_number}</button>`;
        }

        return `
             <div class="order-card${isFcSelectMode ? ' fc-selectable' : ''}${fcSelectedIds.has(order.id) ? ' fc-selected' : ''}" data-id="${order.id}" style="${order.arrived_at ? 'border-color: #2196F3; border-width: 2px;' : ''}">
                <div class="order-items">
                    ${generateItemsHTML(order.items)}
                </div>
                <div class="order-meta">
                    ${!isFcSelectMode ? actionBtn : ''}
                    <span class="time-elapsed">${timeAgo(order.prepared_at)}</span>
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

        // --- AUDIO ALARM LOGIC (Diffing Visible Pending) ---
        const currentVisiblePendingIds = new Set(pendings.slice(0, limit).map(o => o.id));
        
        if (!isInitialLoad && window.audioEnabled !== false) {
            let hasNewVisibleOrder = false;
            
            currentVisiblePendingIds.forEach(id => {
                // If it's a newly visible order (not in last render's visible list)
                if (!lastVisiblePendingIds.has(id)) {
                    hasNewVisibleOrder = true;
                    alarmPlayingForIds.add(id);
                }
            });

            if (hasNewVisibleOrder) {
                freezeAcknowledgeUntil = Date.now() + 2000; // 2 second absolute protection
                alarmMouseStartX = null; // Reset mouse anchor for distance calculation
                alarmMouseStartY = null;
                startAlarmLoop();
                // Add visual highlight right away to the DOM elements just rendered
                alarmPlayingForIds.forEach(id => {
                    const card = dom.pendingList.querySelector(`.order-card[data-id="${id}"]`);
                    if (card) card.classList.add('new-order-highlight');
                });
            }
        }
        
        lastVisiblePendingIds = currentVisiblePendingIds;
        isInitialLoad = false;

        // Re-attach long-press and click handlers for force cancel
        if (isFcSelectMode) {
            attachFcSelectHandlers();
        } else {
            attachLongPressHandlers();
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
        openModal(dom.modalProfile);
        
        // Extract email from JWT token payload to display
        try {
            const payloadBase64 = token.split('.')[1];
            const payload = JSON.parse(atob(payloadBase64));
            dom.profileEmail.innerText = payload.email || 'Admin';
        } catch(e) {
            dom.profileEmail.innerText = 'Admin';
        }
        
        // Sync audio toggle with actual state
        if (window.audioEnabled !== undefined) {
             dom.audioToggle.checked = window.audioEnabled;
        }
    });

    // Profile Modal Actions
    dom.btnLogoutConfirm.addEventListener('click', () => {
        localStorage.removeItem('spoon_admin_token');
        sessionStorage.removeItem('spoon_admin_token');
        window.location.href = '/admin/login.html';
    });

    dom.audioToggle.addEventListener('change', (e) => {
        window.audioEnabled = e.target.checked;
        if(window.audioEnabled) {
            // Test sound natively
            playBeep();
            showToast('Audio notifications enabled', 'success');
        } else {
            stopAlarmLoop();
            showToast('Audio notifications disabled', 'info');
        }
    });

    // Save Settings
    document.getElementById('btn-save-settings').addEventListener('click', async (e) => {
        const slots = dom.inputMaxSlots.value;
        const timeo = dom.inputTimeout.value;
        const breakTime = dom.inputBreakTime.checked ? 'true' : 'false';
        const btn = e.target;
        
        const originalText = btn.innerText;
        btn.innerText = 'SAVING...';
        btn.style.opacity = '0.7';
        btn.disabled = true;
        
        try {
            // Run both updates in parallel
            const [slotsRes, timeoRes, breakRes] = await Promise.all([
                fetch(`${config.apiUrl}/settings/max_prepared_slots`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ value: slots })
                }),
                fetch(`${config.apiUrl}/settings/no_show_timeout_minutes`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ value: timeo })
                }),
                fetch(`${config.apiUrl}/settings/is_break_time`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ value: breakTime })
                })
            ]);
            
            const slotsData = await slotsRes.json();
            const timeoData = await timeoRes.json();
            const breakData = await breakRes.json();
            
            if (!slotsRes.ok || !slotsData.success) throw new Error(slotsData.error || 'Failed to update slots');
            if (!timeoRes.ok || !timeoData.success) throw new Error(timeoData.error || 'Failed to update timeout');
            if (!breakRes.ok || !breakData.success) throw new Error(breakData.error || 'Failed to update break time');
            
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
    // FORCE CANCEL LOGIC
    // ---------------------------------------------------------
    let isFcSelectMode = false;
    let fcSelectedIds = new Set();
    let longPressTimer = null;

    // --- Long Press (single cancel) ---
    function attachLongPressHandlers() {
        document.querySelectorAll('.order-card[data-id]').forEach(card => {
            let timer = null;

            const startPress = (e) => {
                if (isFcSelectMode) return;
                timer = setTimeout(() => {
                    card.classList.add('long-press-active');
                    const orderId = card.dataset.id;
                    setTimeout(() => card.classList.remove('long-press-active'), 300);

                    if (confirm('Force cancel this order and refund the user?')) {
                        forceCancelSingle(orderId);
                    }
                }, 700);
            };

            const cancelPress = () => {
                if (timer) { clearTimeout(timer); timer = null; }
                card.classList.remove('long-press-active');
            };

            card.addEventListener('mousedown', startPress);
            card.addEventListener('mouseup', cancelPress);
            card.addEventListener('mouseleave', cancelPress);
            card.addEventListener('touchstart', startPress, { passive: true });
            card.addEventListener('touchend', cancelPress);
            card.addEventListener('touchcancel', cancelPress);
        });
    }

    async function forceCancelSingle(orderId) {
        // Optimistic removal
        const idx = ordersList.findIndex(o => o.id === orderId);
        let backup = null;
        if (idx > -1) {
            backup = { ...ordersList[idx] };
            ordersList.splice(idx, 1);
            render();
        }

        try {
            const res = await fetch(`${config.apiUrl}/orders/${orderId}/force-cancel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Cancel failed');
            showToast(`Order cancelled, ₹${data.refundAmount} refunded`, 'success');
            fetchOrders();
        } catch (err) {
            showToast(err.message || 'Force cancel failed', 'error');
            if (backup) {
                ordersList.splice(idx, 0, backup);
                render();
            }
            fetchOrders();
        }
    }

    // --- Multi-select mode ---
    function toggleFcSelectMode() {
        isFcSelectMode = !isFcSelectMode;
        fcSelectedIds.clear();

        dom.btnForceCancel.classList.toggle('active', isFcSelectMode);
        dom.forceCancelBar.classList.toggle('hidden', !isFcSelectMode);
        dom.fcSelectAllCheckbox.checked = false;
        updateFcUI();
        render();
    }

    function attachFcSelectHandlers() {
        document.querySelectorAll('.order-card.fc-selectable').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                if (fcSelectedIds.has(id)) {
                    fcSelectedIds.delete(id);
                    card.classList.remove('fc-selected');
                } else {
                    fcSelectedIds.add(id);
                    card.classList.add('fc-selected');
                }
                updateFcUI();
            });
        });
    }

    function updateFcUI() {
        const count = fcSelectedIds.size;
        dom.fcCountEl.textContent = count;
        dom.fcConfirmBtn.disabled = count === 0;

        const totalCards = document.querySelectorAll('.order-card.fc-selectable').length;
        dom.fcSelectAllCheckbox.checked = totalCards > 0 && count === totalCards;
    }

    async function forceCancelBatch() {
        const ids = Array.from(fcSelectedIds);
        if (ids.length === 0) return;

        dom.fcConfirmBtn.disabled = true;
        dom.fcConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Cancelling...</span>';

        let successCount = 0;
        let failCount = 0;
        let totalRefund = 0;

        for (const orderId of ids) {
            try {
                const res = await fetch(`${config.apiUrl}/orders/${orderId}/force-cancel`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    successCount++;
                    totalRefund += data.refundAmount || 0;
                    // Remove from local list
                    const idx = ordersList.findIndex(o => o.id === orderId);
                    if (idx > -1) ordersList.splice(idx, 1);
                } else {
                    failCount++;
                }
            } catch {
                failCount++;
            }
        }

        if (successCount > 0) {
            showToast(`${successCount} order${successCount > 1 ? 's' : ''} cancelled, ₹${totalRefund} refunded`, 'success');
        }
        if (failCount > 0) {
            showToast(`${failCount} order${failCount > 1 ? 's' : ''} failed to cancel`, 'error');
        }

        toggleFcSelectMode();
        fetchOrders();
    }

    // Event listeners
    dom.btnForceCancel.addEventListener('click', toggleFcSelectMode);

    dom.fcSelectAllCheckbox.addEventListener('change', () => {
        const isChecked = dom.fcSelectAllCheckbox.checked;
        document.querySelectorAll('.order-card.fc-selectable').forEach(card => {
            const id = card.dataset.id;
            if (isChecked) {
                fcSelectedIds.add(id);
                card.classList.add('fc-selected');
            } else {
                fcSelectedIds.delete(id);
                card.classList.remove('fc-selected');
            }
        });
        updateFcUI();
    });

    dom.fcConfirmBtn.addEventListener('click', () => {
        const count = fcSelectedIds.size;
        if (confirm(`Force cancel ${count} order${count > 1 ? 's' : ''} and refund users?`)) {
            forceCancelBatch();
        }
    });


    // ---------------------------------------------------------
    // REALTIME SUBSCRIPTION
    // ---------------------------------------------------------
    let realtimeRetryCount = 0;
    let realtimeRetryTimer = null;
    let isSettingUpRealtime = false;

    let currentChannel = null;

    function setupRealtime() {
        // Guard against concurrent calls
        if (isSettingUpRealtime) return;
        isSettingUpRealtime = true;

        // Unsubscribe the previous channel without killing the transport
        if (currentChannel) {
            try {
                currentChannel.unsubscribe();
            } catch (e) {
                // Ignore errors from stale channels
            }
            currentChannel = null;
        }

        // Authenticate the WebSocket for RLS (documented v2 pattern)
        supabase.realtime.setAuth(token);

        currentChannel = supabase.channel('admin-orders-' + Date.now())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                const eventType = payload.eventType;
                const newOrder = payload.new;
                const oldOrder = payload.old;

                if (eventType === 'INSERT') {
                    if (!ordersList.find(o => o.id === newOrder.id)) {
                        ordersList.unshift(newOrder); 
                        if (newOrder.status === 'pending') {
                            alarmPlayingForIds.add(newOrder.id);
                            startAlarmLoop();
                        }
                    }
                } else if (eventType === 'UPDATE') {
                    const idx = ordersList.findIndex(o => o.id === newOrder.id);
                    if (idx > -1) {
                        if (!newOrder.items && ordersList[idx].items) {
                            newOrder.items = ordersList[idx].items;
                        }
                        ordersList[idx] = { ...ordersList[idx], ...newOrder };
                    } else if (newOrder.status === 'pending') {
                        ordersList.unshift(newOrder);
                    }
                } else if (eventType === 'DELETE') {
                    const idx = ordersList.findIndex(o => o.id === oldOrder.id);
                    if (idx > -1) ordersList.splice(idx, 1);
                }
                render(); 
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
                fetchSettings();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
                if (!dom.modalStock.classList.contains('hidden') && pendingStockToggles.size === 0) {
                    fetchMenuItems();
                }
            })
            .subscribe((status) => {
                isSettingUpRealtime = false;

                if (status === 'SUBSCRIBED') {
                    console.log('[Realtime] ✅ Connected successfully');
                    dom.indicator.style.color = 'var(--success-green)';
                    realtimeRetryCount = 0;
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    dom.indicator.style.color = 'var(--text-secondary)';

                    if (realtimeRetryCount < 5) {
                        const delay = Math.min(3000 * Math.pow(2, realtimeRetryCount), 60000);
                        realtimeRetryCount++;
                        console.warn(`[Realtime] Connection lost. Retry ${realtimeRetryCount}/5 in ${delay/1000}s`);
                        
                        clearTimeout(realtimeRetryTimer);
                        realtimeRetryTimer = setTimeout(() => {
                            fetchOrders().then(setupRealtime).catch(() => {
                                isSettingUpRealtime = false;
                            });
                        }, delay);
                    } else {
                        console.error('[Realtime] Max retries reached. Falling back to polling only.');
                        showToast('Live connection lost — auto-refreshing every 60s', 'info');
                    }
                }
            });
    }

    // ---------------------------------------------------------
    // IGNITION
    // ---------------------------------------------------------
    fetchSettings();
    fetchOrders().then(() => {
        setupRealtime();
        
        // Safety Fallback: Silent background sync every 60 seconds
        // Catches any missed events without hammering the backend
        setInterval(() => {
            if (!window.isActionInFlight) {
                fetchOrders();
            }
        }, 60000);
    });
});
