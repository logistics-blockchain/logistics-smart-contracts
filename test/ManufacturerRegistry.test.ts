import { expect } from 'chai';
import { zeroAddress } from 'viem';
import {
  setupTestEnvironment,
  deployManufacturerRegistry,
  getManufacturerRegistryContract,
  parseEvents,
  TEST_DATA,
} from './helpers';

describe('ManufacturerRegistry', () => {
  let publicClient: any;
  let accounts: any;
  let registryAddress: `0x${string}`;

  beforeEach(async () => {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    // Deploy fresh registry for each test
    registryAddress = await deployManufacturerRegistry(accounts.owner, publicClient);
  });

  describe('Deployment & Initialization', () => {
    it('should deploy with correct owner', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const owner = await registry.read.owner();
      expect(owner.toLowerCase()).to.equal(accounts.owner.account.address.toLowerCase());
    });
  });

  describe('Manufacturer Registration', () => {
    it('should allow owner to register manufacturer with valid data', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal('success');

      // Verify manufacturer is registered
      const isRegistered = await registry.read.isRegistered([
        accounts.manufacturer1.account.address,
      ]);
      expect(isRegistered).to.be.true;
    });

    it('should set manufacturer as active after registration', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);

      const manufacturer = await registry.read.getManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      expect(manufacturer.addr.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(manufacturer.name).to.equal(TEST_DATA.manufacturers.acme.name);
      expect(manufacturer.isActive).to.be.true;
    });

    it('should emit ManufacturerRegistered event', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, registry.abi);

      expect(events).to.have.lengthOf(1);
      expect(events[0].eventName).to.equal('ManufacturerRegistered');
      expect(events[0].args.addr.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(events[0].args.name).to.equal(TEST_DATA.manufacturers.acme.name);
    });

    it('should reject registration from non-owner', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.manufacturer1 // Not owner!
      );

      await expect(
        registry.write.registerManufacturer([
          accounts.manufacturer2.account.address,
          TEST_DATA.manufacturers.beta.name,
        ])
      ).to.be.rejected;
    });

    it('should reject registration with zero address', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await expect(
        registry.write.registerManufacturer([zeroAddress, TEST_DATA.manufacturers.acme.name])
      ).to.be.rejectedWith('Invalid address');
    });

    it('should reject registration with empty name', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await expect(
        registry.write.registerManufacturer([accounts.manufacturer1.account.address, ''])
      ).to.be.rejectedWith('Name cannot be empty');
    });
  });

  describe('Manufacturer Deactivation', () => {
    beforeEach(async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      // Register a manufacturer first
      await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);
    });

    it('should allow owner to deactivate registered manufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.deactivateManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal('success');
    });

    it('should emit ManufacturerDeactivated event', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.deactivateManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, registry.abi);

      expect(events).to.have.lengthOf(1);
      expect(events[0].eventName).to.equal('ManufacturerDeactivated');
      expect(events[0].args.addr.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
    });

    it('should return false for isRegistered after deactivation', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      const isRegistered = await registry.read.isRegistered([
        accounts.manufacturer1.account.address,
      ]);
      expect(isRegistered).to.be.false;
    });

    it('should reject deactivating unregistered manufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await expect(
        registry.write.deactivateManufacturer([accounts.manufacturer2.account.address])
      ).to.be.rejectedWith('Manufacturer not registered');
    });

    it('should reject deactivating already inactive manufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      // Deactivate once
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);

      // Try to deactivate again
      await expect(
        registry.write.deactivateManufacturer([accounts.manufacturer1.account.address])
      ).to.be.rejectedWith('Manufacturer already inactive');
    });

    it('should reject deactivation from non-owner', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.manufacturer1 // Not owner!
      );

      await expect(
        registry.write.deactivateManufacturer([accounts.manufacturer1.account.address])
      ).to.be.rejected;
    });
  });

  describe('Manufacturer Activation', () => {
    beforeEach(async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      // Register and deactivate a manufacturer
      await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);
      await registry.write.deactivateManufacturer([accounts.manufacturer1.account.address]);
    });

    it('should allow owner to reactivate deactivated manufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.activateManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).to.equal('success');

      const isRegistered = await registry.read.isRegistered([
        accounts.manufacturer1.account.address,
      ]);
      expect(isRegistered).to.be.true;
    });

    it('should emit ManufacturerActivated event', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const hash = await registry.write.activateManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = parseEvents(receipt, registry.abi);

      expect(events).to.have.lengthOf(1);
      expect(events[0].eventName).to.equal('ManufacturerActivated');
    });

    it('should reject activating already active manufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      // Activate once
      await registry.write.activateManufacturer([accounts.manufacturer1.account.address]);

      // Try to activate again
      await expect(
        registry.write.activateManufacturer([accounts.manufacturer1.account.address])
      ).to.be.rejectedWith('Manufacturer already active');
    });
  });

  describe('View Functions', () => {
    it('should return correct manufacturer details via getManufacturer', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      await registry.write.registerManufacturer([
        accounts.manufacturer1.account.address,
        TEST_DATA.manufacturers.acme.name,
      ]);

      const manufacturer = await registry.read.getManufacturer([
        accounts.manufacturer1.account.address,
      ]);

      expect(manufacturer.addr.toLowerCase()).to.equal(
        accounts.manufacturer1.account.address.toLowerCase()
      );
      expect(manufacturer.name).to.equal(TEST_DATA.manufacturers.acme.name);
      expect(manufacturer.isActive).to.be.true;
    });

    it('should return false for isRegistered with unregistered address', async () => {
      const registry = getManufacturerRegistryContract(
        registryAddress,
        publicClient,
        accounts.owner
      );

      const isRegistered = await registry.read.isRegistered([
        accounts.manufacturer1.account.address,
      ]);
      expect(isRegistered).to.be.false;
    });
  });
});
