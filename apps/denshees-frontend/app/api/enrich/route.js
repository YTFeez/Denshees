import { NextResponse } from "next/server";
import { Resolver } from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


const dnsResolver = new Resolver();
dnsResolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);

const EMAIL_RE =
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
  "10minutemail.com",
]);

function normalizeDomain(raw = "") {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "");
}

function slugifyName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildCandidates(firstName, lastName, domain) {
  const f = slugifyName(firstName);
  const l = slugifyName(lastName);
  if (!domain || (!f && !l)) return [];

  // Ordered by French B2B frequency
  const patterns = [];
  const push = (v) => {
    if (v && !patterns.includes(v)) patterns.push(v);
  };
  if (f && l) {
    push(`${f}.${l}@${domain}`);
    push(`${f}${l}@${domain}`);
    push(`${f[0]}.${l}@${domain}`);
    push(`${f[0]}${l}@${domain}`);
    push(`${f}_${l}@${domain}`);
    push(`${f}-${l}@${domain}`);
    push(`${l}.${f}@${domain}`);
    push(`${f}${l[0]}@${domain}`);
  }
  if (f) push(`${f}@${domain}`);
  if (l) push(`${l}@${domain}`);
  return patterns;
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function createMxCache() {
  const cache = new Map();
  return async function resolveMxCached(domain) {
    if (cache.has(domain)) return cache.get(domain);
    const p = (async () => {
      try {
        const mx = await dnsResolver.resolveMx(domain);
        if (!Array.isArray(mx) || !mx.length) return null;
        mx.sort((a, b) => a.priority - b.priority);
        return mx;
      } catch (err) {
        // one retry after short delay (transient Windows DNS flakes)
        try {
          await new Promise((r) => setTimeout(r, 150));
          const mx = await dnsResolver.resolveMx(domain);
          if (!Array.isArray(mx) || !mx.length) return null;
          mx.sort((a, b) => a.priority - b.priority);
          return mx;
        } catch (err2) {
          console.warn("[enrich] MX fail", domain, err2?.code || err?.code || err2?.message);
          return null;
        }
      }
    })();
    cache.set(domain, p);
    return p;
  };
}

function createSiteCache() {
  const cache = new Map();

  async function fetchHtml(url) {
    const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; DensheesEnrich/1.0; +https://denshees.local)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) return "";
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text") && !ct.includes("html") && !ct.includes("xml")) {
        return "";
      }
      const text = await res.text();
      return text.slice(0, 350_000);
    } catch {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  return async function scrapeDomainEmails(domain) {
    if (cache.has(domain)) return cache.get(domain);
    const p = (async () => {
      const bases = [`https://${domain}`, `http://${domain}`];
      // Keep scrape light — enough for mailto discovery without timing out bulk runs
      const paths = ["", "/contact", "/contactez-nous", "/mentions-legales"];
      const found = new Set();

      for (const base of bases) {
        let gotAny = false;
        for (const path of paths) {
          const html = await fetchHtml(`${base}${path}`);
          if (!html) continue;
          gotAny = true;
          const mailto = [...html.matchAll(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)];
          for (const m of mailto) found.add(m[1].toLowerCase());
          const emails = html.match(EMAIL_RE) || [];
          for (const e of emails) found.add(e.toLowerCase());
          
          if ([...found].some((e) => e.includes(".") || e.includes("_"))) break;
        }
        if (gotAny) break;
      }

      return [...found].filter((email) => {
        const d = email.split("@")[1];
        return d === domain || d?.endsWith(`.${domain}`);
      });
    })();
    cache.set(domain, p);
    return p;
  };
}

function smtpProbe(mxHost, email, timeoutMs = 1800) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let stage = 0;
    let buffer = "";
    let settled = false;

    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve({ ok, reason });
    };

    const timer = setTimeout(() => finish(false, "timeout"), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("error", () => {
      clearTimeout(timer);
      finish(false, "socket_error");
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (!/^\d{3}/.test(last)) return;

      const code = Number(last.slice(0, 3));
      if (stage === 0) {
        if (code !== 220) return finish(false, `banner_${code}`);
        stage = 1;
        socket.write("EHLO denshees.local\r\n");
        return;
      }
      if (stage === 1) {
        if (code !== 250) return finish(false, `ehlo_${code}`);
        stage = 2;
        socket.write("MAIL FROM:<probe@denshees.local>\r\n");
        return;
      }
      if (stage === 2) {
        if (code !== 250) return finish(false, `mailfrom_${code}`);
        stage = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
        return;
      }
      if (stage === 3) {
        clearTimeout(timer);
        socket.write("QUIT\r\n");
        if (code === 250 || code === 251) return finish(true, "accepted");
        if (code === 450 || code === 451 || code === 452)
          return finish(true, "greylist_or_temp");
        return finish(false, `rcpt_${code}`);
      }
    });
  });
}

