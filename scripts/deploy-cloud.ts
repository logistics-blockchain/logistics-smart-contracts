// @ts-nocheck
import { createPublicClient, createWalletClient, http, encodeFunctionData, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderProxyArtifact from '../artifacts/contracts/LogisticsOrderProxy.sol/LogisticsOrderProxy.json' assert { type: 'json' };

// Load RPC URL from environment variable or use default
const CLOUD_RPC_URL = process.env.BESU_CLOUD_RPC || 'http://127.0.0.1:8545';

// Define cloud Besu chain
const cloudBesu = defineChain({
  id: 10001,
  name: 'Besu Cloud',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [CLOUD_RPC_URL],
    },
    public: {
      http: [CLOUD_RPC_URL],
    },
  },
});

// Load private key from environment variable
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required');
}

async function main() {
  console.log('\nStarting cloud deployment...\n');

  // Setup Viem clients for cloud network
  const publicClient = createPublicClient({
    chain: cloudBesu,
    transport: http(CLOUD_RPC_URL),
  });

  const ownerAccount = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as `0x${string}`);
  const owner = createWalletClient({
    account: ownerAccount,
    chain: cloudBesu,
    transport: http(CLOUD_RPC_URL),
  });

  console.log(`Deployer address: ${ownerAccount.address}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`Deployer balance: ${balance.toString()} wei\n`);

  // Verify network connection
  const blockNumber = await publicClient.getBlockNumber();
  console.log(`Connected to cloud network. Current block: ${blockNumber}\n`);

  // ====================================
  // Phase 1: Deploy ManufacturerRegistry
  // ====================================
  console.log('Phase 1: Deploying ManufacturerRegistry...');

  const registryHash = await owner.deployContract({
    abi: ManufacturerRegistryArtifact.abi,
    bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`
  });

  console.log(`   Transaction hash: ${registryHash}`);

  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
  const registryAddress = registryReceipt.contractAddress;

  if (!registryAddress) {
    throw new Error('ManufacturerRegistry deployment failed - no contract address');
  }

  console.log(`ManufacturerRegistry deployed at: ${registryAddress}\n`);

  // ====================================
  // Phase 2: Deploy LogisticsOrder V1 Implementation
  // ====================================
  console.log('Phase 2: Deploying LogisticsOrder V1 implementation...');

  const implV1Hash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`
  });

  console.log(`   Transaction hash: ${implV1Hash}`);

  const implV1Receipt = await publicClient.waitForTransactionReceipt({ hash: implV1Hash });
  const implementationV1Address = implV1Receipt.contractAddress;

  if (!implementationV1Address) {
    throw new Error('LogisticsOrder V1 implementation deployment failed');
  }

  console.log(`LogisticsOrder V1 implementation deployed at: ${implementationV1Address}\n`);

  // ====================================
  // Phase 3: Encode Initialize Call Data
  // ====================================
  console.log('Phase 3: Encoding initialize call data...');

  const initializeData = encodeFunctionData({
    abi: LogisticsOrderArtifact.abi,
    functionName: 'initialize',
    args: [registryAddress, ownerAccount.address]
  });

  console.log(`Initialize data encoded\n`);

  // ====================================
  // Phase 4: Deploy Proxy with Initialization
  // ====================================
  console.log('Phase 4: Deploying ERC1967Proxy...');

  const proxyHash = await owner.deployContract({
    abi: LogisticsOrderProxyArtifact.abi,
    bytecode: LogisticsOrderProxyArtifact.bytecode as `0x${string}`,
    args: [implementationV1Address, initializeData]
  });

  console.log(`   Transaction hash: ${proxyHash}`);

  const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash });
  const proxyAddress = proxyReceipt.contractAddress;

  if (!proxyAddress) {
    throw new Error('Proxy deployment failed');
  }

  console.log(`LogisticsOrderProxy deployed at: ${proxyAddress}\n`);

  // ====================================
  // Phase 5: Verify Initialization
  // ====================================
  console.log('Phase 5: Verifying initialization...');

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
  console.log(`Initialization verified\n`);

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
  console.log('Phase 6: Saving deployment info...');

  const deploymentInfo = {
    network: 'besu-cloud',
    chainId: cloudBesu.id,
    rpcUrl: CLOUD_RPC_URL,
    deployer: ownerAccount.address,
    contracts: {
      ManufacturerRegistry: registryAddress,
      LogisticsOrderImplementationV1: implementationV1Address,
      LogisticsOrderProxy: proxyAddress
    },
    version: version,
    timestamp: new Date().toISOString()
  };

  const deploymentPath = path.join(process.cwd(), 'deployments', 'deployment-cloud.json');
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: deployments/deployment-cloud.json\n`);

  // ====================================
  // Summary
  // ====================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('CLOUD DEPLOYMENT SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nDeployed Contracts:');
  console.log(`   ManufacturerRegistry:     ${registryAddress}`);
  console.log(`   LogisticsOrder (impl V1): ${implementationV1Address}`);
  console.log(`   LogisticsOrderProxy:      ${proxyAddress}`);
  console.log('\nIMPORTANT: Always interact with the PROXY address!');
  console.log(`   Use this address: ${proxyAddress}`);
  console.log(`\nNetwork: Besu Cloud (Chain ID: ${cloudBesu.id})`);
  console.log(`RPC: ${CLOUD_RPC_URL}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nCloud deployment failed:', error);
    process.exit(1);
  });
