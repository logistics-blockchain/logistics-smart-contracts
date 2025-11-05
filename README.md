# Logistics Smart Contracts

Smart contract development environment for deploying contracts to private EVM networks.

## Overview

This repository provides:

- **Development Environment** - Hardhat with TypeScript and Viem
- **Example Contracts** - Upgradeable logistics NFT system (UUPS proxy pattern)
- **Deployment Scripts** - Deploy to local Hardhat or Besu networks
- **Testing Framework** - Comprehensive test suite with Mocha and Chai

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Running Besu QBFT network

### Installation

```bash
npm install
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npm test
```

## Deploying to Besu Network

### 1. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your deployment settings:

```bash
# Required for Besu deployments
DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere

# Optional: Cloud Besu RPC endpoint
BESU_CLOUD_RPC=http://your-cloud-ip:8545
```

Network configurations are already defined in `hardhat.config.ts`:
- `hardhat` - Local Hardhat network (chainId 31337)
- `besuLocal` - Local Besu network at localhost:8545 (chainId 10001)
- `besuCloud` - Cloud Besu network using BESU_CLOUD_RPC (chainId 10001)

### 2. Choose Deployment Script

The repository includes several deployment scripts for different use cases:

#### deploy.ts - Hardhat Network Testing
```bash
npx tsx scripts/deploy.ts
```
- Deploys to local Hardhat network
- Uses default Hardhat test accounts
- Includes V1 and V2 implementations for testing upgrades
- Best for: Local development and testing
- Output: `deployments/deployment-hardhat.json`

#### deploy-besu.ts - Direct Proxy Pattern
```bash
npx tsx scripts/deploy-besu.ts
```
- Deploys to Besu local network
- Creates a single UUPS proxy with shared implementation
- Includes V1 and V2 implementations for upgrades
- Best for: Single-tenant deployments
- Output: `deployments/deployment-besu.json`

#### deploy-besu-factory.ts - Factory Pattern
```bash
npx tsx scripts/deploy-besu-factory.ts
```
- Deploys to Besu local network
- Creates factory contract for multi-manufacturer setup
- Each manufacturer gets their own proxy instance
- Best for: Multi-tenant systems
- Output: `deployments/deployment-besu-factory.json`

#### deploy-cloud.ts - Cloud Deployment
```bash
npx tsx scripts/deploy-cloud.ts
```
- Deploys to cloud Besu network
- Uses BESU_CLOUD_RPC environment variable
- Similar to deploy-besu.ts but for remote networks
- Best for: Production cloud deployments
- Output: `deployments/deployment-cloud.json`

### 3. Deploy Contracts

```bash
# Example: Deploy factory pattern to local Besu
npx tsx scripts/deploy-besu-factory.ts
```

Deployment addresses are automatically saved to the `deployments/` directory.

## Developing New Contracts

### Create a Contract

Add new Solidity files to `contracts/`:

```solidity
// contracts/MyContract.sol
pragma solidity ^0.8.28;

contract MyContract {
    uint256 public value;

    function setValue(uint256 _value) public {
        value = _value;
    }
}
```

### Write Tests

Create test files in `test/`:

```typescript
import { expect } from 'chai';
import { deployContract } from './helpers';

describe('MyContract', () => {
  it('should set value', async () => {
    const contract = await deployContract('MyContract');
    await contract.write.setValue([42n]);
    expect(await contract.read.value()).to.equal(42n);
  });
});
```

### Create Deployment Script

Add deployment script to `scripts/`:

```typescript
import { createWalletClient, http, publicActions } from 'viem';
import MyContractArtifact from '../artifacts/contracts/MyContract.sol/MyContract.json';

async function main() {
  const client = createWalletClient({
    chain: /* your chain config */,
    transport: http('http://127.0.0.1:8545')
  }).extend(publicActions);

  const hash = await client.deployContract({
    abi: MyContractArtifact.abi,
    bytecode: MyContractArtifact.bytecode as `0x${string}`
  });

  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log('Contract deployed:', receipt.contractAddress);
}

main();
```

## Working with Deployed Contracts

### Interact with Contracts

```typescript
import { getContract, createPublicClient, http } from 'viem';

const client = createPublicClient({
  transport: http('http://127.0.0.1:8545')
});

const contract = getContract({
  address: '0xYourContractAddress',
  abi: contractAbi,
  client
});

// Read data
const value = await contract.read.getValue();

// Write data (requires wallet client)
await contract.write.setValue([42n], { gasPrice: 0n });
```

### Verify Deployment

```bash
# Check contract on Besu network
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"eth_getCode",
    "params":["0xYourContractAddress", "latest"],
    "id":1
  }'
```

## Project Structure

```
logistics-smart-contracts/
├── contracts/          Solidity source files
├── scripts/            Deployment scripts
├── test/               Test files
├── artifacts/          Compiled contracts (generated)
├── cache/              Build cache (generated)
├── hardhat.config.ts   Hardhat configuration
├── package.json        Dependencies
└── .mocharc.json       Test configuration
```

## Example Contracts

This repository includes example contracts demonstrating:

- **ManufacturerRegistry** - Role-based access control
- **LogisticsOrder** - Upgradeable ERC-721 NFT with UUPS proxy
- **LogisticsOrderFactory** - Factory pattern for contract deployment

These serve as reference implementations but can be replaced with your own contracts.

## Important Notes

### Zero Gas Transactions

When deploying to Besu with zero gas configuration, always specify `gasPrice: 0`:

```typescript
await contract.write.functionName([args], {
  gasPrice: 0n
});
```

### Private Keys

All deployment scripts now use environment variables for private keys:

1. Copy `.env.example` to `.env`
2. Add your private key to `.env`:
   ```bash
   DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere
   ```
3. The `.env` file is already in `.gitignore` and will never be committed

Deployment scripts will fail with a clear error if `DEPLOYER_PRIVATE_KEY` is not set (except deploy.ts which uses Hardhat's default accounts).

### Upgradeable Contracts

When using proxy patterns (UUPS, Transparent Proxy), remember:
- Use `@openzeppelin/contracts-upgradeable`
- Never use constructors (use `initialize` instead)
- Preserve storage layout when upgrading
- Test upgrades thoroughly

## Testing

Run specific test files:

```bash
npx mocha test/MyContract.test.ts
```

Run tests matching a pattern:

```bash
npx mocha --grep "should deploy"
```

## Troubleshooting

### Contract Deployment Fails

- Verify Besu network is running: `curl http://localhost:8545`
- Check gas price is set to 0
- Ensure account has sufficient balance (if required)
- Review Besu logs for errors

### Compilation Errors

```bash
# Clean build artifacts
rm -rf artifacts cache

# Recompile
npx hardhat compile
```

## Documentation

- [Hardhat Documentation](https://hardhat.org/docs)
- [Viem Documentation](https://viem.sh/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Solidity Documentation](https://docs.soliditylang.org/)

## License

MIT License - See [LICENSE](LICENSE) for details.
