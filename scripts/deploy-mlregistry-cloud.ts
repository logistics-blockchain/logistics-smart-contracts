// @ts-nocheck
import { createPublicClient, createWalletClient, http, getContract, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import MLModelRegistryArtifact from '../artifacts/contracts/MLModelRegistry.sol/MLModelRegistry.json' assert { type: 'json' };

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

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  throw new Error('DEPLOYER_PRIVATE_KEY environment variable is required');
}

async function main() {
  console.log('\nStarting MLModelRegistry deployment to Besu Cloud (Chain ID: 10002)...\n');

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

  const balance = await publicClient.getBalance({ address: ownerAccount.address });
  console.log(`Balance: ${balance} wei (zero gas network)\n`);

  console.log('Deploying MLModelRegistry...');

  const deployHash = await owner.deployContract({
    abi: MLModelRegistryArtifact.abi,
    bytecode: MLModelRegistryArtifact.bytecode as `0x${string}`,
    gas: 6000000n,
    gasPrice: 0n,
  });

  console.log(`Transaction hash: ${deployHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const contractAddress = receipt.contractAddress;

  if (!contractAddress) {
    throw new Error('MLModelRegistry deployment failed - no contract address');
  }

  if (receipt.status !== 'success') {
    throw new Error(`MLModelRegistry deployment failed - receipt status: ${receipt.status}`);
  }

  console.log(`MLModelRegistry deployed at: ${contractAddress}`);
  console.log(`Receipt status: ${receipt.status}\n`);

  console.log('Verifying deployment with eth_getCode...');
  const bytecode = await publicClient.getCode({ address: contractAddress });

  if (!bytecode || bytecode === '0x') {
    throw new Error('MLModelRegistry deployment verification failed - no bytecode at address');
  }

  console.log(`Bytecode exists at ${contractAddress} (length: ${bytecode.length})\n`);

  console.log('Verifying contract functions...');

  const registry = getContract({
    address: contractAddress,
    abi: MLModelRegistryArtifact.abi,
    client: { public: publicClient, wallet: owner }
  });

  const totalModels = await registry.read.getTotalModels();
  const totalRuns = await registry.read.getTotalRuns();

  console.log(`   Total models: ${totalModels}`);
  console.log(`   Total runs: ${totalRuns}`);
  console.log('Contract verification complete\n');

  console.log('Saving deployment info...');

  const deploymentInfo = {
    network: 'besu-cloud',
    chainId: besuCloud.id,
    rpcUrl: RPC_URL,
    deployer: ownerAccount.address,
    contracts: {
      MLModelRegistry: contractAddress
    },
    transactionHash: deployHash,
    blockNumber: receipt.blockNumber.toString(),
    timestamp: new Date().toISOString(),
    notes: {
      description: 'ML Model Registry with ERC721 NFT for model ownership and lineage tracking',
      features: [
        'Register base models (mints NFT)',
        'Register training runs (creates child model NFT)',
        'Track model lineage (parent-child relationships)',
        'Store training metrics and dataset references',
        'Query models and runs by batch'
      ],
      keyFunctions: [
        'registerBaseModel(name, hash, metadata) - anyone can create',
        'registerTrainingRun(inputId, ...) - only model owner',
        'getModel(id) - view model details',
        'getModelLineage(id) - get ancestry chain',
        'getTrainingRunsByInput(id) - get all runs using model as input'
      ]
    }
  };

  const deploymentPath = path.join(process.cwd(), 'deployments', 'deployment-mlregistry-cloud.json');
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

  console.log(`Deployment info saved to: deployments/deployment-mlregistry-cloud.json\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('ML MODEL REGISTRY DEPLOYMENT SUCCESSFUL!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nDeployed Contract:');
  console.log(`   MLModelRegistry: ${contractAddress}`);
  console.log('\nContract Features:');
  console.log('   - ERC721 NFT ownership for ML models');
  console.log('   - Parent-child model lineage tracking');
  console.log('   - Training run metadata and metrics');
  console.log('   - Dataset and hyperparameter references');
  console.log('   - Batch query support');
  console.log('\nUsage:');
  console.log('   1. Register base model: registerBaseModel(name, hash, metadata)');
  console.log('   2. Train new model: registerTrainingRun(inputId, outputName, ...)');
  console.log('   3. Query lineage: getModelLineage(modelId)');
  console.log('   4. Query runs: getTrainingRunsByInput(modelId)');
  console.log(`\nNetwork: Besu Cloud (Chain ID: ${besuCloud.id})`);
  console.log(`RPC: ${RPC_URL}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  });
