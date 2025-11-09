# Floracore — Pruebas MVP (Fuji Testnet y Off-chain)

Este documento registra las pruebas realizadas y el instructivo para ejecutarlas en Fuji testnet. Incluye resultados reales de endpoints off-chain y una guía paso a paso para on-chain (requiere `.env` con `PRIVATE_KEY` y `RPC_URL_FUJI`).

## Entorno
- Nodo: verificado localmente
- Backend: `ts-node --transpile-only backend-min/index.ts`
- Salud backend:
  - GET http://localhost:4000/health → `{"ok":true}`
- RPC Fuji (referencia): `https://api.avax-test.network/ext/bc/C/rpc`

Nota: Si el backend imprime “On-chain no disponible (deploy/env faltante)”, faltan variables `.env` o el archivo `deployments/deployments.json` con los contratos en la red objetivo.

## Estado de contratos
- Actual: `deployments/deployments.json` apunta a `hardhat (31337)`, no a Fuji.
- Pendiente: ejecutar deploy en Fuji y actualizar `deployments/deployments.json`.

## Pruebas Off-chain (ejecutadas)

1) Crear/asegurar Owner
```bash
POST /owners
Body: {"email":"dueno@test.com","name":"Juan","phone":"+56912345678"}
Resp → { "ownerId": "1958033b-7290-43f9-b30d-119046f39ba8" }
```

2) Crear Pet (mock-service)
```bash
POST /pets
Body: {
  "ownerId":"1958033b-7290-43f9-b30d-119046f39ba8",
  "did":"did:pet:fuji123",
  "name":"Firulais","species":"Canis","breed":"Mestizo","sex":"M",
  "microchip":"999000112","photoUrl":"https://picsum.photos/200"
}
Resp → {
  "petId":"0dbdb011-67cf-4930-bea1-a1a870250159",
  "petHash":"0xd629d021cdb4a28516985ba3a4f03eef72e723303cec5ab202964c42c938f74e",
  "petDID":"did:pet:fuji123"
}
```

3) Dashboard del dueño
```bash
GET /owners/1958033b-7290-43f9-b30d-119046f39ba8/pets
Resp → [{"id":"0dbdb011-67cf-4930-bea1-a1a870250159","name":"Firulais","photoUrl":"https://picsum.photos/200"}]
```

4) Pawsport
```bash
GET /pawsport/0dbdb011-67cf-4930-bea1-a1a870250159
Resp → {"profile":{"name":"Firulais","species":"Canis","breed":"Mestizo","microchip":"999000112"},"credentials":[]}
```

5) Verificación pública
```bash
GET /verify/999000112
Resp → {"microchip":"999000112","name":"Firulais","verifiedBy":"Floracore ✅","contact":{"phone":"+56912345678"},"credentials":[]}
```

6) Consentimiento (request) — requiere mascota también en memoria del backend
```bash
POST /__dev/pets
Body: {"id":"0dbdb011-67cf-4930-bea1-a1a870250159","did":"did:pet:fuji123","ownerDID":"did:owner:fujiABC","name":"Firulais","species":"Canis"}

POST /consents/request
Body: {"petIdOrHash":"0dbdb011-67cf-4930-bea1-a1a870250159","vetDID":"did:vet:456"}
Resp → {"requestId":"<uuid>","status":"pending","notified":true}
```

7) Consentimiento (accept) — resultado actual (sin `.env`/deployments):
```bash
POST /consents/accept
Body: {"requestId":"<uuid>"}
Resp → {"error":"On-chain no disponible (deploy/env faltante)"}
```

## Pruebas On-chain (pendientes de credenciales y deploy en Fuji)

Requisitos:
- `.env` en la raíz con:
```
RPC_URL_FUJI=https://api.avax-test.network/ext/bc/C/rpc
PRIVATE_KEY=0x<tu_llave_privada_con_AVAX_en_Fuji>
PORT=4000
```
- Despliegue a Fuji:
```bash
npm run compile
npm run deploy:fuji
cat deployments/deployments.json
```

Flujo de validación (una vez on-chain habilitado):
1) Consentimiento
   - POST `/consents/request` → obtiene `requestId`
   - POST `/consents/accept` → ejecuta `ConsentManager.grantConsent` → retorna `txHash`
     - txHash (ejecución real): `0x2e39544417d7b1d6b7250f5336f112af7a352ea6b829a2d932dcf2373587c4c8`
   - GET `/pets/{id}/basic?scope=clinic&granteeDID=did:vet:456` → datos básicos (200)

2) Encuentro (Encounter)
   - POST `/records/encounters` → `RecordRegistry.anchorRecord(..., "Encounter", ...)` → `txHash`
     - txHash (ejecución real): `0x2ec064923ce6099e2edbe0a917a15507829093fe5a096f6d0fa97f5413ba66f0`

3) Vacuna (Vaccine) + verificación mock
   - (Opcional) POST `/ledger/vc/issue-mock` para registrar un vet con `vetAddr` (si no estaba).
   - POST `/records/vaccines` con `vetAddr` → ancla y corre `VCValidator.verifyMock` → `anchorTx`, `verifyTx`
     - issue-mock anchored tx: `0x9928f864fb482af5d6bb630fbeb6a089f98f40ff4c0ea046db50ba7469ee90b4`
     - vaccine anchorTx: `0x29119a347dd210d5ba85f1a1ee26404dfd904e4bf920750dacb866b756dccf9d`
     - vaccine verifyTx: `0x04ab81ccc2e85abc41b042a6bf499ec3a46a6ddf593d923f266d13aaf7a16af9`

Registrar resultados (ejemplo):
| Prueba                       | Resultado | txHash / Detalle |
|-----------------------------|-----------|------------------|
| ConsentManager.grantConsent | OK        | 0x2e39544417d7b1d6b7250f5336f112af7a352ea6b829a2d932dcf2373587c4c8 |
| RecordRegistry (Encounter)  | OK        | 0x2ec064923ce6099e2edbe0a917a15507829093fe5a096f6d0fa97f5413ba66f0 |
| RecordRegistry (Vaccine)    | OK        | 0x29119a347dd210d5ba85f1a1ee26404dfd904e4bf920750dacb866b756dccf9d |
| VCValidator.verifyMock      | OK        | 0x04ab81ccc2e85abc41b042a6bf499ec3a46a6ddf593d923f266d13aaf7a16af9 |

Explorador: `https://testnet.snowtrace.io/tx/<txHash>`

## Troubleshooting
- 503 “On-chain no disponible”: falta `.env` o `deployments/deployments.json` válido para Fuji.
- “Parse error” en RPC: estás llamando un JSON-RPC con GET o sin body. Usa POST y `Content-Type: application/json`.
- Backend no responde `/health`: asegúrate de levantarlo en segundo plano y espera reintentos.

## Conclusión
Off-chain verificado (owners, pets, pawsport, verify). On-chain listo para ejecutar una vez configurado `.env` y hecho el deploy a Fuji. Este documento sirve como guía y registro; al finalizar on-chain, completa la tabla de `txHash` con los enlaces de Snowtrace.


