import hre from 'hardhat';
import { createPublicClient, createWalletClient, http, encodeFunctionData, getContract } from 'viem';
import { hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderV2Artifact from '../artifacts/contracts/LogisticsOrderV2.sol/LogisticsOrderV2.json' assert { type: 'json' };
import LogisticsOrderProxyArtifact from '../artifacts/contracts/LogisticsOrderProxy.sol/LogisticsOrderProxy.json' assert { type: 'json' };

// Hardhat's default test account private keys
const HARDHAT_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Account #0
];

async function main() {
  console.log('\n🚀 Starting deployment...\n');

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
  // Phase 2: Deploy LogisticsOrder V1 Implementation
  // ====================================
  console.log('📦 Phase 2: Deploying LogisticsOrder V1 implementation...');

  const implV1Hash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`
  });

  const implV1Receipt = await publicClient.waitForTransactionReceipt({ hash: implV1Hash });
  const implementationV1Address = implV1Receipt.contractAddress;

  if (!implementationV1Address) {
    throw new Error('LogisticsOrder V1 implementation deployment failed');
  }

  console.log(`✅ LogisticsOrder V1 implementation deployed at: ${implementationV1Address}\n`);

  // ====================================
  // Phase 2.1: Deploy LogisticsOrder V2 Implementation
  // ====================================
  console.log('📦 Phase 2.1: Deploying LogisticsOrder V2 implementation...');

  const implV2Hash = await owner.deployContract({
    abi: LogisticsOrderV2Artifact.abi,
    bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`
  });

  const implV2Receipt = await publicClient.waitForTransactionReceipt({ hash: implV2Hash });
  const implementationV2Address = implV2Receipt.contractAddress;

  if (!implementationV2Address) {
    throw new Error('LogisticsOrder V2 implementation deployment failed');
  }

  console.log(`✅ LogisticsOrder V2 implementation deployed at: ${implementationV2Address}\n`);

  // ====================================
  // Phase 3: Encode Initialize Call Data
  // ====================================
  console.log('🔧 Phase 3: Encoding initialize call data...');

  const initializeData = encodeFunctionData({
    abi: LogisticsOrderArtifact.abi, // Initialize with V1 ABI
    functionName: 'initialize',
    args: [registryAddress, ownerAccount.address]
  });

  console.log(`✅ Initialize data encoded\n`);

  // ====================================
  // Phase 4: Deploy Proxy with Initialization
  // ====================================
  console.log('📦 Phase 4: Deploying ERC1967Proxy...');

  const proxyHash = await owner.deployContract({
    abi: LogisticsOrderProxyArtifact.abi,
    bytecode: LogisticsOrderProxyArtifact.bytecode as `0x${string}`,
    args: [implementationV1Address, initializeData] // Point proxy to V1 initially
  });

  const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash });
  const proxyAddress = proxyReceipt.contractAddress;

  if (!proxyAddress) {
    throw new Error('Proxy deployment failed');
  }

  console.log(`✅ LogisticsOrderProxy deployed at: ${proxyAddress}\n`);

  // ====================================
  // Phase 5: Verify Initialization
  // ====================================
  console.log('🔍 Phase 5: Verifying initialization...');

  const ordersContract = getContract({
    address: proxyAddress,
    abi: LogisticsOrderArtifact.abi,
    client: { public: publicClient, wallet: owner }
  });

  const version = await ordersContract.read.version();
  const registryRef = await ordersContract.read.manufacturerRegistry();
  const contractOwner = await ordersContract.read.owner();

  console.log(`   Version: ${version}`);
  console.log(`   Registry reference: ${registryRef}`);
  console.log(`   Contract owner: ${contractOwner}`);
  console.log(`✅ Initialization verified\n`);

  // Verify correct references
  if (registryRef.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error('Registry reference mismatch!');
  }
  if (contractOwner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
    throw new Error('Owner mismatch!');
  }

  // ====================================
  // Phase 6: Save Deployment Info
  // ====================================
  console.log('💾 Phase 6: Saving deployment info...');

  const deploymentInfo = {
    network: 'hardhat',
    chainId: hardhat.id,
    deployer: ownerAccount.address,
    contracts: {
      ManufacturerRegistry: registryAddress,
      LogisticsOrderImplementationV1: implementationV1Address,
      LogisticsOrderImplementationV2: implementationV2Address,
      LogisticsOrderProxy: proxyAddress
    },
    version: version,
    timestamp: new Date().toISOString()
  };

  const deploymentPath = path.join(process.cwd(), 'deployment-info.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`✅ Deployment info saved to: deployment-info.json\n`);

  // ====================================
  // Summary
  // ====================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 DEPLOYMENT SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 Deployed Contracts:');
  console.log(`   ManufacturerRegistry: ${registryAddress}`);
  console.log(`   LogisticsOrder (impl V1): ${implementationV1Address}`);
  console.log(`   LogisticsOrder (impl V2): ${implementationV2Address}`);
  console.log(`   LogisticsOrderProxy:      ${proxyAddress}`);
  console.log('\n⚠️  IMPORTANT: Always interact with the PROXY address!');
  console.log(`   Use this address: ${proxyAddress}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  });
