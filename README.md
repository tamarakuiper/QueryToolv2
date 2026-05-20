# QueryToolv2

A modern web-based query tool built with **React (Vite)** that allows users to manage, run, and administer queries across firms. The application includes authentication, role-based access, and admin functionality for managing users, groups, and queries.

---

## 🚀 Features

- ✅ User authentication (Login / Register / Activate)
- ✅ Role-based access (Admin vs Standard users)
- ✅ Query execution interface
- ✅ Firm-level query organization
- ✅ Admin dashboards for:
  - Users
  - Groups
  - Queries
  - Analytics
- ✅ CSV export utilities
- ✅ Responsive UI with reusable components
- ✅ Built with Vite for fast development and builds

---

## 🏗️ Tech Stack

- **Frontend:** React (Vite)
- **Styling:** Tailwind CSS
- **Routing:** React Router
- **State Management:** React Context API
- **Build Tool:** Vite

---

## 📁 Project Structure

QueryToolv2/
│── QueryTool.Frontend/
│   ├── src/
│   │   ├── components/ui/      # Reusable UI components (button, input, etc.)
│   │   ├── pages/              # Main application pages
│   │   ├── auth/               # Authentication flows
│   │   ├── contexts/           # Global state (AuthContext)
│   │   ├── layout/             # Layout components (Sidebar, Dashboard)
│   │   ├── util/               # Utility functions (CSV, etc.)
│   │   ├── App.jsx             # App entry
│   │   ├── main.jsx            # Vite bootstrap
│   │   ├── api.js              # API integration layer
│   │
│   ├── public/                 # Static assets
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.cjs
│
│── .gitignore
│── README.md

---

## ⚙️ Setup Instructions

### 1. Clone the repo
```bash
git clone https://github.com/<tamarakuiper>/QueryToolv2.git
cd QueryToolv2/QueryTool.Frontend


