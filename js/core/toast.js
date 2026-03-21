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

/**
 * FUNCTION: showAlertModal
 * 
 * Replaces native browser alert() with a customized Spoon DOM modal.
 * @param {string} title - The title of the alert
 * @param {string} message - The body message
 * @param {string} iconClass - FontAwesome class for the icon
 * @param {function} onDismiss - Callback after the modal closes
 */
function showAlertModal(title, message, iconClass = 'fa-circle-exclamation', onDismiss = null) {
  let overlay = document.getElementById('global-alert-overlay');
  let modal = document.getElementById('global-alert-modal');

  // Create the DOM elements if they don't exist
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-alert-overlay';
    overlay.className = 'modal-overlay hidden';
    overlay.style.zIndex = '10000';
    document.body.appendChild(overlay);

    modal = document.createElement('div');
    modal.id = 'global-alert-modal';
    modal.className = 'modal hidden';
    modal.style.textAlign = 'center';
    modal.style.padding = '32px 24px';
    modal.style.zIndex = '10001';

    modal.innerHTML = `
        <div style="font-size: 48px; color: var(--brand-color); margin-bottom: 16px;">
            <i id="global-alert-icon" class="fa-solid"></i>
        </div>
        <h2 id="global-alert-title" style="font-size: 20px; font-weight: 700; color: var(--text-primary); margin-bottom: 12px;"></h2>
        <p id="global-alert-message" style="font-size: 15px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 24px;"></p>
        <button class="btn--primary" id="btn-global-alert-ok" style="width: 100%;">Got it</button>
    `;
    document.body.appendChild(modal);

    const closeAlert = () => {
      overlay.classList.remove('visible');
      modal.classList.remove('visible');
      setTimeout(() => {
        overlay.classList.add('hidden');
        modal.classList.add('hidden');
        if (modal._onDismiss) modal._onDismiss();
      }, 300);
    };

    document.getElementById('btn-global-alert-ok').addEventListener('click', closeAlert);
    overlay.addEventListener('click', closeAlert);
  }

  // Update content
  document.getElementById('global-alert-title').textContent = title;
  document.getElementById('global-alert-message').textContent = message;
  document.getElementById('global-alert-icon').className = `fa-solid ${iconClass}`;
  modal._onDismiss = onDismiss;

  // Show
  overlay.classList.remove('hidden');
  modal.classList.remove('hidden');
  
  // Trigger reflow for CSS transition
  void overlay.offsetWidth;
  
  overlay.classList.add('visible');
  modal.classList.add('visible');
}

window.showAlertModal = showAlertModal;
