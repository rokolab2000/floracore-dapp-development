import "dotenv/config";
import express from "express";
import { z } from "zod";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { canonicalJsonStringify, sha256Hex } from "./utils/hash-util";
import {
  addCredential,
  createPet,
  db as mockDb,
  getOwnerBySession,
  getPetById,
  getPetByMicrochip,
  listCredentials,
  listOwnerPets,
  loginWithEmail,
  walletConnect
} from "./mock/mock-service";

const PORT = parseInt(process.env.PORT || "4000", 10);

// Carga de direcciones de contratos desplegados (opcional para permitir arranque sin on-chain)
const deploymentsPath = path.join(process.cwd(), "deployments", "deployments.json");
let deployments: any | null = null;
let onChainEnabled = true;
if (!fs.existsSync(deploymentsPath)) {
  console.warn("deployments/deployments.json no encontrado. On-chain deshabilitado hasta que se haga deploy.");
  onChainEnabled = false;
} else {
  deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));
}

// Configuración del proveedor RPC y la wallet (opcional)
const rpc = process.env.RPC_URL_FUJI;
const pkRaw = process.env.PRIVATE_KEY;
const pk = pkRaw && pkRaw.startsWith("0x") ? pkRaw : (pkRaw ? ("0x" + pkRaw) : pkRaw);
let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
if (!rpc || !pk) {
  console.warn("RPC_URL_FUJI y/o PRIVATE_KEY ausentes. On-chain deshabilitado.");
  onChainEnabled = false;
} else {
  provider = new ethers.JsonRpcProvider(rpc);
  wallet = new ethers.Wallet(pk, provider);
}

// Carga de ABIs y contratos si on-chain está habilitado
let rr: ethers.Contract | null = null;
let vr: ethers.Contract | null = null;
let cm: ethers.Contract | null = null;
let vv: ethers.Contract | null = null;
if (onChainEnabled) {
  try {
    // Intentar cargar desde backend-min/abi, si no existe, fallback a artifacts
    const abiRootA = path.join(__dirname, "abi");
    const hasLocalAbi =
      fs.existsSync(path.join(abiRootA, "RecordRegistry.abi.json")) &&
      fs.existsSync(path.join(abiRootA, "VetRegistry.abi.json")) &&
      fs.existsSync(path.join(abiRootA, "ConsentManager.abi.json")) &&
      fs.existsSync(path.join(abiRootA, "VCValidator.abi.json"));
    let rrAbi, vrAbi, cmAbi, vvAbi;
    if (hasLocalAbi) {
      rrAbi = JSON.parse(fs.readFileSync(path.join(abiRootA, "RecordRegistry.abi.json"), "utf-8"));
      vrAbi = JSON.parse(fs.readFileSync(path.join(abiRootA, "VetRegistry.abi.json"), "utf-8"));
      cmAbi = JSON.parse(fs.readFileSync(path.join(abiRootA, "ConsentManager.abi.json"), "utf-8"));
      vvAbi = JSON.parse(fs.readFileSync(path.join(abiRootA, "VCValidator.abi.json"), "utf-8"));
    } else {
      const artifactsRoot = path.join(process.cwd(), "artifacts", "contracts");
      rrAbi = JSON.parse(fs.readFileSync(path.join(artifactsRoot, "RecordRegistry.sol", "RecordRegistry.json"), "utf-8")).abi;
      vrAbi = JSON.parse(fs.readFileSync(path.join(artifactsRoot, "VetRegistry.sol", "VetRegistry.json"), "utf-8")).abi;
      cmAbi = JSON.parse(fs.readFileSync(path.join(artifactsRoot, "ConsentManager.sol", "ConsentManager.json"), "utf-8")).abi;
      vvAbi = JSON.parse(fs.readFileSync(path.join(artifactsRoot, "VCValidator.sol", "VCValidator.json"), "utf-8")).abi;
    }
    rr = new ethers.Contract(deployments!.contracts.RecordRegistry, rrAbi, wallet!);
    vr = new ethers.Contract(deployments!.contracts.VetRegistry, vrAbi, wallet!);
    cm = new ethers.Contract(deployments!.contracts.ConsentManager, cmAbi, wallet!);
    vv = new ethers.Contract(deployments!.contracts.VCValidator, vvAbi, wallet!);
  } catch (e) {
    console.warn("No se pudieron cargar ABIs/contratos. On-chain deshabilitado.", e);
    onChainEnabled = false;
    rr = vr = cm = vv = null;
  }
}

