import { expect } from 'chai';
import {
  setupTestEnvironment,
  deployFullSystem,
  getManufacturerRegistryContract,
  getLogisticsOrderContract,
  OrderState,
  TEST_DATA,
  type DeployedContracts,
} from './helpers';

describe('Integration Tests', () => {
  let publicClient: any;
  let accounts: any;
  let contracts: DeployedContracts;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    contracts = await deployFullSystem(accounts.owner, publicClient);

    // Register multiple manufacturers
    const registry = getManufacturerRegistryContract(
      contracts.registryAddress,
      publicClient,
      accounts.owner
    );

    await registry.write.registerManufacturer([
      accounts.manufacturer1.account.address,
      TEST_DATA.manufacturers.acme.name,
    ]);

    await registry.write.registerManufacturer([
      accounts.manufacturer2.account.address,
      TEST_DATA.manufacturers.beta.name,
    ]);
  });

  describe('Full Order Lifecycle', () => {
    it('should complete full order flow from creation to delivery', async () => {
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );

      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // 1. Verify manufacturer is registered
      const isRegistered = await registry.read.isRegistered([
        accounts.manufacturer1.account.address,
      ]);
      expect(isRegistered).to.be.true;

      // 2. Create order
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      let order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.Created);

      // 3. Progress through all states
      await orders.write.updateState([1n, OrderState.PickedUp]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.PickedUp);

      await orders.write.updateState([1n, OrderState.InTransit]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.InTransit);

      await orders.write.updateState([1n, OrderState.AtFacility]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.AtFacility);

      await orders.write.updateState([1n, OrderState.Delivered]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.Delivered);

      // 4. Verify NFT ownership remained with receiver throughout
      const owner = await orders.read.ownerOf([1n]);
      expect(owner.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should maintain correct order data throughout lifecycle', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const initialOrder = await orders.read.getOrder([1n]);

      // Progress through states
      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([1n, OrderState.InTransit]);
      await orders.write.updateState([1n, OrderState.AtFacility]);
      await orders.write.updateState([1n, OrderState.Delivered]);

      const finalOrder = await orders.read.getOrder([1n]);

      // All data should remain the same except state
      expect(finalOrder.tokenId).to.equal(initialOrder.tokenId);
      expect(finalOrder.manufacturer).to.equal(initialOrder.manufacturer);
      expect(finalOrder.receiver).to.equal(initialOrder.receiver);
      expect(finalOrder.ipfsHash).to.equal(initialOrder.ipfsHash);
      expect(finalOrder.createdAt).to.equal(initialOrder.createdAt);
      expect(finalOrder.state).to.equal(OrderState.Delivered);
    });

    it('should record correct timestamps for all state transitions', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const creationTime = (await orders.read.getOrder([1n])).createdAt;
      expect(creationTime).to.be.greaterThan(0n);

      // Small delay between state updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([1n, OrderState.InTransit]);
      await orders.write.updateState([1n, OrderState.AtFacility]);
      await orders.write.updateState([1n, OrderState.Delivered]);

      // Creation time should remain unchanged
      const finalOrder = await orders.read.getOrder([1n]);
      expect(finalOrder.createdAt).to.equal(creationTime);
    });
  });

  describe('Multi-Manufacturer Scenarios', () => {
    it('should allow multiple manufacturers to create orders independently', async () => {
      const orders1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const orders2 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer2
      );

      // Manufacturer 1 creates order
      await orders1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Manufacturer 2 creates order
      await orders2.write.createOrder([
        accounts.receiver2.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      const order1 = await orders1.read.getOrder([1n]);
      const order2 = await orders2.read.getOrder([2n]);

      expect(order1.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order2.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer2.account.address.toLowerCase()
      );
    });

    it('should enforce manufacturer isolation - cannot update other manufacturers orders', async () => {
      const orders1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const orders2 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer2
      );

      // Manufacturer 1 creates order
      await orders1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Manufacturer 2 tries to update manufacturer 1's order
      await expect(
        orders2.write.updateState([1n, OrderState.PickedUp])
      ).to.be.rejectedWith('Only order manufacturer can update state');
    });

    it('should allow each manufacturer to manage only their own orders', async () => {
      const orders1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const orders2 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer2
      );

      // Both manufacturers create orders
      await orders1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await orders2.write.createOrder([
        accounts.receiver2.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      // Each can update their own order
      await orders1.write.updateState([1n, OrderState.PickedUp]);
      await orders2.write.updateState([2n, OrderState.PickedUp]);

      const order1 = await orders1.read.getOrder([1n]);
      const order2 = await orders2.read.getOrder([2n]);

      expect(order1.state).to.equal(OrderState.PickedUp);
      expect(order2.state).to.equal(OrderState.PickedUp);
    });

    it('should maintain unique sequential token IDs across manufacturers', async () => {
      const orders1 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const orders2 = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer2
      );

      // Create orders alternating between manufacturers
      await orders1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await orders2.write.createOrder([
        accounts.receiver2.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      await orders1.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order3,
      ]);

      // Token IDs should be 1, 2, 3 regardless of which manufacturer created them
      const order1 = await orders1.read.getOrder([1n]);
      const order2 = await orders2.read.getOrder([2n]);
      const order3 = await orders1.read.getOrder([3n]);

      expect(order1.tokenId).to.equal(1n);
      expect(order2.tokenId).to.equal(2n);
      expect(order3.tokenId).to.equal(3n);
    });
  });

  describe('Access Control Integration', () => {
    it('should prevent deactivated manufacturer from creating new orders', async () => {
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );

      // Deactivate manufacturer1
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await expect(
        orders.write.createOrder([
          accounts.receiver1.account.address,
          TEST_DATA.ipfsHashes.order1,
        ])
      ).to.be.rejectedWith('Caller is not a registered manufacturer');
    });

    it('should allow access to existing orders from deactivated manufacturer', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create order while active
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Deactivate manufacturer
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      // Should still be able to read the order
      const order = await orders.read.getOrder([1n]);
      expect(order.tokenId).to.equal(1n);
    });

    it('should allow deactivated manufacturer to update existing orders', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create order while active
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Deactivate manufacturer
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      // Should still be able to update existing order (manufacturer validation, not registration)
      await orders.write.updateState([1n, OrderState.PickedUp]);

      const order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.PickedUp);
    });

    it('should allow reactivated manufacturer to create new orders again', async () => {
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );

      // Deactivate
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      // Reactivate
      await registry.write.activateManufacturer([accounts.manufacturer1.account.address]);

      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Should be able to create orders again
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const order = await orders.read.getOrder([1n]);
      expect(order.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple orders to same receiver', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create multiple orders for same receiver
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      // Receiver should own both NFTs
      const owner1 = await orders.read.ownerOf([1n]);
      const owner2 = await orders.read.ownerOf([2n]);

      expect(owner1.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
      expect(owner2.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should handle same manufacturer creating multiple concurrent orders', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create multiple orders
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      await orders.write.createOrder([
        accounts.receiver2.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order3,
      ]);

      // All should have same manufacturer
      const order1 = await orders.read.getOrder([1n]);
      const order2 = await orders.read.getOrder([2n]);
      const order3 = await orders.read.getOrder([3n]);

      expect(order1.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order2.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order3.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );

      // Each should be updatable independently
      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([3n, OrderState.PickedUp]);

      const updatedOrder1 = await orders.read.getOrder([1n]);
      const updatedOrder2 = await orders.read.getOrder([2n]);
      const updatedOrder3 = await orders.read.getOrder([3n]);

      expect(updatedOrder1.state).to.equal(OrderState.PickedUp);
      expect(updatedOrder2.state).to.equal(OrderState.Created); // Not updated
      expect(updatedOrder3.state).to.equal(OrderState.PickedUp);
    });
  });
});
