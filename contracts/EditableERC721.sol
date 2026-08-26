// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETN, ISwapRouterV3} from "./interfaces/IClubSwap.sol";
import {IMintable} from "./interfaces/IMintable.sol";

interface IEditableERC721 {
    struct BurnConfig {
        uint96 mintBurnBps;
        bool burnOnMint;
        uint96 royaltyBurnBps;
    }
}

interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice ETN mint/royalty proceeds are wrapped to WETN and swapped for CLUB, then sent to the burn address.
/// @dev Public mint uses the standard IMintable interface supported by NFT marketplaces (e.g. ElectroSwap).
contract EditableERC721 is ERC721URIStorage, ERC2981, Ownable2Step, ReentrancyGuard, IEditableERC721, IMintable {
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
    bool public randomPublicMint;
    uint256 private _nextTokenId;
    string private _baseTokenURI;
    bool private _suppressRoyaltyBurn;

    mapping(uint256 => bool) private _metadataIndexUsed;
    uint256[] private _availableMetadataIds;
    bool private _publicMintPoolReady;

    event BaseURIUpdated(string newBaseURI);
    event BurnConfigUpdated(BurnConfig config);
    event MintPriceUpdated(uint256 newPrice);
    event MintableStatusUpdated(bool isMintable);
    event MaxMintPerWalletUpdated(uint256 maxMintPerWallet);
    event ClubBurned(uint256 clubBurned, uint256 etnUsed);
    event Withdrawn(address indexed owner, uint256 amount);
    event ERC20Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event PublicMintAssigned(uint256 indexed tokenId, uint256 indexed metadataIndex);
    event RandomPublicMintUpdated(bool randomPublicMint);

    constructor(
        string memory name_,
        string memory symbol_,
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
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
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
        burnConfig = config_;
        maxSupply = maxSupply_;
        _nextTokenId = 1;
        isMintable = false;
        _setDefaultRoyalty(address(this), defaultRoyaltyBps_);
    }

    function setMintable(bool mintable_) external onlyOwner {
        if (mintable_ && mintPrice > 0 && randomPublicMint) {
            _ensurePublicMintPool();
        }
        isMintable = mintable_;
        emit MintableStatusUpdated(mintable_);
    }

    /// @notice When enabled, public mint assigns metadata randomly at mint time (anti-snipe). Set before enabling sales.
    function setRandomPublicMint(bool random_) external onlyOwner {
        require(_nextTokenId == 1, "Cannot change random mint after tokens exist");
        if (random_) {
            _ensurePublicMintPool();
        }
        randomPublicMint = random_;
        emit RandomPublicMintUpdated(random_);
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

    function ownerMint(address to, string calldata uri) external onlyOwner returns (uint256) {
        return _mintWithURI(to, uri);
    }

    function mintableCount(address account) public view returns (uint256) {
        if (!isMintable || mintPrice == 0) return 0;

        uint256 remaining = maxSupply - (_nextTokenId - 1);
        if (remaining == 0) return 0;

        if (maxMintPerWallet == 0) return remaining;

        uint256 owned = balanceOf(account);
        if (owned >= maxMintPerWallet) return 0;
        uint256 walletRemaining = maxMintPerWallet - owned;
        return walletRemaining < remaining ? walletRemaining : remaining;
    }

    function _isPlatformFeeExempt(address account) internal view returns (bool) {
        if (platformMintFeeBps == 0 || platformTreasury == address(0)) return true;
        if (
            electroGemsCollection != address(0) &&
            IERC721Balance(electroGemsCollection).balanceOf(account) > 0
        ) {
            return true;
        }
        if (
            clubWatchCollection != address(0) &&
            IERC721Balance(clubWatchCollection).balanceOf(account) > 0
        ) {
            return true;
        }
        return false;
    }

    /// @notice Total ETN required to mint, including any launchpad platform fee for non-exempt wallets.
    function requiredMintPayment(address minter, uint256 mintCount) public view returns (uint256) {
        if (!isMintable || mintPrice == 0 || mintCount == 0) return 0;
        uint256 base = mintPrice * mintCount;
        if (_isPlatformFeeExempt(minter)) return base;
        return base + (base * uint256(platformMintFeeBps)) / 10_000;
    }

    /// @inheritdoc IMintable
    /// @dev Accepts exact or overpayment (e.g. marketplace fee bundled into msg.value). Excess ETN is
    /// refunded to msg.sender so hosts can retain their fee when they forward the full checkout amount.
    function mint(uint256 mintCount) external payable nonReentrant {
        require(isMintable, "Sale not active");
        require(mintCount > 0, "Quantity zero");
        require(bytes(_baseTokenURI).length > 0, "Base URI required");
        require(mintCount <= mintableCount(msg.sender), "Exceeds mintable count");

        uint256 base = mintPrice * mintCount;
        uint256 required = requiredMintPayment(msg.sender, mintCount);
        require(msg.value >= required, "Insufficient payment");
        uint256 platformFee = required - base;

        uint256 firstTokenId = _nextTokenId;
        for (uint256 i = 0; i < mintCount; i++) {
            if (randomPublicMint) {
                _mintWithRandomMetadata(msg.sender);
            } else {
                _mintWithComposedURI(msg.sender);
            }
        }
        if (firstTokenId < _nextTokenId) {
            emit BatchMetadataUpdate(firstTokenId, _nextTokenId - 1);
        }

        if (burnConfig.burnOnMint && burnConfig.mintBurnBps > 0) {
            uint256 burnEtn = (base * uint256(burnConfig.mintBurnBps)) / 10_000;
            _swapEtnForClubBurn(burnEtn);
        }

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

    function batchMint(address[] calldata recipients, string[] calldata uris) external onlyOwner returns (uint256[] memory) {
        require(recipients.length == uris.length, "Length mismatch");
        uint256[] memory tokenIds = new uint256[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            tokenIds[i] = _mintWithURI(recipients[i], uris[i]);
        }
        return tokenIds;
    }

    function _mintWithComposedURI(address to) internal returns (uint256) {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _composeMetadataSuffix(tokenId));
        return tokenId;
    }

    function _mintWithRandomMetadata(address to) internal returns (uint256 tokenId) {
        _ensurePublicMintPool();
        require(_nextTokenId <= maxSupply, "Max supply reached");
        require(_availableMetadataIds.length > 0, "No metadata remaining");

        tokenId = _nextTokenId++;
        uint256 metadataIndex = _drawRandomMetadataIndex();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _composeMetadataSuffix(metadataIndex));
        emit PublicMintAssigned(tokenId, metadataIndex);
    }

    function _composeMetadataSuffix(uint256 metadataIndex) internal pure returns (string memory) {
        return string(abi.encodePacked(Strings.toString(metadataIndex), ".json"));
    }

    function _ensurePublicMintPool() private {
        if (_publicMintPoolReady) return;
        for (uint256 i = 1; i <= maxSupply; i++) {
            if (!_metadataIndexUsed[i]) {
                _availableMetadataIds.push(i);
            }
        }
        _publicMintPoolReady = true;
    }

    function _drawRandomMetadataIndex() private returns (uint256 metadataIndex) {
        uint256 len = _availableMetadataIds.length;
        require(len > 0, "No metadata remaining");

        uint256 slot = uint256(
            keccak256(
                abi.encodePacked(
                    block.prevrandao,
                    block.timestamp,
                    block.number,
                    msg.sender,
                    _nextTokenId,
                    len,
                    gasleft()
                )
            )
        ) % len;

        metadataIndex = _availableMetadataIds[slot];
        _availableMetadataIds[slot] = _availableMetadataIds[len - 1];
        _availableMetadataIds.pop();
        _metadataIndexUsed[metadataIndex] = true;
    }

    function _markMetadataIndexUsed(uint256 metadataIndex) internal {
        require(metadataIndex > 0 && metadataIndex <= maxSupply, "Invalid metadata index");
        if (_metadataIndexUsed[metadataIndex]) return;
        _metadataIndexUsed[metadataIndex] = true;
        if (_publicMintPoolReady) {
            _removeFromAvailablePool(metadataIndex);
        }
    }

    function _removeFromAvailablePool(uint256 metadataIndex) private {
        uint256 len = _availableMetadataIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (_availableMetadataIds[i] == metadataIndex) {
                _availableMetadataIds[i] = _availableMetadataIds[len - 1];
                _availableMetadataIds.pop();
                return;
            }
        }
    }

    function _tryMarkMetadataFromUriSuffix(string calldata uri) internal {
        if (!_isNumericJsonSuffix(uri)) return;
        uint256 metadataIndex = _metadataIndexFromUriSuffix(uri);
        if (metadataIndex > 0 && metadataIndex <= maxSupply) {
            _markMetadataIndexUsed(metadataIndex);
        }
    }

    function _isNumericJsonSuffix(string memory uri) private pure returns (bool) {
        if (!_endsWithJsonSuffix(uri)) return false;
        bytes memory uriBytes = bytes(uri);
        uint256 end = uriBytes.length - 5;
        if (end == 0) return false;
        for (uint256 i = 0; i < end; i++) {
            uint8 charCode = uint8(uriBytes[i]);
            if (charCode < 48 || charCode > 57) return false;
        }
        return true;
    }

    function _endsWithJsonSuffix(string memory uri) private pure returns (bool) {
        bytes memory uriBytes = bytes(uri);
        if (uriBytes.length < 6) return false;
        return
            uriBytes[uriBytes.length - 5] == "." &&
            uriBytes[uriBytes.length - 4] == "j" &&
            uriBytes[uriBytes.length - 3] == "s" &&
            uriBytes[uriBytes.length - 2] == "o" &&
            uriBytes[uriBytes.length - 1] == "n";
    }

    function _metadataIndexFromUriSuffix(string memory uri) private pure returns (uint256) {
        bytes memory uriBytes = bytes(uri);
        uint256 end = uriBytes.length - 5;
        require(end > 0, "Invalid metadata suffix");

        uint256 value = 0;
        for (uint256 i = 0; i < end; i++) {
            uint8 charCode = uint8(uriBytes[i]);
            require(charCode >= 48 && charCode <= 57, "Invalid metadata suffix");
            value = value * 10 + (charCode - 48);
        }
        require(value > 0, "Invalid metadata suffix");
        return value;
    }

    /// @notice IERC721 metadata for minted tokens. Unminted preview URIs support sequential mint and
    /// a shared mystery preview for random public mint (ElectroSwap / IMintable marketplaces).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) != address(0)) {
            return _resolveMintedTokenURI(tokenId);
        }

        if (
            isMintable &&
            mintPrice > 0 &&
            bytes(_baseTokenURI).length > 0 &&
            tokenId > 0 &&
            tokenId <= maxSupply
        ) {
            if (randomPublicMint) {
                return string(abi.encodePacked(_baseTokenURI, "1.json"));
            }
            return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId), ".json"));
        }

        revert ERC721NonexistentToken(tokenId);
    }

    /// @dev ERC721URIStorage concatenates baseURI + stored suffix. If a full URL was stored by mistake,
    /// return the absolute URI instead of base + absolute (which breaks wallets/explorers).
    function _resolveMintedTokenURI(uint256 tokenId) internal view returns (string memory) {
        string memory uri = super.tokenURI(tokenId);
        string memory base = _baseURI();
        if (bytes(base).length == 0) {
            return uri;
        }

        bytes memory uriBytes = bytes(uri);
        bytes memory baseBytes = bytes(base);
        if (uriBytes.length > baseBytes.length) {
            bool matchesBase = true;
            for (uint256 i = 0; i < baseBytes.length; i++) {
                if (uriBytes[i] != baseBytes[i]) {
                    matchesBase = false;
                    break;
                }
            }
            if (matchesBase) {
                string memory remainder = _slice(uri, baseBytes.length, uriBytes.length - baseBytes.length);
                if (_isAbsoluteUri(remainder)) {
                    return remainder;
                }
            }
        }

        return uri;
    }

    function _isAbsoluteUri(string memory uri) private pure returns (bool) {
        bytes memory b = bytes(uri);
        if (b.length < 4) return false;
        for (uint256 i = 0; i + 2 < b.length; i++) {
            if (b[i] == ":" && b[i + 1] == "/" && b[i + 2] == "/") {
                return true;
            }
        }
        return false;
    }

    function _slice(string memory data, uint256 start, uint256 length) private pure returns (string memory) {
        bytes memory dataBytes = bytes(data);
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = dataBytes[start + i];
        }
        return string(result);
    }

    function _mintWithURI(address to, string calldata uri) internal returns (uint256) {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        _tryMarkMetadataFromUriSuffix(uri);
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
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

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /// @notice ElectroSwap EsMinterV2 / marketplace UI compatibility (Club Watches ABI shape).
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

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
