Account & Sign-In
=================


Manage your account, sign in, and control your session. Learn how to log in, change your password, and view your profile.

Authentication
~~~~~~~~~~~~~~


Authentication router for user registration and login.

This module handles the initial authentication flow:

- **Registration** — Creates a new user account with a hashed password.
- **Login** — Validates credentials and issues a JWT access token.
- **Profile retrieval** — Returns the current user's information.

Authentication Flow
~~~~~~~~~~~~~~~~~~~

1. User registers with username, email, and password.
2. Password is hashed using bcrypt and stored in the database.
3. User logs in with username and password.
4. Server validates the password and returns a JWT token.
5. Client includes the JWT token in the ``Authorization`` header
   for subsequent requests.

Endpoints
~~~~~~~~~

- ``POST /api/auth/register`` — Create a new user account.
- ``POST /api/auth/login`` — Authenticate and receive a JWT token.
- ``GET /api/auth/me`` — Get the current user's profile.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Get the current authenticated user's information.

**Creating New Items**

* **Create**: Register a new user account.
* **Create**: Login and receive a JWT access token.
