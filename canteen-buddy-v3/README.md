# Canteen Buddy v3 — Order History, Top-Selling Rankings & Zero Food Wastage

## Folder Structure
```text
canteen-buddy-v3/
├── public/
│   ├── index.html       # Full UI (Top Sellers, Wastage Monitor, Limited Slots, Deals, Google Form)
│   ├── css/
│   │   └── style.css    # Rank medals (Top 1, 2, 3), slot lock styles & animations
│   └── js/
│       └── app.js       # Frontend logic for analytics, wastage prevention & orders
├── server.js            # Express REST API + SQLite database (canteen_v3.db)
├── package.json         # Dependencies
└── README.md            # Setup guide
```

## Run in VS Code
1. Extract `canteen-buddy-v3.zip` and open `canteen-buddy-v3` in **VS Code**.
2. Open the terminal (`Ctrl + ~`) and run:
   ```bash
   npm install
   npm start
   ```
3. Visit **http://localhost:3000**.