const app = express();
app.use(express.json());

// Almacenamiento en memoria para el MVP
type AuditEntry = {
  action: string;
  refId?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};
type ConsentRequest = {
  id: string;
  petIdOrHash: string;
  vetDID?: string;
  clinicDID?: string;
  subjectDID?: string;
  granteeDID?: string;
  status: "pending" | "accepted";
  consentHashHex?: string;
  txHash?: string;
  createdAt: number;
  updatedAt: number;
};
type PetBasic = {
  id: string;
  hash: string;
  did: string;
  ownerDID: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  photoUrl?: string;
  ageYears?: number;
  lastWeightKg?: number;
  microchip?: string;
};
type Appointment = {
  id: string;
  petId: string;
  vetDID?: string;
  clinicDID?: string;
  reason?: string;
  createdAt: number;
};
type EncounterRecord = {
  id: string;
  petId: string;
  vetDID?: string;
  clinicDID?: string;
  reason?: string;
  notes?: string;
  vitals?: Record<string, unknown>;
  uri?: string;
  recordHashHex: string;
  txHash?: string;
  createdAt: number;
};
type VaccineRecord = {
  id: string;
  petId: string;
  vetDID?: string;
  clinicDID?: string;
  vaccine: Record<string, unknown>;
  attachments?: unknown[];
  uri?: string;
  recordHashHex: string;
  anchoredTxHash?: string;
  verifyTxHash?: string;
  createdAt: number;
};

const memory = {
  pets: new Map<string, PetBasic>(),
  consentRequests: new Map<string, ConsentRequest>(),
  appointments: new Map<string, Appointment>(),
  encounters: new Map<string, EncounterRecord>(),
  vaccines: new Map<string, VaccineRecord>(),
  audit: [] as AuditEntry[]
};

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- Autenticación / Roles (mock) ----------
app.post("/auth/login-email", async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const d = schema.parse(req.body);
  const session = await loginWithEmail(d.email);
  res.json({ sessionToken: session.token, ownerId: session.ownerId });
});

app.post("/auth/wallet-connect", async (req, res) => {
  const schema = z.object({ address: z.string() });
  const d = schema.parse(req.body);
  const roles = walletConnect(d.address);
  res.json(roles);
});

// ---------- Dueños y Mascotas ----------
app.post("/owners", async (req, res) => {
  const schema = z.object({ email: z.string().email(), name: z.string().optional(), phone: z.string().optional() });
  const d = schema.parse(req.body);
  const session = await loginWithEmail(d.email); // crea owner si no existe
  const owner = mockDb.owners.get(session.ownerId)!;
  if (d.name) owner.name = d.name;
  if (d.phone) owner.phone = d.phone;
  mockDb.owners.set(owner.id, owner);
  res.json({ ownerId: owner.id });
});

app.post("/pets", async (req, res) => {
  const schema = z.object({
    ownerId: z.string(),
    did: z.string(),
    name: z.string(),
    species: z.string(),
    breed: z.string().optional(),
    sex: z.string().optional(),
    microchip: z.string().optional(),
    photoUrl: z.string().optional()
  });
  const d = schema.parse(req.body);
  if (!mockDb.owners.has(d.ownerId)) return res.status(404).json({ error: "Owner no existe" });
  const pet = await createPet(d);
  res.json({ petId: pet.id, petHash: pet.hash, petDID: pet.did });
});

app.get("/owners/:ownerId/pets", async (req, res) => {
  if (!mockDb.owners.has(req.params.ownerId)) return res.status(404).json({ error: "Owner no existe" });
  const pets = listOwnerPets(req.params.ownerId).map((p) => ({ id: p.id, name: p.name, photoUrl: p.photoUrl }));
  res.json(pets);
});

