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

// Farmer contract private state type
export type FarmerPrivateState = {
  registered_farmers: Map<string, any>;
  farmer_details: Map<string, any>;
  farmer_crops: Map<string, any>;
  crop_details: Map<string, any>;
};

// Witness functions for the farmer contract
export const witnesses = {
  create_test_farmer_hash: (): Uint8Array => {
    // Return a test farmer hash (32 bytes) - use a simple but valid hash
    // Create a 32-byte array with a simple pattern
    const hash = new Uint8Array([
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
      0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
      0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F, 0x20
    ]);
    console.log('create_test_farmer_hash called, returning:', hash);
    console.log('Hash length:', hash.length);
    console.log('Hash type:', typeof hash);
    return hash;
  },
  create_test_farmer_name: (): bigint => {
    // Return a test farmer name as Field (bigint)
    return 123456789n;
  },
  create_test_region: (): bigint => {
    // Return a test region as Field (bigint)
    return 987654321n;
  },
  create_test_crop_name: (): bigint => {
    // Return a test crop name as Field (bigint)
    return 555666777n;
  }
};
