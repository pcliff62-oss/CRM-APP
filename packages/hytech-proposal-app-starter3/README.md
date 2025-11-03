# HyTech Proposal App (Vite + Tailwind)

## Prereqs
- Node.js 18+ (recommend 20 LTS)
- npm (comes with Node)

## Run locally
```bash
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173).

## Build production
```bash
npm run build
npm run preview
```

## Deploy (one option: Vercel)
1. Create a new Git repo and push this folder.
2. Import the repo at https://vercel.com/new.
3. Framework: **Vite** (auto-detected). Build command: `vite build`. Output dir: `dist`.
4. Deploy.
