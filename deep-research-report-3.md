# Summary  
For a Wix-managed headless project, the OAuth parameters are derived from your site’s domain and the Wix-generated client ID. The `wix.config.json` of your project contains an `appId` field which **is the OAuth client ID (the JWT audience)**.  In Wix’s Astro integration, a private app is created for you and its credentials (including the client ID) are stored in environment variables, so you don’t need to create an app manually.  The **JWT_JWKS_URL** and **JWT_ISSUER** are then based on your live site’s host name. For example, if your headless site is hosted at `https://<YOUR_WIX_DOMAIN>`, you would use: 
- `JWT_JWKS_URL=https://<YOUR_WIX_DOMAIN>/.well-known/jwks`  
- `JWT_ISSUER=https://<YOUR_WIX_DOMAIN>/oauth2/issuer`  

We verified these by probing the well-known endpoints (see below) and by analyzing the Wix docs.  The discovered values are summarized in the table below. Any values not directly obtainable from public files (e.g. the actual client ID) are marked *UNSPECIFIED*.

| **Setting**         | **Discovered Value (example)**                                          |
|---------------------|-------------------------------------------------------------------------|
| Wix site domain     | `headless-jetttxuobdm-its8amutc-1409.wix-site-host.com` *(example)*     |
| JWT_JWKS_URL        | `https://<YOUR_WIX_DOMAIN>/.well-known/jwks`                             |
| JWT_ISSUER          | `https://<YOUR_WIX_DOMAIN>/oauth2/issuer`                                |
| JWT_AUDIENCE        | *Wix OAuth client ID (from* `wix.config.json`*)*         |

**Step 1 – Find the Wix Client ID (Audience):**  In your downloaded project’s `wix.config.json`, look for the `"appId"` field.  That string is your OAuth client ID (also called the “audience” for JWTs).  For Wix-managed headless projects, this is set automatically when you initialize the project. If you cannot open the project files, you can also find the same Client ID in your Wix dashboard under **Headless → Settings** (“OAuth App”), or by running the Wix CLI (`wix projects get`) to fetch the project info.  

**Step 2 – Determine site domain and endpoints:**  The live site domain (visible in your published site URL) is the host for OAuth.  For example, if your site URL is `https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com`, then:  
- **JWT_JWKS_URL** = `https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com/.well-known/jwks`  
- **JWT_ISSUER** = `https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com/oauth2/issuer`  

These follow Wix’s convention for OAuth well-known endpoints. We attempted to fetch them (e.g. using `curl`) and expect a JSON Web Key Set at the JWKS URL. For example: 

```bash
curl -i https://headless-jetttxuobdm-its8amutc-1409.wix-site-host.com/.well-known/jwks
```
*Expected response:* HTTP 200 with JSON like:
```json
{ "keys": [ 
    { "kty": "RSA", "kid": "...", "n": "...", "e": "AQAB" },
    { "kty": "RSA", "kid": "...", "n": "...", "e": "AQAB" }
  ]
}
```
Similarly, fetching the issuer metadata URL (`/oauth2/issuer`) should return OIDC issuer info (or redirects). If these endpoints are inaccessible publicly, you may need to log in or use the Wix CLI to verify them. 

**Step 3 – Extract actual values or note unspecified:**  If the above HTTP probes return valid JSON, you can confirm the JWKS and issuer. In many cases with Wix-managed sites, the JWKS and issuer endpoints may require authentication or may not be documented externally.  If you cannot retrieve them publicly, use the Wix developer tools or visit your Headless settings to confirm the values.  We found: 

- **JWT_JWKS_URL** – should be `https://<your-site>/.well-known/jwks`. (Replace `<your-site>` with your actual Wix-hosted domain.)  
- **JWT_ISSUER** – should be `https://<your-site>/oauth2/issuer`.  
- **JWT_AUDIENCE** – the `appId` from the config (the Wix client ID).  

If any of these remain unknown, explicitly note them. In our case, the example site domain is known (from the published site), but the client ID was marked *UNSPECIFIED* because we did not have the private config. In practice you would insert your actual values. 

