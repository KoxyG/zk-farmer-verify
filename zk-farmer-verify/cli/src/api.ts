// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { type CoinInfo, nativeToken, Transaction, type TransactionId } from '@midnight-ntwrk/ledger';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import {
  type BalancedTransaction,
  createBalancedTx,
  type FinalizedTxData,
  type MidnightProvider,
  type UnbalancedTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { type Resource, WalletBuilder } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { Transaction as ZswapTransaction } from '@midnight-ntwrk/zswap';
import { webcrypto } from 'crypto';
import { type Logger } from 'pino';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as fsAsync from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Config, contractConfig } from './config';
import { type FarmerProviders, type DeployedFarmerContract } from './common-types';

let logger: Logger;
// Instead of setting globalThis.crypto which is read-only, we'll ensure crypto is available
// but won't try to overwrite the global property
// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// Define __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the farmer verification contract
const farmerVerifierContractInstance = async () => {
  try {
    logger.info('Loading farmer verification contract...');
    
    // Path to the contract file
    const contractPath = path.resolve(__dirname, '../../contract/src/managed/farmer/contract/index.cjs');
    logger.info(`Contract path: ${contractPath}`);
    
    // Check if the contract file exists
    if (!fs.existsSync(contractPath)) {
      throw new Error(`Contract file not found at ${contractPath}. Please run: compactc --vscode src/farmer.compact src/managed/farmer`);
    }
    
    // Read the contract file
    const contractCode = fs.readFileSync(contractPath, 'utf8');
    logger.info(`Contract code loaded: ${contractCode.length} bytes`);
    
    // Create a contract structure that matches the expected format for the Midnight JS SDK
    const contract = {
      code: Buffer.from(contractCode).toString('hex'),
      circuits: {
        sign_up: {
          name: 'sign_up',
          inputs: [
            { name: 'farmer_hash', type: 'bytes32' },
            { name: 'full_name', type: 'field' },
            { name: 'region', type: 'field' },
            { name: 'registration_date', type: 'field' }
          ],
          outputs: []
        },
        register_crop: {
          name: 'register_crop',
          inputs: [
            { name: 'farmer_hash', type: 'bytes32' },
            { name: 'crop_name', type: 'field' },
            { name: 'planting_date', type: 'field' },
            { name: 'expected_harvest_date', type: 'field' },
            { name: 'crop_type', type: 'field' }
          ],
          outputs: []
        },
        test_farmer_registration: {
          name: 'test_farmer_registration',
          inputs: [],
          outputs: []
        }
      },
      impureCircuits: {
        sign_up: {
          name: 'sign_up',
          inputs: [
            { name: 'farmer_hash', type: 'bytes32' },
            { name: 'full_name', type: 'field' },
            { name: 'region', type: 'field' },
            { name: 'registration_date', type: 'field' }
          ],
          outputs: []
        },
        register_crop: {
          name: 'register_crop',
          inputs: [
            { name: 'farmer_hash', type: 'bytes32' },
            { name: 'crop_name', type: 'field' },
            { name: 'planting_date', type: 'field' },
            { name: 'expected_harvest_date', type: 'field' },
            { name: 'crop_type', type: 'field' }
          ],
          outputs: []
        },
        test_farmer_registration: {
          name: 'test_farmer_registration',
          inputs: [],
          outputs: []
        }
      },
      constructorData: {},
      witnesses: {},
      initialState: () => ({
        registered_farmers: new Map(),
        farmer_details: new Map(),
        farmer_crops: new Map(),
        crop_details: new Map()
      })
    };
    
    logger.info('Contract loaded successfully');
    logger.info(`Circuit definitions: ${Object.keys(contract.circuits).join(', ')}`);
    return contract as any; // Use type assertion to bypass type checking
  } catch (error) {
    logger.error('Failed to load contract:', error);
    throw error;
  }
};

