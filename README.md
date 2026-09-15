# Multi Profiles — Browser Profile Testing Lab

A controlled testing dashboard for comparing what a website can legitimately observe when accessed from different browser profiles (same device, independent profiles).

## Status

Implemented and working. Node.js + Express backend, vanilla HTML/CSS/JS frontend, in-memory session & history store.

## Project structure

```
multi-profiles/
├── README.md
├── package.json
├── server.js              # Express app: sessions, APIs, static file serving
├── .env.example           # documented environment variables (no real secrets)
├── .gitignore
└── public/
    ├── index.html         # dashboard UI
    ├── style.css
    └── app.js             # fetches API data, renders dashboard, handles login/compare
```

## Features

- **Session tracking** — each visitor gets a cookie-backed session (`express-session`, in-memory store). Dashboard shows session ID, creation time, last activity, and whether the cookie was present on this request.
- **Server-side observed info** — timestamp, IP as seen by the server, `User-Agent`, `Accept-Language`, `Referer`.
- **Browser-side observed info** — language, timezone, screen size, viewport size, device pixel ratio, platform, color depth, online status (collected via standard `navigator`/`screen`/`Intl` APIs).
- **Dummy local test login** — username `test` / password `test123`, defined locally only. The password is never stored in plaintext (only a SHA-256 hash is kept in memory, compared with a timing-safe check). This is **not** a real Facebook/Google/etc. login.
- **Test history** — every "Run new test" click records a test with server + browser data, kept in an in-memory array (capped at 200 entries).
- **Side-by-side comparison** — select two or more history rows and compare their observed fields in a table.

## API

| Method | Path                   | Description                                                    |
|--------|------------------------|------------------------------------------------------------------|
| GET    | `/api/session`         | Current session ID, timestamps, cookie/login status              |
| GET    | `/api/test`            | Server-observable request info (no recording)                    |
| POST   | `/api/test`            | Records a test (`{ client: {...} }` body) and returns it          |
| GET    | `/api/history?limit=`  | Recent test records, newest first (default/limit 50, max 200)    |
| GET    | `/api/history/:testId` | Single test record                                                |
| GET    | `/api/history/export?format=json\|csv&ids=a,b` | Downloads history (all, or selected IDs) as a JSON or CSV file |
| GET    | `/api/compare?ids=a,b` | Test records for the given comma-separated IDs, in order          |
| POST   | `/api/login`           | `{ username, password }` — dummy local credentials only           |
| POST   | `/api/logout`          | Clears the logged-in user from the session                        |

All API errors return JSON (`{ "error": ... }` or `{ "success": false, "message": ... }`); server exceptions are logged server-side without leaking stack traces to clients.

## Local development

```bash
npm install
npm start
```

Open <http://localhost:3000>.

The server respects `process.env.PORT` (defaults to `3000`), so it also works unmodified in Codespaces and on Railway.

## Environment variables

See [.env.example](.env.example):

- `PORT` — port to listen on (Railway sets this automatically).
- `SESSION_SECRET` — secret used to sign the session cookie. Set a strong random value in production.
- `NODE_ENV` — set to `production` to enable secure (HTTPS-only) session cookies.
- `TRUST_PROXY` — number of reverse-proxy hops in front of the app. Set to `1` on Railway so the real client IP (from `X-Forwarded-For`) is reported correctly. Leave unset locally/direct-access so a client can't spoof its own IP by sending that header itself.

No real secrets are committed; `.env` is git-ignored.

## Deploying to Railway

