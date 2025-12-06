const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { nanoid } = require('nanoid');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Initialize Database
const dbPath = path.join(__dirname, 'urls.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        createTable();
    }
});

function createTable() {
    db.run(`CREATE TABLE IF NOT EXISTS urls (
        short_code TEXT PRIMARY KEY,
        original_url TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
}

// Helper: AI Alias Suggestion (Heuristic)
function suggestAlias(url) {
    try {
        const urlObj = new URL(url);
        const pathSegments = urlObj.pathname.split('/').filter(Boolean);
        const hostnameParts = urlObj.hostname.split('.');

        let suggestion = '';

        if (pathSegments.length > 0) {
            // Use last two path segments if available
            suggestion = pathSegments.slice(-2).join('-');
        } else if (hostnameParts.length > 2) {
            // e.g. sub.domain.com -> sub-domain
            suggestion = hostnameParts.slice(0, -1).join('-');
        } else {
            // e.g. google.com -> google
            suggestion = hostnameParts[0];
        }

        // Clean up: remove invalid chars, truncate
        suggestion = suggestion.replace(/[^a-zA-Z0-9-]/g, '').substring(0, 20);

        return suggestion || 'link';
    } catch (e) {
        return 'link';
    }
}

// API: Shorten URL
app.post('/api/shorten', async (req, res) => {
    const { url, alias } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (_) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    let shortCode = alias ? alias.trim() : nanoid(6);

    // If alias is provided, check if it exists
    if (alias) {
        db.get('SELECT short_code FROM urls WHERE short_code = ?', [shortCode], (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (row) return res.status(409).json({ error: 'Alias already in use' });

            insertAndRespond(shortCode, url, res, req);
        });
    } else {
        // Retry logic for random ID collision (unlikely but good practice)
        insertAndRespond(shortCode, url, res, req);
    }
});

function insertAndRespond(shortCode, url, res, req) {
    const stmt = db.prepare('INSERT OR IGNORE INTO urls (short_code, original_url) VALUES (?, ?)');
    stmt.run(shortCode, url, async function (err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to save URL' });
        }

        // Check if actually inserted (for nanoid collision handling, very naive here for simplicity)
        if (this.changes === 0) {
            // If collision on auto-generated, try again (simple recursion)
            if (!req.body.alias) {
                return insertAndRespond(nanoid(6), url, res, req);
            } else {
                return res.status(409).json({ error: 'Alias taken' });
            }
        }

        try {
            const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
            const qrCodeDataUrl = await QRCode.toDataURL(`${baseUrl}/${shortCode}`);
            res.json({
                shortUrl: `${baseUrl}/${shortCode}`,
                shortCode,
                qrCode: qrCodeDataUrl
            });
        } catch (qrErr) {
            console.error(qrErr);
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    });
    stmt.finalize();
}

// API: Suggest Alias
app.get('/api/suggest', (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const suggestion = suggestAlias(url);
    res.json({ suggestion });
});

// Redirect Route
app.get('/:code', (req, res) => {
    const { code } = req.params;
    db.get('SELECT original_url FROM urls WHERE short_code = ?', [code], (err, row) => {
        if (err) return res.status(500).send('Database Error');
        if (row) {
            res.redirect(row.original_url);
        } else {
            res.status(404).sendFile(path.join(__dirname, '../client/index.html')); // Or a 404 page
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
