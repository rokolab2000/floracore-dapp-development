// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./OfficialRegistry.sol";
import "./FloracoreSBT.sol";

/**
 * @title FloracoreRecords
 * @dev Manages medical records and certificates for pets
 */
contract FloracoreRecords is Ownable {
    OfficialRegistry public registry;
    FloracoreSBT public sbtContract;
    
    // Structure for a medical record
    struct Record {
        string recordType;      // e.g., "Vaccination", "Medical Certificate", "Travel Certificate"
        string ipfsHash;        // IPFS hash of the document
        address addedBy;        // Veterinarian who added the record
        uint256 timestamp;      // When the record was added
    }
    
    // Mapping from microchip ID to array of records
    mapping(uint256 => Record[]) public petRecords;
    
    // Events
    event RecordAdded(
        uint256 indexed microchipId,
        string recordType,
        string ipfsHash,
        address indexed addedBy,
        uint256 timestamp
    );
    
    constructor(address _registryAddress, address _sbtAddress) Ownable(msg.sender) {
        registry = OfficialRegistry(_registryAddress);
        sbtContract = FloracoreSBT(_sbtAddress);
    }
    
    /**
     * @dev Add a new record for a pet
     * @param _microchipId Microchip number (tokenId)
     * @param _recordType Type of record (e.g., "Vaccination", "Travel Certificate")
     * @param _ipfsHash IPFS hash of the document
     */
    function addRecord(
        uint256 _microchipId,
        string memory _recordType,
        string memory _ipfsHash
    ) external {
        require(registry.isVeterinarian(msg.sender), "Only authorized veterinarians can add records");
        require(sbtContract.isPetRegistered(_microchipId), "Pet not registered");
        require(bytes(_recordType).length > 0, "Record type cannot be empty");
        require(bytes(_ipfsHash).length > 0, "IPFS hash cannot be empty");
        
        Record memory newRecord = Record({
            recordType: _recordType,
            ipfsHash: _ipfsHash,
            addedBy: msg.sender,
            timestamp: block.timestamp
        });
        
        petRecords[_microchipId].push(newRecord);
        
        emit RecordAdded(_microchipId, _recordType, _ipfsHash, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Get all records for a pet
     * @param _microchipId Microchip number
     * @return Record[] Array of all records
     */
    function getRecords(uint256 _microchipId) external view returns (Record[] memory) {
        require(sbtContract.isPetRegistered(_microchipId), "Pet not registered");
        return petRecords[_microchipId];
    }
    
    /**
     * @dev Get the number of records for a pet
     * @param _microchipId Microchip number
     * @return uint256 Number of records
     */
    function getRecordCount(uint256 _microchipId) external view returns (uint256) {
        return petRecords[_microchipId].length;
    }
    
    /**
     * @dev Get a specific record by index
     * @param _microchipId Microchip number
     * @param _index Index of the record
     * @return Record The record at the specified index
     */
    function getRecordByIndex(uint256 _microchipId, uint256 _index) external view returns (Record memory) {
        require(_index < petRecords[_microchipId].length, "Index out of bounds");
        return petRecords[_microchipId][_index];
    }
}
