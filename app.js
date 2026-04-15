// app.js - Version avec système de vérification des transactions
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

// ============ CRÉATION DES TABLES ============
async function initDatabase() {
    try {
        // Créer table users si elle n'existe pas
        const { error: createUsersError } = await supabase.rpc('exec_sql', {
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
                );
                
                CREATE TABLE IF NOT EXISTS services (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    price FLOAT NOT NULL,
                    commands TEXT,
                    is_active INTEGER DEFAULT 1
                );
                
                CREATE TABLE IF NOT EXISTS transactions (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    amount FLOAT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE TABLE IF NOT EXISTS recharge_transactions (
                    id SERIAL PRIMARY KEY,
                    transaction_id TEXT UNIQUE NOT NULL,
                    user_id TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    amount_requested INTEGER NOT NULL,
                    credits_amount INTEGER NOT NULL,
                    status TEXT DEFAULT 'pending',
                    transaction_message TEXT,
                    verified_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `
        });
        
        if (createUsersError) {
            console.log('⚠️ Note: Les tables seront créées via l\'API si nécessaire');
        } else {
            console.log('✅ Tables vérifiées/créées');
        }
        
        await createDefaultAdmin();
        await createDefaultDemo();
        await createDefaultServices();
        
    } catch (error) {
        console.error('❌ Erreur init:', error.message);
    }
}

async function createDefaultAdmin() {
    const adminId = generateUserId();
    const hashedAdminPw = bcrypt.hashSync('Admin123', 10);
    
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

// ============ FONCTION DE VÉRIFICATION DE TRANSACTION ============
function verifyTransactionMessage(message, requestedAmount, phoneNumber) {
    const errors = [];
    
    // 1. Vérifier que le message contient "Votre paiement"
    if (!message.includes('Votre paiement')) {
        errors.push('Message de confirmation invalide');
        return { valid: false, errors };
    }
    
    // 2. Vérifier le nom "ISSIAKA BOKOUM"
    if (!message.includes('ISSIAKA BOKOUM')) {
        errors.push('Nom du bénéficiaire incorrect');
        return { valid: false, errors };
    }
    
    // 3. Extraire le montant du message
    const amountMatch = message.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*FCFA/);
    let paidAmount = null;
    if (amountMatch) {
        paidAmount = parseFloat(amountMatch[1].replace(/[.,]/g, '')) / 100;
    }
    
    if (!paidAmount) {
        errors.push('Montant non trouvé dans le message');
        return { valid: false, errors };
    }
    
    // 4. Vérifier que le montant correspond (10 crédits = 1000 FCFA, 20 crédits = 2000 FCFA)
    const expectedAmount = requestedAmount * 100;
    if (Math.abs(paidAmount - expectedAmount) > 1) {
        errors.push(`Montant incorrect: attendu ${expectedAmount} FCFA, reçu ${paidAmount} FCFA`);
        return { valid: false, errors };
    }
    
    // 5. Extraire le Transaction ID
    const transIdMatch = message.match(/Trans id:\s*([A-Z0-9.]+)/i);
    let transId = null;
    if (transIdMatch) {
        transId = transIdMatch[1];
    }
    
    if (!transId) {
        errors.push('Transaction ID non trouvé');
        return { valid: false, errors };
    }
    
    // 6. Vérifier que le Trans ID commence par "MP"
    if (!transId.startsWith('MP')) {
        errors.push('Format de transaction ID invalide (doit commencer par MP)');
        return { valid: false, errors };
    }
    
    // 7. Extraire la date et l'heure du Trans ID
    // Format: MP260402.1708.45374181
    // MP + 2 chiffres an + 2 chiffres mois + 2 chiffres jour + . + 2 chiffres heure + 2 chiffres minutes
    const datePattern = /MP(\d{2})(\d{2})(\d{2})\.(\d{2})(\d{2})/;
    const dateMatch = transId.match(datePattern);
    
    if (!dateMatch) {
        errors.push('Format de date dans Transaction ID invalide');
        return { valid: false, errors };
    }
    
    const year = 2000 + parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]);
    const day = parseInt(dateMatch[3]);
    const hour = parseInt(dateMatch[4]);
    const minute = parseInt(dateMatch[5]);
    
    const transactionDate = new Date(year, month - 1, day, hour, minute);
    const now = new Date();
    
    // 8. Vérifier que la date est aujourd'hui
    if (transactionDate.toDateString() !== now.toDateString()) {
        errors.push(`Transaction datée du ${transactionDate.toLocaleDateString()} - Veuillez utiliser une transaction du jour`);
        return { valid: false, errors };
    }
    
    // 9. Vérifier que la transaction date de moins de 2 minutes
    const timeDiff = (now - transactionDate) / 1000 / 60;
    if (timeDiff > 2) {
        errors.push(`Transaction trop ancienne (${Math.floor(timeDiff)} minutes) - Délai maximum 2 minutes`);
        return { valid: false, errors };
    }
    
    return {
        valid: true,
        data: {
            transId,
            paidAmount,
            transactionDate,
            year,
            month,
            day,
            hour,
            minute
        }
    };
}

// ============ ROUTES API ============

// Route racine
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        service: 'PALGA TOOLS API',
        database: 'Supabase avec payement',
        version: 'V1.0.0'
    });
});

// Inscription
app.post('/api/register', async (req, res) => {
    const { username, password, email, whatsapp } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
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

// Vérifier crédits
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

// Vérifier et valider une transaction de recharge
app.post('/api/verify-recharge', async (req, res) => {
    const { user_id, credits_amount, phone_number, transaction_message } = req.body;
    
    if (!user_id || !credits_amount || !phone_number || !transaction_message) {
        return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    
    // Vérifier que le nombre de crédits est valide (10 ou 20)
    if (![10, 20].includes(credits_amount)) {
        return res.status(400).json({ error: 'Nombre de crédits invalide (10 ou 20 seulement)' });
    }
    
    // 1. Vérifier si l'utilisateur existe
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('user_id, username, credit')
        .or(`user_id.eq.${user_id},username.eq.${user_id}`)
        .maybeSingle();
    
    if (userError || !user) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    
    // 2. Vérifier si cette transaction n'a pas déjà été utilisée
    const { data: existingTrans } = await supabase
        .from('recharge_transactions')
        .select('transaction_id')
        .eq('transaction_id', transaction_message.substring(0, 100))
        .maybeSingle();
    
    if (existingTrans) {
        return res.status(400).json({ 
            error: 'Cette transaction a déjà été utilisée - Tentative de fraude détectée',
            fraud_attempt: true
        });
    }
    
    // 3. Vérifier le message de transaction
    const verification = verifyTransactionMessage(transaction_message, credits_amount, phone_number);
    
    if (!verification.valid) {
        // Enregistrer la tentative frauduleuse
        await supabase.from('recharge_transactions').insert([{
            transaction_id: transaction_message.substring(0, 100),
            user_id: user.user_id,
            phone_number: phone_number,
            amount_requested: credits_amount,
            credits_amount: credits_amount,
            status: 'fraud_attempt',
            transaction_message: transaction_message.substring(0, 500)
        }]);
        
        return res.status(400).json({ 
            error: verification.errors.join(', '),
            fraud_attempt: true,
            details: verification.errors
        });
    }
    
    // 4. Transaction valide - Ajouter les crédits
    const newCredit = user.credit + credits_amount;
    
    const { error: updateError } = await supabase
        .from('users')
        .update({ credit: newCredit })
        .eq('user_id', user.user_id);
    
    if (updateError) {
        return res.status(500).json({ error: 'Erreur lors de l\'ajout des crédits' });
    }
    
    // 5. Enregistrer la transaction réussie
    await supabase.from('recharge_transactions').insert([{
        transaction_id: verification.data.transId,
        user_id: user.user_id,
        phone_number: phone_number,
        amount_requested: credits_amount,
        credits_amount: credits_amount,
        status: 'completed',
        transaction_message: transaction_message.substring(0, 500),
        verified_at: new Date().toISOString()
    }]);
    
    // 6. Enregistrer dans l'historique des transactions
    await supabase.from('transactions').insert([{
        user_id: user.user_id,
        type: 'recharge',
        amount: credits_amount,
        description: `Recharge de ${credits_amount} crédits - Transaction ${verification.data.transId}`
    }]);
    
    res.json({
        success: true,
        new_credit: newCredit,
        added_credits: credits_amount,
        transaction_id: verification.data.transId,
        transaction_time: verification.data.transactionDate,
        message: `Recharge réussie ! ${credits_amount} crédits ajoutés à votre compte.`
    });
});

// Vérifier l'état d'une transaction
app.get('/api/check-transaction/:transId', async (req, res) => {
    const { transId } = req.params;
    
    const { data: transaction, error } = await supabase
        .from('recharge_transactions')
        .select('*')
        .eq('transaction_id', transId)
        .maybeSingle();
    
    if (error || !transaction) {
        return res.json({ exists: false });
    }
    
    res.json({
        exists: true,
        status: transaction.status,
        user_id: transaction.user_id,
        amount: transaction.credits_amount,
        verified_at: transaction.verified_at
    });
});

// Utiliser un service
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
    const { count: fraud_attempts } = await supabase.from('recharge_transactions').select('*', { count: 'exact', head: true }).eq('status', 'fraud_attempt');
    
    res.json({
        total_users: total_users || 0,
        total_credit: total_credit,
        total_transactions: total_transactions || 0,
        services_used: services_used || 0,
        fraud_attempts: fraud_attempts || 0
    });
});

// Admin: Liste des transactions de recharge
app.get('/api/admin/recharge-transactions', async (req, res) => {
    const { admin_id } = req.query;
    
    const { data: admin, error: adminError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('user_id', admin_id)
        .maybeSingle();
    
    if (adminError || !admin || !admin.is_admin) {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { data: transactions, error } = await supabase
        .from('recharge_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.json(transactions || []);
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
        console.log(`🔒 Système de vérification des transactions activé`);
    });
}).catch(err => {
    console.error('❌ Erreur au démarrage:', err);
    app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    });
});
