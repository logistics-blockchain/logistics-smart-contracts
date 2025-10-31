import { expect } from 'chai';
import { zeroAddress } from 'viem';
import {
  setupTestEnvironment,
  deployFullSystem,
  getManufacturerRegistryContract,
  getLogisticsOrderContract,
  parseEvents,
  OrderState,
  TEST_DATA,
  type DeployedContracts,
} from './helpers';

describe('LogisticsOrder (via Proxy)', () => {
  let publicClient: any;
  let accounts: any;
  let contracts: DeployedContracts;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    // Deploy full system
    contracts = await deployFullSystem(accounts.owner, publicClient);

    // Register manufacturers for testing
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

  describe('Deployment & Initialization', () => {
    it('should initialize via proxy correctly', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const version = await orders.read.version();
      expect(version).to.equal('1.0.0');
    });

    it('should set ManufacturerRegistry reference correctly', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const registryRef = await orders.read.manufacturerRegistry();
      expect(registryRef.toLowerCase()).to.equal(contracts.registryAddress.toLowerCase());
    });

    it('should set owner correctly', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const owner = await orders.read.owner();
      expect(owner.toLowerCase()).to.equal(accounts.owner.account.address.toLowerCase());
    });

    it('should have correct ERC721 name and symbol', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const name = await orders.read.name();
      const symbol = await orders.read.symbol();

      expect(name).to.equal('LogisticsOrder');
      expect(symbol).to.equal('LO');
    });
  });

  describe('Order Creation', () => {
    it('should allow registered manufacturer to create order', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const hash = await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal('success');
    });

    it('should mint NFT to receiver', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const owner = await orders.read.ownerOf([1n]);
      expect(owner.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should store order data correctly', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const order = await orders.read.getOrder([1n]);

      expect(order.tokenId).to.equal(1n);
      expect(order.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order.receiver.toLowerCase()).to.equal(
        accounts.receiver1.account.address.toLowerCase()
      );
      expect(order.state).to.equal(OrderState.Created);
      expect(order.ipfsHash).to.equal(TEST_DATA.ipfsHashes.order1);
      expect(order.createdAt).to.be.greaterThan(0n);
    });

    it('should emit OrderCreated event with correct data', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const hash = await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, orders.abi);

      const orderCreatedEvent = events.find((e: any) => e.eventName === 'OrderCreated');
      expect(orderCreatedEvent).to.exist;
      expect(orderCreatedEvent.args.tokenId).to.equal(1n);
      expect(orderCreatedEvent.args.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(orderCreatedEvent.args.receiver.toLowerCase()).to.equal(
        accounts.receiver1.account.address.toLowerCase()
      );
      expect(orderCreatedEvent.args.ipfsHash).to.equal(TEST_DATA.ipfsHashes.order1);
    });

    it('should increment token ID sequentially', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Create first order
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      // Create second order
      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order2,
      ]);

      const order1 = await orders.read.getOrder([1n]);
      const order2 = await orders.read.getOrder([2n]);

      expect(order1.tokenId).to.equal(1n);
      expect(order2.tokenId).to.equal(2n);
    });

    it('should reject order creation from non-registered address', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer3 // Not registered!
      );

      await expect(
        orders.write.createOrder([
          accounts.receiver1.account.address,
          TEST_DATA.ipfsHashes.order1,
        ])
      ).to.be.rejectedWith('Caller is not a registered manufacturer');
    });

    it('should reject order creation from deactivated manufacturer', async () => {
      // Deactivate manufacturer1
      const registry = getManufacturerRegistryContract(
        contracts.registryAddress,
        publicClient,
        accounts.owner
      );
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

    it('should reject order with zero receiver address', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await expect(
        orders.write.createOrder([zeroAddress, TEST_DATA.ipfsHashes.order1])
      ).to.be.rejectedWith('Invalid receiver address');
    });

    it('should reject order with empty IPFS hash', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await expect(
        orders.write.createOrder([accounts.receiver1.account.address, ''])
      ).to.be.rejectedWith('IPFS hash cannot be empty');
    });
  });

  describe('State Updates', () => {
    beforeEach(async () => {
      // Create an order before each test
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);
    });

    it('should allow manufacturer to update own order state (Created → PickedUp)', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const hash = await orders.write.updateState([1n, OrderState.PickedUp]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal('success');

      const order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.PickedUp);
    });

    it('should support all valid state transitions', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Created → PickedUp
      await orders.write.updateState([1n, OrderState.PickedUp]);
      let order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.PickedUp);

      // PickedUp → InTransit
      await orders.write.updateState([1n, OrderState.InTransit]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.InTransit);

      // InTransit → AtFacility
      await orders.write.updateState([1n, OrderState.AtFacility]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.AtFacility);

      // AtFacility → Delivered
      await orders.write.updateState([1n, OrderState.Delivered]);
      order = await orders.read.getOrder([1n]);
      expect(order.state).to.equal(OrderState.Delivered);
    });

    it('should emit StateUpdated event', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      const hash = await orders.write.updateState([1n, OrderState.PickedUp]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, orders.abi);

      const stateUpdatedEvent = events.find((e: any) => e.eventName === 'StateUpdated');
      expect(stateUpdatedEvent).to.exist;
      expect(stateUpdatedEvent.args.tokenId).to.equal(1n);
      expect(stateUpdatedEvent.args.newState).to.equal(OrderState.PickedUp);
      expect(stateUpdatedEvent.args.timestamp).to.be.greaterThan(0n);
    });

    it('should emit OrderDelivered event when reaching Delivered state', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Progress through all states
      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([1n, OrderState.InTransit]);
      await orders.write.updateState([1n, OrderState.AtFacility]);

      const hash = await orders.write.updateState([1n, OrderState.Delivered]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, orders.abi);

      const deliveredEvent = events.find((e: any) => e.eventName === 'OrderDelivered');
      expect(deliveredEvent).to.exist;
      expect(deliveredEvent.args.tokenId).to.equal(1n);
    });

    it('should reject state update from different manufacturer', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer2 // Different manufacturer!
      );

      await expect(
        orders.write.updateState([1n, OrderState.PickedUp])
      ).to.be.rejectedWith('Only order manufacturer can update state');
    });

    it('should reject skipping states (Created → InTransit)', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await expect(
        orders.write.updateState([1n, OrderState.InTransit])
      ).to.be.rejectedWith('Invalid state transition');
    });

    it('should reject backward state transitions', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      // Move to InTransit first
      await orders.write.updateState([1n, OrderState.PickedUp]);
      await orders.write.updateState([1n, OrderState.InTransit]);

      // Try to go back to Created
      await expect(
        orders.write.updateState([1n, OrderState.Created])
      ).to.be.rejectedWith('Invalid state transition');
    });

    it('should reject state update from receiver (NFT owner)', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.receiver1 // NFT owner, not manufacturer!
      );

      await expect(
        orders.write.updateState([1n, OrderState.PickedUp])
      ).to.be.rejectedWith('Only order manufacturer can update state');
    });

    it('should reject state update for non-existent order', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await expect(
        orders.write.updateState([999n, OrderState.PickedUp])
      ).to.be.rejectedWith('Order does not exist');
    });
  });

  describe('NFT Functionality', () => {
    beforeEach(async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);
    });

    it('should return correct tokenURI with IPFS prefix', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const tokenURI = await orders.read.tokenURI([1n]);
      expect(tokenURI).to.equal(`ipfs://${TEST_DATA.ipfsHashes.order1}`);
    });

    it('should return correct owner via ownerOf', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const owner = await orders.read.ownerOf([1n]);
      expect(owner.toLowerCase()).to.equal(accounts.receiver1.account.address.toLowerCase());
    });

    it('should allow receiver to transfer NFT', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.receiver1
      );

      await orders.write.transferFrom([
        accounts.receiver1.account.address,
        accounts.receiver2.account.address,
        1n,
      ]);

      const newOwner = await orders.read.ownerOf([1n]);
      expect(newOwner.toLowerCase()).to.equal(accounts.receiver2.account.address.toLowerCase());
    });

    it('should maintain order data after NFT transfer', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.receiver1
      );

      // Transfer NFT
      await orders.write.transferFrom([
        accounts.receiver1.account.address,
        accounts.receiver2.account.address,
        1n,
      ]);

      // Order data should remain unchanged (only NFT owner changed)
      const order = await orders.read.getOrder([1n]);
      expect(order.manufacturer.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(order.receiver.toLowerCase()).to.equal(
        accounts.receiver1.account.address.toLowerCase() // Original receiver
      );
    });
  });

  describe('View Functions', () => {
    it('should return complete order details via getOrder', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.manufacturer1
      );

      await orders.write.createOrder([
        accounts.receiver1.account.address,
        TEST_DATA.ipfsHashes.order1,
      ]);

      const order = await orders.read.getOrder([1n]);

      expect(order).to.have.property('tokenId');
      expect(order).to.have.property('manufacturer');
      expect(order).to.have.property('receiver');
      expect(order).to.have.property('state');
      expect(order).to.have.property('createdAt');
      expect(order).to.have.property('ipfsHash');
    });

    it('should reject getOrder for non-existent order', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      await expect(orders.read.getOrder([999n])).to.be.rejectedWith('Order does not exist');
    });

    it('should return correct version', async () => {
      const orders = getLogisticsOrderContract(
        contracts.proxyAddress,
        publicClient,
        accounts.owner
      );

      const version = await orders.read.version();
      expect(version).to.equal('1.0.0');
    });
  });
});
