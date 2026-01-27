/**
 * ========================================
 * SPOON - MENU PAGE JAVASCRIPT
 * ========================================
 * 
 * PURPOSE:
 * This file controls the main menu page where users browse food items.
 * 
 * WHAT IT DOES:
 * 1. Shows personalized greeting if user is logged in
 * 2. Displays food categories (Sandwich, South Indian, Chinese, etc.)
 * 3. Lets users search for food items across all categories
 * 4. Allows adding items to cart with visual feedback
 * 5. Updates cart badge count in real-time
 * 
 * KEY CONCEPTS FOR INTERNS:
 * - localStorage: Browser storage that persists even after closing the tab
 * - DOM manipulation: Changing HTML elements using JavaScript
 * - Event listeners: Code that runs when user clicks/types something
 */

// Wait for the entire HTML page to load before running our code
document.addEventListener('DOMContentLoaded', () => {

    // ========================================
    // SECTION 1: USER AUTHENTICATION & PERSONALIZATION
    // ========================================

    /**
     * FUNCTION: setupProtectedRoutes
     * 
     * PURPOSE: Redirect users to login if they try to access protected pages
     * 
     * HOW IT WORKS:
     * - Checks if user is logged in by looking at localStorage
     * - If NOT logged in, changes Cart/Orders/Account links to point to login page
     * - This prevents unauthorized access to user-specific features
     */
    function setupProtectedRoutes() {
        // Check localStorage for login status (returns 'true' or null)
        const isLoggedIn = localStorage.getItem('spoon-is-logged-in') === 'true';
        
        // If user is NOT logged in
        if (!isLoggedIn) {
            // Find the navigation links in the bottom nav bar
            const cartLink = document.querySelector('a[href="cart.html"]');
            const ordersLink = document.querySelector('a[href="orders.html"]');
            const accountLink = document.querySelector('a[href="account.html"]');
            
            // Change their destination to login page instead
            if (cartLink) cartLink.href = 'login.html';
            if (ordersLink) ordersLink.href = 'login.html';
            if (accountLink) accountLink.href = 'login.html';
        }
    }

    /**
     * FUNCTION: personalizeHeader
     * 
     * PURPOSE: Show user's name and initial in the header if they're logged in
     * 
     * HOW IT WORKS:
     * - Checks if user is logged in
     * - If yes: Gets user data from localStorage and displays their name
     * - If no: Shows default "Hello, Guest!" message
     */
    function personalizeHeader() {
        // Check if user is logged in
        const isLoggedIn = localStorage.getItem('spoon-is-logged-in') === 'true';
        
        // Get references to HTML elements we want to update
        const userGreetingEl = document.getElementById('user-greeting');
        const userAvatarEl = document.querySelector('.greeting-card__avatar');

        if (isLoggedIn) {
            // Get user data from localStorage (stored as JSON string, so we parse it)
            const userData = JSON.parse(localStorage.getItem('spoon-user'));
            
            // If user data exists and has a name
            if (userData && userData.name) {
                // Extract first name (everything before the first space)
                const firstName = userData.name.split(' ')[0];
                
                // Update greeting text with user's first name and emoji
                userGreetingEl.textContent = `Hello, ${firstName}! 👋`;
                
                // Show first letter of name in avatar circle
                // .charAt(0) gets first character, .toUpperCase() makes it capital
                userAvatarEl.innerHTML = `<span>${userData.name.charAt(0).toUpperCase()}</span>`;
            }
        } else {
            // User is not logged in - show default guest message
            userGreetingEl.textContent = 'Hello, Guest! 👋';
            userAvatarEl.innerHTML = `<i class="fa-solid fa-user"></i>`;
        }
    }


    // ========================================
    // SECTION 2: SUPABASE SETUP & MENU DATA
    // ========================================
    
    /**
     * SUPABASE CLIENT
     * Uses centralized config from js/config.js
     * Config is loaded from backend API for security
     */
    let supabase = null;
    
    /**
     * MENU DATA STRUCTURE
     * Now fetched dynamically from Supabase database
     */
    let menuData = {
        categories: []
    };
    
    /**
     * CATEGORY MAPPING
     * Maps database category IDs to display names
     */
    const CATEGORY_MAP = {
        'sandwich': 'SANDWICH',
        'south': 'SOUTH INDIAN',
        'chinese': 'CHINESE',
        'soup': 'SOUP'
    };
    
    /**
     * FUNCTION: fetchMenuItems
     * 
     * PURPOSE: Fetch all menu items from Supabase database
     * 
     * RETURNS: Promise that resolves when menu is loaded
     * 
     * HOW IT WORKS:
     * 1. Queries menu_items table from Supabase
     * 2. Groups items by category
     * 3. Transforms into menuData structure
     * 4. Handles out-of-stock items
     */
    async function fetchMenuItems() {
        try {
            // Fetch all menu items from Supabase
            const { data, error } = await supabase
                .from('menu_items')
                .select('*')
                .order('name', { ascending: true });
            
            if (error) {
                console.error('Error fetching menu items:', error);
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
                
                // Add item with availability status
                categoriesMap[categoryId].items.push({
                    id: item.id,
                    name: item.name,
                    price: parseInt(item.price),
                    is_available: item.is_available
                });
            });
            
            // Convert map to array
            menuData.categories = Object.values(categoriesMap);
            
            console.log('✅ Menu loaded from Supabase:', menuData.categories.length, 'categories');
            
        } catch (err) {
            console.error('Unexpected error loading menu:', err);
            showToast('Failed to load menu. Please refresh the page.', 'error');
        }
    }

    // ========================================
    // SECTION 3: DOM REFERENCES & STATE VARIABLES
    // ========================================
    
    /**
     * DOM REFERENCES
     * These variables store references to HTML elements we'll manipulate.
     * Think of them as "shortcuts" to specific parts of the webpage.
     */
    const categoriesContainer = document.getElementById('categories-container'); // Where category buttons appear
    const productsGrid = document.getElementById('products-grid'); // Where food cards appear
    const productListTitle = document.getElementById('product-list-title'); // Category title above products
    const searchInput = document.getElementById('search-input'); // Search bar input field
    const cartBadge = document.getElementById('cart-badge'); // Red circle showing cart item count
    const userGreetingEl = document.getElementById('user-greeting'); // "Hello, [Name]" text
    const greetingTaglineEl = document.getElementById('greeting-tagline'); // Funny tagline below greeting
    
    /**
     * STATE VARIABLES
     * These track the current state of the app
     */
    let currentCategory = null; // Will be set after menu loads
    
    // Array of fun taglines that appear randomly
    const taglines = [
        "Canteen queue vs. Spoon speed... you choose!", 
        "Love at first bite? That's just Spoon.",
        "Stop scrolling, start ordering.", 
        "Your tummy's favorite app."
    ];

    // ========================================
    // SECTION 4: CART HELPER FUNCTIONS
    // ========================================
    
    /**
     * FUNCTION: getCart
     * 
     * PURPOSE: Retrieve the current cart from browser storage
     * 
     * RETURNS: Array of cart items, or empty array if cart doesn't exist
     * 
     * HOW IT WORKS:
     * - Looks for 'spoon-cart' in localStorage
     * - Parses the JSON string back into a JavaScript array
     * - Returns empty array [] if nothing found (using || operator)
     */
    function getCart() { 
        return JSON.parse(localStorage.getItem('spoon-cart')) || []; 
    }
    
    /**
     * FUNCTION: saveCart
     * 
     * PURPOSE: Save the cart to browser storage
     * 
     * PARAMETERS:
     * @param {Array} cartData - Array of cart items to save
     * 
     * HOW IT WORKS:
     * - Converts JavaScript array to JSON string (localStorage only stores strings)
     * - Saves it with key 'spoon-cart'
     */
    function saveCart(cartData) { 
        localStorage.setItem('spoon-cart', JSON.stringify(cartData)); 
    }
    
    // ========================================
    // SECTION 5: UI RENDERING FUNCTIONS
    // ========================================
    
    /**
     * FUNCTION: renderCategories
     * 
     * PURPOSE: Display all food category buttons (Sandwich, South Indian, etc.)
     * 
     * HOW IT WORKS:
     * 1. Clears existing category buttons
     * 2. Loops through each category in menuData
     * 3. Creates a button element for each category
     * 4. Marks the current category as "active" (highlighted)
     * 5. Adds button to the page
     */
    function renderCategories() {
        // Clear any existing category buttons
        categoriesContainer.innerHTML = '';
        
        // Loop through each category and create a button
        menuData.categories.forEach(category => {
            // Create a new button element
            const chip = document.createElement('button');
            chip.className = 'category-chip';
            chip.textContent = category.category; // Button text (e.g., "SANDWICH")
            chip.dataset.categoryId = category.id; // Store category ID for later use
            
            // Highlight the currently selected category
            if (category.id === currentCategory) { 
                chip.classList.add('active'); 
            }
            
            // Add button to the container
            categoriesContainer.appendChild(chip);
        });
    }
    
    /**
     * FUNCTION: renderProducts
     * 
     * PURPOSE: Display all food items for a specific category
     * 
     * PARAMETERS:
     * @param {string} categoryId - The ID of category to display (e.g., "sandwich")
     * 
     * HOW IT WORKS:
     * 1. Finds the category data by ID
     * 2. Clears existing product cards
     * 3. Updates the category title
     * 4. Creates a card for each food item
     * 5. Adds staggered animation for smooth appearance
     */
    function renderProducts(categoryId) {
        // Find the category object that matches the given ID
        const category = menuData.categories.find(cat => cat.id === categoryId);
        if (!category) return; // Exit if category not found
        
        // Clear existing product cards
        productsGrid.innerHTML = '';
        
        // Update the title to show current category
        productListTitle.textContent = category.category;
        productListTitle.style.display = 'block'; // Make sure title is visible
        categoriesContainer.style.display = 'flex'; // Make sure categories are visible
        
        // Create a card for each food item in this category
        category.items.forEach((item, index) => {
            // Create card element
            const card = document.createElement('div');
            card.className = 'product-card';
            
            // Add out-of-stock class if item is unavailable
            if (!item.is_available) {
                card.classList.add('out-of-stock');
            }
            
            /**
             * STAGGER ANIMATION (OPTIMIZED)
             * 
             * IMPROVEMENTS:
             * - Reduced delay from 50ms to 30ms (40% faster)
             * - Cap at 10 items (300ms max) to prevent long waits
             * - Items beyond 10th appear instantly for better perceived performance
             * 
             * CALCULATION:
             * - Items 1-10: 0ms, 30ms, 60ms, ..., 270ms
             * - Items 11+: 300ms (all appear together)
             */
            const delay = Math.min(index * 30, 300);
            card.style.animationDelay = `${delay}ms`;
            
            // Set the HTML content of the card
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
            
            // Add card to the grid
            productsGrid.appendChild(card);
            
            // Trigger animation after a tiny delay (10ms)
            setTimeout(() => card.classList.add('visible'), 10);
        });
    }
    
    /**
     * FUNCTION: updateCartBadge
     * 
     * PURPOSE: Update the red badge showing total items in cart
     * 
     * HOW IT WORKS:
     * 1. Gets current cart from localStorage
     * 2. Calculates total quantity of all items
     * 3. Shows/hides badge based on whether cart has items
     * 
     * LEARNING NOTE:
     * The .reduce() method is a powerful array function that combines all values.
     * Here it adds up all quantities: [2, 3, 1] becomes 6
     */
    function updateCartBadge() {
        const cart = getCart();
        
        // Calculate total items: sum of all quantities
        // reduce() takes each item and adds its quantity to the running sum
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        
        if (totalItems > 0) {
            // Show badge with count
            cartBadge.textContent = totalItems;
            cartBadge.classList.add('visible');
        } else {
            // Hide badge when cart is empty
            cartBadge.classList.remove('visible');
        }
    }

    // ========================================
    // SECTION 6: EVENT HANDLER FUNCTIONS
    // ========================================
    
    /**
     * FUNCTION: handleCategoryClick
     * 
     * PURPOSE: Handle when user clicks on a category button
     * 
     * PARAMETERS:
     * @param {Event} e - The click event object
     * 
     * HOW IT WORKS:
     * 1. Finds which category button was clicked
     * 2. Clears the search bar
     * 3. Updates the active category
     * 4. Re-renders products for the new category
     */
    function handleCategoryClick(e) {
        // Find the clicked category button (even if user clicked inside it)
        const clickedChip = e.target.closest('.category-chip');
        if (!clickedChip) return; // Exit if click wasn't on a category button
        
        // Clear search when switching categories
        searchInput.value = '';
        
        // Get the category ID from the button's data attribute
        const categoryId = clickedChip.dataset.categoryId;
        
        // Don't do anything if user clicked the already-active category
        if (categoryId === currentCategory) return;
        
        // Update which category is active
        currentCategory = categoryId;
        
        // Remove 'active' class from old category button
        categoriesContainer.querySelector('.active')?.classList.remove('active');
        
        // Add 'active' class to new category button
        clickedChip.classList.add('active');
        
        // Show products for the new category
        renderProducts(currentCategory);
    }
    
    /**
     * FUNCTION: handleAddToCart
     * 
     * PURPOSE: Add a food item to the cart when user clicks the + button
     * 
     * PARAMETERS:
     * @param {Event} e - The click event object
     * 
     * HOW IT WORKS:
     * 1. Gets item details from button's data attributes
     * 2. Validates stock availability via lazy check (Requirements: 3.3)
     * 3. If unavailable: blocks addition, shows alert, disables button (Requirements: 3.4)
     * 4. If available: adds to cart with visual feedback
     * 5. Handles network errors optimistically (Requirements: 3.5)
     */
    async function handleAddToCart(e) {
        // Find the add button that was clicked
        const addButton = e.target.closest('.product-card__add-btn');
        if (!addButton) return; // Exit if click wasn't on add button
        
        // Don't process if button is already disabled
        if (addButton.disabled) return;
        
        // Extract item data from button's data attributes
        const { id, title, price } = addButton.dataset;
        const itemId = parseInt(id); // Convert string to number
        
        // Show loading state on button
        const originalContent = addButton.innerHTML;
        addButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        addButton.disabled = true;
        
        try {
            // Lazy stock validation (Requirements: 3.3)
            // Check availability before adding to cart
            const stockResult = await StockValidator.checkAvailability(itemId);
            
            if (!stockResult.available) {
                // Item is unavailable (Requirements: 3.4)
                // Mark item as unavailable in UI
                StockValidator.markItemUnavailable(itemId);
                
                // Show alert to user
                const itemName = stockResult.item?.name || title;
                StockValidator.showOutOfStockAlert(itemName);
                
                // Don't add to cart
                return;
            }
            
            // Item is available - proceed with add to cart
            // Get current cart
            const cart = getCart();
            
            // Check if this item is already in the cart
            const existingItem = cart.find(item => item.id === itemId);
            
            if (existingItem) {
                // Item exists: just increase quantity
                existingItem.quantity += 1;
            } else {
                // New item: add it to cart with quantity 1
                cart.push({ 
                    id: itemId, 
                    title: title, 
                    price: parseFloat(price), 
                    quantity: 1 
                });
            }
            
            // Save updated cart and update badge
            saveCart(cart);
            updateCartBadge();
            
            // VISUAL FEEDBACK: Change button to show success
            addButton.disabled = false;
            addButton.style.transform = 'scale(0.9)'; // Shrink slightly
            addButton.style.backgroundColor = 'var(--success-green)'; // Green background
            addButton.style.borderColor = 'var(--success-green)';
            addButton.style.color = 'var(--text-on-brand)';
            addButton.innerHTML = '<i class="fa-solid fa-check"></i>'; // Checkmark icon
            
            // After 1 second, reset button back to normal
            setTimeout(() => {
                addButton.style.transform = '';
                addButton.style.backgroundColor = '';
                addButton.style.borderColor = '';
                addButton.style.color = '';
                addButton.innerHTML = '<i class="fa-solid fa-plus"></i>'; // Plus icon
            }, 1000);
            
        } catch (error) {
            // Network error - handle optimistically (Requirements: 3.5)
            // Allow add to cart, backend will validate at checkout
            console.warn('Stock validation failed, proceeding optimistically:', error);
            
            // Get current cart
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
            
            // Reset button
            addButton.disabled = false;
            addButton.innerHTML = originalContent;
        }
    }

    /**
     * FUNCTION: handleSearch
     * 
     * PURPOSE: Filter food items based on user's search input
     * 
     * PARAMETERS:
     * @param {Event} e - The input event from search bar
     * 
     * HOW IT WORKS:
     * 1. Gets search text and converts to lowercase for case-insensitive search
     * 2. If search is empty, shows normal category view
     * 3. Otherwise, searches through ALL categories for matching items
     * 4. Displays only items that match the search term
     * 
     * LEARNING NOTE:
     * This is a "global search" - it searches across all categories at once,
     * not just the currently selected category.
     */
    function handleSearch(e) {
        // Get search text, convert to lowercase, remove extra spaces
        const searchTerm = e.target.value.toLowerCase().trim();

        // If search bar is empty, go back to normal category view
        if (searchTerm === '') {
            renderProducts(currentCategory);
            return;
        }

        /**
         * SEARCH LOGIC: Find all items that match the search term
         * 
         * IMPROVEMENT: Include category information with each item
         * This helps users understand which category the item belongs to
         */
        const matchedItems = [];
        
        // Loop through every category
        menuData.categories.forEach(category => {
            // Loop through every item in this category
            category.items.forEach(item => {
                // Check if item name contains the search term
                // .includes() checks if one string contains another
                if (item.name.toLowerCase().includes(searchTerm)) {
                    // Add item with category information
                    matchedItems.push({
                        ...item, // Spread operator: copies all item properties
                        categoryName: category.category, // Add category name
                        categoryId: category.id // Add category ID
                    });
                }
            });
        });

        // Hide category title and category buttons during search
        productListTitle.style.display = 'none';
        categoriesContainer.style.display = 'none';

        // Clear the products grid
        productsGrid.innerHTML = '';
        
        if (matchedItems.length > 0) {
            // Display all matching items
            matchedItems.forEach((item, index) => {
                const card = document.createElement('div');
                card.className = 'product-card';
                
                // Add out-of-stock class if item is unavailable
                if (!item.is_available) {
                    card.classList.add('out-of-stock');
                }
                
                /**
                 * STAGGER ANIMATION FOR SEARCH RESULTS (OPTIMIZED)
                 * Same optimization as category view:
                 * - 30ms delay (faster than 50ms)
                 * - Capped at 300ms (10 items)
                 */
                const delay = Math.min(index * 30, 300);
                card.style.animationDelay = `${delay}ms`;
                
                /**
                 * SEARCH RESULT CARD WITH CATEGORY BADGE
                 * Shows which category the item belongs to
                 * Helps users understand context when searching
                 */
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
            // No results found - show message
            productsGrid.innerHTML = `<p style="text-align: center; color: var(--text-secondary);">No items found for "${searchTerm}"</p>`;
        }
    }

    // ========================================
    // SECTION 7: INITIALIZATION
    // ========================================
    
    /**
     * FUNCTION: init
     * 
     * PURPOSE: Set up the page when it first loads
     * 
     * HOW IT WORKS:
     * 1. Waits for config to load from backend
     * 2. Sets up authentication/protected routes
     * 3. Personalizes header with user name
     * 4. Shows random tagline
     * 5. Renders categories and products
     * 6. Updates cart badge
     * 7. Attaches event listeners for user interactions
     * 
     * LEARNING NOTE:
     * This is called the "initialization function" - it runs once when
     * the page loads and sets everything up.
     */
    async function init() {
        // Wait for config to load from backend API
        await window.waitForConfig();
        
        // Get Supabase client from centralized config
        supabase = window.getSupabaseClient();
        
        if (!supabase) {
            console.error('❌ Supabase client not initialized');
            showToast('Failed to connect to database. Please refresh.', 'error');
            return;
        }
        
        // Initialize StockValidator with Supabase client (Requirements: 3.3)
        // NOTE: No Realtime subscription is created (Requirements: 3.2)
        if (typeof StockValidator !== 'undefined') {
            StockValidator.init(supabase);
            console.log('✅ StockValidator initialized for lazy stock validation');
        }
        
        // Set up authentication
        setupProtectedRoutes();
        personalizeHeader();

        // Pick a random tagline from the array
        // Math.random() gives 0-1, multiply by array length, floor to get integer
        const randomTagline = taglines[Math.floor(Math.random() * taglines.length)];
        greetingTaglineEl.textContent = randomTagline;
        
        // Fetch menu items from Supabase
        await fetchMenuItems();
        
        // Set current category to first available category
        if (menuData.categories.length > 0) {
            currentCategory = menuData.categories[0].id;
        }
        
        // Render initial UI
        renderCategories();
        renderProducts(currentCategory);
        updateCartBadge();
        
        // ATTACH EVENT LISTENERS
        // These make the page interactive by listening for user actions
        categoriesContainer.addEventListener('click', handleCategoryClick); // Category button clicks
        productsGrid.addEventListener('click', handleAddToCart); // Add to cart button clicks
        searchInput.addEventListener('input', handleSearch); // Search bar typing
        
        // Promo card CTA handler
        setupPromoCardHandler();
    }
    
    // ========================================
    // SECTION 8: PROMO CARD HANDLER
    // ========================================
    
    /**
     * FUNCTION: setupPromoCardHandler
     * 
     * PURPOSE: Handle promo card "Order Now" button click
     * 
     * HOW IT WORKS:
     * 1. Listens for promo card CTA click
     * 2. Automatically selects Chinese category (noodles)
     * 3. Scrolls smoothly to categories section
     * 
     * LEARNING NOTE:
     * This creates a seamless user experience from promo to ordering
     */
    function setupPromoCardHandler() {
        const promoCta = document.getElementById('promo-cta');
        
        if (promoCta) {
            promoCta.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent default anchor behavior
                
                // Select Chinese category (noodles)
                const chineseCategory = 'chinese';
                
                // Update current category
                currentCategory = chineseCategory;
                
                // Update active category button
                const allChips = categoriesContainer.querySelectorAll('.category-chip');
                allChips.forEach(chip => {
                    if (chip.dataset.categoryId === chineseCategory) {
                        chip.classList.add('active');
                    } else {
                        chip.classList.remove('active');
                    }
                });
                
                // Render products for Chinese category
                renderProducts(chineseCategory);
                
                // Smooth scroll to categories section
                const categoriesSection = document.getElementById('categories-section');
                if (categoriesSection) {
                    categoriesSection.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
            });
        }
    }
    
    // ========================================
    // SECTION 9: CROSS-TAB SYNCHRONIZATION
    // ========================================
    
    /**
     * STORAGE EVENT LISTENER
     * 
     * PURPOSE: Update cart badge when cart changes in another tab/window
     * 
     * HOW IT WORKS:
     * - Browser fires 'storage' event when localStorage changes in another tab
     * - We listen for changes to 'spoon-cart' key
     * - Update badge immediately to reflect changes
     * 
     * LEARNING NOTE:
     * This enables real-time sync across multiple tabs/windows
     * User can have menu open in one tab and cart in another
     */
    window.addEventListener('storage', (e) => {
        // Only update if cart data changed
        if (e.key === 'spoon-cart') {
            updateCartBadge();
        }
    });
    
    // Start the app!
    init();
});