1. Push this repository to GitHub.
2. Create a new Railway project from the repo.
3. Set the `SESSION_SECRET` variable, `TRUST_PROXY=1` (so the reported IP is the real visitor, not Railway's edge), and optionally `NODE_ENV=production`.
4. Railway auto-detects `npm start` and injects `PORT`; no other configuration is required.
5. Access the generated public HTTPS URL from separate browser profiles to compare results.

## Testing performed

- `npm install` completed with 0 vulnerabilities.
- `npm start` boots the server on port 3000.
- Verified via curl: `/`, `/api/session`, `/api/test` (GET/POST), `/api/history`, `/api/login` (success and invalid-credentials cases), `/api/compare`, and an unmatched `/api/...` route (returns 404 JSON).

## Notes on interpretation

The dashboard reports only what was actually observed (IP, headers, browser API values). It does not claim that two profiles are "the same" or "different" devices — that interpretation is left to the person running the test.

## Security & scope

- Only test systems/accounts you own or are authorized to test.
- No real third-party authentication is implemented or required.
- No plaintext password storage; dummy credentials only.

---

# Original AI Project Specification

The sections below are the original specification this project was built from, kept for reference.

 ## AI AGENT INSTRUCTIONS

 **If you are an AI coding agent working in this repository, read this README completely before making changes.**

 Your job is to build and maintain the application described below.

 Do not just explain what should be done. **Implement the project directly in the repository.**

 After reading this README:

 1. Inspect the existing repository files.
2. Determine what already exists.
3. Create the missing project files.
4. Install/configure the required dependencies.
5. Build the application.
6. Run the application locally.
7. Test the important functionality.
8. Fix any errors you encounter.
9. Keep the project deployable to Railway.
10. Update this README if the implementation changes.

 Do not ask unnecessary questions when a reasonable implementation decision can be made.

---

 # 1\. Project Goal

 We are building a **controlled browser-profile testing website**.

 The purpose is to access the same test website from multiple independent browser profiles and compare the information that the website can legitimately observe.

 Example:

```
One physical device
       │
       ├── Browser Profile A
       │       ↓
       │   Test Website
       │
       ├── Browser Profile B
       │       ↓
       │   Test Website
       │
       └── Browser Profile C
               ↓
           Test Website
```

 The application is a testing laboratory.

 It is **not** an anti-detect browser and does not need to create browser fingerprints.

 The browser profiles are provided externally by the browser software being tested.

---

 # 2\. Main Objective

 Build a simple web application that allows us to determine:

 > "What information does our website receive when different browser profiles access the same website?"

 The application should make the results easy to see and compare.

 We want a clean dashboard rather than a complicated website.

---

 # 3\. Core Features

 The application should have the following features.

 ## 3.1 Test Dashboard

 Create a clean dashboard with:

 - Project title
- Current session information
- Browser/client information
- Network information available to the server
- Browser-side information available through normal browser APIs
- Visit timestamp
- Unique test/session identifier

 The UI should be easy to understand.

---

 # 4\. Information Collection

 Only collect information that is normally available to a website through standard HTTP requests or browser APIs.

 ## Server-side information

 The backend may record/display:

 - Request timestamp
- IP address as observed by the server
- User-Agent
- Accept-Language
- Referer
- Relevant standard request headers
- Session identifier

 Do not collect unnecessary personal information.

---

 ## Browser-side information

 The frontend may display information legitimately exposed through standard browser APIs, such as:

 - Browser language
- Timezone
- Screen width/height
- Viewport width/height
- Device pixel ratio
- Platform information where available
- Browser capabilities where appropriate
- Color depth
- Online/offline state

 Clearly label browser-side values separately from server-side values.

---

 # 5\. Session Testing

 Create a simple test session system.

 Each visitor should receive a unique session/test identifier.

 The application should demonstrate:

 - Whether a session cookie exists
- Whether the same session persists after refresh
- Whether different browser profiles receive separate sessions
- Session creation time
- Last activity time

 Do not require real third-party accounts.

---

 # 6\. Test Login

 Create a **dummy test login** for session testing.

 Important:

 This must NOT be a real Facebook, Google, Instagram, or other third-party login.

 Use only locally defined dummy test credentials.

 Example:

```
Username: test
Password: test123
```

 The login is only intended to demonstrate session persistence.

 Do not store plaintext real passwords.

---

 # 7\. Comparison View

 Create a useful comparison interface.

 The user should be able to see test results from different sessions side by side.

 Example:

```
---------------------------------------------------------
                    PROFILE TEST
---------------------------------------------------------

                    Profile A       Profile B
---------------------------------------------------------
Session ID          abc123           xyz789
IP                  x.x.x.x          x.x.x.x
Language            en-US            en-US
Timezone            America/...      America/...
Screen              1920x1080        1920x1080
User-Agent          ...              ...
---------------------------------------------------------
```

 The comparison system should focus on **observable application-level information**.

---

 # 8\. Test History

 If practical, implement a simple test-history page.

 It should show previous test sessions with:

 - Test ID
- Timestamp
- Session status
- Basic observable information

 For the initial version, in-memory storage is acceptable.

 If persistent storage is required later, design the application so a database can be added without rewriting the entire project.

---

 # 9\. Technology

 Use a simple and maintainable stack.

 Preferred:

 - Node.js
- Express
- HTML
- CSS
- Vanilla JavaScript

 Avoid unnecessary frameworks unless there is a strong reason to use them.

 The application should remain lightweight.

---

 # 10\. Required Project Structure

 Create this structure:

```
multi-profiles/
│
├── README.md
├── package.json
├── server.js
│
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

 Additional files may be added when necessary.

---

 # 11\. Backend Requirements

 Create an Express server.

 The server must:

 - Serve the frontend
- Provide API endpoints for test information
- Generate/manage test sessions
- Record basic test history
- Return server-observable request information
- Respect the `PORT` environment variable

 Use:

```
const PORT = process.env.PORT || 3000;
```

 The application must work both locally and on Railway.

---

 # 12\. Frontend Requirements

 Create a responsive dashboard.

 Design goals:

 - Clean
- Modern
- Fast
- Mobile-friendly
- Easy to read
- No unnecessary animations
- Clear distinction between server-side and browser-side data

 Use plain HTML/CSS/JavaScript unless a framework becomes necessary.

---

 # 13\. API Design

 Create simple JSON APIs.

 For example:

```
GET /api/test
GET /api/session
POST /api/login
GET /api/history
```

 The exact API structure can be improved by the AI agent if necessary.

 Keep the API simple and documented.

---

 # 14\. Local Development

 The application must run with:

```
npm install
npm start
```

 Expected local URL:

```
http://localhost:3000
```

 The AI agent should test this before considering the implementation complete.

---

 # 15\. Railway Deployment

 The application will eventually be deployed to Railway.

 The project must therefore:

 - Use `process.env.PORT`
- Have a working `npm start` script
- Not depend on localhost
- Not hard-code development URLs
- Serve the application from the Express server
- Work correctly behind Railway's HTTPS reverse proxy

 Expected deployment flow:

```
GitHub Repository
       ↓
Railway
       ↓
Node.js Application
       ↓
Public HTTPS URL
       ↓
Browser Profile Testing
```

---

 # 16\. GitHub Codespaces

 This project is being developed primarily through **GitHub Codespaces with an AI coding agent**.

 The AI agent should assume that it has access to the repository workspace.

 When asked to build or modify the project:

 1. Inspect files first.
2. Implement changes directly.
3. Run relevant commands.
4. Test the application.
5. Fix errors.
6. Summarize what was changed.

 Do not only provide theoretical instructions.

---

 # 17\. Testing Procedure

 After implementation, perform basic testing.

 ### Test A — Local Application

 Run:

```
npm install
npm start
```

 Open:

```
http://localhost:3000
```

 Verify that the dashboard loads.

---

 ### Test B — Session

 Open the website.

 Refresh the page.

 Verify that the session behaves consistently.

---

 ### Test C — Separate Browser Profiles

 After deployment, open the public test URL from separate browser profiles.

 Example:

```
Profile A → Test URL
Profile B → Test URL
Profile C → Test URL
```

 Compare the observable results.

---

 # 18\. Important Testing Principle

 Change **one variable at a time** whenever possible.

 For example:

```
Test 1:
Same network
Different browser profiles

Test 2:
Different network
Same browser profile

Test 3:
Different profiles + different authorized networks
```

 This makes the results easier to interpret.

---

 # 19\. Data Interpretation

 The application must not claim:

 > "These profiles are definitely different devices."

 Instead, it should report the actual observable values.

 For example:

```
Server observed:
IP: same
User-Agent: different
Language: same
Timezone: different
Session: different
```

 The application should let the user interpret the results.

 Do not make unsupported claims about how a third-party platform will classify the profiles.

---

 # 20\. Security & Privacy

 This is a controlled testing application.

 Only test systems, accounts, and infrastructure that you own or are authorized to test.

 Do not implement features intended to:

 - Bypass third-party security
- Evade anti-abuse systems
- Circumvent account restrictions
- Collect other people's passwords
- Track users without authorization
- Impersonate third-party login systems
- Defeat third-party fingerprinting or risk systems

 Use dummy credentials and test accounts.

---

 # 21\. Error Handling

 Implement basic error handling.

 The application should:

 - Return useful HTTP status codes
- Handle invalid API requests
- Handle missing session information
- Avoid exposing stack traces to normal users
- Log useful server-side errors during development

---

 # 22\. Environment Variables

 If environment variables are needed, document them in the README.

 Create an example file when appropriate:

```
.env.example
```

 Never commit real secrets, API keys, passwords, or credentials.

---

 # 23\. Code Quality

 Keep the code:

 - Simple
- Readable
- Modular
- Commented where useful
- Easy for another developer to understand

 Avoid unnecessary dependencies.

 Do not introduce complex infrastructure for a simple testing application.

---

 # 24\. Definition of Done

 The project is considered complete for the initial version when:

 - [ ] Node.js project is configured
- [ ] Express server works
- [ ] Frontend loads correctly
- [ ] Dashboard is responsive
- [ ] Server-side test information is displayed
- [ ] Browser-side test information is displayed
- [ ] Session ID works
- [ ] Dummy login works
- [ ] Test history works
- [ ] `npm install` works
- [ ] `npm start` works
- [ ] Application works on `localhost:3000`
- [ ] Railway deployment requirements are satisfied
- [ ] No real third-party credentials are required
- [ ] README accurately describes the implementation

---

 # 25\. AI Agent Final Instructions

 **Start by inspecting the repository.**

 If the repository is empty or only contains this README:

 1. Create the Node.js project.
2. Create all required files.
3. Install dependencies.
4. Implement the application.
5. Run it locally.
6. Test all major endpoints.
7. Fix any errors.
8. Make the UI polished and usable.
9. Ensure Railway deployment compatibility.
10. Update the README only where implementation details differ from this specification.

 Do not stop after creating a plan.

 **Implement the application.**

 The final result should be a working browser-profile testing laboratory that can be deployed from GitHub to Railway and accessed through a public HTTPS URL.