export const getFarmerLedgerState = async (
  providers: FarmerProviders,
  contractAddress: ContractAddress,
): Promise<{ registeredFarmers: number; totalCrops: number } | null> => {
  assertIsContractAddress(contractAddress);
  logger.info('Checking farmer contract ledger state...');
  const state = await providers.publicDataProvider.queryContractState(contractAddress);
  if (state != null) {
    // This would need to be implemented based on your actual ledger structure
    logger.info(`Ledger state retrieved for contract ${contractAddress}`);
    return { registeredFarmers: 0, totalCrops: 0 }; // Placeholder
  }
  return null;
};

export const joinContract = async (
  providers: FarmerProviders,
  contractAddress: string,
): Promise<DeployedFarmerContract> => {
  logger.info(`Joining farmer verification contract at address: ${contractAddress}`);
  const contract = await farmerVerifierContractInstance();
  
  // Create a provider structure that matches what findDeployedContract expects
  const joinProviders = {
    midnight: providers.midnightProvider,
    wallet: providers.walletProvider,
    zkConfig: providers.zkConfigProvider,
    logger
  } as any;
  
  const farmerContract = await findDeployedContract(
    joinProviders,
    {
      privateStateId: contractConfig.privateStateStoreName,
      contractAddress,
      contract,
      initialPrivateState: {},
    }
  );
  
  logger.info(`Joined contract at address: ${contractAddress}`);
  return farmerContract as unknown as DeployedFarmerContract;
};

export const deploy = async (providers: FarmerProviders): Promise<DeployedFarmerContract> => {
  logger.info('Deploying farmer verification contract...');
  const contract = await farmerVerifierContractInstance();
  
  // Create a provider structure that matches what deployContract expects
  const deployProviders = {
    midnight: providers.midnightProvider,
    wallet: providers.walletProvider,
    zkConfig: providers.zkConfigProvider,
    logger
  } as any;
  
  logger.info('Calling deployContract with contract and providers');
  
  const farmerContract = await deployContract(
    deployProviders,
    {
      privateStateId: contractConfig.privateStateStoreName,
      contract,
      initialPrivateState: {},
    }
  );
  
  logger.info(`Deployed contract at address: ${farmerContract.deployTxData.public.contractAddress}`);
  return farmerContract as unknown as DeployedFarmerContract;
};

export const signUpFarmer = async (
  farmerContract: DeployedFarmerContract,
  farmerHash: Uint8Array,
  fullName: bigint,
  region: bigint,
  registrationDate: bigint
): Promise<FinalizedTxData> => {
  logger.info('Registering new farmer...');
  // Placeholder implementation - would need proper contract integration
  logger.info(`Farmer registration would be called with hash: ${farmerHash}, name: ${fullName}, region: ${region}, date: ${registrationDate}`);
  throw new Error('signUpFarmer not yet implemented - requires proper contract integration');
};

export const registerCrop = async (
  farmerContract: DeployedFarmerContract,
  farmerHash: Uint8Array,
  cropName: bigint,
  plantingDate: bigint,
  expectedHarvestDate: bigint,
  cropType: bigint
): Promise<FinalizedTxData> => {
  logger.info('Registering crop for farmer...');
  // Placeholder implementation - would need proper contract integration
  logger.info(`Crop registration would be called with hash: ${farmerHash}, crop: ${cropName}, planting: ${plantingDate}, harvest: ${expectedHarvestDate}, type: ${cropType}`);
  throw new Error('registerCrop not yet implemented - requires proper contract integration');
};

export const testFarmerRegistration = async (
  farmerContract: DeployedFarmerContract
): Promise<FinalizedTxData> => {
  logger.info('Running test farmer registration...');
  // Placeholder implementation - would need proper contract integration
  logger.info('Test farmer registration would be called');
  throw new Error('testFarmerRegistration not yet implemented - requires proper contract integration');
};

export const displayFarmerInfo = async (
  providers: FarmerProviders,
  farmerContract: DeployedFarmerContract,
): Promise<{ contractAddress: string; farmerInfo: any }> => {
  const contractAddress = farmerContract.deployTxData.public.contractAddress;
  const farmerInfo = await getFarmerLedgerState(providers, contractAddress);
  if (farmerInfo === null) {
    logger.info(`There is no farmer contract deployed at ${contractAddress}.`);
  } else {
    logger.info(`Farmer contract info: ${JSON.stringify(farmerInfo)}`);
  }
  return { contractAddress, farmerInfo };
};

