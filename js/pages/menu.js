/**
 * Spoon - Menu Page Script
 * 
 * Controls the main menu page.
 * - Displays categories and food items.
 * - Handles search functionality.
 * - Manages cart additions with stock validation.
 */

document.addEventListener('DOMContentLoaded', () => {

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
        const isLoggedIn = localStorage.getItem('spoon-is-logged-in') === 'true';
        const userGreetingEl = document.getElementById('user-greeting');
        const userAvatarEl = document.querySelector('.greeting-card__avatar');

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
                .select('*')
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
                    <h4>${item.name}</h4>
                    <p>₹${item.price}</p>
                    ${outOfStockLabel}
                </div>
                <button class="${buttonClass}" data-id="${item.id}" data-title="${item.name}" data-price="${item.price}" ${buttonDisabled}>
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
     * Handle adding item to cart with stock validation.
     */
    async function handleAddToCart(e) {
        const addButton = e.target.closest('.product-card__add-btn');
        if (!addButton) return;
        if (addButton.disabled) return;

        const { id, title, price } = addButton.dataset;
        const itemId = parseInt(id);

        // Loading state
        const originalContent = addButton.innerHTML;
        addButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        addButton.disabled = true;

        try {
            // Lazy stock validation
            const stockResult = await StockValidator.checkAvailability(itemId);

            if (!stockResult.available) {
                StockValidator.markItemUnavailable(itemId);
                const itemName = stockResult.item?.name || title;
                StockValidator.showOutOfStockAlert(itemName);
                return;
            }

            // Proceed with add to cart
            const cart = getCart();
            const existingItem = cart.find(item => item.id === itemId);

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    id: itemId,
                    title: title,
                    price: parseFloat(price),
                    quantity: 1
                });
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
            }, 1000);

        } catch (error) {
            console.warn('Stock validation failed, proceeding optimistically:', error);

            // Optimistic add
            const cart = getCart();
            const existingItem = cart.find(item => item.id === itemId);

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    id: itemId,
                    title: title,
                    price: parseFloat(price),
                    quantity: 1
                });
            }

            saveCart(cart);
            updateCartBadge();

            addButton.disabled = false;
            addButton.innerHTML = originalContent;
        }
    }

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
                            <h4>${item.name}</h4>
                            <span class="product-card__category-badge">${item.categoryName}</span>
                        </div>
                        <p>₹${item.price}</p>
                        ${outOfStockLabel}
                    </div>
                    <button class="${buttonClass}" data-id="${item.id}" data-title="${item.name}" data-price="${item.price}" ${buttonDisabled}>
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

        if (typeof StockValidator !== 'undefined') {
            StockValidator.init(supabase);
        }

        setupProtectedRoutes();
        personalizeHeader();

        const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
        greetingTaglineEl.textContent = randomTagline;

        await fetchMenuItems();

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
    }

    init();
});
