// @ts-nocheck
import { expect } from 'chai';
import { getContract } from 'viem';

import {
  setupTestEnvironment,
  type TestAccounts,
  HARDHAT_PRIVATE_KEYS,
} from './helpers';

import PaymentReceiverArtifact from '../artifacts/contracts/PaymentReceiver.sol/PaymentReceiver.json' assert { type: 'json' };

describe('PaymentReceiver', function() {
  this.timeout(60000);

  let publicClient: any;
  let accounts: TestAccounts;
  let paymentReceiverAddress: `0x${string}`;

  // Additional accounts for testing
  let relayer: any;
  let newRelayer: any;

  async function deployPaymentReceiver(deployer: any) {
    const hash = await deployer.deployContract({
      abi: PaymentReceiverArtifact.abi,
      bytecode: PaymentReceiverArtifact.bytecode as `0x${string}`,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress!;
  }

  function getPaymentReceiverContract(wallet: any) {
    return getContract({
      address: paymentReceiverAddress,
      abi: PaymentReceiverArtifact.abi,
      client: { public: publicClient, wallet },
    });
  }

  beforeEach(async function() {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    // Use owner as deployer (becomes owner and initial relayer)
    relayer = accounts.owner;
    newRelayer = accounts.manufacturer1;

    paymentReceiverAddress = await deployPaymentReceiver(relayer);
  });

  describe('Deployment', function() {
    it('should set deployer as relayer', async function() {
      const contract = getPaymentReceiverContract(relayer);
      const currentRelayer = await contract.read.relayer();
      expect(currentRelayer.toLowerCase()).to.equal(relayer.account.address.toLowerCase());
    });

    it('should set deployer as owner', async function() {
      const contract = getPaymentReceiverContract(relayer);
      const owner = await contract.read.owner();
      expect(owner.toLowerCase()).to.equal(relayer.account.address.toLowerCase());
    });
  });

  describe('Recording Payments', function() {
    const testPayment = {
      besuProxy: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      orderId: 1n,
      amount: 1000000n,
      recipient: '0x9876543210987654321098765432109876543210' as `0x${string}`,
    };

    it('should allow relayer to record payment', async function() {
      const contract = getPaymentReceiverContract(relayer);

      await contract.write.recordPayment([
        testPayment.besuProxy,
        testPayment.orderId,
        testPayment.amount,
        testPayment.recipient,
      ]);

      const payment = await contract.read.getPayment([
        testPayment.besuProxy,
        testPayment.orderId,
      ]);

      expect(payment.besuProxy.toLowerCase()).to.equal(testPayment.besuProxy.toLowerCase());
      expect(payment.orderId).to.equal(testPayment.orderId);
      expect(payment.amount).to.equal(testPayment.amount);
      expect(payment.recipient.toLowerCase()).to.equal(testPayment.recipient.toLowerCase());
      expect(payment.timestamp).to.be.greaterThan(0n);
    });

    it('should reject payment from non-relayer', async function() {
      const contract = getPaymentReceiverContract(accounts.manufacturer1);

      await expect(
        contract.write.recordPayment([
          testPayment.besuProxy,
          testPayment.orderId,
          testPayment.amount,
          testPayment.recipient,
        ])
      ).to.be.rejected;
    });

    it('should reject duplicate payment recording', async function() {
      const contract = getPaymentReceiverContract(relayer);

      // First recording succeeds
      await contract.write.recordPayment([
        testPayment.besuProxy,
        testPayment.orderId,
        testPayment.amount,
        testPayment.recipient,
      ]);

      // Second recording fails
      await expect(
        contract.write.recordPayment([
          testPayment.besuProxy,
          testPayment.orderId,
          testPayment.amount,
          testPayment.recipient,
        ])
      ).to.be.rejected;
    });

    it('should emit PaymentRecorded event', async function() {
      const contract = getPaymentReceiverContract(relayer);

      const hash = await contract.write.recordPayment([
        testPayment.besuProxy,
        testPayment.orderId,
        testPayment.amount,
        testPayment.recipient,
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Check logs contain expected event
      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it('should correctly report isRecorded status', async function() {
      const contract = getPaymentReceiverContract(relayer);

      // Not recorded initially
      let isRecorded = await contract.read.isRecorded([
        testPayment.besuProxy,
        testPayment.orderId,
      ]);
      expect(isRecorded).to.be.false;

      // Record payment
      await contract.write.recordPayment([
        testPayment.besuProxy,
        testPayment.orderId,
        testPayment.amount,
        testPayment.recipient,
      ]);

      // Now recorded
      isRecorded = await contract.read.isRecorded([
        testPayment.besuProxy,
        testPayment.orderId,
      ]);
      expect(isRecorded).to.be.true;
    });
  });

  describe('Relayer Management', function() {
    it('should allow owner to update relayer', async function() {
      const contract = getPaymentReceiverContract(relayer);

      await contract.write.updateRelayer([newRelayer.account.address]);

      const currentRelayer = await contract.read.relayer();
      expect(currentRelayer.toLowerCase()).to.equal(newRelayer.account.address.toLowerCase());
    });

    it('should emit RelayerUpdated event', async function() {
      const contract = getPaymentReceiverContract(relayer);

      const hash = await contract.write.updateRelayer([newRelayer.account.address]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it('should reject relayer update from non-owner', async function() {
      const contract = getPaymentReceiverContract(accounts.manufacturer2);

      await expect(
        contract.write.updateRelayer([newRelayer.account.address])
      ).to.be.rejected;
    });

    it('should reject zero address as new relayer', async function() {
      const contract = getPaymentReceiverContract(relayer);

      await expect(
        contract.write.updateRelayer(['0x0000000000000000000000000000000000000000'])
      ).to.be.rejected;
    });

    it('should allow new relayer to record payments after update', async function() {
      const ownerContract = getPaymentReceiverContract(relayer);
      const newRelayerContract = getPaymentReceiverContract(newRelayer);

      // Update relayer
      await ownerContract.write.updateRelayer([newRelayer.account.address]);

      // New relayer can record
      const testPayment = {
        besuProxy: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        orderId: 1n,
        amount: 1000000n,
        recipient: '0x9876543210987654321098765432109876543210' as `0x${string}`,
      };

      await newRelayerContract.write.recordPayment([
        testPayment.besuProxy,
        testPayment.orderId,
        testPayment.amount,
        testPayment.recipient,
      ]);

      const payment = await newRelayerContract.read.getPayment([
        testPayment.besuProxy,
        testPayment.orderId,
      ]);
      expect(payment.amount).to.equal(testPayment.amount);
    });

    it('should prevent old relayer from recording after update', async function() {
      const ownerContract = getPaymentReceiverContract(relayer);
      const oldRelayerContract = getPaymentReceiverContract(relayer);

      // Update relayer
      await ownerContract.write.updateRelayer([newRelayer.account.address]);

      // Old relayer cannot record
      const testPayment = {
        besuProxy: '0x1234567890123456789012345678901234567890' as `0x${string}`,
        orderId: 1n,
        amount: 1000000n,
        recipient: '0x9876543210987654321098765432109876543210' as `0x${string}`,
      };

      await expect(
        oldRelayerContract.write.recordPayment([
          testPayment.besuProxy,
          testPayment.orderId,
          testPayment.amount,
          testPayment.recipient,
        ])
      ).to.be.rejected;
    });
  });

  describe('Multiple Payments', function() {
    it('should handle payments from different proxies', async function() {
      const contract = getPaymentReceiverContract(relayer);

      const payment1 = {
        besuProxy: '0x1111111111111111111111111111111111111111' as `0x${string}`,
        orderId: 1n,
        amount: 1000n,
        recipient: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
      };

      const payment2 = {
        besuProxy: '0x2222222222222222222222222222222222222222' as `0x${string}`,
        orderId: 1n,
        amount: 2000n,
        recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`,
      };

      await contract.write.recordPayment([
        payment1.besuProxy,
        payment1.orderId,
        payment1.amount,
        payment1.recipient,
      ]);

      await contract.write.recordPayment([
        payment2.besuProxy,
        payment2.orderId,
        payment2.amount,
        payment2.recipient,
      ]);

      const result1 = await contract.read.getPayment([payment1.besuProxy, payment1.orderId]);
      const result2 = await contract.read.getPayment([payment2.besuProxy, payment2.orderId]);

      expect(result1.amount).to.equal(payment1.amount);
      expect(result2.amount).to.equal(payment2.amount);
    });

    it('should handle different order IDs from same proxy', async function() {
      const contract = getPaymentReceiverContract(relayer);

      const proxyAddr = '0x1111111111111111111111111111111111111111' as `0x${string}`;

      await contract.write.recordPayment([
        proxyAddr,
        1n,
        1000n,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ]);

      await contract.write.recordPayment([
        proxyAddr,
        2n,
        2000n,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ]);

      const result1 = await contract.read.getPayment([proxyAddr, 1n]);
      const result2 = await contract.read.getPayment([proxyAddr, 2n]);

      expect(result1.amount).to.equal(1000n);
      expect(result2.amount).to.equal(2000n);
    });
  });

  describe('Ownership', function() {
    it('should allow owner to transfer ownership', async function() {
      const contract = getPaymentReceiverContract(relayer);

      await contract.write.transferOwnership([accounts.manufacturer1.account.address]);

      const newOwner = await contract.read.owner();
      expect(newOwner.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });

    it('should allow new owner to update relayer', async function() {
      const ownerContract = getPaymentReceiverContract(relayer);

      // Transfer ownership
      await ownerContract.write.transferOwnership([accounts.manufacturer1.account.address]);

      // New owner updates relayer
      const newOwnerContract = getPaymentReceiverContract(accounts.manufacturer1);
      await newOwnerContract.write.updateRelayer([accounts.manufacturer2.account.address]);

      const currentRelayer = await newOwnerContract.read.relayer();
      expect(currentRelayer.toLowerCase()).to.equal(accounts.manufacturer2.account.address.toLowerCase());
    });
  });
});
