# Eisenhower - Enterprise Portfolio Management System

A Python-based web server backend for enterprise portfolio management, built with FastAPI and PostgreSQL.

## Features

- **User Management** – Registration, authentication (JWT), role-based access control (Admin, Manager, Member, Viewer)
- **Portfolio Management** – Create, update, and manage portfolios with team members and role-based permissions
- **Project Management** – Full CRUD for projects within portfolios, with status, priority, progress tracking, and budgets
- **Task Management** – Hierarchical tasks with subtasks, assignments, due dates, time tracking, and status workflows
- **Milestones** – Track project milestones with due dates and completion status
- **Comments** – Task-level comments for team collaboration
- **Dashboard** – Aggregated statistics, portfolio/project summaries, my-tasks view, and recent activity feed

## Tech Stack

- **FastAPI** – Web framework
- **SQLAlchemy 2.0** – ORM
- **PostgreSQL** – Database
- **Pydantic** – Data validation
- **Python-Jose** – JWT authentication
- **Passlib + bcrypt** – Password hashing
- **Uvicorn** – ASGI server

## Project Structure

```
Eisenhower/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Application settings
│   ├── database.py          # Database engine and session
│   ├── models/
│   │   └── models.py        # SQLAlchemy ORM models
│   ├── schemas/
│   │   └── schemas.py       # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── users.py         # User management endpoints
│   │   ├── portfolios.py    # Portfolio endpoints
│   │   ├── projects.py      # Project endpoints
│   │   ├── tasks.py         # Task endpoints
│   │   ├── milestones.py    # Milestone endpoints
│   │   ├── comments.py      # Comment endpoints
│   │   └── dashboard.py     # Dashboard endpoints
│   └── utils/
│       ├── security.py      # Password hashing and JWT utilities
│       └── auth.py          # Auth dependency injectors
├── init_db.py               # Database initialization script
├── requirements.txt         # Python dependencies
└── README.md
```

## Setup

### Prerequisites

- Python 3.9+
- PostgreSQL 13+

### Installation

1. **Clone and install dependencies:**

```bash
pip install -r requirements.txt
```

2. **Configure the database:**

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql+psycopg2://postgres:yourpassword@localhost:5432/eisenhower
SECRET_KEY=your-secret-key-change-in-production
```

3. **Initialize the database:**

```bash
# Create tables only
python init_db.py

# Create tables and seed a default admin user
python init_db.py --seed
```

The default admin credentials (if seeded) are:
- Username: `admin`
- Password: `admin123`

**⚠️ Change the default password immediately after first login.**

### Running the Server

```bash
# Development
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at `http://localhost:8000`.

## API Documentation

FastAPI auto-generates interactive API documentation:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register a new user |
| POST | `/login` | Login and receive JWT token |
| GET | `/me` | Get current user info |

### Users (`/api/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List all users (admin) |
| GET | `/{user_id}` | Get user by ID |
| PUT | `/{user_id}` | Update user (admin) |
| DELETE | `/{user_id}` | Delete user (admin) |
| PATCH | `/{user_id}/password` | Change password |

### Portfolios (`/api/portfolios`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List accessible portfolios |
| POST | `/` | Create a portfolio |
| GET | `/{id}` | Get portfolio details |
| PUT | `/{id}` | Update portfolio |
| DELETE | `/{id}` | Delete portfolio |
| GET | `/{id}/members` | List portfolio members |
| POST | `/{id}/members` | Add a member |
| PUT | `/{id}/members/{mid}` | Update member role |
| DELETE | `/{id}/members/{mid}` | Remove a member |
| GET | `/{id}/stats` | Get portfolio statistics |

### Projects (`/api/projects`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List projects (filter by portfolio/status/priority) |
| POST | `/` | Create a project |
| GET | `/{id}` | Get project details |
| PUT | `/{id}` | Update project |
| DELETE | `/{id}` | Delete project |
| GET | `/{id}/stats` | Get project statistics |

### Tasks (`/api/tasks`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List tasks (filter by project/status/priority/assignee) |
| POST | `/` | Create a task |
| GET | `/{id}` | Get task details |
| PUT | `/{id}` | Update task |
| DELETE | `/{id}` | Delete task |
| GET | `/{id}/subtasks` | Get subtasks |
| GET | `/{id}/history` | Get task history |

### Milestones (`/api/milestones`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List milestones |
| POST | `/` | Create a milestone |
| GET | `/{id}` | Get milestone details |
| PUT | `/{id}` | Update milestone |
| DELETE | `/{id}` | Delete milestone |
| GET | `/project/{pid}` | Get project milestones |

### Comments (`/api/comments`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List comments |
| POST | `/` | Create a comment |
| GET | `/{id}` | Get comment details |
| PUT | `/{id}` | Update comment (author only) |
| DELETE | `/{id}` | Delete comment |
| GET | `/task/{tid}` | Get task comments |

### Dashboard (`/api/dashboard`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Overall dashboard statistics |
| GET | `/portfolios` | Portfolio summaries |
| GET | `/projects` | Project summaries |
| GET | `/my-tasks` | Tasks assigned to current user |
| GET | `/recent-activity` | Recent activity feed |

## Authentication

All protected endpoints require a JWT Bearer token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Obtain a token by calling `POST /api/auth/login` with username and password.

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, manage all users |
| **Manager** | Manage portfolios, projects, and tasks |
| **Member** | Create and edit within assigned portfolios |
| **Viewer** | Read-only access |

## Database Models

- **User** – System users with roles
- **Portfolio** – Top-level container for projects
- **PortfolioMember** – User-portfolios membership with roles
- **Project** – Projects within portfolios
- **Task** – Tasks within projects (supports subtasks via parent_task_id)
- **Milestone** – Project milestones
- **Comment** – Task-level comments

## License

MIT
