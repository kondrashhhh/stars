const express = require('express')
const app = express();

require('dotenv').config()

const PORT = process.env.PORT
const TOKEN = process.env.TOKEN
const DIGISELLER_TOKEN = process.env.DIGISELLER_TOKEN

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

app.post('/code', async (req, res) => {
    const body = req.body || {};
    const uniqueCode = body.message || body.code || body.unique_code;

    // if (!uniqueCode) {
    //     console.log('Error: no unique code provided');
    //     return res.json({ ok: false, error: 'No code provided' });
    // }

    console.log('Received unique code:', body);

    // Проверяем код в DigiSeller API
    if (DIGISELLER_TOKEN) {
        try {
            const response = await fetch(
                `https://api.digiseller.com/api/purchases/unique-code/${uniqueCode}?token=${DIGISELLER_TOKEN}`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            const result = await response.json();

            if (result.retval === 0) {
                console.log('Code verification SUCCESS:');
                console.log('  id_goods:', result.id_goods);
                console.log('  amount:', result.amount);
                console.log('  email:', result.email);
                console.log('  options:', result.options);
                console.log('  unique_code_state:', result.unique_code_state);
                res.json({ ok: true, data: result });
            } else {
                console.log('Code verification FAILED:', result.retdesc);
                res.json({ ok: false, error: result.retdesc });
            }
        } catch (error) {
            console.error('Error verifying code:', error);
            res.json({ ok: false, error: error.message });
        }
    } else {
        console.log('Error: DIGISELLER_TOKEN not set');
        res.json({ ok: false, error: 'Token not configured' });
    }
})

app.post("/stars", async (req, res) => {
    const body = req.body || {};
    const productId = body.ID_D || body.ID_I;
    const orderId = body.ID_I || body.id_i; // ID заказа для отправки сообщения в DigiSeller

    const key = `prod:${productId}`;
    const stored = paramsStore[key];

    if (stored) {
        const stars = stored.product.cnt;
        const username = stored.options && stored.options[0] ? stored.options[0].value : '';

        console.log('Merged order:');
        console.log('  stars:', stars);
        console.log('  username:', username);

        if (username && stars) {
            const usernameWithoutAt = username.startsWith('@') ? username.slice(1) : username;
            
            try {
                const response = await fetch('https://api.fragment-api.com/v1/order/stars/', {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `JWT ${TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        username: usernameWithoutAt,
                        quantity: stars,
                        show_sender: false
                    })
                });

                const result = await response.json();
                console.log('Fragment API response:', result);
            } catch (error) {
                console.error('Error calling Fragment API:', error);
            }
        }

        if (orderId && DIGISELLER_TOKEN) {
            const messageText = `Привет! Для получения звёзд тебе необходимо отправить следующим сообщением уникальный код (больше не отправляй сообщений, тг продавца: @fullstack_dev88). Ни в коем случае не добавляй никакие символы кроме кода, иначе звезды не будут отправлены!`;

            try {
                const response = await fetch(
                    `https://api.digiseller.com/api/debates/v2/?token=${DIGISELLER_TOKEN}&id_i=${orderId}`,
                    {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: messageText,
                            files: []
                        })
                    }
                );

                if (response.status === 200) {
                    console.log('DigiSeller message sent:', messageText);
                } else {
                    console.error('DigiSeller API error:', response.status);
                }
            } catch (error) {
                console.error('Error sending DigiSeller message:', error);
            }
        }

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