// ---------- Pawsport y verificación pública ----------
app.get("/pawsport/:petId", async (req, res) => {
  const pet = getPetById(req.params.petId);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  const creds = listCredentials(pet.id);
  res.json({
    profile: {
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      microchip: pet.microchip
    },
    credentials: creds
  });
});

app.get("/verify/:microchip", async (req, res) => {
  const pet = getPetByMicrochip(req.params.microchip);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  const owner = mockDb.owners.get(pet.ownerId)!;
  const creds = listCredentials(pet.id).map((c) => ({
    id: c.id,
    type: c.type,
    status: "VALIDO"
  }));
  res.json({
    microchip: pet.microchip,
    name: pet.name,
    verifiedBy: "Floracore ✅",
    contact: owner?.shareContact ? { phone: owner.phone ?? "N/D" } : null,
    credentials: creds
  });
});

// Resolver por microchip
app.get("/pets/resolve", async (req, res) => {
  const schema = z.object({ microchip: z.string() });
  const qp = schema.parse(req.query);
  const pet = getPetByMicrochip(qp.microchip);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });
  res.json({ id: pet.id, name: pet.name, species: pet.species, breed: pet.breed });
});

app.post("/ledger/anchor", async (req, res) => {
  const schema = z.object({
    subjectDID: z.string(),
    issuerDID: z.string(),
    kind: z.string(),
    recordHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    uri: z.string().optional()
  });
  const data = schema.parse(req.body);
  if (!rr) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx = await rr.anchorRecord(data.subjectDID, data.issuerDID, data.kind, data.recordHashHex, data.uri ?? "");
  const rc = await tx.wait();
  res.json({ txHash: rc.hash, blockNumber: rc.blockNumber });
});

app.post("/ledger/vc/issue-mock", async (req, res) => {
  const schema = z.object({
    vetAddr: z.string(),
    vetDID: z.string(),
    metadataURI: z.string().optional(),
    subjectDID: z.string(),
    kind: z.string().default("VC:Vaccine"),
    recordHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    uri: z.string().optional()
  });
  const d = schema.parse(req.body);
  if (!vr || !rr) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx1 = await vr.registerVet(d.vetAddr, d.vetDID, d.metadataURI ?? "");
  await tx1.wait();
  const tx2 = await rr.anchorRecord(d.subjectDID, d.vetDID, d.kind, d.recordHashHex, d.uri ?? "");
  const rc2 = await tx2.wait();
  res.json({ registered: tx1.hash, anchored: rc2.hash });
});

app.post("/ledger/vc/verify-mock", async (req, res) => {
  const schema = z.object({
    issuer: z.string(),
    subjectDID: z.string(),
    kind: z.string(),
    recordHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  });
  const d = schema.parse(req.body);
  if (!vv) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx = await vv.verifyMock(d.issuer, d.subjectDID, d.kind, d.recordHashHex);
  const rc = await tx.wait();
  res.json({ txHash: rc.hash, blockNumber: rc.blockNumber });
});

app.post("/ledger/consent/grant", async (req, res) => {
  const schema = z.object({
    subjectDID: z.string(),
    granteeDID: z.string(),
    consentHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/)
  });
  const d = schema.parse(req.body);
  if (!cm) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx = await cm.grantConsent(d.subjectDID, d.granteeDID, d.consentHashHex);
  const rc = await tx.wait();
  res.json({ txHash: rc.hash, blockNumber: rc.blockNumber });
});

app.post("/ledger/consent/revoke", async (req, res) => {
  const schema = z.object({
    subjectDID: z.string(),
    granteeDID: z.string()
  });
  const d = schema.parse(req.body);
  if (!cm) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx = await cm.revokeConsent(d.subjectDID, d.granteeDID);
  const rc = await tx.wait();
  res.json({ txHash: rc.hash, blockNumber: rc.blockNumber });
});

