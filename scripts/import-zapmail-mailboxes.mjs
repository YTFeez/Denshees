


import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CAMPAIGN_TITLE = process.env.CAMPAIGN_TITLE || "EP";
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 5);
const DOWNLOADS = path.join(process.env.USERPROFILE || "", "Downloads");
const XLSX_FILES = [
  "mailboxes-40d14918-cd0b-445c-b7ce-9445c99c118f-1785692911074.xlsx",
  "mailboxes-40d14918-cd0b-445c-b7ce-9445c99c118f-1785696206875.xlsx",
];

function createId() {
  return "c" + randomBytes(12).toString("base64url");
}

function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

function parseXlsx(filePath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-"));
  try {
    execSync(`tar -xf "${filePath}" -C "${tmp}"`, { stdio: "pipe" });
  } catch {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${filePath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force"`,
      { stdio: "pipe" },
    );
  }
  const sharedPath = path.join(tmp, "xl", "sharedStrings.xml");
  const sheetPath = path.join(tmp, "xl", "worksheets", "sheet1.xml");
  const shared = [];
  if (fs.existsSync(sharedPath)) {
    const xml = fs.readFileSync(sharedPath, "utf8");
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) =>
        x[1]
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'"),
      );
      shared.push(texts.join(""));
    }
  }
  const sheet = fs.readFileSync(sheetPath, "utf8");
  const rows = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    let max = -1;
    for (const cm of rm[1].matchAll(
      /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>|<c r="([A-Z]+)(\d+)"([^>]*)\/>/g,
    )) {
      const col = cm[1] || cm[5];
      const attrs = cm[3] || cm[7] || "";
      const body = cm[4] || "";
      let colIdx = 0;
      for (const ch of col) colIdx = colIdx * 26 + (ch.charCodeAt(0) - 64);
      colIdx--;
      max = Math.max(max, colIdx);
      const isShared = /t="s"/.test(attrs);
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      let val = "";
      if (vm) val = isShared ? (shared[parseInt(vm[1], 10)] ?? "") : vm[1];
      cells[colIdx] = val;
    }
    const row = [];
    for (let i = 0; i <= max; i++) row.push(cells[i] ?? "");
    if (row.some((x) => String(x).trim())) rows.push(row);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return rows;
}

function loadMailboxes() {
  const boxes = [];
  for (const name of XLSX_FILES) {
    const fp = path.join(DOWNLOADS, name);
    if (!fs.existsSync(fp)) {
      console.warn("Missing:", fp);
      continue;
    }
    const rows = parseXlsx(fp);
    const header = rows[0]?.map((h) => String(h).toLowerCase()) || [];
    const iEmail = header.findIndex(
      (h) => h.includes("email") && !h.includes("recovery"),
    );
    const iPass = header.findIndex((h) => h.includes("password"));
    const iRecovery = header.findIndex((h) => h.includes("recovery"));
    for (const r of rows.slice(1)) {
      const email = String(r[iEmail] || "").trim();
      const password = String(r[iPass] || "").trim();
      if (!email || !password) continue;
      boxes.push({
        email,
        password,
        recovery: iRecovery >= 0 ? String(r[iRecovery] || "").trim() : "",
        sourceFile: name,
      });
    }
  }
  const map = new Map();
  for (const b of boxes) map.set(b.email.toLowerCase(), b);
  return [...map.values()];
}

function psql(sql) {
  const tmpSql = path.join(os.tmpdir(), `denshees-import-${Date.now()}.sql`);
  fs.writeFileSync(tmpSql, sql, "utf8");
  try {
    const out = execSync(
      `docker cp "${tmpSql}" denshees-pg:/tmp/import-mail.sql && docker exec denshees-pg psql -U postgres -d denshees -v ON_ERROR_STOP=1 -f /tmp/import-mail.sql`,
      { encoding: "utf8" },
    );
    console.log(out);
  } finally {
    fs.unlinkSync(tmpSql);
  }
}

function psqlScalar(sql) {
  const out = execSync(
    `docker exec denshees-pg psql -U postgres -d denshees -t -A -c ${JSON.stringify(sql)}`,
    { encoding: "utf8" },
  ).trim();
  return out;
}

