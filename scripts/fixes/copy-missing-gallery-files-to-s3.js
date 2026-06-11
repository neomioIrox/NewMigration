/**
 * Copy gallery image files that are missing from S3.
 *
 * Background: all legacy images were bulk-uploaded to S3 under 2020/01/, but a
 * full sweep (2026-06-10) found 4 GaleryPics files missing from the bucket.
 * All 4 exist on the old server at https://services.kupat.org.il/images/{Pic}.
 *
 * This script downloads each missing file from the old server and uploads it
 * to s3://kupat-hair-data/2020/01/{Pic} so the migrated Media rows resolve.
 *
 * Requires AWS credentials in .env (not currently present there):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  (and optionally AWS_REGION)
 * Requires dependency for --execute: @aws-sdk/client-s3  (cd server && npm i @aws-sdk/client-s3)
 *
 * Usage:
 *   node scripts/fixes/copy-missing-gallery-files-to-s3.js --dry-run   # verify only
 *   node scripts/fixes/copy-missing-gallery-files-to-s3.js --execute   # upload
 */
const path = require("path");
require(path.join(__dirname, "../../server/node_modules/dotenv")).config({
  path: path.join(__dirname, "../../.env"),
});
const https = require("https");

const DRY_RUN = !process.argv.includes("--execute");

const BUCKET = "kupat-hair-data";
const REGION = process.env.AWS_REGION || "us-west-2";
const S3_PREFIX = "2020/01/";
const OLD_BASE = "https://services.kupat.org.il/images/";

// Found missing in the full S3 sweep of all 1,230 GaleryPics (2026-06-10)
const MISSING = [
  { galeryPicsId: 252, galeryId: 12, pic: "ראח' (1) (1024x768).jpg" },
  { galeryPicsId: 253, galeryId: 12, pic: "ראח' (2) (1024x768).jpg" },
  { galeryPicsId: 3026, galeryId: 104, pic: "Rav Galay(1).jpg" },
  { galeryPicsId: 3164, galeryId: 126, pic: "הגרג אדלשטיין בג' בשלח(1).jpg" },
];

function encodeKeyForUrl(key) {
  return encodeURI(key)
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/'/g, "%27").replace(/#/g, "%23").replace(/\+/g, "%2B");
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] }));
    }).on("error", reject);
  });
}

function headS3(key) {
  return new Promise(resolve => {
    const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/` + encodeKeyForUrl(key);
    const req = https.request(url, { method: "HEAD", timeout: 20000 }, res => resolve(res.statusCode));
    req.on("timeout", () => { req.destroy(); resolve("TIMEOUT"); });
    req.on("error", () => resolve("ERR"));
    req.end();
  });
}

async function run() {
  console.log("=== Copy missing gallery files to S3 ===");
  console.log("Mode:", DRY_RUN ? "DRY-RUN (verify only)" : "EXECUTE (will upload)");
  console.log("");

  let s3Client = null;
  if (!DRY_RUN) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.error("FATAL: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing from env.");
      process.exit(1);
    }
    const { S3Client } = require(path.join(__dirname, "../../server/node_modules/@aws-sdk/client-s3"));
    s3Client = new S3Client({ region: REGION });
  }

  let uploaded = 0, skipped = 0, failed = 0;

  for (const item of MISSING) {
    const key = S3_PREFIX + item.pic;
    const oldUrl = OLD_BASE + encodeKeyForUrl(item.pic);

    // 1. Already in S3? (re-run safety)
    const existing = await headS3(key);
    if (existing === 200) {
      console.log(`  SKIP (already in S3): ${key}`);
      skipped++;
      continue;
    }

    // 2. Verify source availability / download
    try {
      const { buffer, contentType } = await download(oldUrl);
      console.log(`  Downloaded ${item.pic} (${buffer.length} bytes, ${contentType})`);

      if (DRY_RUN) {
        console.log(`  [DRY-RUN] would upload to s3://${BUCKET}/${key}`);
        continue;
      }

      const { PutObjectCommand } = require(path.join(__dirname, "../../server/node_modules/@aws-sdk/client-s3"));
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType || "image/jpeg",
      }));

      // 3. Verify
      const check = await headS3(key);
      if (check === 200) {
        console.log(`  UPLOADED + verified: s3://${BUCKET}/${key}`);
        uploaded++;
      } else {
        console.error(`  UPLOAD NOT VERIFIED (HEAD=${check}): ${key}`);
        failed++;
      }
    } catch (err) {
      console.error(`  FAILED ${item.pic}: ${err.message}`);
      failed++;
    }
  }

  console.log("\n=== Results ===");
  console.log(`Uploaded: ${uploaded} | Skipped (already exist): ${skipped} | Failed: ${failed} | Total: ${MISSING.length}`);
  if (DRY_RUN) console.log("\nDRY-RUN — nothing was uploaded. Re-run with --execute to upload.");
}

run()
  .then(() => process.exit(0))
  .catch(err => { console.error("FATAL:", err); process.exit(1); });
