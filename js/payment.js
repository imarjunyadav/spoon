/**
 * SPOON REDESIGN - PAYMENT SUCCESS SCRIPT
 *
 * This script simulates the behavior of a payment gateway's success page.
 * - Reads amount and pre-order data from the URL.
 * - Displays payment details.
 * - Starts a countdown timer.
 * - Redirects to the order handler page with necessary parameters after the countdown.
 */
document.addEventListener('DOMContentLoaded', () => {
    const countdownText = document.getElementById('countdown-text');
    const paymentDateEl = document.getElementById('payment-date');
    const paymentAmountEl = document.getElementById('payment-amount');
    const paymentIdEl = document.getElementById('payment-id');

    const params = new URLSearchParams(window.location.search);
    const amount = params.get('amount');
    const preOrderTime = params.get('preOrderTime');

    // --- 1. Display Payment Details ---
    paymentAmountEl.textContent = `₹${amount}`;
    paymentDateEl.textContent = new Date().toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const fakePaymentId = `pay_${Math.random().toString(36).substr(2, 14)}`;
    paymentIdEl.textContent = fakePaymentId;

    // --- 2. Start Countdown ---
    let secondsLeft = 5;
    countdownText.textContent = `You will be redirected in ${secondsLeft} seconds`;

    const countdownInterval = setInterval(() => {
        secondsLeft--;
        countdownText.textContent = `You will be redirected in ${secondsLeft} seconds`;

        if (secondsLeft <= 0) {
            clearInterval(countdownInterval);

            // --- 3. Redirect to Order Handler ---
            let handlerUrl = `order-handler.html?payment_id=${fakePaymentId}&status=success`;
            if (preOrderTime) {
                handlerUrl += `&preOrderTime=${preOrderTime}`;
            }
            window.location.replace(handlerUrl);
        }
    }, 1000);
});
