import hre from 'hardhat';
import { createPublicClient, createWalletClient, http, getContract } from 'viem';
import { hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderFactoryArtifact from '../artifacts/contracts/LogisticsOrderFactory.sol/LogisticsOrderFactory.json' assert { type: 'json' };

// Hardhat's default test account private keys
const HARDHAT_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account #0
];

async function main() {
  console.log('\n🚀 Starting Factory Pattern deployment...\n');

  // Setup Viem clients
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  });

  const ownerAccount = privateKeyToAccount(HARDHAT_ACCOUNTS[0] as `0x${string}`);
  const owner = createWalletClient({
    account: ownerAccount,
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  });

  console.log(`📋 Deployer address: ${ownerAccount.address}\n`);

  // ====================================
  // Phase 1: Deploy ManufacturerRegistry
  // ====================================
  console.log('📦 Phase 1: Deploying ManufacturerRegistry...');

  const registryHash = await owner.deployContract({
    abi: ManufacturerRegistryArtifact.abi,
    bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`
  });

  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress;

  if (!registryAddress) {
    throw new Error('ManufacturerRegistry deployment failed - no contract address');
  }

  console.log(`✅ ManufacturerRegistry deployed at: ${registryAddress}\n`);

  // ====================================
  // Phase 2: Deploy LogisticsOrder Implementation
  // ====================================
  console.log('📦 Phase 2: Deploying LogisticsOrder implementation (shared logic)...');

  const implHash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`
  });

  const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash });
  const implementationAddress = implReceipt.contractAddress;

  if (!implementationAddress) {
    throw new Error('LogisticsOrder implementation deployment failed');
  }

  console.log(`✅ LogisticsOrder implementation deployed at: ${implementationAddress}\n`);

  // ====================================
  // Phase 3: Deploy LogisticsOrderFactory
  // ====================================
  console.log('📦 Phase 3: Deploying LogisticsOrderFactory...');

  const factoryHash = await owner.deployContract({
    abi: LogisticsOrderFactoryArtifact.abi,
    bytecode: LogisticsOrderFactoryArtifact.bytecode as `0x${string}`,
    args: [implementationAddress, registryAddress]
  });

  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
  const factoryAddress = factoryReceipt.contractAddress;

  if (!factoryAddress) {
    throw new Error('Factory deployment failed');
  }

  console.log(`✅ LogisticsOrderFactory deployed at: ${factoryAddress}\n`);

  // ====================================
  // Phase 4: Verify Factory Setup
  // ====================================
  console.log('🔍 Phase 4: Verifying factory setup...');

  const factory = getContract({
    address: factoryAddress,
    abi: LogisticsOrderFactoryArtifact.abi,
    client: { public: publicClient, wallet: owner }
  });

  const factoryImpl = await factory.read.getImplementation();
  const factoryRegistry = await factory.read.getRegistry();

  console.log(`   Implementation: ${factoryImpl}`);
  console.log(`   Registry: ${factoryRegistry}`);
  console.log(`✅ Factory setup verified\n`);

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
  console.log('💾 Phase 5: Saving deployment info...');

  const deploymentInfo = {
    network: 'hardhat',
    chainId: hardhat.id,
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

  const deploymentPath = path.join(process.cwd(), 'deployment-factory.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`✅ Deployment info saved to: deployment-factory.json\n`);

  // ====================================
  // Summary
  // ====================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 FACTORY DEPLOYMENT SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 Deployed Contracts:');
  console.log(`   ManufacturerRegistry: ${registryAddress}`);
  console.log(`   LogisticsOrder (impl): ${implementationAddress}`);
  console.log(`   LogisticsOrderFactory: ${factoryAddress}`);
  console.log('\n📝 Usage Instructions:');
  console.log('   1. Register manufacturers via ManufacturerRegistry');
  console.log('   2. Manufacturers call createLogisticsOrder() on factory');
  console.log('   3. Factory deploys individual proxy for each manufacturer');
  console.log('   4. Manufacturers interact with their own proxy address');
  console.log('\n⚠️  Factory creates NEW proxies - each manufacturer gets their own!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  });
