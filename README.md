# Ayuda Tracker MVP

MVP for creating, publishing, browsing, and tracking ayuda announcements.

## Local Setup

```bash
npm.cmd install
npm.cmd run dev
npm.cmd run dev:user
```

Populate full-feature mock database records:

```bash
npm.cmd run seed:db
```

Run database verification checks repeatedly:

```bash
npm.cmd run test:db:repeat
```

API server runs at `http://127.0.0.1:3001/`.
Admin runs at `http://127.0.0.1:5173/`.
User side runs at `http://127.0.0.1:5174/`.

Create a `.env` file (or update existing) with database values for XAMPP:

```bash
API_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ayuda
```

Default mock credentials:

- Username: `admin`
- Password: `admin123`

Google Maps is enabled by adding `VITE_GOOGLE_MAPS_API_KEY` to `.env.local`. Without it, the location field falls back to manual address entry.
