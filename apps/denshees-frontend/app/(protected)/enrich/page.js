"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  EmailIcon,
  UsersIcon,
  CheckCircleIcon,
  BuildingBIcon,
  SearchIcon,
  ZapIcon,
  ShieldCheckIcon,
  GlobeIcon,
} from "mage-icons-react/bulk";
import {
  DownloadIcon,
  ReloadIcon,
  UploadIcon,
} from "mage-icons-react/stroke";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PANEL =
  "border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]";

const MODE_OPTIONS = [
  {
    value: "pattern",
    label: "Fast",
    hint: "Patterns + MX — best for large CSVs",
    maxLimit: 300,
    chunk: 50,
    defaultLimit: 200,
    icon: ZapIcon,
  },
  {
    value: "mx",
    label: "Standard",
    hint: "Patterns + MX + website scan",
    maxLimit: 150,
    chunk: 40,
    defaultLimit: 100,
    icon: GlobeIcon,
  },
  {
    value: "smtp",
    label: "Deep verify",
    hint: "SMTP probe — slower, often blocked at home",
    maxLimit: 30,
    chunk: 10,
    defaultLimit: 20,
    icon: ShieldCheckIcon,
  },
];

const STATUS_META = {
  found: {
    label: "Found",
    className: "bg-emerald-50 text-emerald-800 border-emerald-300",
  },
  valid: {
    label: "Verified",
    className: "bg-green-50 text-green-800 border-green-300",
  },
  likely: {
    label: "Likely",
    className: "bg-blue-50 text-blue-800 border-blue-300",
  },
  risky: {
    label: "Risky",
    className: "bg-yellow-50 text-yellow-800 border-yellow-300",
  },
  unverified: {
    label: "Unverified",
    className: "bg-yellow-50 text-yellow-800 border-yellow-300",
  },
  invalid: {
    label: "Invalid",
    className: "bg-red-50 text-red-800 border-red-300",
  },
  skipped: {
    label: "Skipped",
    className: "bg-gray-50 text-gray-700 border-gray-300",
  },
};

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const delim = lines[0].includes(";") ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === delim && !inQuotes) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const headers = split(lines[0]).map((h) => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = split(line).map((v) => v.replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || "";
    });
    return row;
  });
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = [
    "firstName",
    "lastName",
    "company",
    "domain",
    "linkedin",
    "email",
    "emailStatus",
    "emailReason",
    "confidence",
    "source",
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(";")),
  ].join("\n");
}

