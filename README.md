# GeoTimesheet (dual‑mode)

Complete monday.com timesheet app that splits time by GPS location.

### Quick local run

```bash
# backend
cd server
cp .env.example .env   # fill MONDAY_TOKEN + board IDs
npm install
npm run dev

# frontend (new terminal)
cd ../client
npm install
npm run start   # served on http://localhost:5173/view
```

Add `?itemId=<dayItemId>&token=securetoken123` when testing outside monday.