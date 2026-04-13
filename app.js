// server.js - Backend Node.js/Express
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Base de données
const db = new sqlite3.Database('./palga.db');

// Initialisation de la base de données
db.serialize(() => {
    // Table users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        whatsapp TEXT,
        credit REAL DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )`);

    // Table transactions
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Table services
    db.run(`CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        commands TEXT,
        is_active INTEGER DEFAULT 1
    )`);

    // Créer admin par défaut
    const adminId = generateUserId();
    const hashedAdminPw = bcrypt.hashSync('Admin123', 10);
    
    db.get("SELECT * FROM users WHERE username = ?", ['ADMIN'], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (user_id, username, password, email, credit, is_admin) 
                    VALUES (?, ?, ?, ?, ?, ?)`, 
                    [adminId, 'ADMIN', hashedAdminPw, 'admin@palga.com', 1000, 1]);
            console.log('✅ Admin créé:', adminId);
        }
    });

    // Créer utilisateur démo
    const demoId = generateUserId();
    const hashedDemoPw = bcrypt.hashSync('Demo123', 10);
    
    db.get("SELECT * FROM users WHERE username = ?", ['DEMO'], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (user_id, username, password, email, credit, is_admin) 
                    VALUES (?, ?, ?, ?, ?, ?)`, 
                    [demoId, 'DEMO', hashedDemoPw, 'demo@palga.com', 100, 0]);
            console.log('✅ Utilisateur DEMO créé:', demoId);
        }
    });

    // Ajouter services par défaut
    const services = [
        ['FRP Bypass Standard', 'Déblocage compte Google', 10, '["adb shell am start -n com.google.android.gsf.login/", "adb shell content insert --uri content://settings/secure --bind name:s:user_setup_complete --bind value:s:1"]'],
        ['FRP Bypass Avancé', 'Pour Samsung/Huawei', 15, '["adb shell settings put global setup_wizard_has_run 1", "adb shell settings put secure user_setup_complete 1"]'],
        ['MDM Removal', 'Suppression MDM complet', 20, '["adb shell pm uninstall -k --user 0 com.android.mdm", "adb shell pm uninstall -k --user 0 com.samsung.android.knox"]']
    ];

    services.forEach(service => {
        db.get("SELECT * FROM services WHERE name = ?", [service[0]], (err, row) => {
            if (!row) {
                db.run(`INSERT INTO services (name, description, price, commands) VALUES (?, ?, ?, ?)`, service);
            }
        });
    });
});

// Fonction utilitaire
function generateUserId() {
    return 'PALGA' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ============ ROUTES API ============

// Inscription
app.post('/api/register', (req, res) => {
    const { username, password, email, whatsapp } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    
    const user_id = generateUserId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (user_id, username, password, email, whatsapp, credit) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [user_id, username, hashedPassword, email, whatsapp, 0],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Nom d\'utilisateur déjà pris' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, user_id, username, message: 'Compte créé avec succès!' });
            });
});

// Connexion
app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE username = ? OR user_id = ?`, [identifier, identifier], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        
        // Mettre à jour last_login
        db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = ?`, [user.user_id]);
        
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
});

// Obtenir infos utilisateur
app.get('/api/user/:userId', (req, res) => {
    const { userId } = req.params;
    
    db.get(`SELECT user_id, username, email, whatsapp, credit, is_admin, created_at, last_login 
            FROM users WHERE user_id = ?`, [userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }
        res.json(user);
    });
});

// Obtenir services
app.get('/api/services', (req, res) => {
    db.all(`SELECT * FROM services WHERE is_active = 1`, [], (err, services) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(services);
    });
});

// Utiliser un service (FRP Bypass)
app.post('/api/service/frp-bypass', (req, res) => {
    const { user_id, service_id } = req.body;
    
    db.get(`SELECT * FROM services WHERE id = ? AND is_active = 1`, [service_id], (err, service) => {
        if (err || !service) {
            return res.status(404).json({ error: 'Service non trouvé' });
        }
        
        db.get(`SELECT credit FROM users WHERE user_id = ?`, [user_id], (err, user) => {
            if (err || !user) {
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
            db.run(`UPDATE users SET credit = ? WHERE user_id = ?`, [newCredit, user_id]);
            
            // Enregistrer transaction
            db.run(`INSERT INTO transactions (user_id, type, amount, description) 
                    VALUES (?, ?, ?, ?)`, 
                    [user_id, 'service', service.price, service.name]);
            
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
    });
});

// Ajouter crédits (admin seulement)
app.post('/api/admin/add-credit', (req, res) => {
    const { admin_id, user_id, amount, description } = req.body;
    
    // Vérifier si admin
    db.get(`SELECT is_admin FROM users WHERE user_id = ?`, [admin_id], (err, admin) => {
        if (err || !admin || !admin.is_admin) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        db.get(`SELECT credit FROM users WHERE user_id = ?`, [user_id], (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }
            
            const newCredit = user.credit + amount;
            db.run(`UPDATE users SET credit = ? WHERE user_id = ?`, [newCredit, user_id]);
            
            db.run(`INSERT INTO transactions (user_id, type, amount, description) 
                    VALUES (?, ?, ?, ?)`, 
                    [user_id, 'admin_credit', amount, description || 'Ajout par admin']);
            
            res.json({ success: true, new_credit: newCredit });
        });
    });
});

// Liste des utilisateurs (admin)
app.get('/api/admin/users', (req, res) => {
    const { admin_id } = req.query;
    
    db.get(`SELECT is_admin FROM users WHERE user_id = ?`, [admin_id], (err, admin) => {
        if (err || !admin || !admin.is_admin) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        db.all(`SELECT user_id, username, email, whatsapp, credit, is_admin, created_at, last_login 
                FROM users ORDER BY created_at DESC`, [], (err, users) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(users);
        });
    });
});

// Statistiques (admin)
app.get('/api/admin/stats', (req, res) => {
    const { admin_id } = req.query;
    
    db.get(`SELECT is_admin FROM users WHERE user_id = ?`, [admin_id], (err, admin) => {
        if (err || !admin || !admin.is_admin) {
            return res.status(403).json({ error: 'Accès non autorisé' });
        }
        
        db.get(`SELECT COUNT(*) as total_users FROM users`, [], (err, userCount) => {
            db.get(`SELECT SUM(credit) as total_credit FROM users`, [], (err, creditSum) => {
                db.get(`SELECT COUNT(*) as total_transactions FROM transactions`, [], (err, transCount) => {
                    db.get(`SELECT COUNT(*) as services_used FROM transactions WHERE type = 'service'`, [], (err, servicesUsed) => {
                        res.json({
                            total_users: userCount.total_users,
                            total_credit: creditSum.total_credit || 0,
                            total_transactions: transCount.total_transactions,
                            services_used: servicesUsed.services_used || 0
                        });
                    });
                });
            });
        });
    });
});

// Historique utilisateur
app.get('/api/user/:userId/transactions', (req, res) => {
    const { userId } = req.params;
    
    db.all(`SELECT type, amount, description, created_at FROM transactions 
            WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, 
            [userId], (err, transactions) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(transactions);
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur PALGA TOOLS démarré sur http://localhost:${PORT}`);
});
