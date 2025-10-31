# Logistics Smart Contracts

Smart contract development environment for deploying contracts to private Ethereum networks.

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

### 1. Configure Network

Add your Besu network configuration to `hardhat.config.ts`:

```typescript
networks: {
  besu: {
    url: "http://127.0.0.1:8545",
    chainId: 10001,  // Match your genesis.json
    gasPrice: 0,     // Zero gas configuration
    accounts: ["0xYourPrivateKey"]
  }
}
```

### 2. Deploy Contracts

```bash
# Deploy to local Hardhat network (for testing)
npx tsx scripts/deploy.ts

# Deploy to Besu network
npx tsx scripts/deploy-besu.ts
```

Deployment addresses will be saved to `deployment-info.json`.

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

Never commit private keys to version control. Use environment variables:

```typescript
import * as dotenv from 'dotenv';
dotenv.config();

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];
```

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