const boxes = loadMailboxes();
if (!boxes.length) {
  console.error("No mailboxes found");
  process.exit(1);
}

const userId = psqlScalar("SELECT id FROM users ORDER BY created ASC LIMIT 1");
const campaignId = psqlScalar(
  `SELECT id FROM campaigns WHERE title = '${CAMPAIGN_TITLE.replace(/'/g, "''")}' AND deleted = false LIMIT 1`,
);
if (!userId || !campaignId) {
  console.error("Missing user or campaign", { userId, campaignId });
  process.exit(1);
}

const statements = ["BEGIN;"];
const imported = [];

for (const box of boxes) {
  const credId = createId();
  const joinId = createId();
  statements.push(`
WITH upsert AS (
  UPDATE email_credentials SET
    password = ${sqlStr(box.password)},
    host = 'smtp.gmail.com',
    port = 465,
    secure = true,
    status = 'Active',
    "imapEmail" = ${sqlStr(box.email)},
    "imapPassword" = ${sqlStr(box.password)},
    "imapHost" = 'imap.gmail.com',
    "dailyLimit" = ${DAILY_LIMIT},
    "user" = ${sqlStr(userId)},
    updated = NOW()
  WHERE username = ${sqlStr(box.email)}
  RETURNING id
),
ins AS (
  INSERT INTO email_credentials
    (id, "user", username, password, host, port, secure, status,
     "imapEmail", "imapPassword", "imapHost", "dailyLimit", created, updated)
  SELECT ${sqlStr(credId)}, ${sqlStr(userId)}, ${sqlStr(box.email)}, ${sqlStr(box.password)},
         'smtp.gmail.com', 465, true, 'Active',
         ${sqlStr(box.email)}, ${sqlStr(box.password)}, 'imap.gmail.com', ${DAILY_LIMIT}, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM upsert)
  RETURNING id
),
cred AS (
  SELECT id FROM upsert
  UNION ALL
  SELECT id FROM ins
)
INSERT INTO campaign_email_credentials (id, campaign_id, email_credential_id)
SELECT ${sqlStr(joinId)}, ${sqlStr(campaignId)}, cred.id
FROM cred
ON CONFLICT (campaign_id, email_credential_id) DO NOTHING;
`);
  imported.push(box);
  console.log("queued", box.email);
}

statements.push(`
DELETE FROM campaign_email_credentials cec
USING email_credentials ec
WHERE cec.email_credential_id = ec.id
  AND cec.campaign_id = ${sqlStr(campaignId)}
  AND ec.username ILIKE '%dan2market%';

UPDATE campaigns SET
  setuped = true,
  "isTrackingEnabled" = false,
  email_delivery_period = 'MORNING',
  active_days = '["monday","tuesday","wednesday","thursday","friday"]'::jsonb,
  status = 'PAUSED',
  updated = NOW()
WHERE id = ${sqlStr(campaignId)};

COMMIT;
`);

psql(statements.join("\n"));

const localPath = path.join(__dirname, ".mailboxes.local.json");
fs.writeFileSync(
  localPath,
  JSON.stringify(
    {
      importedAt: new Date().toISOString(),
      campaignId,
      dailyLimit: DAILY_LIMIT,
      smtp: { host: "smtp.gmail.com", port: 465, secure: true },
      imap: { host: "imap.gmail.com", port: 993, secure: true },
      boxes: boxes.map((b) => ({
        email: b.email,
        password: b.password,
        recovery: b.recovery,
        sourceFile: b.sourceFile,
      })),
    },
    null,
    2,
  ),
  "utf8",
);

console.log(
  psqlScalar(`
SELECT string_agg(ec.username || ' (limit=' || ec."dailyLimit" || ')', ', ' ORDER BY ec.username)
FROM campaign_email_credentials cec
JOIN email_credentials ec ON ec.id = cec.email_credential_id
WHERE cec.campaign_id = '${campaignId.replace(/'/g, "''")}'
`),
);
console.log("Secrets:", localPath);
console.log("Campaign EP: PAUSED, tracking OFF, MORNING, Mon–Fri, dailyLimit", DAILY_LIMIT);
