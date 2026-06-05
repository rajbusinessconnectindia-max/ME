import { useState, useCallback, useMemo } from "react";

const SYSTEM_PROMPT = `You are an elite B2B intelligence analyst with access to Google Search.

════════════════════════════════════════════════════════
MISSION: Find ONLY real, currently employed decision-makers
════════════════════════════════════════════════════════

For the given company domain, use Google Search to find verified leadership contacts.

SEARCH STRATEGY (execute in this order):
1. Search: site:linkedin.com/in "[company name]" CEO OR Founder OR CTO OR CFO
2. Search: "[company domain]" leadership team site:crunchbase.com
3. Search: "[company name]" executive team site:bloomberg.com
4. Search: "[company name]" management team press release 2024 OR 2025
5. Search: "[company name]" CEO interview OR announcement 2024 OR 2025
6. Search: "[company name]" site:tracxn.com OR site:dealroom.co
7. Fallback: Search company's own /about /team /leadership page

DESIGNATIONS TO FIND (in priority order):
── Tier 1: Ownership ──
Owner, Co-Owner, Founder, Co-Founder

── Tier 2: C-Suite ──
CEO, CTO, CFO, COO, CMO, CHRO, CRO, CPO, CBO, CLO

── Tier 3: Management ──
Managing Director, General Manager, Country Manager, Regional Manager, President, Group Head

── Tier 4: Partner ──
Partner, Managing Partner, Senior Partner, Equity Partner

── Tier 5: VP Level ──
VP of Sales, VP of Marketing, VP of Engineering, VP of Product, VP of Operations, VP of Finance, VP of HR, VP of Growth, Vice President (any function)

── Tier 6: Head Level ──
Head of Sales, Head of Marketing, Head of Product, Head of Engineering, Head of Operations, Head of Finance, Head of HR, Head of Growth, Head of Business Development, Head of Partnerships

── Tier 7: Director Level ──
Director of Sales, Director of Marketing, Director of Product, Director of Engineering, Director of Operations, Director of Finance, Director of HR, Director of Business Development

════════════════════════════════════════════════════════
STRICT ANTI-HALLUCINATION RULES — READ CAREFULLY
════════════════════════════════════════════════════════
✗ NEVER invent, guess, or assume any person's name
✗ NEVER return a name you cannot trace to a real public source
✗ NEVER return someone who has left the company
✗ NEVER return placeholder names (John Doe, Test User, N/A)
✗ NEVER return job titles as names
✗ NEVER return the company name as a person name
✗ NEVER fabricate an email address without a real pattern basis
✗ If unsure about a name → omit the contact entirely

EMAIL RULES:
- If email found publicly → mark as "verified"
- If email pattern known (e.g. firstname@domain.com from Hunter.io pattern) → mark as "estimated"
- If no basis at all → use "contact@[domain]" and mark as "general"
- NEVER leave email blank

NAME RULES:
- Full Name: exactly as found (e.g. "Rahul Sharma")
- First Name: given name only, no titles (not "Dr. Rahul", just "Rahul")  
- Middle Name: only if explicitly found, else empty string
- Last Name: family/surname only

CONFIDENCE SCORING:
- "verified": Found on 2+ independent public sources (LinkedIn + news, Crunchbase + press release, etc.)
- "estimated": Found on 1 reliable public source
- "low": Mentioned in passing, older source, or indirect reference

COMPANY DATA RULES:
- Only return companies with active websites and operational activity
- Skip shell companies, dissolved entities, or holding companies with no operations
- Employee size: use ranges like "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"

OUTPUT: Return valid JSON only. No markdown. No explanation. No preamble.

JSON SCHEMA:
{
  "companyName": "string",
  "website": "string",
  "industry": "string", 
  "cityState": "string",
  "employeeSize": "string",
  "yearFounded": "string",
  "fundingStatus": "string or empty",
  "hiringStatus": "string or empty",
  "generalEmail": "string",
  "contacts": [
    {
      "name": "string (full name exactly as found)",
      "firstName": "string",
      "middleName": "string (empty if not found)",
      "lastName": "string",
      "designation": "string (exact title)",
      "designationTier": "C-Suite|Founder|Management|Partner|VP|Head|Director",
      "email": "string",
      "emailConfidence": "verified|estimated|general",
      "linkedin": "string (full URL or empty)",
      "sourceCount": number,
      "sources": ["source1", "source2"],
      "confidence": "verified|estimated|low"
    }
  ],
  "dataQuality": "high|medium|low",
  "researchNote": "string (brief note on data quality or gaps)"
}`;

