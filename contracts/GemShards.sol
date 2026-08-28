// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {IERC4906} from "./interfaces/IERC4906.sol";
import {IPublishFeeDistributor} from "./interfaces/IPublishFeeDistributor.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title Gem Shards
/// @notice 495 weighted shards for launchpad fee sharing. tokenURI is served via metadata API with live claimable ETN.
contract GemShards is ERC721, ERC2981, Ownable2Step, ReentrancyGuard, IERC4906 {
    uint256 public constant MAX_SUPPLY = 495;
    uint256 public constant PAID_MINT_PRICE = 10_000 ether;
    uint256 public constant ELECTROGEM_FREE_SUPPLY = 49;
    uint256 public constant DUAL_HOLDER_DISCOUNT_BPS = 5000;
    uint256 public constant PUBLIC_SALE_DELAY = 7 days;

    address public immutable electroGem;
    address public immutable clubWatch;
    uint256 public immutable publicSaleOpensAt;

    address public distributor;
    address public platformRecipient;
    bool public mintingEnabled;

    string private _baseTokenURI;
    uint256 private _nextTokenId = 1;

    mapping(uint256 => bool) public electroGemFreeMintClaimed;

    event DistributorUpdated(address distributor);
    event PlatformRecipientUpdated(address recipient);
    event BaseURIUpdated(string baseURI);
    event MintingEnabledUpdated(bool enabled);
    event ShardMinted(uint256 indexed tokenId, address indexed to, bool freeMint);

    constructor(
        address initialOwner,
        address platformRecipient_,
        string memory baseTokenURI_,
        address electroGem_,
        address clubWatch_
    ) ERC721("Gem Shards", "GSHARD") Ownable(initialOwner) {
        require(platformRecipient_ != address(0), "Invalid recipient");
        require(electroGem_ != address(0), "Invalid electro gem");
        require(clubWatch_ != address(0), "Invalid club watch");
        platformRecipient = platformRecipient_;
        electroGem = electroGem_;
        clubWatch = clubWatch_;
        publicSaleOpensAt = block.timestamp + PUBLIC_SALE_DELAY;
        _baseTokenURI = baseTokenURI_;
        _setDefaultRoyalty(initialOwner, 500);
    }

    function setDistributor(address distributor_) external onlyOwner {
        distributor = distributor_;
        emit DistributorUpdated(distributor_);
    }

    function setPlatformRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        platformRecipient = recipient;
        emit PlatformRecipientUpdated(recipient);
    }

    function setBaseURI(string calldata baseTokenURI_) external onlyOwner {
        _baseTokenURI = baseTokenURI_;
        emit BaseURIUpdated(baseTokenURI_);
    }

    function setMintingEnabled(bool enabled) external onlyOwner {
        mintingEnabled = enabled;
        emit MintingEnabledUpdated(enabled);
    }

    function isDualHolder(address account) public view returns (bool) {
        return
            IERC721Balance(electroGem).balanceOf(account) > 0 &&
            IERC721Balance(clubWatch).balanceOf(account) > 0;
    }

    function ownsElectroGem(address account) public view returns (bool) {
        return IERC721Balance(electroGem).balanceOf(account) > 0;
    }

    function totalMinted() public view returns (uint256) {
        return _nextTokenId > 0 ? _nextTokenId - 1 : 0;
    }

    function requiredPaidMintPrice(address payer) public view returns (uint256) {
        if (isDualHolder(payer)) {
            return (PAID_MINT_PRICE * (10_000 - DUAL_HOLDER_DISCOUNT_BPS)) / 10_000;
        }
        return PAID_MINT_PRICE;
    }

    function mintFree(uint256 electroGemTokenId) external nonReentrant returns (uint256 tokenId) {
        require(mintingEnabled, "Minting not enabled");
        require(electroGemTokenId >= 1 && electroGemTokenId <= ELECTROGEM_FREE_SUPPLY, "Invalid electro gem");
        require(!electroGemFreeMintClaimed[electroGemTokenId], "Free mint claimed");
        require(IERC721(electroGem).ownerOf(electroGemTokenId) == msg.sender, "Not electro gem owner");

        electroGemFreeMintClaimed[electroGemTokenId] = true;
        tokenId = _mintNext(msg.sender);
        emit ShardMinted(tokenId, msg.sender, true);
    }

    function mintPaid() external payable nonReentrant returns (uint256 tokenId) {
        require(mintingEnabled, "Minting not enabled");
        if (block.timestamp < publicSaleOpensAt) {
            require(ownsElectroGem(msg.sender), "ElectroGem holders only");
        }

        uint256 price = requiredPaidMintPrice(msg.sender);
        require(msg.value >= price, "Insufficient payment");

        tokenId = _mintNext(msg.sender);

        (bool sent, ) = platformRecipient.call{value: msg.value}("");
        require(sent, "Payment failed");

        emit ShardMinted(tokenId, msg.sender, false);
    }

    function notifyMetadataUpdate(uint256 tokenId) external {
        require(msg.sender == distributor, "Only distributor");
        emit MetadataUpdate(tokenId);
    }

    function notifyMetadataBatchUpdate(uint256 fromTokenId, uint256 toTokenId) external {
        require(msg.sender == distributor, "Only distributor");
        emit BatchMetadataUpdate(fromTokenId, toTokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    function _mintNext(address to) private returns (uint256 tokenId) {
        require(_nextTokenId <= MAX_SUPPLY, "Sold out");
        tokenId = _nextTokenId;
        _nextTokenId++;
        _safeMint(to, tokenId);
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        address updated = super._update(to, tokenId, auth);
        if (distributor != address(0) && from != to) {
            IPublishFeeDistributor(distributor).onShardTransfer(tokenId, from, to);
        }
        return updated;
    }
}
