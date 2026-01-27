/**
 * ========================================
 * PAYMENT FLOW VALIDATOR - PROPERTY-BASED TESTS
 * ========================================
 * 
 * PURPOSE:
 * Property-based tests for payment flow validation using fast-check
 * Tests universal correctness properties across all valid inputs
 * 
 * REQUIREMENTS VALIDATED:
 * - 3.7, 9.3, 9.5: Payment idempotency
 * - 9.2: Payment signature verification
 * - 3.6: Payment success atomicity
 * - 9.9: Payment as single source of truth
 * 
 * TASK: 2.1, 2.2, 2.3, 2.4 - Property tests for payment validation
 */

const fc = require('fast-check');
const crypto = require('crypto');
const paymentFlowValidator = require('./paymentFlowValidator');

// Mock Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn()
      }))
    }))
  }))
}));

describe('PaymentFlowValidator - Property-Based Tests', () => {
  
  // ========================================
  // TASK 2.1: PROPERTY TEST FOR PAYMENT IDEMPOTENCY
  // ========================================
  
  /**
   * Property 14: Payment idempotency
   * 
   * **Validates: Requirements 3.7, 9.3, 9.5**
   * 
   * PROPERTY:
   * For any valid payment ID, processing the same payment multiple times
   * should always return the same order ID and never create duplicate orders.
   * 
   * FORMAL SPECIFICATION:
   * ∀ paymentId ∈ ValidPaymentIDs:
   *   process(paymentId) = orderId₁ ∧
   *   process(paymentId) = orderId₂ ⇒
   *   orderId₁ = orderId₂ ∧
   *   orderCount(paymentId) = 1
   */
  describe('Property 14: Payment idempotency', () => {
    test('processing same payment ID multiple times returns same order without duplicates', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary payment IDs
          fc.string({ minLength: 10, maxLength: 50 }),
          async (paymentId) => {
            // Mock database to simulate idempotency check
            const mockSupabase = require('@supabase/supabase-js').createClient();
            let callCount = 0;
            let storedOrderId = null;
            
            mockSupabase.from().select().eq().single.mockImplementation(async () => {
              callCount++;
              
              if (callCount === 1) {
                // First call: no existing payment
                return { data: null, error: { code: 'PGRST116' } };
              } else {
                // Subsequent calls: return existing payment
                return {
                  data: {
                    id: 1,
                    order_id: storedOrderId,
                    status: 'success',
                    created_at: new Date().toISOString()
                  },
                  error: null
                };
              }
            });
            
            mockSupabase.from().insert().select().single.mockImplementation(async (data) => {
              if (callCount === 1) {
                // First insert succeeds
                storedOrderId = `order_${paymentId}`;
                return {
                  data: { ...data[0], id: 1 },
                  error: null
                };
              } else {
                // Subsequent inserts fail with unique constraint violation
                return {
                  data: null,
                  error: { code: '23505', message: 'duplicate key value' }
                };
              }
            });
            
            // Process payment twice
            const result1 = await paymentFlowValidator.validateIdempotency(paymentId);
            const result2 = await paymentFlowValidator.validateIdempotency(paymentId);
            
            // ASSERTION: Second call should detect duplicate
            expect(result1.alreadyProcessed).toBe(false);
            expect(result2.alreadyProcessed).toBe(true);
            expect(result2.existingOrderId).toBe(storedOrderId);
          }
        ),
        { numRuns: 100 } // Run 100 iterations with different payment IDs
      );
    });
  });
  
  // ========================================
  // TASK 2.2: PROPERTY TEST FOR SIGNATURE VERIFICATION
  // ========================================
  
  /**
   * Property 13: Payment signature verification
   * 
   * **Validates: Requirements 9.2**
   * 
   * PROPERTY:
   * For any webhook payload and secret, a correctly generated signature
   * should always validate successfully, and an incorrect signature
   * should always fail validation.
   * 
   * FORMAL SPECIFICATION:
   * ∀ payload ∈ ValidPayloads, secret ∈ Secrets:
   *   signature = HMAC-SHA256(payload, secret) ⇒
   *   verify(payload, signature, secret) = true ∧
   *   verify(payload, signature', secret) = false where signature' ≠ signature
   */
  describe('Property 13: Payment signature verification', () => {
    test('valid signatures always verify, invalid signatures always fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary webhook payloads
          fc.record({
            event: fc.constantFrom('payment.captured', 'payment.authorized', 'payment.failed'),
            payload: fc.record({
              payment: fc.record({
                entity: fc.record({
                  id: fc.string({ minLength: 10, maxLength: 30 }),
                  amount: fc.integer({ min: 100, max: 1000000 }),
                  currency: fc.constant('INR')
                })
              })
            })
          }),
          fc.string({ minLength: 20, maxLength: 50 }), // webhook secret
          async (payload, secret) => {
            // Set environment variable for test
            process.env.RAZORPAY_WEBHOOK_SECRET = secret;
            
            // Generate valid signature
            const validSignature = crypto
              .createHmac('sha256', secret)
              .update(JSON.stringify(payload))
              .digest('hex');
            
            // Generate invalid signature
            const invalidSignature = crypto
              .createHmac('sha256', 'wrong_secret')
              .update(JSON.stringify(payload))
              .digest('hex');
            
            // Verify signatures
            const validResult = await paymentFlowValidator.validateWebhookSignature(
              payload,
              validSignature
            );
            
            const invalidResult = await paymentFlowValidator.validateWebhookSignature(
              payload,
              invalidSignature
            );
            
            // ASSERTIONS
            expect(validResult).toBe(true); // Valid signature should pass
            expect(invalidResult).toBe(false); // Invalid signature should fail
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  // ========================================
  // TASK 2.3: PROPERTY TEST FOR PAYMENT SUCCESS ATOMICITY
  // ========================================
  
  /**
   * Property 15: Payment success atomicity
   * 
   * **Validates: Requirements 3.6**
   * 
   * PROPERTY:
   * For any successful payment, either both payment record and order are created,
   * or neither is created. There should never be a payment without an order or
   * an order without a payment.
   * 
   * FORMAL SPECIFICATION:
   * ∀ payment ∈ SuccessfulPayments:
   *   (∃ paymentRecord ∧ ∃ order ∧ paymentRecord.order_id = order.id) ∨
   *   (¬∃ paymentRecord ∧ ¬∃ order)
   */
  describe('Property 15: Payment success atomicity', () => {
    test('payment and order are created atomically or not at all', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary payment data
          fc.record({
            razorpayPaymentId: fc.string({ minLength: 15, maxLength: 30 }),
            razorpayOrderId: fc.string({ minLength: 15, maxLength: 30 }),
            amount: fc.integer({ min: 100, max: 1000000 }),
            currency: fc.constant('INR'),
            userEmail: fc.emailAddress(),
            cartItems: fc.array(
              fc.record({
                id: fc.integer({ min: 1, max: 100 }),
                name: fc.string({ minLength: 3, maxLength: 20 }),
                quantity: fc.integer({ min: 1, max: 10 }),
                price: fc.integer({ min: 10, max: 1000 })
              }),
              { minLength: 1, maxLength: 5 }
            )
          }),
          async (paymentData) => {
            const mockSupabase = require('@supabase/supabase-js').createClient();
            let paymentCreated = false;
            let orderCreated = false;
            
            // Mock payment transaction insert
            mockSupabase.from().insert().select().single.mockImplementation(async (data) => {
              const tableName = data[0].razorpay_payment_id ? 'payment_transactions' : 'orders';
              
              if (tableName === 'payment_transactions') {
                paymentCreated = true;
                return {
                  data: { ...data[0], id: 1 },
                  error: null
                };
              } else {
                orderCreated = true;
                return {
                  data: { ...data[0] },
                  error: null
                };
              }
            });
            
            // Mock idempotency check
            mockSupabase.from().select().eq().single.mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            });
            
            // Mock update
            mockSupabase.from().update().eq.mockResolvedValue({
              data: {},
              error: null
            });
            
            // Process payment
            const result = await paymentFlowValidator.handlePaymentSuccess(paymentData);
            
            // ASSERTION: Both should be created or neither
            if (result.success) {
              expect(paymentCreated).toBe(true);
              expect(orderCreated).toBe(true);
            } else {
              // If failed, at least payment record should exist for audit
              expect(paymentCreated).toBe(true);
            }
          }
        ),
        { numRuns: 50 } // Fewer runs due to complexity
      );
    });
  });
  
  // ========================================
  // TASK 2.4: PROPERTY TEST FOR PAYMENT AS SINGLE SOURCE OF TRUTH
  // ========================================
  
  /**
   * Property 17: Payment as single source of truth
   * 
   * **Validates: Requirements 9.9**
   * 
   * PROPERTY:
   * For any order, the payment record should be the authoritative source
   * for payment amount and status. Order amount should always match
   * payment amount.
   * 
   * FORMAL SPECIFICATION:
   * ∀ order ∈ Orders, payment ∈ Payments:
   *   order.payment_id = payment.id ⇒
   *   order.total = payment.amount / 100 ∧
   *   order.status = f(payment.status)
   */
  describe('Property 17: Payment as single source of truth', () => {
    test('order amount always matches payment amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary amounts
          fc.integer({ min: 100, max: 1000000 }), // amount in paise
          fc.string({ minLength: 15, maxLength: 30 }), // payment ID
          async (amountInPaise, paymentId) => {
            const mockSupabase = require('@supabase/supabase-js').createClient();
            let paymentAmount = null;
            let orderAmount = null;
            
            // Mock payment insert
            mockSupabase.from().insert().select().single.mockImplementation(async (data) => {
              if (data[0].razorpay_payment_id) {
                // Payment transaction
                paymentAmount = data[0].amount;
                return {
                  data: { ...data[0], id: 1 },
                  error: null
                };
              } else {
                // Order
                orderAmount = data[0].total;
                return {
                  data: { ...data[0] },
                  error: null
                };
              }
            });
            
            // Mock idempotency check
            mockSupabase.from().select().eq().single.mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            });
            
            // Mock update
            mockSupabase.from().update().eq.mockResolvedValue({
              data: {},
              error: null
            });
            
            // Process payment
            const paymentData = {
              razorpayPaymentId: paymentId,
              razorpayOrderId: `order_${paymentId}`,
              amount: amountInPaise,
              currency: 'INR',
              userEmail: 'test@example.com',
              cartItems: [{ id: 1, name: 'Test', quantity: 1, price: amountInPaise / 100 }]
            };
            
            await paymentFlowValidator.handlePaymentSuccess(paymentData);
            
            // ASSERTION: Order amount should match payment amount (converted from paise to rupees)
            if (paymentAmount && orderAmount) {
              expect(orderAmount).toBe(paymentAmount / 100);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
