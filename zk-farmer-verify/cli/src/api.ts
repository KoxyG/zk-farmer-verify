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
import {
  type FarmerContract,
  type FarmerProviders,
  type DeployedFarmerContract,
  FarmerPrivateStateId,
} from './common-types.js';
import { type Config, contractConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getLedgerNetworkId, getZswapNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as fsAsync from 'node:fs/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FarmerVerifier, witnesses, type FarmerPrivateState } from '@midnight-ntwrk/counter-contract';

let logger: Logger;
// Instead of setting globalThis.crypto which is read-only, we'll ensure crypto is available
// but won't try to overwrite the global property
// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// Define __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the farmer verification contract
const farmerVerifierContractInstance = async (): Promise<FarmerContract> => {
  try {
    logger.info('Loading farmer verification contract...');
    
    // Debug: Check if witnesses are properly imported
    logger.info('Checking witnesses object...');
    logger.info('Witnesses type:', typeof witnesses);
    logger.info('Witnesses keys:', Object.keys(witnesses || {}));
    
    // Check if each witness function exists
    if (witnesses) {
      logger.info('create_test_farmer_hash exists:', typeof witnesses.create_test_farmer_hash);
      logger.info('create_test_farmer_name exists:', typeof witnesses.create_test_farmer_name);
      logger.info('create_test_region exists:', typeof witnesses.create_test_region);
      logger.info('create_test_crop_name exists:', typeof witnesses.create_test_crop_name);
      
      // Test calling one of the witness functions
      try {
        const testHash = witnesses.create_test_farmer_hash();
        logger.info('Test witness call successful, result type:', typeof testHash);
        logger.info('Test witness result:', testHash);
      } catch (witnessError) {
        logger.error('Test witness call failed:', witnessError);
      }
    } else {
      logger.error('Witnesses object is null or undefined!');
    }
    
    // Use the FarmerVerifier.Contract class with witnesses, similar to the working counter example
    const contractInstance = new FarmerVerifier.Contract(witnesses as any);
    
    logger.info('Contract loaded successfully');
    logger.info(`Available circuits: ${Object.keys(contractInstance.circuits || {}).join(', ')}`);
    logger.info(`Contract has initialState method: ${typeof contractInstance.initialState === 'function'}`);
    logger.info(`Contract has impureCircuits: ${Object.keys(contractInstance.impureCircuits || {}).join(', ')}`);
    
    // Try to test the contract's initialState method
    try {
      logger.info('Testing contract initialState method...');
      const testState = contractInstance.initialState({
        initialPrivateState: {},
        initialZswapLocalState: {
          coinPublicKey: { bytes: new Uint8Array(32) },
          currentIndex: 0n,
        inputs: [],
        outputs: []
      }
      });
      logger.info('Contract initialState test successful:', Object.keys(testState));
    } catch (stateError) {
      logger.error('Contract initialState test failed:', stateError);
    }
    
    return contractInstance as FarmerContract;
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
  
  const farmerContract = await findDeployedContract(
    providers,
    {
      contractAddress,
      contract,
      privateStateId: FarmerPrivateStateId,
      initialPrivateState: {},
    }
  );
  
  logger.info(`Joined contract at address: ${farmerContract.deployTxData.public.contractAddress}`);
  return farmerContract as DeployedFarmerContract;
};

// Add a function to test contract state initialization
const testContractStateInitialization = async (contract: FarmerContract): Promise<void> => {
  try {
    logger.info('Testing contract state initialization...');
    
    // Try to call the test_farmer_registration circuit which should initialize the state
    if (contract.circuits && contract.circuits.test_farmer_registration) {
      logger.info('Found test_farmer_registration circuit, testing state initialization...');
      
      // Create a mock context for testing
      const mockContext = {
        originalState: null,
        currentPrivateState: {},
        currentZswapLocalState: {},
        transactionContext: null
      };
      
      // This might help initialize the state
      logger.info('Contract circuits available:', Object.keys(contract.circuits));
    }
    
    logger.info('Contract state initialization test completed');
  } catch (error) {
    logger.error('Error testing contract state initialization:', error);
  }
};

export const deploy = async (providers: FarmerProviders): Promise<DeployedFarmerContract> => {
  logger.info('Deploying farmer verification contract...');
  const contract = await farmerVerifierContractInstance();
  
  // Test the contract state initialization
  await testContractStateInitialization(contract);
  
  logger.info('Deploying contract with Midnight framework...');
  
  const farmerContract = await deployContract(
    providers,
    {
      contract,
      privateStateId: FarmerPrivateStateId,
      initialPrivateState: {},
    }
  );
  
  logger.info(`Deployed contract at address: ${farmerContract.deployTxData.public.contractAddress}`);
  logger.info('Contract deployed successfully.');
  
  return farmerContract as DeployedFarmerContract;
};

export const signUpFarmer = async (
  farmerContract: DeployedFarmerContract,
  farmerHash: Uint8Array,
  fullName: bigint,
  region: bigint,
  registrationDate: bigint
): Promise<FinalizedTxData> => {
  logger.info('Registering new farmer...');
  
  try {
    // Log the contract structure to understand what's available
    logger.info('Contract structure:', Object.keys(farmerContract));
    logger.info('Contract deployTxData:', Object.keys(farmerContract.deployTxData || {}));
    
    // First try callTx method
    if ('callTx' in farmerContract && farmerContract.callTx && typeof farmerContract.callTx === 'object') {
      const callTx = farmerContract.callTx as any;
      if (callTx.sign_up && typeof callTx.sign_up === 'function') {
        logger.info('Using callTx.sign_up method');
        logger.info(`Calling with parameters: farmerHash=${farmerHash}, fullName=${fullName}, region=${region}, registrationDate=${registrationDate}`);
        
        const tx = await callTx.sign_up(farmerHash, fullName, region, registrationDate);
        logger.info('Transaction created:', typeof tx, Object.keys(tx || {}));
        
        if (tx && typeof tx.finalize === 'function') {
          logger.info('Finalizing transaction...');
          const finalizedTx = await tx.finalize();
          logger.info(`Farmer registration transaction finalized: ${finalizedTx.txHash}`);
          return finalizedTx;
        } else {
          logger.info('Transaction returned but no finalize method found');
          return tx;
        }
      }
    }
    
    // If callTx doesn't work, try direct circuit method
    logger.info('callTx method not available, trying direct circuit method...');
    if ('contract' in farmerContract && farmerContract.contract) {
      const contract = (farmerContract as any).contract;
      if (contract.circuits && contract.circuits.sign_up) {
        logger.info('Found direct circuit method, but this requires proper context setup');
        logger.info('Direct circuit methods need proper state context which is complex to set up');
        throw new Error('Direct circuit method requires complex state context setup - not implemented');
      }
    }
    
    // If we get here, the contract doesn't have the expected structure
    logger.error('Contract does not have expected callTx.sign_up method');
    logger.info('Available contract properties:', Object.keys(farmerContract));
    if ('callTx' in farmerContract) {
      logger.info('callTx properties:', Object.keys((farmerContract as any).callTx || {}));
    }
    
    throw new Error('Contract does not have callTx.sign_up method. This contract may not be properly generated for Midnight framework interaction.');
    
  } catch (error) {
    logger.error('Error in signUpFarmer:', error);
    if (error instanceof Error) {
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
    }
    throw error;
  }
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
  
  try {
    // Check if callTx exists and has the register_crop method
    if ('callTx' in farmerContract && farmerContract.callTx && typeof farmerContract.callTx === 'object') {
      const callTx = farmerContract.callTx as any;
      if (callTx.register_crop && typeof callTx.register_crop === 'function') {
        logger.info('Using callTx.register_crop method');
        const tx = await callTx.register_crop(farmerHash, cropName, plantingDate, expectedHarvestDate, cropType);
        if (tx && typeof tx.finalize === 'function') {
          const finalizedTx = await tx.finalize();
          logger.info(`Crop registration transaction finalized: ${finalizedTx.txHash}`);
          return finalizedTx;
        } else {
          logger.info('Transaction returned but no finalize method found');
          return tx;
        }
      }
    }
    
    logger.error('Contract does not have expected callTx.register_crop method');
    throw new Error('Contract does not have callTx.register_crop method. This contract may not be properly generated for Midnight framework interaction.');
    
  } catch (error) {
    logger.error('Error in registerCrop:', error);
    throw error;
  }
};

export const testFarmerRegistration = async (
  farmerContract: DeployedFarmerContract
): Promise<FinalizedTxData> => {
  logger.info('Running test farmer registration...');
  
  try {
    // Log the contract structure to understand what's available
    logger.info('Test - Contract structure:', Object.keys(farmerContract));
    logger.info('Test - Contract deployTxData:', Object.keys(farmerContract.deployTxData || {}));
    
    // Check if callTx exists and has the test_farmer_registration method
    if ('callTx' in farmerContract && farmerContract.callTx && typeof farmerContract.callTx === 'object') {
      const callTx = farmerContract.callTx as any;
      if (callTx.test_farmer_registration && typeof callTx.test_farmer_registration === 'function') {
        logger.info('Using callTx.test_farmer_registration method');
        logger.info('Calling test_farmer_registration with no parameters...');
        
        const tx = await callTx.test_farmer_registration();
        logger.info('Test transaction created:', typeof tx, Object.keys(tx || {}));
        
        if (tx && typeof tx.finalize === 'function') {
          logger.info('Finalizing test transaction...');
          const finalizedTx = await tx.finalize();
          logger.info(`Test farmer registration transaction finalized: ${finalizedTx.txHash}`);
          return finalizedTx;
        } else {
          logger.info('Test transaction returned but no finalize method found');
          return tx;
        }
      }
    }
    
    logger.error('Contract does not have expected callTx.test_farmer_registration method');
    throw new Error('Contract does not have callTx.test_farmer_registration method. This contract may not be properly generated for Midnight framework interaction.');
    
  } catch (error) {
    logger.error('Error in testFarmerRegistration:', error);
    if (error instanceof Error) {
      logger.error('Test error message:', error.message);
      logger.error('Test error stack:', error.stack);
    }
    throw error;
  }
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
    privateStateProvider: levelPrivateStateProvider<typeof FarmerPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider: new NodeZkConfigProvider<'sign_up' | 'register_crop' | 'test_farmer_registration'>(contractConfig.zkConfigPath),
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

// Add a simple test function to isolate the state issue
export const testSimpleContractInteraction = async (farmerContract: DeployedFarmerContract): Promise<void> => {
  logger.info('Testing simple contract interaction...');
  
  try {
    // Try to access basic contract properties
    logger.info('Contract type:', typeof farmerContract);
    logger.info('Contract keys:', Object.keys(farmerContract));
    
    // Check if we can access the contract instance directly
    if ('contract' in farmerContract) {
      const contract = (farmerContract as any).contract;
      logger.info('Direct contract available:', typeof contract);
      logger.info('Direct contract keys:', Object.keys(contract || {}));
      
      if (contract && contract.circuits) {
        logger.info('Direct circuits available:', Object.keys(contract.circuits));
      }
    }
    
    // Try to access callTx
    if ('callTx' in farmerContract) {
      const callTx = (farmerContract as any).callTx;
      logger.info('callTx available:', typeof callTx);
      logger.info('callTx keys:', Object.keys(callTx || {}));
    }
    
    logger.info('Simple contract interaction test completed');
  } catch (error) {
    logger.error('Error in simple contract interaction test:', error);
  }
};
