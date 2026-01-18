// @ts-nocheck
import { expect } from 'chai';
import { getContract } from 'viem';

import {
  setupTestEnvironment,
  type TestAccounts,
} from './helpers';

import MLModelRegistryArtifact from '../artifacts/contracts/MLModelRegistry.sol/MLModelRegistry.json' assert { type: 'json' };

describe('MLModelRegistry', function() {
  this.timeout(60000);

  let publicClient: any;
  let accounts: TestAccounts;
  let registryAddress: `0x${string}`;

  async function deployMLModelRegistry(deployer: any) {
    const hash = await deployer.deployContract({
      abi: MLModelRegistryArtifact.abi,
      bytecode: MLModelRegistryArtifact.bytecode as `0x${string}`,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress!;
  }

  function getRegistryContract(wallet: any) {
    return getContract({
      address: registryAddress,
      abi: MLModelRegistryArtifact.abi,
      client: { public: publicClient, wallet },
    });
  }

  beforeEach(async function() {
    const env = await setupTestEnvironment();
    publicClient = env.publicClient;
    accounts = env.accounts;

    registryAddress = await deployMLModelRegistry(accounts.owner);
  });

  describe('Deployment', function() {
    it('should deploy with correct name and symbol', async function() {
      const contract = getRegistryContract(accounts.owner);
      const name = await contract.read.name();
      const symbol = await contract.read.symbol();

      expect(name).to.equal('MLModelRegistry');
      expect(symbol).to.equal('MLMODEL');
    });

    it('should start with zero models', async function() {
      const contract = getRegistryContract(accounts.owner);
      const totalModels = await contract.read.getTotalModels();
      expect(totalModels).to.equal(0n);
    });

    it('should start with zero runs', async function() {
      const contract = getRegistryContract(accounts.owner);
      const totalRuns = await contract.read.getTotalRuns();
      expect(totalRuns).to.equal(0n);
    });
  });

  describe('Base Model Registration', function() {
    const testModel = {
      name: 'GPT-Base',
      modelHash: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
      metadata: '{"type": "transformer", "params": "1B"}',
    };

    it('should allow anyone to register a base model', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const hash = await contract.write.registerBaseModel([
        testModel.name,
        testModel.modelHash,
        testModel.metadata,
      ]);
      await publicClient.waitForTransactionReceipt({ hash });

      const model = await contract.read.getModel([1n]);
      expect(model.name).to.equal(testModel.name);
      expect(model.modelHash).to.equal(testModel.modelHash);
      expect(model.metadata).to.equal(testModel.metadata);
      expect(model.parentModelId).to.equal(0n);
    });

    it('should mint NFT to registrant', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await contract.write.registerBaseModel([
        testModel.name,
        testModel.modelHash,
        testModel.metadata,
      ]);

      const owner = await contract.read.ownerOf([1n]);
      expect(owner.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });

    it('should emit ModelRegistered event', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const hash = await contract.write.registerBaseModel([
        testModel.name,
        testModel.modelHash,
        testModel.metadata,
      ]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      expect(receipt.logs.length).to.be.greaterThan(0);
    });

    it('should reject empty name', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await expect(
        contract.write.registerBaseModel(['', testModel.modelHash, testModel.metadata])
      ).to.be.rejected;
    });

    it('should reject empty hash', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await expect(
        contract.write.registerBaseModel([testModel.name, '', testModel.metadata])
      ).to.be.rejected;
    });

    it('should allow empty metadata', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await contract.write.registerBaseModel([testModel.name, testModel.modelHash, '']);

      const model = await contract.read.getModel([1n]);
      expect(model.metadata).to.equal('');
    });

    it('should increment model IDs', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await contract.write.registerBaseModel(['Model1', 'hash1', '']);
      await contract.write.registerBaseModel(['Model2', 'hash2', '']);
      await contract.write.registerBaseModel(['Model3', 'hash3', '']);

      const totalModels = await contract.read.getTotalModels();
      expect(totalModels).to.equal(3n);

      const model1 = await contract.read.getModel([1n]);
      const model2 = await contract.read.getModel([2n]);
      const model3 = await contract.read.getModel([3n]);

      expect(model1.name).to.equal('Model1');
      expect(model2.name).to.equal('Model2');
      expect(model3.name).to.equal('Model3');
    });
  });

  describe('Training Run Registration', function() {
    let baseModelId: bigint;

    beforeEach(async function() {
      // Register a base model first
      const contract = getRegistryContract(accounts.manufacturer1);
      await contract.write.registerBaseModel([
        'BaseModel',
        'QmBaseHash',
        '{"type": "base"}',
      ]);
      baseModelId = 1n;
    });

    it('should allow model owner to register training run', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const trainingInput = {
        inputModelId: baseModelId,
        outputName: 'FineTunedModel',
        outputHash: 'QmOutputHash',
        outputMetadata: '{"type": "finetuned"}',
        datasetUri: 'ipfs://QmDatasetUri',
        datasetHash: 'QmDatasetHash',
        hyperparamsHash: 'QmHyperparamsHash',
      };

      const metrics = {
        epochs: 10n,
        finalLoss: 50000n, // 0.05 scaled by 1e6
        finalAccuracy: 950000n, // 95% scaled by 1e6
        custom: '{"lr": 0.001}',
      };

      await contract.write.registerTrainingRun([trainingInput, metrics]);

      // Check output model was created
      const outputModel = await contract.read.getModel([2n]);
      expect(outputModel.name).to.equal('FineTunedModel');
      expect(outputModel.parentModelId).to.equal(baseModelId);

      // Check training run was recorded
      const run = await contract.read.getTrainingRun([1n]);
      expect(run.inputModelId).to.equal(baseModelId);
      expect(run.outputModelId).to.equal(2n);
      expect(run.datasetUri).to.equal('ipfs://QmDatasetUri');
    });

    it('should reject training run from non-owner', async function() {
      const contract = getRegistryContract(accounts.manufacturer2);

      const trainingInput = {
        inputModelId: baseModelId,
        outputName: 'FineTunedModel',
        outputHash: 'QmOutputHash',
        outputMetadata: '',
        datasetUri: 'ipfs://QmDatasetUri',
        datasetHash: 'QmDatasetHash',
        hyperparamsHash: 'QmHyperparamsHash',
      };

      const metrics = {
        epochs: 10n,
        finalLoss: 50000n,
        finalAccuracy: 950000n,
        custom: '',
      };

      await expect(
        contract.write.registerTrainingRun([trainingInput, metrics])
      ).to.be.rejected;
    });

    it('should reject zero epochs', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const trainingInput = {
        inputModelId: baseModelId,
        outputName: 'FineTunedModel',
        outputHash: 'QmOutputHash',
        outputMetadata: '',
        datasetUri: 'ipfs://QmDatasetUri',
        datasetHash: 'QmDatasetHash',
        hyperparamsHash: 'QmHyperparamsHash',
      };

      const metrics = {
        epochs: 0n,
        finalLoss: 50000n,
        finalAccuracy: 950000n,
        custom: '',
      };

      await expect(
        contract.write.registerTrainingRun([trainingInput, metrics])
      ).to.be.rejected;
    });

    it('should reject accuracy over 100%', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const trainingInput = {
        inputModelId: baseModelId,
        outputName: 'FineTunedModel',
        outputHash: 'QmOutputHash',
        outputMetadata: '',
        datasetUri: 'ipfs://QmDatasetUri',
        datasetHash: 'QmDatasetHash',
        hyperparamsHash: 'QmHyperparamsHash',
      };

      const metrics = {
        epochs: 10n,
        finalLoss: 50000n,
        finalAccuracy: 1000001n, // > 100%
        custom: '',
      };

      await expect(
        contract.write.registerTrainingRun([trainingInput, metrics])
      ).to.be.rejected;
    });

    it('should mint output model NFT to trainer', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      const trainingInput = {
        inputModelId: baseModelId,
        outputName: 'FineTunedModel',
        outputHash: 'QmOutputHash',
        outputMetadata: '',
        datasetUri: '',
        datasetHash: '',
        hyperparamsHash: '',
      };

      const metrics = {
        epochs: 10n,
        finalLoss: 50000n,
        finalAccuracy: 950000n,
        custom: '',
      };

      await contract.write.registerTrainingRun([trainingInput, metrics]);

      const outputOwner = await contract.read.ownerOf([2n]);
      expect(outputOwner.toLowerCase()).to.equal(accounts.manufacturer1.account.address.toLowerCase());
    });
  });

  describe('Model Lineage', function() {
    it('should track model lineage through multiple training runs', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      // Create base model (ID 1)
      await contract.write.registerBaseModel(['Base', 'hash1', '']);

      // First training run: Base -> Child1 (ID 2)
      await contract.write.registerTrainingRun([
        {
          inputModelId: 1n,
          outputName: 'Child1',
          outputHash: 'hash2',
          outputMetadata: '',
          datasetUri: '',
          datasetHash: '',
          hyperparamsHash: '',
        },
        { epochs: 5n, finalLoss: 100000n, finalAccuracy: 800000n, custom: '' },
      ]);

      // Second training run: Child1 -> Child2 (ID 3)
      await contract.write.registerTrainingRun([
        {
          inputModelId: 2n,
          outputName: 'Child2',
          outputHash: 'hash3',
          outputMetadata: '',
          datasetUri: '',
          datasetHash: '',
          hyperparamsHash: '',
        },
        { epochs: 10n, finalLoss: 50000n, finalAccuracy: 900000n, custom: '' },
      ]);

      // Get lineage for Child2
      const lineage = await contract.read.getModelLineage([3n]);
      expect(lineage.length).to.equal(3);
      expect(lineage[0]).to.equal(3n); // Child2
      expect(lineage[1]).to.equal(2n); // Child1
      expect(lineage[2]).to.equal(1n); // Base
    });

    it('should return single-element lineage for base model', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await contract.write.registerBaseModel(['Base', 'hash', '']);

      const lineage = await contract.read.getModelLineage([1n]);
      expect(lineage.length).to.equal(1);
      expect(lineage[0]).to.equal(1n);
    });
  });

  describe('Training Runs Query', function() {
    it('should track training runs by input model', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      // Create base model
      await contract.write.registerBaseModel(['Base', 'hash', '']);

      // Create multiple training runs from same base
      for (let i = 0; i < 3; i++) {
        await contract.write.registerTrainingRun([
          {
            inputModelId: 1n,
            outputName: `Child${i}`,
            outputHash: `hash${i}`,
            outputMetadata: '',
            datasetUri: '',
            datasetHash: '',
            hyperparamsHash: '',
          },
          { epochs: 5n, finalLoss: 100000n, finalAccuracy: 800000n, custom: '' },
        ]);
      }

      const runs = await contract.read.getTrainingRunsByInput([1n]);
      expect(runs.length).to.equal(3);
    });
  });

  describe('Batch Queries', function() {
    beforeEach(async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      // Create 5 base models
      for (let i = 1; i <= 5; i++) {
        await contract.write.registerBaseModel([`Model${i}`, `hash${i}`, '']);
      }
    });

    it('should return model batch', async function() {
      const contract = getRegistryContract(accounts.owner);

      const models = await contract.read.getModelBatch([1n, 3n]);
      expect(models.length).to.equal(3);
      expect(models[0].name).to.equal('Model1');
      expect(models[1].name).to.equal('Model2');
      expect(models[2].name).to.equal('Model3');
    });

    it('should handle batch past end of models', async function() {
      const contract = getRegistryContract(accounts.owner);

      const models = await contract.read.getModelBatch([4n, 10n]);
      expect(models.length).to.equal(2); // Only models 4 and 5 exist
    });

    it('should reject zero count', async function() {
      const contract = getRegistryContract(accounts.owner);

      await expect(
        contract.read.getModelBatch([1n, 0n])
      ).to.be.rejected;
    });

    it('should reject count over 100', async function() {
      const contract = getRegistryContract(accounts.owner);

      await expect(
        contract.read.getModelBatch([1n, 101n])
      ).to.be.rejected;
    });
  });

  describe('NFT Functionality', function() {
    beforeEach(async function() {
      const contract = getRegistryContract(accounts.manufacturer1);
      await contract.write.registerBaseModel(['TestModel', 'hash', '']);
    });

    it('should allow NFT transfer', async function() {
      const contract = getRegistryContract(accounts.manufacturer1);

      await contract.write.transferFrom([
        accounts.manufacturer1.account.address,
        accounts.manufacturer2.account.address,
        1n,
      ]);

      const newOwner = await contract.read.ownerOf([1n]);
      expect(newOwner.toLowerCase()).to.equal(accounts.manufacturer2.account.address.toLowerCase());
    });

    it('should allow new owner to use model for training', async function() {
      const mfr1Contract = getRegistryContract(accounts.manufacturer1);
      const mfr2Contract = getRegistryContract(accounts.manufacturer2);

      // Transfer model to manufacturer2
      await mfr1Contract.write.transferFrom([
        accounts.manufacturer1.account.address,
        accounts.manufacturer2.account.address,
        1n,
      ]);

      // New owner can register training run
      await mfr2Contract.write.registerTrainingRun([
        {
          inputModelId: 1n,
          outputName: 'FineTuned',
          outputHash: 'newhash',
          outputMetadata: '',
          datasetUri: '',
          datasetHash: '',
          hyperparamsHash: '',
        },
        { epochs: 5n, finalLoss: 50000n, finalAccuracy: 900000n, custom: '' },
      ]);

      // Output model owned by new owner
      const outputOwner = await mfr2Contract.read.ownerOf([2n]);
      expect(outputOwner.toLowerCase()).to.equal(accounts.manufacturer2.account.address.toLowerCase());
    });

    it('should prevent previous owner from using transferred model', async function() {
      const mfr1Contract = getRegistryContract(accounts.manufacturer1);

      // Transfer model to manufacturer2
      await mfr1Contract.write.transferFrom([
        accounts.manufacturer1.account.address,
        accounts.manufacturer2.account.address,
        1n,
      ]);

      // Previous owner cannot register training run
      await expect(
        mfr1Contract.write.registerTrainingRun([
          {
            inputModelId: 1n,
            outputName: 'FineTuned',
            outputHash: 'newhash',
            outputMetadata: '',
            datasetUri: '',
            datasetHash: '',
            hyperparamsHash: '',
          },
          { epochs: 5n, finalLoss: 50000n, finalAccuracy: 900000n, custom: '' },
        ])
      ).to.be.rejected;
    });
  });

  describe('Model Not Found', function() {
    it('should reject getModel for non-existent model', async function() {
      const contract = getRegistryContract(accounts.owner);

      await expect(contract.read.getModel([999n])).to.be.rejected;
    });

    it('should reject getTrainingRun for non-existent run', async function() {
      const contract = getRegistryContract(accounts.owner);

      await expect(contract.read.getTrainingRun([999n])).to.be.rejected;
    });

    it('should reject getModelLineage for non-existent model', async function() {
      const contract = getRegistryContract(accounts.owner);

      await expect(contract.read.getModelLineage([999n])).to.be.rejected;
    });
  });
});
