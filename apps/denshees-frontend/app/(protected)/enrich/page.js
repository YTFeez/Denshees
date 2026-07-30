"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import instance from "@/lib/axios";

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
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(";")),
  ].join("\n");
}

export default function EnrichPage() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [limit, setLimit] = useState(30);
  const [verify, setVerify] = useState(true);
  const [loading, setLoading] = useState(false);
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
    try {
      const { data } = await instance.post("/api/enrich", {
        leads: rows,
        limit: Number(limit) || 30,
        verify,
      });
      setResult(data);
      toast.success(`Enrichi : ${data.stats.withEmail}/${data.stats.total}`);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || "Enrichissement échoué");
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
        <h1 className="text-2xl font-semibold">Enrich (ColdReach-lite)</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Upload un CSV LinkedIn/TotLeads → génération d&apos;emails + vérif MX/SMTP
          → export prêt pour campagne Denshees.
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Limite (max 50 pour la démo)</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              id="verify"
              type="checkbox"
              checked={verify}
              onChange={(e) => setVerify(e.target.checked)}
            />
            <Label htmlFor="verify">Vérifier emails (MX + SMTP probe)</Label>
          </div>
        </div>

        <div className="flex gap-3">
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
          <p className="text-sm font-medium">Résultats ({result.engine})</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <div className="border rounded p-2">Total: {result.stats.total}</div>
            <div className="border rounded p-2">
              Avec email: {result.stats.withEmail}
            </div>
            <div className="border rounded p-2">Valid: {result.stats.valid}</div>
            <div className="border rounded p-2">Risky: {result.stats.risky}</div>
            <div className="border rounded p-2">
              Unverified: {result.stats.unverified}
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
                    <td className="p-2">
                      {l.emailStatus}
                      {l.emailReason ? ` (${l.emailReason})` : ""}
                    </td>
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
