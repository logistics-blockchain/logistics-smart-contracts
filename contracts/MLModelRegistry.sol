// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MLModelRegistry
 * @dev ERC-721 based registry for ML models with training run lineage tracking
 * Each model is an NFT owned by its creator, with provenance chain via parentModelId
 */
contract MLModelRegistry is ERC721, Ownable {

    struct Model {
        uint256 id;
        string name;
        uint256 parentModelId;      // 0 = base model
        string modelHash;           // IPFS hash or storage link
        string metadata;            // Optional JSON metadata
        uint256 createdAt;
    }

    struct Metrics {
        uint256 epochs;
        uint256 finalLoss;          // Scaled by 1e6
        uint256 finalAccuracy;      // Scaled by 1e6, max 1000000 = 100%
        string custom;              // JSON for additional metrics
    }

    struct TrainingRun {
        uint256 id;
        uint256 inputModelId;
        uint256 outputModelId;
        string datasetUri;
        string datasetHash;
        string hyperparamsHash;
        Metrics metrics;
        address trainer;
        uint256 timestamp;
    }

    // Input struct to avoid stack too deep
    struct TrainingRunInput {
        uint256 inputModelId;
        string outputName;
        string outputHash;
        string outputMetadata;
        string datasetUri;
        string datasetHash;
        string hyperparamsHash;
    }

    mapping(uint256 => Model) private _models;
    mapping(uint256 => TrainingRun) private _runs;
    mapping(uint256 => uint256[]) private _modelRuns;

    uint256 private _nextModelId;
    uint256 private _nextRunId;

    event ModelRegistered(uint256 indexed modelId, address indexed owner, string name, uint256 parentModelId);
    event TrainingRunRegistered(uint256 indexed runId, uint256 indexed inputModelId, uint256 indexed outputModelId, address trainer);

    constructor() ERC721("MLModelRegistry", "MLMODEL") {
        _nextModelId = 1;
        _nextRunId = 1;
    }

    /**
     * @dev Register a new base model (no parent)
     * @param name Model name
     * @param modelHash IPFS hash or storage link
     * @param metadata Optional JSON metadata
     * @return modelId The ID of the newly registered model
     */
    function registerBaseModel(
        string calldata name,
        string calldata modelHash,
        string calldata metadata
    ) external returns (uint256) {
        require(bytes(name).length > 0, "Name cannot be empty");
        require(bytes(modelHash).length > 0, "Hash cannot be empty");

        uint256 modelId = _nextModelId++;

        _models[modelId] = Model({
            id: modelId,
            name: name,
            parentModelId: 0,
            modelHash: modelHash,
            metadata: metadata,
            createdAt: block.timestamp
        });

        _safeMint(msg.sender, modelId);

        emit ModelRegistered(modelId, msg.sender, name, 0);

        return modelId;
    }

    /**
     * @dev Register a training run, creating a new output model
     * @param input Training run input parameters
     * @param metrics Training metrics
     * @return runId The ID of the training run
     * @return outputModelId The ID of the newly created output model
     */
    function registerTrainingRun(
        TrainingRunInput calldata input,
        Metrics calldata metrics
    ) external returns (uint256 runId, uint256 outputModelId) {
        require(_ownerOf(input.inputModelId) == msg.sender, "Not model owner");
        require(bytes(input.outputName).length > 0, "Name cannot be empty");
        require(bytes(input.outputHash).length > 0, "Hash cannot be empty");
        require(metrics.epochs > 0, "Epochs must be > 0");
        require(metrics.finalAccuracy <= 1000000, "Accuracy > 100%");

        outputModelId = _nextModelId++;
        runId = _nextRunId++;

        // Create output model
        _models[outputModelId] = Model({
            id: outputModelId,
            name: input.outputName,
            parentModelId: input.inputModelId,
            modelHash: input.outputHash,
            metadata: input.outputMetadata,
            createdAt: block.timestamp
        });

        // Create training run record
        _runs[runId] = TrainingRun({
            id: runId,
            inputModelId: input.inputModelId,
            outputModelId: outputModelId,
            datasetUri: input.datasetUri,
            datasetHash: input.datasetHash,
            hyperparamsHash: input.hyperparamsHash,
            metrics: metrics,
            trainer: msg.sender,
            timestamp: block.timestamp
        });

        // Track runs by input model
        _modelRuns[input.inputModelId].push(runId);

        // Mint output model NFT to trainer
        _safeMint(msg.sender, outputModelId);

        emit ModelRegistered(outputModelId, msg.sender, input.outputName, input.inputModelId);
        emit TrainingRunRegistered(runId, input.inputModelId, outputModelId, msg.sender);
    }

    /**
     * @dev Get model details
     */
    function getModel(uint256 modelId) external view returns (Model memory) {
        require(_models[modelId].id != 0, "Model not found");
        return _models[modelId];
    }

    /**
     * @dev Get training run details
     */
    function getTrainingRun(uint256 runId) external view returns (TrainingRun memory) {
        require(_runs[runId].id != 0, "Run not found");
        return _runs[runId];
    }

    /**
     * @dev Get model lineage (array of ancestor model IDs)
     * Returns [modelId, parentId, grandparentId, ...] up to 100 ancestors
     */
    function getModelLineage(uint256 modelId) external view returns (uint256[] memory) {
        require(_models[modelId].id != 0, "Model not found");

        // First pass: count depth
        uint256 depth = 0;
        uint256 current = modelId;
        while (current != 0 && depth < 100) {
            depth++;
            current = _models[current].parentModelId;
        }

        // Second pass: build array
        uint256[] memory lineage = new uint256[](depth);
        current = modelId;
        for (uint256 i = 0; i < depth; i++) {
            lineage[i] = current;
            current = _models[current].parentModelId;
        }

        return lineage;
    }

    /**
     * @dev Get all training runs that used a model as input
     */
    function getTrainingRunsByInput(uint256 modelId) external view returns (uint256[] memory) {
        return _modelRuns[modelId];
    }

    /**
     * @dev Batch get models
     */
    function getModelBatch(uint256 startId, uint256 count) external view returns (Model[] memory) {
        require(count > 0 && count <= 100, "Count 1-100");

        uint256 endId = startId + count;
        if (endId > _nextModelId) endId = _nextModelId;

        uint256 len = endId > startId ? endId - startId : 0;
        Model[] memory result = new Model[](len);

        for (uint256 i = 0; i < len; i++) {
            result[i] = _models[startId + i];
        }

        return result;
    }

    /**
     * @dev Batch get training runs
     */
    function getRunBatch(uint256 startId, uint256 count) external view returns (TrainingRun[] memory) {
        require(count > 0 && count <= 100, "Count 1-100");

        uint256 endId = startId + count;
        if (endId > _nextRunId) endId = _nextRunId;

        uint256 len = endId > startId ? endId - startId : 0;
        TrainingRun[] memory result = new TrainingRun[](len);

        for (uint256 i = 0; i < len; i++) {
            result[i] = _runs[startId + i];
        }

        return result;
    }

    /**
     * @dev Get total number of models registered
     */
    function getTotalModels() external view returns (uint256) {
        return _nextModelId - 1;
    }

    /**
     * @dev Get total number of training runs registered
     */
    function getTotalRuns() external view returns (uint256) {
        return _nextRunId - 1;
    }
}
