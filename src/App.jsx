import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const FREE_LIMIT = 1;
const STORAGE_KEY = "resume_scans_used";

function getScansUsed() { return 0; }
function incrementScans() {}
function setPaidAccess() {}
function getPaidPlan() { return "monthly"; } // free for now — all users get unlimited

async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(" ") + "\n";
  }
  return text.trim();
}

async function analyzeResume(resumeText, jobDescription) {
  const res = await fetch("/api/screen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, jobDescription }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function createCheckout(plan) {
  const res = await fetch("/api/create-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Checkout failed");
  return data.url;
}

async function verifySession(sessionId) {
  const res = await fetch("/api/verify-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

function ScoreRing({ score, label, color }) {
  const r = 36, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <svg width="90" height="90" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }} />
        <text x="45" y="45" textAnchor="middle" dominantBaseline="central"
          style={{ fill: color, fontSize: "18px", fontWeight: "700", fontFamily: "Inter,sans-serif", transform: "rotate(90deg)", transformOrigin: "45px 45px" }}>
          {score}
        </text>
      </svg>
      <div style={{ fontSize: "11px", color: "#6b7280", letterSpacing: "1px", textAlign: "center" }}>{label}</div>
    </div>
  );
}

function Tag({ text, color }) {
  return <span style={{ display: "inline-block", padding: "4px 10px", borderRadius: "980px", fontSize: "12px", fontWeight: "500", background: `${color}18`, border: `1px solid ${color}35`, color, margin: "3px" }}>{text}</span>;
}