// Solicitud de consentimiento (off-chain)
app.post("/consents/request", async (req, res) => {
  const schema = z.object({
    petIdOrHash: z.string(),
    vetDID: z.string().optional(),
    clinicDID: z.string().optional()
  });
  const d = schema.parse(req.body);
  const id = uuid();

  // Resolución simple de Pet para obtener subjectDID si existe en memoria
  let subjectDID: string | undefined;
  const petById = memory.pets.get(d.petIdOrHash);
  if (petById) subjectDID = petById.did;
  if (!subjectDID) {
    // si viene un hash y existe, intentamos buscar por hash
    for (const p of memory.pets.values()) {
      if (p.hash === d.petIdOrHash) {
        subjectDID = p.did;
        break;
      }
    }
  }

  const granteeDID = d.clinicDID ?? d.vetDID;
  const now = Date.now();
  const reqObj: ConsentRequest = {
    id,
    petIdOrHash: d.petIdOrHash,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    subjectDID,
    granteeDID,
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
  memory.consentRequests.set(id, reqObj);
  memory.audit.push({
    action: "CONSENT_REQUEST_CREATED",
    refId: id,
    metadata: { petIdOrHash: d.petIdOrHash, vetDID: d.vetDID, clinicDID: d.clinicDID },
    timestamp: now
  });
  res.json({ requestId: id, status: "pending", notified: true });
});

// Aceptación de consentimiento (on-chain grant)
app.post("/consents/accept", async (req, res) => {
  const schema = z.object({
    requestId: z.string()
  });
  const d = schema.parse(req.body);
  const reqObj = memory.consentRequests.get(d.requestId);
  if (!reqObj) return res.status(404).json({ error: "Solicitud no encontrada" });
  if (reqObj.status === "accepted") return res.json({ requestId: d.requestId, status: "accepted", txHash: reqObj.txHash });
  if (!reqObj.subjectDID || !reqObj.granteeDID) {
    return res.status(400).json({ error: "Falta subjectDID o granteeDID para conceder" });
  }
  if (!cm) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });

  // Simulación de firma JWS → aquí sólo calculamos hash del payload canónico
  const jwsPayload = {
    typ: "consent",
    subjectDID: reqObj.subjectDID,
    granteeDID: reqObj.granteeDID,
    requestedAt: reqObj.createdAt,
    acceptedAt: Date.now(),
    requestId: reqObj.id
  };
  const jwsCanonical = canonicalJsonStringify(jwsPayload);
  const consentHashHex = await sha256Hex(jwsCanonical);

  const tx = await cm.grantConsent(reqObj.subjectDID, reqObj.granteeDID, consentHashHex);
  const rc = await tx.wait();

  reqObj.status = "accepted";
  reqObj.updatedAt = Date.now();
  reqObj.txHash = rc.hash;
  reqObj.consentHashHex = consentHashHex;
  memory.consentRequests.set(reqObj.id, reqObj);
  memory.audit.push({
    action: "CONSENT_GRANTED",
    refId: reqObj.id,
    txHash: rc.hash,
    metadata: { subjectDID: reqObj.subjectDID, granteeDID: reqObj.granteeDID },
    timestamp: Date.now()
  });
  res.json({ requestId: reqObj.id, status: "accepted", txHash: rc.hash });
});

// Datos básicos de la mascota (requiere consentimiento vigente)
app.get("/pets/:id/basic", async (req, res) => {
  const schema = z.object({
    scope: z.string().optional(),
    granteeDID: z.string().optional()
  });
  const qp = schema.parse(req.query);
  const pet = memory.pets.get(req.params.id);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });

  // Si la consulta es para clínica, verificar consentimiento activo
  if (qp.scope === "clinic") {
    const granteeDID = qp.granteeDID;
    if (!granteeDID) return res.status(400).json({ error: "granteeDID requerido para scope=clinic" });
    // getConsent(subjectDID, granteeDID) → Status { None(0), Granted(1), Revoked(2) }
    if (!cm) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
    const consent = await cm.getConsent(pet.did, granteeDID);
    const status: number = Number(consent.status ?? consent[3] ?? 0);
    if (status !== 1) return res.status(403).json({ error: "Consentimiento no vigente" });
  }
  res.json({
    id: pet.id,
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    sex: pet.sex,
    photoUrl: pet.photoUrl,
    ageYears: pet.ageYears,
    lastWeightKg: pet.lastWeightKg
  });
});

