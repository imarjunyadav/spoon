/**
 * Spoon - Stock Validator
 * 
 * Performs lazy stock validation for the customer menu.
 * Validates stock availability on add-to-cart action.
 * Note: Does not create Realtime subscriptions to preserve connection quotas.
 */

const StockValidator = {
  // Reference to Supabase client
  _supabase: null,

  /**
   * Initialize the stock validator.
   * @param {SupabaseClient} supabase - Initialized Supabase client.
   */
  init(supabase) {
    this._supabase = supabase;
  },

  /**
   * Check if an item is currently available.
   * @param {number} itemId - Menu item ID.
   * @returns {Promise<{available: boolean, item: Object|null, error: string|null}>}
   */
  async checkAvailability(itemId) {
    if (!this._supabase) {
      console.error('StockValidator: Supabase client not initialized');
      return { available: true, item: null, error: 'Client not initialized' };
    }

    try {
      const { data, error } = await this._supabase
        .from('menu_items')
        .select('id, name, is_available')
        .eq('id', itemId)
        .single();

      if (error) {
        console.error('StockValidator: Error checking availability:', error);
        // Return optimistic result on error
        return { available: true, item: null, error: error.message };
      }

      if (!data) {
        console.warn('StockValidator: Item not found:', itemId);
        return { available: false, item: null, error: 'Item not found' };
      }

      return {
        available: data.is_available,
        item: data,
        error: null
      };
    } catch (err) {
      console.error('StockValidator: Unexpected error:', err);
      return { available: true, item: null, error: err.message };
    }
  },

  /**
   * Update UI to show item as out of stock.
   * @param {number} itemId - Menu item ID.
   */
  markItemUnavailable(itemId) {
    // Find the product card containing this item
    const addButton = document.querySelector(`.product-card__add-btn[data-id="${itemId}"]`);
    if (!addButton) {
      console.warn('StockValidator: Could not find button for item:', itemId);
      return;
    }

    const productCard = addButton.closest('.product-card');
    if (!productCard) {
      console.warn('StockValidator: Could not find card for item:', itemId);
      return;
    }

    // Add out-of-stock class to card
    productCard.classList.add('out-of-stock');

    // Disable the add button
    addButton.disabled = true;
    addButton.classList.add('disabled');

    // Add "Out of Stock" label if not already present
    const infoDiv = productCard.querySelector('.product-card__info');
    if (infoDiv && !infoDiv.querySelector('.out-of-stock-label')) {
      const label = document.createElement('span');
      label.className = 'out-of-stock-label';
      label.textContent = 'Out of Stock';
      infoDiv.appendChild(label);
    }

    console.log(`📦 Item ${itemId} marked as unavailable`);
  },

  /**
   * Show user-friendly alert for out-of-stock item.
   * @param {string} itemName - Name of the item.
   */
  showOutOfStockAlert(itemName) {
    // Use the existing showToast function if available, otherwise use alert
    if (typeof showToast === 'function') {
      showToast(`"${itemName}" just went out of stock!`, 'error');
    } else {
      // Fallback to a simple notification
      const message = `Sorry! "${itemName}" just went out of stock.`;

      // Try to create a toast-like notification
      const existingToast = document.querySelector('.stock-alert-toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = 'stock-alert-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc3545;
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideUp 0.3s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);

      // Remove after 3 seconds
      setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    console.log(`🚫 Out of stock alert shown for: ${itemName}`);
  }
};

// Export for Node.js/testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StockValidator };
}
