import { createRoot } from 'react-dom/client'
import App from './App.jsx'
// Global styles (Tailwind)
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
	const el = document.createElement('div')
	el.id = 'root'
	document.body.appendChild(el)
}

createRoot(document.getElementById('root')).render(<App />)