function Card({ title, icon, children }) {
  return (
    <div style={{ width: "100%", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", padding: "20px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Paywall Modal ────────────────────────────────────────────────────────────
function PaywallModal({ onClose, onSuccess }) {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const ac = "#6366f1";

  const handlePlan = async (plan) => {
    setLoading(plan); setError(null);
    try {
      const url = await createCheckout(plan);
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setLoading(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
      <div style={{ background: "#0f0f1a", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "24px", padding: "36px 28px", maxWidth: "420px", width: "100%", position: "relative", boxShadow: "0 0 80px rgba(99,102,241,0.15)" }}>
        <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", color: "#4a4a6a", cursor: "pointer", fontSize: "18px" }}>✕</button>

        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
          <h2 style={{ fontSize: "22px", fontWeight: "700", color: "#fff", letterSpacing: "-0.03em", margin: "0 0 8px" }}>Free scan used</h2>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0, lineHeight: 1.6 }}>You've used your free scan. Unlock more to keep optimising your resume.</p>
        </div>

        {error && <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", fontSize: "12px", color: "#fca5a5", marginBottom: "16px" }}>⚠️ {error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* One-time */}
          <button onClick={() => handlePlan("onetime")} disabled={!!loading} style={{ padding: "18px 20px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", cursor: loading ? "not-allowed" : "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "Inter,system-ui,sans-serif" }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#e2e8f0", marginBottom: "3px" }}>
                  {loading === "onetime" ? "Redirecting..." : "One-time Scan"}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Single resume analysis</div>
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#fff" }}>$2</div>
            </div>
          </button>

          {/* Monthly */}
          <button onClick={() => handlePlan("monthly")} disabled={!!loading} style={{ padding: "18px 20px", borderRadius: "14px", border: `1px solid ${ac}50`, background: `rgba(99,102,241,0.08)`, cursor: loading ? "not-allowed" : "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "Inter,system-ui,sans-serif", position: "relative", overflow: "hidden" }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "rgba(99,102,241,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}>
            <div style={{ position: "absolute", top: "8px", right: "12px", background: ac, color: "#fff", fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "980px", letterSpacing: "0.5px" }}>BEST VALUE</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "#e2e8f0", marginBottom: "3px" }}>
                  {loading === "monthly" ? "Redirecting..." : "Monthly Unlimited"}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Unlimited scans for 30 days</div>
              </div>
              <div>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "#a5b4fc" }}>$9</div>
                <div style={{ fontSize: "10px", color: "#6b7280", textAlign: "right" }}>/month</div>
              </div>
            </div>
          </button>
        </div>

        <div style={{ fontSize: "11px", color: "#2d2d4d", textAlign: "center", marginTop: "16px" }}>
          Secure payment via Stripe · Cancel anytime
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState("upload");
  const [pdfFile, setPdfFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paidPlan, setPaidPlan] = useState(null);
  const [verifying] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const fileInputRef = useRef(null);
  const resultsRef = useRef(null);

  const ac = "#6366f1";
  const green = "#22c55e";
  const yellow = "#f59e0b";
  const red = "#ef4444";
  const scoreColor = (s) => s >= 75 ? green : s >= 50 ? yellow : red;

  // Check for Lemon Squeezy redirect on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const plan = params.get("plan");

    if (paid === "true" && plan) {
      setPaidAccess(plan);
      setPaidPlan(plan);
      setSuccessMsg(plan === "monthly" ? "🎉 Monthly plan activated! Unlimited scans for 30 days." : "🎉 Payment successful! Your scan is unlocked.");
      setTimeout(() => setSuccessMsg(null), 5000);
      window.history.replaceState({}, "", "/");
    }

    // Load existing paid plan
    const existing = getPaidPlan();
    if (existing) setPaidPlan(existing);
  }, []);

  const canScan = () => {
    if (paidPlan === "monthly") return true;
    if (paidPlan === "onetime") return true;
    return getScansUsed() < FREE_LIMIT;
  };

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setError(null); setExtracting(true); setPdfFile(file);
    try {
      const text = await extractTextFromPDF(file);
      setResumeText(text);
      setStep("analyze");
    } catch { setError("Could not read PDF. Try a different file."); }
    setExtracting(false);
  }, []);

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  const handleAnalyze = async () => {
    if (!resumeText || !jobDesc.trim()) return;

    // Check if user can scan
    if (!canScan()) { setShowPaywall(true); return; }

    setLoading(true); setError(null);
    try {
      const data = await analyzeResume(resumeText, jobDesc);
      setResults(data);
      setStep("results");

      // Track usage
      if (paidPlan === "onetime") {
        localStorage.setItem("resume_paid_scans", "1");
        localStorage.removeItem("resume_paid_plan");
        setPaidPlan(null);
      } else if (!paidPlan) {
        incrementScans();
      }

      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const reset = () => { setStep("upload"); setPdfFile(null); setResumeText(""); setJobDesc(""); setResults(null); setError(null); };

  if (verifying) {
    return (
      <div style={{ minHeight: "100dvh", background: "#08080f", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px", fontFamily: "Inter,system-ui,sans-serif" }}>
        <div style={{ width: "40px", height: "40px", border: `3px solid ${ac}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to{transform:rotate(360deg)} }`}</style>
        <div style={{ color: "#6b7280", fontSize: "14px" }}>Verifying payment...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#08080f", backgroundImage: `radial-gradient(ellipse 100% 40% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 60%)`, display: "flex", justifyContent: "center", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: "720px", display: "flex", flexDirection: "column", alignItems: "center", color: "#e2e8f0", fontFamily: "'Inter', system-ui, sans-serif", padding: "32px 16px 80px", boxSizing: "border-box" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; background: #08080f; }
        #root { width: 100%; display: flex; justify-content: center; }
        textarea { font-family: 'Inter', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2d2d3d; border-radius: 4px; }
      `}</style>

      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}

      {/* Success message */}
      {successMsg && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", padding: "12px 20px", fontSize: "14px", color: "#22c55e", zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
          {successMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ width: "100%", textAlign: "center", marginBottom: "40px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "980px", padding: "6px 16px", fontSize: "12px", color: "#a5b4fc", marginBottom: "16px", letterSpacing: "0.05em" }}>✦ AI-POWERED</div>
        <h1 style={{ fontSize: "clamp(28px,5vw,44px)", fontWeight: "700", letterSpacing: "-0.04em", color: "#fff", margin: "0 0 12px", lineHeight: 1.1 }}>
          Resume <span style={{ color: ac }}>Screener</span>
        </h1>
        <p style={{ fontSize: "16px", color: "#4a4a6a", margin: "0 0 12px", lineHeight: 1.6 }}>Upload your resume + paste a job description.<br />Get your ATS score, match %, and exactly what to fix.</p>

        {/* Plan badge */}
        {paidPlan === "monthly" ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: "980px", padding: "4px 12px", fontSize: "12px", color: green }}>
            ✓ Monthly Plan · Unlimited scans
          </div>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "980px", padding: "4px 12px", fontSize: "12px", color: "#6b7280" }}>
            {getScansUsed() < FREE_LIMIT ? `${FREE_LIMIT - getScansUsed()} free scan remaining` : "Free scan used · Upgrade to continue"}
          </div>
        )}
      </div>

      {/* Steps */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "32px", flexWrap: "wrap", justifyContent: "center" }}>
        {[["1","Upload"],["2","Job Description"],["3","Results"]].map(([num,label],i) => {
          const isActive=(step==="upload"&&i===0)||(step==="analyze"&&i===1)||(step==="results"&&i===2);
          const isDone=(step==="analyze"&&i===0)||(step==="results"&&i<=1);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", background: isDone?green:isActive?ac:"rgba(255,255,255,0.05)", color: isDone||isActive?"#fff":"#333", transition: "all 0.3s" }}>{isDone?"✓":num}</div>
                <span style={{ fontSize: "12px", color: isActive?"#e2e8f0":isDone?"#6b7280":"#333", fontWeight: isActive?"600":"400" }}>{label}</span>
              </div>
              {i<2 && <div style={{ width: "24px", height: "1px", background: isDone?green:"rgba(255,255,255,0.06)" }} />}
            </div>
          );
        })}
      </div>

      {/* STEP 1 — Upload */}
      {step === "upload" && (
        <div style={{ width: "100%", animation: "fadeUp 0.3s ease" }}>
          <div onDrop={handleDrop} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onClick={()=>fileInputRef.current?.click()}
            style={{ width: "100%", border: `2px dashed ${dragOver?ac:"rgba(255,255,255,0.1)"}`, borderRadius: "20px", padding: "60px 24px", textAlign: "center", cursor: "pointer", background: dragOver?"rgba(99,102,241,0.05)":"rgba(255,255,255,0.02)", transition: "all 0.2s" }}>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e=>handleFile(e.target.files[0])} />
            {extracting ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "32px", height: "32px", border: `3px solid ${ac}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <div style={{ fontSize: "14px", color: "#6b7280" }}>Reading PDF...</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>📄</div>
                <div style={{ fontSize: "17px", fontWeight: "600", color: "#e2e8f0", marginBottom: "8px" }}>Drop your resume here</div>
                <div style={{ fontSize: "14px", color: "#4a4a6a", marginBottom: "20px" }}>or click to browse</div>
                <div style={{ display: "inline-block", padding: "10px 24px", borderRadius: "980px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc", fontSize: "13px", fontWeight: "500" }}>Choose PDF</div>
                <div style={{ fontSize: "12px", color: "#2d2d4d", marginTop: "16px" }}>PDF files only · Max 10MB</div>
              </>
            )}
          </div>
          {error && <div style={{ marginTop: "14px", padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", fontSize: "13px", color: "#fca5a5" }}>⚠️ {error}</div>}
        </div>
      )}

      {/* STEP 2 — Job Description */}
      {step === "analyze" && (
        <div style={{ width: "100%", animation: "fadeUp 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>✅</div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "#e2e8f0" }}>{pdfFile?.name}</div>
                <div style={{ fontSize: "12px", color: "#4a4a6a" }}>{resumeText.split(" ").length} words extracted</div>
              </div>
            </div>
            <button onClick={reset} style={{ fontSize: "12px", color: "#4a4a6a", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Change</button>
          </div>
          <div style={{ fontSize: "13px", fontWeight: "500", color: "#94a3b8", marginBottom: "8px", letterSpacing: "0.5px" }}>PASTE THE JOB DESCRIPTION</div>
          <textarea value={jobDesc} onChange={e=>setJobDesc(e.target.value)} placeholder="Paste the full job description here — include requirements, responsibilities, and qualifications for the best analysis..." rows={10}
            style={{ width: "100%", padding: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", color: "#e2e8f0", fontSize: "14px", resize: "vertical", outline: "none", lineHeight: 1.7, marginBottom: "14px" }}
            onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.08)"} />
          {error && <div style={{ marginBottom: "14px", padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", fontSize: "13px", color: "#fca5a5" }}>⚠️ {error}</div>}
          <button onClick={handleAnalyze} disabled={!jobDesc.trim()||loading} style={{ width: "100%", padding: "16px", background: jobDesc.trim()&&!loading?`linear-gradient(135deg,${ac},#818cf8)`:"rgba(255,255,255,0.04)", border: "none", borderRadius: "12px", color: jobDesc.trim()&&!loading?"#fff":"#333", cursor: jobDesc.trim()&&!loading?"pointer":"not-allowed", fontSize: "15px", fontWeight: "600", fontFamily: "'Inter',system-ui,sans-serif", boxShadow: jobDesc.trim()&&!loading?"0 4px 24px rgba(99,102,241,0.35)":"none", transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            {loading?(<><div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Analyzing...</>):"Analyze Resume →"}
          </button>
        </div>
      )}

      {/* STEP 3 — Results */}
      {step === "results" && results && (
        <div ref={resultsRef} style={{ width: "100%", animation: "fadeUp 0.4s ease" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "40px", padding: "28px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "20px", marginBottom: "14px", flexWrap: "wrap" }}>
            <ScoreRing score={results.ats_score} label="ATS SCORE" color={scoreColor(results.ats_score)} />
            <ScoreRing score={results.match_percentage} label="JOB MATCH" color={scoreColor(results.match_percentage)} />
          </div>

          {results.top_recommendation && (
            <div style={{ width: "100%", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "14px", padding: "16px 20px", marginBottom: "14px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ fontSize: "11px", color: ac, letterSpacing: "2px", marginBottom: "4px", fontWeight: "600" }}>TOP PRIORITY ACTION</div>
                <div style={{ fontSize: "14px", color: "#e2e8f0", lineHeight: 1.6 }}>{results.top_recommendation}</div>
              </div>
            </div>
          )}

          {results.overall_summary && <Card title="Overall Assessment" icon="📊"><p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{results.overall_summary}</p></Card>}

          {results.strengths?.length > 0 && <Card title="What's Working Well" icon="✅"><div style={{ display: "flex", flexWrap: "wrap" }}>{results.strengths.map((s,i)=><Tag key={i} text={s} color={green}/>)}</div></Card>}

          {results.missing_keywords?.length > 0 && <Card title="Missing Keywords" icon="🔍"><div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "10px" }}>Add these to pass ATS filters:</div><div style={{ display: "flex", flexWrap: "wrap" }}>{results.missing_keywords.map((kw,i)=><Tag key={i} text={kw} color={red}/>)}</div></Card>}

          {results.what_to_add?.length > 0 && <Card title="What to Add" icon="➕"><div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{results.what_to_add.map((item,i)=><div key={i} style={{ padding: "12px 14px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "10px" }}><div style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0", marginBottom: "4px" }}>{item.point}</div><div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5 }}>{item.reason}</div></div>)}</div></Card>}

          {results.what_to_remove?.length > 0 && <Card title="What to Remove" icon="✂️"><div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{results.what_to_remove.map((item,i)=><div key={i} style={{ padding: "12px 14px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "10px" }}><div style={{ fontSize: "13px", fontWeight: "600", color: "#e2e8f0", marginBottom: "4px" }}>{item.point}</div><div style={{ fontSize: "12px", color: "#6b7280", lineHeight: 1.5 }}>{item.reason}</div></div>)}</div></Card>}

          {results.rewrite_suggestions?.length > 0 && <Card title="Rewrite Suggestions" icon="✏️"><div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>{results.rewrite_suggestions.map((item,i)=><div key={i}><div style={{ fontSize: "11px", color: yellow, letterSpacing: "1.5px", fontWeight: "600", marginBottom: "8px" }}>{item.section?.toUpperCase()}</div><div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "8px", marginBottom: "6px" }}><div style={{ fontSize: "10px", color: red, letterSpacing: "1px", marginBottom: "4px" }}>BEFORE</div><div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.5 }}>{item.original}</div></div><div style={{ padding: "10px 14px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "8px", marginBottom: "6px" }}><div style={{ fontSize: "10px", color: green, letterSpacing: "1px", marginBottom: "4px" }}>AFTER</div><div style={{ fontSize: "13px", color: "#e2e8f0", lineHeight: 1.5 }}>{item.improved}</div></div><div style={{ fontSize: "12px", color: "#6b7280", padding: "0 4px" }}>💡 {item.reason}</div></div>)}</div></Card>}

          <button onClick={reset} style={{ width: "100%", padding: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#94a3b8", cursor: "pointer", fontSize: "14px", fontWeight: "500", fontFamily: "'Inter',system-ui,sans-serif", marginTop: "8px" }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.1)"}>
            ↩ Screen Another Resume
          </button>
        </div>
      )}

      <div style={{ marginTop: "40px", fontSize: "11px", color: "#1e1e2e", letterSpacing: "1px", textAlign: "center" }}>RESUME SCREENER · POWERED BY GPT-4o-mini</div>
      </div>
    </div>
  );
}
