# zk-farmer-verify# zk-farmer-verify

A privacy-preserving identity and supply verification DApp for smallholder farmers in Angola using Midnight and Lace Wallet.

## Building the Contract

To compile the Compact smart contract:

```bash
cd contract
compactc --vscode src/farmer.compact src/managed/farmer
```

This command compiles the `farmer.compact` contract and generates the necessary JavaScript files in the `src/managed/farmer` directory.

## Project Structure

- `contract/src/farmer.compact` - The main Compact smart contract
- `contract/src/managed/farmer/` - Generated contract files after compilation
- `cli/` - Command-line interface for interacting with the contract
- `frontend/` - User interface (if applicable)

## Features

- **Farmer Registration**: Privacy-preserving farmer signup with ZK proofs
- **Crop Registration**: Secure crop tracking for registered farmers
- **Zero-Knowledge Verification**: Prove farmer status without revealing identity
- **Supply Chain Transparency**: Track agricultural goods from farm to market

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile the contract:
   ```bash
   cd contract
   compactc --vscode src/farmer.compact src/managed/farmer
   ```

3. Build the project:
   ```bash
   npx turbo build
   ```

4. Run the CLI:
   ```bash
   cd cli
   npm run testnet-remote
   ```