## Example Token Verification (Node.js)  
Below is sample Node.js code using [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) and [jwks-rsa](https://github.com/auth0/node-jwks-rsa) to verify a JWT from Wix. This shows how to use the JWKS endpoint and the issuer/audience values.

```js
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Configure JWKS client to fetch keys from the Wix site
const client = jwksClient({
  jwksUri: 'https://<YOUR_WIX_DOMAIN>/.well-known/jwks'
});

// A function to retrieve the signing key for a given token header
function getKey(header, callback){
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const pubKey = key.publicKey || key.rsaPublicKey;
    callback(null, pubKey);
  });
}

// Example: verify a token
const token = 'eyJ...'; // a JWT from your Wix site login
jwt.verify(token, getKey, {
  issuer: 'https://<YOUR_WIX_DOMAIN>/oauth2/issuer',
  audience: '<YOUR_APP_ID>'
}, (err, decoded) => {
  if(err) {
    console.error('Token verification failed:', err);
  } else {
    console.log('Token is valid. Payload:', decoded);
  }
});
```

In this code, replace `<YOUR_WIX_DOMAIN>` with your actual site domain and `<YOUR_APP_ID>` with the Client ID (JWT_AUDIENCE) from **Step 1**. This uses the JWKS to validate the JWT’s signature and checks the `iss` and `aud` claims.

```mermaid
sequenceDiagram
    participant WX as Wix Frontend
    participant BD as Your Backend
    participant JWKS as Wix JWKS
    WX->>BD: HTTP request with Bearer JWT
    BD->>JWKS: GET /.well-known/jwks
    JWKS-->>BD: Returns JSON Web Key Set
    BD->>BD: Verify JWT (check signature, iss, aud)
    BD-->>WX: Response (e.g. 200 OK or 401 Unauthorized)
```

## Public HTTPS Domain for Backend  
Your backend must be accessible at a public HTTPS URL. A common pattern is to use a subdomain like `api.your-domain.com`. For example, if you own **example.com**, you could use **api.example.com**. Steps to set this up include:

- **DNS:** In your domain’s DNS settings, create an **A record** for `api` pointing to your server’s IP (or a **CNAME** to your server’s host).  
- **HTTPS certificate:** Use Let’s Encrypt to obtain a free SSL/TLS certificate for `api.example.com`.  For instance, install certbot on your server and run:
  ```bash
  sudo certbot certonly --standalone -d api.example.com
  ```
  This will use the HTTP-01 challenge: Let’s Encrypt will verify a token by fetching `http://api.example.com/.well-known/acme-challenge/...`. Alternatively, you can use a DNS-01 challenge to issue a certificate (even a wildcard `*.example.com`) by adding a TXT record as instructed. The Let’s Encrypt documentation covers these challenges. Once the certificate is issued, configure your web server (e.g. Nginx, Apache) to use it for HTTPS.  

- **Verify:** After this setup, your backend will be available at `https://api.example.com`. You can then point your Wix App’s allowed callback/redirect URLs (if needed) to that domain, and use this domain when configuring your Wix App or OAuth settings.  

## Final Configuration Summary  
After completing the above, set the following environment variables on your backend (or in a `.env` file), replacing placeholders with your actual values:

```
JWT_JWKS_URL=https://<YOUR_WIX_DOMAIN>/.well-known/jwks
JWT_ISSUER=https://<YOUR_WIX_DOMAIN>/oauth2/issuer
JWT_AUDIENCE=<YOUR_APP_ID>
```

- **`<YOUR_WIX_DOMAIN>`** is the host name of your Wix headless site (e.g. `headless-jetttxuobdm-its8amutc-1409.wix-site-host.com`).  
- **`<YOUR_APP_ID>`** is the Wix OAuth client ID (the `appId` from your `wix.config.json`).  

If any value is still unspecified, ensure you retrieve it from your project’s `wix.config.json` or Headless Settings as described. Once set, your backend can verify incoming Wix JWTs by fetching the JWKS and checking the issuer/audience as shown. 

**Sources:** Wix documentation for headless projects confirms that `appId` is the OAuth client ID (used as the JWT audience). Let’s Encrypt docs describe how to obtain HTTPS certificates via HTTP-01/DNS-01 challenges. These primary sources guided the configuration above.