// @ts-nocheck
import { expect } from 'chai';
import { getContract } from 'viem';

// Import test helpers
import {
  setupTestEnvironment,
  getManufacturerRegistryContract,
  getLogisticsOrderContract,
  parseEvents,
  type TestAccounts,
} from './helpers';

// Import artifacts
import ManufacturerRegistryArtifact from '../artifacts/contracts/ManufacturerRegistry.sol/ManufacturerRegistry.json' assert { type: 'json' };
import LogisticsOrderArtifact from '../artifacts/contracts/LogisticsOrder.sol/LogisticsOrder.json' assert { type: 'json' };
import LogisticsOrderFactoryArtifact from '../artifacts/contracts/LogisticsOrderFactory.sol/LogisticsOrderFactory.json' assert { type: 'json' };

describe('LogisticsOrderFactory', function() {
  this.timeout(60000);

  let publicClient: any;
  let accounts: TestAccounts;
  let registryAddress: `0x${string}`;
  let implementationAddress: `0x${string}`;
  let factoryAddress: `0x${string}`;

  // Helper to deploy the factory system
  async function deployFactorySystem() {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    // Deploy ManufacturerRegistry
    const registryHash = await accounts.owner.deployContract({
      abi: ManufacturerRegistryArtifact.abi,
      bytecode: ManufacturerRegistryArtifact.bytecode as `0x${string}`
    });
    const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryHash });
    registryAddress = registryReceipt.contractAddress!;

    // Deploy LogisticsOrder implementation
    const implHash = await accounts.owner.deployContract({
      abi: LogisticsOrderArtifact.abi,
      bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`
    });
    const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash });
    implementationAddress = implReceipt.contractAddress!;

    // Deploy LogisticsOrderFactory
    const factoryHash = await accounts.owner.deployContract({
      abi: LogisticsOrderFactoryArtifact.abi,
      bytecode: LogisticsOrderFactoryArtifact.bytecode as `0x${string}`,
      args: [implementationAddress, registryAddress]
    });
    const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
    factoryAddress = factoryReceipt.contractAddress!;

    return {
      publicClient,
      accounts,
      registryAddress,
      implementationAddress,
      factoryAddress
    };
  }

  // Helper to get factory contract instance
  function getFactoryContract(wallet: any) {
    return getContract({
      address: factoryAddress,
      abi: LogisticsOrderFactoryArtifact.abi,
      client: { public: publicClient, wallet }
    });
  }

  beforeEach(async function() {
    await deployFactorySystem();
  });

  describe('Deployment', function() {
    it('should deploy factory with correct implementation address', async function() {
      const factory = getFactoryContract(accounts.owner);
      const impl = await factory.read.getImplementation();
      expect(impl.toLowerCase()).to.equal(implementationAddress.toLowerCase());
    });

    it('should deploy factory with correct registry address', async function() {
      const factory = getFactoryContract(accounts.owner);
      const registry = await factory.read.getRegistry();
      expect(registry.toLowerCase()).to.equal(registryAddress.toLowerCase());
    });

    it('should reject deployment with zero implementation address', async function() {
      await expect(
        accounts.owner.deployContract({
          abi: LogisticsOrderFactoryArtifact.abi,
          bytecode: LogisticsOrderFactoryArtifact.bytecode as `0x${string}`,
          args: ['0x0000000000000000000000000000000000000000', registryAddress]
        })
      ).to.be.rejected;
    });

    it('should reject deployment with zero registry address', async function() {
      await expect(
        accounts.owner.deployContract({
          abi: LogisticsOrderFactoryArtifact.abi,
          bytecode: LogisticsOrderFactoryArtifact.bytecode as `0x${string}`,
          args: [implementationAddress, '0x0000000000000000000000000000000000000000']
        })
      ).to.be.rejected;
    });
  });

  describe('Proxy Creation', function() {
    beforeEach(async function() {
      // Register manufacturer1
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);
    });

    it('should allow registered manufacturer to create proxy', async function() {
      const factory = getFactoryContract(accounts.manufacturer1);

      const hash = await factory.write.createLogisticsOrder();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Check proxy was created
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);
      expect(proxyAddress).to.not.equal('0x0000000000000000000000000000000000000000');
    });

    it('should emit ProxyDeployed event on creation', async function() {
      const factory = getFactoryContract(accounts.manufacturer1);

      const hash = await factory.write.createLogisticsOrder();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      const events = parseEvents(receipt, LogisticsOrderFactoryArtifact.abi);
      const deployEvent = events.find(e => e.eventName === 'ProxyDeployed');

      expect(deployEvent).to.exist;
      expect(deployEvent?.args?.manufacturer.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });

    it('should reject proxy creation from non-registered manufacturer', async function() {
      const factory = getFactoryContract(accounts.manufacturer2);

      await expect(
        factory.write.createLogisticsOrder()
      ).to.be.rejected;
    });

    it('should reject duplicate proxy creation by same manufacturer', async function() {
      const factory = getFactoryContract(accounts.manufacturer1);

      // First creation succeeds
      await factory.write.createLogisticsOrder();

      // Second creation fails
      await expect(
        factory.write.createLogisticsOrder()
      ).to.be.rejected;
    });

    it('should initialize proxy with manufacturer as owner', async function() {
      const factory = getFactoryContract(accounts.manufacturer1);

      await factory.write.createLogisticsOrder();
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);

      // Get proxy contract
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);
      const owner = await proxy.read.owner();

      expect(owner.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });

    it('should initialize proxy with correct registry reference', async function() {
      const factory = getFactoryContract(accounts.manufacturer1);

      await factory.write.createLogisticsOrder();
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);

      // Get proxy contract
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);
      const registry = await proxy.read.manufacturerRegistry();

      expect(registry.toLowerCase()).to.equal(registryAddress.toLowerCase());
    });

    it('should create different proxy addresses for different manufacturers', async function() {
      // Register second manufacturer
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer2.account.address, 'Manufacturer 2']);

      // Create proxies
      const factory1 = getFactoryContract(accounts.manufacturer1);
      const factory2 = getFactoryContract(accounts.manufacturer2);

      await factory1.write.createLogisticsOrder();
      await factory2.write.createLogisticsOrder();

      const proxy1 = await factory1.read.getManufacturerContract([accounts.manufacturer1.account.address]);
      const proxy2 = await factory2.read.getManufacturerContract([accounts.manufacturer2.account.address]);

      expect(proxy1.toLowerCase()).to.not.equal(proxy2.toLowerCase());
    });
  });

  describe('Proxy Functionality', function() {
    let proxyAddress: `0x${string}`;

    beforeEach(async function() {
      // Register and create proxy for manufacturer1
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);

      const factory = getFactoryContract(accounts.manufacturer1);
      await factory.write.createLogisticsOrder();
      proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);
    });

    it('should allow manufacturer to create orders via their proxy', async function() {
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);

      const hash = await proxy.write.createOrder([
        accounts.receiver1.account.address,
        'QmTest123'
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const order = await proxy.read.getOrder([1n]);
      expect(order.manufacturer.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });

    it('should isolate storage between different manufacturer proxies', async function() {
      // Register and create proxy for manufacturer2
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer2.account.address, 'Manufacturer 2']);

      const factory = getFactoryContract(accounts.manufacturer2);
      await factory.write.createLogisticsOrder();
      const proxy2Address = await factory.read.getManufacturerContract([accounts.manufacturer2.account.address]);

      // Create orders in both proxies
      const proxy1 = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);
      const proxy2 = getLogisticsOrderContract(proxy2Address, publicClient, accounts.manufacturer2);

      await proxy1.write.createOrder([accounts.receiver1.account.address, 'QmMfr1Order1']);
      await proxy2.write.createOrder([accounts.receiver2.account.address, 'QmMfr2Order1']);

      // Each proxy should have token ID 1
      const order1 = await proxy1.read.getOrder([1n]);
      const order2 = await proxy2.read.getOrder([1n]);

      expect(order1.ipfsHash).to.equal('QmMfr1Order1');
      expect(order2.ipfsHash).to.equal('QmMfr2Order1');
      expect(order1.manufacturer.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
      expect(order2.manufacturer.toLowerCase()).to.equal(accounts.manufacturer2.account.address.toLowerCase());
    });

    // TODO: UUPS upgrade fails with "Internal error" in Hardhat 3 EDR - needs investigation
    it.skip('should allow manufacturer to upgrade their own proxy', async function() {
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);

      // Deploy new implementation (using V2 if it exists, or same implementation for testing)
      const newImplHash = await accounts.owner.deployContract({
        abi: LogisticsOrderArtifact.abi,
        bytecode: LogisticsOrderArtifact.bytecode as `0x${string}`
      });
      const newImplReceipt = await publicClient.waitForTransactionReceipt({ hash: newImplHash });
      const newImplAddress = newImplReceipt.contractAddress!;

      // Manufacturer can upgrade their own proxy
      const hash = await proxy.write.upgradeToAndCall([newImplAddress, '0x']);
      await publicClient.waitForTransactionReceipt({ hash });

      // Proxy should still work
      const version = await proxy.read.version();
      expect(version).to.be.a('string');
    });
  });

  describe('Query Functions', function() {
    beforeEach(async function() {
      // Register manufacturer1 and create proxy
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);

      const factory = getFactoryContract(accounts.manufacturer1);
      await factory.write.createLogisticsOrder();
    });

    it('should return true for hasContract after proxy creation', async function() {
      const factory = getFactoryContract(accounts.owner);
      const hasContract = await factory.read.hasContract([accounts.manufacturer1.account.address]);
      expect(hasContract).to.be.true;
    });

    it('should return false for hasContract for manufacturer without proxy', async function() {
      const factory = getFactoryContract(accounts.owner);
      const hasContract = await factory.read.hasContract([accounts.manufacturer2.account.address]);
      expect(hasContract).to.be.false;
    });

    it('should return zero address for getManufacturerContract when no proxy exists', async function() {
      const factory = getFactoryContract(accounts.owner);
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer2.account.address]);
      expect(proxyAddress).to.equal('0x0000000000000000000000000000000000000000');
    });

    it('should return correct proxy address for getManufacturerContract', async function() {
      const factory = getFactoryContract(accounts.owner);
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);
      expect(proxyAddress).to.not.equal('0x0000000000000000000000000000000000000000');
    });
  });

  describe('Multiple Manufacturer Scenario', function() {
    it('should support multiple manufacturers with independent proxies', async function() {
      // Register 3 manufacturers
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);
      await registry.write.registerManufacturer([accounts.manufacturer2.account.address, 'Manufacturer 2']);
      await registry.write.registerManufacturer([accounts.manufacturer3.account.address, 'Manufacturer 3']);

      // Each creates their proxy
      const factory1 = getFactoryContract(accounts.manufacturer1);
      const factory2 = getFactoryContract(accounts.manufacturer2);
      const factory3 = getFactoryContract(accounts.manufacturer3);

      await factory1.write.createLogisticsOrder();
      await factory2.write.createLogisticsOrder();
      await factory3.write.createLogisticsOrder();

      // Get proxy addresses
      const proxy1 = await factory1.read.getManufacturerContract([accounts.manufacturer1.account.address]);
      const proxy2 = await factory2.read.getManufacturerContract([accounts.manufacturer2.account.address]);
      const proxy3 = await factory3.read.getManufacturerContract([accounts.manufacturer3.account.address]);

      // All should be different
      expect(proxy1).to.not.equal(proxy2);
      expect(proxy2).to.not.equal(proxy3);
      expect(proxy1).to.not.equal(proxy3);

      // Each should be able to create orders
      const contract1 = getLogisticsOrderContract(proxy1, publicClient, accounts.manufacturer1);
      const contract2 = getLogisticsOrderContract(proxy2, publicClient, accounts.manufacturer2);
      const contract3 = getLogisticsOrderContract(proxy3, publicClient, accounts.manufacturer3);

      await contract1.write.createOrder([accounts.receiver1.account.address, 'QmHash1']);
      await contract2.write.createOrder([accounts.receiver2.account.address, 'QmHash2']);
      await contract3.write.createOrder([accounts.receiver1.account.address, 'QmHash3']);

      // Verify orders are independent
      const order1 = await contract1.read.getOrder([1n]);
      const order2 = await contract2.read.getOrder([1n]);
      const order3 = await contract3.read.getOrder([1n]);

      expect(order1.ipfsHash).to.equal('QmHash1');
      expect(order2.ipfsHash).to.equal('QmHash2');
      expect(order3.ipfsHash).to.equal('QmHash3');
    });
  });

  describe('Access Control Integration', function() {
    it('should respect registry deactivation', async function() {
      // Register manufacturer
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);

      // Create proxy
      const factory = getFactoryContract(accounts.manufacturer1);
      await factory.write.createLogisticsOrder();
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);

      // Deactivate manufacturer
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      // Should not be able to create orders anymore
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);
      await expect(
        proxy.write.createOrder([accounts.receiver1.account.address, 'QmTest'])
      ).to.be.rejected;
    });

    it('should allow reactivated manufacturer to use existing proxy', async function() {
      // Register manufacturer
      const registry = getManufacturerRegistryContract(registryAddress, publicClient, accounts.owner);
      await registry.write.registerManufacturer([accounts.manufacturer1.account.address, 'Manufacturer 1']);

      // Create proxy and order
      const factory = getFactoryContract(accounts.manufacturer1);
      await factory.write.createLogisticsOrder();
      const proxyAddress = await factory.read.getManufacturerContract([accounts.manufacturer1.account.address]);
      const proxy = getLogisticsOrderContract(proxyAddress, publicClient, accounts.manufacturer1);
      await proxy.write.createOrder([accounts.receiver1.account.address, 'QmTest1']);

      // Deactivate then reactivate
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);
      await registry.write.activateManufacturer([accounts.manufacturer1.account.address]);

      // Should be able to create orders again
      await proxy.write.createOrder([accounts.receiver1.account.address, 'QmTest2']);
      const order = await proxy.read.getOrder([2n]);
      expect(order.ipfsHash).to.equal('QmTest2');
    });
  });
});