// Crear cita
app.post("/appointments", async (req, res) => {
  const schema = z.object({
    petId: z.string(),
    vetDID: z.string().optional(),
    clinicDID: z.string().optional(),
    reason: z.string().optional()
  });
  const d = schema.parse(req.body);
  if (!memory.pets.has(d.petId)) return res.status(404).json({ error: "Mascota no encontrada" });
  const id = uuid();
  const appt: Appointment = {
    id,
    petId: d.petId,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    reason: d.reason,
    createdAt: Date.now()
  };
  memory.appointments.set(id, appt);
  memory.audit.push({ action: "APPOINTMENT_CREATED", refId: id, metadata: { petId: d.petId }, timestamp: Date.now() });
  res.json({ id, ok: true });
});

// Endpoint de desarrollo para crear una mascota en memoria y calcular PetHash
app.post("/__dev/pets", async (req, res) => {
  const schema = z.object({
    id: z.string().optional(),
    did: z.string(),
    ownerDID: z.string(),
    name: z.string(),
    species: z.string(),
    breed: z.string().optional(),
    sex: z.string().optional(),
    photoUrl: z.string().optional(),
    ageYears: z.number().optional(),
    lastWeightKg: z.number().optional()
  });
  const d = schema.parse(req.body);
  const id = d.id ?? uuid();
  const coreProfile = {
    pedigree: null,
    name: d.name,
    species: d.species,
    breed: d.breed ?? null,
    sex: d.sex ?? null,
    birthDate: null
  };
  const petHash = await sha256Hex(canonicalJsonStringify(coreProfile));
  const pet: PetBasic = {
    id,
    hash: petHash,
    did: d.did,
    ownerDID: d.ownerDID,
    name: d.name,
    species: d.species,
    breed: d.breed,
    sex: d.sex,
    photoUrl: d.photoUrl,
    ageYears: d.ageYears,
    lastWeightKg: d.lastWeightKg
  };
  memory.pets.set(id, pet);
  memory.audit.push({ action: "DEV_PET_CREATED", refId: id, metadata: { did: d.did }, timestamp: Date.now() });
  res.json({ id, petHash, did: d.did });
});

// Registro de atención (Encounter) con anclaje
app.post("/records/encounters", async (req, res) => {
  const schema = z.object({
    petId: z.string(),
    vetId: z.string().optional(),
    vetDID: z.string().optional(),
    clinicDID: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    vitals: z.record(z.any()).optional(),
    attachments: z.array(z.any()).optional()
  });
  const d = schema.parse(req.body);
  const pet = memory.pets.get(d.petId);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });

  // Documento clínico canónico para hash (simulado; los adjuntos se incluyen en el JSON)
  const doc = {
    type: "Encounter",
    petId: d.petId,
    petDID: pet.did,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    reason: d.reason,
    notes: d.notes,
    vitals: d.vitals,
    attachments: d.attachments ?? [],
    createdAt: Date.now()
  };
  const canonical = canonicalJsonStringify(doc);
  const recordHashHex = await sha256Hex(canonical);
  const uri = "ipfs://mock/encounter/" + uuid();

  if (!rr) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx = await rr.anchorRecord(pet.did, d.vetDID ?? d.clinicDID ?? "", "Encounter", recordHashHex, uri);
  const rc = await tx.wait();

  const rec: EncounterRecord = {
    id: uuid(),
    petId: d.petId,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    reason: d.reason,
    notes: d.notes,
    vitals: d.vitals,
    uri,
    recordHashHex,
    txHash: rc.hash,
    createdAt: Date.now()
  };
  memory.encounters.set(rec.id, rec);
  memory.audit.push({ action: "ENCOUNTER_ANCHORED", refId: rec.id, txHash: rc.hash, timestamp: Date.now() });
  res.json({ id: rec.id, txHash: rc.hash });
});

