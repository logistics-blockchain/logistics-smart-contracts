import { createPublicClient, createWalletClient, http, getContract, parseEventLogs, type WalletClient, type PublicClient, encodeFunctionData } from 'viem';
import { hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from 'viem';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderProxyArtifact from '../artifacts/contracts/LogisticsOrderProxy.sol/LogisticsOrderProxy.json' assert { type: 'json' };

// Hardhat's default test account private keys
export const HARDHAT_PRIVATE_KEYS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account #0
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Account #1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Account #2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Account #3
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // Account #4
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // Account #5
];

// Common test data
export const TEST_DATA = {
  manufacturers: {
    acme: { name: 'Acme Electronics', index: 1 },
    beta: { name: 'Beta Manufacturing', index: 2 },
    gamma: { name: 'Gamma Industries', index: 3 },
  },
  ipfsHashes: {
    order1: 'QmX1234567890abcdefghijklmnopqrstuvwxyz',
    order2: 'QmY0987654321zyxwvutsrqponmlkjihgfedcba',
    order3: 'QmZ1111111111111111111111111111111111111',
  },
};

/**
 * Test account types with semantic names
 */
export interface TestAccounts {
  owner: WalletClient;
  manufacturer1: WalletClient;
  manufacturer2: WalletClient;
  manufacturer3: WalletClient;
  receiver1: WalletClient;
  receiver2: WalletClient;
}

/**
 * Deployed contract addresses
 */
export interface DeployedContracts {
  registryAddress: Address;
  implementationAddress: Address;
  proxyAddress: Address;
}

/**
 * Setup function to initialize Viem clients and test accounts
 */
export async function setupTestEnvironment() {
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });

  const accounts: TestAccounts = {
    owner: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[0] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
    manufacturer1: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[1] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
    manufacturer2: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[2] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
    manufacturer3: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[3] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
    receiver1: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[4] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
    receiver2: createWalletClient({
      account: privateKeyToAccount(HARDHAT_PRIVATE_KEYS[5] as `0x${string}`),
      chain: hardhat,
      transport: http(),
    }),
  };

  return { publicClient, accounts };
}

/**
 * Deploy ManufacturerRegistry contract
 */
export async function deployManufacturerRegistry(
  owner: WalletClient,
  publicClient: PublicClient
): Promise<Address> {
  const hash = await owner.deployContract({
    abi: ManufacturerRegistryArtifact.abi,
    bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('ManufacturerRegistry deployment failed');
  }

  return receipt.contractAddress;
}

/**
 * Deploy LogisticsOrder implementation
 */
export async function deployLogisticsOrderImplementation(
  owner: WalletClient,
  publicClient: PublicClient
): Promise<Address> {
  const hash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('LogisticsOrder implementation deployment failed');
  }

  return receipt.contractAddress;
}

/**
 * Deploy LogisticsOrderProxy with initialization
 */
export async function deployLogisticsOrderProxy(
  owner: WalletClient,
  publicClient: PublicClient,
  implementationAddress: Address,
  registryAddress: Address
): Promise<Address> {
  // Encode initialize call
  const initializeData = encodeFunctionData({
    abi: LogisticsOrderArtifact.abi,
    functionName: 'initialize',
    args: [registryAddress, owner.account.address],
  });

  // Deploy proxy with initialization
  const hash = await owner.deployContract({
    abi: LogisticsOrderProxyArtifact.abi,
    bytecode: LogisticsOrderProxyArtifact.bytecode as `0x${string}`,
    args: [implementationAddress, initializeData],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error('Proxy deployment failed');
  }

  return receipt.contractAddress;
}

/**
 * Deploy full system (registry + implementation + proxy)
 */
export async function deployFullSystem(
  owner: WalletClient,
  publicClient: PublicClient
): Promise<DeployedContracts> {
  // Deploy registry
  const registryAddress = await deployManufacturerRegistry(owner, publicClient);

  // Deploy implementation
  const implementationAddress = await deployLogisticsOrderImplementation(owner, publicClient);

  // Deploy proxy
  const proxyAddress = await deployLogisticsOrderProxy(
    owner,
    publicClient,
    implementationAddress,
    registryAddress
  );

  return {
    registryAddress,
    implementationAddress,
    proxyAddress,
  };
}

/**
 * Get ManufacturerRegistry contract instance
 */
export function getManufacturerRegistryContract(
  address: Address,
  publicClient: PublicClient,
  walletClient: WalletClient
) {
  return getContract({
    address,
    abi: ManufacturerRegistryArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
}

/**
 * Get LogisticsOrder contract instance (via proxy)
 */
export function getLogisticsOrderContract(
  proxyAddress: Address,
  publicClient: PublicClient,
  walletClient: WalletClient
) {
  return getContract({
    address: proxyAddress,
    abi: LogisticsOrderArtifact.abi,
    client: { public: publicClient, wallet: walletClient },
  });
}

/**
 * Parse events from transaction receipt
 */
export function parseEvents(receipt: any, abi: any) {
  return parseEventLogs({
    abi,
    logs: receipt.logs,
  });
}

/**
 * Get order state enum value
 */
export enum OrderState {
  Created = 0,
  PickedUp = 1,
  InTransit = 2,
  AtFacility = 3,
  Delivered = 4,
}

/**
 * Wait for transaction and return receipt
 */
export async function waitForTransaction(publicClient: PublicClient, hash: `0x${string}`) {
  return await publicClient.waitForTransactionReceipt({ hash });
}
