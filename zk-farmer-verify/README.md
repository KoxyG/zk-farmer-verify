# ZK-Farmer Verify

A privacy-preserving identity and supply verification DApp for smallholder farmers using Midnight and Lace Wallet.

[![Compact Compiler](https://img.shields.io/badge/Compact%20Compiler-0.24.0-1abc9c.svg)](https://docs.midnight.network/relnotes/compact)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)

---

## Prerequisites

1. **Node.js**: Version 22.15 or greater
2. **Compact Compiler**: Download from [Midnight releases](https://docs.midnight.network/relnotes/compact) and add to your `$PATH`.
3. **Install dependencies**:
   ```sh
   npm install
   ```
4. **Proof Server**: Follow [Midnight docs](https://docs.midnight.network/develop/tutorial/using/proof-server) to install and launch the proof server.

---

## Project Structure

- `contract/src/farmer.compact` – Main Compact smart contract
- `contract/src/managed/farmer/` – Generated contract files after compilation
- `cli/` – Command-line interface for interacting with the contract
- `frontend/` – (Optional) User interface

---

## Building and Compiling the Contract

1. **Compile the Compact contract:**
   ```sh
   cd contract
   npm run compact
   # or
   compactc --vscode ./src/farmer.compact ./src/managed/farmer
   ```
   This generates contract files in `src/managed/farmer/contract/`.

2. **Build the TypeScript project:**
   ```sh
   npx turbo build
   # or
   npm run build
   ```

---

## CLI Usage

The CLI allows you to deploy/join contracts, register farmers, register crops, and view contract info.

1. **Start the CLI:**
   ```sh
   cd cli
   npm run testnet-remote
   # or
   npm start
   ```

2. **Follow the prompts:**
   - Deploy or join a farmer verification contract
   - Register a new farmer
   - Register a crop for a farmer
   - Run test farmer registration
   - Display contract information

**Example CLI session:**
```
You can do one of the following:
  1. Deploy a new farmer verification contract
  2. Join an existing farmer verification contract
  3. Exit
Which would you like to do? 1

You can do one of the following:
  1. Register a new farmer
  2. Register a crop for a farmer
  3. Run test farmer registration
  4. Display farmer contract information
  5. Exit
Which would you like to do? 1
Enter farmer full name: Maria Silva
Enter farmer region: Huambo
Enter registration date (YYYY-MM-DD): 2024-06-01
...
```

---

## Testing

Run the comprehensive test suite for the farmer verification API:

```sh
cd cli
npm run test-api -- src/test/farmer.api.test.ts
```

This test suite includes:
- **Contract Deployment**: Tests deploying the farmer verification contract
- **Farmer Registration**: Tests privacy-preserving farmer signup functionality
- **Crop Registration**: Tests secure crop tracking for registered farmers
- **Contract Joining**: Tests joining existing farmer verification contracts
- **Ledger State Queries**: Tests retrieving farmer and crop information

The tests use Docker containers to provide a complete testing environment with:
- Midnight node
- Indexer service
- Proof server

**Note**: The first run may take several minutes as it downloads the required Docker images.

---

## Features

- **Farmer Registration**: Privacy-preserving farmer signup with ZK proofs
- **Crop Registration**: Secure crop tracking for registered farmers
- **Zero-Knowledge Verification**: Prove farmer status without revealing identity
- **Supply Chain Transparency**: Track agricultural goods from farm to market

---

## Troubleshooting

- **File not found:**
  - If you see an error about `FarmerVerifier.mc` or `myContract.compact` not found, make sure your contract file is named `farmer.compact` and your build scripts reference the correct file.
- **Contract compilation errors:**
  - Ensure you are using the correct Compact compiler version and that your contract syntax matches the latest Compact language.
- **Proof server issues:**
  - Make sure the proof server is running and accessible before running the CLI.

---

## Resources
- [Midnight Developer Docs](https://docs.midnight.network/develop/tutorial/building)
- [Compact Language Reference](https://docs.midnight.network/develop/compact/overview)
- [Official Faucet](https://faucet.testnet-02.midnight.network/)

---

## License
Apache-2.0
