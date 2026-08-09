const http = require("http");
const { google } = require("googleapis");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const REDIRECT_URI = "http://localhost:3000/oauth2callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("");
  console.error("ERROR: Google OAuth credentials are missing.");
  console.error("");
  console.error("Set these environment variables before running:");
  console.error("GOOGLE_CLIENT_ID");
  console.error("GOOGLE_CLIENT_SECRET");
  console.error("");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/gmail.send"
  ],
});

console.log("");
console.log("========================================");
console.log("YUNITE GOOGLE OAUTH");
console.log("========================================");
console.log("");
console.log("Open this URL in your browser:");
console.log("");
console.log(authUrl);
console.log("");
console.log("Waiting for Google authorization...");
console.log("");
console.log("OAuth callback server:");
console.log(REDIRECT_URI);
console.log("");

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/oauth2callback")) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // All request processing is wrapped in try/catch so an unexpected throw
  // (e.g. malformed callback URL) is reported and the connection closed,
  // rather than surfacing as an unhandled promise rejection that hangs the
  // HTTP client and leaves the process in a broken state.
  try {
    const url = new URL(req.url, REDIRECT_URI);
    const code = url.searchParams.get("code");

    if (!code) {
      res.writeHead(400);
      res.end("Authorization code missing.");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, {
      "Content-Type": "text/html"
    });

    res.end(`
      <h2>YUNITE Google authorization successful.</h2>
      <p>You can close this browser window and return to CMD.</p>
    `);

    console.log("");
    console.log("========================================");
    console.log("GOOGLE REFRESH TOKEN");
    console.log("========================================");
    console.log("");
    console.log(tokens.refresh_token || "No refresh token returned.");
    console.log("");
    console.log("========================================");
    console.log("");

    server.close();
  } catch (error) {
    console.error("");
    console.error("OAuth callback handling failed:");
    console.error(error.response?.data || error.message);

    if (!res.headersSent) {
      res.writeHead(500);
      res.end("OAuth authorization failed.");
    }

    server.close();
  }
});

// Handle listener errors (e.g. EADDRINUSE when port 3000 is already taken by
// `next dev`) so the script exits cleanly with a helpful message instead of
// crashing via an unhandled 'error' event.
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error(`ERROR: Port 3000 is already in use.`);
    console.error("       This is the default Next.js dev server port.");
    console.error("       Stop the other process (e.g. `npm run dev`) and re-run");
    console.error("       this script, or update REDIRECT_URI to use another port");
    console.error("       in both this script and the Google Cloud Console.");
    console.error("");
  } else {
    console.error("");
    console.error("ERROR: OAuth callback server failed to start:");
    console.error(error.message);
    console.error("");
  }
  process.exit(1);
});

server.listen(3000, "localhost", () => {
  console.log("OAuth callback server listening on http://localhost:3000");
});
