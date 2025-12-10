const express = require('express')
const app = express();
const axios = require('axios')
const crypto = require('crypto')

require('dotenv').config()

const PORT = process.env.PORT
const TOKEN = process.env.TOKEN
const DIGISELLER_SELLER_ID = process.env.DIGISELLER_SELLER_ID
const DIGISELLER_API_KEY = process.env.DIGISELLER_API_KEY

let DIGISELLER_TOKEN = null;

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

// Функция получения токена от DigiSeller
async function getDigisellerToken() {
    try {
        console.log('🔄 Refreshing DigiSeller token...');
        const url = 'https://api.digiseller.ru/api/apilogin'
        const timestamp = parseInt(Date.now() / 1000)
        const sha256 = crypto.createHash('sha256')
        const sign = sha256.update('' + DIGISELLER_API_KEY + timestamp).digest('hex');
        
        const res = await axios({
            method: 'post',
            url,
            data: {
                "seller_id": DIGISELLER_SELLER_ID,
                "timestamp": timestamp,
                "sign": sign
            },
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        })
        
        if (res.data.retval === 0) {
            DIGISELLER_TOKEN = res.data.token;
            console.log('✅ Token refreshed successfully');
            return DIGISELLER_TOKEN;
        } else {
            console.error('❌ Failed to get token:', res.data.retdesc);
            return null;
        }
    } catch (error) {
        console.error('❌ Error refreshing token:', error.message);
        return null;
    }
}

loadStore();

getDigisellerToken();

setInterval(() => {
    getDigisellerToken();
}, 2 * 60 * 60 * 1000);

