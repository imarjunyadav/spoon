---
description: Step-by-step workflows for all security fixes
---

# 🔧 SECURITY FIXES - IMPLEMENTATION WORKFLOWS

---

## 🔴 FIX 1: Create payment_transactions Table

**Time:** 5 minutes  
**Risk:** Low (additive change)

### Files to Modify
- **None** - SQL only in Supabase

### Steps

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/mnvxojjbbiqmymlatigh/sql/new

2. **Copy Migration SQL**
   - Open: `backend/database/migrations/20260119_003_create_payment_transactions_table.sql`
   - Copy entire contents (123 lines)

3. **Execute in Supabase**
   - Paste into SQL Editor
   - Click "Run"
   - Wait for success message

4. **Verify Table Exists**
   ```sql
   SELECT * FROM payment_transactions LIMIT 1;
   ```

### Testing
- [ ] Navigate to Table Editor → `payment_transactions` exists
- [ ] Columns match migration (razorpay_payment_id, status, amount, etc.)
- [ ] Indexes created (check under Indexes tab)

---

## 🔴 FIX 2: Fix Orders RLS Policies

**Time:** 10 minutes  
**Risk:** Medium (removes access)

### Files to Modify
- **None** - SQL only in Supabase

### Steps

1. **Open Supabase SQL Editor**

2. **Drop Dangerous Policies**
   ```sql
   -- Run this FIRST
   DROP POLICY IF EXISTS "Allow public update orders" ON orders;
   DROP POLICY IF EXISTS "Allow public insert orders" ON orders;
   DROP POLICY IF EXISTS "Anyone can insert orders" ON orders;
   DROP POLICY IF EXISTS "Anyone can view orders" ON orders;
   DROP POLICY IF EXISTS "Allow admin to update orders" ON orders;
   DROP POLICY IF EXISTS "Allow logged-in admin to update orders" ON orders;
   ```

3. **Verify Only SELECT Remains**
   ```sql
   SELECT policyname, cmd, qual FROM pg_policies 
   WHERE tablename = 'orders';
   ```
   - Should show only: "Allow public read orders" with SELECT

### Testing
- [ ] Open browser console on frontend
- [ ] Try: `supabase.from('orders').update({status:'HACKED'}).eq('id','test')`
- [ ] Should FAIL with permission error
- [ ] Order tracking page still loads orders (SELECT works)

---

## 🔴 FIX 3: Remove Frontend Order Creation

**Time:** 15 minutes  
**Risk:** Medium (changes payment flow)

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `js/cart.js` | 793-826 | Replace handler function |

### Steps

1. **Open `js/cart.js`** (line 793)

2. **Replace lines 793-827 with:**
   ```javascript
   // STEP 3: Handler function called after successful payment
   handler: async function (response) {
     console.log('✅ Payment successful:', response.razorpay_payment_id);
     
     // Show success message
     showToast('Payment successful! Preparing your order...', 'success');
     
     // Clear cart immediately
     localStorage.removeItem("spoon-cart");
     
     // Redirect to orders page after short delay
     // Order will be created by backend webhook
     setTimeout(() => {
       window.location.href = "orders.html";
     }, 2000);
   },
   ```

3. **Save file**

### Testing
// turbo
1. Place a test order with real Razorpay test mode
2. Check: Cart cleared immediately after payment
3. Check: Redirected to orders.html
4. Check: Order appears in orders page (created by webhook)
5. Check: No duplicate orders in Supabase

### UI/UX Changes
- Add loading spinner on orders.html while waiting for webhook order
- Add "Order processing..." message if order not found immediately

---

## 🔴 FIX 4: Add Server-Side Price Validation

**Time:** 1 hour  
**Risk:** Low (adds validation)

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `backend/services/paymentFlowValidator.js` | 44-87 | Add price validation |

### Steps

1. **Open `backend/services/paymentFlowValidator.js`** (line 44)

