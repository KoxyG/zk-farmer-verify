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

import { type Resource } from '@midnight-ntwrk/wallet';
import { type Wallet } from '@midnight-ntwrk/wallet-api';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type FarmerProviders, type DeployedFarmerContract } from './common-types.js';
import { type Config, StandaloneConfig } from './config.js';
import * as api from './api.js';

let logger: Logger;

/**
 * This seed gives access to tokens minted in the genesis block of a local development node - only
 * used in standalone networks to build a wallet with initial funds.
 */
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const DEPLOY_OR_JOIN_QUESTION = `
You can do one of the following:
  1. Deploy a new farmer verification contract
  2. Join an existing farmer verification contract
  3. Exit
Which would you like to do? `;

const MAIN_LOOP_QUESTION = `
You can do one of the following:
  1. Register a new farmer
  2. Register a crop for a farmer
  3. Run test farmer registration
  4. Display farmer contract information
  5. Exit
Which would you like to do? `;

const join = async (providers: FarmerProviders, rli: Interface): Promise<DeployedFarmerContract> => {
  const contractAddress = await rli.question('What is the contract address (in hex)? ');
  return await api.joinContract(providers, contractAddress);
};

const deployOrJoin = async (providers: FarmerProviders, rli: Interface): Promise<DeployedFarmerContract | null> => {
  while (true) {
    const choice = await rli.question(DEPLOY_OR_JOIN_QUESTION);
    switch (choice) {
      case '1':
        return await api.deploy(providers);
      case '2':
        return await join(providers, rli);
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const registerFarmer = async (farmerContract: DeployedFarmerContract, rli: Interface): Promise<void> => {
  try {
    logger.info('Registering a new farmer...');
    
    // Get farmer details from user
    const fullName = await rli.question('Enter farmer full name: ');
    const region = await rli.question('Enter farmer region: ');
    const registrationDate = await rli.question('Enter registration date (YYYY-MM-DD): ');
    
    // Convert inputs to the expected format
    const farmerHash = new Uint8Array(32); // Placeholder hash - in real implementation this would be generated
    const fullNameField = BigInt(fullName.length); // Convert to Field type
    const regionField = BigInt(region.length); // Convert to Field type
    const registrationDateField = BigInt(new Date(registrationDate).getTime()); // Convert to Field type
    
    await api.signUpFarmer(farmerContract, farmerHash, fullNameField, regionField, registrationDateField);
    logger.info('Farmer registration completed successfully!');
  } catch (error) {
    logger.error(`Failed to register farmer: ${error}`);
  }
};

const registerCrop = async (farmerContract: DeployedFarmerContract, rli: Interface): Promise<void> => {
  try {
    logger.info('Registering a crop for a farmer...');
    
    // Get crop details from user
    const farmerHashInput = await rli.question('Enter farmer hash (32 bytes hex): ');
    const cropName = await rli.question('Enter crop name: ');
    const plantingDate = await rli.question('Enter planting date (YYYY-MM-DD): ');
    const expectedHarvestDate = await rli.question('Enter expected harvest date (YYYY-MM-DD): ');
    const cropType = await rli.question('Enter crop type (1=Grains, 2=Vegetables, 3=Fruits, 4=Legumes): ');
    
    // Convert inputs to the expected format
    const farmerHash = new Uint8Array(Buffer.from(farmerHashInput.replace('0x', ''), 'hex'));
    const cropNameField = BigInt(cropName.length); // Convert to Field type
    const plantingDateField = BigInt(new Date(plantingDate).getTime()); // Convert to Field type
    const expectedHarvestDateField = BigInt(new Date(expectedHarvestDate).getTime()); // Convert to Field type
    const cropTypeField = BigInt(parseInt(cropType)); // Convert to Field type
    
    await api.registerCrop(farmerContract, farmerHash, cropNameField, plantingDateField, expectedHarvestDateField, cropTypeField);
    logger.info('Crop registration completed successfully!');
  } catch (error) {
    logger.error(`Failed to register crop: ${error}`);
  }
};

const mainLoop = async (providers: FarmerProviders, rli: Interface): Promise<void> => {
  const farmerContract = await deployOrJoin(providers, rli);
  if (farmerContract === null) {
    return;
  }
  while (true) {
    const choice = await rli.question(MAIN_LOOP_QUESTION);
    switch (choice) {
      case '1':
        await registerFarmer(farmerContract, rli);
        break;
      case '2':
        await registerCrop(farmerContract, rli);
        break;
      case '3':
        try {
          await api.testFarmerRegistration(farmerContract);
          logger.info('Test farmer registration completed successfully!');
        } catch (error) {
          logger.error(`Failed to run test farmer registration: ${error}`);
        }
        break;
      case '4':
        await api.displayFarmerInfo(providers, farmerContract);
        break;
      case '5':
        logger.info('Exiting...');
        return;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const buildWalletFromSeed = async (config: Config, rli: Interface): Promise<Wallet & Resource> => {
  const seed = await rli.question('Enter your wallet seed: ');
  return await api.buildWalletAndWaitForFunds(config, seed, '');
};

const WALLET_LOOP_QUESTION = `
You can do one of the following:
  1. Build a fresh wallet
  2. Build wallet from a seed
  3. Exit
Which would you like to do? `;

const buildWallet = async (config: Config, rli: Interface): Promise<(Wallet & Resource) | null> => {
  if (config instanceof StandaloneConfig) {
    return await api.buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED, '');
  }
  while (true) {
    const choice = await rli.question(WALLET_LOOP_QUESTION);
    switch (choice) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2':
        return await buildWalletFromSeed(config, rli);
      case '3':
        logger.info('Exiting...');
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const mapContainerPort = (env: StartedDockerComposeEnvironment, url: string, containerName: string) => {
  const mappedUrl = new URL(url);
  const container = env.getContainer(containerName);

  mappedUrl.port = String(container.getFirstMappedPort());

  return mappedUrl.toString().replace(/\/+$/, '');
};

export const run = async (config: Config, _logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);
  const rli = createInterface({ input, output, terminal: true });
  let env;
  if (dockerEnv !== undefined) {
    env = await dockerEnv.up();

    if (config instanceof StandaloneConfig) {
      config.indexer = mapContainerPort(env, config.indexer, 'counter-indexer');
      config.indexerWS = mapContainerPort(env, config.indexerWS, 'counter-indexer');
      config.node = mapContainerPort(env, config.node, 'counter-node');
      config.proofServer = mapContainerPort(env, config.proofServer, 'counter-proof-server');
    }
  }
  const wallet = await buildWallet(config, rli);
  try {
    if (wallet !== null) {
      const providers = await api.configureProviders(wallet, config);
      await mainLoop(providers, rli);
    }
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`Found error '${e.message}'`);
      logger.info('Exiting...');
      logger.debug(`${e.stack}`);
    } else {
      throw e;
    }
  } finally {
    try {
      rli.close();
      rli.removeAllListeners();
    } catch (e) {
      logger.error(`Error closing readline interface: ${e}`);
    } finally {
      try {
        if (wallet !== null) {
          await wallet.close();
        }
      } catch (e) {
        logger.error(`Error closing wallet: ${e}`);
      } finally {
        try {
          if (env !== undefined) {
            await env.down();
            logger.info('Goodbye');
          }
        } catch (e) {
          logger.error(`Error shutting down docker environment: ${e}`);
        }
      }
    }
  }
};
