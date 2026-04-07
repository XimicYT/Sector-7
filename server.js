require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Supabase Client
// Render will pull these from your Environment Variables dashboard
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: Supabase URL or Key is missing from Environment Variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ENDPOINT: Get Current Ship Status
// ==========================================
app.get('/api/ship-status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ship_status')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error fetching ship status:", err.message);
        res.status(500).json({ error: "Failed to retrieve ship status." });
    }
});

// ==========================================
// ENDPOINT: Submit Daily Action (Blind Commit)
// ==========================================
app.post('/api/submit-action', async (req, res) => {
    try {
        const { player_id, action_type, eu_invested, target_system } = req.body;
        
        // Basic validation
        if (!player_id || !action_type || !eu_invested) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        const { data, error } = await supabase
            .from('pending_actions')
            .insert([{ 
                player_id, 
                action_type, 
                eu_invested: parseInt(eu_invested), 
                target_system 
            }]);
        
        if (error) throw error;
        res.json({ message: "Action locked in for the current cycle." });
    } catch (err) {
        console.error("Error submitting action:", err.message);
        res.status(500).json({ error: "Failed to submit action." });
    }
});

// ==========================================
// ENDPOINT: Trigger Daily Resolution (The Engine)
// ==========================================
app.post('/admin/resolve-day', async (req, res) => {
    try {
        // 1. Fetch current ship state
        let { data: ship, error: shipError } = await supabase
            .from('ship_status')
            .select('*')
            .eq('id', 1)
            .single();

        if (shipError) throw shipError;
        
        if (ship.is_destroyed) {
            return res.status(400).json({ message: "Game Over. Ship is already destroyed." });
        }

        // 2. Fetch all pending actions for the day
        const { data: actions, error: actionsError } = await supabase
            .from('pending_actions')
            .select('*');

        if (actionsError) throw actionsError;

        // 3. Tally the repair investments
        let hullRepairs = 0;
        let lsRepairs = 0;
        let navRepairs = 0;

        actions.forEach(action => {
            if (action.action_type === 'repair') {
                if (action.target_system === 'hull') hullRepairs += action.eu_invested;
                if (action.target_system === 'life_support') lsRepairs += action.eu_invested;
                if (action.target_system === 'nav') navRepairs += action.eu_invested;
            }
        });

        // 4. Calculate new stats (Base decay is 15%, plus repairs, max out at 100)
        let newHull = Math.min(100, (ship.hull - 15) + hullRepairs);
        let newLS = Math.min(100, (ship.life_support - 15) + lsRepairs);
        let newNav = Math.min(100, (ship.nav - 15) + navRepairs);
        
        // 5. Check failure state
        let isDestroyed = (newHull <= 0 || newLS <= 0 || newNav <= 0);

        // 6. Push updated state to database
        const { error: updateError } = await supabase
            .from('ship_status')
            .update({
                hull: newHull,
                life_support: newLS,
                nav: newNav,
                current_day: ship.current_day + 1,
                is_destroyed: isDestroyed
            })
            .eq('id', 1);

        if (updateError) throw updateError;

        // 7. Clear the queue for the next day's actions
        const { error: deleteError } = await supabase
            .from('pending_actions')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all rows safely

        if (deleteError) throw deleteError;

        res.json({ 
            message: "Day resolved successfully. Moving to next cycle.", 
            newStats: { newHull, newLS, newNav, isDestroyed } 
        });

    } catch (err) {
        console.error("Error resolving day:", err.message);
        res.status(500).json({ error: "Failed to resolve the daily tick." });
    }
});

// Start the server (Render sets process.env.PORT automatically)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Sector 7 Engine running on port ${PORT}`);
});