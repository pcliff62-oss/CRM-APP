import app from './app'
const PORT = Number(process.env.PORT || 4000)
app.listen(PORT, () => console.log(`[server] listening on http://127.0.0.1:${PORT}`))