export const createWalletAndMidnightProvider = async (wallet: Wallet): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(wallet.state());
  return {
    coinPublicKey: state.coinPublicKey,
    encryptionPublicKey: state.encryptionPublicKey,
    balanceTx(tx: UnbalancedTransaction, newCoins: CoinInfo[]): Promise<BalancedTransaction> {
      return wallet
        .balanceTransaction(
          ZswapTransaction.deserialize(tx.serialize(getLedgerNetworkId()), getZswapNetworkId()),
          newCoins,
        )
        .then((tx) => wallet.proveTransaction(tx))
        .then((zswapTx) => Transaction.deserialize(zswapTx.serialize(getZswapNetworkId()), getLedgerNetworkId()))
        .then(createBalancedTx);
    },
    submitTx(tx: BalancedTransaction): Promise<TransactionId> {
      return wallet.submitTransaction(tx);
    },
  };
};

export const waitForSync = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((state) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        logger.info(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state) => {
        // Let's allow progress only if wallet is synced fully
        return state.syncProgress !== undefined && state.syncProgress.synced;
      }),
    ),
  );

export const waitForSyncProgress = async (wallet: Wallet) =>
  await Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.tap((state) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        logger.info(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state) => {
        // Let's allow progress only if syncProgress is defined
        return state.syncProgress !== undefined;
      }),
    ),
  );

export const waitForFunds = (wallet: Wallet) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.tap((state) => {
        const applyGap = state.syncProgress?.lag.applyGap ?? 0n;
        const sourceGap = state.syncProgress?.lag.sourceGap ?? 0n;
        logger.info(
          `Waiting for funds. Backend lag: ${sourceGap}, wallet lag: ${applyGap}, transactions=${state.transactionHistory.length}`,
        );
      }),
      Rx.filter((state) => {
        // Let's allow progress only if wallet is synced
        return state.syncProgress?.synced === true;
      }),
      Rx.map((s) => s.balances[nativeToken()] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

export const buildWalletAndWaitForFunds = async (
  { indexer, indexerWS, node, proofServer }: Config,
  seed: string,
  filename: string,
): Promise<Wallet & Resource> => {
  const directoryPath = process.env.SYNC_CACHE;
  let wallet: Wallet & Resource;
  if (directoryPath !== undefined) {
    if (fs.existsSync(`${directoryPath}/${filename}`)) {
      logger.info(`Attempting to restore state from ${directoryPath}/${filename}`);
      try {
        const serializedStream = fs.createReadStream(`${directoryPath}/${filename}`, 'utf-8');
        const serialized = await streamToString(serializedStream);
        serializedStream.on('finish', () => {
          serializedStream.close();
        });
        wallet = await WalletBuilder.restore(indexer, indexerWS, proofServer, node, seed, serialized, 'info');
        wallet.start();
        const stateObject = JSON.parse(serialized);
        if ((await isAnotherChain(wallet, Number(stateObject.offset))) === true) {
          logger.warn('The chain was reset, building wallet from scratch');
          wallet = await WalletBuilder.buildFromSeed(
            indexer,
            indexerWS,
            proofServer,
            node,
            seed,
            getZswapNetworkId(),
            'info',
          );
          wallet.start();
        } else {
          const newState = await waitForSync(wallet);
          // allow for situations when there's no new index in the network between runs
          if (newState.syncProgress?.synced) {
            logger.info('Wallet was able to sync from restored state');
          } else {
            logger.info(`Offset: ${stateObject.offset}`);
            logger.info(`SyncProgress.lag.applyGap: ${newState.syncProgress?.lag.applyGap}`);
            logger.info(`SyncProgress.lag.sourceGap: ${newState.syncProgress?.lag.sourceGap}`);
            logger.warn('Wallet was not able to sync from restored state, building wallet from scratch');
            wallet = await WalletBuilder.buildFromSeed(
              indexer,
              indexerWS,
              proofServer,
              node,
              seed,
              getZswapNetworkId(),
              'info',
            );
            wallet.start();
          }
        }
      } catch (error: unknown) {
        if (typeof error === 'string') {
          logger.error(error);
        } else if (error instanceof Error) {
          logger.error(error.message);
        } else {
          logger.error(error);
        }
        logger.warn('Wallet was not able to restore using the stored state, building wallet from scratch');
        wallet = await WalletBuilder.buildFromSeed(
          indexer,
          indexerWS,
          proofServer,
          node,
          seed,
          getZswapNetworkId(),
          'info',
        );
        wallet.start();
      }
    } else {
      logger.info('Wallet save file not found, building wallet from scratch');
      wallet = await WalletBuilder.buildFromSeed(
        indexer,
        indexerWS,
        proofServer,
        node,
        seed,
        getZswapNetworkId(),
        'info',
      );
      wallet.start();
    }
  } else {
    logger.info('File path for save file not found, building wallet from scratch');
    wallet = await WalletBuilder.buildFromSeed(
      indexer,
      indexerWS,
      proofServer,
      node,
      seed,
      getZswapNetworkId(),
      'info',
    );
    wallet.start();
  }

  const state = await Rx.firstValueFrom(wallet.state());
  logger.info(`Your wallet seed is: ${seed}`);
  logger.info(`Your wallet address is: ${state.address}`);
  let balance = state.balances[nativeToken()];
  if (balance === undefined || balance === 0n) {
    logger.info(`Your wallet balance is: 0`);
    logger.info(`Waiting to receive tokens...`);
    balance = await waitForFunds(wallet);
  }
  logger.info(`Your wallet balance is: ${balance}`);
  return wallet;
};

export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  webcrypto.getRandomValues(bytes);
  return bytes;
};

