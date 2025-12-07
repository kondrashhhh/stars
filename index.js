const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT

app.use(express.json())

app.post("/stars", (req, res) => {
    // Не возвращаем весь объект `req` — в нём есть циклические структуры (socket, parser)
    // Отправляем только безопасные части запроса
    const safe = {
        body: req.body
    }

    console.log('ЗАКАЗ', safe);
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})