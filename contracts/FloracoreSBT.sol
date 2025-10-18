// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./OfficialRegistry.sol";

/**
 * @title FloracoreSBT
 * @dev Soulbound Token (SBT) for pet digital identity
 * Each token represents a unique pet identified by their microchip number
 */
contract FloracoreSBT is ERC721, ERC721URIStorage, Ownable {
    OfficialRegistry public registry;
    
    // Mapping from microchip number to owner address
    mapping(uint256 => address) public microchipToOwner;
    
    // Mapping to check if a microchip has been registered
    mapping(uint256 => bool) public microchipRegistered;
    
    // Events
    event PetRegistered(uint256 indexed microchipId, address indexed owner, string metadataURI);
    
    constructor(address _registryAddress) ERC721("Floracore Pet Passport", "PAWSPORT") Ownable(msg.sender) {
        registry = OfficialRegistry(_registryAddress);
    }
    
    /**
     * @dev Mint a new SBT for a pet
     * @param _microchipId 15-digit microchip number (used as tokenId)
     * @param _owner Address of the pet owner
     * @param _metadataURI IPFS URI containing pet metadata
     */
    function mintPetPassport(
        uint256 _microchipId,
        address _owner,
        string memory _metadataURI
    ) external {
        require(registry.isVeterinarian(msg.sender), "Only authorized veterinarians can mint");
        require(_owner != address(0), "Invalid owner address");
        require(!microchipRegistered[_microchipId], "Microchip already registered");
        require(_microchipId >= 100000000000000 && _microchipId <= 999999999999999, "Invalid microchip format");
        
        microchipRegistered[_microchipId] = true;
        microchipToOwner[_microchipId] = _owner;
        
        _safeMint(_owner, _microchipId);
        _setTokenURI(_microchipId, _metadataURI);
        
        emit PetRegistered(_microchipId, _owner, _metadataURI);
    }
    
    /**
     * @dev Override to make tokens non-transferable (Soulbound)
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0)) but prevent transfers
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: Token cannot be transferred");
        }
        
        return super._update(to, tokenId, auth);
    }
    
    /**
     * @dev Check if a microchip is registered
     * @param _microchipId Microchip number to check
     * @return bool True if registered, false otherwise
     */
    function isPetRegistered(uint256 _microchipId) external view returns (bool) {
        return microchipRegistered[_microchipId];
    }
    
    /**
     * @dev Get pet owner by microchip
     * @param _microchipId Microchip number
     * @return address Owner address
     */
    function getPetOwner(uint256 _microchipId) external view returns (address) {
        require(microchipRegistered[_microchipId], "Pet not registered");
        return microchipToOwner[_microchipId];
    }
    
    // Required overrides
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
