// app.js - Version corrigée pour Render
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static('public'));

// ============ CONFIGURATION SUPABASE ============
const supabaseUrl = 'https://nuiohpzybysaqawdqvvl.supabase.co';
const supabaseKey = 'sb_publishable_02wVBCiyI9-1PV8SXY3Grw_9_dWF-fi';
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Connexion à Supabase établie');

// ============ FONCTION POUR CRÉER LES TABLES ============
async function initDatabase() {
    try {
        // 1. Créer table users
        const { error: usersError } = await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT UNIQUE NOT NULL,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    email TEXT,
                    whatsapp TEXT,
                    credit FLOAT DEFAULT 0,
                    is_admin INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            `
        });
        
        if (usersError) {
            // Si exec_sql n'existe pas, on crée les tables manuellement via l'API
            console.log('⚠️ Création des tables via l\'API REST...');
            await createTablesViaAPI();
        } else {
            console.log('✅ Tables créées via RPC');
        }
        
        // 2. Créer admin par défaut
        await createDefaultAdmin();
        
        // 3. Créer utilisateur démo
        await createDefaultDemo();
        
        // 4. Créer services
        await createDefaultServices();
        
    } catch (error) {
        console.error('❌ Erreur init:', error.message);
    }
}

async function createTablesViaAPI() {
    // Vérifier si la table users existe déjà
    const { data: tableExists, error } = await supabase
        .from('users')
        .select('count', { count: 'exact', head: true });
    
    if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('📦 Les tables n\'existent pas encore. Elles seront créées automatiquement lors de la première insertion.');
        console.log('💡 Ceci est normal pour un premier déploiement.');
    } else {
        console.log('✅ Tables déjà existantes');
    }
}

async function createDefaultAdmin() {
    const adminId = generateUserId();
    const hashedAdminPw = bcrypt.hashSync('Admin123', 10);
    
    // Vérifier si admin existe
    const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'administrateur')
        .maybeSingle();
    
    if (!existing) {
        const { error } = await supabase.from('users').insert([{
            user_id: adminId,
            username: 'administrateur',
            password: hashedAdminPw,
            email: 'admin@palga.com',
            credit: 1000,
            is_admin: 1
        }]);
        
        if (error) {
            console.log('⚠️ Erreur création admin:', error.message);
        } else {
            console.log('✅ Admin créé:', adminId);
        }
    } else {
        console.log('✅ Admin existe déjà');
    }
}

async function createDefaultDemo() {
    const demoId = generateUserId();
    const hashedDemoPw = bcrypt.hashSync('Demo123', 10);
    
    const { data: existing } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'DEMO')
        .maybeSingle();
    
    if (!existing) {
        const { error } = await supabase.from('users').insert([{
            user_id: demoId,
            username: 'DEMO',
            password: hashedDemoPw,
            email: 'demo@palga.com',
            credit: 100,
            is_admin: 0
        }]);
        
        if (error) {
            console.log('⚠️ Erreur création DEMO:', error.message);
        } else {
            console.log('✅ Utilisateur DEMO créé:', demoId);
        }
    } else {
        console.log('✅ Utilisateur DEMO existe déjà');
    }
}

async function createDefaultServices() {
    const services = [
        { name: 'FRP Bypass Standard', description: 'Déblocage compte Google', price: 10, commands: '["adb shell content insert --uri content://settings/secure --bind name:s:user_setup_complete --bind value:s:1"]', is_active: 1 },
        { name: 'FRP Bypass Avancé', description: 'Pour Samsung/Huawei', price: 15, commands: '["adb shell settings put global setup_wizard_has_run 1"]', is_active: 1 },
        { name: 'MDM Removal', description: 'Suppression MDM complet', price: 20, commands: '["adb shell pm uninstall -k --user 0 com.android.mdm"]', is_active: 0 },
        { name: 'Web Bypass', description: 'Ouverture du clavier d\'appel', price: 10, commands: '["open_dialer"]', is_active: 1 }
    ];
    
    for (const service of services) {
        const { data: existing } = await supabase
            .from('services')
            .select('*')
            .eq('name', service.name)
            .maybeSingle();
        
        if (!existing) {
            const { error } = await supabase.from('services').insert([service]);
            if (error) {
                console.log(`⚠️ Erreur création service ${service.name}:`, error.message);
            } else {
                console.log(`✅ Service ajouté: ${service.name}`);
            }
        }
    }
}

function generateUserId() {
    return 'PALGA' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============ ROUTES API ============

// Route racine
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'PALGA TOOLS API',
        database: 'Supabase',
        version: '1.0.0'
    });
});

// Inscription
app.post('/api/register', async (req, res) => {
    const { username, password, email, whatsapp } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    // Vérifier si username existe déjà
    const { data: existing } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .maybeSingle();
    
    if (existing) {
        return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
    }
    
    const user_id = generateUserId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const { error } = await supabase.from('users').insert([{
        user_id, username, password: hashedPassword, email, whatsapp, credit: 0
    }]);
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    
    res.json({ success: true, user_id, username, message: 'Compte créé avec succès!' });
});

// Connexion
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .or(`username.eq.${identifier},user_id.eq.${identifier}`)
        .maybeSingle();
    
    if (error || !user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', user.user_id);
    
    res.json({
        success: true,
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        whatsapp: user.whatsapp,
        credit: user.credit,
        is_admin: user.is_admin
    });
});

// Vérifier crédits (pour page web)
app.get('/api/user/:userId/credit', async (req, res) => {
    const { userId } = req.params;
    
    const { data: user, error } = await supabase
        .from('users')
        .select('user_id, username, credit')
        .or(`user_id.eq.${userId},username.eq.${userId}`)
        .maybeSingle();
    
    if (error || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé', exists: false });
    }
    
    res.json({ exists: true, user_id: user.user_id, username: user.username, credit: user.credit });
});

// Obtenir services
app.get('/api/services', async (req, res) => {
    const { data: services, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', 1);
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(services || []);
});

// FRP Bypass
app.post('/api/service/frp-bypass', async (req, res) => {
    const { user_id, service_id } = req.body;
    
    const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('id', service_id)
        .eq('is_active', 1)
        .maybeSingle();
    
    if (serviceError || !service) {
        return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('credit')
        .eq('user_id', user_id)
        .maybeSingle();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (user.credit < service.price) {
        return res.status(400).json({ 
            error: `Crédits insuffisants! Besoin de ${service.price} crédits`,
            current_credit: user.credit
        });
    }
    
    const newCredit = user.credit - service.price;
    
    await supabase.from('users').update({ credit: newCredit }).eq('user_id', user_id);
    
    await supabase.from('transactions').insert([{
        user_id, type: 'service', amount: service.price, description: service.name
    }]);
    
    let commands = [];
    try {
        commands = JSON.parse(service.commands);
    } catch(e) {
        commands = [service.commands];
    }
    
    res.json({
        success: true,
        remaining_credit: newCredit,
        commands: commands,
        service_name: service.name
    });
});

// Web Bypass
app.post('/api/service/web-bypass', async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ error: 'user_id requis' });
    }
    
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, credit')
        .or(`user_id.eq.${user_id},username.eq.${user_id}`)
        .maybeSingle();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (user.credit < 10) {
        return res.status(400).json({ 
            error: `Crédits insuffisants! Besoin de 10 crédits, vous avez ${user.credit}`,
            current_credit: user.credit
        });
    }
    
    const newCredit = user.credit - 10;
    await supabase.from('users').update({ credit: newCredit }).eq('user_id', user.user_id);
    
    await supabase.from('transactions').insert([{
        user_id: user.user_id, type: 'service', amount: 10, description: 'Web Bypass'
    }]);
    
    res.json({
        success: true,
        remaining_credit: newCredit,
        message: "Web Bypass effectué!",
        action: "open_dialer",
        intent_url: "tel:"
    });
});

// Admin: Liste utilisateurs
app.get('/api/admin/users', async (req, res) => {
    const { admin_id } = req.query;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .maybeSingle();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, username, email, whatsapp, credit, is_admin, created_at, last_login')
        .order('created_at', { ascending: false });
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(users || []);
});

// Admin: Ajouter crédits
app.post('/api/admin/add-credit', async (req, res) => {
    const { admin_id, user_id, amount, description } = req.body;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .maybeSingle();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('credit')
        .eq('user_id', user_id)
        .maybeSingle();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    const newCredit = user.credit + amount;
    await supabase.from('users').update({ credit: newCredit }).eq('user_id', user_id);
    
    await supabase.from('transactions').insert([{
        user_id, type: 'admin_credit', amount, description: description || 'Ajout par admin'
    }]);
    
    res.json({ success: true, new_credit: newCredit });
});

// Admin: Statistiques
app.get('/api/admin/stats', async (req, res) => {
    const { admin_id } = req.query;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .maybeSingle();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { count: total_users } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { data: creditData } = await supabase.from('users').select('credit');
    const total_credit = creditData?.reduce((sum, u) => sum + (u.credit || 0), 0) || 0;
    const { count: total_transactions } = await supabase.from('transactions').select('*', { count: 'exact', head: true });
    const { count: services_used } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'service');
    
    res.json({
        total_users: total_users || 0,
        total_credit: total_credit,
        total_transactions: total_transactions || 0,
        services_used: services_used || 0
    });
});

// Historique utilisateur
app.get('/api/user/:userId/transactions', async (req, res) => {
    const { userId } = req.params;
    
    const { data: transactions, error } = await supabase
        .from('transactions')
        .select('type, amount, description, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(transactions || []);
});

// Démarrer le serveur
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur PALGA TOOLS démarré sur http://localhost:${PORT}`);
        console.log(`📡 API disponible sur http://localhost:${PORT}/api`);
        console.log(`💾 Base de données: Supabase (PERSISTANTE)`);
    });
}).catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    // Même si l'init échoue, on démarre le serveur
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    });
});
