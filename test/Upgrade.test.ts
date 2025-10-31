import { expect } from 'chai';
import { encodeFunctionData, getContract } from 'viem';
import {
  setupTestEnvironment,
  deployFullSystem,
  getManufacturerRegistryContract,
  getLogisticsOrderContract,
  OrderState,
  TEST_DATA,
  type DeployedContracts,
} from './helpers';

// Import V2 contract artifact
import LogisticsOrderV2Artifact from '../artifacts/contracts/LogisticsOrderV2.sol/LogisticsOrderV2.json' assert { type: 'json' };

describe('Upgrade Tests', () => {
  let publicClient: any;
  let accounts: any;
  let contracts: DeployedContracts;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    // Deploy V1 system
    contracts = await deployFullSystem(accounts.owner, publicClient);

    // Register manufacturers
    const registry = getManufacturerRegistryContract(
      contracts.registryAddress,
      publicClient,
      accounts.owner
    );

    await registry.write.registerManufacturer([
      accounts.manufacturer1.account.address,
      TEST_DATA.manufacturers.acme.name,
    ]);
  });

  describe('Pre-Upgrade State', () => {
    it('should have V1 deployed and functional', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const version = await orders.read.version();
      expect(version).to.equal('1.0.0');

      // Create test order
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const order = await orders.read.getOrder([1n]);
      expect(order.tokenId).to.equal(1n);
    });

    it('should have sample orders before upgrade', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create multiple orders with different states
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      // Progress first order
      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([1n, OrderState.InTransit]);

      const order1 = await orders.read.getOrder([1n]);
      const order2 = await orders.read.getOrder([2n]);

      expect(order1.state).to.equal(OrderState.InTransit);
      expect(order2.state).to.equal(OrderState.Created);
    });
  });

  describe('Upgrade Process', () => {
    it('should allow owner to deploy V2 implementation', async () => {
      const hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.contractAddress).to.not.be.undefined;
      expect(receipt.status).to.equal('success');
    });

    it('should allow owner to upgrade proxy to V2', async () => {
      // Deploy V2 implementation
      const v2Hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const v2Receipt = await publicClient.waitForTransactionReceipt({ hash: v2Hash });
      const v2ImplAddress = v2Receipt.contractAddress!;

      // Get proxy contract with V1 ABI (has upgradeToAndCall function from UUPS)
      const proxy = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      // Upgrade to V2 (no initialization needed, just point to new implementation)
      const upgradeHash = await proxy.write.upgradeToAndCall([v2ImplAddress, '0x']);
      const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });

      expect(upgradeReceipt.status).to.equal('success');
    });

    it('should emit Upgraded event', async () => {
      // Deploy V2 implementation
      const v2Hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const v2Receipt = await publicClient.waitForTransactionReceipt({ hash: v2Hash });
      const v2ImplAddress = v2Receipt.contractAddress!;

      const proxy = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const upgradeHash = await proxy.write.upgradeToAndCall([v2ImplAddress, '0x']);
      const upgradeReceipt = await publicClient.waitForTransactionReceipt({ hash: upgradeHash });

      // Check for Upgraded event
      expect(upgradeReceipt.logs.length).to.be.greaterThan(0);
    });

    it('should reject upgrade from non-owner', async () => {
      // Deploy V2 implementation
      const v2Hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const v2Receipt = await publicClient.waitForTransactionReceipt({ hash: v2Hash });
      const v2ImplAddress = v2Receipt.contractAddress!;

      // Try to upgrade as non-owner
      const proxy = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1 // Not owner!
      );

      await expect(proxy.write.upgradeToAndCall([v2ImplAddress, '0x'])).to.be.rejected;
    });
  });

  describe('Post-Upgrade Verification', () => {
    let v2ImplAddress: `0x${string}`;

    beforeEach(async () => {
      // Create orders before upgrade
      const ordersV1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await ordersV1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await ordersV1.write.updateState([1n, OrderState.PickedUp]);

      // Deploy V2
      const v2Hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const v2Receipt = await publicClient.waitForTransactionReceipt({ hash: v2Hash });
      v2ImplAddress = v2Receipt.contractAddress!;

      // Upgrade proxy
      await ordersV1.write.upgradeToAndCall([v2ImplAddress, '0x']);
    });

    it('should return new version number after upgrade', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      const version = await ordersV2.read.version();
      expect(version).to.equal('2.0.0');
    });

    it('should preserve old order data after upgrade', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.manufacturer1 },
      });

      const order = await ordersV2.read.getOrder([1n]);

      expect(order.tokenId).to.equal(1n);
      expect(order.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order.receiver.toLowerCase()).to.equal(
        accounts.receiver1.account.address.toLowerCase()
      );
      expect(order.state).to.equal(OrderState.PickedUp);
      expect(order.ipfsHash).to.equal(TEST_DATA.ipfsHashes.order1);
    });

    it('should allow state updates on old orders after upgrade', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.manufacturer1 },
      });

      // Update state of order created before upgrade
      await ordersV2.write.updateState([1n, OrderState.InTransit]);

      const order = await ordersV2.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.InTransit);
    });

    it('should preserve NFT ownership after upgrade', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      const owner = await ordersV2.read.ownerOf([1n]);
      expect(owner.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should enable new V2 functionality (addTracking)', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.manufacturer1 },
      });

      const trackingData = 'GPS: 40.7128° N, 74.0060° W - Package in transit';

      const hash = await ordersV2.write.addTracking([1n, trackingData]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.status).to.equal('success');

      const storedData = await ordersV2.read.getTrackingData([1n]);
      expect(storedData).to.equal(trackingData);
    });

    it('should allow creating new orders with V2', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.manufacturer1 },
      });

      // Create new order after upgrade
      await ordersV2.write.createOrder([
        accounts.receiver2.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      const order = await ordersV2.read.getOrder([2n]);
      expect(order.tokenId).to.equal(2n);

      // Should be able to add tracking to new order
      await ordersV2.write.addTracking([2n, 'New order tracking data']);
      const trackingData = await ordersV2.read.getTrackingData([2n]);
      expect(trackingData).to.equal('New order tracking data');
    });

    it('should maintain proxy address (same address as V1)', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      // Proxy address should be unchanged
      const version = await ordersV2.read.version();
      expect(version).to.equal('2.0.0');

      // Contract should be accessible at same address
      const order = await ordersV2.read.getOrder([1n]);
      expect(order.tokenId).to.equal(1n);
    });

    it('should enforce V2 access control (only manufacturer can add tracking)', async () => {
      const ordersV2Mfg1 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.manufacturer1 },
      });

      const ordersV2Receiver = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.receiver1 },
      });

      // Manufacturer can add tracking
      await ordersV2Mfg1.write.addTracking([1n, 'Valid tracking data']);

      // Receiver (NFT owner) cannot add tracking
      await expect(
        ordersV2Receiver.write.addTracking([1n, 'Invalid tracking data'])
      ).to.be.rejectedWith('Only order manufacturer can add tracking');
    });
  });

  describe('Storage Layout Preservation', () => {
    beforeEach(async () => {
      // Create comprehensive order data before upgrade
      const ordersV1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await ordersV1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Upgrade to V2
      const v2Hash = await accounts.owner.deployContract({
        abi: LogisticsOrderV2Artifact.abi,
        bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
      });

      const v2Receipt = await publicClient.waitForTransactionReceipt({ hash: v2Hash });
      await ordersV1.write.upgradeToAndCall([v2Receipt.contractAddress!, '0x']);
    });

    it('should preserve all inherited ERC721 state', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      const name = await ordersV2.read.name();
      const symbol = await ordersV2.read.symbol();
      const owner = await ordersV2.read.ownerOf([1n]);

      expect(name).to.equal('LogisticsOrder');
      expect(symbol).to.equal('LO');
      expect(owner.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should preserve ManufacturerRegistry reference', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      const registryRef = await ordersV2.read.manufacturerRegistry();
      expect(registryRef.toLowerCase()).to.equal(contracts.registryAddress.toLowerCase());
    });

    it('should preserve contract ownership', async () => {
      const ordersV2 = getContract({
        address: contracts.proxyAddress,
        abi: LogisticsOrderV2Artifact.abi,
        client: { public: publicClient, wallet: accounts.owner },
      });

      const owner = await ordersV2.read.owner();
      expect(owner.toLowerCase()).to.equal(accounts.owner.account.address.toLowerCase());
    });
  });
});