export const buildFreshWallet = async (config: Config): Promise<Wallet & Resource> =>
  await buildWalletAndWaitForFunds(config, toHex(randomBytes(32)), '');

export const configureProviders = async (wallet: Wallet & Resource, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(wallet);
  return {
    privateStateProvider: levelPrivateStateProvider<'farmerPrivateState'>({
      privateStateStoreName: contractConfig.privateStateStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider: new NodeZkConfigProvider<'sign_up' | 'register_crop'>(contractConfig.zkConfigPath),
    proofProvider: httpClientProofProvider(config.proofServer),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export function setLogger(_logger: Logger) {
  logger = _logger;
}

export const streamToString = async (stream: fs.ReadStream): Promise<string> => {
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk));
    stream.on('error', (err) => {
      reject(err);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
};

export const isAnotherChain = async (wallet: Wallet, offset: number) => {
  await waitForSyncProgress(wallet);
  // Here wallet does not expose the offset block it is synced to, that is why this workaround
  const walletOffset = Number(JSON.parse(await wallet.serializeState()).offset);
  if (walletOffset < offset - 1) {
    logger.info(`Your offset offset is: ${walletOffset} restored offset: ${offset} so it is another chain`);
    return true;
  } else {
    logger.info(`Your offset offset is: ${walletOffset} restored offset: ${offset} ok`);
    return false;
  }
};

export const saveState = async (wallet: Wallet, filename: string) => {
  const directoryPath = process.env.SYNC_CACHE;
  if (directoryPath !== undefined) {
    logger.info(`Saving state in ${directoryPath}/${filename}`);
    try {
      await fsAsync.mkdir(directoryPath, { recursive: true });
      const serializedState = await wallet.serializeState();
      const writer = fs.createWriteStream(`${directoryPath}/${filename}`);
      writer.write(serializedState);

      writer.on('finish', function () {
        logger.info(`File '${directoryPath}/${filename}' written successfully.`);
      });

      writer.on('error', function (err) {
        logger.error(err);
      });
      writer.end();
    } catch (e) {
      if (typeof e === 'string') {
        logger.warn(e);
      } else if (e instanceof Error) {
        logger.warn(e.message);
      }
    }
  } else {
    logger.info('Not saving cache as sync cache was not defined');
  }
};
