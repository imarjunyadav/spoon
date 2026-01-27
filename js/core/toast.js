/**
 * TOAST NOTIFICATION UTILITY
 * 
 * PURPOSE: Show user-friendly toast messages for success, error, and info
 * 
 * USAGE:
 * showToast('Item added to cart', 'success');
 * showToast('Failed to save order', 'error');
 * showToast('Loading...', 'info');
 */

/**
 * FUNCTION: showToast
 * 
 * @param {string} message - The message to display
 * @param {string} type - Type of toast: 'success', 'error', or 'info'
 * @param {number} duration - How long to show toast (milliseconds)
 */
function showToast(message, type = 'info', duration = 3000) {
  // Remove any existing toasts
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  
  // Add icon based on type
  let icon = '';
  switch(type) {
    case 'success':
      icon = '<i class="fa-solid fa-circle-check"></i>';
      break;
    case 'error':
      icon = '<i class="fa-solid fa-circle-xmark"></i>';
      break;
    case 'info':
      icon = '<i class="fa-solid fa-circle-info"></i>';
      break;
  }
  
  toast.innerHTML = `
    ${icon}
    <span class="toast-message">${message}</span>
  `;
  
  // Add to page
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto-hide after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Make it globally available
window.showToast = showToast;
