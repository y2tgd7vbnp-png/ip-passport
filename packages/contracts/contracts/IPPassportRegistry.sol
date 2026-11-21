// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPPassportRegistry
 * @notice IP Passport 链上注册表：作品注册、版本链锚定、带时间版本的许可状态、衍生关系、上架前检查记录。
 * @dev Monad 并行执行友好（需求 4.4）：
 *      - 所有状态按 workId 隔离存储；热路径（anchorVersion/anchorBatch/recordListingCheck）不写任何全局共享变量
 *      - 无全局计数器、无全局数组 push；统计一律走事件由链下汇总
 *      - 唯一允许的共享写结构是 repoKey → workId[] 映射，且只在 registerWork 写
 */
contract IPPassportRegistry {
    // ---------- 类型 ----------

    enum VersionKind { PROMPT, DRAFT, COMMIT, RELEASE, BATCH }
    enum CommercialPolicy { UNSPECIFIED, PERMISSIVE, WEAK_COPYLEFT, STRONG_COPYLEFT, NETWORK_COPYLEFT, NONCOMMERCIAL, SOURCE_AVAILABLE, PROPRIETARY }

    struct Work {
        address owner;
        bytes32 metaHash;
        bytes32 repoKey;       // keccak256(小写 "github.com/<owner>/<repo>")，可为 0
        bytes32 headVersion;   // 最新锚定的 versionRoot（链式保证）
        uint64 createdAt;
    }

    struct Version {
        bytes32 workId;
        bytes32 prevRoot;
        uint64 timestamp;
        uint64 blockNumber;
        VersionKind kind;
    }

    struct Batch {
        bytes32 workId;
        bytes32 lastVersionRoot;
        uint32 count;
        uint64 timestamp;
        uint64 blockNumber;
    }

    struct License {
        string spdx;
        bytes32 termsHash;
        CommercialPolicy policy;
        string contactURI;
        bytes32 effectiveFromVersion;
        uint64 effectiveFrom;
    }

    struct Derivation {
        bytes32 parentWorkId;
        bytes32 parentVersionRoot;
        uint64 declaredAt;
    }

    struct ListingCheck {
        bytes32 subjectId;
        bytes32 sourceWorkId;
        bytes32 resultHash;
        bool acknowledged;
        uint64 checkedAt;
    }

    // ---------- 存储（全部按 id 隔离，无全局写） ----------

    mapping(bytes32 => Work) private _works;
    mapping(bytes32 => Version) private _versions;        // versionRoot => Version
    mapping(bytes32 => Batch) private _batches;           // batchRoot => Batch
    mapping(bytes32 => License[]) private _licenseHistory; // workId => 逐条追加
    mapping(bytes32 => Derivation[]) private _parents;    // childWorkId => parents
    mapping(bytes32 => ListingCheck[]) private _listingChecks; // subjectId => checks
    mapping(bytes32 => bytes32[]) private _repoWorks;     // repoKey => workId[]（仅 registerWork 写）

    // ---------- 事件（统计口径：全部由链下按事件汇总） ----------

    event WorkRegistered(bytes32 indexed workId, address indexed owner, bytes32 metaHash, bytes32 repoKey);
    event VersionAnchored(bytes32 indexed workId, bytes32 indexed versionRoot, bytes32 prevRoot, VersionKind kind);
    event BatchAnchored(bytes32 indexed workId, bytes32 indexed batchRoot, bytes32 lastVersionRoot, uint32 count);
    event LicenseSet(bytes32 indexed workId, string spdx, bytes32 termsHash, CommercialPolicy policy, string contactURI, bytes32 effectiveFromVersion, uint64 effectiveFrom);
    event DerivativeDeclared(bytes32 indexed childWorkId, bytes32 indexed parentWorkId, bytes32 parentVersionRoot);
    event ListingChecked(bytes32 indexed subjectId, bytes32 indexed sourceWorkId, bytes32 resultHash, bool acknowledged);
    event WorkTransferred(bytes32 indexed workId, address indexed from, address indexed to);

    // ---------- 自定义错误 ----------

    error NotOwner();
    error UnknownWork();
    error BadPrevRoot();
    error AlreadyAnchored();
    error BadSalt();
    error UnknownParentWork();

    // ---------- 写函数 ----------

    /**
     * @notice 注册作品。workId = keccak256(owner ‖ salt)，salt 防抢注（同一地址可多作品）。
     */
    function registerWork(bytes32 salt, bytes32 metaHash, bytes32 repoKey) external returns (bytes32 workId) {
        if (salt == bytes32(0)) revert BadSalt();
        workId = keccak256(abi.encodePacked(msg.sender, salt));
        if (_works[workId].owner != address(0)) revert AlreadyAnchored(); // workId 冲突（概率忽略不计）
        _works[workId] = Work({
            owner: msg.sender,
            metaHash: metaHash,
            repoKey: repoKey,
            headVersion: bytes32(0),
            createdAt: uint64(block.timestamp)
        });
        if (repoKey != bytes32(0)) {
            _repoWorks[repoKey].push(workId); // 唯一允许的共享写，仅此处
        }
        emit WorkRegistered(workId, msg.sender, metaHash, repoKey);
    }

    /**
     * @notice 锚定单个版本。prevRoot 必须等于当前 headVersion（首版为 0），保证链式顺序。
     */
    function anchorVersion(bytes32 workId, bytes32 versionRoot, bytes32 prevRoot, VersionKind kind) external {
        Work storage w = _works[workId];
        if (w.owner == address(0)) revert UnknownWork();
        if (w.owner != msg.sender) revert NotOwner();
        if (prevRoot != w.headVersion) revert BadPrevRoot();
        if (_versions[versionRoot].workId != bytes32(0)) revert AlreadyAnchored();

        _versions[versionRoot] = Version({
            workId: workId,
            prevRoot: prevRoot,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number),
            kind: kind
        });
        w.headVersion = versionRoot; // 仅写本作品的存储槽
        emit VersionAnchored(workId, versionRoot, prevRoot, kind);
    }

    /**
     * @notice 批量锚定：batchRoot 为批内各 versionRoot 按同一 Merkle 规则的根。
     *         批内链式关系由链下证据验证；链上只推进 headVersion 到 lastVersionRoot。
     */
    function anchorBatch(bytes32 workId, bytes32 batchRoot, bytes32 lastVersionRoot, uint32 count) external {
        Work storage w = _works[workId];
        if (w.owner == address(0)) revert UnknownWork();
        if (w.owner != msg.sender) revert NotOwner();
        if (_batches[batchRoot].workId != bytes32(0)) revert AlreadyAnchored();
        if (count == 0) revert BadPrevRoot();

        _batches[batchRoot] = Batch({
            workId: workId,
            lastVersionRoot: lastVersionRoot,
            count: count,
            timestamp: uint64(block.timestamp),
            blockNumber: uint64(block.number)
        });
        w.headVersion = lastVersionRoot;
        emit BatchAnchored(workId, batchRoot, lastVersionRoot, count);
    }

    /**
     * @notice 设置许可。只追加不覆盖：形成带时间版本的许可历史。
     *         effectiveFromVersion = 当前 headVersion（许可变更与版本推进对齐）。
     */
    function setLicense(
        bytes32 workId,
        string calldata spdx,
        bytes32 termsHash,
        CommercialPolicy policy,
        string calldata contactURI
    ) external {
        Work storage w = _works[workId];
        if (w.owner == address(0)) revert UnknownWork();
        if (w.owner != msg.sender) revert NotOwner();
        _licenseHistory[workId].push(License({
            spdx: spdx,
            termsHash: termsHash,
            policy: policy,
            contactURI: contactURI,
            effectiveFromVersion: w.headVersion,
            effectiveFrom: uint64(block.timestamp)
        }));
        emit LicenseSet(workId, spdx, termsHash, policy, contactURI, w.headVersion, uint64(block.timestamp));
    }

    /**
     * @notice 声明衍生/依赖关系（child 的 owner 调用）。
     */
    function declareDerivative(bytes32 childWorkId, bytes32 parentWorkId, bytes32 parentVersionRoot) external {
        if (_works[childWorkId].owner != msg.sender) revert NotOwner();
        if (_works[parentWorkId].owner == address(0)) revert UnknownParentWork();
        _parents[childWorkId].push(Derivation({
            parentWorkId: parentWorkId,
            parentVersionRoot: parentVersionRoot,
            declaredAt: uint64(block.timestamp)
        }));
        emit DerivativeDeclared(childWorkId, parentWorkId, parentVersionRoot);
    }

    /**
     * @notice 上架前检查记录（任何地址可调用，平台用）。按 subjectId 隔离存储。
     */
    function recordListingCheck(bytes32 subjectId, bytes32 sourceWorkId, bytes32 resultHash, bool acknowledged) external {
        _listingChecks[subjectId].push(ListingCheck({
            subjectId: subjectId,
            sourceWorkId: sourceWorkId,
            resultHash: resultHash,
            acknowledged: acknowledged,
            checkedAt: uint64(block.timestamp)
        }));
        emit ListingChecked(subjectId, sourceWorkId, resultHash, acknowledged);
    }

    function transferWork(bytes32 workId, address newOwner) external {
        Work storage w = _works[workId];
        if (w.owner == address(0)) revert UnknownWork();
        if (w.owner != msg.sender) revert NotOwner();
        address from = w.owner;
        w.owner = newOwner;
        emit WorkTransferred(workId, from, newOwner);
    }

    // ---------- 读函数 ----------

    function getWork(bytes32 workId) external view returns (Work memory) {
        return _works[workId];
    }

    function getVersion(bytes32 versionRoot) external view returns (Version memory) {
        return _versions[versionRoot];
    }

    function getBatch(bytes32 batchRoot) external view returns (Batch memory) {
        return _batches[batchRoot];
    }

    /**
     * @notice 核心可组合接口：返回 timestamp 时点生效的许可（追加式历史中 effectiveFrom <= timestamp 的最后一条）。
     *         早于首个许可 → policy = UNSPECIFIED。
     */
    function getLicenseAt(bytes32 workId, uint64 timestamp) external view returns (License memory) {
        License[] storage hist = _licenseHistory[workId];
        if (hist.length == 0) {
            return License({ spdx: "", termsHash: bytes32(0), policy: CommercialPolicy.UNSPECIFIED, contactURI: "", effectiveFromVersion: bytes32(0), effectiveFrom: 0 });
        }
        License memory current = hist[0];
        bool found = false;
        for (uint256 i = 0; i < hist.length; i++) {
            if (hist[i].effectiveFrom <= timestamp) {
                current = hist[i];
                found = true;
            } else {
                break; // 追加序即时间序
            }
        }
        if (!found) {
            return License({ spdx: "", termsHash: bytes32(0), policy: CommercialPolicy.UNSPECIFIED, contactURI: "", effectiveFromVersion: bytes32(0), effectiveFrom: 0 });
        }
        return current;
    }

    function getLicenseHistory(bytes32 workId) external view returns (License[] memory) {
        return _licenseHistory[workId];
    }

    function getParents(bytes32 workId) external view returns (Derivation[] memory) {
        return _parents[workId];
    }

    function getWorksByRepo(bytes32 repoKey) external view returns (bytes32[] memory) {
        return _repoWorks[repoKey];
    }

    function getListingChecks(bytes32 subjectId) external view returns (ListingCheck[] memory) {
        return _listingChecks[subjectId];
    }
}
