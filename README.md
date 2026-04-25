# Ayuda Tracker MVP

MVP for creating, publishing, browsing, and tracking ayuda announcements.

## Stack

- Python 3.11+
- Flask API
- React frontend served as static files by Flask
- Local MySQL database through XAMPP

## Local Setup

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

Create a `.env` file with your XAMPP/MySQL values:

```bash
API_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=ayuda
```

Populate full-feature mock database records:

```bash
python -m server.seed
```

Run database verification checks:

```bash
python -m server.verify_seed
python -m server.verify_seed --repeat=25
```

Start the app:

```bash
python -m server.app
```

App URLs:

- Admin: `http://127.0.0.1:3001/`
- User side: `http://127.0.0.1:3001/user`
- API health: `http://127.0.0.1:3001/api/health`

Default mock credentials:

- Username: `admin`
- Password: `admin123`
