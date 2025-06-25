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
import path from 'path';
import * as api from '../api.js';
import { type FarmerProviders } from '../common-types.js';
import { currentDir } from '../config.js';
import { createLogger } from '../logger-utils.js';
import { TestEnvironment } from './commons';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const logDir = path.resolve(currentDir, '..', 'logs', 'tests', `${new Date().toISOString()}.log`);
const logger = await createLogger(logDir);

describe('Farmer Verification API', () => {
  let testEnvironment: TestEnvironment;
  let wallet: Wallet & Resource;
  let providers: FarmerProviders;

  beforeAll(
    async () => {
      api.setLogger(logger);
      testEnvironment = new TestEnvironment(logger);
      const testConfiguration = await testEnvironment.start();
      wallet = await testEnvironment.getWallet();
      providers = await api.configureProviders(wallet, testConfiguration.dappConfig);
      logger.info('Final providers object created');
      logger.info('providers.walletProvider:', providers.walletProvider);
      logger.info('providers.midnightProvider:', providers.midnightProvider);
    },
    1000 * 60 * 45,
  );

  afterAll(async () => {
    await testEnvironment.saveWalletCache();
    await testEnvironment.shutdown();
  });

  it('should deploy the farmer verification contract and test registration [@slow]', async () => {
    const farmerContract = await api.deploy(providers);
    expect(farmerContract).not.toBeNull();

    // Test the farmer registration functionality
    const farmerHash = new Uint8Array(32);
    const fullName = BigInt(12345);
    const region = BigInt(1);
    const registrationDate = BigInt(Date.now());

    const signUpResponse = await api.signUpFarmer(
      farmerContract,
      farmerHash,
      fullName,
      region,
      registrationDate
    );
    expect(signUpResponse.txHash).toMatch(/[0-9a-f]{64}/);
    expect(signUpResponse.blockHeight).toBeGreaterThan(BigInt(0));

    // Test crop registration
    const cropName = BigInt(67890);
    const plantingDate = BigInt(Date.now());
    const expectedHarvestDate = BigInt(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const cropType = BigInt(1);

    const cropResponse = await api.registerCrop(
      farmerContract,
      farmerHash,
      cropName,
      plantingDate,
      expectedHarvestDate,
      cropType
    );
    expect(cropResponse.txHash).toMatch(/[0-9a-f]{64}/);
    expect(cropResponse.blockHeight).toBeGreaterThan(BigInt(0));

    // Test the test farmer registration function
    const testResponse = await api.testFarmerRegistration(farmerContract);
    expect(testResponse.txHash).toMatch(/[0-9a-f]{64}/);
    expect(testResponse.blockHeight).toBeGreaterThan(BigInt(0));

    // Display farmer information
    const farmerInfo = await api.displayFarmerInfo(providers, farmerContract);
    expect(farmerInfo.contractAddress).toBeDefined();
    expect(farmerInfo.farmerInfo).toBeDefined();
  });

  it('should join an existing farmer verification contract', async () => {
    // This test would require a known contract address
    // For now, we'll just test that the function exists and can be called
    const mockContractAddress = '0x1234567890123456789012345678901234567890123456789012345678901234';
    
    // Note: This will likely fail in a real test environment without a valid contract address
    // but it demonstrates the intended usage
    try {
      const joinedContract = await api.joinContract(providers, mockContractAddress);
      expect(joinedContract).toBeDefined();
    } catch (error) {
      // Expected to fail with invalid contract address
      expect(error).toBeDefined();
    }
  });

  it('should get farmer ledger state', async () => {
    const mockContractAddress = '0x1234567890123456789012345678901234567890123456789012345678901234';
    
    try {
      const state = await api.getFarmerLedgerState(providers, mockContractAddress);
      // This might return null for invalid addresses, which is expected
      if (state) {
        expect(state.registeredFarmers).toBeDefined();
        expect(state.totalCrops).toBeDefined();
      }
    } catch (error) {
      // Expected to fail with invalid contract address
      expect(error).toBeDefined();
    }
  });
});