2. **Insert after line 67 (after cart empty check):**
   ```javascript
   // ========================================
   // SERVER-SIDE PRICE VALIDATION (SECURITY FIX)
   // ========================================
   // Fetch actual prices from database
   const itemIds = items.map(item => item.id);
   const { data: dbItems, error: menuError } = await supabase
     .from('menu_items')
     .select('id, price, name, is_available')
     .in('id', itemIds);
   
   if (menuError || !dbItems) {
     return {
       valid: false,
       error: 'Failed to fetch menu items'
     };
   }
   
   // Calculate server-side total
   let serverTotal = 0;
   for (const cartItem of items) {
     const dbItem = dbItems.find(d => d.id === cartItem.id);
     
     if (!dbItem) {
       return {
         valid: false,
         error: `Item not found: ${cartItem.id}`
       };
     }
     
     if (!dbItem.is_available) {
       return {
         valid: false,
         error: `Item unavailable: ${dbItem.name}`
       };
     }
     
     serverTotal += dbItem.price * (cartItem.quantity || 1);
   }
   
   // Compare with client amount (amount is in paise, serverTotal in rupees)
   const clientAmountInRupees = amount / 100;
   if (Math.abs(serverTotal - clientAmountInRupees) > 0.01) {
     console.error('❌ Price mismatch detected!', {
       serverTotal,
       clientAmount: clientAmountInRupees,
       items
     });
     return {
       valid: false,
       error: 'Price mismatch detected. Please refresh and try again.'
     };
   }
   ```

3. **Save and restart server**
   ```bash
   # Ctrl+C to stop
   node server.js
   ```

### Testing
// turbo
1. **Normal flow:** Place order normally → Should succeed
2. **Tampered price:** 
   - Open DevTools → Network tab
   - Place order, find `/api/payment/create-order` request
   - Copy as fetch, modify `amount` to 100 (₹1)
   - Paste in console → Should return 400 "Price mismatch"

### UI/UX Changes
- Show "Price mismatch" error on checkout modal
- Add "Prices may have changed" refresh button

---

## 🔴 FIX 5: Add Order Status Endpoint Auth

**Time:** 30 minutes  
**Risk:** Medium (changes endpoint behavior)

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `backend/routes/orders.js` | 86-111 | Add auth middleware |

### Steps

1. **Open `backend/routes/orders.js`** (line 86)

2. **Add import at top of file (after existing requires):**
   ```javascript
   const adminService = require('../services/adminService');
   ```

3. **Insert after line 89 (after getting status from body):**
   ```javascript
   // ========================================
   // AUTHENTICATION CHECK (SECURITY FIX)
   // ========================================
   const authHeader = req.headers.authorization;
   if (!authHeader || !authHeader.startsWith('Bearer ')) {
     return res.status(401).json({
       success: false,
       error: 'Authentication required'
     });
   }
   
   const token = authHeader.slice(7);
   const tokenResult = await adminService.validateToken(token);
   
   if (tokenResult.error) {
     return res.status(401).json({
       success: false,
       error: 'Invalid or expired token'
     });
   }
   
   // Verify user is admin
   const adminResult = await adminService.isUserAdmin(tokenResult.user.email);
   if (!adminResult.isAdmin) {
     return res.status(403).json({
       success: false,
       error: 'Admin access required'
     });
   }
   
   console.log('✅ Admin authenticated:', tokenResult.user.email);
   ```

4. **Save and restart server**

### Testing
// turbo
1. **Without auth:** 
   ```bash
   curl -X PATCH http://localhost:7070/api/orders/test123/status \
     -H "Content-Type: application/json" \
     -d '{"status":"COMPLETE"}'
   ```
   → Should return 401

2. **With invalid token:**
   ```bash
   curl -X PATCH http://localhost:7070/api/orders/test123/status \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer invalid" \
     -d '{"status":"COMPLETE"}'
   ```
   → Should return 401

3. **From admin panel:** Update order → Should work

### UI/UX Changes
- None needed (admin panel already sends auth headers)

---

## 🟠 FIX 6: Add Status CHECK Constraint

**Time:** 10 minutes  
**Risk:** Low (only blocks invalid data)

### SQL to Execute
```sql
-- Add status constraint
ALTER TABLE orders ADD CONSTRAINT valid_status 
CHECK (status IN ('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP', 'CANCELLED'));

-- Add positive total constraint
ALTER TABLE orders ADD CONSTRAINT positive_total CHECK (total > 0);

-- Add unique payment ID constraint
ALTER TABLE orders ADD CONSTRAINT unique_razorpay_payment_id 
UNIQUE (razorpay_payment_id);
```

### Testing
```sql
-- Try inserting invalid status (should fail)
INSERT INTO orders (total, items, status) VALUES (100, '[]', 'INVALID');
-- ERROR: violates check constraint "valid_status"
```

---

## 🟠 FIX 7: Add CORS Whitelist