function mergeStats(parts) {
  const stats = {
    total: 0,
    withEmail: 0,
    found: 0,
    likely: 0,
    valid: 0,
    risky: 0,
    invalid: 0,
    skipped: 0,
    unverified: 0,
    avgConfidence: 0,
  };
  let confSum = 0;
  for (const p of parts) {
    const s = p.stats || {};
    stats.total += s.total || 0;
    stats.withEmail += s.withEmail || 0;
    stats.found += s.found || 0;
    stats.likely += s.likely || 0;
    stats.valid += s.valid || 0;
    stats.risky += s.risky || 0;
    stats.invalid += s.invalid || 0;
    stats.skipped += s.skipped || 0;
    stats.unverified += s.unverified || 0;
    confSum += (s.avgConfidence || 0) * (s.total || 0);
  }
  stats.avgConfidence = stats.total ? Math.round(confSum / stats.total) : 0;
  return stats;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || {
    label: status || "Unknown",
    className: "bg-gray-50 text-gray-800 border-gray-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center text-xs px-2 py-0.5 font-medium border shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function StatCard({ title, value, icon: Icon }) {
  return (
    <div className={`${PANEL} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        {Icon && (
          <div className="border border-black p-2 bg-gray-50">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}

function leadName(row) {
  return (
    [row.FirstName || row.firstName || row.first_name, row.LastName || row.lastName || row.last_name]
      .filter(Boolean)
      .join(" ") || "—"
  );
}

function leadCompany(row) {
  return row.CompanyName || row.company || row.companyName || row.Company || "—";
}

function leadDomain(row) {
  return row.Domain || row.domain || row.website || row.Website || "—";
}

function EnrichProgressBar({ processed, total, batch, batches, modeLabel }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className={`${PANEL} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <ReloadIcon className="w-4 h-4 animate-spin shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">
              Enriching · {modeLabel}
            </p>
            <p className="text-xs text-gray-600">
              Batch {batch} of {batches} · {processed}/{total} leads
            </p>
          </div>
        </div>
        <span className="text-sm font-bold tabular-nums">{pct}%</span>
      </div>
      <div className="h-3 w-full border border-black bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div
          className="h-full bg-black transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function EnrichPage() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [limit, setLimit] = useState(100);
  const [mode, setMode] = useState("mx");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const modeMeta = MODE_OPTIONS.find((m) => m.value === mode) || MODE_OPTIONS[1];

  useEffect(() => {
    setLimit((prev) => {
      const n = Number(prev) || modeMeta.defaultLimit;
      if (n > modeMeta.maxLimit) return modeMeta.defaultLimit;
      return n;
    });
  }, [mode, modeMeta.maxLimit, modeMeta.defaultLimit]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.length) {
      toast.error("No leads found in this CSV");
      return;
    }
    setRows(parsed);
    setFileName(file.name);
    setResult(null);
    toast.success(`${parsed.length} leads loaded`);
  };

  const runEnrich = async () => {
    if (!rows.length) {
      toast.error("Upload a CSV first");
      return;
    }
    setLoading(true);
    setProgress(null);
    try {
      const maxForMode = modeMeta.maxLimit;
      const totalWanted = Math.min(
        Number(limit) || modeMeta.defaultLimit,
        rows.length,
        maxForMode,
      );
      const slice = rows.slice(0, totalWanted);
      const chunkSize = modeMeta.chunk;
      const chunks = [];
      for (let i = 0; i < slice.length; i += chunkSize) {
        chunks.push(slice.slice(i, i + chunkSize));
      }

      const parts = [];
      for (let i = 0; i < chunks.length; i++) {
        const processed = parts.reduce((n, p) => n + (p.leads?.length || 0), 0);
        setProgress({
          processed,
          total: totalWanted,
          batch: i + 1,
          batches: chunks.length,
        });
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leads: chunks[i].map((r) => ({
              FirstName: r.FirstName || r.firstName || r.first_name || "",
              LastName: r.LastName || r.lastName || r.last_name || "",
              Domain: r.Domain || r.domain || r.website || r.Website || "",
              CompanyName:
                r.CompanyName || r.company || r.companyName || r.Company || "",
              LinkedinURL:
                r.LinkedinURL ||
                r.linkedin ||
                r.linkedinUrl ||
                r.LinkedIn ||
                "",
            })),
            limit: chunks[i].length,
            mode,
            concurrency: mode === "smtp" ? 4 : 12,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || `Request failed (${res.status})`);
        }
        if (!data?.leads) {
          throw new Error("Invalid enrich response");
        }
        parts.push(data);
        setProgress({
          processed: parts.reduce((n, p) => n + (p.leads?.length || 0), 0),
          total: totalWanted,
          batch: i + 1,
          batches: chunks.length,
        });
      }

      const leads = parts.flatMap((p) => p.leads || []);
      const merged = {
        engine: parts[0]?.engine || "denshees-enrich",
        mode,
        note: parts[0]?.note,
        stats: mergeStats(parts),
        leads,
      };
      setResult(merged);
      setProgress(null);
      if (!merged.stats.withEmail) {
        toast.error(
          `No emails found for ${merged.stats.total} leads — check domain columns`,
        );
      } else {
        toast.success(
          `Enriched ${merged.stats.withEmail}/${merged.stats.total} leads · avg confidence ${merged.stats.avgConfidence}%`,
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Enrichment failed");
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const download = () => {
    if (!result?.leads?.length) return;
    const blob = new Blob([toCsv(result.leads)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `denshees-enriched-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Enrich</h1>
          <p className="text-gray-600 mt-1">
            Find work emails from your lead CSV, then export them into a campaign
            or list.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={download}
          disabled={!result?.leads?.length}
        >
          <DownloadIcon className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className={`${PANEL} p-6 space-y-6`}>
        <div>
          <h2 className="text-md font-bold">Import leads</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload a TotLeads or LinkedIn export. Required columns: first name,
            last name, and company domain.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="enrich-csv">CSV file</Label>
          <Input
            id="enrich-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
          />
          {fileName ? (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-black">{fileName}</span>
              {" · "}
              {rows.length} leads ready
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              No file selected yet. Supports comma or semicolon CSV.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Search depth</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={loading}
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    "text-left p-3 border border-black bg-white transition-all",
                    "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
                    "hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]",
                    "disabled:opacity-60 disabled:pointer-events-none",
                    selected && "bg-black text-white",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="font-bold text-sm">{opt.label}</span>
                  </div>
                  <p
                    className={cn(
                      "text-xs leading-snug",
                      selected ? "text-gray-300" : "text-gray-600",
                    )}
                  >
                    {opt.hint}
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-2 font-medium",
                      selected ? "text-white" : "text-gray-800",
                    )}
                  >
                    Max {opt.maxLimit} leads
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="enrich-limit">Lead limit</Label>
          <Input
            id="enrich-limit"
            type="number"
            min={1}
            max={modeMeta.maxLimit}
            value={limit}
            disabled={loading}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) {
                setLimit(e.target.value);
                return;
              }
              setLimit(Math.min(Math.max(1, n), modeMeta.maxLimit));
            }}
          />
          <p className="text-xs text-gray-500">
            {modeMeta.label} mode · up to {modeMeta.maxLimit} leads per run
          </p>
        </div>

        {loading && progress && (
          <EnrichProgressBar
            processed={progress.processed}
            total={progress.total}
            batch={progress.batch}
            batches={progress.batches}
            modeLabel={modeMeta.label}
          />
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={runEnrich} disabled={loading || !rows.length}>
            {loading ? (
              <>
                <ReloadIcon className="w-4 h-4 mr-2 animate-spin" />
                Enriching…
              </>
            ) : (
              <>
                <SearchIcon className="w-4 h-4 mr-2" />
                Start enrichment
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRows([]);
              setFileName("");
              setResult(null);
              setProgress(null);
            }}
            disabled={loading || (!rows.length && !result)}
          >
            <UploadIcon className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {!rows.length && !result && (
        <div className={`${PANEL} p-10 text-center`}>
          <UsersIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="font-medium">No leads imported</p>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
            Import a CSV to generate work emails, verify domains, and export a
            campaign-ready file.
          </p>
        </div>
      )}

      {preview.length > 0 && !result && (
        <div className={`${PANEL} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-black">
            <h2 className="text-md font-bold">Preview</h2>
            <p className="text-sm text-gray-600 mt-0.5">
              First {preview.length} of {rows.length} leads
            </p>
          </div>
          <div className="divide-y divide-gray-200">
            {preview.map((row, i) => (
              <div
                key={i}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{leadName(row)}</p>
                  <p className="text-sm text-gray-600 truncate">
                    {leadCompany(row)}
                  </p>
                </div>
                <p className="text-sm text-gray-500 shrink-0">{leadDomain(row)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Processed"
              value={result.stats.total}
              icon={UsersIcon}
            />
            <StatCard
              title="With email"
              value={result.stats.withEmail}
              icon={EmailIcon}
            />
            <StatCard
              title="Found on site"
              value={result.stats.found || 0}
              icon={CheckCircleIcon}
            />
            <StatCard
              title="Avg confidence"
              value={`${result.stats.avgConfidence}%`}
              icon={BuildingBIcon}
            />
          </div>

          <div className={`${PANEL} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-black flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-md font-bold">Results</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  {MODE_OPTIONS.find((m) => m.value === result.mode)?.label ||
                    "Standard"}{" "}
                  mode · {result.stats.likely || 0} likely ·{" "}
                  {result.stats.invalid || 0} invalid ·{" "}
                  {result.stats.skipped || 0} skipped
                </p>
              </div>
              <Button onClick={download} disabled={!result.leads?.length}>
                <DownloadIcon className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {!result.leads?.length ? (
              <div className="px-6 py-10 text-center text-gray-600">
                No results to display
              </div>
            ) : (
              <div className="overflow-auto max-h-[28rem]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-black text-white">
                    <tr className="text-left">
                      <th className="px-6 py-3 font-medium">Lead</th>
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium text-right">
                        Confidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {result.leads.map((lead, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-6 py-3">
                          <p className="font-medium">
                            {lead.firstName} {lead.lastName}
                          </p>
                          <p className="text-xs text-gray-500 truncate max-w-[180px]">
                            {lead.domain || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                          {lead.company || "—"}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {lead.email || (
                            <span className="text-gray-400 font-normal">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={lead.emailStatus} />
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">
                          {lead.confidence ?? "—"}
                          {lead.confidence != null ? "%" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Likely emails use common work patterns on domains that accept mail.
            Found emails were discovered on the company website. Import the
            export into Lists or a campaign when you&apos;re ready to send.
          </p>
        </>
      )}
    </div>
  );
}
