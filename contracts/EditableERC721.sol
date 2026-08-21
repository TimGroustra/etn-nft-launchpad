// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IEditableERC721 {
    struct BurnConfig {
        uint256 clubBurnAmount;
        bool burnOnMint;
        bool burnOnResale;
    }
}

contract EditableERC721 is ERC721URIStorage, ERC2981, Ownable2Step, IEditableERC721 {
    IERC20 public immutable clubToken;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    BurnConfig public burnConfig;
    uint256 public maxSupply;
    uint256 private _nextTokenId;
    string private _baseTokenURI;

    event BaseURIUpdated(string newBaseURI);
    event BurnConfigUpdated(BurnConfig config);
    event Withdrawn(address indexed owner, uint256 amount);
    event ERC20Withdrawn(address indexed owner, address indexed token, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner,
        address clubToken_,
        BurnConfig memory config_,
        uint256 maxSupply_
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        clubToken = IERC20(clubToken_);
        burnConfig = config_;
        maxSupply = maxSupply_;
        _nextTokenId = 1;
        _setDefaultRoyalty(initialOwner, 500);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setTokenURI(uint256 tokenId, string calldata uri) external onlyOwner {
        _requireOwned(tokenId);
        _setTokenURI(tokenId, uri);
    }

    function batchSetTokenURI(uint256[] calldata tokenIds, string[] calldata uris) external onlyOwner {
        require(tokenIds.length == uris.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _requireOwned(tokenIds[i]);
            _setTokenURI(tokenIds[i], uris[i]);
        }
    }

    function setBurnConfig(BurnConfig calldata config_) external onlyOwner {
        burnConfig = config_;
        emit BurnConfigUpdated(config_);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function mint(address to, string calldata uri) external onlyOwner returns (uint256) {
        return _mintWithURI(to, uri);
    }

    function batchMint(address[] calldata recipients, string[] calldata uris) external onlyOwner returns (uint256[] memory) {
        require(recipients.length == uris.length, "Length mismatch");
        uint256[] memory tokenIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            tokenIds[i] = _mintWithURI(recipients[i], uris[i]);
        }
        return tokenIds;
    }

    function publicMint(string calldata uri) external returns (uint256) {
        return _mintWithURI(msg.sender, uri);
    }

    function _mintWithURI(address to, string calldata uri) internal returns (uint256) {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        if (burnConfig.burnOnMint && burnConfig.clubBurnAmount > 0) {
            clubToken.transferFrom(to, DEAD, burnConfig.clubBurnAmount);
        }
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && burnConfig.burnOnResale && burnConfig.clubBurnAmount > 0) {
            clubToken.transferFrom(to, DEAD, burnConfig.clubBurnAmount);
        }
        return super._update(to, tokenId, auth);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice Withdraw native ETN accrued in the contract (royalties, mint fees, etc.) to the collection owner.
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        address recipient = owner();
        (bool sent, ) = recipient.call{value: balance}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(recipient, balance);
    }

    /// @notice Withdraw ERC20 tokens sent to the contract to the collection owner.
    function withdrawERC20(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        address recipient = owner();
        IERC20(token).transfer(recipient, balance);
        emit ERC20Withdrawn(recipient, token, balance);
    }

    receive() external payable {}

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
