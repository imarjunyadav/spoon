/**
 * ========================================
 * SPOON - CART PAGE JAVASCRIPT
 * ========================================
 * 
 * PURPOSE:
 * This file manages the shopping cart where users review and checkout their order.
 * 
 * WHAT IT DOES:
 * 1. Shows all items in the cart with quantities
 * 2. Lets users increase/decrease item quantities
 * 3. Calculates and displays total price
 * 4. Handles pre-order time selection
 * 5. Processes payment through Razorpay gateway
 * 6. Saves order to database (Supabase)
 * 
 * KEY CONCEPTS FOR INTERNS:
 * - Supabase: Cloud database service (like Firebase)
 * - Razorpay: Payment gateway for processing payments
 * - Modal: Popup window for confirmations
 * - API calls: Communicating with backend server
 */

// Wait for page to load
document.addEventListener('DOMContentLoaded', () => {

  // ========================================
  // SECTION 1: AUTHENTICATION CHECK
  // ========================================

  /**
   * SECURITY CHECK
   * Only logged-in users can access cart page
   * If not logged in, redirect to login page immediately
   */
  if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
    window.location.replace('login.html');
    return; // Stop executing rest of the code
  }

  // ========================================
  // SECTION 2: SUPABASE DATABASE SETUP
  // ========================================

  /**
   * SUPABASE CLIENT
   * Uses centralized config from js/config.js
   * Config is loaded from backend API for security
   * 
   * LEARNING NOTE:
   * - Credentials are fetched from backend, not hardcoded
   * - This prevents exposing keys in source code
   */
  let supabase = null;

  // ========================================
  // SECTION 3: DOM ELEMENT REFERENCES
  // ========================================

  /**
   * Get references to all HTML elements we'll manipulate
   * Think of these as "handles" to grab specific parts of the page
   */
  const cartItemsContainer = document.getElementById('cart-items-container'); // Where cart items display
  const checkoutBtn = document.getElementById('checkout-btn'); // Checkout button
  const finalConfirmBtn = document.querySelector('#confirm-order-modal .btn--primary'); // Final confirm button in modal
  const emptyCartView = document.getElementById('empty-cart-view'); // "Cart is empty" message
  const cartSummaryFooter = document.getElementById('cart-summary-footer'); // Footer with total
  const subtotalValueEl = document.getElementById('subtotal-value'); // Total price display
  const cartBadge = document.getElementById('cart-badge'); // Cart count badge
  const modalOverlay = document.getElementById('modal-overlay'); // Dark background for modals
  const modalOverlaySecondary = document.getElementById('modal-overlay-secondary'); // Secondary overlay for nested modals
  const confirmOrderModal = document.getElementById('confirm-order-modal'); // Order confirmation modal
  const modalOrderSummary = document.getElementById('modal-order-summary'); // Order summary in modal
  const modalTotalValue = document.getElementById('modal-total-value'); // Total in modal
  const userPhoneNumber = localStorage.getItem("spoon-user-phone"); // User's phone number

  // Pre-order related elements
  const preorderBtn = document.getElementById('preorder-btn');
  const preorderModal = document.getElementById('preorder-modal');
  const confirmPreorderBtn = document.getElementById('confirm-preorder-btn');
  const closePreorderBtn = document.getElementById('close-preorder-modal-btn');

  // ========================================
  // SECTION 4: STATE VARIABLES
  // ========================================

  /**
   * Variables that track the current state of the cart
   */
  let selectedPreOrderTime = null; // Stores selected pre-order time (null = order now)

  // ========================================
  // SECTION 5: CART HELPER FUNCTIONS
  // ========================================

  /**
   * FUNCTION: getCart
   * 
   * PURPOSE: Get cart data from browser storage
   * RETURNS: Array of cart items
   */
  function getCart() {
    return JSON.parse(localStorage.getItem('spoon-cart')) || [];
  }

  /**
   * FUNCTION: saveCart
   * 
   * PURPOSE: Save cart data to browser storage
   * 
   * PARAMETERS:
   * @param {Array} cartData - Cart items to save
   */
  function saveCart(cartData) {
    localStorage.setItem('spoon-cart', JSON.stringify(cartData));
    updateCartBadge(); // Update badge whenever cart changes
  }

  /**
   * FUNCTION: updateCartBadge
   * 
   * PURPOSE: Update the red badge showing cart item count
   * 
   * HOW IT WORKS:
   * - Calculates total quantity of all items
   * - Shows badge if cart has items, hides if empty
   */
  function updateCartBadge() {
    const cart = getCart();

    // Sum up quantities of all items
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    if (totalItems > 0) {
      cartBadge.textContent = totalItems;
      cartBadge.classList.add('visible');
    } else {
      cartBadge.classList.remove('visible');
    }
  }

  // ========================================
  // SECTION 6: UI RENDERING FUNCTIONS
  // ========================================

  /**
   * FUNCTION: renderCart
   * 
   * PURPOSE: Display all items in the cart
   * 
   * HOW IT WORKS:
   * 1. Gets cart data from localStorage
   * 2. If empty, shows "empty cart" message
   * 3. Otherwise, creates a card for each item
   * 4. Calculates and displays subtotal
   */
  function renderCart() {
    const cartData = getCart();

    // Handle empty cart
    if (cartData.length === 0) {
      cartItemsContainer.classList.add('hidden');
      cartSummaryFooter.classList.add('hidden');
      emptyCartView.classList.remove('hidden');
      updateCartBadge();
      return;
    }

    // Show cart UI elements
    cartItemsContainer.classList.remove('hidden');
    cartSummaryFooter.classList.remove('hidden');
    emptyCartView.classList.add('hidden');

    // Clear existing items
    cartItemsContainer.innerHTML = '';

    let subtotal = 0; // Running total

    // Create a card for each cart item
    cartData.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'cart-item-card';
      itemElement.innerHTML = `
        <div class="cart-item-card__details">
          <h3 class="cart-item-card__title">${item.title}</h3>
          <p class="cart-item-card__price">₹${item.price}</p>
        </div>
        <div class="quantity-stepper">
          <button class="quantity-stepper__btn" data-id="${item.id}" data-change="-1">-</button>
          <span class="quantity-stepper__value">${item.quantity}</span>
          <button class="quantity-stepper__btn" data-id="${item.id}" data-change="1">+</button>
        </div>
      `;
      cartItemsContainer.appendChild(itemElement);

      // Add to subtotal
      subtotal += item.price * item.quantity;
    });

    // Display subtotal
    subtotalValueEl.textContent = `₹${subtotal}`;
    updateCartBadge();
  }

  // ========================================
  // SECTION 7: EVENT HANDLER FUNCTIONS
  // ========================================

  /**
   * FUNCTION: handleQuantityChange
   * 
   * PURPOSE: Handle +/- button clicks to change item quantity
   * 
   * PARAMETERS:
   * @param {Event} e - Click event
   * 
   * HOW IT WORKS:
   * 1. Finds which button was clicked
   * 2. Gets item ID and change amount (+1 or -1)
   * 3. Updates quantity in cart
   * 4. Removes item if quantity reaches 0
   * 5. Saves and re-renders cart
   */
  function handleQuantityChange(e) {
    // Find the +/- button that was clicked
    const button = e.target.closest('.quantity-stepper__btn');
    if (!button) return;

    // Get item ID and change amount from button's data attributes
    const itemId = parseInt(button.dataset.id);
    const change = parseInt(button.dataset.change); // Will be +1 or -1

    let cart = getCart();

    // Find this item in the cart
    const itemIndex = cart.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return; // Item not found

    // Update quantity
    cart[itemIndex].quantity += change;

    // Remove item if quantity is 0 or less
    if (cart[itemIndex].quantity <= 0) {
      cart.splice(itemIndex, 1); // Remove from array
    }

    // Save and re-render
    saveCart(cart);
    renderCart();
  }

  // ========================================
  // SECTION 8: MODAL FUNCTIONS
  // ========================================

  /**
   * FUNCTION: openModal
   * 
   * PURPOSE: Show a modal popup with smooth animation
   * 
   * PARAMETERS:
   * @param {HTMLElement} modalElement - The modal to show
   * 
   * HOW IT WORKS:
   * 1. Removes 'hidden' class immediately
   * 2. After 10ms, adds 'visible' class for fade-in animation
   */
  function openModal(modalElement) {
    modalOverlay.classList.remove('hidden');
    modalElement.classList.remove('hidden');

    // Small delay for smooth CSS transition
    setTimeout(() => {
      modalOverlay.classList.add('visible');
      modalElement.classList.add('visible');
    }, 10);
  }

  /**
   * FUNCTION: closeModal
   * 
   * PURPOSE: Hide a modal popup with smooth animation
   * 
   * PARAMETERS:
   * @param {HTMLElement} modalElement - The modal to hide
   * 
   * HOW IT WORKS:
   * 1. Removes 'visible' class for fade-out animation
   * 2. After 300ms (animation duration), adds 'hidden' class
   */
  function closeModal(modalElement) {
    modalOverlay.classList.remove('visible');
    modalElement.classList.remove('visible');

    // Wait for animation to finish before hiding
    setTimeout(() => {
      modalOverlay.classList.add('hidden');
      modalElement.classList.add('hidden');
    }, 300);
  }

  /**
   * FUNCTION: openModalSecondary
   * 
   * PURPOSE: Open a nested modal (e.g., pickup time over confirm order)
   * Uses secondary overlay to blur everything behind it
   * 
   * PARAMETERS:
   * @param {HTMLElement} modalElement - The modal to show
   * 
   * HOW IT WORKS:
   * 1. Removes 'hidden' class from secondary overlay and modal
   * 2. After 10ms, adds 'visible' class for fade-in animation
   */
  function openModalSecondary(modalElement) {
    modalOverlaySecondary.classList.remove('hidden');
    modalElement.classList.remove('hidden');

    // Small delay for smooth CSS transition
    setTimeout(() => {
      modalOverlaySecondary.classList.add('visible');
      modalElement.classList.add('visible');
    }, 10);
  }

  /**
   * FUNCTION: closeModalSecondary
   * 
   * PURPOSE: Hide a nested modal with smooth animation
   * 
   * PARAMETERS:
   * @param {HTMLElement} modalElement - The modal to hide
   * 
   * HOW IT WORKS:
   * 1. Removes 'visible' class for fade-out animation
   * 2. After 300ms (animation duration), adds 'hidden' class
   */
  function closeModalSecondary(modalElement) {
    modalOverlaySecondary.classList.remove('visible');
    modalElement.classList.remove('visible');

    // Wait for animation to finish before hiding
    setTimeout(() => {
      modalOverlaySecondary.classList.add('hidden');
      modalElement.classList.add('hidden');
    }, 300);
  }

  /**
   * FUNCTION: populateConfirmModal
   * 
   * PURPOSE: Fill the confirmation modal with order details
   * 
   * HOW IT WORKS:
   * 1. Gets cart data
   * 2. Creates a summary line for each item
   * 3. Calculates and displays total
   */
  function populateConfirmModal() {
    const cartData = getCart();
    modalOrderSummary.innerHTML = '';
    let subtotal = 0;

    // Create summary for each item
    cartData.forEach(item => {
      const summaryItem = document.createElement('div');
      summaryItem.className = 'order-summary-item';
      summaryItem.innerHTML = `
        <span class="order-summary-item__name">${item.title} (x${item.quantity})</span>
        <span class="order-summary-item__price">₹${item.price * item.quantity}</span>
      `;
      modalOrderSummary.appendChild(summaryItem);
      subtotal += item.price * item.quantity;
    });

    modalTotalValue.textContent = `₹${subtotal}`;
  }

  // ========================================
  // SECTION 9: PRE-ORDER TIME PICKER
  // ========================================

  /**
   * FUNCTION: roundUpToNearest5Minutes
   * 
   * PURPOSE: Round current time up to the nearest 5-minute interval
   * 
   * PARAMETERS:
   * @param {Date} date - The date to round
   * 
   * RETURNS: New Date object rounded up to nearest 5 minutes
   * 
   * EXAMPLES:
   * - 10:23 AM → 10:25 AM
   * - 10:28 AM → 10:30 AM
   * - 10:30 AM → 10:30 AM (already on 5-min mark)
   * 
   * HOW IT WORKS:
   * 1. Get current minutes
   * 2. Calculate remainder when divided by 5
   * 3. If remainder exists, add minutes to reach next 5-min mark
   */
  function roundUpToNearest5Minutes(date) {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const remainder = minutes % 5;

    if (remainder !== 0) {
      // Add minutes to reach next 5-minute mark
      rounded.setMinutes(minutes + (5 - remainder));
    }

    // Reset seconds and milliseconds
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);

    return rounded;
  }

  /**
   * FUNCTION: generateTimeSlots
   * 
   * PURPOSE: Generate all available time slots based on current time
   * 
   * RETURNS: Array of time slot objects with display text and Date object
   * 
   * BUSINESS RULES:
   * - Canteen hours: 8:00 AM to 6:00 PM
   * - Minimum lead time: 45 minutes from current time
   * - Time intervals: 5 minutes
   * 
   * HOW IT WORKS:
   * 1. Get current time and round up to nearest 5 minutes
   * 2. Add 45 minutes to get earliest available slot
   * 3. Generate slots from that time until 6:00 PM
   * 4. Format each slot in 12-hour format with AM/PM
   * 
   * EXAMPLE:
   * Current time: 10:23 AM
   * Rounded: 10:25 AM
   * Add 45 min: 11:10 AM
   * Slots: 11:10 AM, 11:15 AM, ..., 6:00 PM
   */
  function generateTimeSlots() {
    const now = new Date();
    const slots = [];

    // STEP 1: Round current time up to nearest 5 minutes
    const roundedNow = roundUpToNearest5Minutes(now);

    // STEP 2: Add 45 minutes for minimum lead time
    const earliestTime = new Date(roundedNow);
    earliestTime.setMinutes(earliestTime.getMinutes() + 45);

    // STEP 3: Set canteen closing time (6:00 PM today)
    const closingTime = new Date(now);
    closingTime.setHours(18, 0, 0, 0); // 6:00 PM

    // STEP 4: Check if earliest time is past closing time
    if (earliestTime >= closingTime) {
      return []; // No slots available today
    }

    // STEP 5: Generate time slots from earliest time to closing time
    let currentSlot = new Date(earliestTime);

    while (currentSlot <= closingTime) {
      // Format time in 12-hour format with AM/PM
      const hours = currentSlot.getHours();
      const minutes = currentSlot.getMinutes();

      // Convert to 12-hour format
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const displayMinutes = minutes.toString().padStart(2, '0');
      const period = hours >= 12 ? 'PM' : 'AM';

      const displayText = `${displayHours}:${displayMinutes} ${period}`;

      slots.push({
        display: displayText,
        date: new Date(currentSlot),
        iso: currentSlot.toISOString()
      });

      // Move to next 5-minute slot
      currentSlot.setMinutes(currentSlot.getMinutes() + 5);
    }

    return slots;
  }

  /**
   * FUNCTION: populateTimeChips
   * 
   * PURPOSE: Display time slots as horizontal scrolling chips
   * 
   * HOW IT WORKS:
   * 1. Generate available time slots
   * 2. If no slots available, show error message
   * 3. Otherwise, create a chip for each slot
   * 4. Add click handler to select time
   * 5. Auto-scroll to show selected chip
   * 
   * MOBILE OPTIMIZATION:
   * - Horizontal scroll for thumb-friendly navigation
   * - Large touch targets (44x44px minimum)
   * - Smooth scrolling with momentum
   * - Visual feedback on selection
   */
  function populateTimeChips() {
    const container = document.getElementById('time-chips-container');
    const wrapper = container.parentElement;
    const errorDiv = document.getElementById('time-picker-error');
    const confirmBtn = document.getElementById('confirm-preorder-btn');

    // Clear previous chips
    container.innerHTML = '';

    // Generate time slots
    const slots = generateTimeSlots();

    // Check if any slots are available
    if (slots.length === 0) {
      // Show error message, hide chips container
      wrapper.classList.add('hidden');
      errorDiv.classList.remove('hidden');
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      return;
    }

    // Show chips container, hide error
    wrapper.classList.remove('hidden');
    errorDiv.classList.add('hidden');

    // Initially disable confirm button until user selects a time
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.cursor = 'not-allowed';

    // Create chip for each time slot
    slots.forEach((slot, index) => {
      const chip = document.createElement('button');
      chip.className = 'time-chip';
      chip.textContent = slot.display;
      chip.dataset.iso = slot.iso;
      chip.setAttribute('type', 'button'); // Prevent form submission

      // Click handler to select this time
      chip.addEventListener('click', () => {
        // Remove 'selected' class from all chips
        document.querySelectorAll('.time-chip').forEach(btn => {
          btn.classList.remove('selected');
        });

        // Add 'selected' class to clicked chip
        chip.classList.add('selected');

        // Store selected time
        selectedPreOrderTime = slot.iso;

        // Enable confirm button now that user has selected a time
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';

        // Auto-scroll to center the selected chip
        scrollToChip(chip);
      });

      container.appendChild(chip);
    });
  }

  /**
   * FUNCTION: scrollToChip
   * 
   * PURPOSE: Smoothly scroll to center the selected chip
   * 
   * PARAMETERS:
   * @param {HTMLElement} chip - The chip element to scroll to
   * 
   * HOW IT WORKS:
   * 1. Calculate chip position relative to container
   * 2. Calculate center position
   * 3. Smoothly scroll to center the chip
   */
  function scrollToChip(chip) {
    const container = document.getElementById('time-chips-container');

    // Get chip position relative to container
    const chipLeft = chip.offsetLeft;
    const chipWidth = chip.offsetWidth;
    const containerWidth = container.offsetWidth;

    // Calculate scroll position to center the chip
    const scrollTo = chipLeft - (containerWidth / 2) + (chipWidth / 2);

    // Smooth scroll to position
    container.scrollTo({
      left: scrollTo,
      behavior: 'smooth'
    });
  }

  // ========================================
  // SECTION 10: MODAL EVENT LISTENERS
  // ========================================

  /**
   * EVENT: Close confirm order modal (X button)
   * Closes the order confirmation modal
   */
  const closeConfirmModalBtn = document.getElementById('close-confirm-modal-btn');
  if (closeConfirmModalBtn) {
    closeConfirmModalBtn.addEventListener('click', () => {
      closeModal(confirmOrderModal);
    });
  }

  /**
   * EVENT: Cancel order button
   * Closes the order confirmation modal
   */
  const cancelOrderBtn = document.getElementById('cancel-order-btn');
  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      closeModal(confirmOrderModal);
    });
  }

  /**
   * EVENT: Modal overlay click
   * Closes any open modal when clicking outside
   */
  modalOverlay.addEventListener('click', () => {
    // Close confirm order modal if open
    if (confirmOrderModal.classList.contains('visible')) {
      closeModal(confirmOrderModal);
    }
    // Close preorder modal if open
    if (preorderModal.classList.contains('visible')) {
      closeModal(preorderModal);
    }
  });

  /**
   * EVENT: Pre-order button click
   * Opens the time picker modal
   */
  preorderBtn.addEventListener('click', () => {
    // Reset selected time
    selectedPreOrderTime = null;

    // Generate and display time chips
    populateTimeChips();

    // Open modal with secondary overlay (blurs confirm order modal)
    openModalSecondary(preorderModal);
  });

  /**
   * EVENT: Confirm pre-order time button click
   * 
   * PURPOSE: Save selected time and update UI
   * 
   * VALIDATION:
   * - Ensures user has selected a time slot
   * - All business logic validation is done during slot generation
   */
  confirmPreorderBtn.addEventListener('click', () => {
    // Check if user selected a time
    if (!selectedPreOrderTime) {
      showToast("Please select a pickup time", 'error');
      return;
    }

    // Close modal with secondary overlay
    closeModalSecondary(preorderModal);

    // Parse selected time for display
    const selectedDate = new Date(selectedPreOrderTime);

    // Format time for display (e.g., "2:30 PM")
    const hours = selectedDate.getHours();
    const minutes = selectedDate.getMinutes();
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes.toString().padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedTime = `${displayHours}:${displayMinutes} ${period}`;

    // Update button to show selected time
    const preorderBtnLabel = preorderBtn.querySelector('.preorder-btn__label strong');
    preorderBtnLabel.textContent = `Pickup at ${formattedTime}`;
    preorderBtn.classList.add('active');
  });

  /**
   * EVENT: Close pre-order modal (X button)
   * Closes the time picker modal
   */
  if (closePreorderBtn) {
    closePreorderBtn.addEventListener('click', () => {
      closeModalSecondary(preorderModal);
    });
  }

  // ========================================
  // SECTION 11: PAYMENT & CHECKOUT
  // ========================================

  /**
   * FUNCTION: generateVerificationCode
   * 
   * PURPOSE: Generate a 4-character alphanumeric verification code
   * 
   * RETURNS: String with 4 random characters (e.g., "A3K9", "P7M2")
   * 
   * HOW IT WORKS:
   * - Uses uppercase letters (excluding I, O for clarity)
   * - Uses numbers 2-9 (excluding 0, 1 for clarity)
   * - Randomly selects 4 characters
   * 
   * LEARNING NOTE:
   * This code is used for order pickup verification at the canteen
   */
  function generateVerificationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * EVENT: Final confirm button click
   * 
   * PURPOSE: Process payment and create order
   * 
   * HOW IT WORKS:
   * 1. Validates cart and amount
   * 2. Calls backend to create Razorpay order
   * 3. Opens Razorpay payment gateway
   * 4. On success, saves order to Supabase database
   * 5. Clears cart and redirects to orders page
   * 
   * LEARNING NOTE:
   * This is an async function because it waits for API responses
   */
  finalConfirmBtn.addEventListener("click", async () => {
    // Prevent double clicks
    if (finalConfirmBtn.disabled) return;

    const cart = getCart();

    // Validate cart
    if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    // Calculate total
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Validate amount
    if (typeof subtotal !== 'number' || subtotal <= 0 || isNaN(subtotal)) {
      alert("Invalid subtotal. Cannot proceed with payment.");
      return;
    }

    // START LOADING STATE
    finalConfirmBtn.classList.add('loading');
    finalConfirmBtn.disabled = true;

    try {
      // Get user data for validation
      const userData = JSON.parse(localStorage.getItem("spoon-user") || "{}");
      let userEmail = userData.email;

      // Fallback: Check direct email key if not in user object
      if (!userEmail) {
        userEmail = localStorage.getItem("spoon-user-email");
      }

      // If still no email, user must log in
      if (!userEmail) {
        console.error("❌ No user email found in localStorage");
        alert("Please log in again to place your order.");
        window.location.href = "login.html";
        return;
      }

      // STEP 1: Create Razorpay order on backend
      const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: subtotal,
          userEmail: userEmail,
          phoneNumber: userPhoneNumber,
          items: cart,
          preorderTime: selectedPreOrderTime
        })
      });

      if (!res.ok) throw new Error("Server error during order creation");

      const order = await res.json();

      // STEP 2: Configure Razorpay payment options
      const options = {
        key: window.SPOON_CONFIG.RAZORPAY_KEY_ID, // Razorpay public key from config
        amount: order.amount, // Amount in paise (₹1 = 100 paise)
        currency: "INR",
        name: "SPOON",
        description: "Canteen Order",
        order_id: order.id,

        // STEP 3: Handler function called after successful payment
        // NOTE: Call verification endpoint to create order (works for localhost & prod)
        handler: async function (response) {
          console.log('✅ Payment successful:', response.razorpay_payment_id);

          try {
            // Call backend to verify payment and create order
            const verifyRes = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/payment/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();

            if (!verifyRes.ok) {
              throw new Error(verifyData.error || 'Payment verification failed');
            }

            console.log('✅ Order created successfully:', verifyData.orderId);

            // Show success message
            showToast('Order placed successfully! Redirecting...', 'success');

            // Clear cart immediately
            localStorage.removeItem("spoon-cart");

            // Redirect to orders page
            setTimeout(() => {
              window.location.href = "orders.html";
            }, 1000);

          } catch (error) {
            console.error('❌ Verification error:', error);
            showToast(`Order creation failed: ${error.message}`, 'error');
            // Re-enable button on verification failure so user can try again or contact support
            finalConfirmBtn.classList.remove('loading');
            finalConfirmBtn.disabled = false; // Re-enable for retry
          }
        },

        // Handle modal dismissal/failure
        modal: {
          ondismiss: function () {
            console.log('Payment modal closed');
            finalConfirmBtn.classList.remove('loading');
            finalConfirmBtn.disabled = false; // Re-enable for retry
          }
        },

        theme: { color: "#e53935" } // Brand color
      };

      // STEP 4: Open Razorpay payment gateway
      const rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        console.error('Payment Failed', response.error);
        alert("Payment failed: " + response.error.reason);
        alert("Payment failed: " + response.error.reason);
        finalConfirmBtn.classList.remove('loading');
        finalConfirmBtn.disabled = false; // Re-enable for retry
      });
      rzp.open();

    } catch (error) {
      alert("Payment setup failed. Try again.");
      console.error(error);
      console.error(error);
      finalConfirmBtn.classList.remove('loading');
      finalConfirmBtn.disabled = false; // Re-enable for retry
    }
  });

  // ========================================
  // SECTION 12: CART INTERACTION EVENT LISTENERS
  // ========================================

  /**
   * EVENT: Quantity change buttons (+/-)
   * Delegates to handleQuantityChange function
   */
  cartItemsContainer.addEventListener('click', handleQuantityChange);

  /**
   * EVENT: Checkout button click
   * Opens confirmation modal with order summary
   */
  checkoutBtn.addEventListener('click', () => {
    populateConfirmModal();
    openModal(confirmOrderModal);
  });

  // ========================================
  // SECTION 13: INITIALIZATION
  // ========================================

  /**
   * FUNCTION: init
   * 
   * PURPOSE: Initialize the cart page
   * Called once when page loads
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

    renderCart();
  }

  // ========================================
  // SECTION 14: CROSS-TAB SYNCHRONIZATION
  // ========================================

  /**
   * STORAGE EVENT LISTENER
   * 
   * PURPOSE: Update cart display when cart changes in another tab/window
   * 
   * HOW IT WORKS:
   * - Listens for localStorage changes from other tabs
   * - Re-renders cart when 'spoon-cart' changes
   * - Keeps all tabs in sync
   * 
   * LEARNING NOTE:
   * Storage events only fire in OTHER tabs, not the current one
   * That's why we also update immediately after cart operations
   */
  window.addEventListener('storage', (e) => {
    // Only update if cart data changed
    if (e.key === 'spoon-cart') {
      renderCart();
    }
  });

  // Start the app!
  init();
});
