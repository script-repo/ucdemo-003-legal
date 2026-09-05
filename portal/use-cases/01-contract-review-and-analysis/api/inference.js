/**
 * Inference API — Contract analysis via Nutanix AI chat completions.
 * Falls back to mock data if the endpoint is unreachable.
 */
import { chatCompletion } from '../../shared/ai-client.js';

const SYSTEM_PROMPT = `You are a legal contract analysis AI. When given contract text, respond with a JSON object containing:
- "riskScore": integer 1-100
- "riskLevel": "Low", "Medium", or "High"
- "summary": 2-3 sentence plain-language summary of the contract
- "clauses": array of objects with { "name", "type", "risk" (Low/Medium/High), "deviation" (description vs standard), "fallback" (recommended language) }
- "deviations": array of objects with { "clause", "severity" (Low/Medium/High), "description", "recommendation" }
Only include clauses that are present. Respond ONLY with valid JSON, no markdown fences.`;

const MOCK_ANALYSIS = {
  riskScore: 72,
  riskLevel: "Medium",
  summary: "This agreement contains standard commercial terms with moderate risk. Key concerns include broad indemnification, above-standard liability caps, and a foreign governing law clause.",
  clauses: [
    { name: "Indemnification", type: "Risk Allocation", risk: "High", deviation: "Broader than standard — includes consequential damages", fallback: "Limit indemnification to direct damages only" },
    { name: "Limitation of Liability", type: "Risk Allocation", risk: "Medium", deviation: "Cap set at 2x contract value vs standard 1x", fallback: "Reduce cap to 1x annual contract value" },
    { name: "Termination for Convenience", type: "Term", risk: "Low", deviation: "30-day notice vs standard 60-day", fallback: "Extend notice period to 60 days" },
    { name: "Assignment", type: "Transfer", risk: "Medium", deviation: "Allows assignment without consent to affiliates", fallback: "Require prior written consent for all assignments" },
    { name: "Confidentiality", type: "Data Protection", risk: "Low", deviation: "Standard terms — no deviation", fallback: "N/A" },
    { name: "Governing Law", type: "Dispute Resolution", risk: "Medium", deviation: "Foreign jurisdiction vs standard home state", fallback: "Change governing law to firm's home jurisdiction" },
  ],
  deviations: [
    { clause: "Indemnification", severity: "High", description: "Broader than standard — includes consequential damages", recommendation: "Limit indemnification to direct damages only" },
    { clause: "Limitation of Liability", severity: "Medium", description: "Cap set at 2x contract value vs standard 1x", recommendation: "Reduce cap to 1x annual contract value" },
    { clause: "Assignment", severity: "Medium", description: "Allows assignment without consent to affiliates", recommendation: "Require prior written consent for all assignments" },
    { clause: "Governing Law", severity: "Medium", description: "Foreign jurisdiction vs standard home state", recommendation: "Change governing law to firm's home jurisdiction" },
  ],
};

/**
 * Analyze contract text and return risk assessment with clauses and deviations.
 * Calls the Nutanix chat completions endpoint; falls back to mock on failure.
 * @param {string} text - Contract text (or filename if text unavailable).
 * @returns {Promise<Object>}
 */
export async function analyzeContract(text) {
  try {
    const userContent = text.length > 50
      ? `Analyze the following contract:\n\n${text}`
      : `Analyze a contract titled "${text}". Since the full text is not available, provide a representative analysis based on typical commercial contract terms.`;

    const response = await chatCompletion([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { maxTokens: 2048 });

    const raw = response.choices?.[0]?.message?.content;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.riskScore && parsed.clauses) {
        return parsed;
      }
    }
    console.warn('Inference returned unexpected format, using mock data.');
    return { ...MOCK_ANALYSIS };
  } catch (err) {
    console.warn('Inference endpoint unavailable, using mock data:', err.message);
    return { ...MOCK_ANALYSIS };
  }
}