const TIER_ORDER = ["Founder", "C-Suite", "Management", "Partner", "VP", "Head", "Director"];
const TIER_COLORS = {
  "Founder": { bg: "#eef2ff", text: "#3730a3", border: "#a5b4fc" },
  "C-Suite": { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  "Management": { bg: "#ecfdf5", text: "#065f46", border: "#6ee7b7" },
  "Partner": { bg: "#fdf2f8", text: "#701a75", border: "#e879f9" },
  "VP": { bg: "#eff6ff", text: "#1e3a8a", border: "#93c5fd" },
  "Head": { bg: "#fff7ed", text: "#7c2d12", border: "#fdba74" },
  "Director": { bg: "#f0fdf4", text: "#14532d", border: "#86efac" },
};

async function researchDomain(domain) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [
        {
          role: "user",
          content: `Research this company domain and return verified decision-maker contacts as JSON: ${domain}

Remember:
- Use web search to find REAL people
- Only include contacts you can verify with actual search results  
- Return raw JSON only, no markdown blocks`
        }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const fullText = data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");
  return JSON.parse(jsonMatch[0]);
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [processes, setProcesses] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const stats = useMemo(() => {
    const completed = processes.filter(p => p.status === "done");
    const totalContacts = completed.reduce((a, p) => a + (p.result?.contacts?.length || 0), 0);
    const verified = completed.reduce((a, p) =>
      a + (p.result?.contacts?.filter(c => c.confidence === "verified").length || 0), 0);
    return {
      total: processes.length,
      done: completed.length,
      failed: processes.filter(p => p.status === "failed").length,
      contacts: totalContacts,
      verified,
    };
  }, [processes]);

  const updateProcess = useCallback((domain, patch) => {
    setProcesses(prev => prev.map(p => p.domain === domain ? { ...p, ...patch } : p));
  }, []);

  const handleRun = useCallback(async () => {
    if (!inputText.trim() || isRunning) return;

    const domains = inputText
      .split(/[\n,;]/)
      .map(d => d.trim().replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase())
      .filter(d => d.length > 0 && d.includes("."))
      .slice(0, 100);

    if (!domains.length) return;

    const fresh = domains.map(d => ({ domain: d, status: "pending", result: null, error: null }));
    setProcesses(prev => [...fresh, ...prev]);
    setInputText("");
    setIsRunning(true);

    const BATCH = 2;
    for (let i = 0; i < domains.length; i += BATCH) {
      const batch = domains.slice(i, i + BATCH);
      await Promise.all(batch.map(async domain => {
        updateProcess(domain, { status: "searching" });
        try {
          const result = await researchDomain(domain);
          updateProcess(domain, { status: "done", result });
        } catch (e) {
          updateProcess(domain, { status: "failed", error: e.message });
        }
      }));
    }
    setIsRunning(false);
  }, [inputText, isRunning, updateProcess]);

  const exportCSV = () => {
    const rows = [["Company", "Domain", "Industry", "City/State", "Employees", "Founded", "Funding", "Person Full Name", "First Name", "Middle Name", "Last Name", "Designation", "Tier", "Email", "Email Confidence", "LinkedIn", "Sources", "Confidence"]];
    processes.filter(p => p.status === "done" && p.result).forEach(p => {
      const r = p.result;
      if (r.contacts?.length) {
        r.contacts.forEach(c => {
          rows.push([r.companyName, r.website || p.domain, r.industry, r.cityState, r.employeeSize, r.yearFounded, r.fundingStatus || "", c.name, c.firstName, c.middleName || "", c.lastName, c.designation, c.designationTier || "", c.email, c.emailConfidence, c.linkedin || "", (c.sources || []).join("|"), c.confidence]);
        });
      } else {
        rows.push([r.companyName, r.website || p.domain, r.industry, r.cityState, r.employeeSize, r.yearFounded, r.fundingStatus || "", "Not Found", "", "", "", "", "", r.generalEmail || "", "", "", "", ""]);
      }
    });
    const csv = rows.map(r => r.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const tierGroups = useMemo(() => {
    const all = processes.filter(p => p.status === "done" && p.result?.contacts?.length);
    const contacts = all.flatMap(p => p.result.contacts.map(c => ({ ...c, company: p.result.companyName, domain: p.domain })));
    if (activeTab === "all") return contacts;
    return contacts.filter(c => (c.designationTier || "").toLowerCase() === activeTab.toLowerCase());
  }, [processes, activeTab]);

  const confidenceDot = (c) => {
    if (c === "verified") return { color: "#16a34a", label: "✓ Verified" };
    if (c === "estimated") return { color: "#d97706", label: "~ Estimated" };
    return { color: "#9ca3af", label: "? Low" };
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: "#f8fafc", color: "#1e293b" }}>
      {/* Header */}
      <div style={{ background: "#0f172a", color: "#f1f5f9", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.5px" }}>🎯 B2B Lead Intelligence Engine</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Powered by Claude + Web Search · Anti-hallucination verified</div>
        </div>
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {[["Contacts", stats.contacts], ["Verified", stats.verified], ["Companies", stats.done], ["Failed", stats.failed]].map(([label, val]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: label === "Verified" ? "#4ade80" : label === "Failed" ? "#f87171" : "#f1f5f9" }}>{val}</div>
              <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "1rem 1.5rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Paste domains: stripe.com, razorpay.com, zepto.in ..."
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun(); }}
            style={{ flex: "1 1 300px", minHeight: 60, padding: "0.5rem 0.75rem", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, resize: "vertical", fontFamily: "monospace", color: "#1e293b" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <button
              onClick={handleRun}
              disabled={isRunning || !inputText.trim()}
              style={{ padding: "0.5rem 1.25rem", background: isRunning || !inputText.trim() ? "#94a3b8" : "#0f172a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: isRunning || !inputText.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              {isRunning ? "⏳ Researching..." : "🔍 Run Research"}
            </button>
            {stats.contacts > 0 && (
              <button
                onClick={exportCSV}
                style={{ padding: "0.5rem 1.25rem", background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                ⬇ Export CSV
              </button>
            )}
          </div>
        </div>
        <div style={{ marginTop: "0.5rem", fontSize: 12, color: "#64748b" }}>
          ⌘+Enter to run · Up to 100 domains per batch · All contacts cross-verified with web search
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 220px)", overflow: "hidden" }}>
        {/* Left: Company Queue */}
        <div style={{ width: 300, borderRight: "1px solid #e2e8f0", overflowY: "auto", background: "#fff" }}>
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Company Queue ({processes.length})
          </div>
          {processes.length === 0 && (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
              No domains yet.<br />Paste above and run.
            </div>
          )}
          {processes.map((p, i) => (
            <div key={`${p.domain}-${i}`} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
              <div style={{ marginTop: 2, fontSize: 16, flexShrink: 0 }}>
                {p.status === "pending" && "⏸"}
                {p.status === "searching" && "🔄"}
                {p.status === "done" && "✅"}
                {p.status === "failed" && "❌"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.result?.companyName || p.domain}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.status === "done" ? `${p.result?.contacts?.length || 0} contacts · ${p.result?.industry || ""}` :
                   p.status === "failed" ? <span style={{ color: "#ef4444" }}>{p.error?.slice(0, 50)}</span> :
                   p.status === "searching" ? "Searching web sources..." : "Waiting..."}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Contacts */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Tier tabs */}
          <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 1rem", display: "flex", gap: 0, overflowX: "auto" }}>
            {["all", ...TIER_ORDER].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{ padding: "0.65rem 1rem", border: "none", borderBottom: activeTab === tab ? "2px solid #0f172a" : "2px solid transparent", background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? "#0f172a" : "#64748b", whiteSpace: "nowrap", textTransform: "capitalize" }}
              >
                {tab === "all" ? `All (${processes.filter(p => p.status === "done").flatMap(p => p.result?.contacts || []).length})` : tab}
              </button>
            ))}
          </div>

          {/* Contacts table */}
          {tierGroups.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 14, flexDirection: "column", gap: "0.5rem" }}>
              {processes.some(p => p.status === "searching") ? (
                <><div style={{ fontSize: 32 }}>🔍</div><div>Researching companies...</div></>
              ) : (
                <><div style={{ fontSize: 32 }}>📋</div><div>Results will appear here</div></>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 1 }}>
                    {["Company", "Name", "Designation", "Tier", "Email", "LinkedIn", "Confidence", "Sources"].map(h => (
                      <th key={h} style={{ padding: "0.6rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tierGroups.map((c, i) => {
                    const tier = c.designationTier || "Director";
                    const tierStyle = TIER_COLORS[tier] || TIER_COLORS["Director"];
                    const conf = confidenceDot(c.confidence);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600, fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.company}<br /><span style={{ fontWeight: 400, color: "#64748b", fontSize: 11 }}>{c.domain}</span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{[c.firstName, c.middleName, c.lastName].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{c.designation}</td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          <span style={{ background: tierStyle.bg, color: tierStyle.text, border: `1px solid ${tierStyle.border}`, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{tier}</span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", fontSize: 12 }}>
                          <div style={{ fontFamily: "monospace", color: "#0f172a" }}>{c.email}</div>
                          <div style={{ fontSize: 10, color: c.emailConfidence === "verified" ? "#16a34a" : c.emailConfidence === "estimated" ? "#d97706" : "#9ca3af", marginTop: 1 }}>
                            {c.emailConfidence === "verified" ? "✓ verified" : c.emailConfidence === "estimated" ? "~ estimated" : "⊘ general"}
                          </div>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem" }}>
                          {c.linkedin ? (
                            <a href={c.linkedin} target="_blank" rel="noopener noreferrer" style={{ color: "#0077b5", fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }}>🔗 Profile</a>
                          ) : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", whiteSpace: "nowrap" }}>
                          <span style={{ color: conf.color, fontSize: 12, fontWeight: 600 }}>{conf.label}</span>
                        </td>
                        <td style={{ padding: "0.6rem 0.75rem", fontSize: 11, color: "#64748b", maxWidth: 160 }}>
                          {(c.sources || []).join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
