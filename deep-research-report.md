# Connecting Wix Headless LinkChat Frontend to a Node.js Backend

**Executive Summary:** The published LinkChat site (Wix Headless) lives on a Wix-managed domain (e.g. `https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com/`). All chat interactions (REST and real-time) will call a Node.js API which you host separately. The frontend uses Wix Members for login; after a user signs in via Wix, Wix issues a JWT (with an access token and refresh token) that your frontend sends to your backend on each request. The backend must verify these tokens. Required values like `JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` are not hard-coded in the project – you obtain them from your Wix Headless project’s OAuth settings or Developer Center. Below we detail the live site URL, any allowed origin settings, how to find and use the JWT configuration, recommendations for your backend domain (DNS/TLS setup), and example code for verifying Wix-issued JWTs in Node.js (using jwks-rsa or jose) as well as frontend token handling. Security notes on CORS and deployment are included. 

| **Item** | **Value (from project or Wix settings)** |
|----------|------------------------------------------|
| **Published site URL** | https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com/ (the live Wix-hosted LinkChat site). |
| **Allowed origin(s)** | By default, the site’s own domain (above) is the origin for requests. In your Wix Headless *OAuth Settings*, list this URL in *Authorized Domains/Redirect URIs* (must match exactly). If you add a custom domain, include it here too. |
| **Config file(s)** | `wix.config.json` in your project root links the code to this Wix Headless app. It contains your app’s `appId` (client ID). Any Astro config or `.wixrc.json` (if present) lives alongside it. |

**JWT Setup (Members Login):** LinkChat uses the Wix Members login flow. The Wix SDK (client-side) handles OAuth with PKCE: it redirects the user to Wix’s hosted login page and then exchanges the authorization code for tokens. The *tokens object* returned includes an **access token** (JWT) and a **refresh token**. You then supply the access token in calls to your backend for authentication. 

- **Obtaining JWT values:** The exact values for `JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` are not explicitly in your downloaded code. Instead, they come from your Wix Headless project’s OAuth settings. For example:
  - **JWT_ISSUER:** Typically the Wix Auth server domain (e.g. `https://accounts.wix.com` or `https://api.wix.com`) that issued the token. You can confirm the issuer by inspecting a logged-in member token (the `iss` claim). Wix’s docs note that member tokens are signed by your app’s public key, so the issuer is Wix itself. 
  - **JWT_AUDIENCE:** Often this is your *Client ID* or *Site ID* as registered with Wix. Check the Headless Settings (OAuth) page in your Wix dashboard to see the audience/Client ID. This ensures your backend only accepts tokens intended for your app. 
  - **JWT_JWKS_URL:** Wix may not publish a standard JWKS endpoint. Instead, tokens are signed with a key pair managed in the Wix Developer Center. As [60] explains, the returned JWT (“signedToken”) can be verified with *your* public key (found under your app’s *ID & Keys* in Wix). To verify in Node.js, you can either use the static public key or point jwks-rsa to your Developer-Center key endpoint if available. (If Wix offered an OpenID configuration, it would list a `jwks_uri`; check your Wix App dashboard for any JWKS URLs.)

If you cannot locate a JWKS URL, treat the tokens like any custom-signed JWT: download the public key from **Manage Wix → My Apps → [Your App] → View ID & Keys**, and configure your backend to use that key for verification. Document any values not discoverable (e.g. if audience is your site ID, note “Site ID from Wix Headless settings”).  

**Backend Domain and Endpoints:** Choose a domain or subdomain for your chat API (e.g. `api.example.com` or `chat.example.com`). For example, if your main site is `linkchat.com`, you could use `api.linkchat.com` or `backend.linkchat.com`. **DNS/TLS steps:** In your DNS provider, create an A record (or CNAME) for the chosen subdomain pointing to your server’s IP (or your cloud service). Obtain an SSL certificate for that domain (Let’s Encrypt, Cloudflare, AWS ACM, etc.) and configure HTTPS on your Node server. For Socket.IO (real-time messaging), ensure your backend listens on a secure WebSocket path (e.g. `wss://api.linkchat.com`) and that your certificate is valid. 

For example:
- **DNS:** 
  1. Add `A` record: `api.linkchat.com → <your-server-ip>` (or CNAME to host).
  2. Wait for propagation. 
- **TLS:** 
  - If self-hosting: use Certbot (Let’s Encrypt) with the domain to get `fullchain.pem` and `privkey.pem`, then configure Node/Express to use these for HTTPS (or use a reverse proxy like Nginx with HTTPS).
  - If using a platform (Heroku, AWS Elastic Beanstalk, Vercel, etc.): use their SSL setup to point `api.linkchat.com` and provision certs. 
- **Endpoints:** In your Node.js code, expose REST routes (e.g. `GET/POST /messages`) and Socket.IO on the same domain. Use CORS to allow requests from your Wix site’s origin (see below).

```mermaid
flowchart LR
    F[Wix Headless Frontend (Astro)] 
    B[Node.js Backend (Express + Socket.IO)] 
    F -- HTTPS (REST, with JWT auth) --> B
    F -- WebSocket (wss://, JWT auth) --> B
    B --> DB[(Database/CMS)]
```

