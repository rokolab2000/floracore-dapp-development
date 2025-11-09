# Backend mínimo (MVP)

- Express + Ethers (Fuji)
- Endpoints: consents (request/accept), records (encounters/vaccines), vc/add, owners/pets, pawsport, verify, resolve, appointments, auth (email/wallet) mock.

## Configuración

1. cp env.example .env y completa:
   - RPC_URL_FUJI=https://api.avax-test.network/ext/bc/C/rpc
   - PRIVATE_KEY=0x<tu_llave_privada_fuji>
   - PORT=4000
2. npm i
3. npm run dev

## Endpoints clave

- Salud: GET /health
- Dueños/Mascotas: POST /owners, POST /pets, GET /owners/:ownerId/pets
- Pawsport: GET /pawsport/:petId
- Verificación pública: GET /verify/:microchip
- Consents: POST /consents/request → POST /consents/accept
- Records: POST /records/encounters, POST /records/vaccines
- VC genérica: POST /vc/add
- Resolve microchip: GET /pets/resolve?microchip=...
- Auth mock: POST /auth/login-email, POST /auth/wallet-connect

## Notas

- ABIs locales en `abi/*.abi.json`; si no existen, intenta `artifacts/`.
- On-chain requiere `.env` y `deployments/deployments.json` con direcciones en Fuji.


