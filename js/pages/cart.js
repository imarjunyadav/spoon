/**
 * Spoon - Cart Page Script
 * 
 * Manages the shopping cart, checkout process, and payment integration.
 * - Displays items and quantities.
 * - Handles quantity updates.
 * - Manages pre-order time selection.
 * - Processes payments via Razorpay OR Spoon Wallet.
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- Authentication Check ---
  if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
    window.location.replace('login.html');
    return;
  }

  // --- Supabase Client ---
  let supabase = null;

  // --- DOM Elements ---
  const cartItemsContainer = document.getElementById('cart-items-container');
  const checkoutBtn = document.getElementById('checkout-btn');
  const finalConfirmBtn = document.querySelector('#confirm-order-modal .btn--primary');
  const emptyCartView = document.getElementById('empty-cart-view');
  const cartSummaryFooter = document.getElementById('cart-summary-footer');
  const subtotalValueEl = document.getElementById('subtotal-value');
  const cartBadge = document.getElementById('cart-badge');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalOverlaySecondary = document.getElementById('modal-overlay-secondary');
  const confirmOrderModal = document.getElementById('confirm-order-modal');
  const modalOrderSummary = document.getElementById('modal-order-summary');
  const modalTotalValue = document.getElementById('modal-total-value');
  const userPhoneNumber = localStorage.getItem("spoon-user-phone");

  // Pre-order elements
  const preorderBtn = document.getElementById('preorder-btn');
  const preorderModal = document.getElementById('preorder-modal');
  const confirmPreorderBtn = document.getElementById('confirm-preorder-btn');
  const closePreorderBtn = document.getElementById('close-preorder-modal-btn');

  // Payment Method Elements
  const paymentOptions = document.querySelectorAll('input[name="payment-method"]');
  const optRazorpayLabel = document.getElementById('opt-razorpay-label');
  const optWalletLabel = document.getElementById('opt-wallet-label');
  const walletBalanceDisplay = document.getElementById('wallet-balance-display');
  const walletErrorMsg = document.getElementById('wallet-error-msg');


  // --- State Variables ---
  let selectedPreOrderTime = null;
  let walletBalance = 0;
  let selectedPaymentMethod = 'razorpay'; // 'razorpay' or 'wallet'

  // --- Cart Helper Functions ---

  /**
   * Get cart data from localStorage.
   * @returns {Array} Cart items.
   */
  function getCart() {
    return JSON.parse(localStorage.getItem('spoon-cart')) || [];
  }

  /**
   * Save cart data to localStorage.
   * @param {Array} cartData 
   */
  function saveCart(cartData) {
    localStorage.setItem('spoon-cart', JSON.stringify(cartData));
    updateCartBadge();
  }

  /**
   * Update cart badge count.
   */
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

  /**
   * Calculate cart total.
   */
  function getCartTotal() {
    const cart = getCart();
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  // --- UI Rendering Functions ---

  /**
   * Render all items in the cart.
   */
  function renderCart() {
    const cartData = getCart();

    if (cartData.length === 0) {
      cartItemsContainer.classList.add('hidden');
      cartSummaryFooter.classList.add('hidden');
      emptyCartView.classList.remove('hidden');
      updateCartBadge();
      return;
    }

    cartItemsContainer.classList.remove('hidden');
    cartSummaryFooter.classList.remove('hidden');
    emptyCartView.classList.add('hidden');

    cartItemsContainer.innerHTML = '';
    let subtotal = 0;

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
      subtotal += item.price * item.quantity;
    });

    subtotalValueEl.textContent = `₹${subtotal}`;
    updateCartBadge();
  }

  // --- Wallet Logic ---

  /**
   * Fetch current user's wallet balance.
   */
  async function fetchWalletBalance() {
    const userEmail = getUserEmail();
    if (!userEmail) return;

    try {
      const sessionToken = localStorage.getItem('spoon-session-token');

      const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/wallet/balance?email=${encodeURIComponent(userEmail)}`, {
        headers: {
          'x-user-email': userEmail,
          'x-session-token': sessionToken
        }
      });
      const data = await res.json();

      if (data.success) {
        walletBalance = data.balance;

        // Update UI if element exists
        if (walletBalanceDisplay) {
          walletBalanceDisplay.textContent = `Balance: ₹${walletBalance}`;
        }
      } else {
        console.error('Failed to fetch wallet balance:', data.error);
        if (walletBalanceDisplay) walletBalanceDisplay.textContent = 'Balance: Error';
      }
    } catch (err) {
      console.error('Network error fetching wallet balance:', err);
      if (walletBalanceDisplay) walletBalanceDisplay.textContent = 'Balance: Offline';
    }
  }

  /**
   * Update payment method UI state based on balance and cart total.
   */
  function updatePaymentUI() {
    const cartTotal = getCartTotal();

    // Check if wallet has enough balance
    const hasEnoughBalance = walletBalance >= cartTotal;

    // Razorpay is always available
    optRazorpayLabel.classList.remove('disabled');

    // Wallet option state
    if (hasEnoughBalance) {
      optWalletLabel.classList.remove('disabled');
      walletErrorMsg.classList.add('hidden');
      optWalletLabel.querySelector('input').disabled = false;
    } else {
      optWalletLabel.classList.add('disabled');
      walletErrorMsg.classList.remove('hidden');
      optWalletLabel.querySelector('input').disabled = true;

      // If wallet was selected but now disabled, switch to Razorpay
      if (selectedPaymentMethod === 'wallet') {
        document.querySelector('input[value="razorpay"]').click();
      }
    }
  }

  function getUserEmail() {
    const userData = JSON.parse(localStorage.getItem("spoon-user") || "{}");
    return userData.email || localStorage.getItem("spoon-user-email");
  }


  // --- Event Handlers ---

  /**
   * Handle +/- quantity button clicks.
   * @param {Event} e 
   */
  function handleQuantityChange(e) {
    const button = e.target.closest('.quantity-stepper__btn');
    if (!button) return;

    const itemId = parseInt(button.dataset.id);
    const change = parseInt(button.dataset.change);

    let cart = getCart();
    const itemIndex = cart.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;

    cart[itemIndex].quantity += change;

    if (cart[itemIndex].quantity <= 0) {
      cart.splice(itemIndex, 1);
    }

    saveCart(cart);
    renderCart();
  }

  // --- Modal Functions ---

  function openModal(modalElement) {
    modalOverlay.classList.remove('hidden');
    modalElement.classList.remove('hidden');
    setTimeout(() => {
      modalOverlay.classList.add('visible');
      modalElement.classList.add('visible');
    }, 10);
  }

  function closeModal(modalElement) {
    modalOverlay.classList.remove('visible');
    modalElement.classList.remove('visible');
    setTimeout(() => {
      modalOverlay.classList.add('hidden');
      modalElement.classList.add('hidden');
    }, 300);
  }

  function openModalSecondary(modalElement) {
    modalOverlaySecondary.classList.remove('hidden');
    modalElement.classList.remove('hidden');
    setTimeout(() => {
      modalOverlaySecondary.classList.add('visible');
      modalElement.classList.add('visible');
    }, 10);
  }

  function closeModalSecondary(modalElement) {
    modalOverlaySecondary.classList.remove('visible');
    modalElement.classList.remove('visible');
    setTimeout(() => {
      modalOverlaySecondary.classList.add('hidden');
      modalElement.classList.add('hidden');
    }, 300);
  }

  /**
   * Populate the confirmation modal with item details.
   */
  function populateConfirmModal() {
    const cartData = getCart();
    modalOrderSummary.innerHTML = '';
    let subtotal = 0;

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

    // Update payment method UI when opening modal
    updatePaymentUI();
  }

  // --- Pre-order Time Picker ---

  function roundUpToNearest5Minutes(date) {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const remainder = minutes % 5;

    if (remainder !== 0) {
      rounded.setMinutes(minutes + (5 - remainder));
    }

    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return rounded;
  }

  function generateTimeSlots() {
    const now = new Date();
    const slots = [];

    const roundedNow = roundUpToNearest5Minutes(now);

    // Add 45 mins buffer
    const earliestTime = new Date(roundedNow);
    earliestTime.setMinutes(earliestTime.getMinutes() + 45);

    // Closing time 6pm
    const closingTime = new Date(now);
    closingTime.setHours(18, 0, 0, 0);

    if (earliestTime >= closingTime) {
      return [];
    }

    let currentSlot = new Date(earliestTime);
    while (currentSlot <= closingTime) {
      const hours = currentSlot.getHours();
      const minutes = currentSlot.getMinutes();

      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const displayMinutes = minutes.toString().padStart(2, '0');
      const period = hours >= 12 ? 'PM' : 'AM';

      const displayText = `${displayHours}:${displayMinutes} ${period}`;

      slots.push({
        display: displayText,
        date: new Date(currentSlot),
        iso: currentSlot.toISOString()
      });

      currentSlot.setMinutes(currentSlot.getMinutes() + 5);
    }

    return slots;
  }

  function populateTimeChips() {
    const container = document.getElementById('time-chips-container');
    const wrapper = container.parentElement;
    const errorDiv = document.getElementById('time-picker-error');
    const confirmBtn = document.getElementById('confirm-preorder-btn');

    container.innerHTML = '';
    const slots = generateTimeSlots();

    if (slots.length === 0) {
      wrapper.classList.add('hidden');
      errorDiv.classList.remove('hidden');
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
      return;
    }

    wrapper.classList.remove('hidden');
    errorDiv.classList.add('hidden');
    confirmBtn.disabled = true;
    confirmBtn.style.opacity = '0.5';
    confirmBtn.style.cursor = 'not-allowed';

    slots.forEach((slot) => {
      const chip = document.createElement('button');
      chip.className = 'time-chip';
      chip.textContent = slot.display;
      chip.dataset.iso = slot.iso;
      chip.setAttribute('type', 'button');

      chip.addEventListener('click', () => {
        document.querySelectorAll('.time-chip').forEach(btn => {
          btn.classList.remove('selected');
        });
        chip.classList.add('selected');
        selectedPreOrderTime = slot.iso;

        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.style.cursor = 'pointer';

        scrollToChip(chip);
      });

      container.appendChild(chip);
    });
  }

  function scrollToChip(chip) {
    const container = document.getElementById('time-chips-container');
    const chipLeft = chip.offsetLeft;
    const chipWidth = chip.offsetWidth;
    const containerWidth = container.offsetWidth;
    const scrollTo = chipLeft - (containerWidth / 2) + (chipWidth / 2);

    container.scrollTo({
      left: scrollTo,
      behavior: 'smooth'
    });
  }

  // --- Modal Event Listeners ---

  const closeConfirmModalBtn = document.getElementById('close-confirm-modal-btn');
  if (closeConfirmModalBtn) {
    closeConfirmModalBtn.addEventListener('click', () => {
      closeModal(confirmOrderModal);
    });
  }

  const cancelOrderBtn = document.getElementById('cancel-order-btn');
  if (cancelOrderBtn) {
    cancelOrderBtn.addEventListener('click', () => {
      closeModal(confirmOrderModal);
    });
  }

  modalOverlay.addEventListener('click', () => {
    if (confirmOrderModal.classList.contains('visible')) {
      closeModal(confirmOrderModal);
    }
    if (preorderModal.classList.contains('visible')) {
      closeModal(preorderModal);
    }
  });

  preorderBtn.addEventListener('click', () => {
    selectedPreOrderTime = null;
    populateTimeChips();
    openModalSecondary(preorderModal);
  });

  confirmPreorderBtn.addEventListener('click', () => {
    if (!selectedPreOrderTime) {
      showToast("Please select a pickup time", 'error');
      return;
    }

    closeModalSecondary(preorderModal);

    const selectedDate = new Date(selectedPreOrderTime);
    const hours = selectedDate.getHours();
    const minutes = selectedDate.getMinutes();
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    const displayMinutes = minutes.toString().padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';
    const formattedTime = `${displayHours}:${displayMinutes} ${period}`;

    const preorderBtnLabel = preorderBtn.querySelector('.preorder-btn__label strong');
    preorderBtnLabel.textContent = `Pickup at ${formattedTime}`;
    preorderBtn.classList.add('active');
  });

  if (closePreorderBtn) {
    closePreorderBtn.addEventListener('click', () => {
      closeModalSecondary(preorderModal);
    });
  }

  // --- Payment Method Selection Logic ---

  paymentOptions.forEach(option => {
    option.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedPaymentMethod = e.target.value;

        // Visual Update
        document.querySelectorAll('.payment-option').forEach(el => el.classList.remove('selected'));
        e.target.closest('.payment-option').classList.add('selected');
      }
    });
  });

  // --- Payment & Checkout ---

  /**
   * Final Order Confirmation Handler.
   * Processes payment using Razorpay OR Spoon Wallet.
   */
  finalConfirmBtn.addEventListener("click", async () => {
    if (finalConfirmBtn.disabled) return;

    const cart = getCart();
    if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    const subtotal = getCartTotal();

    // Safety Check
    if (typeof subtotal !== 'number' || subtotal <= 0 || isNaN(subtotal)) {
      alert("Invalid subtotal. Cannot proceed with payment.");
      return;
    }

    // Double check wallet balance
    if (selectedPaymentMethod === 'wallet' && walletBalance < subtotal) {
      alert('Insufficient wallet balance. Please select Online Payment.');
      return;
    }

    finalConfirmBtn.classList.add('loading');
    finalConfirmBtn.disabled = true;

    try {
      const userEmail = getUserEmail();
      if (!userEmail) {
        alert("Please log in again to place your order.");
        window.location.href = "login.html";
        return;
      }

      // --- BRANCH: WALLET PAYMENT ---
      if (selectedPaymentMethod === 'wallet') {
        const sessionToken = localStorage.getItem('spoon-session-token');
        const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/wallet/pay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': userEmail,
            'x-session-token': sessionToken
          },
          body: JSON.stringify({
            amount: subtotal,
            email: userEmail,
            items: cart,
            preorderTime: selectedPreOrderTime,
            phoneNumber: userPhoneNumber
          })
        });

        const result = await res.json();

        if (result.success) {
          // Success!
          localStorage.removeItem("spoon-cart");
          localStorage.removeItem("current_order_id");
          window.location.href = `order-status.html?id=${result.orderId}&payment_success=true`;
        } else {
          // Failure
          alert(`Wallet payment failed: ${result.error || 'Unknown error'}`);
          finalConfirmBtn.classList.remove('loading');
          finalConfirmBtn.disabled = false;
        }
        return;
      }


      // --- BRANCH: RAZORPAY PAYMENT ---

      // 1. Create Order on Backend
      const res = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/payment/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: subtotal,
          userEmail: userEmail,
          items: cart,
          preorderTime: selectedPreOrderTime,
          phoneNumber: userPhoneNumber
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.details?.error?.description || errorData.error || "Failed to create order";
        throw new Error(errorMessage);
      }

      const orderData = await res.json();

      // 2. Open Razorpay Checkout
      const options = {
        key: window.SPOON_CONFIG.RAZORPAY_KEY_ID,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "SPOON Canteen",
        description: "Payment for food order",
        order_id: orderData.id,
        handler: async function (response) {

          // 3. Verify Payment
          try {
            // Client-side verification for faster UX
            const verifyRes = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/payment/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              // Clear cart immediately
              localStorage.removeItem("spoon-cart");
              localStorage.removeItem("current_order_id");

              // Redirect to order status
              window.location.href = `order-status.html?id=${verifyData.orderId}&payment_success=true`;
            } else {
              alert(`Payment verification failed: ${verifyData.error}`);
              window.location.reload();
            }

          } catch (error) {
            console.error("Error verifying payment:", error);
            alert("Payment recorded, but verification failed. Please contact support if money was deducted.");
            window.location.reload();
          }
        },
        prefill: {
          name: JSON.parse(localStorage.getItem("spoon-user") || "{}").name || "",
          email: userEmail,
          contact: userPhoneNumber || ""
        },
        theme: {
          color: "#eb1700"
        },
        modal: {
          ondismiss: function () {
            finalConfirmBtn.classList.remove('loading');
            finalConfirmBtn.disabled = false;
          }
        }
      };

      const rzp1 = new Razorpay(options);
      rzp1.on('payment.failed', function (response) {
        alert("Payment Failed: " + response.error.description);
        finalConfirmBtn.classList.remove('loading');
        finalConfirmBtn.disabled = false;
      });
      rzp1.open();

    } catch (error) {
      console.error("Error creating order:", error);
      alert(error.message || "Failed to initiate payment. Please try again.");
      finalConfirmBtn.classList.remove('loading');
      finalConfirmBtn.disabled = false;
    }
  });

  // --- Initialization ---

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      populateConfirmModal();
      openModal(confirmOrderModal);
    });
  }

  cartItemsContainer.addEventListener('click', handleQuantityChange);

  // Wait for config then render & fetch balance
  window.waitForConfig().then(() => {
    supabase = window.getSupabaseClient();
    renderCart();
    fetchWalletBalance();
  });

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'spoon-cart') {
      updateCartBadge();
    }
  });

});