**Code Snippets (JWT Verification & Token Usage):** On the **backend (Node.js/Express)**, verify Wix-issued JWTs using a JWKS client or a static public key. For example, using **jwks-rsa + jsonwebtoken**:

```js
// Using jwks-rsa and express-jwt
const express = require('express');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const client = jwksClient({ 
  jwksUri: process.env.JWT_JWKS_URL  // e.g. 'https://accounts.wix.com/.well-known/jwks.json'
});
function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const pubkey = key.getPublicKey();
    callback(null, pubkey);
  });
}
const verifyOptions = {
  algorithms: ['RS256'],
  issuer: process.env.JWT_ISSUER,       // e.g. 'https://accounts.wix.com'
  audience: process.env.JWT_AUDIENCE,   // e.g. your Wix client ID
};
const app = express();
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('No token');
  jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
    if (err) return res.status(401).send('Token invalid');
    req.user = decoded; // contains member data (e.g. user id)
    next();
  });
});
// Example protected route
app.get('/api/messages', (req, res) => {
  // req.user now has info from the JWT (e.g. member ID)
  res.json({ messages: [...] });
});
```

Alternatively, using **jose** and RemoteJWKSet:

```js
import { createServer } from 'http';
import { Server } from 'socket.io';
import { jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL(process.env.JWT_JWKS_URL));
async function verifyToken(token) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  });
  return payload;
}
const server = createServer(/* your express app */);
const io = new Server(server, { 
  cors: { origin: [process.env.FRONTEND_ORIGIN], methods: ["GET","POST"], credentials: true }
});
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const payload = await verifyToken(token);
    socket.user = payload; // attach member info
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});
io.on('connection', socket => {
  // socket.user contains the authenticated user info
  socket.on('chat message', msg => {
    // handle incoming message
    io.emit('chat message', { user: socket.user.id, text: msg });
  });
});
```

On the **frontend**, after the user logs in via Wix’s login page, you exchange the code for tokens (as shown in Wix’s docs). For example (pseudo-code):

```js
import { createClient } from 'wix-headless-client';
const wixClient = createClient({ clientId: 'YOUR_WIX_CLIENT_ID' });

// 1. Generate login URL and redirect user:
const { redirectUri, codeVerifier } = /* previously saved from getAuthorizationRedirect */;
const loginResponse = await wixClient.auth.getAuthorizationUrl({ redirectUri });
window.location.href = loginResponse.url;

// 2. After redirect back to your app, exchange code for tokens:
const params = new URLSearchParams(window.location.hash.slice(1));
const code = params.get('code');
if (code) {
  const tokens = await wixClient.auth.generateAuthToken({ 
    code, codeVerifier, redirectUri 
  });
  // e.g. tokens.access_token and tokens.refresh_token
  sessionStorage.setItem('accessToken', tokens.access_token);
}
// 3. Use the access token in API calls:
const token = sessionStorage.getItem('accessToken');
fetch('https://api.linkchat.com/api/messages', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(...);
```

Here we use `tokens.access_token` (a JWT) to authenticate. The backend code (above) will validate this token. For real-time chat, pass the token in the Socket.IO handshake:

```js
import { io } from 'socket.io-client';
const socket = io('https://api.linkchat.com', {
  auth: { token: sessionStorage.getItem('accessToken') }
});
socket.on('connect', () => {
  console.log('Connected as user', socket.id);
});
socket.emit('chat message', 'Hello everyone!');
```

**CORS, Security, and Deployment Notes:** 
- **CORS:** Configure your backend (or API gateway) to allow the frontend origin (e.g. `https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com`) in its CORS policy. In Express, you might use the `cors` middleware or manually set `Access-Control-Allow-Origin`. For Socket.IO, the `cors` option above specifies allowed origins. 
- **HTTPS:** Always serve the API over HTTPS. If you use a public cloud (AWS, Heroku, etc.), enable their SSL (often they give a `*.herokuapp.com` or use ACM certificates). If self-hosted, use Let’s Encrypt or another CA. 
- **Token Security:** Do NOT expose your refresh tokens in the browser. Store them securely (e.g. HttpOnly cookies or only on server side). The frontend should only handle short-lived access tokens for API calls. 
- **Persistence:** For CMS (chat history), use a secure database or Wix CMS (via API). Only allow authenticated users to read/write their messages. 
- **Deployment:** Deploy your Node.js app to a reliable host (e.g. AWS EC2/Elastic Beanstalk, DigitalOcean, etc.). Use a process manager (PM2) and enable logging/monitoring. Ensure your DNS and SSL are properly configured before going live. 

**Sources:** The Wix Headless and Members SDK docs describe the login/token flow and app config. For example, Wix requires your `redirectUri` to match the allowed URIs in Headless Settings, and the returned tokens include an access token (JWT) and refresh token. The official docs also note that the member token (`signedToken`) is signed with your app’s public key (available in the Wix Developer Center). Configuration files like `wix.config.json` link your frontend code to the Wix Headless app. (Values not directly in code must be obtained from your Wix dashboard as noted.) All tokens and secrets should be treated per OAuth best practices. 

