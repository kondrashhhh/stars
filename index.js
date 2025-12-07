const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT

app.use(express.json())

app.post("/stars", (req, res) => {
    res.json(req)
    console.log(req)
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})