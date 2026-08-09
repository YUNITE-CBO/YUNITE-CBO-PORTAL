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
  // All request processing is wrapped in try/catch so an unexpected throw
  // (e.g. malformed callback URL or a response write on a closed socket)
  // is reported and the connection closed, rather than surfacing as an
  // unhandled promise rejection that hangs the HTTP client and leaves the
  // process in a broken state.
  try {
    if (!req.url.startsWith("/oauth2callback")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

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

    // Guard the error-path response writes too: a throw here (e.g. writing
    // to an already-closed/destroyed socket) would escape the catch and
    // surface as an unhandled promise rejection, crashing the script - the
    // same class of issue this handler exists to prevent.
    if (!res.headersSent) {
      try {
        res.writeHead(500);
        res.end("OAuth authorization failed.");
      } catch (writeError) {
        // The socket may have been destroyed before we could respond;
        // ending it is best-effort and must not mask the original error.
        console.error("Failed to send error response:", writeError.message);
        if (!res.writableEnded) {
          try { res.end(); } catch {}
        }
      }
    } else if (!res.writableEnded) {
      // Headers were already sent (e.g. writeHead(200) ran before the
      // throw), so finish the response to avoid leaving the client hanging.
      try { res.end(); } catch {}
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

// Last-resort safety net: if anything escapes the handler try/catch above
// (e.g. an un-awaited async callback or a throw inside a googleapis
// internal listener), surface it cleanly instead of crashing as an
// unhandled rejection that leaves the listening socket open.
const handleFatal = (label, error) => {
  console.error("");
  console.error(`ERROR: ${label}:`);
  console.error(error?.message || error);
  console.error("");
  try {
    server.close();
  } catch (_) {
    // server may already be closed or not yet listening; ignore
  }
  process.exit(1);
};

process.on("uncaughtException", (error) => handleFatal("uncaught exception", error));
process.on("unhandledRejection", (error) => handleFatal("unhandled promise rejection", error));

server.listen(3000, "localhost", () => {
  console.log("OAuth callback server listening on http://localhost:3000");
});
