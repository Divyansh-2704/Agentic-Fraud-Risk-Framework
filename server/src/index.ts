import { createApp } from './app.js'
import { get } from './db.js'

const port = Number(process.env.PORT ?? 4000)
if (!get('SELECT 1 FROM users LIMIT 1')) {
  console.warn('Database is empty. Run "npm run seed" first.')
}
createApp().listen(port, () => console.log(`FCMS API listening on http://localhost:${port}`))
