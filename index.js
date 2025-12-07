const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT || 3000

app.use(express.json())

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'params.json');

let paramsStore = {};

async function loadStore(){
    try {
        const raw = await fs.readFile(DATA_FILE, 'utf8');
        paramsStore = JSON.parse(raw || '{}');
    } catch (e) {
        paramsStore = {};
    }
}

async function saveStore(){
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(DATA_FILE, JSON.stringify(paramsStore, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save params store', e);
    }
}

loadStore();

function makeKeyForParams(body){
    if(!body) return null;
    if(body.CartUID && String(body.CartUID).trim() !== '') return `cart:${body.CartUID}`;
    if(body.product && body.product.id && body.Email) return `email:${body.Email}:prod:${body.product.id}`;
    if(body.Email) return `email:${body.Email}`;
    return null;
}

app.get('/', (req, res) => res.send('OK'));

// Receive pre-payment parameters (product + options)
app.post('/params', async (req, res) => {
    const body = req.body || {};
    const entry = {
        receivedAt: new Date().toISOString(),
        body
    };

    let key = makeKeyForParams(body);
    if(!key && body.product && body.product.CartUID) key = `cart:${body.product.CartUID}`;
    if(!key) key = `gen:${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

    paramsStore[key] = entry;
    await saveStore();

    console.log('Saved params for key', key);
    res.json({ ok: true, key });
});

function findMatchingParams(payment){
    if(!payment) return null;
    const cartKey = payment.CartUID && String(payment.CartUID).trim() ? `cart:${payment.CartUID}` : null;
    if(cartKey && paramsStore[cartKey]) return { key: cartKey, entry: paramsStore[cartKey] };

    const email = payment.Email || payment.email;
    const prodId = payment.ID_D || payment.ID_I || (payment.product && payment.product.id);
    if(email && prodId){
        const key = `email:${email}:prod:${prodId}`;
        if(paramsStore[key]) return { key, entry: paramsStore[key] };
    }

    if(email){
        const key = `email:${email}`;
        if(paramsStore[key]) return { key, entry: paramsStore[key] };
    }

    return null;
}

app.post('/stars', async (req, res) => {
    const body = req.body || {};
    const match = findMatchingParams(body);
    if(match){
        const merged = { payment: body, params: match.entry.body };
        console.log('Merged order with params (key=' + match.key + '):', JSON.stringify(merged, null, 2));
        delete paramsStore[match.key];
        await saveStore();
    } else {
        console.log('Received order (no matching params):', JSON.stringify(body, null, 2));
    }

    res.json({ ok: true });
});

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})