**Time:** 15 minutes

### Files to Modify
| File | Lines | Change |
|------|-------|--------|
| `backend/server.js` | 82 | Replace CORS config |

### Steps

1. **Open `backend/server.js`** (line 82)

2. **Replace `app.use(cors());` with:**
   ```javascript
   app.use(cors({
     origin: process.env.NODE_ENV === 'production' 
       ? [
           'https://spoon.tcetswb.org',
           'https://admin.spoon.tcetswb.org',
           process.env.FRONTEND_URL
         ].filter(Boolean)
       : true,
     credentials: true,
     methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization']
   }));
   ```

3. **Add to `.env`:**
   ```
   FRONTEND_URL=https://your-production-domain.com
   ```

---

## 🟠 FIX 8: Add API Rate Limiting

**Time:** 1 hour

### Steps

// turbo
1. **Install package:**
   ```bash
   cd backend
   npm install express-rate-limit
   ```

2. **Add to `server.js` after imports:**
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   // Rate limiters
   const paymentLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 10, // 10 orders per 15 min
     message: { error: 'Too many payment requests. Try again later.' }
   });
   
   const apiLimiter = rateLimit({
     windowMs: 1 * 60 * 1000, // 1 minute
     max: 100, // 100 requests per minute
     message: { error: 'Too many requests. Slow down.' }
   });
   ```

3. **Apply to routes:**
   ```javascript
   app.use('/api/payment', paymentLimiter);
   app.use('/api', apiLimiter);
   ```

---

## 🟠 FIX 9: Add Missing Indexes

**Time:** 5 minutes

### SQL to Execute
```sql
-- Order status for admin filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Customer email for order history
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);

-- Menu category for menu filtering
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);

-- Available items partial index
CREATE INDEX IF NOT EXISTS idx_menu_items_available 
ON menu_items(is_available) WHERE is_available = true;
```

---

## 🎨 UI/UX IMPROVEMENTS

### Customer-Facing Pages

| Page | Improvement | Effort |
|------|-------------|--------|
| `cart.html` | Add "Processing payment..." overlay during Razorpay | 30 min |
| `orders.html` | Add auto-refresh every 30s while status is PENDING | 30 min |
| `orders.html` | Add "Order is being prepared" animation | 1 hour |
| `index.html` | Show "Out of Stock" badge on unavailable items | 30 min |
| All pages | Add toast notifications for errors | 1 hour |

### Admin Panel

| Page | Improvement | Effort |
|------|-------------|--------|
| `admin/index.html` | Add order count badges by status | 30 min |
| `admin/index.html` | Add sound notification for new orders | 1 hour |
| `admin/index.html` | Add "Mark All Ready" bulk action | 1 hour |
| `admin/index.html` | Add order search by phone/email | 1 hour |

### Quick Win: Order Processing Overlay

**File:** `js/cart.js`
**After payment starts (before Razorpay opens):**
```javascript
// Show processing overlay
document.body.insertAdjacentHTML('beforeend', `
  <div id="payment-overlay" style="
    position: fixed; inset: 0; 
    background: rgba(0,0,0,0.8); 
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; color: white; font-size: 1.5rem;
  ">
    <div style="text-align: center;">
      <div class="spinner" style="margin-bottom: 1rem;"></div>
      <p>Processing payment...</p>
      <p style="font-size: 0.875rem; opacity: 0.7;">Do not close this window</p>
    </div>
  </div>
`);
```

### Quick Win: Auto-Refresh Orders Page

**File:** `js/order.js` (or orders page script)
```javascript
// Auto-refresh if any order is PENDING
setInterval(() => {
  const hasPending = document.querySelector('[data-status="PENDING"]');
  if (hasPending) {
    loadOrders(); // Your existing load function
  }
}, 30000); // Every 30 seconds
```

---

## ✅ IMPLEMENTATION ORDER

1. **FIX 1** - Create payment_transactions table ✅
2. **FIX 2** - Fix RLS policies ✅
3. **FIX 6** - Add constraints (while in Supabase)
4. **FIX 9** - Add indexes (while in Supabase)
5. **FIX 3** - Remove frontend order creation
6. **FIX 4** - Add price validation
7. **FIX 5** - Add order status auth
8. **FIX 7** - Add CORS whitelist
9. **FIX 8** - Add rate limiting
10. **UI/UX** - Customer improvements
11. **UI/UX** - Admin improvements
