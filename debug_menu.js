const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMenuAccess() {
    console.log('Testing public access to menu_items...');

    const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .limit(5);

    if (error) {
        console.error('❌ Error fetching menu items:', error);
    } else {
        console.log(`✅ Success! Fetched ${data.length} items.`);
        if (data.length > 0) {
            console.log('Sample item:', data[0].name);
        } else {
            console.warn('⚠️ Table is empty or RLS is blocking rows.');
        }
    }
}

testMenuAccess();
