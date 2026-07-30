"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import instance from "@/lib/axios";

const CHUNK = 40;

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

function statusColor(status) {
  if (status === "found" || status === "valid") return "text-emerald-700";
  if (status === "likely") return "text-sky-700";
  if (status === "risky" || status === "unverified") return "text-amber-700";
  if (status === "invalid" || status === "skipped") return "text-neutral-500";
  return "";
}

export default function EnrichPage() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [limit, setLimit] = useState(100);
  const [mode, setMode] = useState("mx");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setFileName(file.name);
    setResult(null);
    toast.success(`${parsed.length} leads chargés`);
  };

  const runEnrich = async () => {
    if (!rows.length) {
      toast.error("Importe un CSV d'abord");
      return;
    }
    setLoading(true);
    setProgress("");
    try {
      const totalWanted = Math.min(Number(limit) || 100, rows.length, 300);
      const slice = rows.slice(0, totalWanted);
      const chunks = [];
      for (let i = 0; i < slice.length; i += CHUNK) {
        chunks.push(slice.slice(i, i + CHUNK));
      }

      const parts = [];
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Lot ${i + 1}/${chunks.length} (${parts.reduce((n, p) => n + (p.leads?.length || 0), 0)}/${totalWanted})`);
        const { data } = await instance.post(
          "/api/enrich",
          {
            leads: chunks[i].map((r) => ({
              FirstName: r.FirstName || r.firstName || r.first_name || "",
              LastName: r.LastName || r.lastName || r.last_name || "",
              Domain: r.Domain || r.domain || r.website || r.Website || "",
              CompanyName:
                r.CompanyName || r.company || r.companyName || r.Company || "",
              LinkedinURL:
                r.LinkedinURL || r.linkedin || r.linkedinUrl || r.LinkedIn || "",
            })),
            limit: chunks[i].length,
            mode,
            concurrency: mode === "smtp" ? 4 : 12,
          },
          { timeout: mode === "smtp" ? 180000 : 180000 },
        );
        parts.push(data);
      }

      const leads = parts.flatMap((p) => p.leads || []);
      const merged = {
        engine: parts[0]?.engine || "denshees-enrich-v2",
        mode,
        note: parts[0]?.note,
        stats: mergeStats(parts),
        leads,
      };
      setResult(merged);
      setProgress("");
      toast.success(
        `Enrichi : ${merged.stats.withEmail}/${merged.stats.total} · confiance moy. ${merged.stats.avgConfidence}%`,
      );
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Enrichissement échoué");
      setProgress("");
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
    a.download = `enriched-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Enrich</h1>
        <p className="text-sm text-neutral-600 mt-1">
          CSV TotLeads → emails (patterns FR + MX + scrape site) → export campagne.
          Mode recommandé : <strong>MX + site</strong> (concluant sans port 25).
        </p>
      </div>

      <div className="border rounded-xl p-5 space-y-4 bg-white">
        <div>
          <Label>CSV (TotLeads / export)</Label>
          <Input type="file" accept=".csv,text/csv" onChange={onFile} />
          {fileName && (
            <p className="text-xs text-neutral-500 mt-1">
              {fileName} · {rows.length} lignes
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Limite (max 300)</Label>
            <Input
              type="number"
              min={1}
              max={300}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div>
            <Label>Mode de vérification</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="mx">MX + scrape site (recommandé)</option>
              <option value="pattern">Patterns + MX rapide (sans scrape)</option>
              <option value="smtp">SMTP probe (lent, souvent bloqué)</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <Button onClick={runEnrich} disabled={loading || !rows.length}>
            {loading ? "Enrichissement…" : "Enrichir"}
          </Button>
          <Button
            variant="outline"
            onClick={download}
            disabled={!result?.leads?.length}
          >
            Télécharger CSV enrichi
          </Button>
          {progress && (
            <span className="text-xs text-neutral-500">{progress}</span>
          )}
        </div>
      </div>

      {preview.length > 0 && (
        <div className="border rounded-xl p-4 bg-white overflow-auto">
          <p className="text-sm font-medium mb-2">Aperçu CSV source</p>
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}

      {result && (
        <div className="border rounded-xl p-4 bg-white space-y-3">
          <p className="text-sm font-medium">
            Résultats ({result.engine} · mode {result.mode})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="border rounded p-2">
              Total: {result.stats.total}
            </div>
            <div className="border rounded p-2">
              Avec email: {result.stats.withEmail}
            </div>
            <div className="border rounded p-2 text-emerald-700">
              Trouvés site: {result.stats.found || 0}
            </div>
            <div className="border rounded p-2 text-sky-700">
              Likely (MX): {result.stats.likely || 0}
            </div>
            <div className="border rounded p-2">
              Valid SMTP: {result.stats.valid || 0}
            </div>
            <div className="border rounded p-2">
              Invalid: {result.stats.invalid || 0}
            </div>
            <div className="border rounded p-2">
              Skipped: {result.stats.skipped || 0}
            </div>
            <div className="border rounded p-2 font-medium">
              Confiance moy.: {result.stats.avgConfidence}%
            </div>
          </div>
          <p className="text-xs text-neutral-500">{result.note}</p>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Nom</th>
                  <th className="p-2">Société</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {result.leads.map((l, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">
                      {l.firstName} {l.lastName}
                    </td>
                    <td className="p-2">{l.company}</td>
                    <td className="p-2">{l.email}</td>
                    <td className={`p-2 ${statusColor(l.emailStatus)}`}>
                      {l.emailStatus}
                      {l.emailReason ? ` (${l.emailReason})` : ""}
                    </td>
                    <td className="p-2">{l.confidence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
