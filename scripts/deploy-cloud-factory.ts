// @ts-nocheck
import { createPublicClient, createWalletClient, http, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderFactoryArtifact from '../artifacts/contracts/LogisticsOrderFactory.sol/LogisticsOrderFactory.json' assert { type: 'json' };

// Cloud Besu configuration - Chain ID 10002
const RPC_URL = process.env.BESU_RPC_URL || 'http://130.61.22.253:8545';

const besuCloud = defineChain({
  id: 10002,
  name: 'Besu Cloud',
  network: 'besu-cloud',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [RPC_URL],
    },
    public: {
      http: [RPC_URL],
    },
  },
});

// Load private key from environment variable
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required');
}

async function main() {
  console.log('\nStarting Factory Pattern deployment to Besu Cloud (Chain ID: 10002)...\n');

  // Setup Viem clients
  const publicClient = createPublicClient({
    chain: besuCloud,
    transport: http(RPC_URL),
  });

  const ownerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as `0x${string}`);
  const owner = createWalletClient({
    account: ownerAccount,
    chain: besuCloud,
    transport: http(RPC_URL),
  });

  console.log(`Deployer address: ${ownerAccount.address}`);
  console.log(`RPC URL: ${RPC_URL}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`Balance: ${balance} wei (zero gas network)\n`);

  // ====================================
  // Phase 1: Deploy ManufacturerRegistry
  // ====================================
  console.log('Phase 1: Deploying ManufacturerRegistry...');

  const registryHash = await owner.deployContract({
    abi: ManufacturerRegistryArtifact.abi,
    bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`,
    gas: 3000000n,
    gasPrice: 0n,
  });

  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress;

  if (!registryAddress) {
    throw new Error('ManufacturerRegistry deployment failed - no contract address');
  }

  console.log(`ManufacturerRegistry deployed at: ${registryAddress}\n`);

  // ====================================
  // Phase 2: Deploy LogisticsOrder Implementation
  // ====================================
  console.log('Phase 2: Deploying LogisticsOrder implementation (shared logic)...');

  const implHash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`,
    gas: 5000000n,
    gasPrice: 0n,
  });

  const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash });
  const implementationAddress = implReceipt.contractAddress;

  if (!implementationAddress) {
    throw new Error('LogisticsOrder implementation deployment failed');
  }

  console.log(`LogisticsOrder implementation deployed at: ${implementationAddress}\n`);

  // ====================================
  // Phase 3: Deploy LogisticsOrderFactory
  // ====================================
  console.log('Phase 3: Deploying LogisticsOrderFactory...');

  const factoryHash = await owner.deployContract({
    abi: LogisticsOrderFactoryArtifact.abi,
    bytecode: LogisticsOrderFactoryArtifact.bytecode as `0x${string}`,
    args: [implementationAddress, registryAddress],
    gas: 3000000n,
    gasPrice: 0n,
  });

  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
  const factoryAddress = factoryReceipt.contractAddress;

  if (!factoryAddress) {
    throw new Error('Factory deployment failed');
  }

  console.log(`LogisticsOrderFactory deployed at: ${factoryAddress}\n`);

  // ====================================
  // Phase 4: Verify Factory Setup
  // ====================================
  console.log('Phase 4: Verifying factory setup...');

  const factory = getContract({
    address: factoryAddress,
    abi: LogisticsOrderFactoryArtifact.abi,
    client: { public: publicClient, wallet: owner }
  });

  const factoryImpl = await factory.read.getImplementation();
  const factoryRegistry = await factory.read.getRegistry();

  console.log(`   Implementation: ${factoryImpl}`);
  console.log(`   Registry: ${factoryRegistry}`);
  console.log(`Factory setup verified\n`);

  // Verify correct references
  if (factoryImpl.toLowerCase() !== implementationAddress.toLowerCase()) {
    throw new Error('Implementation reference mismatch!');
  }
  if (factoryRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error('Registry reference mismatch!');
  }

  // ====================================
  // Phase 5: Save Deployment Info
  // ====================================
  console.log('Phase 5: Saving deployment info...');

  const deploymentInfo = {
    network: 'besu-cloud',
    chainId: besuCloud.id,
    rpcUrl: RPC_URL,
    deployer: ownerAccount.address,
    pattern: 'factory',
    contracts: {
      ManufacturerRegistry: registryAddress,
      LogisticsOrderImplementation: implementationAddress,
      LogisticsOrderFactory: factoryAddress
    },
    timestamp: new Date().toISOString(),
    notes: {
      usage: 'Manufacturers call createLogisticsOrder() on factory to get their own proxy',
      sharedImplementation: 'All manufacturer proxies use the same implementation contract',
      ownership: 'Each manufacturer owns and can upgrade their own proxy independently'
    }
  };

  const deploymentPath = path.join(process.cwd(), 'deployments', 'deployment-cloud-factory.json');
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: deployments/deployment-cloud-factory.json\n`);

  // ====================================
  // Summary
  // ====================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('FACTORY DEPLOYMENT TO BESU CLOUD SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nDeployed Contracts:');
  console.log(`   ManufacturerRegistry: ${registryAddress}`);
  console.log(`   LogisticsOrder (impl): ${implementationAddress}`);
  console.log(`   LogisticsOrderFactory: ${factoryAddress}`);
  console.log('\nUsage Instructions:');
  console.log('   1. Register manufacturers via ManufacturerRegistry');
  console.log('   2. Manufacturers call createLogisticsOrder() on factory');
  console.log('   3. Factory deploys individual proxy for each manufacturer');
  console.log('   4. Manufacturers interact with their own proxy address');
  console.log(`\nNetwork: Besu Cloud (Chain ID: ${besuCloud.id})`);
  console.log(`RPC: ${RPC_URL}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  });
