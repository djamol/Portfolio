# Quick Setup Guide

## Step 1: Install MySQL/MariaDB

Make sure MySQL or MariaDB is installed and running on your system.

## Step 2: Configure Database

Edit `backend/.env` and set your database credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=portfolio
PORT=3000
```

## Step 3: Install Backend Dependencies

```bash
cd backend
npm install
```

## Step 4: Start Backend Server

```bash
npm start
```

The backend will automatically create the database and tables on first run.
You should see: "Server is running on port 3000"

## Step 5: Install Frontend Dependencies

Open a new terminal:

```bash
cd frontend
npm install
```

**Note:** If you encounter dependency conflicts, try:
```bash
npm install --legacy-peer-deps
```

## Step 6: Start Frontend Server

```bash
npm start
```

The frontend will be available at `http://localhost:4200`

## Troubleshooting

### Backend won't start
- Check if MySQL/MariaDB is running
- Verify database credentials in `backend/.env`
- Make sure port 3000 is not in use

### Frontend won't start
- Make sure Node.js version is 18 or higher
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- Check if port 4200 is not in use

### Charts not displaying
- Make sure backend is running and accessible
- Check browser console for errors
- Verify API endpoints are working by visiting `http://localhost:3000/api/health`

## First Steps

1. Once both servers are running, navigate to `http://localhost:4200`
2. Click "Add Investment" to create your first investment
3. Fill in the form with your investment details
4. Click "View Analytics" to see your portfolio analysis