app.post("/params", async (req, res) => {
    const body = req.body || {};
    const { product, options } = body;

    console.log('\n=== POST /params ===');
    console.log('REQUEST BODY:', JSON.stringify(body, null, 2));

    if (options && Array.isArray(options)) {
        for (const opt of options) {
            if (opt.value && typeof opt.value === 'string') {
                if (!opt.value.startsWith('@')) {
                    console.log('❌ VALIDATION FAILED: value must start with @', opt.value);
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
        console.log('✅ Params saved for product', product.id, '\n');
    }

    res.json({ error: "" });
})

app.post('/code', async (req, res) => {
    const body = req.body || {};
    const uniqueCode = body.Message || body.message;

    if (!uniqueCode) {
        console.log('Error: no unique code provided');
        return res.json({ ok: false, error: 'No code provided' });
    }

    console.log('Received unique code:', uniqueCode);

    // Проверяем код в DigiSeller API
    if (!DIGISELLER_TOKEN) {
        console.log('Error: DIGISELLER_TOKEN not set');
        return res.json({ ok: false, error: 'Token not configured' });
    }

    try {
        // ШАГИ 1: Проверяем код
        console.log('\n=== STEP 1: Verify Code ===');
        console.log('REQUEST:', {
            method: 'GET',
            url: `https://api.digiseller.com/api/purchases/unique-code/${uniqueCode}?token=${DIGISELLER_TOKEN}`,
            headers: { 'Accept': 'application/json' }
        });

        const verifyResponse = await fetch(
            `https://api.digiseller.com/api/purchases/unique-code/${uniqueCode}?token=${DIGISELLER_TOKEN}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        const verifyResult = await verifyResponse.json();
        console.log('RESPONSE:', JSON.stringify(verifyResult, null, 2));

        if (verifyResult.retval !== 0) {
            console.log('❌ CODE VERIFICATION FAILED');
            return res.json({ ok: false, error: verifyResult.retdesc });
        }

        console.log('✅ CODE VERIFIED\n');

        // ШАГИ 2: Отправляем звезды через Fragment API
        console.log('=== STEP 2: Send Stars to Fragment ===');
        const key = `prod:${verifyResult.id_goods}`;
        const stored = paramsStore[key];

        let fragmentSuccess = false;

        if (stored) {
            const stars = stored.product.cnt;
            const username = stored.options && stored.options[0] ? stored.options[0].value : '';

            if (username && stars) {
                const usernameWithoutAt = username.startsWith('@') ? username.slice(1) : username;
                
                const fragmentBody = {
                    username: usernameWithoutAt,
                    quantity: stars,
                    show_sender: false
                };

                console.log('REQUEST:', {
                    method: 'POST',
                    url: 'https://api.fragment-api.com/v1/order/stars/',
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `JWT ${TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: fragmentBody
                });

                try {
                    const fragmentResponse = await fetch('https://api.fragment-api.com/v1/order/stars/', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Authorization': `JWT ${TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(fragmentBody)
                    });

                    const fragmentResult = await fragmentResponse.json();
                    console.log('RESPONSE:', JSON.stringify(fragmentResult, null, 2));
                    
                    if (fragmentResult.success) {
                        fragmentSuccess = true;
                        console.log('✅ STARS SENT\n');
                    } else {
                        console.log('❌ STARS NOT SENT\n');
                    }
                } catch (error) {
                    console.error('❌ FRAGMENT API ERROR:', error.message, '\n');
                }
            }
        } else {
            console.log('⚠️  No stored params found for product', verifyResult.id_goods, '\n');
        }

        // ШАГИ 3: Меняем статус ТОЛЬКО если звезды успешно отправлены
        console.log('=== STEP 3: Update Delivery Status ===');
        if (fragmentSuccess) {
            console.log('REQUEST:', {
                method: 'PUT',
                url: `https://api.digiseller.com/api/purchases/unique-code/${uniqueCode}/deliver?token=${DIGISELLER_TOKEN}`,
                headers: { 'Accept': 'application/json' }
            });

            try {
                const deliverResponse = await fetch(
                    `https://api.digiseller.com/api/purchases/unique-code/${uniqueCode}/deliver?token=${DIGISELLER_TOKEN}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Accept': 'application/json'
                        }
                    }
                );

                const deliverResult = await deliverResponse.json();
                console.log('RESPONSE:', JSON.stringify(deliverResult, null, 2));

                if (deliverResult.retval === 0) {
                    console.log('✅ DELIVERY STATUS UPDATED\n');
                    
                    // Удаляем параметры ТОЛЬКО после успеха
                    delete paramsStore[key];
                    await saveStore();
                } else {
                    console.log('❌ DELIVERY STATUS UPDATE FAILED\n');
                }
            } catch (error) {
                console.error('❌ DIGISELLER API ERROR:', error.message, '\n');
            }
        } else {
            console.log('⚠️  Skipping delivery status update - stars not sent\n');
        }

        res.json({ ok: true, data: verifyResult });
    } catch (error) {
        console.error('Error processing code:', error);
        res.json({ ok: false, error: error.message });
    }
})

app.post("/stars", async (req, res) => {
    const body = req.body || {};
    const productId = body.ID_D || body.ID_I;
    const orderId = body.ID_I || body.id_i;

    console.log('\n=== POST /stars (Payment Webhook) ===');
    console.log('REQUEST BODY:', JSON.stringify(body, null, 2));

    const key = `prod:${productId}`;
    const stored = paramsStore[key];

    if (stored) {
        const stars = stored.product.cnt;
        const username = stored.options && stored.options[0] ? stored.options[0].value : '';

        console.log('Merged data:', {
            productId,
            orderId,
            stars,
            username
        });

        if (orderId && DIGISELLER_TOKEN) {
            const messageText = `Привет! Для получения звёзд тебе необходимо отправить следующим сообщением уникальный код (больше не отправляй сообщений, тг продавца: @fullstack_dev88). Ни в коем случае не добавляй никакие символы кроме кода, иначе звезды не будут отправлены!`;

            console.log('REQUEST:', {
                method: 'POST',
                url: `https://api.digiseller.com/api/debates/v2/?token=${DIGISELLER_TOKEN}&id_i=${orderId}`,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: { message: messageText, files: [] }
            });

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

                console.log('RESPONSE Status:', response.status);

                if (response.status === 200) {
                    console.log('✅ DigiSeller message sent\n');
                } else {
                    console.log('❌ DigiSeller API error:', response.status, '\n');
                }
            } catch (error) {
                console.error('❌ DIGISELLER API ERROR:', error.message, '\n');
            }
        }
    } else {
        console.log('⚠️  No params found for product', productId, '\n');
    }

    res.json({ ok: true });
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})