const express = require('express')
const app = express();

require('dotenv').config()
const PORT = process.env.PORT

app.use(express.json())

app.get("/stars", (req, res) => {
    
})

app.listen(PORT, () => {
    console.log(`Server is started on port: ${PORT}...`)
})