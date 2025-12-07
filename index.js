const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT

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

app.post("/params", async (req, res) => {
    const body = req.body || {};
    const { product, options } = body;

    // Валидация: options.value должен начинаться с @
    if (options && Array.isArray(options)) {
        for (const opt of options) {
            if (opt.value && typeof opt.value === 'string') {
                if (!opt.value.startsWith('@')) {
                    console.log('Validation error: value must start with @', opt.value);
                    return res.json({ error: "Username must start with @" });
                }
            }
        }
    }

    // Сохраняем параметры по product.id
    if (product && product.id) {
        const key = `prod:${product.id}`;
        paramsStore[key] = {
            receivedAt: new Date().toISOString(),
            product,
            options
        };
        await saveStore();
        console.log('Saved params for product', product.id);
    }

    res.json({ error: "" });
})

app.post("/stars", async (req, res) => {
    const body = req.body || {};
    const productId = body.ID_D || body.ID_I;

    // Ищем сохранённые параметры по product.id
    const key = `prod:${productId}`;
    const stored = paramsStore[key];

    if (stored) {
        const stars = stored.product.cnt;
        const username = stored.options && stored.options[0] ? stored.options[0].value : '';

        console.log('Merged order:');
        console.log('  stars:', stars);
        console.log('  username:', username);

        // Удаляем использованные параметры
        delete paramsStore[key];
        await saveStore();
    } else {
        console.log('Order received (no matching params):', body);
    }

    res.json({ ok: true });
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})