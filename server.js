require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'super-secret-local-key'; // Add this to Render!

// Validation Schema
const actionSchema = z.object({
    player_id: z.string().uuid(),
    action_type: z.enum(['repair', 'hoard', 'audit']),
    target_system: z.enum(['hull', 'life_support', 'nav', 'none']),
    eu_invested: z.number().int().min(1).max(30)
});

// Middleware: Protect Admin Routes
const requireAdmin = (req, res, next) => {
    const key = req.headers['x-admin-key'];
    if (key !== ADMIN_SECRET) return res.status(403).json({ error: "Unauthorized." });
    next();
};

app.get('/api/ship-status', async (req, res) => {
    const { data, error } = await supabase.from('ship_status').select('*').eq('id', 1).single();
    if (error) return res.status(500).json({ error: "Database error." });
    res.json(data);
});

app.post('/api/submit-action', async (req, res) => {
    try {
        const validatedData = actionSchema.parse(req.body);
        
        const { error } = await supabase.from('pending_actions').insert([validatedData]);
        if (error) throw error;
        
        res.json({ message: "Action successfully encrypted and locked in." });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid action parameters.", details: err.errors });
        }
        res.status(500).json({ error: "Failed to submit action." });
    }
});

app.post('/admin/resolve-day', requireAdmin, async (req, res) => {
    try {
        let { data: ship } = await supabase.from('ship_status').select('*').eq('id', 1).single();
        if (ship.is_destroyed) return res.status(400).json({ message: "Ship is destroyed." });

        const { data: actions } = await supabase.from('pending_actions').select('*');

        let repairs = { hull: 0, life_support: 0, nav: 0 };
        
        // Tally actions
        actions.forEach(a => {
            if (a.action_type === 'repair' && repairs[a.target_system] !== undefined) {
                repairs[a.target_system] += a.eu_invested;
            }
        });

        // Calculate Stats (Base 20% decay for higher difficulty)
        let newHull = Math.min(100, (ship.hull - 20) + repairs.hull);
        let newLS = Math.min(100, (ship.life_support - 20) + repairs.life_support);
        let newNav = Math.min(100, (ship.nav - 20) + repairs.nav);
        
        let isDestroyed = (newHull <= 0 || newLS <= 0 || newNav <= 0);

        await supabase.from('ship_status').update({
            hull: newHull, life_support: newLS, nav: newNav,
            current_day: ship.current_day + 1, is_destroyed: isDestroyed
        }).eq('id', 1);

        await supabase.from('pending_actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        res.json({ message: "Cycle resolved.", newStats: { newHull, newLS, newNav, isDestroyed } });
    } catch (err) {
        res.status(500).json({ error: "Tick resolution failed." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Engine running on ${PORT}`));