# 🌸 Floracore - Pet Digital Identity Platform

Floracore is a decentralized application (DApp) built on Avalanche that provides sovereign digital identity for pets through Soulbound Tokens (SBTs). The platform simplifies the complex process of obtaining international travel certificates and managing pet medical records.

## 🎯 Features

- **Soulbound Pet Passports**: Non-transferable NFTs tied to pet microchip numbers
- **Medical Records Management**: Immutable, verifiable medical history stored on IPFS
- **Account Abstraction**: Email-based login with gasless transactions for pet owners
- **Veterinarian Portal**: Authorized vets can register pets and add medical records
- **Public Verification**: Anyone can verify pet credentials using microchip numbers

## 🏗️ Architecture

### Smart Contracts

1. **OfficialRegistry.sol**: Manages authorized veterinarians
2. **FloracoreSBT.sol**: ERC721-based Soulbound Token for pet identity
3. **FloracoreRecords.sol**: Stores and manages medical records

### Frontend

- **Next.js 14** with App Router
- **Ethers.js** for blockchain interactions
- **ZeroDev SDK** for Account Abstraction
- **Tailwind CSS** for styling
- **IPFS** for decentralized document storage

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MetaMask or compatible Web3 wallet
- AVAX tokens on Fuji testnet (get from [Avalanche Faucet](https://faucet.avax.network/))

### Installation

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Copy `.env.example` to `.env` and fill in your values:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

### Deploy Smart Contracts

1. Compile contracts:
   \`\`\`bash
   npm run compile
   \`\`\`

2. Deploy to Fuji testnet:
   \`\`\`bash
   npm run deploy:fuji
   \`\`\`

3. Update `.env` with deployed contract addresses

### Run Frontend

\`\`\`bash
npm run dev
\`\`\`

Visit `http://localhost:3000`

## 📋 Usage

### For Pet Owners

1. Sign in with your email (Account Abstraction)
2. View your pet's digital passport
3. Access all medical records and certificates
4. Share verification link with authorities

### For Veterinarians

1. Connect with MetaMask (must be authorized)
2. Register new pets with microchip numbers
3. Add medical records and certificates
4. Upload documents to IPFS automatically

### For Verifiers

1. Visit the public verification page
2. Enter pet microchip number
3. View verified credentials and records

## 🔐 Security

- Soulbound tokens prevent unauthorized transfers
- Only authorized veterinarians can mint passports and add records
- All records are immutably stored on blockchain
- IPFS ensures decentralized document storage

## 🌐 Network Information

- **Testnet**: Avalanche Fuji (Chain ID: 43113)
- **Mainnet**: Avalanche C-Chain (Chain ID: 43114)
- **RPC**: https://api.avax-test.network/ext/bc/C/rpc

## 📄 License

MIT License

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📞 Support

For questions or support, please open an issue on GitHub.

---

Built with ❤️ for the Avalanche Hackathon
