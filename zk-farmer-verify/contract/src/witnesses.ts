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

// This is how we type an empty object.
export type FarmerPrivateState = {
  farmerHash: Uint8Array;
  farmerName: bigint;
  region: bigint;
  cropName: bigint;
};

export const witnesses = {
  create_test_farmer_hash: (): Uint8Array => {
    // Return a test farmer hash (32 bytes)
    return new Uint8Array(32).fill(1);
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
