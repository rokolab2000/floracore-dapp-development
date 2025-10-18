// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OfficialRegistry
 * @dev Manages authorized veterinarians who can mint SBTs and add records
 */
contract OfficialRegistry is Ownable {
    // Mapping to track authorized veterinarians
    mapping(address => bool) public isVeterinarian;
    
    // Array to keep track of all veterinarians for enumeration
    address[] public veterinarians;
    
    // Events
    event VeterinarianAdded(address indexed veterinarian);
    event VeterinarianRevoked(address indexed veterinarian);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Add a new authorized veterinarian
     * @param _veterinarian Address of the veterinarian to authorize
     */
    function addVeterinarian(address _veterinarian) external onlyOwner {
        require(_veterinarian != address(0), "Invalid address");
        require(!isVeterinarian[_veterinarian], "Already authorized");
        
        isVeterinarian[_veterinarian] = true;
        veterinarians.push(_veterinarian);
        
        emit VeterinarianAdded(_veterinarian);
    }
    
    /**
     * @dev Revoke authorization from a veterinarian
     * @param _veterinarian Address of the veterinarian to revoke
     */
    function revokeVeterinarian(address _veterinarian) external onlyOwner {
        require(isVeterinarian[_veterinarian], "Not authorized");
        
        isVeterinarian[_veterinarian] = false;
        
        emit VeterinarianRevoked(_veterinarian);
    }
    
    /**
     * @dev Check if an address is an authorized veterinarian
     * @param _address Address to check
     * @return bool True if authorized, false otherwise
     */
    function checkVeterinarian(address _address) external view returns (bool) {
        return isVeterinarian[_address];
    }
    
    /**
     * @dev Get all veterinarians
     * @return address[] Array of all veterinarian addresses
     */
    function getAllVeterinarians() external view returns (address[] memory) {
        return veterinarians;
    }
}
