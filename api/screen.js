export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  // Parse body manually in case Vercel doesn't auto-parse
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON body" }); }
  }
  if (!body) {
    return res.status(400).json({ error: "Empty request body" });
  }

  const { resumeText, jobDescription } = body;
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ error: "Missing resumeText or jobDescription" });
  }

  const prompt = `You are an expert ATS (Applicant Tracking System) and resume coach.

Analyze the following resume against the job description and return a JSON object with this exact structure:
{
  "ats_score": <number 0-100>,
  "match_percentage": <number 0-100>,
  "overall_summary": "<2-3 sentence overall assessment>",
  "missing_keywords": ["keyword1", "keyword2"],
  "what_to_add": [{"point": "...", "reason": "..."}],
  "what_to_remove": [{"point": "...", "reason": "..."}],
  "rewrite_suggestions": [{"section": "...", "original": "...", "improved": "...", "reason": "..."}],
  "strengths": ["strength1", "strength2"],
  "top_recommendation": "<single most important action to take>"
}

Rules:
- ats_score: how well the resume will pass ATS filters (formatting, keywords, structure)
- match_percentage: how well the candidate matches the job requirements
- missing_keywords: important keywords from job description missing in resume (max 10)
- what_to_add: specific things to add to improve the resume for this role (max 5)
- what_to_remove: things that are irrelevant or hurting the resume (max 3)
- rewrite_suggestions: specific lines/sections to rewrite with improved versions (max 3)
- strengths: what the resume already does well (max 4)
- Return ONLY valid JSON. No markdown, no backticks, no explanation.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI error" });
    }

    const raw = data.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: "AI returned invalid JSON", raw });
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Failed to analyze resume", details: err.message });
  }
}
