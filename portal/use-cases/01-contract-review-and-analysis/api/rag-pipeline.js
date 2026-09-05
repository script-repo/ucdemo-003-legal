/**
 * RAG Pipeline — Clause search via Nutanix AI embeddings + ChromaDB.
 * Calls the embeddings endpoint for vectorization; ChromaDB for similarity search.
 * Falls back to mock data if endpoints are unreachable.
 *
 * ChromaDB cluster DNS: ch-db.ntnx-use-cases.svc.cluster.local:8000
 * When running in-browser (no direct cluster access), falls back to mock.
 */
import { embed } from '../../shared/ai-client.js';

const CHROMA_BASE = 'http://ch-db.ntnx-use-cases.svc.cluster.local:8000';

const MOCK_CLAUSES = [
  { id: 'c1', clauseText: 'The Indemnifying Party shall defend, indemnify, and hold harmless the Indemnified Party from any and all claims, damages, losses, and expenses, including consequential damages.', section: 'Section 8 — Indemnification', relevanceScore: 0.94, source: 'Uploaded Contract' },
  { id: 'c2', clauseText: 'The total aggregate liability of either party shall not exceed two times (2x) the total fees paid or payable under this Agreement during the twelve-month period preceding the claim.', section: 'Section 9 — Limitation of Liability', relevanceScore: 0.91, source: 'Uploaded Contract' },
  { id: 'c3', clauseText: 'Either party may terminate this Agreement for convenience upon thirty (30) days prior written notice to the other party.', section: 'Section 12 — Termination', relevanceScore: 0.87, source: 'Uploaded Contract' },
  { id: 'c4', clauseText: 'Neither party may assign this Agreement without the prior written consent of the other party, except that either party may assign to an affiliate without consent.', section: 'Section 14 — Assignment', relevanceScore: 0.85, source: 'Uploaded Contract' },
  { id: 'c5', clauseText: 'Each party agrees to maintain the confidentiality of all Confidential Information disclosed by the other party for a period of three (3) years following disclosure.', section: 'Section 7 — Confidentiality', relevanceScore: 0.82, source: 'Uploaded Contract' },
];

/**
 * Search for clauses matching a query using embeddings + vector DB.
 * Falls back to mock data when endpoints are unavailable (e.g., browser context).
 * @param {string} query - Natural language query.
 * @returns {Promise<Array<{id, clauseText, section, relevanceScore, source}>>}
 */
export async function searchClauses(query) {
  try {
    const embeddingResponse = await embed(query);
    const vector = embeddingResponse?.data?.[0]?.embedding;

    if (!vector) {
      console.warn('Embedding returned no vector, using mock data.');
      return [...MOCK_CLAUSES];
    }

    const searchRes = await fetch(`${CHROMA_BASE}/api/v1/collections/contract_clauses/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embeddings: [vector],
        n_results: 5,
      }),
    });

    if (!searchRes.ok) {
      console.warn('ChromaDB search failed, using mock data.');
      return [...MOCK_CLAUSES];
    }

    const results = await searchRes.json();
    const docs = results.documents?.[0] || [];
    const distances = results.distances?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];

    return docs.map((text, i) => ({
      id: `c${i + 1}`,
      clauseText: text,
      section: metadatas[i]?.section || 'Unknown',
      relevanceScore: Math.max(0, 1 - (distances[i] || 0)),
      source: metadatas[i]?.source || 'Contract DB',
    }));
  } catch (err) {
    console.warn('RAG pipeline unavailable, using mock data:', err.message);
    return [...MOCK_CLAUSES];
  }
}
