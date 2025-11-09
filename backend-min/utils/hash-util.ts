import { ethers } from "ethers";

// Serializa JSON de forma determinista (claves ordenadas) para hashing estable
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value), replacer, 2);
}

function sortKeysDeep(input: any): any {
  if (Array.isArray(input)) {
    return input.map(sortKeysDeep);
  } else if (input !== null && typeof input === "object") {
    const sorted: Record<string, any> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortKeysDeep((input as any)[key]);
    }
    return sorted;
  }
  return input;
}

function replacer(_key: string, value: any) {
  if (value === undefined) return null;
  return value;
}

// Retorna un hex 0x + 64 chars (bytes32) usando SHA-256 del string UTF-8
export async function sha256Hex(text: string): Promise<string> {
  const bytes = ethers.toUtf8Bytes(text);
  const hex = ethers.sha256(bytes);
  return hex;
}


