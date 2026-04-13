// server.js - Backend Node.js/Express avec Supabase (PERSISTANT !)
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

// ============ CONFIGURATION SUPABASE (PERSISTANTE) ============
const supabaseUrl = 'https://nuiohpzybysaqawdqvvl.supabase.co';
const supabaseKey = 'sb_publishable_02wVBCiyI9-1PV8SXY3Grw_9_dWF-fi';
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Connexion à Supabase établie');

// ============ INITIALISATION DES TABLES ============
async function initDatabase() {
    // Créer table users
    const { error: usersError } = await supabase.query(`
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
    `);
    
    if (usersError) console.log('⚠️ Table users:', usersError.message);
    else console.log('✅ Table users prête');

    // Créer table transactions
    const { error: transError } = await supabase.query(`
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            amount FLOAT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    if (transError) console.log('⚠️ Table transactions:', transError.message);
    else console.log('✅ Table transactions prête');

    // Créer table services
    const { error: servicesError } = await supabase.query(`
        CREATE TABLE IF NOT EXISTS services (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price FLOAT NOT NULL,
            commands TEXT,
            is_active INTEGER DEFAULT 1
        )
    `);
    
    if (servicesError) console.log('⚠️ Table services:', servicesError.message);
    else console.log('✅ Table services prête');

    // ============ CRÉER ADMIN PAR DÉFAUT ============
    const adminId = generateUserId();
    const hashedAdminPw = bcrypt.hashSync('Admin123', 10);
    
    const { data: existingAdmin } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'ADMIN')
        .single();
    
    if (!existingAdmin) {
        await supabase.from('users').insert([{
            user_id: adminId,
            username: 'ADMIN',
            password: hashedAdminPw,
            email: 'admin@palga.com',
            credit: 1000,
            is_admin: 1
        }]);
        console.log('✅ Admin créé:', adminId);
    }

    // ============ CRÉER UTILISATEUR DEMO ============
    const demoId = generateUserId();
    const hashedDemoPw = bcrypt.hashSync('Demo123', 10);
    
    const { data: existingDemo } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'DEMO')
        .single();
    
    if (!existingDemo) {
        await supabase.from('users').insert([{
            user_id: demoId,
            username: 'DEMO',
            password: hashedDemoPw,
            email: 'demo@palga.com',
            credit: 100,
            is_admin: 0
        }]);
        console.log('✅ Utilisateur DEMO créé:', demoId);
    }

    // ============ AJOUTER SERVICES PAR DÉFAUT ============
    const services = [
        ['FRP Bypass Standard', 'Déblocage compte Google', 10, '["adb shell am start -n com.google.android.gsf.login/", "adb shell content insert --uri content://settings/secure --bind name:s:user_setup_complete --bind value:s:1"]'],
        ['FRP Bypass Avancé', 'Pour Samsung/Huawei', 15, '["adb shell settings put global setup_wizard_has_run 1", "adb shell settings put secure user_setup_complete 1"]'],
        ['MDM Removal', 'Suppression MDM complet', 20, '["adb shell pm uninstall -k --user 0 com.android.mdm", "adb shell pm uninstall -k --user 0 com.samsung.android.knox"]'],
        ['Web Bypass', 'Ouverture du clavier d\'appel', 10, '["open_dialer"]']
    ];

    for (const service of services) {
        const { data: existing } = await supabase
            .from('services')
            .select('*')
            .eq('name', service[0])
            .single();
        
        if (!existing) {
            await supabase.from('services').insert([{
                name: service[0],
                description: service[1],
                price: service[2],
                commands: service[3]
            }]);
            console.log(`✅ Service ajouté: ${service[0]}`);
        }
    }
}

// Fonction utilitaire
function generateUserId() {
    return 'PALGA' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============ ROUTES API ============

// Inscription
app.post('/api/register', async (req, res) => {
    const { username, password, email, whatsapp } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    const user_id = generateUserId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const { error } = await supabase.from('users').insert([{
        user_id, username, password: hashedPassword, email, whatsapp, credit: 0
    }]);
    
    if (error) {
        if (error.message.includes('duplicate')) {
            return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
        }
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
        .single();
    
    if (error || !user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    
    // Mettre à jour last_login
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

// Vérifier crédits sans mot de passe (pour page web)
app.get('/api/user/:userId/credit', async (req, res) => {
    const { userId } = req.params;
    
    const { data: user, error } = await supabase
        .from('users')
        .select('user_id, username, credit')
        .or(`user_id.eq.${userId},username.eq.${userId}`)
        .single();
    
    if (error || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé', exists: false });
    }
    
    res.json({ exists: true, user_id: user.user_id, username: user.username, credit: user.credit });
});

// Obtenir infos utilisateur
app.get('/api/user/:userId', async (req, res) => {
    const { userId } = req.params;
    
    const { data: user, error } = await supabase
        .from('users')
        .select('user_id, username, email, whatsapp, credit, is_admin, created_at, last_login')
        .eq('user_id', userId)
        .single();
    
    if (error || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(user);
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
    res.json(services);
});

// Utiliser un service (FRP Bypass)
app.post('/api/service/frp-bypass', async (req, res) => {
    const { user_id, service_id } = req.body;
    
    // Récupérer le service
    const { data: service, error: serviceError } = await supabase
        .from('services')
        .select('*')
        .eq('id', service_id)
        .eq('is_active', 1)
        .single();
    
    if (serviceError || !service) {
        return res.status(404).json({ error: 'Service non trouvé' });
    }
    
    // Récupérer l'utilisateur
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('credit')
        .eq('user_id', user_id)
        .single();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (user.credit < service.price) {
        return res.status(400).json({ 
            error: `Crédits insuffisants! Besoin de ${service.price} crédits`,
            current_credit: user.credit
        });
    }
    
    // Débiter
    const newCredit = user.credit - service.price;
    await supabase.from('users').update({ credit: newCredit }).eq('user_id', user_id);
    
    // Enregistrer transaction
    await supabase.from('transactions').insert([{
        user_id, type: 'service', amount: service.price, description: service.name
    }]);
    
    // Récupérer les commandes
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
        service_name: service.name,
        message: `${service.name} effectué avec succès!`
    });
});

// Web Bypass (pour page web)
app.post('/api/service/web-bypass', async (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ error: 'user_id requis' });
    }
    
    // Récupérer l'utilisateur
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, credit')
        .or(`user_id.eq.${user_id},username.eq.${user_id}`)
        .single();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    if (user.credit < 10) {
        return res.status(400).json({ 
            error: `Crédits insuffisants! Besoin de 10 crédits, vous avez ${user.credit}`,
            current_credit: user.credit,
            success: false
        });
    }
    
    const newCredit = user.credit - 10;
    await supabase.from('users').update({ credit: newCredit }).eq('user_id', user.user_id);
    
    await supabase.from('transactions').insert([{
        user_id: user.user_id, type: 'service', amount: 10, description: 'Web Bypass - Ouverture clavier'
    }]);
    
    res.json({
        success: true,
        remaining_credit: newCredit,
        message: "Web Bypass effectué! Ouverture du clavier d'appel...",
        action: "open_dialer",
        intent_url: "tel:",
        fallback_intent: "intent://#Intent;scheme=tel;action=android.intent.action.DIAL;end"
    });
});

// Ajouter crédits (admin seulement)
app.post('/api/admin/add-credit', async (req, res) => {
    const { admin_id, user_id, amount, description } = req.body;
    
    // Vérifier si admin
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .single();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    // Récupérer l'utilisateur cible
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('credit')
        .eq('user_id', user_id)
        .single();
    
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

// Liste des utilisateurs (admin)
app.get('/api/admin/users', async (req, res) => {
    const { admin_id } = req.query;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .single();
    
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
    res.json(users);
});

// Statistiques (admin)
app.get('/api/admin/stats', async (req, res) => {
    const { admin_id } = req.query;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .single();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { count: total_users } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { data: creditSum } = await supabase.from('users').select('credit');
    const total_credit = creditSum?.reduce((sum, u) => sum + (u.credit || 0), 0) || 0;
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
    res.json(transactions);
});

// Route racine
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'PALGA TOOLS API',
        database: 'Supabase (PERSISTANT)',
        version: '1.0.0'
    });
});

// Initialiser et démarrer
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Serveur PALGA TOOLS démarré sur http://localhost:${PORT}`);
        console.log(`📡 API disponible sur http://localhost:${PORT}/api`);
        console.log(`💾 Base de données: Supabase (PERSISTANTE - pas de perte de données!)`);
    });
});
