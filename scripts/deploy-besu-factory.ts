import { createPublicClient, createWalletClient, http, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderFactoryArtifact from '../artifacts/contracts/LogisticsOrderFactory.sol/LogisticsOrderFactory.json' assert { type: 'json' };

// Define Besu local chain
const besuLocal = defineChain({
  id: 10001,
  name: 'Besu Local',
  network: 'besu-local',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
});

// Besu validator private key (node 0)
const BESU_VALIDATOR_KEY = '0xd741ebce6318dc6e7a9b9358d7926feb85501a0ad68a395efa836f56fb83b67d';

async function main() {
  console.log('\n🚀 Starting Factory Pattern deployment to Besu...\n');

  // Setup Viem clients
  const publicClient = createPublicClient({
    chain: besuLocal,
    transport: http('http://127.0.0.1:8545'),
  });

  const ownerAccount = privateKeyToAccount(BESU_VALIDATOR_KEY as `0x${string}`);
  const owner = createWalletClient({
    account: ownerAccount,
    chain: besuLocal,
    transport: http('http://127.0.0.1:8545'),
  });

  console.log(`📋 Deployer address: ${ownerAccount.address}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`💰 Balance: ${balance} wei\n`);

  // ====================================
  // Phase 1: Deploy ManufacturerRegistry
  // ====================================
  console.log('📦 Phase 1: Deploying ManufacturerRegistry...');

  const registryHash = await owner.deployContract({
    abi: ManufacturerRegistryArtifact.abi,
    bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`,
    gasPrice: 0n, // Zero gas price
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
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`,
    gasPrice: 0n,
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
    args: [implementationAddress, registryAddress],
    gasPrice: 0n,
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
    network: 'besu-local',
    chainId: besuLocal.id,
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

  const deploymentPath = path.join(process.cwd(), 'deployments', 'deployment-besu-factory.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`✅ Deployment info saved to: deployments/deployment-besu-factory.json\n`);

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
  console.log('\n⚠️  Factory creates NEW proxies - each manufacturer gets their own!');
  console.log('💰 All transactions are FREE (0 gas price on Besu)\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  });
