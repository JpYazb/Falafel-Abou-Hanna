// server.js — serves public/, saves site reviews, and returns NEWEST 10 (Google + site)

import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---- Paths / constants ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const REVIEWS_FILE = path.join(__dirname, "site-reviews.json");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Security (CSP friendly for your inline styles) ----
app.use(
  helmet({
    hsts: false, // enable via your hosting when HTTPS is on
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "https://tb-static.uber.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);

app.use(cors());
app.use(express.json());

// ---- Static files ----
app.use(express.static(PUBLIC_DIR));

/* -------------------- Helpers (site reviews read/write) -------------------- */
function readSiteReviewsSafe() {
  try {
    if (!fs.existsSync(REVIEWS_FILE)) return [];
    const raw = fs.readFileSync(REVIEWS_FILE, "utf8").trim();
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data)) return data;               // [ ... ]
    if (data && Array.isArray(data.reviews)) return data.reviews; // { reviews: [ ... ] }
    return [];
  } catch (e) {
    console.error("[site-reviews.json] read error:", e);
    return [];
  }
}

function writeSiteReviewsSafe(list) {
  try {
    const arr = Array.isArray(list) ? list : [];
    fs.writeFileSync(REVIEWS_FILE, JSON.stringify(arr, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("[site-reviews.json] write error:", e);
    return false;
  }
}

/* -------------------- Reviews API -------------------- */

/**
 * POST /reviews/site
 * Saves a review submitted from your site into site-reviews.json (unchanged behavior).
 */
app.post("/reviews/site", (req, res) => {
  try {
    const { author_name, text, rating } = req.body || {};
    const review = {
      source: "site",
      author_name: (author_name || "Customer").toString().trim(),
      text: (text || "").toString().trim(),
      rating: Number(rating) || 0,
      time: Math.floor(Date.now() / 1000), // seconds
    };

    if (!review.author_name || !review.text) {
      return res.status(400).json({ error: "name_and_text_required" });
    }
    if (review.rating < 0) review.rating = 0;
    if (review.rating > 5) review.rating = 5;

    const arr = readSiteReviewsSafe();
    arr.unshift(review); // newest first
    if (!writeSiteReviewsSafe(arr)) {
      return res.status(500).json({ error: "Failed to save review" });
    }
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error("[/reviews/site] write error:", e);
    return res.status(500).json({ error: "Failed to save review" });
  }
});

/**
 * GET /reviews
 * Returns the newest 10 combined reviews:
 *  - Up to 5 newest Google reviews (Places v1 returns at most 5)
 *  - Your site reviews from site-reviews.json
 * Sorted by time (newest first), with Cache-Control: no-store.
 */
app.get("/reviews", async (req, res) => {
  try {
    // 1) Load site reviews and normalize time to epoch seconds
    const siteRaw = readSiteReviewsSafe();
    const siteReviews = siteRaw.map((r) => {
      let t = r.time;
      if (typeof t === "string") {
        const ms = Date.parse(t);
        t = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
      } else if (typeof t === "number" && t > 1e12) {
        t = Math.floor(t / 1000); // ms -> s
      } else if (typeof t !== "number") {
        t = 0;
      }
      return {
        source: "site",
        author_name: r.author_name || "Customer",
        text: r.text || "",
        rating: Number(r.rating || 0),
        time: t,
      };
    });

    // 2) Fetch newest Google reviews (Places API v1)
    const PLACE_ID = process.env.GOOGLE_PLACE_ID;
    const API_KEY = process.env.GOOGLE_API_KEY;

    let googleReviews = [];
    if (PLACE_ID && API_KEY) {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
        PLACE_ID
      )}?fields=reviews&key=${encodeURIComponent(API_KEY)}`;

      try {
        const r = await fetch(url); // Node 18+ global fetch
        const data = await r.json();

        googleReviews = (data.reviews || [])
          .map((rv) => {
            let t = 0;
            if (rv.publishTime) {
              const ms = Date.parse(rv.publishTime);
              t = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
            }
            return {
              source: "google",
              author_name: rv.authorAttribution?.displayName || "Google User",
              text: rv.text?.text || "",
              rating: Number(rv.rating || 0),
              time: t,
            };
          })
          .sort((a, b) => (b.time || 0) - (a.time || 0)); // newest-first among Google
      } catch (err) {
        console.warn("[/reviews] Google fetch failed; returning site-only:", err);
      }
    }

    // 3) Merge, sort newest overall, cap to 10, and disable caching
    const merged = [...googleReviews, ...siteReviews]
      .filter((r) => r && Number.isFinite(r.time))
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 10);

    res.set("Cache-Control", "no-store");
    return res.json(merged);
  } catch (e) {
    console.error("[/reviews] error:", e);
    return res.status(500).json({ error: "Failed to load reviews" });
  }
});

/* -------------------- SPA fallback & 404 -------------------- */
app.get("*", (req, res, next) => {
  // skip SPA fallback for direct asset requests
  if (req.method === "GET" && path.extname(req.path)) return next();
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((req, res) => res.status(404).send("Not found: " + req.path));

/* -------------------- Start -------------------- */
app.listen(PORT, () => {
  console.log(`✅ Secure server running at http://localhost:${PORT}`);
  console.log(`[reviews] Using file: ${REVIEWS_FILE}`);
});
