const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT

app.use(express.json())

app.post("/params", (req, res) => {
    console.log('ПАРАМЕТРЫ', req.body);
})

app.post("/stars", (req, res) => {
    console.log('ЗАКАЗ', req.body);
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})