// Registro de vacuna con anclaje + VC mock + verificación mock
app.post("/records/vaccines", async (req, res) => {
  const schema = z.object({
    petId: z.string(),
    vetAddr: z.string().optional(), // requerido para verifyMock en red
    vetDID: z.string().optional(),
    clinicDID: z.string().optional(),
    vaccine: z.object({
      name: z.string(),
      manufacturer: z.string().optional(),
      lot: z.string().optional(),
      dose: z.string().optional(),
      route: z.string().optional(),
      site: z.string().optional(),
      date: z.string().optional(),
      nextDue: z.string().optional()
    }),
    attachments: z.array(z.any()).optional()
  });
  const d = schema.parse(req.body);
  const pet = memory.pets.get(d.petId);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });

  const doc = {
    type: "Vaccine",
    petId: d.petId,
    petDID: pet.did,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    vaccine: d.vaccine,
    attachments: d.attachments ?? [],
    createdAt: Date.now()
  };
  const canonical = canonicalJsonStringify(doc);
  const recordHashHex = await sha256Hex(canonical);
  const uri = "ipfs://mock/vaccine/" + uuid();

  if (!rr) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
  const tx1 = await rr.anchorRecord(pet.did, d.vetDID ?? d.clinicDID ?? "", "Vaccine", recordHashHex, uri);
  const rc1 = await tx1.wait();

  let rc2Hash: string | undefined;
  if (d.vetAddr) {
    if (!vv) return res.status(503).json({ error: "On-chain no disponible (deploy/env faltante)" });
    const tx2 = await vv.verifyMock(d.vetAddr, pet.did, "VC:Vaccine", recordHashHex);
    const rc2 = await tx2.wait();
    rc2Hash = rc2.hash;
  }

  const rec: VaccineRecord = {
    id: uuid(),
    petId: d.petId,
    vetDID: d.vetDID,
    clinicDID: d.clinicDID,
    vaccine: d.vaccine as Record<string, unknown>,
    attachments: d.attachments,
    uri,
    recordHashHex,
    anchoredTxHash: rc1.hash,
    verifyTxHash: rc2Hash,
    createdAt: Date.now()
  };
  memory.vaccines.set(rec.id, rec);
  memory.audit.push({ action: "VACCINE_ANCHORED", refId: rec.id, txHash: rc1.hash, timestamp: Date.now() });
  if (rc2Hash) memory.audit.push({ action: "VC_VERIFIED_MOCK", refId: rec.id, txHash: rc2Hash, timestamp: Date.now() });
  res.json({ id: rec.id, anchorTx: rc1.hash, verifyTx: rc2Hash });
});

// VC genérica (PedigreeOficial, Certificado de Salud, etc.)
app.post("/vc/add", async (req, res) => {
  const schema = z.object({
    petId: z.string(),
    type: z.string(),
    data: z.record(z.any()),
    uri: z.string().optional()
  });
  const d = schema.parse(req.body);
  const pet = getPetById(d.petId);
  if (!pet) return res.status(404).json({ error: "Mascota no encontrada" });

  const canonical = canonicalJsonStringify({ petId: d.petId, petDID: pet.did, type: d.type, data: d.data, createdAt: Date.now() });
  const recordHashHex = await sha256Hex(canonical);

  let anchoredTxHash: string | undefined;
  if (rr) {
    const tx = await rr.anchorRecord(pet.did, "", d.type, recordHashHex, d.uri ?? "");
    const rc = await tx.wait();
    anchoredTxHash = rc.hash;
  }
  const cred = addCredential({
    petId: d.petId,
    type: d.type,
    data: d.data,
    uri: d.uri,
    recordHashHex,
    anchoredTxHash
  });
  res.json({ id: cred.id, anchoredTxHash, recordHashHex });
});

app.listen(PORT, () => {
  console.log(`Backend-min listening on http://localhost:${PORT}`);
});
