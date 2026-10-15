# Demo authentication status

This trial build verifies the login in the browser using a SHA-256 password hash stored in `localStorage`. The login screen displays that hash. The known demo account uses the former account email and password, so the existing demo credentials continue to work.

This is a convenience gate only. Browser storage can be edited, and the API routes are currently open to requests allowed by CORS. Backend authentication and stronger credential handling are intentionally deferred until the security design is revisited.

The backend auth routes and hash-generation script remain in the repository as a reference for re-enabling server authentication later. Their environment variables are not required for this demo build.
