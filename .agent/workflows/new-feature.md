---
description: Add a new feature or page to the application
---

# Add New Feature

## Adding a New Page

### 1. Create HTML File
Create `public/newpage.html` with this template:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title - Spoon</title>
    <link rel="stylesheet" href="../css/your-styles.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.1.1/css/all.min.css">
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.4/dist/umd/supabase.min.js"></script>
</head>
<body>
    <!-- Content here -->
    <script src="../js/core/config.js"></script>
    <script src="../js/pages/newpage.js"></script>
</body>
</html>
```

### 2. Create JavaScript File
Create `js/pages/newpage.js`:
```javascript
document.addEventListener('DOMContentLoaded', async () => {
    // Auth check
    if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
        window.location.replace('login.html');
        return;
    }
    
    // Wait for config
    await window.waitForConfig();
    const supabase = window.getSupabaseClient();
    
    // Your logic here
});
```

### 3. Create CSS File (Optional)
Create `css/newpage.css` with your styles

### 4. Add Navigation Link
Update bottom nav in relevant HTML files if needed

## Adding a New API Endpoint

### 1. Create Route File
Create `backend/routes/newroute.js`:
```javascript
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
    res.json({ message: 'Hello' });
});

module.exports = router;
```

### 2. Register in server.js
Add to `backend/server.js`:
```javascript
const newRoutes = require('./routes/newroute');
app.use('/api/newroute', newRoutes);
```

### 3. Restart Server
Use `/server` workflow
