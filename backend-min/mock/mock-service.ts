// Servicio en memoria para el MVP: usuarios, sesiones, roles y datos básicos
import { canonicalJsonStringify, sha256Hex } from "../utils/hash-util";

export type Session = { token: string; ownerId: string; email: string; createdAt: number };
export type Owner = { id: string; email: string; name?: string; phone?: string; shareContact?: boolean };

export type Pet = {
  id: string;
  ownerId: string;
  did: string;
  microchip?: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  photoUrl?: string;
  pawscore?: number;
  hash: string; // PetHash
};

export type Credential = {
  id: string;
  petId: string;
  type: string; // Vaccine, HealthCert, PedigreeOficial, VC:Ownership, etc
  data: Record<string, unknown>;
  uri?: string;
  recordHashHex: string;
  anchoredTxHash?: string;
  verifyTxHash?: string;
  issuedAt: number;
};

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const db = {
  sessions: new Map<string, Session>(),
  owners: new Map<string, Owner>(),
  pets: new Map<string, Pet>(),
  petByMicrochip: new Map<string, string>(), // microchip -> petId
  credentialsByPet: new Map<string, Credential[]>(),
  roles: {
    veterinarians: new Set<string>(), // direcciones
    kennelClub: new Set<string>()
  }
};

export async function loginWithEmail(email: string): Promise<Session> {
  // Crear (o recuperar) owner para el email
  let owner = [...db.owners.values()].find((o) => o.email === email);
  if (!owner) {
    owner = { id: uuid(), email, shareContact: true };
    db.owners.set(owner.id, owner);
  }
  const session: Session = { token: uuid(), ownerId: owner.id, email, createdAt: Date.now() };
  db.sessions.set(session.token, session);
  return session;
}

export function getOwnerBySession(token: string | undefined): Owner | null {
  if (!token) return null;
  const s = db.sessions.get(token);
  if (!s) return null;
  return db.owners.get(s.ownerId) ?? null;
}

export function walletConnect(address: string): { isVeterinarian: boolean; isKennelClub: boolean } {
  const addr = address.toLowerCase();
  return {
    isVeterinarian: db.roles.veterinarians.has(addr),
    isKennelClub: db.roles.kennelClub.has(addr)
  };
}

export async function createPet(params: {
  ownerId: string;
  did: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  microchip?: string;
  photoUrl?: string;
}): Promise<Pet> {
  const coreProfile = {
    name: params.name,
    species: params.species,
    breed: params.breed ?? null,
    sex: params.sex ?? null,
    microchip: params.microchip ?? null
  };
  const petHash = await sha256Hex(canonicalJsonStringify(coreProfile));
  const pet: Pet = {
    id: uuid(),
    ownerId: params.ownerId,
    did: params.did,
    name: params.name,
    species: params.species,
    breed: params.breed,
    sex: params.sex,
    microchip: params.microchip,
    photoUrl: params.photoUrl,
    pawscore: 100,
    hash: petHash
  };
  db.pets.set(pet.id, pet);
  if (pet.microchip) db.petByMicrochip.set(pet.microchip, pet.id);
  return pet;
}

export function listOwnerPets(ownerId: string): Pet[] {
  return [...db.pets.values()].filter((p) => p.ownerId === ownerId);
}

export function getPetById(petId: string): Pet | undefined {
  return db.pets.get(petId);
}

export function getPetByMicrochip(microchip: string): Pet | undefined {
  const id = db.petByMicrochip.get(microchip);
  return id ? db.pets.get(id) : undefined;
}

export function addCredential(entry: Omit<Credential, "id" | "issuedAt">): Credential {
  const cred: Credential = { ...entry, id: uuid(), issuedAt: Date.now() };
  const arr = db.credentialsByPet.get(cred.petId) ?? [];
  arr.unshift(cred);
  db.credentialsByPet.set(cred.petId, arr);
  return cred;
}

export function listCredentials(petId: string): Credential[] {
  return db.credentialsByPet.get(petId) ?? [];
}


