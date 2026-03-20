const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAdminSession } = require('../middleware/sessionAuth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// GET /api/settings - Fetch all system settings
router.get('/', requireAdminSession, async (req, res) => {
  try {
    const { data: settings, error } = await supabase
      .from('system_settings')
      .select('key, value, updated_at')
      .order('key');

    if (error) throw error;
    res.json({ success: true, settings: settings || [] });
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/:key - Update a specific system setting
router.put('/:key', requireAdminSession, async (req, res) => {
  try {
    const { key } = req.params;
    let { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }
    value = String(value);

    // Specific validation for max_prepared_slots
    if (key === 'max_prepared_slots') {
      const parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue) || parsedValue < 1 || parsedValue > 100) {
        return res.status(400).json({ success: false, error: 'max_prepared_slots must be a number between 1 and 100' });
      }

      // Ensure we don't lower capacity below the current number of prepared items
      const { count, error: countErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'prepared');
        
      if (countErr) throw countErr;
      if (parsedValue < count) {
        return res.status(400).json({ 
          success: false, 
          error: `Cannot decrease max capacity to ${parsedValue}. There are currently ${count} prepared orders occupying slots. Please clear them first.` 
        });
      }
    }

    // Specific validation for no_show_timeout_minutes
    if (key === 'no_show_timeout_minutes') {
      const parsedValue = parseInt(value, 10);
      if (isNaN(parsedValue) || parsedValue < 1 || parsedValue > 300) {
         return res.status(400).json({ success: false, error: 'no_show_timeout_minutes must be a number between 1 and 300' });
      }
    }

    // Specific validation for is_break_time
    if (key === 'is_break_time') {
      if (value !== 'true' && value !== 'false') {
         return res.status(400).json({ success: false, error: 'is_break_time must be "true" or "false"' });
      }
    }

    const { data, error } = await supabase
      .from('system_settings')
      .update({ value })
      .eq('key', key)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Setting key not found' });

    res.json({ success: true, setting: data });
  } catch (error) {
    console.error(`Update setting ${req.params.key} error:`, error);
    res.status(500).json({ success: false, error: 'Failed to update setting' });
  }
});

module.exports = router;
