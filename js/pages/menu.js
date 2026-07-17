/**
 * Spoon - Menu Page Script
 * 
 * Controls the main menu page.
 * - Displays categories and food items.
 * - Handles search functionality.
 * - Manages cart additions with stock validation.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Announcement Banner Close Handler ---
    const closeAnnouncementBtn = document.getElementById('close-announcement');
    const announcementBanner = document.querySelector('.announcement-banner');
    
    if (closeAnnouncementBtn && announcementBanner) {
        // Check if banner was previously dismissed
        const isDismissed = localStorage.getItem('spoon-announcement-dismissed') === 'true';
        if (isDismissed) {
            announcementBanner.classList.add('hidden');
        }

        closeAnnouncementBtn.addEventListener('click', () => {
            announcementBanner.classList.add('hidden');
            localStorage.setItem('spoon-announcement-dismissed', 'true');
        });
    }

    // --- Authentication & UI Setup ---

    /**
     * Redirects unauthorized users to login for protected pages.
     */
    function setupProtectedRoutes() {
        const isLoggedIn = localStorage.getItem('spoon-is-logged-in') === 'true';

        if (!isLoggedIn) {
            const cartLink = document.querySelector('a[href="cart.html"]');
            const ordersLink = document.querySelector('a[href="orders.html"]');
            const accountLink = document.querySelector('a[href="account.html"]');

            if (cartLink) cartLink.href = 'login.html';
            if (ordersLink) ordersLink.href = 'login.html';
            if (accountLink) accountLink.href = 'login.html';
        }
    }

    /**
     * Personalizes header with user name if logged in.
     */
    function personalizeHeader() {
        const userGreetingEl = document.getElementById('user-greeting');
        const userAvatarEl = document.querySelector('.greeting-card__avatar');

        // The greeting card + avatar were removed from the menu header — nothing to do.
        if (!userGreetingEl && !userAvatarEl) return;

        const isLoggedIn = localStorage.getItem('spoon-is-logged-in') === 'true';
        if (isLoggedIn) {
            const userData = JSON.parse(localStorage.getItem('spoon-user'));

            if (userData && userData.name) {
                const firstName = userData.name.split(' ')[0];
                userGreetingEl.textContent = `Hello, ${firstName}! 👋`;
                userAvatarEl.innerHTML = `<span>${userData.name.charAt(0).toUpperCase()}</span>`;
            }
        } else {
            userGreetingEl.textContent = 'Hello, Guest! 👋';
            userAvatarEl.innerHTML = `<i class="fa-solid fa-user"></i>`;
        }
    }


    // --- Data & State ---

    let supabase = null;
    let menuData = {
        categories: []
    };
    let isBreakTime = false;

    /**
     * Toggles the global break banner and locks UI interaction.
     */
    function updateBreakTimeUI(isActive) {
        let banner = document.getElementById('break-time-banner');
        if (isActive) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'break-time-banner';
                banner.style.cssText = 'background: var(--danger-color); color: white; padding: 12px; text-align: center; position: sticky; top: 0; z-index: 1000; font-weight: 600; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%;';
                banner.textContent = 'Canteen staff is on a break, try later.';
                document.body.prepend(banner);
            }
        } else {
            if (banner) banner.remove();
        }
    }

    const CATEGORY_MAP = {
        'sandwich': 'SANDWICH',
        'south': 'SOUTH INDIAN',
        'chinese': 'CHINESE',
        'soup': 'SOUP'
    };

    /**
     * Fetches all menu items from Supabase.
     */
    async function fetchMenuItems() {
        try {
            const { data, error } = await supabase
                .from('menu_items')
                .select('id, name, price, category, category_id, is_available')
                .order('name', { ascending: true });

            if (error) {
                console.error('❌ Error fetching menu items:', error);
                showToast('Failed to load menu. Please refresh the page.', 'error');
                return;
            }

            // Group items by category
            const categoriesMap = {};

            data.forEach(item => {
                const categoryId = item.category_id || item.category.toLowerCase();

                if (!categoriesMap[categoryId]) {
                    categoriesMap[categoryId] = {
                        category: item.category || CATEGORY_MAP[categoryId] || categoryId.toUpperCase(),
                        id: categoryId,
                        items: []
                    };
                }

                categoriesMap[categoryId].items.push({
                    id: item.id,
                    name: item.name,
                    price: parseInt(item.price),
                    is_available: item.is_available
                });
            });

            menuData.categories = Object.values(categoriesMap);

        } catch (err) {
            console.error('Unexpected error loading menu:', err);
            showToast('Failed to load menu. Please refresh the page.', 'error');
        }
    }

    /**
     * Fetches top-level system settings like break time.
     */
    async function fetchSystemSettings() {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'is_break_time')
                .maybeSingle();
            
            if (!error && data) {
                isBreakTime = data.value === 'true';
                updateBreakTimeUI(isBreakTime);
            }
        } catch (err) {
            console.error('Failed to load system settings', err);
        }
    }

    // --- DOM References ---

    const categoriesContainer = document.getElementById('categories-container');
    const productsGrid = document.getElementById('products-grid');
    const productListTitle = document.getElementById('product-list-title');
    const searchInput = document.getElementById('search-input');
    const cartBadge = document.getElementById('cart-badge');
    const greetingTaglineEl = document.getElementById('greeting-tagline');

    let currentCategory = null;

    const taglines = [
        "Canteen queue vs. Spoon speed... you choose!",
        "Love at first bite? That's just Spoon.",
        "Stop scrolling, start ordering.",
        "Your tummy's favorite app."
    ];


    // --- Cart Functions ---

    function getCart() {
        return JSON.parse(localStorage.getItem('spoon-cart')) || [];
    }

    function saveCart(cartData) {
        localStorage.setItem('spoon-cart', JSON.stringify(cartData));
    }

    /** Escape HTML to prevent XSS from DB-sourced strings */
    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }


    // --- UI Rendering ---

    /**
     * Renders category chips.
     */
    function renderCategories() {
        categoriesContainer.innerHTML = '';

        menuData.categories.forEach(category => {
            const chip = document.createElement('button');
            chip.className = 'category-chip';
            chip.textContent = category.category;
            chip.dataset.categoryId = category.id;

            if (category.id === currentCategory) {
                chip.classList.add('active');
            }

            categoriesContainer.appendChild(chip);
        });
    }

    /**
     * Renders products for a specific category.
     * @param {string} categoryId 
     */
    function renderProducts(categoryId) {
        const category = menuData.categories.find(cat => cat.id === categoryId);
        if (!category) return;

        productsGrid.innerHTML = '';
        productListTitle.textContent = category.category;
        productListTitle.style.display = 'block';
        categoriesContainer.style.display = 'flex';

        category.items.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'product-card';

            if (!item.is_available) {
                card.classList.add('out-of-stock');
            }

            // Stagger animation optimized
            const delay = Math.min(index * 30, 300);
            card.style.animationDelay = `${delay}ms`;

            const outOfStockLabel = !item.is_available ? '<span class="out-of-stock-label">Out of Stock</span>' : '';
            const buttonDisabled = !item.is_available ? 'disabled' : '';
            const buttonClass = !item.is_available ? 'product-card__add-btn disabled' : 'product-card__add-btn';

            card.innerHTML = `
                <div class="product-card__info">
                    <h4>${esc(item.name)}</h4>
                    <p>₹${item.price}</p>
                    ${outOfStockLabel}
                </div>
                <button class="${buttonClass}" data-id="${item.id}" data-title="${esc(item.name)}" data-price="${item.price}" ${buttonDisabled}>
                    <i class="fa-solid fa-plus"></i>
                </button>`;

            productsGrid.appendChild(card);
            setTimeout(() => card.classList.add('visible'), 10);
        });
    }

    function updateCartBadge() {
        const cart = getCart();
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

        if (totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.classList.add('visible');
        } else {
            cartBadge.classList.remove('visible');
        }
    }


    // --- Event Handlers ---

    function handleCategoryClick(e) {
        const clickedChip = e.target.closest('.category-chip');
        if (!clickedChip) return;

        searchInput.value = '';
        const categoryId = clickedChip.dataset.categoryId;

        if (categoryId === currentCategory) return;

        currentCategory = categoryId;
        categoriesContainer.querySelector('.active')?.classList.remove('active');
        clickedChip.classList.add('active');

        renderProducts(currentCategory);
    }

    /**
     * Handle adding item to cart with inline stock validation.
     * Uses cached is_available from menuData (kept fresh via realtime subscription).
     */
    async function handleAddToCart(e) {
        const addButton = e.target.closest('.product-card__add-btn');
        if (!addButton) return;
        if (addButton.disabled) return;

        if (isBreakTime) {
            showToast('Canteen staff is on a break, try later.', 'error');
            return;
        }

        const { id, title, price } = addButton.dataset;
        const itemId = parseInt(id);

        // Fast path: check cached availability from menuData first
        let cachedItem = null;
        for (const cat of menuData.categories) {
            cachedItem = cat.items.find(i => i.id === itemId);
            if (cachedItem) break;
        }

        if (cachedItem && !cachedItem.is_available) {
            showToast(`${title} is currently out of stock`, 'error');
            return;
        }

        // Loading state
        addButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        addButton.disabled = true;

        try {
            // Verify stock in real-time from DB (single lightweight query)
            const { data, error } = await supabase
                .from('menu_items')
                .select('is_available')
                .eq('id', itemId)
                .single();

            if (error) throw error;

            if (!data.is_available) {
                // Update local cache and grey out card
                if (cachedItem) cachedItem.is_available = false;
                const card = addButton.closest('.product-card');
                if (card) {
                    card.classList.add('out-of-stock');
                    const infoDiv = card.querySelector('.product-card__info');
                    if (infoDiv && !infoDiv.querySelector('.out-of-stock-label')) {
                        infoDiv.insertAdjacentHTML('beforeend', '<span class="out-of-stock-label">Out of Stock</span>');
                    }
                }
                addButton.classList.add('disabled');
                addButton.disabled = true;
                addButton.innerHTML = '<i class="fa-solid fa-plus"></i>';
                showToast(`${title} is currently out of stock`, 'error');
                return;
            }

            // Stock confirmed — add to cart
            const cart = getCart();
            const existingItem = cart.find(item => item.id === itemId);

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({ id: itemId, title, price: parseFloat(price), quantity: 1 });
            }

            saveCart(cart);
            updateCartBadge();

            // Visual feedback
            addButton.disabled = false;
            addButton.style.transform = 'scale(0.9)';
            addButton.style.backgroundColor = 'var(--success-green)';
            addButton.style.borderColor = 'var(--success-green)';
            addButton.style.color = 'var(--text-on-brand)';
            addButton.innerHTML = '<i class="fa-solid fa-check"></i>';

            setTimeout(() => {
                addButton.style.transform = '';
                addButton.style.backgroundColor = '';
                addButton.style.borderColor = '';
                addButton.style.color = '';
                addButton.innerHTML = '<i class="fa-solid fa-plus"></i>';
            }, 800);

        } catch (error) {
            console.warn('Stock check failed, adding optimistically:', error);
            const cart = getCart();
            const existingItem = cart.find(item => item.id === itemId);
            if (existingItem) { existingItem.quantity += 1; }
            else { cart.push({ id: itemId, title, price: parseFloat(price), quantity: 1 }); }
            saveCart(cart);
            updateCartBadge();
            addButton.disabled = false;
            addButton.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }
    }

    // Single shared Realtime channel; torn down when the tab is hidden to free a
    // Supabase Realtime connection, and re-created when the tab becomes visible.
    let realtimeChannel = null;

    /**
     * Subscribe to realtime database changes (stock/availability + break time)
     * on a single shared channel.
     */
    function subscribeToRealtimeSync() {
        if (!supabase || realtimeChannel) return;

        realtimeChannel = supabase
            .channel('menu-realtime-sync')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'menu_items'
            }, (payload) => {
                const updated = payload.new;
                if (!updated) return;

                // Update local cache
                for (const cat of menuData.categories) {
                    const item = cat.items.find(i => i.id === updated.id);
                    if (item) {
                        item.is_available = updated.is_available;
                        break;
                    }
                }

                // Update visible card without re-rendering entire grid
                const btn = productsGrid.querySelector(`[data-id="${updated.id}"]`);
                if (btn) {
                    const card = btn.closest('.product-card');
                    if (!card) return;

                    if (updated.is_available) {
                        card.classList.remove('out-of-stock');
                        const label = card.querySelector('.out-of-stock-label');
                        if (label) label.remove();
                        btn.classList.remove('disabled');
                        btn.disabled = false;
                    } else {
                        card.classList.add('out-of-stock');
                        const infoDiv = card.querySelector('.product-card__info');
                        if (infoDiv && !infoDiv.querySelector('.out-of-stock-label')) {
                            infoDiv.insertAdjacentHTML('beforeend', '<span class="out-of-stock-label">Out of Stock</span>');
                        }
                        btn.classList.add('disabled');
                        btn.disabled = true;
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'system_settings',
                filter: 'key=eq.is_break_time'
            }, (payload) => {
                if (payload.new) {
                    isBreakTime = payload.new.value === 'true';
                    updateBreakTimeUI(isBreakTime);
                }
            })
            .subscribe();
    }

    /**
     * Tear down the Realtime channel (frees the Supabase Realtime connection).
     */
    function unsubscribeRealtimeSync() {
        if (realtimeChannel && supabase) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    }

    // Auto-manage the Realtime connection with tab visibility: disconnect while the
    // tab is hidden, then reconnect + refresh stock/break-time when it becomes
    // visible again (so nothing that changed while away is missed).
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            unsubscribeRealtimeSync();
        } else {
            subscribeToRealtimeSync();
            await fetchMenuItems();
            await fetchSystemSettings();
            renderProducts(currentCategory);
        }
    });

    // Clean up the connection on page unload.
    window.addEventListener('beforeunload', unsubscribeRealtimeSync);

    /**
     * Handles search input to filter items.
     */
    function handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase().trim();

        if (searchTerm === '') {
            renderProducts(currentCategory);
            return;
        }

        const matchedItems = [];

        menuData.categories.forEach(category => {
            category.items.forEach(item => {
                if (item.name.toLowerCase().includes(searchTerm)) {
                    matchedItems.push({
                        ...item,
                        categoryName: category.category,
                        categoryId: category.id
                    });
                }
            });
        });

        productListTitle.style.display = 'none';
        categoriesContainer.style.display = 'none';
        productsGrid.innerHTML = '';

        if (matchedItems.length > 0) {
            matchedItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'product-card';

                if (!item.is_available) {
                    card.classList.add('out-of-stock');
                }

                const delay = Math.min(index * 30, 300);
                card.style.animationDelay = `${delay}ms`;

                const outOfStockLabel = !item.is_available ? '<span class="out-of-stock-label">Out of Stock</span>' : '';
                const buttonDisabled = !item.is_available ? 'disabled' : '';
                const buttonClass = !item.is_available ? 'product-card__add-btn disabled' : 'product-card__add-btn';

                card.innerHTML = `
                    <div class="product-card__info">
                        <div class="product-card__header">
                            <h4>${esc(item.name)}</h4>
                            <span class="product-card__category-badge">${esc(item.categoryName)}</span>
                        </div>
                        <p>₹${item.price}</p>
                        ${outOfStockLabel}
                    </div>
                    <button class="${buttonClass}" data-id="${item.id}" data-title="${esc(item.name)}" data-price="${item.price}" ${buttonDisabled}>
                        <i class="fa-solid fa-plus"></i>
                    </button>`;
                productsGrid.appendChild(card);
                setTimeout(() => card.classList.add('visible'), 10);
            });
        } else {
            productsGrid.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">No items found for "${searchTerm}"</p>`;
        }
    }

    /**
     * Setup promo card click handler.
     */
    function setupPromoCardHandler() {
        const promoCta = document.getElementById('promo-cta');

        if (promoCta) {
            promoCta.addEventListener('click', (e) => {
                e.preventDefault();
                const chineseCategory = 'chinese';
                currentCategory = chineseCategory;

                const allChips = categoriesContainer.querySelectorAll('.category-chip');
                allChips.forEach(chip => {
                    if (chip.dataset.categoryId === chineseCategory) {
                        chip.classList.add('active');
                    } else {
                        chip.classList.remove('active');
                    }
                });

                renderProducts(chineseCategory);
            });
        }
    }


    // --- Initialization ---

    async function init() {
        await window.waitForConfig();
        supabase = window.getSupabaseClient();

        if (!supabase) {
            console.error('❌ Supabase client not initialized');
            showToast('Failed to connect to database. Please refresh.', 'error');
            return;
        }

        setupProtectedRoutes();
        personalizeHeader();

        if (greetingTaglineEl) {
            const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
            greetingTaglineEl.textContent = randomTagline;
        }

        await fetchMenuItems();
        await fetchSystemSettings();

        if (menuData.categories.length > 0) {
            currentCategory = menuData.categories[0].id;
        }

        renderCategories();
        renderProducts(currentCategory);
        updateCartBadge();

        // Attach listeners
        categoriesContainer.addEventListener('click', handleCategoryClick);
        productsGrid.addEventListener('click', handleAddToCart);
        searchInput.addEventListener('input', handleSearch);
        setupPromoCardHandler();

        // Start realtime stock sync
        subscribeToRealtimeSync();
    }

    init();
});
