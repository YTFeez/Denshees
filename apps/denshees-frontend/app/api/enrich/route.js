import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const patterns = new Set();
  if (f && l) {
    patterns.add(`${f}.${l}@${domain}`);
    patterns.add(`${f}${l}@${domain}`);
    patterns.add(`${f}_${l}@${domain}`);
    patterns.add(`${f[0]}${l}@${domain}`);
    patterns.add(`${f}${l[0]}@${domain}`);
    patterns.add(`${l}.${f}@${domain}`);
  }
  if (f) patterns.add(`${f}@${domain}`);
  if (l) patterns.add(`${l}@${domain}`);
  return [...patterns];
}

async function hasMx(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

function smtpProbe(mxHost, email, timeoutMs = 4000) {
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

async function verifyEmail(email, domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx?.length) return { status: "invalid", reason: "no_mx" };
    mx.sort((a, b) => a.priority - b.priority);
    const host = mx[0].exchange;
    const probe = await smtpProbe(host, email);
    if (probe.ok) return { status: "valid", reason: probe.reason, mx: host };
    // Many servers block outbound port 25 — treat MX presence as catch-all unknown
    if (probe.reason === "timeout" || probe.reason === "socket_error") {
      return { status: "risky", reason: "smtp_blocked_or_timeout", mx: host };
    }
    return { status: "invalid", reason: probe.reason, mx: host };
  } catch (error) {
    return { status: "risky", reason: error.message || "verify_error" };
  }
}

async function enrichLead(lead, { verify }) {
  const firstName = lead.firstName || lead.FirstName || lead.first_name || "";
  const lastName = lead.lastName || lead.LastName || lead.last_name || "";
  const company =
    lead.company || lead.CompanyName || lead.companyName || lead.Company || "";
  const domain = normalizeDomain(
    lead.domain || lead.Domain || lead.website || lead.Website || "",
  );
  const linkedin =
    lead.linkedin || lead.LinkedinURL || lead.linkedinUrl || lead.LinkedIn || "";

  if (!domain) {
    return {
      ...lead,
      firstName,
      lastName,
      company,
      domain: "",
      linkedin,
      email: "",
      emailStatus: "skipped",
      emailReason: "missing_domain",
      candidates: [],
    };
  }

  const mxOk = await hasMx(domain);
  if (!mxOk) {
    return {
      ...lead,
      firstName,
      lastName,
      company,
      domain,
      linkedin,
      email: "",
      emailStatus: "invalid",
      emailReason: "no_mx",
      candidates: [],
    };
  }

  const candidates = buildCandidates(firstName, lastName, domain);
  if (!candidates.length) {
    return {
      ...lead,
      firstName,
      lastName,
      company,
      domain,
      linkedin,
      email: "",
      emailStatus: "skipped",
      emailReason: "missing_name",
      candidates: [],
    };
  }

  if (!verify) {
    return {
      ...lead,
      firstName,
      lastName,
      company,
      domain,
      linkedin,
      email: candidates[0],
      emailStatus: "unverified",
      emailReason: "pattern_only",
      candidates,
    };
  }

  let best = null;
  for (const email of candidates.slice(0, 4)) {
    const result = await verifyEmail(email, domain);
    if (result.status === "valid") {
      best = { email, ...result };
      break;
    }
    if (!best && result.status === "risky") {
      best = { email, ...result };
    }
  }

  return {
    ...lead,
    firstName,
    lastName,
    company,
    domain,
    linkedin,
    email: best?.email || candidates[0],
    emailStatus: best?.status || "unverified",
    emailReason: best?.reason || "no_probe_result",
    candidates,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const leads = Array.isArray(body?.leads) ? body.leads : [];
    const verify = Boolean(body?.verify);
    const limit = Math.min(Number(body?.limit) || 30, 50);

    if (!leads.length) {
      return NextResponse.json(
        { message: "leads array required" },
        { status: 400 },
      );
    }

    const slice = leads.slice(0, limit);
    const enriched = [];
    for (const lead of slice) {
      enriched.push(await enrichLead(lead, { verify }));
    }

    const stats = {
      total: enriched.length,
      withEmail: enriched.filter((l) => l.email).length,
      valid: enriched.filter((l) => l.emailStatus === "valid").length,
      risky: enriched.filter((l) => l.emailStatus === "risky").length,
      invalid: enriched.filter((l) => l.emailStatus === "invalid").length,
      unverified: enriched.filter((l) => l.emailStatus === "unverified").length,
    };

    return NextResponse.json({
      engine: "denshees-coldreach-lite",
      note: "Pattern finder + MX/SMTP probe (ColdReach-inspired). Port 25 may be blocked on some networks.",
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
