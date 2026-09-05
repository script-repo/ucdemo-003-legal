/**
 * Database API — Contract metadata via PostgreSQL.
 * In production, calls a backend API that queries pg-db.
 * Falls back to in-memory mock data when no backend is available.
 *
 * PostgreSQL cluster DNS: pg-db.ntnx-use-cases.svc.cluster.local:5432
 * Database: legal_ai | User: legal_admin
 *
 * NOTE: Browsers cannot connect to PostgreSQL directly.
 * A backend service (e.g., Node/Express or Python/FastAPI) should expose
 * REST endpoints that this module calls. For now, mock data is used.
 */

const PG_API_BASE = '/api/contracts'; // Future backend REST endpoint

const MOCK_CONTRACTS = [
  { id: "contract-001", name: "Master Service Agreement - Acme Corp", uploadedBy: "jane.doe", uploadedAt: "2024-01-15T10:30:00.000Z", riskScore: 72, status: "Reviewed" },
  { id: "contract-002", name: "Software License Agreement - TechVendor", uploadedBy: "john.smith", uploadedAt: "2024-02-20T14:45:00.000Z", riskScore: 45, status: "Pending" },
  { id: "contract-003", name: "NDA - StartupXYZ", uploadedBy: "jane.doe", uploadedAt: "2024-03-01T09:00:00.000Z", riskScore: 28, status: "Approved" },
  { id: "contract-004", name: "Vendor Agreement - Logistics Inc", uploadedBy: "bob.wilson", uploadedAt: "2024-03-05T16:20:00.000Z", riskScore: 89, status: "Flagged" },
  { id: "contract-005", name: "Consulting Services - ExpertCo", uploadedBy: "jane.doe", uploadedAt: "2024-03-08T11:15:00.000Z", riskScore: 55, status: "In Review" },
];

let localContracts = [...MOCK_CONTRACTS];
let nextId = 1000;

async function tryBackend(path, opts) {
  try {
    const res = await fetch(`${PG_API_BASE}${path}`, opts);
    if (res.ok) return await res.json();
  } catch (_) { /* backend not available */ }
  return null;
}

/**
 * Save a new contract with metadata.
 * @param {Object} meta - Contract metadata.
 * @returns {Promise<Object>}
 */
export async function saveContract(meta) {
  const result = await tryBackend('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (result) return result;

  const saved = { ...meta, id: `contract-${String(nextId++).padStart(3, "0")}` };
  localContracts.unshift(saved);
  return saved;
}

/**
 * Get all contracts.
 * @returns {Promise<Array>}
 */
export async function getContracts() {
  const result = await tryBackend('', { method: 'GET' });
  if (result) return result;
  return [...localContracts];
}

/**
 * Get a contract by id.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getContractById(id) {
  const result = await tryBackend(`/${id}`, { method: 'GET' });
  if (result) return result;
  const contract = localContracts.find((c) => c.id === id);
  return contract ? { ...contract } : null;
}
