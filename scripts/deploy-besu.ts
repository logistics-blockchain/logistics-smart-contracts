import { createPublicClient, createWalletClient, http, encodeFunctionData, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';

// Import contract artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderV2Artifact from '../artifacts/contracts/LogisticsOrderV2.sol/LogisticsOrderV2.json' assert { type: 'json' };
import LogisticsOrderProxyArtifact from '../artifacts/contracts/LogisticsOrderProxy.sol/LogisticsOrderProxy.json' assert { type: 'json' };

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
  console.log('\nStarting Besu deployment...\n');

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

  console.log(`Deployer address: ${ownerAccount.address}`);

  // Check balance
  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`Balance: ${balance} wei\n`);

  // Phase 1: Deploy ManufacturerRegistry
  console.log('Phase 1: Deploying ManufacturerRegistry...');

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

  console.log(`ManufacturerRegistry deployed: ${registryAddress}\n`);

  // Phase 2: Deploy LogisticsOrder V1 Implementation
  console.log('Phase 2: Deploying LogisticsOrder V1 implementation...');

  const implV1Hash = await owner.deployContract({
    abi: LogisticsOrderArtifact.abi,
    bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`,
    gasPrice: 0n,
  });

  const implV1Receipt = await publicClient.waitForTransactionReceipt({ hash: implV1Hash });
  const implementationV1Address = implV1Receipt.contractAddress;

  if (!implementationV1Address) {
    throw new Error('LogisticsOrder V1 implementation deployment failed');
  }

  console.log(`LogisticsOrder V1 deployed: ${implementationV1Address}\n`);

  // Phase 2.1: Deploy LogisticsOrder V2 Implementation
  console.log('Phase 2.1: Deploying LogisticsOrder V2 implementation...');

  const implV2Hash = await owner.deployContract({
    abi: LogisticsOrderV2Artifact.abi,
    bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
    gasPrice: 0n,
  });

  const implV2Receipt = await publicClient.waitForTransactionReceipt({ hash: implV2Hash });
  const implementationV2Address = implV2Receipt.contractAddress;

  if (!implementationV2Address) {
    throw new Error('LogisticsOrder V2 implementation deployment failed');
  }

  console.log(`LogisticsOrder V2 deployed: ${implementationV2Address}\n`);

  // Phase 3: Encode Initialize Call Data
  console.log('Phase 3: Encoding initialize call data...');

  const initializeData = encodeFunctionData({
    abi: LogisticsOrderArtifact.abi,
    functionName: 'initialize',
    args: [registryAddress, ownerAccount.address]
  });

  console.log('Initialize data encoded\n');

  // Phase 4: Deploy Proxy with Initialization
  console.log('Phase 4: Deploying ERC1967Proxy...');

  const proxyHash = await owner.deployContract({
    abi: LogisticsOrderProxyArtifact.abi,
    bytecode: LogisticsOrderProxyArtifact.bytecode as `0x${string}`,
    args: [implementationV1Address, initializeData],
    gasPrice: 0n,
  });

  const proxyReceipt = await publicClient.waitForTransactionReceipt({ hash: proxyHash });
  const proxyAddress = proxyReceipt.contractAddress;

  if (!proxyAddress) {
    throw new Error('Proxy deployment failed');
  }

  console.log(`LogisticsOrderProxy deployed: ${proxyAddress}\n`);

  // Phase 5: Verify Initialization
  console.log('Phase 5: Verifying initialization...');

  const ordersContract = getContract({
    address: proxyAddress,
    abi: LogisticsOrderArtifact.abi,
    client: { public: publicClient, wallet: owner }
  });

  const version = await ordersContract.read.version();
  const registryRef = await ordersContract.read.manufacturerRegistry();
  const contractOwner = await ordersContract.read.owner();

  console.log(`  Version: ${version}`);
  console.log(`  Registry reference: ${registryRef}`);
  console.log(`  Contract owner: ${contractOwner}`);
  console.log('Initialization verified\n');

  // Verify correct references
  if (registryRef.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error('Registry reference mismatch!');
  }
  if (contractOwner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
    throw new Error('Owner mismatch!');
  }

  // Phase 6: Save Deployment Info
  console.log('Phase 6: Saving deployment info...');

  const deploymentInfo = {
    network: 'besu-local',
    chainId: besuLocal.id,
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

  const deploymentPath = path.join(process.cwd(), 'deployments', 'deployment-besu.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: deployments/deployment-besu.json\n`);

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('DEPLOYMENT SUCCESSFUL');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nDeployed Contracts:');
  console.log(`  ManufacturerRegistry: ${registryAddress}`);
  console.log(`  LogisticsOrder (impl V1): ${implementationV1Address}`);
  console.log(`  LogisticsOrder (impl V2): ${implementationV2Address}`);
  console.log(`  LogisticsOrderProxy:      ${proxyAddress}`);
  console.log('\nIMPORTANT: Always interact with the PROXY address!');
  console.log(`  Use this address: ${proxyAddress}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  });
