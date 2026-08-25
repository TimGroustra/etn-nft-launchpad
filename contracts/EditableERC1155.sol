// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETN, ISwapRouterV3} from "./interfaces/IClubSwap.sol";
import {IMintable} from "./interfaces/IMintable.sol";
import {ILaunchpadCollection} from "./interfaces/ILaunchpadCollection.sol";

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice ERC-1155 launchpad collection with edition caps and ERC-4906 metadata events.
contract EditableERC1155 is
    ERC1155,
    ERC2981,
    Ownable2Step,
    ReentrancyGuard,
    ILaunchpadCollection,
    IMintable
{
    uint24 private constant POOL_FEE = 3000;

    IERC20 public immutable clubToken;
    address public immutable WETN;
    ISwapRouterV3 public immutable swapRouter;
    address public immutable platformTreasury;
    uint96 public immutable platformMintFeeBps;
    address public immutable electroGemsCollection;
    address public immutable clubWatchCollection;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    BurnConfig public burnConfig;
    uint256 public maxSupply;
    uint256 public mintPrice;
    uint256 public maxMintPerWallet;
    bool public isMintable;
    string private _name;
    string private _symbol;
    string private _baseTokenURI;
    bool private _suppressRoyaltyBurn;

    uint256 private _nextTokenId;
    mapping(uint256 => uint256) public editionCap;
    mapping(uint256 => uint256) public editionMinted;
    mapping(uint256 => string) private _tokenURISuffix;
    mapping(address => uint256) private _publicMintCount;

    event BaseURIUpdated(string newBaseURI);
    event BurnConfigUpdated(BurnConfig config);
    event MintPriceUpdated(uint256 newPrice);
    event MintableStatusUpdated(bool isMintable);
    event MaxMintPerWalletUpdated(uint256 maxMintPerWallet);
    event ClubBurned(uint256 clubBurned, uint256 etnUsed);
    event Withdrawn(address indexed owner, uint256 amount);
    event ERC20Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event EditionCapUpdated(uint256 indexed tokenId, uint256 cap);
    event EditionMinted(address indexed minter, uint256 indexed tokenId, uint256 amount);
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory uri_,
        address initialOwner,
        address clubToken_,
        address wetn_,
        address swapRouter_,
        BurnConfig memory config_,
        uint256 maxSupply_,
        uint96 defaultRoyaltyBps_,
        address platformTreasury_,
        uint96 platformMintFeeBps_,
        address electroGems_,
        address clubWatch_
    ) ERC1155(uri_) Ownable(initialOwner) {
        require(bytes(name_).length > 0, "Name required");
        require(bytes(symbol_).length > 0, "Symbol required");
        require(config_.royaltyBurnBps <= 10_000, "Invalid royalty burn bps");
        require(config_.mintBurnBps <= 10_000, "Invalid mint burn bps");
        require(defaultRoyaltyBps_ <= 10_000, "Invalid royalty bps");
        require(platformMintFeeBps_ <= 10_000, "Invalid platform mint fee bps");
        clubToken = IERC20(clubToken_);
        WETN = wetn_;
        swapRouter = ISwapRouterV3(swapRouter_);
        platformTreasury = platformTreasury_;
        platformMintFeeBps = platformMintFeeBps_;
        electroGemsCollection = electroGems_;
        clubWatchCollection = clubWatch_;
        _name = name_;
        _symbol = symbol_;
        burnConfig = config_;
        maxSupply = maxSupply_;
        _nextTokenId = 1;
        isMintable = false;
        _setDefaultRoyalty(address(this), defaultRoyaltyBps_);
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function symbol() public view returns (string memory) {
        return _symbol;
    }

    function setMintable(bool mintable_) external onlyOwner {
        isMintable = mintable_;
        emit MintableStatusUpdated(mintable_);
    }

    function setMaxMintPerWallet(uint256 maxMintPerWallet_) external onlyOwner {
        maxMintPerWallet = maxMintPerWallet_;
        emit MaxMintPerWalletUpdated(maxMintPerWallet_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        if (_nextTokenId > 1) {
            emit BatchMetadataUpdate(1, _nextTokenId - 1);
        }
        emit BaseURIUpdated(baseURI_);
    }

    function setEditionCap(uint256 tokenId, uint256 cap) external onlyOwner {
        require(tokenId > 0 && tokenId <= maxSupply, "Invalid token id");
        require(cap > 0, "Invalid cap");
        editionCap[tokenId] = cap;
        emit EditionCapUpdated(tokenId, cap);
    }

    function setTokenURI(uint256 tokenId, string calldata tokenUri) external onlyOwner {
        require(tokenId > 0 && tokenId <= maxSupply, "Invalid token id");
        _tokenURISuffix[tokenId] = tokenUri;
        emit MetadataUpdate(tokenId);
    }

    function batchSetTokenURI(uint256[] calldata tokenIds, string[] calldata uris) external onlyOwner {
        require(tokenIds.length == uris.length, "Length mismatch");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(tokenIds[i] > 0 && tokenIds[i] <= maxSupply, "Invalid token id");
            _tokenURISuffix[tokenIds[i]] = uris[i];
            emit MetadataUpdate(tokenIds[i]);
        }
    }

    function setBurnConfig(BurnConfig calldata config_) external onlyOwner {
        require(config_.royaltyBurnBps <= 10_000, "Invalid royalty burn bps");
        require(config_.mintBurnBps <= 10_000, "Invalid mint burn bps");
        burnConfig = config_;
        emit BurnConfigUpdated(config_);
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
        emit MintPriceUpdated(price);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function ownerMint(
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenUri
    ) external onlyOwner returns (uint256) {
        return _mintEdition(to, tokenId, amount, tokenUri);
    }

    function batchMint(
        address to,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts,
        string[] calldata uris
    ) external onlyOwner returns (uint256[] memory) {
        require(tokenIds.length == amounts.length && tokenIds.length == uris.length, "Length mismatch");
        uint256[] memory mintedIds = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; i++) {
            mintedIds[i] = _mintEdition(to, tokenIds[i], amounts[i], uris[i]);
        }
        return mintedIds;
    }

    function mintableCount(address account) public view returns (uint256) {
        if (!isMintable || mintPrice == 0) return 0;
        uint256 remainingIds = maxSupply - (_nextTokenId - 1);
        if (remainingIds == 0) return 0;
        if (maxMintPerWallet == 0) return remainingIds;
        uint256 mintedByWallet = _publicMintCount[account];
        if (mintedByWallet >= maxMintPerWallet) return 0;
        uint256 walletRemaining = maxMintPerWallet - mintedByWallet;
        return walletRemaining < remainingIds ? walletRemaining : remainingIds;
    }

    function requiredMintPayment(address minter, uint256 mintCount) public view returns (uint256) {
        if (!isMintable || mintPrice == 0 || mintCount == 0) return 0;
        uint256 base = mintPrice * mintCount;
        if (_isPlatformFeeExempt(minter)) return base;
        return base + (base * uint256(platformMintFeeBps)) / 10_000;
    }

    function mint(uint256 mintCount) external payable nonReentrant {
        require(isMintable, "Sale not active");
        require(mintCount > 0, "Quantity zero");
        require(bytes(_baseTokenURI).length > 0, "Base URI required");
        require(mintCount <= mintableCount(msg.sender), "Exceeds mintable count");

        uint256 required = requiredMintPayment(msg.sender, mintCount);
        require(msg.value >= required, "Insufficient payment");

        uint256 firstTokenId = _nextTokenId;
        _mintSequential(msg.sender, mintCount);
        if (firstTokenId < _nextTokenId) {
            emit BatchMetadataUpdate(firstTokenId, _nextTokenId - 1);
        }

        _publicMintCount[msg.sender] += mintCount;
        _settleMintPayment(mintCount, required);
    }

    /// @notice Public mint of a specific ERC-1155 type (token ID) and quantity.
    function supportsMintEdition() external pure returns (bool) {
        return true;
    }

    function mintEdition(uint256 tokenId, uint256 amount) external payable nonReentrant {
        require(isMintable, "Sale not active");
        require(tokenId > 0 && tokenId <= maxSupply, "Invalid token id");
        require(amount > 0, "Quantity zero");
        require(editionCap[tokenId] > 0, "Type not listed");
        require(editionMinted[tokenId] + amount <= editionCap[tokenId], "Exceeds edition cap");
        require(bytes(_baseTokenURI).length > 0, "Base URI required");

        if (maxMintPerWallet > 0) {
            require(_publicMintCount[msg.sender] + amount <= maxMintPerWallet, "Exceeds wallet limit");
        }

        uint256 required = requiredMintPayment(msg.sender, amount);
        require(msg.value >= required, "Insufficient payment");

        if (bytes(_tokenURISuffix[tokenId]).length == 0) {
            _tokenURISuffix[tokenId] = _composeMetadataSuffix(tokenId);
        }

        editionMinted[tokenId] += amount;
        _mint(msg.sender, tokenId, amount, "");
        emit MetadataUpdate(tokenId);
        emit EditionMinted(msg.sender, tokenId, amount);

        _publicMintCount[msg.sender] += amount;
        _settleMintPayment(amount, required);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        require(tokenId > 0 && tokenId <= maxSupply, "Invalid token id");
        string memory suffix = _tokenURISuffix[tokenId];
        if (bytes(suffix).length == 0) {
            suffix = string(abi.encodePacked(Strings.toString(tokenId), ".json"));
        }
        return bytes(_baseTokenURI).length > 0 ? string(abi.encodePacked(_baseTokenURI, suffix)) : super.uri(tokenId);
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function feeReceiver() external view returns (address) {
        return owner();
    }

    function MAX_SUPPLY() external view returns (uint256) {
        return maxSupply;
    }

    function MAX_MINT_PER_WALLET() external view returns (uint256) {
        return maxMintPerWallet;
    }

    function PRICE() external view returns (uint256) {
        return mintPrice;
    }

    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        address recipient = owner();
        (bool sent, ) = recipient.call{value: balance}("");
        require(sent, "Withdraw failed");
        emit Withdrawn(recipient, balance);
    }

    function withdrawERC20(address token) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance");
        address recipient = owner();
        IERC20(token).transfer(recipient, balance);
        emit ERC20Withdrawn(recipient, token, balance);
    }

    receive() external payable {
        if (msg.sender == WETN || _suppressRoyaltyBurn) return;
        _processRoyaltyPayment(msg.value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    function _mintSequential(address to, uint256 mintCount) internal {
        for (uint256 i = 0; i < mintCount; i++) {
            uint256 tokenId = _nextTokenId;
            require(tokenId <= maxSupply, "Max supply reached");
            editionCap[tokenId] = 1;
            editionMinted[tokenId] = 1;
            _tokenURISuffix[tokenId] = _composeMetadataSuffix(tokenId);
            _mint(to, tokenId, 1, "");
            _nextTokenId++;
        }
    }

    function _mintEdition(
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenUri
    ) internal returns (uint256) {
        require(tokenId > 0 && tokenId <= maxSupply, "Invalid token id");
        require(amount > 0, "Amount zero");

        uint256 cap = editionCap[tokenId];
        if (cap == 0) {
            editionCap[tokenId] = amount;
        } else {
            require(editionMinted[tokenId] + amount <= cap, "Exceeds edition cap");
        }

        editionMinted[tokenId] += amount;
        if (bytes(tokenUri).length > 0) {
            _tokenURISuffix[tokenId] = tokenUri;
        }
        if (tokenId >= _nextTokenId) {
            _nextTokenId = tokenId + 1;
        }
        _mint(to, tokenId, amount, "");
        emit MetadataUpdate(tokenId);
        return tokenId;
    }

    function _settleMintPayment(uint256 mintCount, uint256 required) internal {
        uint256 base = mintPrice * mintCount;
        if (burnConfig.burnOnMint && burnConfig.mintBurnBps > 0) {
            uint256 burnEtn = (base * uint256(burnConfig.mintBurnBps)) / 10_000;
            _swapEtnForClubBurn(burnEtn);
        }

        uint256 platformFee = required - base;
        if (platformFee > 0) {
            (bool sentFee, ) = platformTreasury.call{value: platformFee}("");
            require(sentFee, "Platform fee transfer failed");
        }

        uint256 excess = msg.value - required;
        if (excess > 0) {
            (bool sent, ) = payable(msg.sender).call{value: excess}("");
            require(sent, "Refund failed");
        }
    }

    function _composeMetadataSuffix(uint256 metadataIndex) internal pure returns (string memory) {
        return string(abi.encodePacked(Strings.toString(metadataIndex), ".json"));
    }

    function _isPlatformFeeExempt(address account) internal view returns (bool) {
        if (platformMintFeeBps == 0 || platformTreasury == address(0)) return true;
        if (electroGemsCollection != address(0) && IERC721Balance(electroGemsCollection).balanceOf(account) > 0) {
            return true;
        }
        if (clubWatchCollection != address(0) && IERC721Balance(clubWatchCollection).balanceOf(account) > 0) {
            return true;
        }
        return false;
    }

    function _canSwap() private view returns (bool) {
        return address(swapRouter) != address(0) && WETN != address(0);
    }

    function _refundWetn() private {
        uint256 wetnBal = IWETN(WETN).balanceOf(address(this));
        if (wetnBal == 0) return;
        _suppressRoyaltyBurn = true;
        IWETN(WETN).withdraw(wetnBal);
        _suppressRoyaltyBurn = false;
    }

    function _swapWetnForClub(uint256 wetnAmount) private returns (uint256 clubOut) {
        if (wetnAmount == 0) return 0;
        IWETN(WETN).approve(address(swapRouter), wetnAmount);
        ISwapRouterV3.ExactInputParams memory params = ISwapRouterV3.ExactInputParams({
            path: abi.encodePacked(WETN, POOL_FEE, address(clubToken)),
            recipient: DEAD,
            amountIn: wetnAmount,
            amountOutMinimum: 0
        });
        return swapRouter.exactInput(params);
    }

    function _swapEtnForClubBurn(uint256 etnAmount) private returns (uint256 clubOut) {
        if (etnAmount == 0 || !_canSwap()) return 0;

        IWETN(WETN).deposit{value: etnAmount}();
        clubOut = _swapWetnForClub(etnAmount);
        _refundWetn();

        if (clubOut > 0) emit ClubBurned(clubOut, etnAmount);
        return clubOut;
    }

    function _processRoyaltyPayment(uint256 amount) private {
        if (amount == 0 || burnConfig.royaltyBurnBps == 0) return;
        uint256 burnEtn = (amount * uint256(burnConfig.royaltyBurnBps)) / 10_000;
        _swapEtnForClubBurn(burnEtn);
    }
}
