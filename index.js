const axios = require('axios');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const express = require('express');
const flash = require('connect-flash');

const app = express();
const PORT = 5000;
const CONFIG_PATH = 'config.json';

let postingAlive = false;
let intervals = []; // simpan interval biar bisa di-clear

let config = {
    token: '',
    use_webhook: false,
    webhook_url: '',
    channels: []
};

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'supersecretkey',
    resave: false,
    saveUninitialized: true
}));
app.use(flash());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH));
        } catch (err) {
            console.log('config.json is invalid, resetting to default');
            config = { token: '', use_webhook: false, webhook_url: '', channels: [] };
            saveConfig();
        }
    } else {
        saveConfig();
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

// Send Log ke Webhook
async function sendLog(message, channelId, success = true) {
    if (config.use_webhook && config.webhook_url) {
        const now = new Date().toLocaleString('id-ID');
        const embed = {
            title: '📖 Auto Post Discord',
            description: '**Details Info**',
            color: success ? 65280 : 16711680,
            fields: [
                { name: 'Status Log', value: success ? 'Success' : 'Failed', inline: false },
                { name: 'Date Time', value: now, inline: false },
                { name: 'Channel', value: channelId ? `<#${channelId}>` : 'Unknown', inline: false },
                { name: 'Status Message', value: message, inline: false }
            ]
        };
        try {
            await axios.post(config.webhook_url, { embeds: [embed] });
        } catch (err) {
            console.log('[ERROR LOG]', err.message);
        }
    }
}

// Auto Posting
function autoPost() {
    intervals.forEach(i => clearInterval(i));
    intervals = [];

    config.channels.forEach((ch) => {
        if (!Array.isArray(ch)) {
            console.error("Format channel salah:", ch);
            return;
        }

        const [id, message, interval] = ch; // ini aman kalau `ch` memang array

        const intv = setInterval(async () => {
            if (!postingAlive) return;
            try {
                const url = `https://discord.com/api/v10/channels/${id}/messages`;
                const headers = {
                    Authorization: config.token,
                    'Content-Type': 'application/json'
                };
                const data = { content: message };

                const res = await axios.post(url, data, { headers });
                const success = res.status === 200 || res.status === 204;

                if (success) {
                    await sendLog(`Pesan terkirim ke channel ${id}`, id, true);
                } else {
                    await sendLog(`Gagal mengirim pesan ke channel ${id}`, id, false);
                }
            } catch (err) {
                await sendLog(`Error: ${err.message}`, id, false);
            }
        }, interval || 30000);

        intervals.push(intv);
    });
}

// Routes
app.get('/', (req, res) => {
    loadConfig();
    res.render('index', {
        config,
        postingAlive,
        messages: req.flash()
    });
});

app.post('/save-config', (req, res) => {
    loadConfig();
    if (req.body.token) {
        config.token = req.body.token.trim();
        saveConfig();
        req.flash('success', 'Token successfully saved');
    }
    res.redirect('/');
});

app.post('/start', (req, res) => {
    if (!postingAlive) {
        postingAlive = true;
        autoPost();
        req.flash('success', 'Starting the auto post');
    }
    res.redirect('/');
});

app.post('/stop', (req, res) => {
    postingAlive = false;
    intervals.forEach(i => clearInterval(i));
    intervals = [];
    req.flash('info', 'Auto post stopped');
    res.redirect('/');
});

app.post('/add-channel', (req, res) => {
    loadConfig();

    const { id, message, interval } = req.body;

    if (!id || !message) {
        req.flash('error', 'Channel ID dan pesan wajib diisi!');
        return res.redirect('/');
    }

    config.channels.push([
        id.trim(),
        message.trim(),
        parseInt(interval) || 30000
    ]);

    saveConfig();
    req.flash('success', `Configuration for channel ${id} berhasil disimpan`);
    res.redirect('/');
});

app.post('/edit-channel', (req, res) => {
    loadConfig();

    const { token, use_webhook, webhook_url } = req.body;

    if (token) config.token = token.trim();
    config.use_webhook = use_webhook === 'on'; // checkbox true/false
    if (webhook_url) config.webhook_url = webhook_url.trim();

    saveConfig();
    req.flash('success', 'Config berhasil diperbarui');
    res.redirect('/');
});

// Update Channel
app.post('/update-channel/:index', (req, res) => {
    loadConfig();
    const { index } = req.params;
    const { id, message, interval } = req.body;

    if (!config.channels[index]) {
        req.flash('error', 'Channel tidak ditemukan!');
        return res.redirect('/');
    }

    config.channels[index] = [
        id.trim(),
        message.trim(),
        parseInt(interval) || 30000
    ];

    saveConfig();
    req.flash('success', `Channel ${id} berhasil diperbarui`);
    res.redirect('/');
});

// Delete Channel
app.post('/delete-channel/:index', (req, res) => {
    loadConfig();
    const { index } = req.params;

    if (!config.channels[index]) {
        req.flash('error', 'Channel tidak ditemukan!');
        return res.redirect('/');
    }

    const removed = config.channels.splice(index, 1);
    saveConfig();
    req.flash('info', `Channel ${removed[0][0]} berhasil dihapus`);
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server Listen at: http://localhost:${PORT}`);
});