function pickSiteMatch(siteEmails, firstName, lastName) {
  const f = slugifyName(firstName);
  const l = slugifyName(lastName);
  if (!siteEmails.length) return null;

  const scored = siteEmails
    .map((email) => {
      const local = slugifyName(email.split("@")[0]);
      let score = 0;
      if (f && l && local.includes(f) && local.includes(l)) score = 100;
      else if (l && local.includes(l) && f && local.includes(f[0])) score = 85;
      else if (l && local.includes(l)) score = 70;
      else if (f && local.includes(f) && local.length <= f.length + 2) score = 55;
      else score = 0;
      return { email, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0] || null;
}

function confidenceFor(status, reason, patternIndex) {
  if (status === "found") return 95;
  if (status === "valid") return 90;
  if (status === "likely" && reason === "mx_fr_pattern") return 72;
  if (status === "likely") return Math.max(50, 68 - (patternIndex || 0) * 3);
  if (status === "risky") return 35;
  if (status === "unverified") return 40;
  return 0;
}

async function enrichLead(lead, ctx) {
  const { mode, resolveMx, scrapeSite } = ctx;
  const firstName = lead.firstName || lead.FirstName || lead.first_name || "";
  const lastName = lead.lastName || lead.LastName || lead.last_name || "";
  const company =
    lead.company || lead.CompanyName || lead.companyName || lead.Company || "";
  const domain = normalizeDomain(
    lead.domain || lead.Domain || lead.website || lead.Website || "",
  );
  const linkedin =
    lead.linkedin || lead.LinkedinURL || lead.linkedinUrl || lead.LinkedIn || "";

  const base = {
    ...lead,
    firstName,
    lastName,
    company,
    domain,
    linkedin,
    candidates: [],
    confidence: 0,
    source: "",
  };

  if (!domain) {
    return {
      ...base,
      email: "",
      emailStatus: "skipped",
      emailReason: "missing_domain",
    };
  }

  if (DISPOSABLE.has(domain)) {
    return {
      ...base,
      email: "",
      emailStatus: "invalid",
      emailReason: "disposable_domain",
    };
  }

  const mx = await resolveMx(domain);
  if (!mx) {
    return {
      ...base,
      email: "",
      emailStatus: "invalid",
      emailReason: "no_mx",
    };
  }

  const mxHost = mx[0].exchange;
  const candidates = buildCandidates(firstName, lastName, domain);

  
  if (mode !== "pattern") {
    try {
      const siteEmails = await scrapeSite(domain);
      const match = pickSiteMatch(siteEmails, firstName, lastName);
      if (match) {
        return {
          ...base,
          email: match.email,
          emailStatus: "found",
          emailReason: "website_mailto_or_page",
          candidates: [match.email, ...candidates.filter((c) => c !== match.email)],
          confidence: confidenceFor("found"),
          source: "website",
          mx: mxHost,
        };
      }
    } catch {
      
    }
  }

  if (!candidates.length) {
    return {
      ...base,
      email: "",
      emailStatus: "skipped",
      emailReason: "missing_name",
      mx: mxHost,
    };
  }

  
  if (mode === "smtp") {
    let best = null;
    for (const email of candidates.slice(0, 2)) {
      const probe = await smtpProbe(mxHost, email);
      if (probe.ok) {
        best = {
          email,
          status: "valid",
          reason: probe.reason,
        };
        break;
      }
      if (probe.reason === "timeout" || probe.reason === "socket_error") {
        best = {
          email: candidates[0],
          status: "likely",
          reason: "smtp_blocked_fallback_mx",
        };
        break;
      }
      if (!best) {
        best = { email, status: "invalid", reason: probe.reason };
      }
    }
    const status = best?.status || "likely";
    return {
      ...base,
      email: best?.email || candidates[0],
      emailStatus: status,
      emailReason: best?.reason || "smtp_done",
      candidates,
      confidence: confidenceFor(status, best?.reason, 0),
      source: status === "valid" ? "smtp" : "pattern+mx",
      mx: mxHost,
    };
  }

  
  const email = candidates[0];
  const isFrPattern = email.startsWith(`${slugifyName(firstName)}.${slugifyName(lastName)}@`);
  return {
    ...base,
    email,
    emailStatus: "likely",
    emailReason: isFrPattern ? "mx_fr_pattern" : "mx_pattern",
    candidates,
    confidence: confidenceFor("likely", isFrPattern ? "mx_fr_pattern" : "mx_pattern", 0),
    source: "pattern+mx",
    mx: mxHost,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    
    let mode = String(body?.mode || "").toLowerCase();
    if (!mode) mode = body?.verify ? "smtp" : "mx";
    if (!["mx", "pattern", "smtp"].includes(mode)) mode = "mx";

    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 150);
    const concurrency = Math.min(Math.max(Number(body?.concurrency) || 10, 1), 20);

    if (!leads.length) {
      return NextResponse.json(
        { message: "leads array required" },
        { status: 400 },
      );
    }

    const slice = leads.slice(0, limit).map((lead) => ({
      FirstName: lead.FirstName || lead.firstName || lead.first_name || "",
      LastName: lead.LastName || lead.lastName || lead.last_name || "",
      Domain: lead.Domain || lead.domain || lead.website || lead.Website || "",
      CompanyName:
        lead.CompanyName || lead.company || lead.companyName || lead.Company || "",
      LinkedinURL:
        lead.LinkedinURL || lead.linkedin || lead.linkedinUrl || lead.LinkedIn || "",
    }));
    const resolveMx = createMxCache();
    const scrapeSite = createSiteCache();
    const ctx = { mode, resolveMx, scrapeSite };

    const enriched = await mapPool(slice, concurrency, (lead) =>
      enrichLead(lead, ctx),
    );

    const stats = {
      total: enriched.length,
      withEmail: enriched.filter((l) => l.email).length,
      found: enriched.filter((l) => l.emailStatus === "found").length,
      likely: enriched.filter((l) => l.emailStatus === "likely").length,
      valid: enriched.filter((l) => l.emailStatus === "valid").length,
      risky: enriched.filter((l) => l.emailStatus === "risky").length,
      invalid: enriched.filter((l) => l.emailStatus === "invalid").length,
      skipped: enriched.filter((l) => l.emailStatus === "skipped").length,
      unverified: enriched.filter((l) => l.emailStatus === "unverified").length,
      avgConfidence: enriched.length
        ? Math.round(
            enriched.reduce((s, l) => s + (l.confidence || 0), 0) / enriched.length,
          )
        : 0,
    };

    return NextResponse.json({
      engine: "denshees-enrich-v2",
      mode,
      note:
        mode === "mx"
          ? "Work-email patterns + MX validation + website scan. SMTP deep verify is optional."
          : mode === "smtp"
            ? "SMTP probe enabled — may time out if outbound port 25 is blocked."
            : "Work-email patterns + MX validation (no website scan).",
      stats,
      leads: enriched,
    });
  } catch (error) {
    console.error("[enrich]", error);
    return NextResponse.json(
      { message: error.message || "enrich_failed" },
      { status: 500 },
    );
  }
}
